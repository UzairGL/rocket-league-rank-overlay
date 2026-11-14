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

test('ne conserve aucun identifiant de compte', () => {
  const text = logBlock() + 'Matchmaking: StartMatchmaking UniqueId=(Epic|abcdef|0)\n';
  assert.ok(!JSON.stringify(parse(text).samples).includes('abcdef'));
});
