// Local API: Claude's token works independently of the user's API token; server state is reported.
const test = require('node:test'), assert = require('node:assert'), http = require('node:http');
process.env.PT_LOG_DIR = require('node:os').tmpdir();
const api = require('../../gen/main/api.js');
const get = (port, path, token) => new Promise((r) => http.get({ host: '127.0.0.1', port, path, headers: token ? { Authorization: 'Bearer ' + token } : {} }, (res) => { let b = ''; res.on('data', (d) => (b += d)); res.on('end', () => r({ code: res.statusCode, body: b })); }));
const hooks = { status: () => ({ ok: 1 }), quotes: () => ({}), symbols: () => [], chart: () => ({}), analysis: () => ({}), command: async (n, a) => ({ n, a }), screenshot: async () => ({}) };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('Claude-only access: listening on 127.0.0.1, Claude token required', async () => {
  const port = 19000 + Math.floor(Math.random() * 500);
  api.start({ enabled: true, port, tokens: ['claude-tok'], openNoToken: false }, hooks); await sleep(150);
  assert.ok(api.listening());
  assert.equal((await get(port, '/api/status')).code, 401);
  assert.equal((await get(port, '/api/status', 'claude-tok')).code, 200);
  api.stop(); assert.ok(!api.listening());
});

test('user API token and Claude token both accepted; open API without a token stays open', async () => {
  const port = 19600 + Math.floor(Math.random() * 300);
  api.start({ enabled: true, port, tokens: ['user', 'claude'], openNoToken: false }, hooks); await sleep(150);
  assert.equal((await get(port, '/api/status', 'user')).code, 200);
  assert.equal((await get(port, '/api/status', 'claude')).code, 200);
  assert.equal((await get(port, '/api/status', 'nope')).code, 401);
  api.start({ enabled: true, port, tokens: ['', 'claude'], openNoToken: true }, hooks); await sleep(150);
  assert.equal((await get(port, '/api/status')).code, 200);
  api.stop();
});
