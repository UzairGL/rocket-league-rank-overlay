const test = require('node:test');
const assert = require('node:assert/strict');
const { calibrate } = require('../core/calibration');
const { sample } = require('./helpers');

// Parcours réel observé : Champion I à 1066, descente en Diamond III à 1057,
// retour à 1066 toujours en Diamond III, puis montée à 1075.
const history = [sample(1066, 16, 0), sample(1057, 15, 10), sample(1066, 15, 20), sample(1075, 16, 30)];

test('apprend les seuils de montée et de descente entre Diamond III et Champion I', () => {
  const cal = calibrate(history);
  assert.deepEqual(cal.up[15], { lo: 1067, hi: 1075 }); // montée dans ]1066, 1075]
  assert.deepEqual(cal.down[15], { lo: 1057, hi: 1065 }); // descente dans [1057, 1065]
});

test('sans changement de tier, rien n\'est appris', () => {
  const cal = calibrate([sample(1100, 16, 0), sample(1109, 16, 10)]);
  assert.deepEqual(cal, { up: {}, down: {} });
});

test('ignore les sauts de plus de 50 MMR (reset de saison)', () => {
  const cal = calibrate([sample(1100, 16, 0), sample(700, 12, 10)]);
  assert.deepEqual(cal, { up: {}, down: {} });
});

test('ignore les relevés pris en groupe', () => {
  const cal = calibrate([sample(1066, 16, 0, { partySize: 2 }), sample(1057, 15, 10, { partySize: 2 })]);
  assert.deepEqual(cal, { up: {}, down: {} });
});

test('resserre les bornes avec une montée plus précoce', () => {
  const more = [...history, sample(1070, 15, 40), sample(1072, 16, 50)];
  assert.equal(calibrate(more).up[15].hi, 1072);
});
