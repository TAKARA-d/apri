import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
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

const JP_NEWS_SOURCES = [
  'https://www3.nhk.or.jp/rss/news/cat5.xml',
  'https://www3.nhk.or.jp/rss/news/cat6.xml',
  'https://news.google.com/rss/search?q=NASDAQ100+OR+%E7%B1%B3%E5%9B%BD%E6%A0%AA+OR+%E3%83%8A%E3%82%B9%E3%83%80%E3%83%83%E3%82%AF&hl=ja&gl=JP&ceid=JP:ja',
];

function sendJson(res, code, body) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function readJson(path) {
  const raw = await readFile(join(ROOT, path), 'utf-8');
  return JSON.parse(raw);
}

function parseRssItems(xml) {
  const items = [];

  const extract = (block, tag) => {
    const m = block.match(new RegExp(`<${tag}(?: [^>]*)?>([\s\S]*?)<\/${tag}>`, 'i'));
    return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
  };

  const itemBlocks = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
  for (const b of itemBlocks) {
    const title = extract(b, 'title');
    const link = extract(b, 'link');
    const pubDate = extract(b, 'pubDate') || extract(b, 'dc:date');
    if (title) items.push({ title, link, pubDate });
  }

  const entryBlocks = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => m[1]);
  for (const b of entryBlocks) {
    const title = extract(b, 'title');
    let link = '';
    const attr = b.match(/<link[^>]*href="([^"]+)"[^>]*>/i);
    if (attr) link = attr[1];
    const pubDate = extract(b, 'updated') || extract(b, 'published');
    if (title) items.push({ title, link, pubDate });
  }

  return items;
}

async function fetchJapaneseNews() {
  const collected = [];
  for (const url of JP_NEWS_SOURCES) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 NasdaqLab/1.0' } });
      if (!r.ok) continue;
      const xml = await r.text();
      const items = parseRssItems(xml).map((x) => ({ ...x, source: url }));
      collected.push(...items);
    } catch {
      // ignore source failure and continue with others
    }
  }

  const uniq = new Map();
  for (const n of collected) {
    const key = `${n.title}::${n.link}`;
    if (!uniq.has(key)) uniq.set(key, n);
  }

  return [...uniq.values()]
    .sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0))
    .slice(0, 40);
}

function parseCsv(csv) {
  const lines = csv.trim().split(/\r?\n/);
  const rows = lines.slice(1).map((line) => {
    const [date, open, high, low, close, volume] = line.split(',');
    return {
      date,
      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: Number(close),
      volume: Number(volume),
    };
  }).filter((r) => Number.isFinite(r.close));
  return rows;
}

async function fetchNasdaq100History() {
  const url = 'https://stooq.com/q/d/l/?s=ndx&i=d';
  const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 NasdaqLab/1.0' } });
  if (!r.ok) throw new Error(`market fetch failed: ${r.status}`);
  const csv = await r.text();
  const rows = parseCsv(csv);
  return rows.slice(-320);
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

const server = createServer(async (req, res) => {
  try {
    if (req.url.startsWith('/api/news')) {
      try {
        const news = await fetchJapaneseNews();
        if (news.length) {
          return sendJson(res, 200, { fetchedAt: new Date().toISOString(), source: 'live', news });
        }
      } catch {}
      const fallback = await readJson('data/news_fallback_ja.json');
      return sendJson(res, 200, { fetchedAt: new Date().toISOString(), source: 'fallback', news: fallback });
    }
    if (req.url.startsWith('/api/market')) {
      try {
        const rows = await fetchNasdaq100History();
        if (rows.length) {
          return sendJson(res, 200, { fetchedAt: new Date().toISOString(), source: 'live', rows });
        }
      } catch {}
      const fallback = await readJson('data/ndx_fallback.json');
      return sendJson(res, 200, { fetchedAt: new Date().toISOString(), source: 'fallback', rows: fallback });
    }
    return serveStatic(req, res);
  } catch (err) {
    return sendJson(res, 500, { error: err.message || 'internal error' });
  }
});

server.listen(PORT, () => {
  console.log(`Nasdaq app running on http://localhost:${PORT}`);
});
