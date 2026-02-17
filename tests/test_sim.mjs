import test from 'node:test';
import assert from 'node:assert/strict';
import { PennantGame } from '../sim.js';

test('schedule and initial state', () => {
  const game = new PennantGame(10, 2, '東京スターズ');
  assert.equal(game.teams.length, 6);
  assert.ok(game.schedule.length > 0);
  assert.equal(game.day, 0);
});

test('advance day updates records', () => {
  const game = new PennantGame(11, 1, '東京スターズ');
  const res = game.advanceDay();
  assert.equal(res.length, 3);
  assert.equal(game.day, 1);
  const totalDecisions = game.teams.reduce((sum, t) => sum + t.wins + t.losses + t.draws, 0);
  assert.equal(totalDecisions, 6);
});

test('training and rest affect players', () => {
  const game = new PennantGame(12, 1, '東京スターズ');
  const team = game.teamByName('東京スターズ');
  const beforeCond = team.roster.map((p) => p.condition);
  const msg = game.train('batting');
  assert.match(msg, /batting|打撃|\+/);
  game.rest();
  const afterCond = team.roster.map((p) => p.condition);
  assert.ok(afterCond.some((v, i) => v >= beforeCond[i]));
});

test('save and load keep progress', () => {
  const game = new PennantGame(13, 1, '東京スターズ');
  game.advanceDay();
  const saved = game.save();
  const loaded = PennantGame.load(saved);
  assert.equal(loaded.day, game.day);
  assert.equal(loaded.teamByName('東京スターズ').name, '東京スターズ');
});
