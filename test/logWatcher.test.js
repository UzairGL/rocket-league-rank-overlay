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

test("démarrer en cours de partie : l'identité et le chef de groupe déjà passés sont repris", async () => {
  const ME = 'Epic|aaaa1111|0';
  const before =
    `Party: HandleLocalPlayerLoginStatusChanged PlayerName=Moi PlayerID=${ME} LoginStatus=LS_LoggedIn IsPrimary=True IsInParty=False\n` +
    "Party: OnPartyCreated bWasSuccessful=(True) InPartyId:'PsyNet-x' \n" +
    `Party: HandleLobbyMemberStatusUpdate LobbyUID=PsyNet-x Members=1 MemberIndex=0 MemberID=${ME}\n`;
  const t = setup(before);
  t.watcher.start();
  fs.appendFileSync(t.file, logBlock({ mu: 52.45, party: 2, time: '2026-11-14 19:00:00' }));
  await wait(100);
  t.watcher.stop();
  assert.equal(t.samples.length, 1);
  assert.equal(t.samples[0].partySize, 2);
  assert.equal(t.samples[0].leaderIsMe, true);
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

test("signale quand le jeu devient actif puis inactif d'après la date d'écriture du journal", async () => {
  const t = setup();
  t.watcher.activeMs = 150;
  const states = [];
  t.watcher.on('active', (a) => states.push(a));
  t.watcher.start(); // journal tout juste écrit : actif
  await wait(60);
  assert.deepEqual(states, [true]);
  assert.equal(t.watcher.isActive(), true);
  await wait(250); // plus aucune écriture : inactif
  assert.deepEqual(states, [true, false]);
  assert.equal(t.watcher.isActive(), false);
  fs.appendFileSync(t.file, 'le jeu réécrit\n'); // reprise
  await wait(80);
  t.watcher.stop();
  assert.deepEqual(states, [true, false, true]);
});

test('sans journal, le jeu est considéré inactif', () => {
  const w = new LogWatcher(path.join(os.tmpdir(), 'rl-inexistant-' + Date.now()));
  assert.equal(w.isActive(), false);
});

test('un dossier absent ne fait pas échouer la lecture', () => {
  const w = new LogWatcher(path.join(os.tmpdir(), 'rl-inexistant-' + Date.now()));
  assert.deepEqual(w.readHistory(), []);
  assert.equal(w.exists(), false);
  w.poll();
});
