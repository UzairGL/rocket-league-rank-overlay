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

module.exports = { isOwn, ownSamples };
