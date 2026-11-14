const { Menu, Tray } = require('electron');
const { createTrayIcon } = require('./trayIcon');

const PLAYLISTS = [
  { id: 10, label: '1v1 classé' },
  { id: 11, label: '2v2 classé' },
  { id: 13, label: '3v3 classé' },
];

function displayLabel(d) {
  return `Écran ${d.index}${d.primary ? ' (principal)' : ''}, ${d.size.width}×${d.size.height}`;
}

// Reconstruit à chaque ouverture pour refléter les réglages courants.
// actions : { quit, listDisplays(), moveToDisplay(id|null) }
function buildMenu(state, actions) {
  const displays = actions.listDisplays();
  const items = PLAYLISTS.map((p) => ({
    label: p.label,
    type: 'radio',
    checked: state.playlist === p.id,
    click: () => state.setPlaylist(p.id),
  }));

  items.push({ type: 'separator' });
  if (displays.length > 1) {
    items.push({
      label: 'Écran',
      submenu: [
        {
          label: 'Automatique (écran secondaire)',
          type: 'radio',
          checked: state.settings.displayId == null,
          click: () => actions.moveToDisplay(null),
        },
        ...displays.map((d) => ({
          label: displayLabel(d),
          type: 'radio',
          checked: state.settings.displayId === d.id,
          click: () => actions.moveToDisplay(d.id),
        })),
      ],
    });
  }
  items.push({
    label: 'Toujours afficher',
    type: 'checkbox',
    checked: state.alwaysShow,
    click: (item) => state.setAlwaysShow(item.checked),
  });
  items.push({ type: 'separator' }, { label: 'Quitter', click: actions.quit });
  return Menu.buildFromTemplate(items);
}

// Menu contextuel ouvert par un clic droit sur la fenêtre.
function popupMenu(state, window, actions) {
  buildMenu(state, actions).popup({ window });
}

// Icône de la zone de notification : le seul moyen de piloter l'overlay quand il est masqué.
function createTray(state, actions) {
  const tray = new Tray(createTrayIcon());
  tray.setToolTip('Rocket League rank overlay');
  const open = () => tray.popUpContextMenu(buildMenu(state, actions));
  tray.on('click', open);
  tray.on('right-click', open);
  return tray;
}

module.exports = { PLAYLISTS, buildMenu, popupMenu, createTray };
