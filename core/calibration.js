// Calibration des seuils de montée / descente de tier à partir des relevés réels.
//
// Le jeu applique une hystérésis : on monte de tier en atteignant un seuil P, mais on ne
// redescend que sous un seuil D plus bas (D < P). Dans la zone ]D, P[, le tier dépend donc de la
// direction d'où l'on vient. Le tier est lu dans le journal à chaque relevé : il fait foi.
//
// Pour la frontière entre le tier t et t+1 (rangs 1..22) :
//   Montée   : P ∈ ] max(MMR vus en tier t), min(MMR de la 1re apparition en tier t+1) ]
//   Descente : D ∈ [ max(MMR de la 1re apparition en tier t après t+1), min(MMR vus en t+1) [
// Ces intervalles se resserrent à chaque franchissement observé.

const MAX_JUMP = 50; // au-delà : reset de saison, on ignore

function calibrate(samples) {
  const s = samples.filter((x) => x.partySize <= 1).sort((a, b) => a.ts - b.ts);
  const seenMin = {}; // tier -> MMR minimal vu
  const seenMax = {}; // tier -> MMR maximal vu
  const up = {}; // t -> { lo, hi }   (frontière t -> t+1)
  const down = {}; // t -> { lo, hi }

  for (const x of s) {
    seenMin[x.tier] = Math.min(seenMin[x.tier] ?? Infinity, x.mmr);
    seenMax[x.tier] = Math.max(seenMax[x.tier] ?? -Infinity, x.mmr);
  }

  for (let i = 1; i < s.length; i++) {
    const a = s[i - 1], b = s[i];
    if (a.playlist !== b.playlist || a.tier === b.tier) continue;
    if (Math.abs(b.mmr - a.mmr) > MAX_JUMP) continue;
    if (b.tier === a.tier + 1) {
      const u = (up[a.tier] ??= { hi: Infinity });
      u.hi = Math.min(u.hi, b.mmr);
    } else if (b.tier === a.tier - 1) {
      const d = (down[b.tier] ??= { lo: -Infinity });
      d.lo = Math.max(d.lo, b.mmr);
    }
  }

  const out = { up: {}, down: {} };
  for (const t of Object.keys(up)) {
    const lo = seenMax[t] ?? -Infinity;
    out.up[t] = { lo: lo === -Infinity ? null : lo + 1, hi: up[t].hi };
  }
  for (const t of Object.keys(down)) {
    const hiBound = seenMin[+t + 1];
    out.down[t] = { lo: down[t].lo, hi: hiBound === undefined ? null : hiBound - 1 };
  }
  return out;
}

module.exports = { calibrate };
