function mean(values) {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function std(values) {
  const m = mean(values);
  return Math.sqrt(mean(values.map((x) => (x - m) ** 2)));
}

function ema(values, period) {
  if (!values.length) return [];
  const k = 2 / (period + 1);
  const out = [values[0]];
  for (let i = 1; i < values.length; i += 1) out.push(values[i] * k + out[i - 1] * (1 - k));
  return out;
}

function rsi(closes, period = 14) {
  const out = new Array(closes.length).fill(50);
  for (let i = period; i < closes.length; i += 1) {
    const diffs = [];
    for (let j = i - period + 1; j <= i; j += 1) diffs.push(closes[j] - closes[j - 1]);
    const gains = diffs.filter((x) => x > 0);
    const losses = diffs.filter((x) => x < 0).map(Math.abs);
    const rs = (mean(gains) || 0.001) / (mean(losses) || 0.001);
    out[i] = 100 - 100 / (1 + rs);
  }
  return out;
}

const POS_WORDS = ['上昇', '改善', '好調', '最高', '成長', '拡大', '増益', '強気', '回復', '追い風'];
const NEG_WORDS = ['下落', '悪化', '懸念', '減益', '弱気', '鈍化', 'リスク', '急落', '不安', '高止まり'];

export function sentimentJa(text) {
  const scorePos = POS_WORDS.reduce((s, w) => s + (text.includes(w) ? 1 : 0), 0);
  const scoreNeg = NEG_WORDS.reduce((s, w) => s + (text.includes(w) ? 1 : 0), 0);
  const score = (scorePos - scoreNeg) / 5;
  return Math.max(-1, Math.min(1, score));
}

export function analyzeMarket(rows, news) {
  const closes = rows.map((r) => r.close);
  const returns = rows.map((r, i) => (i === 0 ? 0 : ((r.close / rows[i - 1].close) - 1) * 100));
  const e12 = ema(closes, 12);
  const e26 = ema(closes, 26);
  const macd = e12.map((v, i) => v - e26[i]);
  const rsi14 = rsi(closes, 14);

  const withFeatures = rows.map((r, i) => {
    const recentReturns = returns.slice(Math.max(0, i - 5), i + 1);
    const vol20 = std(returns.slice(Math.max(0, i - 20), i + 1));
    return {
      ...r,
      ret: returns[i],
      momentum5: mean(recentReturns),
      rsi14: rsi14[i],
      macd: macd[i],
      vol20,
    };
  });

  const newsScored = news.map((n) => ({ ...n, sentiment: sentimentJa(n.title) }));
  const newsSentiment = mean(newsScored.map((n) => n.sentiment));

  const dataset = withFeatures.slice(30, -1).map((r, i) => {
    const next = withFeatures[31 + i];
    const x = [
      1,
      r.momentum5 / 3,
      (r.rsi14 - 50) / 25,
      r.macd / 250,
      r.vol20 / 2,
      newsSentiment,
    ];
    const y = next.ret / 3;
    return { x, y, date: r.date };
  });

  const split = Math.max(40, Math.floor(dataset.length * 0.8));
  const train = dataset.slice(0, split);
  const test = dataset.slice(split);

  let w = [0, 0, 0, 0, 0, 0];
  const lr = 0.03;
  for (let epoch = 0; epoch < 500; epoch += 1) {
    for (const row of train) {
      const pred = w.reduce((s, wi, idx) => s + wi * row.x[idx], 0);
      const err = row.y - pred;
      for (let k = 0; k < w.length; k += 1) w[k] += lr * err * row.x[k] * 0.1;
    }
  }

  const evaluate = (arr) => {
    const errors = arr.map((row) => {
      const pred = w.reduce((s, wi, idx) => s + wi * row.x[idx], 0);
      return row.y - pred;
    });
    const mae = mean(errors.map((e) => Math.abs(e)));
    const hit = mean(arr.map((row) => {
      const pred = w.reduce((s, wi, idx) => s + wi * row.x[idx], 0);
      return Math.sign(pred) === Math.sign(row.y) ? 1 : 0;
    }));
    return { mae, hitRate: hit };
  };

  const trainScore = evaluate(train);
  const testScore = evaluate(test);

  const latest = withFeatures[withFeatures.length - 1];
  const latestX = [
    1,
    latest.momentum5 / 3,
    (latest.rsi14 - 50) / 25,
    latest.macd / 250,
    latest.vol20 / 2,
    newsSentiment,
  ];

  const nextRet = w.reduce((s, wi, i) => s + wi * latestX[i], 0) * 3;
  const expected20 = Math.max(-15, Math.min(15, nextRet * 12));

  return {
    latest,
    closes,
    returns,
    macd,
    rsi14,
    news: newsScored,
    model: {
      weights: {
        intercept: w[0],
        momentum5: w[1],
        rsi: w[2],
        macd: w[3],
        volatility: w[4],
        newsSentiment: w[5],
      },
      trainScore,
      testScore,
    },
    forecast: {
      nextDayReturnPct: nextRet,
      nextDayPrice: latest.close * (1 + nextRet / 100),
      expected20DayMovePct: expected20,
      expected20DayPrice: latest.close * (1 + expected20 / 100),
      confidence: Math.max(25, Math.min(95, 100 - testScore.mae * 120 - (1 - testScore.hitRate) * 30)),
    },
  };
}
