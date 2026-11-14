// Outils de test : fabrique de faux relevés et de faux blocs de journal (aucune donnée réelle).

const BASE = Date.parse('2026-11-14T10:00:00');

function stamp(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// Relevé prêt à l'emploi : `min` = minutes écoulées depuis 10:00.
function sample(mmr, tier, min = 0, extra = {}) {
  const ts = BASE + min * 60000;
  return { time: stamp(ts), ts, mu: (mmr - 100) / 20, mmr, tier, playlist: 11, partySize: 1, ...extra };
}

// Bloc d'entrée en file tel que le jeu l'écrit dans Launch.log.
function logBlock({ mu = 52.3961, tier = 16, time = '2026-11-14 16:20:30', playlists = '11', party = 1 } = {}) {
  return [
    '[2979.93] Matchmaking: OnlineGameMatchmaking_X_0 PingRegions -> Searching',
    '[2979.93] Matchmaking: OnlineGameMatchmaking_X::RecordStart',
    `[2979.93] Matchmaking: Pre-divide PartyLeaderMMR: ${mu}`,
    `[2979.93] Matchmaking: Post-divide PartyLeaderMMR: ${mu}`,
    `[2979.93] Matchmaking: PartyLeaderTier=(${tier})`,
    `[2979.93] Matchmaking: StartMatchmaking at ${time} in EU9,EU5 for playlists ${playlists} on game server 1`,
    '[2979.93] Matchmaking: Creating RPC_StartMatchmaking_X',
    `[2979.93] Matchmaking: PreferredRegions.Length=(5) PreferredPlaylists.Length=(1) Party.GetOrderedPartyMemberIDs().Length=(${party})`,
    '',
  ].join('\n');
}

module.exports = { sample, logBlock, stamp };
