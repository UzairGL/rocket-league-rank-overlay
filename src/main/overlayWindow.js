const path = require('path');
const { BrowserWindow, screen } = require('electron');

const WIN_W = 470;
const WIN_H = 170;

// Crée la fenêtre de l'overlay : transparente, sans focus, toujours au premier plan, masquée tant
// que le jeu ne tourne pas. Retourne la fenêtre et le gestionnaire de déplacement manuel.
function createOverlayWindow({ store, state }) {
  const { x, y } = store.settings;
  const area = screen.getPrimaryDisplay().workArea;
  const win = new BrowserWindow({
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
      store.set({ x: px, y: py });
      dragOrigin = null;
    }
  }

  return { window: win, onDrag };
}

module.exports = { createOverlayWindow };
