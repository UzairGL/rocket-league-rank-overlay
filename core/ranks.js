// Table des rangs 2v2 (Doubles) — source : distribution Tracker Network fournie par l'utilisateur.
// Chaque entrée = MMR minimum observé de la division. Ce sont des plages observées, pas des
// seuils officiels : les valeurs situées dans les "trous" entre deux divisions sont rattachées
// à la division inférieure. Les bornes sont donc approximatives (±10 MMR environ).

const TIERS = [
  ['Bronze I', [-100, 120, 138, 157]],
  ['Bronze II', [170, 179, 198, 217]],
  ['Bronze III', [229, 239, 258, 277]],
  ['Silver I', [294, 299, 318, 337]],
  ['Silver II', [353, 359, 378, 397]],
  ['Silver III', [413, 419, 438, 457]],
  ['Gold I', [472, 479, 498, 517]],
  ['Gold II', [533, 539, 558, 577]],
  ['Gold III', [593, 599, 618, 637]],
  ['Platinum I', [641, 659, 678, 697]],
  ['Platinum II', [711, 719, 738, 757]],
  ['Platinum III', [772, 779, 798, 817]],
  ['Diamond I', [835, 844, 868, 892]],
  ['Diamond II', [915, 924, 948, 972]],
  ['Diamond III', [995, 1004, 1028, 1052]],
  ['Champion I', [1075, 1095, 1128, 1162]],
  ['Champion II', [1195, 1214, 1248, 1282]],
  ['Champion III', [1315, 1334, 1368, 1402]],
  ['Grand Champion I', [1435, 1462, 1498, 1537]],
  ['Grand Champion II', [1575, 1602, 1644, 1677]],
  ['Grand Champion III', [1715, 1744, 1788, 1832]],
  ['Supersonic Legend', [1861]],
];

const ROMAN = ['I', 'II', 'III', 'IV'];

// Liste plate ordonnée : { tier (1..22), division (1..4), min }
const STEPS = [];
TIERS.forEach(([name, mins], i) => {
  mins.forEach((min, d) => STEPS.push({ tier: i + 1, tierName: name, division: d + 1, min }));
});

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
function locate(mmr, tierHint) {
  let idx = -1;
  for (let i = 0; i < STEPS.length; i++) if (mmr >= STEPS[i].min) idx = i;
  if (idx < 0) idx = 0;
  let mismatch = false;
  if (tierHint && STEPS[idx].tier !== tierHint) {
    mismatch = true;
    const inTier = STEPS.map((s, i) => [s, i]).filter(([s]) => s.tier === tierHint);
    if (inTier.length) {
      // Au-dessus de la table => dernière division du tier ; en dessous => première.
      idx = mmr >= STEPS[idx].min && STEPS[idx].tier > tierHint ? inTier[inTier.length - 1][1] : inTier[0][1];
    }
  }
  const cur = STEPS[idx];
  const next = STEPS[idx + 1] || null;
  const isSsl = cur.tier === 22;
  return {
    tier: cur.tier,
    tierName: cur.tierName,
    division: isSsl ? null : cur.division,
    divisionLabel: isSsl ? '' : ROMAN[cur.division - 1],
    family: family(cur.tier),
    min: cur.min,
    next: next && { tier: next.tier, tierName: next.tierName, division: next.division, label: next.tier === 22 ? next.tierName : `${next.tierName} · ${ROMAN[next.division - 1]}`, min: next.min },
    prev: STEPS[idx - 1]
      ? { tierName: STEPS[idx - 1].tierName, division: STEPS[idx - 1].division, label: `${STEPS[idx - 1].tierName} · ${ROMAN[STEPS[idx - 1].division - 1]}`, min: STEPS[idx - 1].min }
      : null,
    toUp: next ? Math.max(0, next.min - mmr) : null,
    toDown: STEPS[idx - 1] ? Math.max(0, mmr - cur.min + 1) : null,
    mismatch,
  };
}

module.exports = { TIERS, STEPS, ROMAN, locate, family };
