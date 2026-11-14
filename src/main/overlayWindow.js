const path = require('path');
const { BrowserWindow, screen } = require('electron');
const { choosePlacement } = require('./placement');

const WIN_W = 470;
const WIN_H = 170;

// Écrans branchés, dans un format simple pour la logique de placement et le menu.
function listDisplays() {
  const primaryId = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((d, i) => ({
    id: d.id,
    index: i + 1,
    primary: d.id === primaryId,
    workArea: d.workArea,
    size: d.size,
  }));
}

function placementFor(store) {
  return choosePlacement({ displays: listDisplays(), settings: store.settings, width: WIN_W, height: WIN_H });
}

// Crée la fenêtre de l'overlay : transparente, sans focus, toujours au premier plan, masquée tant
// que le jeu ne tourne pas. Retourne la fenêtre et ses commandes (déplacement, choix d'écran).
function createOverlayWindow({ store, state }) {
  const place = placementFor(store);
  const win = new BrowserWindow({
    width: WIN_W,
    height: WIN_H,
    x: place.x,
    y: place.y,
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

  function applyVisibility() {
    if (win.isDestroyed()) return;
    const visible = state.shouldShow();
    if (visible && !win.isVisible()) win.showInactive();
    else if (!visible && win.isVisible()) win.hide();
  }

  win.once('ready-to-show', applyVisibility);
  state.on('visibility', applyVisibility);
  state.on('change', () => {
    if (!win.isDestroyed()) win.webContents.send('overlay:view', state.view());
  });

  // Écran branché ou débranché : on replace la fenêtre si sa position n'est plus valide.
  function replace() {
    if (win.isDestroyed()) return;
    const p = placementFor(store);
    win.setPosition(p.x, p.y);
  }
  screen.on('display-added', replace);
  screen.on('display-removed', replace);
  screen.on('display-metrics-changed', replace);
  win.on('closed', () => {
    screen.removeListener('display-added', replace);
    screen.removeListener('display-removed', replace);
    screen.removeListener('display-metrics-changed', replace);
  });

  // Choix d'écran dans le menu (null = automatique) : on repart d'un placement en haut à droite.
  function moveToDisplay(displayId) {
    store.set({ displayId, x: null, y: null });
    replace();
  }

  // Déplacement manuel (le clic droit reste libre pour le menu).
  let dragOrigin = null;
  function onDrag(_event, phase, dx, dy) {
    if (win.isDestroyed()) return;
    if (phase === 'start') {
      const [px, py] = win.getPosition();
      dragOrigin = { x: px, y: py };
    } else if (phase === 'move' && dragOrigin && Number.isFinite(dx) && Number.isFinite(dy)) {
      win.setPosition(Math.round(dragOrigin.x + dx), Math.round(dragOrigin.y + dy));
    } else if (phase === 'end' && dragOrigin) {
      const [px, py] = win.getPosition();
      store.set({ x: px, y: py, displayId: screen.getDisplayMatching(win.getBounds()).id });
      dragOrigin = null;
    }
  }

  return { window: win, onDrag, moveToDisplay, listDisplays };
}

module.exports = { createOverlayWindow, listDisplays };
