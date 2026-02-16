import React, { useEffect, useMemo, useState } from 'https://esm.sh/react@18.2.0';
import { createRoot } from 'https://esm.sh/react-dom@18.2.0/client';
import { analyzeMarket } from './engine.js';

const h = React.createElement;

function fmt(n, d = 2) {
  return Number(n).toLocaleString('ja-JP', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function LineChart({ data, color = '#60a5fa', height = 180 }) {
  if (!data.length) return h('div', { className: 'empty' }, 'データなし');
  const width = 900;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = Math.max(1e-6, max - min);
  const points = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * height}`).join(' ');
  return h('svg', { viewBox: `0 0 ${width} ${height}`, className: 'chart' },
    h('polyline', { points, fill: 'none', stroke: color, strokeWidth: 3 }),
  );
}

function Bars({ values }) {
  if (!values.length) return h('div', { className: 'empty' }, 'データなし');
  const width = 900;
  const height = 180;
  const maxAbs = Math.max(...values.map((v) => Math.abs(v)), 1);
  const barW = width / values.length;
  return h('svg', { viewBox: `0 0 ${width} ${height}`, className: 'chart' },
    ...values.map((v, i) => {
      const hgt = Math.abs(v) / maxAbs * (height / 2 - 4);
      const y = v >= 0 ? height / 2 - hgt : height / 2;
      return h('rect', {
        key: i,
        x: i * barW + 1,
        y,
        width: Math.max(1, barW - 2),
        height: hgt,
        fill: v >= 0 ? '#34d399' : '#f87171',
      });
    }),
    h('line', { x1: 0, y1: height / 2, x2: width, y2: height / 2, stroke: '#334155' }),
  );
}

function App() {
  const [marketRows, setMarketRows] = useState([]);
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshedAt, setRefreshedAt] = useState('');
  const [sources, setSources] = useState({ market: '-', news: '-' });

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [m, n] = await Promise.all([
        fetch('/api/market').then((r) => r.json()),
        fetch('/api/news').then((r) => r.json()),
      ]);
      if (m.error) throw new Error(`market: ${m.error}`);
      if (n.error) throw new Error(`news: ${n.error}`);
      setMarketRows(m.rows || []);
      setNews(n.news || []);
      setSources({ market: m.source || 'unknown', news: n.source || 'unknown' });
      setRefreshedAt(new Date().toLocaleString('ja-JP'));
    } catch (e) {
      setError(e.message || 'データ取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 1000 * 60 * 30);
    return () => clearInterval(timer);
  }, []);

  const result = useMemo(() => (marketRows.length ? analyzeMarket(marketRows, news) : null), [marketRows, news]);

  return h('div', { className: 'page' },
    h('header', { className: 'hero' },
      h('h1', null, 'NASDAQ100 インテリジェンス分析ダッシュボード'),
      h('p', null, '実データ + 実ニュース（日本語）を使った予測分析アプリ。ニュース/指標更新で再学習します。'),
      h('div', { className: 'top-actions' },
        h('button', { onClick: load, disabled: loading }, loading ? '更新中...' : '最新データ再取得'),
        h('span', { className: 'refreshed' }, refreshedAt ? `最終更新: ${refreshedAt} / market:${sources.market} news:${sources.news}` : '未更新'),
      ),
      error ? h('p', { className: 'error' }, error) : null,
    ),

    !result ? h('section', { className: 'panel' }, '読み込み中...') : h(React.Fragment, null,
      h('section', { className: 'grid' },
        h('article', { className: 'panel' },
          h('h2', null, '現況サマリー'),
          h('div', { className: 'stats' },
            h('div', null, h('label', null, '終値'), h('strong', null, fmt(result.latest.close, 1))),
            h('div', null, h('label', null, '日次騰落率'), h('strong', null, `${fmt(result.latest.ret)}%`)),
            h('div', null, h('label', null, 'RSI(14)'), h('strong', null, fmt(result.latest.rsi14))),
            h('div', null, h('label', null, 'MACD'), h('strong', null, fmt(result.latest.macd, 2))),
            h('div', null, h('label', null, '20日ボラ'), h('strong', null, fmt(result.latest.vol20, 3))),
            h('div', null, h('label', null, 'ニュース平均センチメント'), h('strong', null, fmt(result.news.reduce((a,b)=>a+b.sentiment,0)/Math.max(1,result.news.length), 2))),
          ),
        ),
        h('article', { className: 'panel' },
          h('h2', null, '予測（本気分析）'),
          h('div', { className: 'stats' },
            h('div', null, h('label', null, '翌営業日予測騰落率'), h('strong', null, `${fmt(result.forecast.nextDayReturnPct)}%`)),
            h('div', null, h('label', null, '翌営業日予想終値'), h('strong', null, fmt(result.forecast.nextDayPrice, 1))),
            h('div', null, h('label', null, '20営業日予測騰落率'), h('strong', null, `${fmt(result.forecast.expected20DayMovePct)}%`)),
            h('div', null, h('label', null, '20営業日予想終値'), h('strong', null, fmt(result.forecast.expected20DayPrice, 1))),
            h('div', null, h('label', null, '予測信頼度'), h('strong', null, `${fmt(result.forecast.confidence, 1)} / 100`)),
            h('div', null, h('label', null, 'テスト方向一致率'), h('strong', null, `${fmt(result.model.testScore.hitRate * 100, 1)}%`)),
          ),
        ),
      ),

      h('section', { className: 'panel' },
        h('h2', null, 'NASDAQ100 終値チャート（約1年）'),
        h(LineChart, { data: result.closes }),
      ),

      h('section', { className: 'panel' },
        h('h2', null, '日次リターン分布（直近120日）'),
        h(Bars, { values: result.returns.slice(-120) }),
      ),

      h('section', { className: 'grid' },
        h('article', { className: 'panel' },
          h('h2', null, 'モデル係数'),
          h('table', { className: 'tbl' },
            h('thead', null, h('tr', null, h('th', null, '指標'), h('th', null, '重み'))),
            h('tbody', null,
              ...Object.entries(result.model.weights).map(([k, v]) => h('tr', { key: k }, h('td', null, k), h('td', null, fmt(v, 4)))),
            ),
          ),
          h('p', { className: 'muted' }, `Train MAE: ${fmt(result.model.trainScore.mae, 4)} / Test MAE: ${fmt(result.model.testScore.mae, 4)}`),
        ),
        h('article', { className: 'panel' },
          h('h2', null, '日本語ニュース（実取得）'),
          h('ul', { className: 'news' },
            ...result.news.slice(0, 15).map((n, i) => h('li', { key: `${n.link}-${i}` },
              h('a', { href: n.link, target: '_blank', rel: 'noreferrer' }, n.title),
              h('span', { className: `tone ${n.sentiment >= 0 ? 'pos' : 'neg'}` }, `sent: ${fmt(n.sentiment, 2)}`),
              h('small', null, n.pubDate || ''),
            )),
          ),
        ),
      ),
    ),
  );
}

createRoot(document.getElementById('root')).render(h(App));
