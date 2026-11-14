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

// --- settle : que dit un changement de MMR ? -------------------------------------------------------------

const { settle } = require('../core/samples');

const pair = (before, after, absorbs) => [sample(before, 16, 0), sample(after, 16, 10, absorbs === undefined ? {} : { absorbs })];

test('un match : le signe décide', () => {
  assert.deepEqual(settle(...pair(1100, 1109, 1)), { w: 1, l: 0, clean: true });
  assert.deepEqual(settle(...pair(1100, 1090, 1)), { w: 0, l: 1, clean: true });
});

test("un relevé ancien (sans nombre de matchs absorbés) compte un match par variation", () => {
  assert.deepEqual(settle(...pair(1100, 1109)), { w: 1, l: 0, clean: true });
  assert.deepEqual(settle(...pair(1100, 1100)), null);
});

test('MMR inchangé ou aucun match absorbé : rien à compter', () => {
  assert.equal(settle(...pair(1100, 1100, 0)), null);
  assert.equal(settle(...pair(1100, 1109, 0)), null);
});

test("deux résultats d'un coup qui se compensent : une victoire et une défaite, pas une défaite", () => {
  // Cas réel : un forfait (-10) dont le résultat arrive avec la victoire suivante (+9) donne -1 au total.
  assert.deepEqual(settle(...pair(1139, 1138, 2)), { w: 1, l: 1, clean: false });
});

test('deux victoires ou deux défaites arrivées ensemble', () => {
  assert.deepEqual(settle(...pair(1100, 1118, 2)), { w: 2, l: 0, clean: false });
  assert.deepEqual(settle(...pair(1100, 1081, 2)), { w: 0, l: 2, clean: false });
});

test('trois résultats arrivés ensemble : le nombre de victoires suit la variation', () => {
  assert.deepEqual(settle(...pair(1100, 1109, 3)), { w: 2, l: 1, clean: false }); // +9 = 2 victoires, 1 défaite
  assert.deepEqual(settle(...pair(1100, 1091, 3)), { w: 1, l: 2, clean: false });
});

test("l'unité de variation d'un match sert à répartir, et le total reste le nombre de matchs", () => {
  for (const delta of [-30, -18, -9, 0.1, 9, 18, 30]) {
    const r = settle({ mmr: 1100 }, { mmr: 1100 + delta, absorbs: 4 }, 9);
    if (r) assert.equal(r.w + r.l, 4, 'delta ' + delta);
  }
});

test('un saut de plus de 50 MMR (nouvelle saison) ne compte pas', () => {
  assert.equal(settle(...pair(1100, 1200, 1)), null);
});
