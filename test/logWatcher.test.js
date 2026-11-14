const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { LogWatcher } = require('../src/main/logWatcher');
const { logBlock, RANKED_SET, RANKED_CLEAR } = require('./helpers');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function setup(initial = '[1.0] démarrage\n') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rl-watch-'));
  const file = path.join(dir, 'Launch.log');
  fs.writeFileSync(file, initial);
  const watcher = new LogWatcher(dir, { intervalMs: 20 });
  const samples = [];
  const ended = [];
  watcher.on('sample', (s) => samples.push(s));
  watcher.on('matchEnded', (e) => ended.push(e));
  return { dir, file, watcher, samples, ended };
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

test('signale un match classé terminé, une seule fois malgré les « Clear » en double', async () => {
  const t = setup();
  t.watcher.start();
  fs.appendFileSync(t.file, logBlock({ mu: 52.45 }) + RANKED_SET + RANKED_CLEAR + RANKED_CLEAR + RANKED_CLEAR);
  await wait(100);
  t.watcher.stop();
  assert.deepEqual(t.ended, [{ playlist: 11, pending: 1 }]);
});

test('au démarrage, les matchs terminés non encore résolus du journal courant sont repris', () => {
  const t = setup(logBlock({ mu: 52.45 }) + RANKED_SET + RANKED_CLEAR);
  let primed = null;
  t.watcher.on('primed', (p) => (primed = p));
  t.watcher.start();
  t.watcher.stop();
  assert.deepEqual(primed, { pending: { 11: 1 } });
});

test("« jeu fermé » n'est annoncé qu'après plusieurs constats d'affilée (une lecture ratée ne compte pas)", () => {
  const t = setup();
  const old = new Date(Date.now() - 60 * 60 * 1000);
  fs.utimesSync(t.file, old, old); // dernière écriture visible il y a une heure : seul le verrou compte
  let held = true;
  const w = new LogWatcher(t.dir, { isHeldOpen: () => held });
  const states = [];
  w.on('active', (a) => states.push(a));
  const poll = () => w.updateActive(w.stat());
  poll(); // actif
  held = false;
  poll();
  poll(); // deux constats d'inactivité : on attend encore
  held = true;
  poll(); // le jeu est de retour : aucun « fermé » n'a été annoncé
  assert.deepEqual(states, [true]);
  held = false;
  poll();
  poll();
  poll(); // trois constats d'affilée : le jeu est bien fermé
  assert.deepEqual(states, [true, false]);
  held = true;
  poll(); // et il est relancé : annoncé tout de suite
  assert.deepEqual(states, [true, false, true]);
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

// --- Détection « le jeu tourne » par le verrou du journal -----------------------------------------

test('un journal tenu ouvert par le jeu = actif, même si sa date est ancienne', () => {
  const t = setup();
  const old = new Date(Date.now() - 60 * 60 * 1000);
  fs.utimesSync(t.file, old, old); // dernière écriture visible il y a une heure
  const idle = new LogWatcher(t.dir, { isHeldOpen: () => false });
  const held = new LogWatcher(t.dir, { isHeldOpen: () => true });
  assert.equal(idle.isActive(), false);
  assert.equal(held.isActive(), true);
});

test("sans verrou, la date récente suffit toujours (autres systèmes)", () => {
  const t = setup();
  const w = new LogWatcher(t.dir, { isHeldOpen: () => false });
  assert.equal(w.isActive(), true); // journal tout juste écrit
});

test('« jeu actif » dès que le verrou apparaît, « inactif » quand il disparaît', async () => {
  const t = setup();
  const old = new Date(Date.now() - 60 * 60 * 1000);
  fs.utimesSync(t.file, old, old);
  let held = false;
  const w = new LogWatcher(t.dir, { intervalMs: 20, isHeldOpen: () => held });
  const states = [];
  w.on('active', (a) => states.push(a));
  w.start();
  await wait(60);
  held = true;
  await wait(80);
  held = false;
  await wait(80);
  w.stop();
  assert.deepEqual(states, [false, true, false]);
});

test('Windows : un vrai processus qui tient le fichier sans partage en écriture est détecté', { skip: process.platform !== 'win32' }, async () => {
  const t = setup();
  const { spawn } = require('child_process');
  const script = `$f=[IO.File]::Open('${t.file.replace(/'/g, "''")}','Open','ReadWrite','Read'); Start-Sleep 6`;
  const child = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { stdio: 'ignore' });
  try {
    const w = new LogWatcher(t.dir);
    let seen = false;
    for (let i = 0; i < 100 && !seen; i++) {
      seen = w.heldOpen();
      if (!seen) await wait(100);
    }
    assert.equal(seen, true, 'le verrou du processus externe doit être vu');
  } finally {
    child.kill();
    await new Promise((r) => child.once('exit', r));
  }
  const after = new LogWatcher(t.dir);
  let released = false;
  for (let i = 0; i < 30 && !released; i++) {
    released = !after.heldOpen();
    if (!released) await wait(100);
  }
  assert.equal(released, true, 'le verrou doit disparaître avec le processus');
});
