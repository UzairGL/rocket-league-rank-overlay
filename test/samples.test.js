const test = require('node:test');
const assert = require('node:assert/strict');
const { isOwn, ownSamples } = require('../core/samples');
const { sample } = require('./helpers');

test('un relevé en solo est toujours au joueur', () => {
  assert.equal(isOwn(sample(1100, 16, 0)), true);
});

test('un relevé de groupe est au joueur seulement s\'il est chef', () => {
  assert.equal(isOwn(sample(1100, 16, 0, { partySize: 2, leaderIsMe: true })), true);
  assert.equal(isOwn(sample(1100, 16, 0, { partySize: 2, leaderIsMe: false })), false);
  assert.equal(isOwn(sample(1100, 16, 0, { partySize: 2 })), false); // inconnu = prudent
});

test('écarte un relevé de groupe qui saute de plus de 50 MMR', () => {
  const list = ownSamples([
    sample(1100, 16, 0),
    sample(1400, 19, 10, { partySize: 2, leaderIsMe: true }),
    sample(1109, 16, 20, { partySize: 2, leaderIsMe: true }),
  ]);
  assert.deepEqual(list.map((s) => s.mmr), [1100, 1109]);
});

test('la garde de saut se fait par playlist', () => {
  const list = ownSamples([
    sample(1100, 16, 0, { playlist: 11 }),
    sample(700, 11, 10, { playlist: 13, partySize: 2, leaderIsMe: true }),
  ]);
  assert.equal(list.length, 2);
});

test('retourne les relevés triés par date', () => {
  const list = ownSamples([sample(1118, 16, 20), sample(1100, 16, 0)]);
  assert.deepEqual(list.map((s) => s.mmr), [1100, 1118]);
});
