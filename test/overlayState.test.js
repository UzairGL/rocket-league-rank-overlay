const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const { OverlayState } = require('../src/main/overlayState');
const { Store } = require('../src/main/store');
const { sample } = require('./helpers');

// Faux suivi de journal : même interface que LogWatcher pour ce que l'état utilise.
class FakeWatcher extends EventEmitter {
  constructor(exists = true) {
    super();
    this._exists = exists;
  }
  exists() {
    return this._exists;
  }
}

function setup({ exists = true, samples = [] } = {}) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rl-state-')), 'data.json');
  const store = new Store(file);
  store.addSamples(samples, { save: false });
  const watcher = new FakeWatcher(exists);
  const state = new OverlayState({ store, watcher });
  const events = [];
  state.on('change', () => events.push('change'));
  state.on('visibility', () => events.push('visibility'));
  return { state, store, watcher, events };
}

test('sans journal ni historique, la vue est vide avec une raison', () => {
  const { state } = setup({ exists: false });
  assert.deepEqual(state.view(), { empty: true, reason: 'no-log' });
});

test("un nouveau relevé est enregistré, remet à zéro les matchs en attente et prévient l'interface", () => {
  const { state, store, watcher, events } = setup();
  watcher.emit('finished');
  assert.equal(state.pendingGames, 1);
  watcher.emit('sample', sample(1148, 16, 0));
  assert.equal(store.samples.length, 1);
  assert.equal(state.pendingGames, 0);
  assert.equal(state.view().mmr, 1148);
  assert.deepEqual(events, ['change', 'change']);
});

test('les matchs terminés non comptés sont remontés dans la vue', () => {
  const { state, watcher } = setup({ samples: [sample(1100, 16, 0)] });
  watcher.emit('finished');
  watcher.emit('finished');
  assert.equal(state.view().pendingGames, 2);
});

test('la fenêtre est visible seulement quand le jeu tourne', () => {
  const { state, watcher, events } = setup();
  assert.equal(state.shouldShow(), false);
  watcher.emit('active', true);
  assert.equal(state.shouldShow(), true);
  watcher.emit('active', false);
  assert.equal(state.shouldShow(), false);
  assert.deepEqual(events, ['visibility', 'visibility']);
});

test('« toujours afficher » rend la fenêtre visible même jeu fermé, et se mémorise', () => {
  const { state, store } = setup();
  state.setAlwaysShow(true);
  assert.equal(state.shouldShow(), true);
  assert.equal(store.settings.alwaysShow, true);
  state.setAlwaysShow(false);
  assert.equal(state.shouldShow(), false);
});

test("relancer l'appli force l'affichage sans toucher aux réglages enregistrés", () => {
  const { state, store } = setup();
  state.requestShow();
  assert.equal(state.shouldShow(), true);
  assert.equal(store.settings.alwaysShow, false);
});

test("changer de playlist met à jour la vue et le réglage", () => {
  const { state, store, events } = setup({
    samples: [sample(1148, 16, 0), sample(900, 13, 5, { playlist: 13 })],
  });
  assert.equal(state.view().mmr, 1148);
  state.setPlaylist(13);
  assert.equal(store.settings.playlist, 13);
  assert.equal(state.view().mmr, 900);
  assert.deepEqual(events, ['change']);
});
