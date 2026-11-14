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

test('garde les relevés triés par date', () => {
  const s = new Store(tmpFile());
  s.addSamples([sample(1118, 16, 20), sample(1100, 16, 0)]);
  assert.deepEqual(s.samples.map((x) => x.mmr), [1100, 1118]);
});
