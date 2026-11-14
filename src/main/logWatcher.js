const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { LogParser } = require('../../core/logparser');

const LIVE_FILE = 'Launch.log';
const MAX_CHUNK = 4 * 1024 * 1024;
// Le jeu écrit dans son journal toutes les 60 s tant qu'il tourne (mesuré). Trois minutes sans
// écriture = le jeu est fermé.
const ACTIVE_MS = 3 * 60 * 1000;

// Surveille Launch.log en lecture seule : un simple `stat` toutes les `intervalMs`, et une lecture
// uniquement quand le fichier a grossi. Rien n'est injecté dans le jeu, rien ne lit sa mémoire.
//
// Événements : 'sample' (relevé de MMR à l'entrée en file), 'finished' (match classé terminé).
class LogWatcher extends EventEmitter {
  constructor(dir, { intervalMs = 2000, activeMs = ACTIVE_MS } = {}) {
    super();
    this.dir = dir;
    this.intervalMs = intervalMs;
    this.activeMs = activeMs;
    this.active = null;
    this.offset = 0;
    this.birth = 0;
    this.rest = '';
    this.timer = null;
    this.parser = new LogParser({
      onSample: (s) => this.emit('sample', s),
      onFinished: () => this.emit('finished'),
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

  // Le jeu tourne-t-il ? Déduit de la date de dernière écriture du journal, sans lancer de commande.
  isActive(now = Date.now()) {
    const st = this.stat();
    return st !== null && now - st.mtimeMs < this.activeMs;
  }

  updateActive(st) {
    const active = st !== null && Date.now() - st.mtimeMs < this.activeMs;
    if (active !== this.active) {
      this.active = active;
      this.emit('active', active);
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
      this.parser.localId = probe.localId;
      this.parser.leaderId = probe.leaderId;
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
      this.parser.pending = null;
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
