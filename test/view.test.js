const test = require('node:test');
const assert = require('node:assert/strict');
const { computeView } = require('../core/view');
const { sample } = require('./helpers');

const view = (samples, opts) => computeView(samples, { playlist: 11, ...opts });

test('vide quand aucun relevé n\'existe pour la playlist', () => {
  assert.equal(view([]).empty, true);
  assert.equal(view([sample(1100, 16, 0, { playlist: 13 })]).empty, true);
});

test('victoires, défaites et net de session d\'après les vraies variations', () => {
  const v = view([sample(1100, 16, 0), sample(1109, 16, 10), sample(1100, 16, 20), sample(1111, 16, 30), sample(1111, 16, 40)]);
  assert.equal(v.session.w, 2);
  assert.equal(v.session.l, 1);
  assert.equal(v.session.net, 11);
  assert.equal(v.mmr, 1111);
});

test('les gains ne sont pas supposés fixes : la moyenne vient des relevés', () => {
  const v = view([sample(1100, 16, 0), sample(1107, 16, 10), sample(1120, 16, 20), sample(1111, 16, 30)]);
  assert.equal(v.avgGain, 10); // (7 + 13) / 2
  assert.equal(v.avgLoss, 9);
});

test('ignore les sauts de plus de 50 MMR dans les victoires et défaites', () => {
  const v = view([sample(1100, 16, 0), sample(1200, 17, 10)]);
  assert.equal(v.session.w + v.session.l, 0);
});

test("un groupe dont le chef n'est pas le joueur n'est pas compté", () => {
  const v = view([sample(1100, 16, 0), sample(1109, 16, 10, { partySize: 2, leaderIsMe: false })]);
  assert.equal(v.session.w + v.session.l, 0);
  assert.equal(v.mmr, 1100); // le MMR d'un autre joueur n'est jamais affiché
  assert.equal(v.foreignLatest, true);
});

test('un groupe dont le joueur est le chef est compté comme une file normale', () => {
  const v = view([
    sample(1102, 16, 0),
    sample(1112, 16, 10, { partySize: 2, leaderIsMe: true }),
    sample(1102, 16, 20, { partySize: 2, leaderIsMe: true }),
    sample(1112, 16, 30, { partySize: 2, leaderIsMe: true }),
  ]);
  assert.equal(v.mmr, 1112);
  assert.equal(v.session.w, 2);
  assert.equal(v.session.l, 1);
  assert.equal(v.inParty, true);
  assert.equal(v.foreignLatest, false);
});

test("un relevé de groupe qui ne prolonge pas la progression est écarté, même si le joueur est chef", () => {
  const v = view([sample(1100, 16, 0), sample(1300, 18, 10, { partySize: 2, leaderIsMe: true })]);
  assert.equal(v.mmr, 1100);
  assert.equal(v.foreignLatest, true);
});

test('une pause de plus de 3 h ouvre une nouvelle session', () => {
  const v = view([sample(1100, 16, 0), sample(1109, 16, 10), sample(1118, 16, 400), sample(1109, 16, 410)]);
  assert.equal(v.session.w, 0);
  assert.equal(v.session.l, 1);
  assert.equal(v.session.startMmr, 1118);
});

test('segments : 1148 en Champion I division III', () => {
  const v = view([sample(1148, 16, 0)]);
  assert.equal(v.division, 'III');
  assert.equal(v.segments[0], 1);
  assert.equal(v.segments[1], 1);
  assert.ok(Math.abs(v.segments[2] - 20 / 34) < 1e-9);
  assert.equal(v.segments[3], 0);
  assert.equal(v.toUp, 14);
  assert.equal(v.toDown, 21);
});

test('zone de maintien : encore Champion I sous le seuil de montée', () => {
  const v = view([sample(1066, 16, 0)]);
  assert.equal(v.tierName, 'Champion I');
  assert.equal(v.division, 'I');
  assert.equal(v.zone, 'maintien');
  assert.ok(v.toDown >= 1);
});

test('montée en attente : tier du journal inférieur mais MMR au-dessus du seuil', () => {
  const v = view([sample(1080, 15, 0)]);
  assert.equal(v.tierName, 'Diamond III');
  assert.equal(v.division, 'IV');
  assert.equal(v.zone, 'promotion');
  assert.equal(v.toUp, 0);
  assert.deepEqual(v.segments, [1, 1, 1, 1]);
});

