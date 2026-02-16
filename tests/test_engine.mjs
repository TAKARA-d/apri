import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeMarket, sentimentJa } from '../engine.js';

function mockRows(n = 120) {
  const rows = [];
  let price = 15000;
  for (let i = 0; i < n; i += 1) {
    price *= 1 + ((Math.sin(i / 8) + 0.2) / 100);
    rows.push({
      date: `2025-01-${String((i % 28) + 1).padStart(2, '0')}`,
      open: price * 0.99,
      high: price * 1.01,
      low: price * 0.98,
      close: price,
      volume: 1000000 + i * 1000,
    });
  }
  return rows;
}

test('sentimentJa scores positive/negative Japanese text', () => {
  assert.ok(sentimentJa('業績が改善し増益で上昇') > 0);
  assert.ok(sentimentJa('景気悪化で急落リスク懸念') < 0);
});

test('analyzeMarket returns forecast and model scores', () => {
  const rows = mockRows(180);
  const news = [
    { title: '企業業績が改善、成長期待', link: 'a', pubDate: '2026-01-01' },
    { title: '金利高止まりの懸念', link: 'b', pubDate: '2026-01-02' },
  ];
  const result = analyzeMarket(rows, news);

  assert.ok(Number.isFinite(result.forecast.nextDayReturnPct));
  assert.ok(Number.isFinite(result.forecast.expected20DayPrice));
  assert.ok(result.model.testScore.hitRate >= 0 && result.model.testScore.hitRate <= 1);
  assert.ok(result.closes.length === rows.length);
  assert.ok(result.news.length === news.length);
});
