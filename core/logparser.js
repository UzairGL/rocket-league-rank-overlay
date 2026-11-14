// Lecteur de Launch.log de Rocket League. Ne lit que des lignes de texte déjà écrites par le jeu.
// Aucun identifiant de compte ni jeton n'est extrait ou conservé.
//
// Entrée en file (un relevé de MMR) :
//   Matchmaking: OnlineGameMatchmaking_X::RecordStart
//   Matchmaking: Pre-divide PartyLeaderMMR: 52.3961
//   Matchmaking: PartyLeaderTier=(16)
//   Matchmaking: StartMatchmaking at 2026-11-14 21:32:34 in EU9,... for playlists 11 on game server ...
//   Matchmaking: PreferredRegions.Length=(5) PreferredPlaylists.Length=(1) Party.GetOrderedPartyMemberIDs().Length=(1)
// MMR = mu * 20 + 100 (formule communautaire, validée sur un cas : tier 16 <-> ~1148).
//
// Heure : celle de « StartMatchmaking at » est en UTC (mesuré : décalage exact d'une heure avec l'heure
// locale du PC, en-tête « Log file open » compris). On la lit donc comme de l'UTC, pour que `ts` soit
// un vrai instant, comparable à `Date.now()`.
//
// Match classé : « RankedReconnect: ...SetRankedReconnect » à l'arrivée dans le match, « ...ClearRankedReconnect »
// quand on le quitte, que ce soit une vraie fin ou un départ anticipé (forfait, déconnexion). La ligne
// « Party: Ranked Game Finished » n'est PAS fiable : elle est écrite jusqu'à trois fois autour d'une fin de
// match, et jamais en cas de départ anticipé.
//
// Résultats : le jeu applique parfois le résultat d'un match en retard (observé pour un forfait : le MMR est
// inchangé à la file suivante, puis les deux résultats arrivent ensemble). Chaque relevé indique donc
// combien de matchs terminés son changement de MMR absorbe (`absorbs`).

const RE = {
  start: /OnlineGameMatchmaking_X::RecordStart/,
  mu: /Pre-divide PartyLeaderMMR:\s*(-?[\d.]+)/,
  tier: /PartyLeaderTier=\((\d+)\)/,
  smm: /StartMatchmaking at (\d{4}-\d\d-\d\d \d\d:\d\d:\d\d) .*? for playlists ([\d,\s]+?) on game server/,
  party: /PreferredPlaylists\.Length=\((\d+)\)\s+Party\.GetOrderedPartyMemberIDs\(\)\.Length=\((\d+)\)/,
  // Suivi du groupe : qui suis-je, et qui est le chef ?
  login: /HandleLocalPlayerLoginStatusChanged .*PlayerID=(\S+)\s+LoginStatus=LS_LoggedIn\s+IsPrimary=True/,
  lobby: /HandleLobbyMemberStatusUpdate .*Members=(\d+) MemberIndex=(\d+) MemberID=(\S+)/,
  created: /Party: OnPartyCreated bWasSuccessful=\(True\)/,
  noParty: /XPGatedPlaylists: Not currently in a party/,
  // Match classé
  rankedSet: /RankedReconnect: .*SetRankedReconnect/,
  rankedClear: /RankedReconnect: .*ClearRankedReconnect/,
};

// « 2026-11-14 21:32:34 » (UTC) -> instant en millisecondes.
function parseLogTime(text) {
  return Date.parse(`${text.replace(' ', 'T')}Z`);
}

const playlistKey = (playlist) => String(playlist ?? 'x');

class LogParser {
  // onSample(relevé) à chaque entrée en file ; onMatchEnded({ playlist, pending }) à chaque match terminé.
  constructor({ onSample, onMatchEnded } = {}) {
    this.onSample = onSample || (() => {});
    this.onMatchEnded = onMatchEnded || (() => {});
    this.pending = {}; // playlist -> matchs terminés dont le résultat n'est pas encore dans le MMR
    this.lastMmr = {}; // playlist -> dernier MMR vu
    this.queued = false; // une file a eu lieu depuis le dernier match : le prochain « Set » est un nouveau match
    this.inMatch = false;
    this.counted = true; // le match en cours a-t-il déjà été compté comme terminé ?
    this.matchPlaylist = null;
    this.lastPlaylist = null;
    this.pendingSample = null;
    // Identifiants gardés en mémoire seulement, pour les comparer : jamais copiés dans un relevé.
    this.localId = null;
    this.leaderId = null;
  }

