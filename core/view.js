// Transforme l'historique des relevés en modèle d'affichage.
const { locate } = require('./ranks');
const { calibrate } = require('./calibration');

const SESSION_GAP_MS = 3 * 60 * 60 * 1000; // une pause > 3 h ouvre une nouvelle session
const MAX_DELTA = 50; // au-delà : reset de saison / recalibrage, pas un match
const DEFAULT_GAIN = 9;

function computeView(allSamples, { playlist = 11, pendingGames = 0 } = {}) {
  const samples = allSamples.filter((s) => s.playlist === playlist).sort((a, b) => a.ts - b.ts);
  if (!samples.length) return { empty: true, playlist };

  const latest = samples[samples.length - 1];

  // Session = série finale sans pause > 3 h
  let start = samples.length - 1;
  while (start > 0 && samples[start].ts - samples[start - 1].ts <= SESSION_GAP_MS) start--;
  const run = samples.slice(start);

  const tally = (list) => {
    let w = 0, l = 0;
    for (let i = 1; i < list.length; i++) {
      if (list[i].partySize > 1 || list[i - 1].partySize > 1) continue; // MMR du chef de groupe : non fiable
      const d = list[i].mmr - list[i - 1].mmr;
      if (d === 0 || Math.abs(d) > MAX_DELTA) continue;
      if (d > 0) w++; else l++;
    }
    return { w, l };
  };
  const session = { ...tally(run), net: latest.mmr - run[0].mmr, startMmr: run[0].mmr };

  // Gain moyen par victoire / perte moyenne sur les 40 derniers relevés
  const recent = samples.slice(-40);
  const gains = [], losses = [];
  for (let i = 1; i < recent.length; i++) {
    if (recent[i].partySize > 1 || recent[i - 1].partySize > 1) continue;
    const d = recent[i].mmr - recent[i - 1].mmr;
    if (d === 0 || Math.abs(d) > MAX_DELTA) continue;
    (d > 0 ? gains : losses).push(Math.abs(d));
  }
  const avg = (a, def) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : def);
  const avgGain = avg(gains, DEFAULT_GAIN);
  const avgLoss = avg(losses, DEFAULT_GAIN);

  const loc = locate(latest.mmr, latest.tier);

  // Seuils réels de changement de tier (hystérésis). Le tier du journal fait foi.
  const cal = calibrate(samples);
  const upCal = cal.up[loc.tier];
  const downCal = cal.down[loc.tier - 1];
  const promoAt = upCal ? upCal.hi : loc.next ? loc.next.min : null; // atteint => montée
  const promoKnown = !!upCal;
  const demoAt = downCal ? downCal.lo : null; // atteint (ou en dessous) => descente
  const demoKnown = !!downCal;
  const lastDiv = loc.division === 4;
  const firstDiv = loc.division === 1;
  let toUp = loc.toUp, toDown = loc.toDown, nextLabel = loc.next && loc.next.label;
  let zone = null;
  if (lastDiv && promoAt != null) {
    toUp = Math.max(0, promoAt - latest.mmr);
    if (loc.next) nextLabel = loc.next.label;
    if (latest.mmr >= promoAt) zone = 'promotion';
  }
  const edge = demoAt != null ? demoAt : loc.min - 10; // estimation si jamais observé
  if (firstDiv && loc.prev) {
    toDown = Math.max(1, latest.mmr - edge);
    if (latest.mmr < loc.min) zone = 'maintien'; // sous le seuil de montée, mais encore dans le tier
  }

  // Remplissage des 4 segments (une division par segment) pour la barre d'affichage.
  let segments = null;
  if (loc.division) {
    const idx = loc.division - 1;
    const lo = zone === 'maintien' ? edge : loc.min;
    const hi = lastDiv ? promoAt : loc.next ? loc.next.min : null;
    let frac = hi != null && hi > lo ? (latest.mmr - lo) / (hi - lo) : 1;
    frac = zone === 'promotion' ? 1 : Math.min(1, Math.max(0, frac));
    segments = [0, 1, 2, 3].map((k) => (k < idx ? 1 : k === idx ? frac : 0));
  }

  return {
    empty: false,
    playlist,
    mmr: latest.mmr,
    tier: loc.tier,
    tierName: loc.tierName,
    division: loc.divisionLabel,
    family: loc.family,
    mismatch: loc.mismatch,
    next: loc.next && { label: loc.next.label, min: loc.next.min },
    prev: loc.prev && { label: loc.prev.label, min: loc.prev.min },
    floor: loc.min,
    toUp,
    toDown,
    zone,
    segments,
    edgeKnown: { promo: promoKnown, demo: demoKnown },
    winsToUp: toUp != null ? Math.ceil(toUp / avgGain) : null,
    lossesToDown: toDown != null ? Math.ceil(toDown / avgLoss) : null,
    avgGain: Math.round(avgGain * 10) / 10,
    avgLoss: Math.round(avgLoss * 10) / 10,
    session,
    history: samples.slice(-30).map((s) => s.mmr),
    solo: latest.partySize <= 1,
    pendingGames,
    updated: latest.time,
  };
}

module.exports = { computeView };
