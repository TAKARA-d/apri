import React, { useMemo, useState } from 'https://esm.sh/react@18.2.0';
import { createRoot } from 'https://esm.sh/react-dom@18.2.0/client';
import { NasdaqLearningEngine } from './engine.js';

const h = React.createElement;
const SAVE_KEY = 'nasdaq100-intel-lab-v1';

function fmt(num, d = 2) {
  return Number(num).toLocaleString('ja-JP', { maximumFractionDigits: d, minimumFractionDigits: d });
}

function Sparkline({ values }) {
  const w = 520;
  const hgt = 120;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1e-6, max - min);
  const points = values.map((v, i) => `${(i / (values.length - 1)) * w},${hgt - ((v - min) / range) * hgt}`).join(' ');
  return h('svg', { viewBox: `0 0 ${w} ${hgt}`, className: 'sparkline' },
    h('polyline', { fill: 'none', stroke: '#60a5fa', strokeWidth: 2.5, points }),
  );
}

function App() {
  const [engine, setEngine] = useState(() => new NasdaqLearningEngine(42));
  const [log, setLog] = useState('Initialized with 1 year historical data.');

  const current = engine.current();
  const prediction = useMemo(() => engine.predictHorizon(20), [engine, engine.day]);
  const backtest = useMemo(() => engine.backtest(60), [engine, engine.day]);
  const diagnostics = useMemo(() => engine.modelDiagnostics(), [engine, engine.day]);
  const prices = engine.records.slice(-120).map((d) => d.price);

  function mutate(action, msg) {
    const clone = NasdaqLearningEngine.fromSerialized(engine.serialize());
    action(clone);
    setEngine(clone);
    setLog(msg(clone));
  }

  return h('div', { className: 'page' },
    h('header', { className: 'hero' },
      h('h1', null, 'NASDAQ100 Intelligence Lab'),
      h('p', null, '1年指標トレンド分析 + ニュース吸収 + 日次オンライン学習で予測精度を継続改善するReactアプリ'),
    ),

    h('section', { className: 'panel actions' },
      h('button', { onClick: () => mutate((e) => { e.generateDailyNews(); e.stepDay(); }, (e) => `Day ${e.day}: ニュース吸収と学習を実施`) }, '1日進めて学習'),
      h('button', { onClick: () => mutate((e) => { for (let i = 0; i < 5; i += 1) { e.generateDailyNews(); e.stepDay(); } }, (e) => `Day ${e.day}: 5日分の更新完了`) }, '5日進める'),
      h('button', { onClick: () => mutate((e) => { for (let i = 0; i < 22; i += 1) { e.generateDailyNews(); e.stepDay(); } }, (e) => `Day ${e.day}: 1か月進める`) }, '1か月進める'),
      h('button', { onClick: () => { localStorage.setItem(SAVE_KEY, engine.serialize()); setLog('保存しました。'); } }, '保存'),
      h('button', {
        onClick: () => {
          const raw = localStorage.getItem(SAVE_KEY);
          if (!raw) return setLog('保存データがありません。');
          setEngine(NasdaqLearningEngine.fromSerialized(raw));
          setLog('保存データを復元しました。');
        },
      }, '復元'),
      h('button', { onClick: () => { setEngine(new NasdaqLearningEngine(42)); setLog('モデルをリセットしました。'); } }, 'リセット'),
      h('p', { className: 'status' }, log),
    ),

    h('section', { className: 'grid' },
      h('article', { className: 'panel' },
        h('h2', null, `現在値 (Day ${engine.day})`),
        h('ul', { className: 'kv' },
          h('li', null, h('span', null, 'NASDAQ100'), h('strong', null, fmt(current.price, 1))),
          h('li', null, h('span', null, '日次リターン'), h('strong', null, `${fmt(current.returnPct)}%`)),
          h('li', null, h('span', null, 'VIX'), h('strong', null, fmt(current.vix))),
          h('li', null, h('span', null, 'RSI'), h('strong', null, fmt(current.rsi))),
          h('li', null, h('span', null, 'MACD'), h('strong', null, fmt(current.macd))),
          h('li', null, h('span', null, 'Breadth'), h('strong', null, fmt(current.breadth))),
          h('li', null, h('span', null, 'Rates'), h('strong', null, `${fmt(current.rates)}%`)),
          h('li', null, h('span', null, 'News Sentiment'), h('strong', null, fmt(current.newsSentiment))),
        ),
      ),

      h('article', { className: 'panel' },
        h('h2', null, '20営業日予測'),
        h('ul', { className: 'kv' },
          h('li', null, h('span', null, 'レジーム'), h('strong', null, prediction.regime)),
          h('li', null, h('span', null, '期待騰落率'), h('strong', null, `${fmt(prediction.expectedMovePct)}%`)),
          h('li', null, h('span', null, '予想価格'), h('strong', null, fmt(prediction.expectedPrice, 1))),
          h('li', null, h('span', null, '信頼度'), h('strong', null, `${fmt(prediction.confidence, 1)} / 100`)),
          h('li', null, h('span', null, 'モデルスコア'), h('strong', null, fmt(prediction.score, 3))),
        ),
      ),

      h('article', { className: 'panel wide' },
        h('h2', null, '価格トレンド（過去120日）'),
        h(Sparkline, { values: prices }),
      ),

      h('article', { className: 'panel' },
        h('h2', null, '直近60日 統計解析'),
        h('ul', { className: 'kv' },
          h('li', null, h('span', null, '平均日次リターン'), h('strong', null, `${fmt(backtest.avgReturnPct)}%`)),
          h('li', null, h('span', null, '年率換算ボラ'), h('strong', null, `${fmt(backtest.annualizedVolPct)}%`)),
          h('li', null, h('span', null, '上昇日比率'), h('strong', null, `${fmt(backtest.upDayRatio * 100)}%`)),
          h('li', null, h('span', null, '期間トレンド'), h('strong', null, `${fmt(backtest.windowTrendPct)}%`)),
          h('li', null, h('span', null, '学習率'), h('strong', null, fmt(engine.learningRate, 4))),
        ),
      ),

      h('article', { className: 'panel' },
        h('h2', null, '特徴量重要度'),
        h('table', { className: 'weights' },
          h('thead', null, h('tr', null, h('th', null, 'Feature'), h('th', null, 'Weight'), h('th', null, 'Importance'))),
          h('tbody', null,
            ...diagnostics.map((d) => h('tr', { key: d.feature },
              h('td', null, d.feature),
              h('td', null, fmt(d.weight, 3)),
              h('td', null, `${fmt(d.importance * 100, 1)}%`),
            )),
          ),
        ),
      ),

      h('article', { className: 'panel wide' },
        h('h2', null, 'ニュースフィード（最新12件）'),
        h('ul', { className: 'news' },
          ...engine.newsFeed.slice(0, 12).map((n, idx) => h('li', { key: `${n.day}-${idx}` },
            h('span', { className: 'news-day' }, `Day ${n.day}`),
            h('span', { className: 'news-headline' }, n.headline),
            h('span', { className: `tone ${n.sentiment >= 0 ? 'pos' : 'neg'}` }, `sent ${fmt(n.sentiment, 2)}`),
            h('span', { className: 'impact' }, `impact ${fmt(n.impact, 2)}`),
          )),
        ),
      ),
    ),
  );
}

createRoot(document.getElementById('root')).render(h(App));
