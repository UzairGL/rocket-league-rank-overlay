const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const path = require('path');
const { EventEmitter } = require('events');
const { WebServer, hostAllowed } = require('../src/main/webServer');

const RENDERER_DIR = path.join(__dirname, '..', 'src', 'renderer');

class FakeState extends EventEmitter {
  constructor() {
    super();
    this.current = { empty: false, mmr: 1148, tierName: 'Champion I' };
  }
  view() {
    return this.current;
  }
}

async function withServer(fn, options = {}) {
  const state = new FakeState();
  const server = new WebServer({ state, rendererDir: RENDERER_DIR, port: 0 });
  await server.start(options);
  try {
    await fn({ server, state, base: `http://127.0.0.1:${server.port}` });
  } finally {
    await server.stop();
  }
}

// Requête brute : permet de choisir l'en-tête Host et la méthode.
function request(server, { method = 'GET', url = '/', host } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port: server.port, method, path: url, headers: host ? { Host: host } : {} },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

test('/api/view renvoie le modèle d\'affichage en JSON', async () => {
  await withServer(async ({ server }) => {
    const res = await request(server, { url: '/api/view' });
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /application\/json/);
    assert.deepEqual(JSON.parse(res.body.toString()), { empty: false, mmr: 1148, tierName: 'Champion I' });
  });
});

test("la page d'accueil charge le pont web avant le script de l'interface", async () => {
  await withServer(async ({ server }) => {
    const res = await request(server, { url: '/' });
    const html = res.body.toString();
    assert.equal(res.status, 200);
    assert.ok(html.indexOf('web-adapter.js') > -1);
    assert.ok(html.indexOf('web-adapter.js') < html.indexOf('renderer.js'));
  });
});

test("le pont web met un fond sombre sauf avec ?transparent (OBS)", async () => {
  await withServer(async ({ server }) => {
    const js = (await request(server, { url: '/web-adapter.js' })).body.toString();
    assert.ok(js.includes('web-bg'));
    assert.ok(js.includes('transparent'));
  });
});

test('sert la feuille de style, le script et les polices autorisés', async () => {
  await withServer(async ({ server }) => {
    for (const [url, type] of [
      ['/style.css', /text\/css/],
      ['/renderer.js', /javascript/],
      ['/web-adapter.js', /javascript/],
      ['/fonts/barlow-condensed-latin-800-italic.woff2', /font\/woff2/],
    ]) {
      const res = await request(server, { url });
      assert.equal(res.status, 200, url);
      assert.match(res.headers['content-type'], type, url);
    }
  });
});

test('ne sert rien en dehors de la liste fixe (pas de parcours de dossiers)', async () => {
  await withServer(async ({ server }) => {
    for (const url of ['/../../package.json', '/..%2f..%2fpackage.json', '/fonts/../../../package.json', '/package.json', '/src/main/main.js', '/fonts/LICENSE-OFL.txt']) {
      const res = await request(server, { url });
      assert.equal(res.status, 404, url);
    }
  });
});

test('refuse les méthodes autres que GET et HEAD', async () => {
  await withServer(async ({ server }) => {
    assert.equal((await request(server, { method: 'POST', url: '/api/view' })).status, 405);
    assert.equal((await request(server, { method: 'DELETE', url: '/' })).status, 405);
  });
});

test("refuse un en-tête Host qui n'est pas une adresse IP ni localhost (DNS rebinding)", async () => {
  await withServer(async ({ server }) => {
    assert.equal((await request(server, { url: '/api/view', host: 'evil.example.com' })).status, 403);
    assert.equal((await request(server, { url: '/api/view', host: `localhost:${server.port}` })).status, 200);
    assert.equal((await request(server, { url: '/api/view', host: '192.168.1.20:49210' })).status, 200);
  });
});

test('hostAllowed accepte les IP et localhost, refuse les noms de domaine', () => {
  for (const ok of ['localhost', 'localhost:49210', '127.0.0.1:1', '[::1]:49210', '192.168.0.12:49210']) assert.equal(hostAllowed(ok), true, ok);
  for (const ko of ['', undefined, 'example.com', 'evil.localhost.example.com:49210', 'a.b']) assert.equal(hostAllowed(ko), false, String(ko));
});

test('écoute seulement sur ce PC par défaut, et propose les adresses du réseau local sur demande', async () => {
  await withServer(async ({ server }) => {
    assert.equal(server.server.address().address, '127.0.0.1');
    assert.deepEqual(server.urls(), [`http://127.0.0.1:${server.port}`]);
  });
  await withServer(
    async ({ server }) => {
      assert.equal(server.server.address().address, '0.0.0.0');
      assert.ok(server.urls()[0].startsWith('http://127.0.0.1:'));
    },
    { lan: true },
  );
});

test("le flux d'événements envoie l'état courant puis chaque changement", async () => {
  await withServer(async ({ server, state }) => {
    const messages = [];
    await new Promise((resolve, reject) => {
      const req = http.get({ host: '127.0.0.1', port: server.port, path: '/events' }, (res) => {
        assert.match(res.headers['content-type'], /text\/event-stream/);
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          for (const m of chunk.matchAll(/^data: (.*)$/gm)) messages.push(JSON.parse(m[1]));
          if (messages.length === 1) {
            state.current = { empty: false, mmr: 1157, tierName: 'Champion I' };
            state.emit('change');
          }
          if (messages.length === 2) {
            req.destroy();
            resolve();
          }
        });
      });
      req.on('error', (err) => (err.code === 'ECONNRESET' ? resolve() : reject(err)));
    });
    assert.deepEqual(messages.map((m) => m.mmr), [1148, 1157]);
  });
});

test("l'arrêt ferme le serveur et libère le port", async () => {
  const state = new FakeState();
  const server = new WebServer({ state, rendererDir: RENDERER_DIR, port: 0 });
  await server.start();
  const { port } = server;
  await server.stop();
  assert.equal(server.port, null);
  assert.deepEqual(server.urls(), []);
  await assert.rejects(
    new Promise((resolve, reject) => http.get({ host: '127.0.0.1', port, path: '/' }, resolve).on('error', reject)),
  );
});

test("un port occupé : le suivant est utilisé", async () => {
  const blocker = http.createServer();
  await new Promise((r) => blocker.listen(0, '127.0.0.1', r));
  const busy = blocker.address().port;
  const server = new WebServer({ state: new FakeState(), rendererDir: RENDERER_DIR, port: busy });
  try {
    await server.start();
    assert.notEqual(server.port, busy);
    assert.ok(server.port > busy && server.port <= busy + 10);
  } finally {
    await server.stop();
    await new Promise((r) => blocker.close(r));
  }
});
