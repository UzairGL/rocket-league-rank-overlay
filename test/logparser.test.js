const test = require('node:test');
const assert = require('node:assert/strict');
const { LogParser, parseLogTime } = require('../core/logparser');
const { logBlock, RANKED_SET, RANKED_CLEAR } = require('./helpers');

function parse(text) {
  const samples = [];
  const ended = [];
  const parser = new LogParser({ onSample: (s) => samples.push(s), onMatchEnded: (e) => ended.push(e) });
  parser.feedText(text);
  return { samples, ended, parser };
}

test('extrait MMR, tier, playlist et heure d\'une entrée en file', () => {
  const { samples } = parse(logBlock({ mu: 52.3961, tier: 16, time: '2026-11-14 16:20:30', playlists: '11' }));
  assert.equal(samples.length, 1);
  assert.equal(samples[0].mmr, 1148); // 52.3961 * 20 + 100 = 1147.92
  assert.equal(samples[0].tier, 16);
  assert.equal(samples[0].playlist, 11);
  assert.equal(samples[0].partySize, 1);
  assert.equal(samples[0].time, '2026-11-14 16:20:30');
  assert.ok(Number.isFinite(samples[0].ts));
});

test('lit plusieurs entrées en file à la suite', () => {
  const text = logBlock({ mu: 52.0, time: '2026-11-14 16:00:00' }) + 'bruit\n' + logBlock({ mu: 52.45, time: '2026-11-14 16:10:00' });
  assert.deepEqual(parse(text).samples.map((s) => s.mmr), [1140, 1149]);
});

test('signale la taille du groupe', () => {
  assert.equal(parse(logBlock({ party: 2 })).samples[0].partySize, 2);
});

test('playlist ambiguë quand plusieurs sont demandées', () => {
  assert.equal(parse(logBlock({ playlists: '11,13' })).samples[0].playlist, null);
});

test('un bloc incomplet n\'émet rien', () => {
  const truncated = logBlock().split('\n').slice(0, 5).join('\n');
  assert.equal(parse(truncated).samples.length, 0);
});

test('ignore les lignes hors entrée en file', () => {
  const stray = 'Matchmaking: Pre-divide PartyLeaderMMR: 99\nMatchmaking: PartyLeaderTier=(3)\n';
  assert.equal(parse(stray).samples.length, 0);
});

test("l'heure du journal est lue en UTC, donc comparable à Date.now()", () => {
  const { samples } = parse(logBlock({ time: '2026-11-14 21:32:34' }));
  assert.equal(samples[0].ts, Date.UTC(2026, 10, 14, 21, 32, 34));
  assert.equal(parseLogTime('2026-11-14 21:32:34'), Date.UTC(2026, 10, 14, 21, 32, 34));
});

// --- Matchs classés : fin normale, forfait, doublons, reconnexion ----------------------------------------

test('une fin de match normale est comptée une seule fois, même si le jeu écrit plusieurs « Clear »', () => {
  const text = logBlock() + RANKED_SET + RANKED_CLEAR + RANKED_CLEAR + RANKED_CLEAR;
  const { ended } = parse(text);
  assert.equal(ended.length, 1);
  assert.deepEqual(ended[0], { playlist: 11, pending: 1 });
});

test('un forfait ou une déconnexion est compté comme un match terminé', () => {
  const text = logBlock() + RANKED_SET + 'NetComeGo: TcpipConnection_0 Control channel closed, reason=Disconnect command\n' + RANKED_CLEAR;
  assert.equal(parse(text).ended.length, 1);
});

test('les lignes « Ranked Game Finished » ne comptent pas (écrites jusqu\'à trois fois, jamais en cas de forfait)', () => {
  const text = logBlock() + RANKED_SET + 'Party: Ranked Game Finished, Clear party member server\n'.repeat(3);
  assert.equal(parse(text).ended.length, 0);
});

test('un « Clear » sans match classé (entraînement libre, menus) est ignoré', () => {
  assert.equal(parse(RANKED_CLEAR + RANKED_CLEAR).ended.length, 0);
});

test("quitter puis se reconnecter au même match ne le compte qu'une fois", () => {
  const text = logBlock() + RANKED_SET + RANKED_CLEAR + RANKED_SET + RANKED_CLEAR;
  assert.equal(parse(text).ended.length, 1);
});

test("un nouveau match sans « Clear » du précédent (jeu fermé de force) termine l'ancien", () => {
  const text = logBlock({ time: '2026-11-14 20:00:00' }) + RANKED_SET + logBlock({ mu: 53, time: '2026-11-14 20:10:00' }) + RANKED_SET;
  const { ended } = parse(text);
  assert.equal(ended.length, 1); // le premier est terminé, le second est en cours
});

