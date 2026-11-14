// Génère une capture de l'interface réelle (même HTML/CSS/JS que l'appli) à partir de vrais journaux.
//
//   npx electron scripts/screenshot.js [dossier-des-journaux] [fichier-de-sortie.png]
//
// Ce n'est pas une capture d'écran du jeu : l'interface est rendue seule, sur un fond sombre,
// avec le modèle d'affichage calculé depuis les relevés du journal.
const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, ipcMain } = require('electron');
const { computeView } = require('../core/view');
const { LogWatcher } = require('../src/main/logWatcher');
const { logDir } = require('../src/main/paths');

app.disableHardwareAcceleration();

const ZOOM = 2; // rendu en double résolution pour une image nette
const WIDTH = 470;
const HEIGHT = 124;
const BACKDROP = '#0d1626';

app.whenReady().then(async () => {
  const dir = process.argv[2] || logDir(app.getPath('documents'));
  const out = path.resolve(process.argv[3] || path.join(__dirname, '..', 'docs', 'overlay.png'));

  const samples = new LogWatcher(dir).readHistory();
  const view = computeView(samples, { playlist: 11 });
  if (view.empty) {
    console.error(`Aucun relevé 2v2 trouvé dans ${dir}`);
    app.exit(1);
    return;
  }
  ipcMain.handle('shot:view', () => view);

  const win = new BrowserWindow({
    width: WIDTH * ZOOM,
    height: HEIGHT * ZOOM,
    useContentSize: true,
    show: false,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'screenshot-preload.js'),
      contextIsolation: true,
      sandbox: true,
    },
  });
  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await win.webContents.insertCSS(`html, body { background: ${BACKDROP} !important; }`);
  win.webContents.setZoomFactor(ZOOM);
  await new Promise((resolve) => setTimeout(resolve, 1500)); // laisse finir les transitions

  const image = await win.webContents.capturePage();
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, image.toPNG());
  const { width, height } = image.getSize();
  console.log(`Capture écrite : ${out} (${width}x${height})`);
  app.exit(0);
});
