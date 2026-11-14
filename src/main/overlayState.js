const { EventEmitter } = require('events');
const { computeView } = require('../../core/view');

// État de l'overlay, indépendant d'Electron (donc testable) : relie le suivi du journal, le stockage
// et les réglages, et décide quand la fenêtre doit être visible.
//
// Événements :
//   'change'     le modèle d'affichage a changé (nouvelle file, match terminé, playlist changée)
//   'visibility' la fenêtre doit peut-être apparaître ou disparaître
class OverlayState extends EventEmitter {
  constructor({ store, watcher }) {
    super();
    this.store = store;
    this.watcher = watcher;
    this.pendingGames = 0; // matchs terminés dont le résultat n'apparaît qu'à la prochaine file
    this.gameActive = false; // le jeu tourne (journal écrit dans les 3 dernières minutes)
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
      this.gameActive = active;
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
    return computeView(this.store.samples, { playlist: this.playlist, pendingGames: this.pendingGames });
  }

  // Visible quand le jeu tourne, ou en permanence si l'utilisateur l'a demandé.
  shouldShow() {
    return this.alwaysShow || this.gameActive || this.forceShow;
  }

  setPlaylist(id) {
    this.store.set({ playlist: id });
    this.emit('change');
  }

  setAlwaysShow(value) {
    this.store.set({ alwaysShow: Boolean(value) });
    this.emit('visibility');
  }

  requestShow() {
    this.forceShow = true;
    this.emit('visibility');
  }
}

module.exports = { OverlayState };
