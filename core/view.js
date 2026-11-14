// Transforme l'historique des relevés en modèle d'affichage.
const { locate, tableFor } = require('./ranks');
const { calibrate } = require('./calibration');
const { ownSamples, settle } = require('./samples');

const SESSION_GAP_MS = 3 * 60 * 60 * 1000; // une pause > 3 h ouvre une nouvelle session
const DEFAULT_GAIN = 9;

// sessionStart : horodatage (ms) de la dernière remise à zéro de la session ; les relevés antérieurs
// ne comptent pas dans les victoires/défaites de la session.
function computeView(allSamples, { playlist = 11, pendingGames = 0, sessionStart = 0 } = {}) {
  const inPlaylist = allSamples.filter((s) => s.playlist === playlist).sort((a, b) => a.ts - b.ts);
  // Seuls les relevés du joueur comptent : solo, ou groupe dont il est le chef.
  const samples = ownSamples(inPlaylist);
  if (!samples.length) return { empty: true, playlist };

  const latest = samples[samples.length - 1];
  // La dernière file était-elle celle d'un autre chef de groupe (donc non comptée) ?
  const foreignLatest = !samples.includes(inPlaylist[inPlaylist.length - 1]);

  // Session = série finale sans pause > 3 h, et jamais avant la remise à zéro (manuelle ou au lancement du jeu)
  let start = samples.length - 1;
  while (start > 0 && samples[start].ts - samples[start - 1].ts <= SESSION_GAP_MS) start--;
  const run = samples.slice(start).filter((s) => s.ts >= sessionStart);

  // Variation moyenne d'un match, mesurée sur les résultats « propres » (un seul match par relevé),
  // pour répartir victoires et défaites quand plusieurs résultats arrivent ensemble.
  const recent = samples.slice(-40);
  const gains = [], losses = [];
  for (let i = 1; i < recent.length; i++) {
    const r = settle(recent[i - 1], recent[i]);
    if (!r || !r.clean) continue;
    (r.w ? gains : losses).push(Math.abs(recent[i].mmr - recent[i - 1].mmr));
  }
  const avg = (a, def) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : def);
  const avgGain = avg(gains, DEFAULT_GAIN);
  const avgLoss = avg(losses, DEFAULT_GAIN);
  const unit = avg([...gains, ...losses], DEFAULT_GAIN);

  const tally = (list) => {
    let w = 0, l = 0;
    for (let i = 1; i < list.length; i++) {
      const r = settle(list[i - 1], list[i], unit);
      if (!r) continue;
      w += r.w;
      l += r.l;
    }
    return { w, l };
  };
  // Juste après une remise à zéro, aucun relevé n'est encore arrivé : 0 victoire, 0 défaite.
  const session = run.length
    ? { ...tally(run), net: latest.mmr - run[0].mmr, startMmr: run[0].mmr }
    : { w: 0, l: 0, net: 0, startMmr: latest.mmr };

  const { table, specific } = tableFor(playlist);
  const loc = locate(latest.mmr, latest.tier, table);

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
    // `specific` = false : la playlist n'a pas de table propre, les divisions sont estimées avec celle du 2v2.
    thresholds: { specific, season: table.meta.season, updated: table.meta.updated },
    inParty: latest.partySize > 1,
    foreignLatest,
    pendingGames,
    updated: latest.time,
  };
}

module.exports = { computeView };
