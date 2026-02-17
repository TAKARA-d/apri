import React, { useEffect, useMemo, useState } from 'https://esm.sh/react@18.2.0';
import { createRoot } from 'https://esm.sh/react-dom@18.2.0/client';
import { analyzeMarket } from './engine.js';

const h = React.createElement;

function 数値(v, d = 2) {
  return Number(v).toLocaleString('ja-JP', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function 軸付きライン({ data, labels, yLabel }) {
  if (!data.length) return h('div', { className: 'empty' }, 'データなし');
  const w = 960;
  const hgt = 260;
  const pad = { l: 70, r: 20, t: 20, b: 45 };
  const innerW = w - pad.l - pad.r;
  const innerH = hgt - pad.t - pad.b;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = Math.max(1e-6, max - min);

  const p = data.map((v, i) => {
    const x = pad.l + (i / Math.max(1, data.length - 1)) * innerW;
    const y = pad.t + (1 - (v - min) / range) * innerH;
    return `${x},${y}`;
  }).join(' ');

  const yTicks = Array.from({ length: 5 }, (_, i) => min + ((4 - i) / 4) * range);
  const xTicks = [0, Math.floor((data.length - 1) / 2), data.length - 1];

  return h('svg', { viewBox: `0 0 ${w} ${hgt}`, className: 'chart' },
    h('rect', { x: 0, y: 0, width: w, height: hgt, fill: '#0a1122' }),
    ...yTicks.map((t, i) => {
      const y = pad.t + (i / 4) * innerH;
      return h(React.Fragment, { key: `y-${i}` },
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

function 軸付きバー({ data, labels }) {
  if (!data.length) return h('div', { className: 'empty' }, 'データなし');
  const w = 960;
  const hgt = 260;
  const pad = { l: 70, r: 20, t: 20, b: 45 };
  const innerW = w - pad.l - pad.r;
  const innerH = hgt - pad.t - pad.b;
  const maxAbs = Math.max(...data.map((v) => Math.abs(v)), 1);
  const zeroY = pad.t + innerH / 2;
  const barW = innerW / data.length;

  const xTicks = [0, Math.floor((data.length - 1) / 2), data.length - 1];

  return h('svg', { viewBox: `0 0 ${w} ${hgt}`, className: 'chart' },
    h('rect', { x: 0, y: 0, width: w, height: hgt, fill: '#0a1122' }),
    h('line', { x1: pad.l, x2: w - pad.r, y1: zeroY, y2: zeroY, stroke: '#7aa2e3', strokeWidth: 1.4 }),
    h('line', { x1: pad.l, x2: pad.l, y1: pad.t, y2: hgt - pad.b, stroke: '#7aa2e3', strokeWidth: 1.4 }),
    ...data.map((v, i) => {
      const bh = Math.abs(v) / maxAbs * (innerH / 2 - 4);
      const x = pad.l + i * barW + 1;
      const y = v >= 0 ? zeroY - bh : zeroY;
      return h('rect', { key: i, x, y, width: Math.max(1, barW - 2), height: bh, fill: v >= 0 ? '#34d399' : '#f87171' });
    }),
    ...xTicks.map((idx, i) => {
      const x = pad.l + (idx / Math.max(1, data.length - 1)) * innerW;
      return h('text', { key: i, x: x - 24, y: hgt - 14, fill: '#9fb3d9', fontSize: 11 }, labels[idx] || '');
    }),
    h('text', { x: 8, y: 14, fill: '#bfdbfe', fontSize: 11 }, 'Y軸: 騰落率(%)'),
    h('text', { x: w - 120, y: hgt - 8, fill: '#bfdbfe', fontSize: 11 }, 'X軸: 日付'),
  );
}

function App() {
  const [market, setMarket] = useState([]);
  const [news, setNews] = useState([]);
  const [memory, setMemory] = useState({ records: [] });
  const [meta, setMeta] = useState({ symbol: '-', marketSource: '-', newsSource: '-', updated: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [m, n, mem] = await Promise.all([
        fetch('/api/market').then((r) => r.json()),
        fetch('/api/news').then((r) => r.json()),
        fetch('/api/memory').then((r) => r.json()),
      ]);
      setMarket(m.rows || []);
      setNews(n.news || []);
      setMemory(mem || { records: [] });
      setMeta({
        symbol: m.symbol || 'NQ先物',
        marketSource: m.source || '-',
        newsSource: n.source || '-',
        updated: new Date().toLocaleString('ja-JP'),
      });
    } catch (e) {
      setError(e.message || '取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 1000 * 60 * 15);
    return () => clearInterval(t);
  }, []);

  const result = useMemo(() => (market.length ? analyzeMarket(market, news, memory) : null), [market, news, memory]);

  const 最新実績を登録 = async () => {
    if (!result || result.closes.length < 3) return;
    const actual = result.returns[result.returns.length - 1];
    const predicted = result.forecast.nextDayReturnPct;
    await fetch('/api/memory', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ date: market[market.length - 1].date, predicted, actual }),
    });
    await load();
  };

  return h('div', { className: 'page' },
    h('header', { className: 'hero' },
      h('h1', null, 'NASDAQ100先物 ポイント監視・予測分析アプリ'),
      h('p', null, '常時ポイント把握 / 日本語ニュース吸収 / 学習履歴の蓄積で精度改善'),
      h('div', { className: 'top-actions' },
        h('button', { onClick: load, disabled: loading }, loading ? '更新中...' : '最新データ更新'),
        h('button', { onClick: 最新実績を登録, disabled: !result }, '最新実績を学習データに追加'),
        h('span', { className: 'refreshed' }, `最終更新: ${meta.updated || '-'} / 市場:${meta.marketSource} / ニュース:${meta.newsSource}`),
      ),
      error ? h('p', { className: 'error' }, error) : null,
    ),

    !result ? h('section', { className: 'panel' }, '読み込み中...') : h(React.Fragment, null,
      h('section', { className: 'grid' },
        h('article', { className: 'panel' },
          h('h2', null, '先物ポイント監視'),
          h('div', { className: 'stats' },
            h('div', null, h('label', null, '銘柄'), h('strong', null, meta.symbol)),
            h('div', null, h('label', null, '現在ポイント'), h('strong', null, `${数値(result.latest.close, 2)} pt`)),
            h('div', null, h('label', null, '前日比(ポイント)'), h('strong', null, `${数値(result.latest.close - market[market.length - 2].close, 2)} pt`)),
            h('div', null, h('label', null, '前日比(%)'), h('strong', null, `${数値(result.latest.ret, 2)}%`)),
            h('div', null, h('label', null, 'RSI(14)'), h('strong', null, `${数値(result.latest.rsi14, 2)}`)),
            h('div', null, h('label', null, '20日ボラ'), h('strong', null, `${数値(result.latest.vol20, 3)}`)),
          ),
        ),
        h('article', { className: 'panel' },
          h('h2', null, '予測と精度'),
          h('div', { className: 'stats' },
            h('div', null, h('label', null, '翌営業日予測騰落率'), h('strong', null, `${数値(result.forecast.nextDayReturnPct, 3)}%`)),
            h('div', null, h('label', null, '翌営業日予測ポイント'), h('strong', null, `${数値(result.forecast.nextDayPrice, 2)} pt`)),
            h('div', null, h('label', null, '20営業日予測騰落率'), h('strong', null, `${数値(result.forecast.expected20DayMovePct, 2)}%`)),
            h('div', null, h('label', null, '20営業日予測ポイント'), h('strong', null, `${数値(result.forecast.expected20DayPrice, 2)} pt`)),
            h('div', null, h('label', null, '推定信頼度'), h('strong', null, `${数値(result.forecast.confidence, 1)} / 100`)),
            h('div', null, h('label', null, '蓄積学習件数'), h('strong', null, `${result.model.memory.count} 件`)),
          ),
        ),
      ),

      h('section', { className: 'panel' },
        h('h2', null, '先物ポイント推移チャート（Y軸: ポイント / X軸: 日付）'),
        h(軸付きライン, { data: result.closes.slice(-180), labels: market.slice(-180).map((r) => r.date.slice(5)), yLabel: 'ポイント' }),
      ),

      h('section', { className: 'panel' },
        h('h2', null, '日次騰落率チャート（Y軸: % / X軸: 日付）'),
        h(軸付きバー, { data: result.returns.slice(-120), labels: market.slice(-120).map((r) => r.date.slice(5)) }),
      ),

      h('section', { className: 'grid' },
        h('article', { className: 'panel' },
          h('h2', null, 'モデル係数（日本語）'),
          h('table', { className: 'tbl' },
            h('thead', null, h('tr', null, h('th', null, '特徴量'), h('th', null, '重み'))),
            h('tbody', null,
              ...Object.entries(result.model.weights).map(([k, v]) => h('tr', { key: k }, h('td', null, k), h('td', null, 数値(v, 4)))),
            ),
          ),
          h('p', { className: 'muted' }, `検証: Test MAE ${数値(result.model.testScore.mae, 4)} / 方向一致率 ${数値(result.model.testScore.hitRate * 100, 1)}% / 補正バイアス ${数値(result.forecast.calibrationBias, 4)}`),
        ),
        h('article', { className: 'panel' },
          h('h2', null, '日本語ニュース（できる限り直近）'),
          h('ul', { className: 'news' },
            ...result.scoredNews.slice(0, 15).map((n, i) => h('li', { key: `${n.link}-${i}` },
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
