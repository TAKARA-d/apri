export function createRng(seed = 42) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function mean(values) {
  return values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
}

function stdDev(values) {
  const m = mean(values);
  const v = mean(values.map((x) => (x - m) ** 2));
  return Math.sqrt(v);
}

export class NasdaqLearningEngine {
  constructor(seed = 42) {
    this.rng = createRng(seed);
    this.day = 0;
    this.records = [];
    this.newsFeed = [];
    this.weights = {
      momentum: 0.9,
      rsi: -0.35,
      macd: 0.75,
      vix: -0.65,
      breadth: 0.45,
      rates: -0.55,
      volumeTrend: 0.2,
      newsSentiment: 0.8,
    };
    this.learningRate = 0.015;
    this.lastPrediction = null;
    this.initializeYear();
  }

  initializeYear(days = 252) {
    let price = 17600;
    let ema12 = price;
    let ema26 = price;

    for (let i = 0; i < days; i += 1) {
      const shock = (this.rng() - 0.5) * 2.2;
      const drift = 0.04;
      const returnPct = drift + shock * 0.38;
      price = clamp(price * (1 + returnPct / 100), 9000, 30000);

      ema12 = ema12 * 0.846 + price * 0.154;
      ema26 = ema26 * 0.926 + price * 0.074;
      const macd = (ema12 - ema26) / Math.max(1, price) * 100;

      const vix = clamp(17 + (this.rng() - 0.5) * 7 - returnPct * 1.5, 11, 48);
      const rates = clamp(4.5 + (this.rng() - 0.5) * 0.4 + i * 0.0006, 3.6, 6.4);
      const breadth = clamp(52 + (this.rng() - 0.5) * 26 + returnPct * 6, 8, 92);
      const volumeTrend = clamp((this.rng() - 0.5) * 2 + Math.abs(returnPct) * 0.6, -2.2, 3.2);

      const lookback = this.records.slice(-14).map((d) => d.returnPct);
      const gains = lookback.filter((x) => x > 0);
      const losses = lookback.filter((x) => x < 0).map(Math.abs);
      const avgGain = gains.length ? mean(gains) : 0.08;
      const avgLoss = losses.length ? mean(losses) : 0.08;
      const rs = avgLoss > 0 ? avgGain / avgLoss : 1.1;
      const rsi = clamp(100 - 100 / (1 + rs), 10, 90);

      this.records.push({
        day: i + 1,
        price,
        returnPct,
        momentum: lookback.length ? mean(lookback.slice(-5)) : 0,
        rsi,
        macd,
        vix,
        breadth,
        rates,
        volumeTrend,
        newsSentiment: (this.rng() - 0.5) * 0.8,
      });
    }

    this.day = this.records.length;
  }

  current() {
    return this.records[this.records.length - 1];
  }

  featureVector(record) {
    return {
      momentum: clamp(record.momentum / 1.6, -2, 2),
      rsi: (record.rsi - 50) / 25,
      macd: clamp(record.macd / 1.8, -2, 2),
      vix: (20 - record.vix) / 10,
      breadth: (record.breadth - 50) / 20,
      rates: (4.3 - record.rates) / 1.5,
      volumeTrend: clamp(record.volumeTrend / 1.2, -2, 2),
      newsSentiment: clamp(record.newsSentiment / 0.9, -2, 2),
    };
  }

  score(record = this.current()) {
    const f = this.featureVector(record);
    return Object.entries(this.weights).reduce((acc, [k, w]) => acc + w * f[k], 0);
  }

  predictHorizon(days = 20) {
    const c = this.current();
    const score = this.score(c);
    const dailyAlpha = score * 0.09;
    const expectedMove = clamp(dailyAlpha * days, -15, 15);
    const confidence = clamp(45 + Math.abs(score) * 14 - c.vix * 0.35, 30, 92);

    this.lastPrediction = {
      horizonDays: days,
      expectedMovePct: expectedMove,
      expectedPrice: c.price * (1 + expectedMove / 100),
      confidence,
      regime: score > 0.5 ? 'Risk-On' : score < -0.5 ? 'Risk-Off' : 'Neutral',
      score,
      day: this.day,
    };
    return this.lastPrediction;
  }

  ingestNews(items) {
    items.forEach((item) => {
      this.newsFeed.unshift({ ...item, day: this.day + 1 });
    });
    this.newsFeed = this.newsFeed.slice(0, 120);
  }

