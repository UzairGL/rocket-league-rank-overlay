// Localisation d'un MMR dans les rangs. La table des seuils vit dans `data/ranks/*.json`
// (une par playlist) : la mettre à jour ne demande pas de toucher au code.
//
// Chaque entrée de la table = MMR minimum observé de la division. Ce sont des plages observées,
// pas des seuils officiels : une valeur située dans un « trou » entre deux divisions est rattachée
// à la division inférieure. Les bornes sont donc approximatives (±10 MMR environ).

const doubles = require('../data/ranks/doubles.json');

const ROMAN = ['I', 'II', 'III', 'IV'];
const TIER_COUNT = 22; // Bronze I ... Supersonic Legend

// Vérifie le format d'un fichier de seuils. Retourne la liste des problèmes (vide = valide).
function validateRanksData(data) {
  const errors = [];
  if (!data || !Array.isArray(data.tiers)) return ['`tiers` doit être un tableau'];
  if (data.tiers.length !== TIER_COUNT) errors.push(`${TIER_COUNT} tiers attendus, ${data.tiers.length} trouvés`);
  let previous = -Infinity;
  data.tiers.forEach((tier, i) => {
    const expected = i === TIER_COUNT - 1 ? 1 : 4;
    if (!tier.name) errors.push(`tier ${i + 1} : nom manquant`);
    if (!Array.isArray(tier.divisions) || tier.divisions.length !== expected) {
      errors.push(`tier ${i + 1} (${tier.name}) : ${expected} divisions attendues`);
      return;
    }
    for (const min of tier.divisions) {
      if (!Number.isFinite(min)) errors.push(`tier ${i + 1} (${tier.name}) : valeur non numérique`);
      else if (min <= previous) errors.push(`tier ${i + 1} (${tier.name}) : seuils non croissants (${min} <= ${previous})`);
      else previous = min;
    }
  });
  return errors;
}

// Transforme un fichier de seuils en table prête à interroger.
function buildTable(data) {
  const errors = validateRanksData(data);
  if (errors.length) throw new Error(`Table de rangs invalide : ${errors.join(' ; ')}`);
  const steps = [];
  data.tiers.forEach((tier, i) => {
    tier.divisions.forEach((min, d) => steps.push({ tier: i + 1, tierName: tier.name, division: d + 1, min }));
  });
  return {
    meta: { playlist: data.playlist, name: data.name, season: data.season, updated: data.updated, source: data.source },
    steps,
  };
}

const TABLES = new Map([[doubles.playlist, buildTable(doubles)]]);
const DEFAULT_TABLE = TABLES.get(11);

// Table d'une playlist. Sans table propre (1v1, 3v3), on retombe sur celle du 2v2 : `specific` vaut
// alors false et l'affichage doit signaler que les divisions sont estimées.
function tableFor(playlist) {
  const own = TABLES.get(playlist);
  return own ? { table: own, specific: true } : { table: DEFAULT_TABLE, specific: false };
}

function family(tier) {
  if (tier <= 3) return 'bronze';
  if (tier <= 6) return 'silver';
  if (tier <= 9) return 'gold';
  if (tier <= 12) return 'platinum';
  if (tier <= 15) return 'diamond';
  if (tier <= 18) return 'champion';
  if (tier <= 21) return 'grandchampion';
  return 'ssl';
}

// Positionne un MMR. `tierHint` = tier lu dans le journal (fait foi quand il diffère de la table).
function locate(mmr, tierHint, table = DEFAULT_TABLE) {
  const STEPS = table.steps;
  let idx = -1;
  for (let i = 0; i < STEPS.length; i++) if (mmr >= STEPS[i].min) idx = i;
  if (idx < 0) idx = 0;
  let mismatch = false;
  if (tierHint && STEPS[idx].tier !== tierHint) {
    mismatch = true;
    const inTier = STEPS.map((s, i) => [s, i]).filter(([s]) => s.tier === tierHint);
    if (inTier.length) {
      // Au-dessus de la table => dernière division du tier ; en dessous => première.
      idx = STEPS[idx].tier > tierHint ? inTier[inTier.length - 1][1] : inTier[0][1];
    }
  }
  const cur = STEPS[idx];
  const next = STEPS[idx + 1] || null;
  const prev = STEPS[idx - 1] || null;
  const isSsl = cur.tier === TIER_COUNT;
  return {
    tier: cur.tier,
    tierName: cur.tierName,
    division: isSsl ? null : cur.division,
    divisionLabel: isSsl ? '' : ROMAN[cur.division - 1],
    family: family(cur.tier),
    min: cur.min,
    next: next && {
      tier: next.tier,
      tierName: next.tierName,
      division: next.division,
      label: next.tier === TIER_COUNT ? next.tierName : `${next.tierName} · ${ROMAN[next.division - 1]}`,
      min: next.min,
    },
    prev: prev && {
      tierName: prev.tierName,
      division: prev.division,
      label: `${prev.tierName} · ${ROMAN[prev.division - 1]}`,
      min: prev.min,
    },
    toUp: next ? Math.max(0, next.min - mmr) : null,
    toDown: prev ? Math.max(0, mmr - cur.min + 1) : null,
    mismatch,
  };
}

module.exports = {
  STEPS: DEFAULT_TABLE.steps,
  ROMAN,
  locate,
  family,
  buildTable,
  tableFor,
  validateRanksData,
};
