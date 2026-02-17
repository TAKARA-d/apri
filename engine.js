function 平均(values) {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function 標準偏差(values) {
  const m = 平均(values);
  return Math.sqrt(平均(values.map((x) => (x - m) ** 2)));
}

function EMA(values, period) {
  if (!values.length) return [];
  const k = 2 / (period + 1);
  const out = [values[0]];
  for (let i = 1; i < values.length; i += 1) {
    out.push(values[i] * k + out[i - 1] * (1 - k));
  }
  return out;
}

function RSI(closes, period = 14) {
  const out = new Array(closes.length).fill(50);
  for (let i = period; i < closes.length; i += 1) {
    const diffs = [];
    for (let j = i - period + 1; j <= i; j += 1) diffs.push(closes[j] - closes[j - 1]);
    const gains = diffs.filter((x) => x > 0);
    const losses = diffs.filter((x) => x < 0).map(Math.abs);
    const rs = (平均(gains) || 0.001) / (平均(losses) || 0.001);
    out[i] = 100 - 100 / (1 + rs);
  }
  return out;
}

const ポジティブ語 = ['上昇', '改善', '好調', '最高', '成長', '拡大', '増益', '強気', '回復', '追い風'];
const ネガティブ語 = ['下落', '悪化', '懸念', '減益', '弱気', '鈍化', 'リスク', '急落', '不安', '高止まり'];

export function 日本語センチメント(text) {
  const p = ポジティブ語.reduce((s, w) => s + (text.includes(w) ? 1 : 0), 0);
  const n = ネガティブ語.reduce((s, w) => s + (text.includes(w) ? 1 : 0), 0);
  return Math.max(-1, Math.min(1, (p - n) / 5));
}

function モデル補正(memory = { records: [] }) {
  const records = memory.records || [];
  if (!records.length) return { bias: 0, hitRate: 0, mae: 0, count: 0 };
  const errors = records.map((r) => r.actual - r.predicted);
  const hits = records.map((r) => (Math.sign(r.actual) === Math.sign(r.predicted) ? 1 : 0));
  return {
    bias: 平均(errors),
    hitRate: 平均(hits),
    mae: 平均(errors.map((e) => Math.abs(e))),
    count: records.length,
  };
}

export function analyzeMarket(rows, news, memory = { records: [] }) {
  const closes = rows.map((r) => r.close);
  const returns = rows.map((r, i) => (i === 0 ? 0 : ((r.close / rows[i - 1].close) - 1) * 100));
  const e12 = EMA(closes, 12);
  const e26 = EMA(closes, 26);
  const macd = e12.map((v, i) => v - e26[i]);
  const rsi14 = RSI(closes, 14);

  const withFeatures = rows.map((r, i) => {
    const recent = returns.slice(Math.max(0, i - 5), i + 1);
    const vol20 = 標準偏差(returns.slice(Math.max(0, i - 20), i + 1));
    return { ...r, ret: returns[i], momentum5: 平均(recent), rsi14: rsi14[i], macd: macd[i], vol20 };
  });

  const scoredNews = news.map((n) => ({ ...n, sentiment: 日本語センチメント(n.title) }));
  const newsSentiment = 平均(scoredNews.map((n) => n.sentiment));

  const dataset = withFeatures.slice(30, -1).map((r, i) => {
    const next = withFeatures[31 + i];
    return {
      x: [1, r.momentum5 / 3, (r.rsi14 - 50) / 25, r.macd / 250, r.vol20 / 2, newsSentiment],
      y: next.ret / 3,
      date: r.date,
    };
  });

  const split = Math.max(40, Math.floor(dataset.length * 0.8));
  const train = dataset.slice(0, split);
  const test = dataset.slice(split);

  let w = [0, 0, 0, 0, 0, 0];
  const lr = 0.03;
  for (let epoch = 0; epoch < 600; epoch += 1) {
    for (const row of train) {
      const pred = w.reduce((s, wi, idx) => s + wi * row.x[idx], 0);
      const err = row.y - pred;
      for (let k = 0; k < w.length; k += 1) w[k] += lr * err * row.x[k] * 0.08;
    }
  }

  const evalScore = (arr) => {
    const errors = arr.map((row) => {
      const pred = w.reduce((s, wi, idx) => s + wi * row.x[idx], 0);
      return row.y - pred;
    });
    return {
      mae: 平均(errors.map((e) => Math.abs(e))),
      hitRate: 平均(arr.map((row) => {
        const pred = w.reduce((s, wi, idx) => s + wi * row.x[idx], 0);
        return Math.sign(pred) === Math.sign(row.y) ? 1 : 0;
      })),
    };
  };

  const trainScore = evalScore(train);
  const testScore = evalScore(test);
  const latest = withFeatures[withFeatures.length - 1];
  const latestX = [1, latest.momentum5 / 3, (latest.rsi14 - 50) / 25, latest.macd / 250, latest.vol20 / 2, newsSentiment];

  const rawNextRet = w.reduce((s, wi, i) => s + wi * latestX[i], 0) * 3;
  const correction = モデル補正(memory);
  const nextRet = rawNextRet + correction.bias;
  const expected20 = Math.max(-15, Math.min(15, nextRet * 12));

  return {
    latest,
    closes,
    returns,
    scoredNews,
    model: {
      weights: {
        定数項: w[0],
        モメンタム5日: w[1],
        RSI: w[2],
        MACD: w[3],
        ボラティリティ: w[4],
        ニュースセンチメント: w[5],
      },
      trainScore,
      testScore,
      memory: correction,
    },
    forecast: {
      nextDayReturnPct: nextRet,
      nextDayPrice: latest.close * (1 + nextRet / 100),
      expected20DayMovePct: expected20,
      expected20DayPrice: latest.close * (1 + expected20 / 100),
      confidence: Math.max(20, Math.min(95, 100 - testScore.mae * 120 - (1 - testScore.hitRate) * 25 - correction.mae * 8)),
      calibrationBias: correction.bias,
    },
  };
}