test('la calibration remplace l\'estimation de la table', () => {
  const history = [sample(1066, 16, 0), sample(1057, 15, 10), sample(1066, 15, 20), sample(1075, 16, 30), sample(1066, 16, 40)];
  const v = view(history);
  assert.equal(v.edgeKnown.demo, true);
  assert.equal(v.toDown, 9); // 1066 - 1057
});

test('Supersonic Legend : pas de segments ni de montée', () => {
  const v = view([sample(1900, 22, 0)]);
  assert.equal(v.segments, null);
  assert.equal(v.toUp, null);
});

test('les messages en attente sont transmis', () => {
  assert.equal(view([sample(1100, 16, 0)], { pendingGames: 2 }).pendingGames, 2);
});

test('signale quand les divisions sont estimées avec la table du 2v2', () => {
  assert.equal(view([sample(1148, 16, 0)]).thresholds.specific, true);
  const v = view([sample(1148, 16, 0, { playlist: 13 })], { playlist: 13 });
  assert.equal(v.thresholds.specific, false);
  assert.equal(v.tierName, 'Champion I'); // le tier vient du journal
});

// --- Remise à zéro de la session -----------------------------------------------------------------

test('la session ne compte que les relevés postérieurs à la remise à zéro', () => {
  const list = [sample(1100, 16, 0), sample(1109, 16, 10), sample(1118, 16, 20), sample(1109, 16, 30)];
  const sessionStart = sample(0, 0, 15).ts; // remise à zéro entre le 2e et le 3e relevé
  const v = view(list, { sessionStart });
  assert.equal(v.session.w, 0); // 1118 est la base de la session : son propre gain est antérieur à la remise à zéro
  assert.equal(v.session.l, 1);
  assert.equal(v.session.startMmr, 1118);
  assert.equal(v.session.net, -9);
});

test('juste après la remise à zéro : 0 victoire, 0 défaite, le rang et le MMR restent', () => {
  const list = [sample(1100, 16, 0), sample(1109, 16, 10), sample(1148, 16, 20)];
  const v = view(list, { sessionStart: sample(0, 0, 25).ts });
  assert.deepEqual(v.session, { w: 0, l: 0, net: 0, startMmr: 1148 });
  assert.equal(v.mmr, 1148);
  assert.equal(v.tierName, 'Champion I');
});

test("sans remise à zéro (valeur par défaut), la session est celle d'avant", () => {
  const list = [sample(1100, 16, 0), sample(1109, 16, 10), sample(1100, 16, 20)];
  const v = view(list);
  assert.equal(v.session.w, 1);
  assert.equal(v.session.l, 1);
});

// --- Résultats en retard (forfait) ---------------------------------------------------------------------------

test('session : un forfait dont le résultat arrive avec le match suivant compte une victoire et une défaite', () => {
  const list = [
    { ...sample(1139, 16, 0), absorbs: null }, // premier relevé du journal
    { ...sample(1139, 16, 10), absorbs: 0, pendingAfter: 1 }, // forfait : MMR inchangé, résultat en attente
    { ...sample(1138, 16, 20), absorbs: 2, pendingAfter: 0 }, // les deux résultats arrivent : -10 puis +9
    { ...sample(1148, 16, 30), absorbs: 1, pendingAfter: 0 }, // une victoire
  ];
  const v = view(list);
  assert.equal(v.session.w, 2);
  assert.equal(v.session.l, 1);
  assert.equal(v.session.net, 9);
  assert.equal(v.mmr, 1148);
});

test("la moyenne des gains n'est pas faussée par les résultats groupés", () => {
  const list = [
    { ...sample(1100, 16, 0), absorbs: null },
    { ...sample(1110, 16, 10), absorbs: 1 }, // +10
    { ...sample(1119, 16, 20), absorbs: 1 }, // +9
    { ...sample(1119, 16, 30), absorbs: 0 },
    { ...sample(1118, 16, 40), absorbs: 2 }, // -1 : deux résultats, ne sert pas à la moyenne
  ];
  const v = view(list);
  assert.equal(v.avgGain, 9.5); // (10 + 9) / 2
  assert.equal(v.avgLoss, 9); // aucune défaite « propre » : valeur par défaut
});
