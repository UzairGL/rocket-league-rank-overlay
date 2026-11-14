// Icône de la zone de notification, dessinée en code : un parallélogramme bleu et orange, comme
// le tableau d'affichage. Aucun fichier image à embarquer.

const BLUE = [0x1b, 0x5f, 0xb4];
const ORANGE = [0xff, 0x8a, 0x1f];

// Pixels BGRA (ordre attendu par Electron sur Windows), `size` x `size`.
function iconPixels(size = 32) {
  const buf = Buffer.alloc(size * size * 4); // transparent par défaut
  const top = Math.round(size * 0.28);
  const bottom = Math.round(size * 0.72);
  const slant = size * 0.18; // décalage horizontal entre le haut et le bas
  const left = size * 0.12;
  const right = size * 0.88;
  const middle = (left + right) / 2;

  for (let y = top; y < bottom; y++) {
    const shift = slant * (1 - (y - top) / (bottom - top - 1)); // incliné vers la droite en haut
    for (let x = 0; x < size; x++) {
      const xs = x - shift;
      if (xs < left || xs >= right) continue;
      const [r, g, b] = xs < middle ? BLUE : ORANGE;
      const i = (y * size + x) * 4;
      buf[i] = b;
      buf[i + 1] = g;
      buf[i + 2] = r;
      buf[i + 3] = 255;
    }
  }
  return buf;
}

function createTrayIcon(size = 32) {
  const { nativeImage } = require('electron');
  return nativeImage.createFromBitmap(iconPixels(size), { width: size, height: size });
}

module.exports = { iconPixels, createTrayIcon };
