import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeMarket, 日本語センチメント } from '../engine.js';

function ダミー相場(n = 220) {
  const rows = [];
  let p = 18000;
  for (let i = 0; i < n; i += 1) {
    p *= 1 + ((Math.sin(i / 9) + 0.15) / 100);
    rows.push({
      date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
      open: p * 0.99,
      high: p * 1.01,
      low: p * 0.98,
      close: p,
      volume: 1000000 + i * 1000,
    });
  }
  return rows;
}

test('日本語センチメントが期待通り動く', () => {
  assert.ok(日本語センチメント('業績改善と増益で上昇') > 0);
  assert.ok(日本語センチメント('悪化懸念で下落リスク') < 0);
});

test('analyzeMarketが予測結果と精度情報を返す', () => {
  const rows = ダミー相場();
  const news = [
    { title: '米テック株に追い風、成長期待', link: 'a', pubDate: '2026-02-15' },
    { title: '金利高止まり懸念で株価下落リスク', link: 'b', pubDate: '2026-02-16' },
  ];
  const memory = { records: [{ predicted: 0.2, actual: 0.1 }] };
  const result = analyzeMarket(rows, news, memory);

  assert.ok(Number.isFinite(result.forecast.nextDayPrice));
  assert.ok(Number.isFinite(result.forecast.expected20DayPrice));
  assert.ok(result.model.testScore.hitRate >= 0 && result.model.testScore.hitRate <= 1);
  assert.ok(result.model.memory.count >= 1);
  assert.ok(result.closes.length === rows.length);
});
