// Lecteur de Launch.log de Rocket League. Ne lit que des lignes de texte déjà écrites par le jeu.
// Aucun identifiant de compte ni jeton n'est extrait ou conservé.
//
// Bloc d'entrée en file observé :
//   Matchmaking: OnlineGameMatchmaking_X::RecordStart
//   Matchmaking: Pre-divide PartyLeaderMMR: 52.3961
//   Matchmaking: PartyLeaderTier=(16)
//   Matchmaking: StartMatchmaking at 2026-11-14 16:20:30 in EU9,... for playlists 11 on game server ...
//   Matchmaking: PreferredRegions.Length=(5) PreferredPlaylists.Length=(1) Party.GetOrderedPartyMemberIDs().Length=(1)
// MMR = mu * 20 + 100 (formule communautaire, validée sur un cas : tier 16 <-> ~1148).

const RE = {
  start: /OnlineGameMatchmaking_X::RecordStart/,
  mu: /Pre-divide PartyLeaderMMR:\s*(-?[\d.]+)/,
  tier: /PartyLeaderTier=\((\d+)\)/,
  smm: /StartMatchmaking at (\d{4}-\d\d-\d\d \d\d:\d\d:\d\d) .*? for playlists ([\d,\s]+?) on game server/,
  party: /PreferredPlaylists\.Length=\((\d+)\)\s+Party\.GetOrderedPartyMemberIDs\(\)\.Length=\((\d+)\)/,
  finished: /Party: Ranked Game Finished/,
  // Suivi du groupe : qui suis-je, et qui est le chef ?
  login: /HandleLocalPlayerLoginStatusChanged .*PlayerID=(\S+)\s+LoginStatus=LS_LoggedIn\s+IsPrimary=True/,
  lobby: /HandleLobbyMemberStatusUpdate .*Members=(\d+) MemberIndex=(\d+) MemberID=(\S+)/,
  created: /Party: OnPartyCreated bWasSuccessful=\(True\)/,
  noParty: /XPGatedPlaylists: Not currently in a party/,
};

class LogParser {
  constructor({ onSample, onFinished } = {}) {
    this.onSample = onSample || (() => {});
    this.onFinished = onFinished || (() => {});
    this.pending = null;
    // Identifiants gardés en mémoire seulement, pour les comparer : jamais copiés dans un relevé.
    this.localId = null;
    this.leaderId = null;
  }

  // Hypothèse : le membre d'index 0 du groupe en est le chef (c'est le créateur). Vérifié
  // uniquement quand le joueur crée le groupe lui-même.
  trackParty(line) {
    let m;
    if ((m = RE.login.exec(line))) this.localId = m[1];
    else if ((m = RE.lobby.exec(line))) { if (m[2] === '0') this.leaderId = m[3]; }
    else if (RE.created.test(line)) this.leaderId = this.localId;
    else if (RE.noParty.test(line)) this.leaderId = null;
  }

  feed(line) {
    this.trackParty(line);
    if (RE.finished.test(line)) { this.onFinished(); return; }
    if (RE.start.test(line)) { this.pending = {}; return; }
    const p = this.pending;
    if (!p) return;
    let m;
    if ((m = RE.mu.exec(line))) { p.mu = parseFloat(m[1]); return; }
    if ((m = RE.tier.exec(line))) { p.tier = parseInt(m[1], 10); return; }
    if ((m = RE.smm.exec(line))) {
      p.time = m[1];
      p.playlists = m[2].split(',').map((s) => parseInt(s.trim(), 10)).filter(Number.isFinite);
      return;
    }
    if ((m = RE.party.exec(line))) {
      if (p.mu !== undefined && p.tier !== undefined && p.time && p.playlists && p.playlists.length) {
        const partySize = parseInt(m[2], 10);
        this.onSample({
          time: p.time,
          ts: Date.parse(p.time.replace(' ', 'T')),
          mu: p.mu,
          mmr: Math.round(p.mu * 20 + 100),
          tier: p.tier,
          playlist: p.playlists.length === 1 ? p.playlists[0] : null,
          partySize,
          // En solo, le MMR est le mien. En groupe, seulement si je suis le chef.
          leaderIsMe: partySize <= 1 || (this.leaderId !== null && this.leaderId === this.localId),
        });
      }
      this.pending = null;
    }
  }

  feedText(text) {
    for (const line of text.split(/\r?\n/)) if (line) this.feed(line);
  }
}

module.exports = { LogParser };
