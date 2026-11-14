const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { LogWatcher } = require('../src/main/logWatcher');
const { logBlock } = require('./helpers');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function setup(initial = '[1.0] démarrage\n') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rl-watch-'));
  const file = path.join(dir, 'Launch.log');
  fs.writeFileSync(file, initial);
  const watcher = new LogWatcher(dir, { intervalMs: 20 });
  const samples = [];
  let finished = 0;
  watcher.on('sample', (s) => samples.push(s));
  watcher.on('finished', () => finished++);
  return { dir, file, watcher, samples, finished: () => finished };
}

test('lit uniquement ce qui est écrit après le démarrage', async () => {
  const t = setup(logBlock({ mu: 50 })); // déjà présent : fait partie de l'historique, pas du direct
  t.watcher.start();
  await wait(60);
  assert.equal(t.samples.length, 0);
  fs.appendFileSync(t.file, logBlock({ mu: 52.45, time: '2026-11-14 17:00:00' }));
  await wait(100);
  t.watcher.stop();
  assert.deepEqual(t.samples.map((s) => s.mmr), [1149]);
});

test('reconstitue une ligne écrite en deux fois', async () => {
  const t = setup();
  t.watcher.start();
  const block = logBlock({ mu: 52.45 });
  fs.appendFileSync(t.file, block.slice(0, 120));
  await wait(60);
  fs.appendFileSync(t.file, block.slice(120));
  await wait(100);
  t.watcher.stop();
  assert.equal(t.samples.length, 1);
});

test('repart du début quand le jeu relance un nouveau fichier plus court', async () => {
  const t = setup(logBlock({ mu: 50 }) + logBlock({ mu: 51 }) + logBlock({ mu: 52 }));
  t.watcher.start();
  await wait(60);
  fs.writeFileSync(t.file, logBlock({ mu: 53, time: '2026-11-14 18:00:00' }));
  await wait(100);
  t.watcher.stop();
  assert.deepEqual(t.samples.map((s) => s.mmr), [1160]);
});

test('signale les matchs classés terminés', async () => {
  const t = setup();
  t.watcher.start();
  fs.appendFileSync(t.file, 'Party: Ranked Game Finished, Clear party member server\n');
  await wait(100);
  t.watcher.stop();
  assert.equal(t.finished(), 1);
});

test('readHistory relit le journal et ses sauvegardes sans doublon', () => {
  const t = setup(logBlock({ mu: 52, time: '2026-11-14 16:00:00' }));
  fs.writeFileSync(path.join(t.dir, 'Launch-backup-2026.11.13-20.00.00.log'), logBlock({ mu: 51, time: '2026-11-13 20:00:00' }) + logBlock({ mu: 52, time: '2026-11-14 16:00:00' }));
  assert.deepEqual(t.watcher.readHistory().map((s) => s.mmr), [1120, 1140]);
});

test('un dossier absent ne fait pas échouer la lecture', () => {
  const w = new LogWatcher(path.join(os.tmpdir(), 'rl-inexistant-' + Date.now()));
  assert.deepEqual(w.readHistory(), []);
  assert.equal(w.exists(), false);
  w.poll();
});