  // Reprend l'état d'un autre lecteur (démarrage en cours de partie : l'histoire est déjà écrite).
  adopt(other) {
    this.pending = { ...other.pending };
    this.lastMmr = { ...other.lastMmr };
    this.queued = other.queued;
    this.inMatch = other.inMatch;
    this.counted = other.counted;
    this.matchPlaylist = other.matchPlaylist;
    this.lastPlaylist = other.lastPlaylist;
    this.localId = other.localId;
    this.leaderId = other.leaderId;
  }

  // Le jeu a été relancé (nouveau fichier de journal). Un match en cours que le jeu n'a pas pu clore
  // (fermeture forcée) est terminé ; le MMR et les résultats en attente, eux, restent d'un fichier à l'autre.
  onNewFile() {
    if (this.inMatch && !this.counted) this.endMatch();
    this.inMatch = false;
    this.queued = false;
    this.pendingSample = null;
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

  endMatch() {
    this.counted = true;
    const key = playlistKey(this.matchPlaylist);
    this.pending[key] = (this.pending[key] || 0) + 1;
    this.onMatchEnded({ playlist: this.matchPlaylist, pending: this.pending[key] });
  }

  // Un match est compté UNE fois, même si le jeu écrit plusieurs « Clear » ou si on se reconnecte.
  trackMatch(line) {
    if (RE.rankedSet.test(line)) {
      // « Set » alors qu'un match était en cours sans « Clear » (jeu fermé de force) : l'ancien est terminé.
      if (this.inMatch && !this.counted) this.endMatch();
      // Nouveau match seulement s'il y a eu une file avant : sinon c'est une reconnexion au même match.
      if (this.queued) {
        this.matchPlaylist = this.lastPlaylist;
        this.counted = false;
        this.queued = false;
      }
      this.inMatch = true;
    } else if (RE.rankedClear.test(line) && this.inMatch) {
      this.inMatch = false;
      if (!this.counted) this.endMatch();
    }
  }

  emitSample(p, partySize) {
    const playlist = p.playlists.length === 1 ? p.playlists[0] : null;
    const key = playlistKey(playlist);
    const mmr = Math.round(p.mu * 20 + 100);
    const previous = this.lastMmr[key];

    // Combien de matchs terminés ce changement de MMR absorbe-t-il ? null = inconnu (premier relevé vu).
    let absorbs = null;
    if (previous !== undefined) {
      if (mmr !== previous) {
        absorbs = Math.max(this.pending[key] || 0, 1);
        this.pending[key] = 0;
      } else {
        absorbs = 0; // MMR inchangé : les matchs en attente attendent toujours leur résultat
      }
    }
    this.lastMmr[key] = mmr;
    this.queued = true;
    this.lastPlaylist = playlist;

    this.onSample({
      time: p.time,
      ts: parseLogTime(p.time),
      mu: p.mu,
      mmr,
      tier: p.tier,
      playlist,
      partySize,
      // En solo, le MMR est le mien. En groupe, seulement si je suis le chef.
      leaderIsMe: partySize <= 1 || (this.leaderId !== null && this.leaderId === this.localId),
      absorbs,
      pendingAfter: this.pending[key] || 0,
    });
  }

  feed(line) {
    this.trackParty(line);
    this.trackMatch(line);
    if (RE.start.test(line)) { this.pendingSample = {}; return; }
    const p = this.pendingSample;
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
        this.emitSample(p, parseInt(m[2], 10));
      }
      this.pendingSample = null;
    }
  }

  feedText(text) {
    for (const line of text.split(/\r?\n/)) if (line) this.feed(line);
  }
}

module.exports = { LogParser, parseLogTime, playlistKey };
