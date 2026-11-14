const path = require('path');
const { app, ipcMain, clipboard, dialog } = require('electron');
const { LogWatcher } = require('./logWatcher');
const { Store } = require('./store');
const { OverlayState } = require('./overlayState');
const { createOverlayWindow, listDisplays } = require('./overlayWindow');
const { popupMenu, createTray } = require('./menu');
const { logDir } = require('./paths');
const { WebServer } = require('./webServer');

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
let web = null;

const HELP = {
  type: 'info',
  title: 'Overlay invisible ?',
  message: "L'overlay est affiché par-dessus le jeu, mais il peut rester caché.",
  detail: [
    "Il se remet au premier plan toutes les 2 secondes. S'il reste invisible :",
    '',
    "• vérifie l'écran choisi (menu Écran) : il s'ouvre par défaut sur l'écran secondaire s'il y en a un ;",
    '• passe Rocket League en mode « Fenêtré » ou « sans bordure » : en plein écran exclusif, Windows peut le masquer ;',
    '• ou ouvre la page web locale (menu « Page web locale ») sur un téléphone, une tablette, un navigateur ou OBS.',
    '',
    "L'overlay ne s'injecte volontairement pas dans le jeu, à cause d'Easy Anti-Cheat.",
  ].join('\n'),
  buttons: ['OK'],
};

// Démarre, arrête ou rouvre la page web selon les réglages.
async function applyWeb() {
  try {
    if (state.settings.webEnabled) await web.start({ lan: state.settings.webLan });
    else await web.stop();
  } catch (err) {
    state.setWebEnabled(false);
    dialog.showErrorBox('Page web locale', `Impossible de démarrer la page web : ${err.message}`);
  }
}

app.whenReady().then(() => {
  store = new Store(path.join(app.getPath('userData'), 'overlay-data.json'));
  watcher = new LogWatcher(logDir(app.getPath('documents')));

  // Historique des journaux existants (pour la session en cours et la calibration).
  store.addSamples(watcher.readHistory());

  state = new OverlayState({ store, watcher });
  overlay = createOverlayWindow({ store, state });
  const actions = {
    quit: () => app.quit(),
    listDisplays,
    moveToDisplay: overlay.moveToDisplay,
    web: { urls: () => web.urls() },
    copy: (text) => clipboard.writeText(text),
    help: () => dialog.showMessageBox(HELP),
  };
  tray = createTray(state, actions);

  web = new WebServer({ state, rendererDir: path.join(__dirname, '..', 'renderer') });
  state.on('web', applyWeb);
  applyWeb();

  ipcMain.handle('overlay:get-view', () => state.view());
  ipcMain.on('overlay:menu', () => popupMenu(state, overlay.window, actions));
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
  if (web) web.stop();
  if (store) store.flush();
});

app.on('window-all-closed', () => app.quit());