  generateDailyNews() {
    const topics = [
      ['NVIDIA earnings beat', 0.55],
      ['Fed official hints prolonged tight policy', -0.42],
      ['AI capex outlook raised by mega caps', 0.38],
      ['Geopolitical tension pressures semiconductors', -0.35],
      ['Cloud demand stabilizes', 0.22],
      ['Labor market cools gradually', 0.18],
      ['Bond yields spike on inflation surprise', -0.4],
      ['M&A activity supports tech valuations', 0.25],
    ];

    const count = 2 + Math.floor(this.rng() * 3);
    const news = [];
    for (let i = 0; i < count; i += 1) {
      const [headline, base] = topics[Math.floor(this.rng() * topics.length)];
      news.push({
        headline,
        sentiment: clamp(base + (this.rng() - 0.5) * 0.4, -1, 1),
        impact: clamp(0.4 + this.rng() * 0.8, 0.2, 1.5),
      });
    }
    this.ingestNews(news);
    return news;
  }

  aggregatedNewsSentiment(lookback = 12) {
    const slice = this.newsFeed.slice(0, lookback);
    if (!slice.length) return 0;
    const weighted = slice.reduce((acc, n) => acc + n.sentiment * n.impact, 0);
    const totalImpact = slice.reduce((acc, n) => acc + n.impact, 0);
    return totalImpact ? weighted / totalImpact : 0;
  }

  learnFromOutcome(actualReturnPct, predictedScore, features) {
    const target = clamp(actualReturnPct / 1.2, -2, 2);
    const error = target - predictedScore;
    Object.keys(this.weights).forEach((k) => {
      this.weights[k] = clamp(
        this.weights[k] + this.learningRate * error * features[k],
        -2.4,
        2.4,
      );
    });
    this.learningRate = clamp(this.learningRate * 0.9995, 0.005, 0.02);
    return error;
  }

  stepDay() {
    const prev = this.current();
    const features = this.featureVector(prev);
    const predScore = this.score(prev);

    const newsSentiment = this.aggregatedNewsSentiment(14) * 0.9 + (this.rng() - 0.5) * 0.2;
    const exoShock = (this.rng() - 0.5) * 1.4;

    const actualReturnPct = clamp(
      predScore * 0.25 + newsSentiment * 0.45 + exoShock,
      -4.8,
      4.8,
    );

    const price = clamp(prev.price * (1 + actualReturnPct / 100), 8000, 32000);
    const macd = clamp(prev.macd * 0.7 + actualReturnPct * 0.25, -4, 4);
    const vix = clamp(prev.vix + (this.rng() - 0.5) * 2.3 - actualReturnPct * 1.9, 10, 55);
    const rates = clamp(prev.rates + (this.rng() - 0.5) * 0.08, 3.5, 7);
    const breadth = clamp(prev.breadth + actualReturnPct * 8 + (this.rng() - 0.5) * 5, 5, 95);
    const volumeTrend = clamp(Math.abs(actualReturnPct) * 0.7 + (this.rng() - 0.5) * 1.6, -2.5, 4.5);
    const rsi = clamp(prev.rsi * 0.72 + (actualReturnPct > 0 ? 62 : 40) * 0.28 + (this.rng() - 0.5) * 4, 8, 92);

    const next = {
      day: prev.day + 1,
      price,
      returnPct: actualReturnPct,
      momentum: prev.momentum * 0.7 + actualReturnPct * 0.3,
      rsi,
      macd,
      vix,
      breadth,
      rates,
      volumeTrend,
      newsSentiment,
    };

    this.records.push(next);
    this.day += 1;

    const error = this.learnFromOutcome(actualReturnPct, predScore, features);
    return { next, error };
  }

  backtest(window = 60) {
    const slice = this.records.slice(-window);
    const realized = slice.map((d) => d.returnPct);
    const vol = stdDev(realized) * Math.sqrt(252);
    const upDays = realized.filter((r) => r > 0).length;
    const hitRate = upDays / Math.max(1, realized.length);
    const trend = (slice[slice.length - 1].price / slice[0].price - 1) * 100;

    return {
      annualizedVolPct: vol,
      upDayRatio: hitRate,
      windowTrendPct: trend,
      avgReturnPct: mean(realized),
    };
  }

  modelDiagnostics() {
    const w = this.weights;
    const totalAbs = Object.values(w).reduce((a, b) => a + Math.abs(b), 0);
    return Object.entries(w)
      .map(([k, v]) => ({ feature: k, weight: v, importance: Math.abs(v) / totalAbs }))
      .sort((a, b) => b.importance - a.importance);
  }

  serialize() {
    return JSON.stringify({
      day: this.day,
      records: this.records,
      newsFeed: this.newsFeed,
      weights: this.weights,
      learningRate: this.learningRate,
      lastPrediction: this.lastPrediction,
    });
  }

  static fromSerialized(raw) {
    const parsed = JSON.parse(raw);
    const engine = new NasdaqLearningEngine(1);
    engine.day = parsed.day;
    engine.records = parsed.records;
    engine.newsFeed = parsed.newsFeed;
    engine.weights = parsed.weights;
    engine.learningRate = parsed.learningRate;
    engine.lastPrediction = parsed.lastPrediction;
    engine.rng = createRng(1000 + engine.day);
    return engine;
  }
}
