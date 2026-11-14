// Quels relevés appartiennent au joueur ?
//
// Le journal donne le MMR du CHEF de groupe. En solo c'est toujours le joueur. En groupe, c'est
// le sien seulement s'il est chef (`leaderIsMe`, déduit par le lecteur de journal). Par précaution,
// un relevé de groupe est écarté s'il ne prolonge pas la progression du joueur (saut > 50 MMR) :
// ce serait alors plutôt le MMR d'un coéquipier.

const MAX_JUMP = 50;

function isOwn(sample) {
  return sample.partySize <= 1 || sample.leaderIsMe === true;
}

// Retourne les relevés du joueur, triés par date.
function ownSamples(samples) {
  const sorted = [...samples].sort((a, b) => a.ts - b.ts);
  const lastByPlaylist = new Map();
  const out = [];
  for (const s of sorted) {
    if (!isOwn(s)) continue;
    const prev = lastByPlaylist.get(s.playlist);
    if (s.partySize > 1 && prev && Math.abs(s.mmr - prev.mmr) > MAX_JUMP) continue;
    out.push(s);
    lastByPlaylist.set(s.playlist, s);
  }
  return out;
}

const DEFAULT_UNIT = 9; // variation de MMR d'un match, quand on n'a rien mesuré
const MAX_MATCHES = 6;

// Combien de victoires et de défaites explique la variation de MMR entre deux relevés consécutifs ?
//
// Un seul match absorbé : le signe décide. Plusieurs (un résultat en retard, par exemple après un
// forfait, arrive avec le suivant) : on cherche le nombre de victoires dont la somme de variations
// ressemble le plus à la variation observée, avec `unit` comme variation moyenne d'un match.
// Exemple : +9 et −10 arrivés ensemble donnent −1, soit une victoire et une défaite, pas une défaite.
// Retourne null quand le relevé ne dit rien (MMR inchangé, saut de saison).
function settle(previous, current, unit = DEFAULT_UNIT) {
  const delta = current.mmr - previous.mmr;
  if (delta === 0 || Math.abs(delta) > MAX_JUMP) return null;
  // `absorbs` absent ou inconnu (anciens relevés, début de journal) : un match par variation.
  let n = current.absorbs == null ? 1 : current.absorbs;
  if (n <= 0) return null;
  n = Math.min(n, MAX_MATCHES);
  if (n === 1) return delta > 0 ? { w: 1, l: 0, clean: true } : { w: 0, l: 1, clean: true };
  const w = Math.min(n, Math.max(0, Math.round((n + delta / unit) / 2)));
  return { w, l: n - w, clean: false };
}

module.exports = { isOwn, ownSamples, settle, DEFAULT_UNIT };
