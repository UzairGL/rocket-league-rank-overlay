const { Menu, Tray } = require('electron');
const { createTrayIcon } = require('./trayIcon');

const PLAYLISTS = [
  { id: 10, label: '1v1 classé' },
  { id: 11, label: '2v2 classé' },
  { id: 13, label: '3v3 classé' },
];

// Reconstruit à chaque ouverture pour refléter les réglages courants.
function buildMenu(state, quit) {
  return Menu.buildFromTemplate([
    ...PLAYLISTS.map((p) => ({
      label: p.label,
      type: 'radio',
      checked: state.playlist === p.id,
      click: () => state.setPlaylist(p.id),
    })),
    { type: 'separator' },
    {
      label: 'Toujours afficher',
      type: 'checkbox',
      checked: state.alwaysShow,
      click: (item) => state.setAlwaysShow(item.checked),
    },
    { type: 'separator' },
    { label: 'Quitter', click: quit },
  ]);
}

// Menu contextuel ouvert par un clic droit sur la fenêtre.
function popupMenu(state, window, quit) {
  buildMenu(state, quit).popup({ window });
}

// Icône de la zone de notification : le seul moyen de piloter l'overlay quand il est masqué.
function createTray(state, quit) {
  const tray = new Tray(createTrayIcon());
  tray.setToolTip('Rocket League rank overlay');
  const open = () => tray.popUpContextMenu(buildMenu(state, quit));
  tray.on('click', open);
  tray.on('right-click', open);
  return tray;
}

module.exports = { PLAYLISTS, buildMenu, popupMenu, createTray };
