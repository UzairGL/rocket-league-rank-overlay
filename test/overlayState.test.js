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

// --- Session et réglages ----------------------------------------------------------------------------

test('« nouvelle session » remet les victoires et défaites à zéro sans toucher au rang', () => {
  const { state, store, events } = setup({
    samples: [sample(1100, 16, 0), sample(1109, 16, 10), sample(1100, 16, 20)],
  });
  assert.equal(state.view().session.w, 1);
  state.startNewSession(sample(0, 0, 25).ts);
  assert.equal(store.settings.sessionStart, sample(0, 0, 25).ts);
  const v = state.view();
  assert.deepEqual([v.session.w, v.session.l], [0, 0]);
  assert.equal(v.mmr, 1100);
  assert.deepEqual(events, ['change']);
});

test('lancer le jeu pendant que l\'overlay tourne ouvre une nouvelle session', () => {
  const { state, store, watcher } = setup({ samples: [sample(1100, 16, 0), sample(1109, 16, 10)] });
  watcher.emit('active', false); // le jeu est fermé
  assert.equal(store.settings.sessionStart, 0);
  watcher.emit('active', true); // le jeu est lancé
  assert.ok(store.settings.sessionStart > 0);
  assert.deepEqual([state.view().session.w, state.view().session.l], [0, 0]);
});

test("un overlay lancé alors que le jeu tourne déjà ne remet pas la session à zéro", () => {
  const { store, watcher } = setup({ samples: [sample(1100, 16, 0), sample(1109, 16, 10)] });
  watcher.emit('active', true); // première information : le jeu tourne déjà
  assert.equal(store.settings.sessionStart, 0);
  watcher.emit('active', true); // répétition : toujours rien
  assert.equal(store.settings.sessionStart, 0);
});

test('« réinitialiser les réglages » remet tout par défaut et garde les relevés', () => {
  const { state, store, events } = setup({ samples: [sample(1148, 16, 0)] });
  store.set({ playlist: 13, x: 300, y: 200, displayId: 2, alwaysShow: true, webEnabled: true, webLan: true, sessionStart: 5 });
  state.resetSettings();
  assert.deepEqual(store.settings, { playlist: 11, x: null, y: null, displayId: null, alwaysShow: false, webEnabled: false, webLan: false, sessionStart: 0 });
  assert.equal(store.samples.length, 1);
  // L'interface se redessine et la visibilité est recalculée (la fenêtre et la page web sont prévenues à part).
  assert.ok(events.includes('change') && events.includes('visibility'));
});

test('« réinitialiser les réglages » prévient la fenêtre pour qu\'elle se replace', () => {
  const { state } = setup();
  let reset = 0;
  state.on('reset', () => reset++);
  state.resetSettings();
  assert.equal(reset, 1);
});
