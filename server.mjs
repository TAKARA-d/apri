import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT || 8000);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
};

const NEWS_URLS = [
  'https://news.google.com/rss/search?q=NASDAQ100+%E5%85%88%E7%89%A9+when:7d&hl=ja&gl=JP&ceid=JP:ja',
  'https://news.google.com/rss/search?q=%E7%B1%B3%E5%9B%BD%E6%A0%AA+FOMC+when:7d&hl=ja&gl=JP&ceid=JP:ja',
  'https://www3.nhk.or.jp/rss/news/cat5.xml',
];

const MEMORY_PATH = 'data/model_memory.json';

function sendJson(res, code, body) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function readJson(path, fallback = null) {
  try {
    const raw = await readFile(join(ROOT, path), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJson(path, value) {
  await writeFile(join(ROOT, path), JSON.stringify(value, null, 2), 'utf-8');
}

function parseRssItems(xml) {
  const items = [];
  const pick = (block, tag) => {
    const m = block.match(new RegExp(`<${tag}(?: [^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'));
    return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
  };

  for (const b of [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1])) {
    const title = pick(b, 'title');
    const link = pick(b, 'link');
    const pubDate = pick(b, 'pubDate') || pick(b, 'dc:date');
    if (title) items.push({ title, link, pubDate });
  }

  for (const b of [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => m[1])) {
    const title = pick(b, 'title');
    const linkMatch = b.match(/<link[^>]*href="([^"]+)"[^>]*>/i);
    const link = linkMatch ? linkMatch[1] : '';
    const pubDate = pick(b, 'updated') || pick(b, 'published');
    if (title) items.push({ title, link, pubDate });
  }
  return items;
}

async function fetchJapaneseNews() {
  const out = [];
  for (const url of NEWS_URLS) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 NasdaqApp/2.4' } });
      if (!r.ok) continue;
      out.push(...parseRssItems(await r.text()));
    } catch {}
  }
  const uniq = new Map();
  for (const n of out) {
    const key = `${n.title}::${n.link}`;
    if (!uniq.has(key)) uniq.set(key, n);
  }
  return [...uniq.values()].sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0)).slice(0, 40);
}

function parseCsv(csv) {
  return csv.trim().split(/\r?\n/).slice(1).map((line) => {
    const [date, open, high, low, close, volume] = line.split(',');
    return { date, open: Number(open), high: Number(high), low: Number(low), close: Number(close), volume: Number(volume) };
  }).filter((r) => Number.isFinite(r.close));
}

async function fetchFuturesLikeRows() {
  for (const url of ['https://stooq.com/q/d/l/?s=nq.f&i=d', 'https://stooq.com/q/d/l/?s=ndx&i=d']) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 NasdaqApp/2.4' } });
      if (!r.ok) continue;
      const rows = parseCsv(await r.text());
      if (rows.length) return rows.slice(-320);
    } catch {}
  }
  return [];
}



async function fetchGoogleFinanceRealtimeQuote() {
  const url = 'https://www.google.com/finance/quote/NQW00:CME_EMINIS?hl=ja';
  const r = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 NasdaqApp/2.4',
      'accept-language': 'ja,en-US;q=0.9,en;q=0.8',
    },
  });
  if (!r.ok) throw new Error(`google finance ${r.status}`);
  const html = await r.text();

  const priceMatch = html.match(/class="YMlKec fxKbKc">\s*([\$¥€£]?[-+]?\d[\d,]*(?:\.\d+)?)\s*</i)
    || html.match(/"price"\s*:\s*"?([0-9][0-9,]*(?:\.\d+)?)"?/i);
  if (!priceMatch) throw new Error('google price missing');

  const normalizeNum = (raw) => Number(String(raw).replace(/[^0-9.+-]/g, ''));
  const price = normalizeNum(priceMatch[1]);
  if (!Number.isFinite(price)) throw new Error('google price invalid');

  const changeMatch = html.match(/class="P2Luy[^"]*">\s*([+-]?[\$¥€£]?\d[\d,]*(?:\.\d+)?)\s*</i);
  const changePctMatch = html.match(/class="JwB6zf[^"]*">\s*([+-]?\d[\d,]*(?:\.\d+)?)%\s*</i);
  const marketTimeMatch = html.match(/(\d{1,2}:\d{2}:\d{2})\s*UTC/i);

  return {
    symbol: 'NQW00:CME_EMINIS',
    name: 'E-mini NASDAQ 100 継続契約 (Google Finance)',
    price,
    change: changeMatch ? normalizeNum(changeMatch[1]) : 0,
    changePercent: changePctMatch ? normalizeNum(changePctMatch[1]) : 0,
    marketTime: marketTimeMatch ? `${marketTimeMatch[1]} UTC` : new Date().toISOString(),
    source: 'live_google_finance',
  };
}
async function fetchStooqRealtimeQuote() {
  const url = 'https://stooq.com/q/l/?s=nq.f&i=1';
  const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 NasdaqApp/2.4' } });
  if (!r.ok) throw new Error(`stooq quote ${r.status}`);
  const text = await r.text();
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error('stooq rows missing');
  const cols = lines[1].split(',').map((x) => x.replaceAll('"', '').trim());
  const close = Number(cols[6]);
  const open = Number(cols[3]);
  if (!Number.isFinite(close)) throw new Error('stooq close missing');
  const change = Number.isFinite(open) ? close - open : 0;
  const changePercent = Number.isFinite(open) && open ? (change / open) * 100 : 0;
  return {
    symbol: cols[0] || 'NQ.F',
    name: 'NASDAQ100 Futures (Stooq)',
    price: close,
    change,
    changePercent,
    marketTime: `${cols[1] || ''}T${cols[2] || '00:00:00'}Z`,
    source: 'live_stooq',
  };
}

async function fetchRealtimeQuote(fallbackRows = []) {
  try { return await fetchGoogleFinanceRealtimeQuote(); } catch {}
  try { return await fetchStooqRealtimeQuote(); } catch {}
  const last = fallbackRows.at(-1);
  const prev = fallbackRows.at(-2) || last;
  if (last) {
    const change = last.close - prev.close;
    return {
      symbol: 'NQW00連動(フォールバック)',
      name: 'NASDAQ100 Futures fallback',
      price: Number(last.close),
      change,
      changePercent: prev.close ? (change / prev.close) * 100 : 0,
      marketTime: `${last.date}T00:00:00Z`,
      source: 'fallback',
    };
  }
  return { symbol: 'NQ先物', name: 'NASDAQ100 Futures', price: 0, change: 0, changePercent: 0, marketTime: new Date().toISOString(), source: 'unavailable' };
}

async function serveStatic(req, res) {
  const urlPath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const safePath = normalize(urlPath).replace(/^\.\.(\/|\\|$)+/, '');
  const path = join(ROOT, safePath);
  try {
    const data = await readFile(path);
    const ext = extname(path);
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = '';
    req.on('data', (c) => { b += c; });
    req.on('end', () => resolve(b));
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  try {
    if (req.url.startsWith('/api/news')) {
      const live = await fetchJapaneseNews();
      if (live.length) return sendJson(res, 200, { source: 'live', fetchedAt: new Date().toISOString(), news: live });
      const fallback = await readJson('data/news_fallback_ja.json', []);
      return sendJson(res, 200, { source: 'fallback', fetchedAt: new Date().toISOString(), news: fallback });
    }

    if (req.url.startsWith('/api/quote')) {
      const fallbackRows = await readJson('data/ndx_fallback.json', []);
      const quote = await fetchRealtimeQuote(fallbackRows);
      return sendJson(res, 200, { fetchedAt: new Date().toISOString(), quote });
    }

    if (req.url.startsWith('/api/market')) {
      const liveRows = await fetchFuturesLikeRows();
      if (liveRows.length) return sendJson(res, 200, { source: 'live', symbol: 'NQW00連動(近似)', rows: liveRows });
      const fallback = await readJson('data/ndx_fallback.json', []);
      return sendJson(res, 200, { source: 'fallback', symbol: 'NQW00連動(フォールバック)', rows: fallback });
    }

    if (req.method === 'GET' && req.url.startsWith('/api/memory')) {
      const memory = await readJson(MEMORY_PATH, { records: [] });
      return sendJson(res, 200, memory);
    }

    if (req.method === 'POST' && req.url.startsWith('/api/memory')) {
      const body = JSON.parse(await readBody(req) || '{}');
      const memory = await readJson(MEMORY_PATH, { records: [] });
      const rec = {
        date: body.date || new Date().toISOString().slice(0, 10),
        predicted: Number(body.predicted || 0),
        actual: Number(body.actual || 0),
        createdAt: new Date().toISOString(),
      };
      if (Number.isFinite(rec.predicted) && Number.isFinite(rec.actual)) {
        memory.records.push(rec);
        memory.records = memory.records.slice(-1000);
        await writeJson(MEMORY_PATH, memory);
      }
      return sendJson(res, 200, { ok: true, count: memory.records.length });
    }

    return serveStatic(req, res);
  } catch (err) {
    return sendJson(res, 500, { error: err.message || 'internal error' });
  }
});

server.listen(PORT, () => {
  console.log(`Nasdaq app running on http://localhost:${PORT}`);
});
