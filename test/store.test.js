const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Store } = require('../src/main/store');
const { sample } = require('./helpers');

function tmpFile() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rl-store-')), 'data.json');
}

test('dédoublonne les relevés et les relit après un redémarrage', () => {
  const file = tmpFile();
  const a = new Store(file);
  assert.equal(a.addSamples([sample(1100, 16, 0), sample(1109, 16, 10)]), 2);
  assert.equal(a.addSamples([sample(1100, 16, 0)]), 0);
  a.set({ playlist: 13, x: 10, y: 20 });
  a.flush();

  const b = new Store(file);
  assert.equal(b.samples.length, 2);
  assert.equal(b.settings.playlist, 13);
  assert.equal(b.settings.x, 10);
});

test('repart d\'un état vide quand le fichier est illisible', () => {
  const file = tmpFile();
  fs.writeFileSync(file, '{ pas du json');
  const s = new Store(file);
  assert.equal(s.samples.length, 0);
  assert.equal(s.settings.playlist, 11);
});

test("complète un relevé connu enregistré avant la détection du chef de groupe", () => {
  const file = tmpFile();
  const a = new Store(file);
  a.addSamples([sample(1112, 16, 0, { partySize: 2 })]); // ancienne version : pas de leaderIsMe
  assert.equal(a.samples[0].leaderIsMe, undefined);
  assert.equal(a.addSamples([sample(1112, 16, 0, { partySize: 2, leaderIsMe: true })]), 0); // pas un nouveau relevé
  assert.equal(a.samples.length, 1);
  assert.equal(a.samples[0].leaderIsMe, true);
  a.flush();
  assert.equal(new Store(file).samples[0].leaderIsMe, true);
});

test('garde les relevés triés par date', () => {
  const s = new Store(tmpFile());
  s.addSamples([sample(1118, 16, 20), sample(1100, 16, 0)]);
  assert.deepEqual(s.samples.map((x) => x.mmr), [1100, 1118]);
});

test("resetSettings remet les réglages d'origine, garde les relevés, et se mémorise", () => {
  const file = tmpFile();
  const s = new Store(file);
  s.addSamples([sample(1100, 16, 0)]);
  s.set({ playlist: 13, x: 10, y: 20, sessionStart: 99 });
  s.resetSettings();
  assert.equal(s.settings.playlist, 11);
  assert.equal(s.settings.x, null);
  assert.equal(s.settings.sessionStart, 0);
  assert.equal(s.samples.length, 1);
  s.flush();
  assert.equal(new Store(file).settings.playlist, 11);
});

test("l'heure des relevés enregistrés par d'anciennes versions (lue en heure locale) est recalculée en UTC", () => {
  const file = tmpFile();
  const wrongLocal = Date.parse('2026-11-14T21:32:34'); // ancienne lecture : heure locale
  fs.writeFileSync(file, JSON.stringify({ settings: {}, samples: [{ time: '2026-11-14 21:32:34', ts: wrongLocal, mu: 52, mmr: 1140, tier: 16, playlist: 11, partySize: 1 }] }));
  const s = new Store(file);
  assert.equal(s.samples[0].ts, Date.UTC(2026, 10, 14, 21, 32, 34));
});

test("un relevé déjà connu reçoit le nombre de matchs absorbés et l'heure corrigée", () => {
  const s = new Store(tmpFile());
  s.addSamples([{ ...sample(1139, 16, 0), ts: 1 }]); // ancien relevé : mauvaise heure, pas de nombre de matchs
  assert.equal(s.samples[0].absorbs, undefined);
  s.addSamples([{ ...sample(1139, 16, 0), absorbs: 2 }]);
  assert.equal(s.samples.length, 1);
  assert.equal(s.samples[0].absorbs, 2);
  assert.equal(s.samples[0].ts, sample(1139, 16, 0).ts);
});
