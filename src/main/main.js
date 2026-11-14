const path = require('path');
const { app, BrowserWindow, ipcMain, Menu, Tray, screen } = require('electron');
const { computeView } = require('../../core/view');
const { LogWatcher } = require('./logWatcher');
const { Store } = require('./store');
const { logDir } = require('./paths');
const { createTrayIcon } = require('./trayIcon');

// Pas de processus GPU : l'overlay n'affiche que du texte et quelques barres.
app.disableHardwareAcceleration();
// Fusionne le processus graphique dans le processus principal : un processus et quelques dizaines de Mo en moins.
app.commandLine.appendSwitch('in-process-gpu');

if (!app.requestSingleInstanceLock()) app.quit();

const PLAYLISTS = [
  { id: 10, label: '1v1 classé' },
  { id: 11, label: '2v2 classé' },
  { id: 13, label: '3v3 classé' },
];
const WIN_W = 470;
const WIN_H = 170;

let win = null;
let tray = null;
let store = null;
let watcher = null;
let gameActive = false; // le jeu tourne (journal écrit dans les 3 dernières minutes)
let forceShow = false; // l'appli a été relancée à la main : on affiche jusqu'à la fermeture
let pendingGames = 0; // matchs terminés dont le résultat n'apparaît qu'à la prochaine file

function currentView() {
  if (!watcher.exists() && !store.samples.length) return { empty: true, reason: 'no-log' };
  return computeView(store.samples, { playlist: store.settings.playlist, pendingGames });
}

function pushView() {
  if (win && !win.isDestroyed()) win.webContents.send('overlay:view', currentView());
}

function createWindow() {
  const { x, y } = store.settings;
  const area = screen.getPrimaryDisplay().workArea;
  win = new BrowserWindow({
    width: WIN_W,
    height: WIN_H,
    x: x ?? area.x + area.width - WIN_W - 24,
    y: y ?? area.y + 24,
    frame: false,
    transparent: true,
    resizable: false,
    hasShadow: false,
    show: false, // affichée seulement quand le jeu tourne (voir applyVisibility)
    skipTaskbar: true,
    focusable: false, // ne vole jamais le focus au jeu
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', applyVisibility);
}

// Visible quand le jeu tourne, ou en permanence si l'utilisateur l'a demandé.
function applyVisibility() {
  if (!win || win.isDestroyed()) return;
  const visible = store.settings.alwaysShow || gameActive || forceShow;
  if (visible && !win.isVisible()) win.showInactive();
  else if (!visible && win.isVisible()) win.hide();
}

// Déplacement manuel de la fenêtre (le clic droit reste libre pour le menu).
let dragOrigin = null;
function onDrag(_event, phase, dx, dy) {
  if (!win || win.isDestroyed()) return;
  if (phase === 'start') {
    const [x, y] = win.getPosition();
    dragOrigin = { x, y };
  } else if (phase === 'move' && dragOrigin && Number.isFinite(dx) && Number.isFinite(dy)) {
    win.setPosition(Math.round(dragOrigin.x + dx), Math.round(dragOrigin.y + dy));
  } else if (phase === 'end' && dragOrigin) {
    const [x, y] = win.getPosition();
    store.set({ x, y });
    dragOrigin = null;
  }
}

// Reconstruit à chaque ouverture pour refléter les réglages courants.
function buildMenu() {
  return Menu.buildFromTemplate([
    ...PLAYLISTS.map((p) => ({
      label: p.label,
      type: 'radio',
      checked: store.settings.playlist === p.id,
      click: () => {
        store.set({ playlist: p.id });
        pushView();
      },
    })),
    { type: 'separator' },
    {
      label: 'Toujours afficher',
      type: 'checkbox',
      checked: store.settings.alwaysShow,
      click: (item) => {
        store.set({ alwaysShow: item.checked });
        applyVisibility();
      },
    },
    { type: 'separator' },
    { label: 'Quitter', click: () => app.quit() },
  ]);
}

function showMenu() {
  buildMenu().popup({ window: win });
}

function createTray() {
  tray = new Tray(createTrayIcon());
  tray.setToolTip('Rocket League rank overlay');
  const open = () => tray.popUpContextMenu(buildMenu());
  tray.on('click', open);
  tray.on('right-click', open);
}

app.whenReady().then(() => {
  store = new Store(path.join(app.getPath('userData'), 'overlay-data.json'));
  watcher = new LogWatcher(logDir(app.getPath('documents')));

  // Historique des journaux existants (pour la session en cours et la calibration).
  store.addSamples(watcher.readHistory());

  watcher.on('sample', (sample) => {
    store.addSamples([sample]);
    pendingGames = 0;
    pushView();
  });
  watcher.on('finished', () => {
    pendingGames += 1;
    pushView();
  });
  watcher.on('active', (active) => {
    gameActive = active;
    applyVisibility();
  });
  watcher.start();

  ipcMain.handle('overlay:get-view', () => currentView());
  ipcMain.on('overlay:menu', showMenu);
  ipcMain.on('overlay:drag', onDrag);

  createWindow();
  createTray();
});

app.on('second-instance', () => {
  // Relancer l'appli force l'affichage, même si le jeu est fermé.
  forceShow = true; // temporaire : non enregistré dans les réglages
  applyVisibility();
});

app.on('before-quit', () => {
  if (watcher) watcher.stop();
  if (store) store.flush();
});

app.on('window-all-closed', () => app.quit());
