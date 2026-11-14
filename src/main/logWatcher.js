const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { LogParser } = require('../../core/logparser');

const LIVE_FILE = 'Launch.log';
const MAX_CHUNK = 4 * 1024 * 1024;
// Repli quand le verrou n'est pas disponible : le jeu écrit dans son journal toutes les 60 s tant
// qu'il tourne ; trois minutes sans écriture visible = le jeu est fermé.
const ACTIVE_MS = 3 * 60 * 1000;
const INACTIVE_POLLS = 3; // constats d'inactivité d'affilée avant d'annoncer que le jeu est fermé

// Surveille Launch.log en lecture seule : un simple `stat` toutes les `intervalMs`, et une lecture
// uniquement quand le fichier a grossi. Rien n'est injecté dans le jeu, rien ne lit sa mémoire.
//
// Événements : 'sample' (relevé de MMR à l'entrée en file), 'matchEnded' (match classé terminé ou quitté),
// 'primed' (état repris du journal courant au démarrage), 'active' (le jeu tourne ou non).
class LogWatcher extends EventEmitter {
  // isHeldOpen : remplaçable pour les tests ; par défaut, la vraie vérification du verrou.
  constructor(dir, { intervalMs = 2000, activeMs = ACTIVE_MS, isHeldOpen } = {}) {
    super();
    this.dir = dir;
    this.intervalMs = intervalMs;
    this.activeMs = activeMs;
    this.isHeldOpen = isHeldOpen || (() => this.heldOpen());
    this.active = null;
    this.inactiveStreak = 0;
    this.offset = 0;
    this.birth = 0;
    this.rest = '';
    this.timer = null;
    this.parser = new LogParser({
      onSample: (s) => this.emit('sample', s),
      onMatchEnded: (info) => this.emit('matchEnded', info),
    });
  }

  exists() {
    return this.stat() !== null;
  }

  stat() {
    try {
      return fs.statSync(path.join(this.dir, LIVE_FILE));
    } catch {
      return null;
    }
  }

  // Relit le journal courant et ses sauvegardes. Les relevés sont retournés, pas émis.
  readHistory() {
    let files;
    try {
      files = fs.readdirSync(this.dir).filter((f) => /^Launch.*\.log$/.test(f));
    } catch {
      return [];
    }
    const seen = new Set();
    const out = [];
    for (const f of files) {
      const parser = new LogParser({
        onSample: (s) => {
          const key = `${s.time}|${s.mu}`;
          if (!seen.has(key)) {
            seen.add(key);
            out.push(s);
          }
        },
      });
      try {
        parser.feedText(fs.readFileSync(path.join(this.dir, f), 'utf8'));
      } catch {
        // fichier verrouillé ou supprimé entre-temps : on l'ignore
      }
    }
    return out.sort((a, b) => a.ts - b.ts);
  }

  // Le jeu tient-il le journal ouvert ? Sous Windows, il l'ouvre sans partage en écriture : essayer de
  // l'ouvrir en écriture échoue (EBUSY) tant qu'il tourne. On ne modifie rien, on referme aussitôt.
  // Ailleurs (pas de verrou obligatoire) l'ouverture réussit toujours : on retombe sur la date.
  heldOpen() {
    try {
      fs.closeSync(fs.openSync(path.join(this.dir, LIVE_FILE), 'r+'));
      return false;
    } catch (err) {
      return err.code === 'EBUSY';
    }
  }

  // Le jeu tourne-t-il ? Journal tenu ouvert, ou écrit récemment. La date seule ne suffit pas :
  // Windows la met à jour avec retard pour un fichier ouvert (mesuré : 5 minutes de retard).
  computeActive(st, now = Date.now()) {
    if (st === null) return false;
    return this.isHeldOpen() || now - st.mtimeMs < this.activeMs;
  }

  isActive(now = Date.now()) {
    return this.computeActive(this.stat(), now);
  }

  // « Actif » est annoncé tout de suite ; « inactif » seulement après INACTIVE_POLLS constats d'affilée,
  // pour qu'une lecture isolée ratée ne fasse pas croire que le jeu a été fermé puis relancé (ce qui
  // ouvrirait une nouvelle session à tort).
  updateActive(st) {
    const raw = this.computeActive(st);
    if (raw) this.inactiveStreak = 0;
    else this.inactiveStreak += 1;
    const next = raw || (this.active === null || this.inactiveStreak >= INACTIVE_POLLS ? false : this.active);
    if (next !== this.active) {
      this.active = next;
      this.emit('active', next);
    }
  }

  start() {
    const st = this.stat();
    if (st) {
      this.offset = st.size;
      this.birth = st.birthtimeMs;
      this.primePartyState();
    }
    this.updateActive(st);
    this.timer = setInterval(() => this.poll(), this.intervalMs);
  }

  // Démarrer en cours de partie : la ligne de connexion (qui suis-je) et la composition du groupe
  // sont déjà passées. On relit le journal courant avec un lecteur jetable, sans rien émettre,
  // pour reprendre ces deux informations.
  primePartyState() {
    try {
      const probe = new LogParser();
      probe.feedText(fs.readFileSync(path.join(this.dir, LIVE_FILE), 'utf8'));
      this.parser.adopt(probe);
      this.emit('primed', { pending: { ...probe.pending } });
    } catch {
      // illisible : on repartira de l'état inconnu, donc prudent (groupe = non fiable)
    }
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  poll() {
    const st = this.stat();
    this.updateActive(st);
    if (!st) return;
    // Nouveau fichier (le jeu a été relancé) ou fichier tronqué : on repart du début.
    if (st.birthtimeMs !== this.birth || st.size < this.offset) {
      this.offset = 0;
      this.rest = '';
      this.birth = st.birthtimeMs;
      this.parser.onNewFile();
    }
    if (st.size === this.offset) return;

    const length = Math.min(st.size - this.offset, MAX_CHUNK);
    const buf = Buffer.alloc(length);
    let fd;
    try {
      fd = fs.openSync(path.join(this.dir, LIVE_FILE), 'r');
      const read = fs.readSync(fd, buf, 0, length, this.offset);
      this.offset += read;
      const lines = (this.rest + buf.toString('utf8', 0, read)).split(/\r?\n/);
      this.rest = lines.pop();
      for (const line of lines) if (line) this.parser.feed(line);
    } catch {
      // lecture impossible ce coup-ci : nouvelle tentative au prochain passage
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }
  }
}

module.exports = { LogWatcher };
