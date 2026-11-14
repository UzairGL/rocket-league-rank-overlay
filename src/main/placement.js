// Où poser la fenêtre ? Fonction pure (les écrans lui sont passés), donc testable sans Electron.
//
// Règles :
//  1. Une position enregistrée (glissée par l'utilisateur) est reprise tant que la fenêtre y tient
//     entièrement sur un écran encore branché.
//  2. Sinon : l'écran choisi dans le menu, s'il existe encore.
//  3. Sinon, par défaut : l'écran principal, où se trouve en général le jeu. L'overlay s'y affiche
//     bien par-dessus (mesuré), et il se remet au premier plan tout seul.
// Dans tous les cas la fenêtre est posée en haut à droite de l'écran retenu.

const MARGIN = 24;

function fits(rect, area) {
  return (
    rect.x >= area.x &&
    rect.y >= area.y &&
    rect.x + rect.width <= area.x + area.width &&
    rect.y + rect.height <= area.y + area.height
  );
}

function topRight(area, width) {
  return { x: area.x + area.width - width - MARGIN, y: area.y + MARGIN };
}

// displays : [{ id, primary, workArea: { x, y, width, height } }]
function choosePlacement({ displays, settings = {}, width, height }) {
  if (!displays.length) return { x: 0, y: 0, displayId: null };

  if (Number.isFinite(settings.x) && Number.isFinite(settings.y)) {
    const rect = { x: settings.x, y: settings.y, width, height };
    const home = displays.find((d) => fits(rect, d.workArea));
    if (home) return { x: settings.x, y: settings.y, displayId: home.id };
  }

  const wanted = settings.displayId != null ? displays.find((d) => d.id === settings.displayId) : null;
  const target = wanted || displays.find((d) => d.primary) || displays[0];
  return { ...topRight(target.workArea, width), displayId: target.id };
}

module.exports = { choosePlacement, fits, MARGIN };
