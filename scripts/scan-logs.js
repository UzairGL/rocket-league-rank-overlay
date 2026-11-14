// Test sur de vrais journaux : node test/real-logs.js "<dossier Logs>"
// Affiche uniquement MMR / tier / playlist / date. Aucun identifiant.
const fs = require('fs');
const path = require('path');
const { LogParser } = require('../core/logparser');
const { computeView } = require('../core/view');

const dir = process.argv[2];
if (!dir) { console.error('Usage: node test/real-logs.js <dossier Logs>'); process.exit(1); }

const samples = [];
const seen = new Set();
const files = fs.readdirSync(dir).filter((f) => /^Launch.*\.log$/.test(f));
for (const f of files) {
  const p = new LogParser({ onSample: (s) => { const k = s.time + '|' + s.mu; if (!seen.has(k)) { seen.add(k); samples.push(s); } } });
  p.feedText(fs.readFileSync(path.join(dir, f), 'utf8'));
}
samples.sort((a, b) => a.ts - b.ts);
console.log(`${samples.length} relevés dans ${files.length} fichiers`);
for (const s of samples.slice(-15)) console.log(s.time, 'playlist', s.playlist, 'mmr', s.mmr, 'tier', s.tier, 'groupe', s.partySize);
const v = computeView(samples, { playlist: 11 });
delete v.history;
console.log(JSON.stringify(v, null, 2));