test('nouveau fichier de journal : un match en cours non clos est terminé', () => {
  const { parser, ended } = parse(logBlock() + RANKED_SET);
  assert.equal(ended.length, 0);
  parser.onNewFile();
  assert.equal(ended.length, 1);
});

// --- Résultats : combien de matchs chaque changement de MMR absorbe-t-il ? --------------------------------

test('premier relevé : inconnu ; MMR changé : le match terminé ; MMR inchangé : 0', () => {
  const text =
    logBlock({ mu: 50, time: '2026-11-14 20:00:00' }) + RANKED_SET + RANKED_CLEAR +
    logBlock({ mu: 50.45, time: '2026-11-14 20:10:00' }) + RANKED_SET + RANKED_CLEAR +
    logBlock({ mu: 50.45, time: '2026-11-14 20:20:00' });
  const { samples } = parse(text);
  assert.deepEqual(samples.map((s) => s.absorbs), [null, 1, 0]);
});

test("après un forfait, le résultat arrive en retard : MMR inchangé à la file suivante, puis deux résultats d'un coup", () => {
  const text =
    logBlock({ mu: 52.0, time: '2026-11-14 21:32:34' }) + RANKED_SET + RANKED_CLEAR + // forfait
    logBlock({ mu: 52.0, time: '2026-11-14 21:38:47' }) + RANKED_SET + RANKED_CLEAR + // second match, MMR encore inchangé
    logBlock({ mu: 51.95, time: '2026-11-14 21:44:31' }); // les deux résultats arrivent : -10 puis +9
  const { samples, ended } = parse(text);
  assert.deepEqual(samples.map((s) => s.mmr), [1140, 1140, 1139]);
  assert.deepEqual(samples.map((s) => s.absorbs), [null, 0, 2]);
  assert.deepEqual(samples.map((s) => s.pendingAfter), [0, 1, 0]);
  assert.deepEqual(ended.map((e) => e.pending), [1, 2]);
});

test('les matchs en attente sont suivis par playlist', () => {
  const text =
    logBlock({ mu: 50, playlists: '13', time: '2026-11-14 20:00:00' }) + RANKED_SET + RANKED_CLEAR +
    logBlock({ mu: 52, playlists: '11', time: '2026-11-14 20:10:00' });
  const { parser, ended } = parse(text);
  assert.deepEqual(ended, [{ playlist: 13, pending: 1 }]);
  assert.deepEqual(parser.pending, { 13: 1 });
});

const ME = 'Epic|aaaa1111|0';
const FRIEND = 'Epic|bbbb2222|0';
const login = `Party: HandleLocalPlayerLoginStatusChanged PlayerName=Moi PlayerID=${ME} LoginStatus=LS_LoggedIn IsPrimary=True IsInParty=False\n`;
const created = "Party: OnPartyCreated bWasSuccessful=(True) InPartyId:'PsyNet-x' \n";
const member = (n, i, id) => `Party: HandleLobbyMemberStatusUpdate LobbyUID=PsyNet-x Members=${n} MemberIndex=${i} MemberID=${id}\n`;

test('solo : le relevé est toujours au joueur', () => {
  assert.equal(parse(logBlock({ party: 1 })).samples[0].leaderIsMe, true);
});

test('groupe créé par le joueur : il en est le chef', () => {
  const text = login + created + member(1, 0, ME) + member(2, 1, FRIEND) + logBlock({ party: 2 });
  assert.equal(parse(text).samples[0].leaderIsMe, true);
});

test("groupe d'un autre joueur : le joueur n'en est pas le chef", () => {
  const text = login + member(1, 0, FRIEND) + member(2, 1, ME) + logBlock({ party: 2 });
  assert.equal(parse(text).samples[0].leaderIsMe, false);
});

test('identité inconnue en groupe : prudence, pas le chef', () => {
  const text = created + member(2, 1, FRIEND) + logBlock({ party: 2 });
  assert.equal(parse(text).samples[0].leaderIsMe, false);
});

test('« pas dans un groupe » efface le chef précédent', () => {
  const text = login + created + member(1, 0, ME) + 'XPGatedPlaylists: Not currently in a party.\n' + logBlock({ party: 2 });
  assert.equal(parse(text).samples[0].leaderIsMe, false);
});

test("aucun identifiant de groupe n'est copié dans les relevés", () => {
  const text = login + created + member(1, 0, ME) + member(2, 1, FRIEND) + logBlock({ party: 2 });
  const json = JSON.stringify(parse(text).samples);
  assert.ok(!json.includes('aaaa1111') && !json.includes('bbbb2222'));
});

test('ne conserve aucun identifiant de compte', () => {
  const text = logBlock() + 'Matchmaking: StartMatchmaking UniqueId=(Epic|abcdef|0)\n';
  assert.ok(!JSON.stringify(parse(text).samples).includes('abcdef'));
});
