const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Page web locale : la même interface que la fenêtre, consultable dans un navigateur, sur un
// téléphone, une tablette ou comme source navigateur d'OBS. Utile quand l'overlay est caché par le
// jeu (plein écran) : la page, elle, n'est jamais derrière le jeu.
//
// Sécurité : écoute sur 127.0.0.1 par défaut ; le réseau local est une option explicite. Seuls des
// fichiers d'une liste fixe sont servis (aucun chemin construit depuis la requête), en lecture seule,
// et l'en-tête Host doit être une adresse IP ou `localhost` (protection contre le DNS rebinding).
// La page ne contient que le rang, le MMR et la session : aucun identifiant de compte.

const STATIC_FILES = new Map([
  ['/style.css', { file: 'style.css', type: 'text/css; charset=utf-8' }],
  ['/renderer.js', { file: 'renderer.js', type: 'text/javascript; charset=utf-8' }],
  ['/fonts/barlow-condensed-latin-600-italic.woff2', { file: 'fonts/barlow-condensed-latin-600-italic.woff2', type: 'font/woff2' }],
  ['/fonts/barlow-condensed-latin-800-italic.woff2', { file: 'fonts/barlow-condensed-latin-800-italic.woff2', type: 'font/woff2' }],
]);

// Remplace le pont Electron (`window.overlay`) par des appels HTTP.
const WEB_ADAPTER = `// Fond sombre dans un navigateur ; ajouter ?transparent à l'adresse pour OBS.
if (!/[?&]transparent(=|&|$)/.test(location.search)) document.documentElement.classList.add('web-bg');
window.overlay = {
  getView: () => fetch('/api/view').then((r) => r.json()),
  onView: (callback) => {
    const source = new EventSource('/events');
    source.onmessage = (e) => callback(JSON.parse(e.data));
    return () => source.close();
  },
  openMenu: () => {},
  drag: () => {},
};
`;

const HOST_ALLOWED = /^(localhost|127\.0\.0\.1|\[::1\]|\d{1,3}(\.\d{1,3}){3})$/i;
const KEEPALIVE_MS = 25000;

function hostAllowed(header) {
  if (!header) return false;
  return HOST_ALLOWED.test(header.replace(/:\d+$/, ''));
}

class WebServer {
  // port : port souhaité (les 10 suivants sont essayés s'il est pris) ; 0 = n'importe quel port libre.
  constructor({ state, rendererDir, port = 49210 }) {
    this.state = state;
    this.rendererDir = rendererDir;
    this.basePort = port;
    this.server = null;
    this.lan = false;
    this.clients = new Set();
    this.keepalive = null;
    state.on('change', () => this.broadcast());
  }

  async start({ lan = false } = {}) {
    if (this.server) await this.stop();
    this.lan = lan;
    const host = lan ? '0.0.0.0' : '127.0.0.1';
    const ports = this.basePort === 0 ? [0] : Array.from({ length: 11 }, (_, i) => this.basePort + i);
    for (const port of ports) {
      try {
        await this.listen(host, port);
        this.keepalive = setInterval(() => this.send(': ping\n\n'), KEEPALIVE_MS);
        this.keepalive.unref();
        return;
      } catch (err) {
        if (err.code !== 'EADDRINUSE') throw err;
      }
    }
    throw new Error('Aucun port libre pour la page web locale');
  }

  listen(host, port) {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => this.handle(req, res));
      server.once('error', reject);
      server.listen(port, host, () => {
        server.removeListener('error', reject);
        this.server = server;
        resolve();
      });
    });
  }

  get port() {
    return this.server ? this.server.address().port : null;
  }

  // Adresses à ouvrir : toujours celle de ce PC, plus celles du réseau local si l'option est active.
  urls() {
    if (!this.server) return [];
    const urls = [`http://127.0.0.1:${this.port}`];
    if (this.lan) {
      for (const list of Object.values(os.networkInterfaces())) {
        for (const nic of list || []) {
          if (nic.family === 'IPv4' && !nic.internal) urls.push(`http://${nic.address}:${this.port}`);
        }
      }
    }
    return urls;
  }

  send(chunk) {
    for (const res of this.clients) res.write(chunk);
  }

  broadcast() {
    if (!this.clients.size) return;
    this.send(`data: ${JSON.stringify(this.state.view())}\n\n`);
  }

  stop() {
    clearInterval(this.keepalive);
    this.keepalive = null;
    for (const res of this.clients) res.end();
    this.clients.clear();
    const server = this.server;
    this.server = null;
    return new Promise((resolve) => (server ? server.close(() => resolve()) : resolve()));
  }

  handle(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (!hostAllowed(req.headers.host)) return this.reply(res, 403, 'text/plain; charset=utf-8', 'Interdit');
    if (req.method !== 'GET' && req.method !== 'HEAD') return this.reply(res, 405, 'text/plain; charset=utf-8', 'Méthode non autorisée');

    let pathname;
    try {
      pathname = new URL(req.url, 'http://localhost').pathname;
    } catch {
      return this.reply(res, 400, 'text/plain; charset=utf-8', 'Requête invalide');
    }

    if (pathname === '/' || pathname === '/index.html') return this.serveIndex(res);
    if (pathname === '/web-adapter.js') return this.reply(res, 200, 'text/javascript; charset=utf-8', WEB_ADAPTER);
    if (pathname === '/api/view') return this.reply(res, 200, 'application/json; charset=utf-8', JSON.stringify(this.state.view()));
    if (pathname === '/events') return this.serveEvents(req, res);

    const asset = STATIC_FILES.get(pathname);
    if (asset) {
      return fs.readFile(path.join(this.rendererDir, asset.file), (err, data) =>
        err ? this.reply(res, 404, 'text/plain; charset=utf-8', 'Introuvable') : this.reply(res, 200, asset.type, data),
      );
    }
    return this.reply(res, 404, 'text/plain; charset=utf-8', 'Introuvable');
  }

  serveIndex(res) {
    fs.readFile(path.join(this.rendererDir, 'index.html'), 'utf8', (err, html) => {
      if (err) return this.reply(res, 404, 'text/plain; charset=utf-8', 'Introuvable');
      const page = html.replace(
        '<script src="renderer.js"></script>',
        '<script src="web-adapter.js"></script>\n  <script src="renderer.js"></script>',
      );
      this.reply(res, 200, 'text/html; charset=utf-8', page);
    });
  }

  serveEvents(req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
    });
    res.write(`retry: 3000\n\ndata: ${JSON.stringify(this.state.view())}\n\n`);
    this.clients.add(res);
    req.on('close', () => this.clients.delete(res));
  }

  reply(res, status, type, body) {
    res.writeHead(status, { 'Content-Type': type });
    res.end(body);
  }
}

module.exports = { WebServer, hostAllowed, WEB_ADAPTER };
