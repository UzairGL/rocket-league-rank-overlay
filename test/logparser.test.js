const test = require('node:test');
const assert = require('node:assert/strict');
const { LogParser } = require('../core/logparser');
const { logBlock } = require('./helpers');

function parse(text) {
  const samples = [];
  let finished = 0;
  new LogParser({ onSample: (s) => samples.push(s), onFinished: () => finished++ }).feedText(text);
  return { samples, finished };
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

test('compte les matchs classés terminés', () => {
  const text = 'Party: Ranked Game Finished, Clear party member server\nautre\nParty: Ranked Game Finished, Clear party member server\n';
  assert.equal(parse(text).finished, 2);
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
