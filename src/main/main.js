const path = require('path');
const { app, ipcMain } = require('electron');
const { LogWatcher } = require('./logWatcher');
const { Store } = require('./store');
const { OverlayState } = require('./overlayState');
const { createOverlayWindow } = require('./overlayWindow');
const { popupMenu, createTray } = require('./menu');
const { logDir } = require('./paths');

// Pas de processus GPU : l'overlay n'affiche que du texte et quelques barres.
app.disableHardwareAcceleration();
// Fusionne le processus graphique dans le processus principal : un processus et quelques dizaines de Mo en moins.
app.commandLine.appendSwitch('in-process-gpu');

if (!app.requestSingleInstanceLock()) app.quit();

let store = null;
let watcher = null;
let state = null;
let overlay = null;
let tray = null; // référence gardée pour que l'icône ne soit pas ramassée par le GC

app.whenReady().then(() => {
  store = new Store(path.join(app.getPath('userData'), 'overlay-data.json'));
  watcher = new LogWatcher(logDir(app.getPath('documents')));

  // Historique des journaux existants (pour la session en cours et la calibration).
  store.addSamples(watcher.readHistory());

  state = new OverlayState({ store, watcher });
  overlay = createOverlayWindow({ store, state });
  tray = createTray(state, () => app.quit());

  ipcMain.handle('overlay:get-view', () => state.view());
  ipcMain.on('overlay:menu', () => popupMenu(state, overlay.window, () => app.quit()));
  ipcMain.on('overlay:drag', overlay.onDrag);

  // En dernier : les écouteurs sont en place, l'état initial « jeu actif ou non » sera pris en compte.
  watcher.start();
});

// Relancer l'appli force l'affichage, même si le jeu est fermé.
app.on('second-instance', () => {
  if (state) state.requestShow();
});

app.on('before-quit', () => {
  if (watcher) watcher.stop();
  if (store) store.flush();
});

app.on('window-all-closed', () => app.quit());
