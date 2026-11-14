const { EventEmitter } = require('events');
const { computeView } = require('../../core/view');

// État de l'overlay, indépendant d'Electron (donc testable) : relie le suivi du journal, le stockage
// et les réglages, et décide quand la fenêtre doit être visible.
//
// Événements :
//   'change'     le modèle d'affichage a changé (nouvelle file, match terminé, playlist changée)
//   'visibility' la fenêtre doit peut-être apparaître ou disparaître
//   'web'        les réglages de la page web locale ont changé (démarrer, arrêter, rouvrir)
//   'reset'      les réglages ont été remis à zéro (la fenêtre doit se replacer)
class OverlayState extends EventEmitter {
  constructor({ store, watcher }) {
    super();
    this.store = store;
    this.watcher = watcher;
    this.pendingGames = 0; // matchs terminés dont le résultat n'apparaît qu'à la prochaine file
    this.gameActive = null; // le jeu tourne ? null = pas encore su (jeu déjà lancé avant l'overlay ou non)
    this.forceShow = false; // l'appli a été relancée à la main : on affiche jusqu'à la fermeture

    watcher.on('sample', (sample) => {
      store.addSamples([sample]);
      this.pendingGames = 0;
      this.emit('change');
    });
    watcher.on('finished', () => {
      this.pendingGames += 1;
      this.emit('change');
    });
    watcher.on('active', (active) => {
      // Le jeu vient d'être LANCÉ pendant que l'overlay tournait : nouvelle session. Un overlay lancé
      // alors que le jeu tourne déjà (première valeur connue) ne remet rien à zéro.
      const launched = active && this.gameActive === false;
      this.gameActive = active;
      if (launched) this.startNewSession();
      this.emit('visibility');
    });
  }

  get settings() {
    return this.store.settings;
  }

  get playlist() {
    return this.store.settings.playlist;
  }

  get alwaysShow() {
    return this.store.settings.alwaysShow;
  }

  view() {
    if (!this.watcher.exists() && !this.store.samples.length) return { empty: true, reason: 'no-log' };
    return computeView(this.store.samples, {
      playlist: this.playlist,
      pendingGames: this.pendingGames,
      sessionStart: this.store.settings.sessionStart,
    });
  }

  // Visible quand le jeu tourne, ou en permanence si l'utilisateur l'a demandé.
  shouldShow() {
    return this.alwaysShow || this.gameActive || this.forceShow;
  }

  // Remet les victoires/défaites de la session à zéro. Le rang, le MMR et l'historique restent.
  startNewSession(now = Date.now()) {
    this.store.set({ sessionStart: now });
    this.pendingGames = 0;
    this.emit('change');
  }

  // Remet les réglages à leur valeur d'origine (position, écran, playlist, page web…).
  resetSettings() {
    this.store.resetSettings();
    this.emit('reset');
    this.emit('change');
    this.emit('visibility');
    this.emit('web');
  }

  setPlaylist(id) {
    this.store.set({ playlist: id });
    this.emit('change');
  }

  setAlwaysShow(value) {
    this.store.set({ alwaysShow: Boolean(value) });
    this.emit('visibility');
  }

  setWebEnabled(value) {
    this.store.set({ webEnabled: Boolean(value) });
    this.emit('web');
  }

  setWebLan(value) {
    this.store.set({ webLan: Boolean(value) });
    this.emit('web');
  }

  requestShow() {
    this.forceShow = true;
    this.emit('visibility');
  }
}

module.exports = { OverlayState };
