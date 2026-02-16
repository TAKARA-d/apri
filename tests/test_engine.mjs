import test from 'node:test';
import assert from 'node:assert/strict';
import { NasdaqLearningEngine } from '../engine.js';

test('initializes with one year of records', () => {
  const e = new NasdaqLearningEngine(1);
  assert.equal(e.records.length, 252);
  assert.ok(e.current().price > 0);
});

test('prediction outputs valid range', () => {
  const e = new NasdaqLearningEngine(2);
  const p = e.predictHorizon(20);
  assert.ok(p.confidence >= 30 && p.confidence <= 92);
  assert.ok(p.expectedMovePct >= -15 && p.expectedMovePct <= 15);
});

test('daily learning updates model weights', () => {
  const e = new NasdaqLearningEngine(3);
  const before = { ...e.weights };
  e.generateDailyNews();
  e.stepDay();
  const after = e.weights;
  const moved = Object.keys(before).some((k) => before[k] !== after[k]);
  assert.equal(moved, true);
});

test('serialize and restore', () => {
  const e = new NasdaqLearningEngine(4);
  e.generateDailyNews();
  e.stepDay();
  const restored = NasdaqLearningEngine.fromSerialized(e.serialize());
  assert.equal(restored.day, e.day);
  assert.equal(restored.records.length, e.records.length);
  assert.deepEqual(Object.keys(restored.weights), Object.keys(e.weights));
});
