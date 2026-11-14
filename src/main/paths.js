const path = require('path');

// Dossier des journaux de Rocket League. `RL_LOG_DIR` permet de le forcer (autre installation, tests).
function logDir(documentsPath, env = process.env) {
  return env.RL_LOG_DIR || path.join(documentsPath, 'My Games', 'Rocket League', 'TAGame', 'Logs');
}

module.exports = { logDir };
