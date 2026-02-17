import React, { useEffect, useMemo, useState } from 'https://esm.sh/react@18.2.0';
import { createRoot } from 'https://esm.sh/react-dom@18.2.0/client';
import { analyzeMarket } from './engine.js';

const h = React.createElement;

function 数値(v, d = 2) {
  return Number(v).toLocaleString('ja-JP', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function クオート時刻表示(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) return d.toLocaleString('ja-JP');
  return String(value);
}

function 軸付きライン({ data, labels, yLabel }) {
  if (!data.length) return h('div', { className: 'empty' }, 'データなし');
  const w = 960; const hgt = 260; const pad = { l: 70, r: 20, t: 20, b: 45 };
  const innerW = w - pad.l - pad.r; const innerH = hgt - pad.t - pad.b;
  const min = Math.min(...data); const max = Math.max(...data); const range = Math.max(1e-6, max - min);
  const p = data.map((v, i) => `${pad.l + (i / Math.max(1, data.length - 1)) * innerW},${pad.t + (1 - (v - min) / range) * innerH}`).join(' ');
  const yTicks = Array.from({ length: 5 }, (_, i) => min + ((4 - i) / 4) * range);
  const xTicks = [0, Math.floor((data.length - 1) / 2), data.length - 1];
  return h('svg', { viewBox: `0 0 ${w} ${hgt}`, className: 'chart' },
    h('rect', { x: 0, y: 0, width: w, height: hgt, fill: '#0a1122' }),
    ...yTicks.map((t, i) => {
      const y = pad.t + (i / 4) * innerH;
      return h(React.Fragment, { key: i },
        h('line', { x1: pad.l, x2: w - pad.r, y1: y, y2: y, stroke: '#253a62', strokeDasharray: '4 4' }),
        h('text', { x: 6, y: y + 4, fill: '#9fb3d9', fontSize: 11 }, `${Math.round(t).toLocaleString('ja-JP')}`),
      );
    }),
    ...xTicks.map((idx, i) => {
      const x = pad.l + (idx / Math.max(1, data.length - 1)) * innerW;
      return h(React.Fragment, { key: `x-${i}` },
        h('line', { x1: x, x2: x, y1: pad.t, y2: hgt - pad.b, stroke: '#1f2f50' }),
        h('text', { x: x - 24, y: hgt - 14, fill: '#9fb3d9', fontSize: 11 }, labels[idx] || ''),
      );
    }),
    h('line', { x1: pad.l, x2: pad.l, y1: pad.t, y2: hgt - pad.b, stroke: '#7aa2e3', strokeWidth: 1.5 }),
    h('line', { x1: pad.l, x2: w - pad.r, y1: hgt - pad.b, y2: hgt - pad.b, stroke: '#7aa2e3', strokeWidth: 1.5 }),
    h('polyline', { points: p, fill: 'none', stroke: '#60a5fa', strokeWidth: 2.8 }),
    h('text', { x: 8, y: 14, fill: '#bfdbfe', fontSize: 11 }, `Y軸: ${yLabel}`),
    h('text', { x: w - 120, y: hgt - 8, fill: '#bfdbfe', fontSize: 11 }, 'X軸: 日付'),
  );
}

function App() {
  const [market, setMarket] = useState([]);
  const [news, setNews] = useState([]);
  const [memory, setMemory] = useState({ records: [] });
  const [quote, setQuote] = useState(null);
  const [meta, setMeta] = useState({ symbol: '-', marketSource: '-', newsSource: '-', updated: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [chartRange, setChartRange] = useState('6m');

  const loadCore = async () => {
    const [m, n, mem] = await Promise.all([
      fetch('/api/market').then((r) => r.json()),
      fetch('/api/news').then((r) => r.json()),
      fetch('/api/memory').then((r) => r.json()),
    ]);
    setMarket(m.rows || []);
    setNews(n.news || []);
    setMemory(mem || { records: [] });
    setMeta({ symbol: m.symbol || 'NQW00先物', marketSource: m.source || '-', newsSource: n.source || '-', updated: new Date().toLocaleString('ja-JP') });
  };

  const loadQuote = async () => {
    try {
      const q = await fetch('/api/quote').then((r) => r.json());
      setQuote(q.quote || null);
    } catch {}
  };

  const load = async () => {
    setLoading(true); setError('');
    try { await loadCore(); await loadQuote(); }
    catch (e) { setError(e.message || '取得に失敗しました'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    const t1 = setInterval(loadCore, 1000 * 60 * 15);
    const t2 = setInterval(loadQuote, 1000 * 10);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, []);

  const 解析用市場 = useMemo(() => {
    if (!market.length) return [];
    if (!quote?.price || !Number.isFinite(Number(quote.price))) return market;
    const copy = market.map((x) => ({ ...x }));
    const lastIdx = copy.length - 1;
    copy[lastIdx].close = Number(quote.price);
    copy[lastIdx].high = Math.max(copy[lastIdx].high, Number(quote.price));
    copy[lastIdx].low = Math.min(copy[lastIdx].low, Number(quote.price));
    return copy;
  }, [market, quote]);

  const result = useMemo(() => (解析用市場.length ? analyzeMarket(解析用市場, news, memory) : null), [解析用市場, news, memory]);

  const 最新実績を登録 = async () => {
    if (!result || !解析用市場.length) return;
    await fetch('/api/memory', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        date: 解析用市場[解析用市場.length - 1].date,
        predicted: result.forecast.nextDayReturnPct,
        actual: result.returns[result.returns.length - 1],
      }),
    });
    await loadCore();
  };

  const 現在値 = quote?.price ?? result?.latest?.close ?? 0;
  const 変化pt = quote?.change ?? (result && 解析用市場.length > 1 ? result.latest.close - 解析用市場[解析用市場.length - 2].close : 0);
  const 変化pct = quote?.changePercent ?? result?.latest?.ret ?? 0;
  const 履歴終値 = market.length ? market[market.length - 1].close : null;
  const 乖離 = 履歴終値 != null ? Number(現在値) - Number(履歴終値) : 0;
  const 最新日付 = 解析用市場.length ? 解析用市場[解析用市場.length - 1].date : null;
  const 保存済み = 最新日付 ? (memory.records || []).some((r) => r.date === 最新日付) : false;

  const rangeLengthMap = { '5d': 5, '1m': 22, '3m': 66, '6m': 132, '1y': 252 };
  const rangeLen = rangeLengthMap[chartRange] || 132;
  const chartRows = 解析用市場.slice(-rangeLen);
  const chartCloses = result ? result.closes.slice(-rangeLen) : [];

  return h('div', { className: 'page' },
    h('header', { className: 'hero' },
      h('h1', null, 'NASDAQ100先物 リアルタイム監視・予測分析アプリ'),
      h('p', null, 'リアルタイム値(10秒更新)を分析系にも反映し、チャート・予測とのズレを最小化しています。'),
      h('div', { className: 'top-actions' },
        h('button', { onClick: load, disabled: loading }, loading ? '更新中...' : '最新データ更新'),
        h('button', { onClick: 最新実績を登録, disabled: !result || 保存済み, title: '予測値と実績値を蓄積し、次回予測の補正に使います（同日データは上書き）' }, 保存済み ? '本日は保存済み' : '予測検証データを保存'),
        h('span', { className: 'refreshed' }, `最終更新: ${meta.updated || '-'} / 市場:${meta.marketSource} / ニュース:${meta.newsSource} / クオート:${quote?.source || '-'}`),
      ),
      h('p', { className: 'hint' }, '※ 学習ボタンは「予測が当たったか」を保存して、将来の予測補正（バイアス補正）に使うためのものです。'),
      error ? h('p', { className: 'error' }, error) : null,
    ),

    !result ? h('section', { className: 'panel' }, '読み込み中...') : h(React.Fragment, null,
      h('section', { className: 'panel live' },
        h('h2', null, 'リアルタイム先物クオート'),
        h('div', { className: 'live-row' },
          h('div', null, h('label', null, '銘柄'), h('strong', null, quote?.symbol || meta.symbol)),
          h('div', null, h('label', null, '現在ポイント'), h('strong', null, `${数値(現在値, 2)} pt`)),
          h('div', null, h('label', null, '前日比(ポイント)'), h('strong', null, `${数値(変化pt, 2)} pt`)),
          h('div', null, h('label', null, '前日比(%)'), h('strong', null, `${数値(変化pct, 2)}%`)),
          h('div', null, h('label', null, '時刻'), h('strong', null, クオート時刻表示(quote?.marketTime))),
        ),
        h('p', { className: 'hint' }, `履歴終値との差: ${数値(乖離, 2)} pt（分析値はこのリアルタイム値を最終足へ反映済み）`),
      ),

      h('section', { className: 'panel' },
        h('h2', null, '先物ポイント推移チャート（Y軸: ポイント / X軸: 日付）'),
        h('div', { className: 'range-tabs' },
          ...[
            ['5d', '5日'],
            ['1m', '1か月'],
            ['3m', '3か月'],
            ['6m', '6か月'],
            ['1y', '1年'],
          ].map(([k, label]) => h('button', {
            key: k,
            className: `tab-btn ${chartRange === k ? 'active' : ''}`,
            onClick: () => setChartRange(k),
          }, label)),
        ),
        h(軸付きライン, { data: chartCloses, labels: chartRows.map((r) => r.date.slice(5)), yLabel: 'ポイント' }),
      ),

      h('section', { className: 'grid' },
        h('article', { className: 'panel' },
          h('h2', null, '予測と精度（リアルタイム反映後）'),
          h('div', { className: 'stats' },
            h('div', null, h('label', null, '翌営業日予測騰落率'), h('strong', null, `${数値(result.forecast.nextDayReturnPct, 3)}%`)),
            h('div', null, h('label', null, '翌営業日予測ポイント'), h('strong', null, `${数値(result.forecast.nextDayPrice, 2)} pt`)),
            h('div', null, h('label', null, '20営業日予測騰落率'), h('strong', null, `${数値(result.forecast.expected20DayMovePct, 2)}%`)),
            h('div', null, h('label', null, '20営業日予測ポイント'), h('strong', null, `${数値(result.forecast.expected20DayPrice, 2)} pt`)),
            h('div', null, h('label', null, '推定信頼度'), h('strong', null, `${数値(result.forecast.confidence, 1)} / 100`)),
            h('div', null, h('label', null, '蓄積学習件数'), h('strong', null, `${result.model.memory.count} 件`)),
          ),
        ),
        h('article', { className: 'panel' },
          h('h2', null, '日本語ニュース（直近）'),
          h('ul', { className: 'news' },
            ...result.scoredNews.slice(0, 12).map((n, i) => h('li', { key: `${n.link}-${i}` },
              h('a', { href: n.link, target: '_blank', rel: 'noreferrer' }, n.title),
              h('span', { className: `tone ${n.sentiment >= 0 ? 'pos' : 'neg'}` }, `感情: ${数値(n.sentiment, 2)}`),
              h('small', null, n.pubDate || ''),
            )),
          ),
        ),
      ),
    ),
  );
}

createRoot(document.getElementById('root')).render(h(App));
