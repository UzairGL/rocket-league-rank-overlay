const test = require('node:test');
const assert = require('node:assert/strict');
const { choosePlacement, MARGIN } = require('../src/main/placement');

const W = 470;
const H = 170;
const main = { id: 1, primary: true, workArea: { x: 0, y: 0, width: 2560, height: 1400 } };
const side = { id: 2, primary: false, workArea: { x: 2560, y: -155, width: 1707, height: 1027 } };
const place = (displays, settings = {}) => choosePlacement({ displays, settings, width: W, height: H });

test('un seul écran : en haut à droite de cet écran', () => {
  assert.deepEqual(place([main]), { x: 2560 - W - MARGIN, y: MARGIN, displayId: 1 });
});

test("deux écrans : par défaut l'écran secondaire, là où le jeu ne le cache pas", () => {
  const p = place([main, side]);
  assert.equal(p.displayId, 2);
  assert.equal(p.x, 2560 + 1707 - W - MARGIN);
  assert.equal(p.y, -155 + MARGIN);
});

test("l'écran choisi dans le menu est respecté", () => {
  assert.equal(place([main, side], { displayId: 1 }).displayId, 1);
  assert.equal(place([main, side], { displayId: 2 }).displayId, 2);
});

test("une position glissée par l'utilisateur est conservée", () => {
  assert.deepEqual(place([main, side], { x: 300, y: 200 }), { x: 300, y: 200, displayId: 1 });
});

test("une position enregistrée hors de tout écran est abandonnée (écran débranché)", () => {
  const p = place([main], { x: 3000, y: 100 });
  assert.equal(p.displayId, 1);
  assert.equal(p.x, 2560 - W - MARGIN);
});

test('une fenêtre qui dépasse de son écran est replacée', () => {
  const p = place([main], { x: 2400, y: 100 }); // dépasse à droite
  assert.equal(p.x, 2560 - W - MARGIN);
});

test('un écran choisi puis débranché : retour au choix automatique', () => {
  assert.equal(place([main], { displayId: 2 }).displayId, 1);
});

test('aucun écran : position neutre sans planter', () => {
  assert.deepEqual(place([]), { x: 0, y: 0, displayId: null });
});
