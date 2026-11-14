const fs = require('fs');
const path = require('path');

const MAX_SAMPLES = 5000;
const DEFAULT_SETTINGS = {
  playlist: 11,
  x: null,
  y: null,
  displayId: null, // écran choisi dans le menu (null = automatique)
  alwaysShow: false,
  webEnabled: false, // page web locale (téléphone, OBS, navigateur)
  webLan: false, // ouverte au réseau local ; sinon seulement ce PC
};

// Persistance JSON minimale : historique des relevés (pour la calibration d'une saison à l'autre)
// et réglages de la fenêtre. Écritures regroupées pour ne pas solliciter le disque.
class Store {
  constructor(file) {
    this.file = file;
    this.samples = [];
    this.settings = { ...DEFAULT_SETTINGS };
    this.byKey = new Map();
    this.timer = null;
    this.load();
  }

  load() {
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
      this.addSamples(data.samples || [], { save: false });
    } catch {
      // premier lancement ou fichier illisible : on repart d'un état vide
    }
  }

  static key(s) {
    return `${s.time}|${s.mu}`;
  }

  // Ajoute les relevés inconnus. Un relevé déjà connu mais enregistré sans `leaderIsMe` (anciennes
  // versions) est complété au passage, pour que l'historique profite de la détection du chef de groupe.
  addSamples(list, { save = true } = {}) {
    let added = 0;
    let updated = 0;
    for (const s of list) {
      const k = Store.key(s);
      const known = this.byKey.get(k);
      if (known) {
        if (known.leaderIsMe === undefined && s.leaderIsMe !== undefined) {
          known.leaderIsMe = s.leaderIsMe;
          updated++;
        }
        continue;
      }
      this.byKey.set(k, s);
      this.samples.push(s);
      added++;
    }
    if (added) {
      this.samples.sort((a, b) => a.ts - b.ts);
      if (this.samples.length > MAX_SAMPLES) this.samples = this.samples.slice(-MAX_SAMPLES);
    }
    if ((added || updated) && save) this.scheduleSave();
    return added;
  }

  set(settings) {
    Object.assign(this.settings, settings);
    this.scheduleSave();
  }

  scheduleSave() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 1500);
  }

  flush() {
    clearTimeout(this.timer);
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify({ settings: this.settings, samples: this.samples }));
    } catch {
      // disque indisponible : on retentera à la prochaine modification
    }
  }
}

module.exports = { Store };
