const test = require('node:test');
const assert = require('node:assert/strict');
const { locate, STEPS } = require('../core/ranks');

test('la table couvre 21 tiers de 4 divisions plus Supersonic Legend', () => {
  assert.equal(STEPS.length, 21 * 4 + 1);
  for (let i = 1; i < STEPS.length; i++) assert.ok(STEPS[i].min > STEPS[i - 1].min, `ordre croissant à l'indice ${i}`);
});

test('1148 MMR = Champion I, division III', () => {
  const l = locate(1148);
  assert.equal(l.tierName, 'Champion I');
  assert.equal(l.divisionLabel, 'III');
  assert.equal(l.toUp, 14); // 1162 - 1148
  assert.equal(l.toDown, 21); // 1148 - 1128 + 1
  assert.equal(l.next.label, 'Champion I · IV');
  assert.equal(l.prev.label, 'Champion I · II');
});

test('le seuil exact appartient à la division', () => {
  assert.equal(locate(1075).divisionLabel, 'I');
  assert.equal(locate(1075).tierName, 'Champion I');
  assert.equal(locate(1074).tierName, 'Diamond III');
});

test("une valeur dans un trou de la table reste dans la division inférieure", () => {
  assert.equal(locate(1094).divisionLabel, 'I'); // trou entre 1093 et 1095
});

test('Supersonic Legend n\'a pas de division ni de montée', () => {
  const l = locate(1900);
  assert.equal(l.tierName, 'Supersonic Legend');
  assert.equal(l.division, null);
  assert.equal(l.next, null);
  assert.equal(l.toUp, null);
});

test('un MMR très bas reste en Bronze I', () => {
  const l = locate(-300);
  assert.equal(l.tierName, 'Bronze I');
  assert.equal(l.prev, null);
});

test('le tier du journal fait foi quand il diffère de la table (hystérésis)', () => {
  const stayed = locate(1066, 16);
  assert.equal(stayed.tierName, 'Champion I');
  assert.equal(stayed.divisionLabel, 'I');
  assert.equal(stayed.mismatch, true);

  const notYet = locate(1066, 15);
  assert.equal(notYet.tierName, 'Diamond III');
  assert.equal(notYet.mismatch, false);
});
