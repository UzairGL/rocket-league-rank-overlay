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
// actions : { quit, listDisplays(), moveToDisplay(id|null), web: { urls() }, copy(text), help(), resetSettings() }
function buildMenu(state, actions) {
  const displays = actions.listDisplays();
  const items = PLAYLISTS.map((p) => ({
    label: p.label,
    type: 'radio',
    checked: state.playlist === p.id,
    click: () => state.setPlaylist(p.id),
  }));

  items.push({ type: 'separator' });
  items.push({ label: 'Nouvelle session (remet V et D à zéro)', click: () => state.startNewSession() });
  items.push({ type: 'separator' });
  if (displays.length > 1) {
    items.push({
      label: 'Écran',
      submenu: [
        {
          label: 'Automatique (écran principal)',
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
  items.push({ type: 'separator' });
  items.push({
    label: 'Page web locale',
    type: 'checkbox',
    checked: state.settings.webEnabled,
    click: (item) => state.setWebEnabled(item.checked),
  });
  if (state.settings.webEnabled) {
    items.push({
      label: 'Ouverte au réseau local (téléphone)',
      type: 'checkbox',
      checked: state.settings.webLan,
      click: (item) => state.setWebLan(item.checked),
    });
    for (const url of actions.web.urls()) items.push({ label: `Copier ${url}`, click: () => actions.copy(url) });
  }
  items.push({ type: 'separator' }, { label: 'Overlay invisible ?', click: actions.help });
  items.push({ label: 'Réinitialiser les réglages…', click: actions.resetSettings });
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
