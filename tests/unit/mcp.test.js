// The Claude MCP server (src/mcp/price-tracker-mcp.ts → gen/main/price-tracker-mcp.js) against a fake Price Tracker local API.
const test = require('node:test'), assert = require('node:assert'), http = require('node:http'), { spawn } = require('node:child_process'), path = require('node:path');

function fakeApi() {
  const seen = [];
  const srv = http.createServer((req, res) => {
    let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => {
      seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, body: b ? JSON.parse(b) : null });
      const j = (o, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (req.url === '/api/quotes/XAUUSD') return j({ symbol: 'XAUUSD', bid: 3500.1, ask: 3500.3 });
      if (req.url === '/api/screenshot') return j({ mimeType: 'image/png', data: 'iVBORw0KGgo=', view: { symbol: 'XAUUSD' } });
      if (req.url === '/api/cmd/draw') return j({ ok: true, id: 7 });
      if (req.url === '/api/cmd/boom') return j({ error: 'kaboom' }, 500);
      j({ ok: true, path: req.url });
    });
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ srv, seen, port: srv.address().port })));
}
function client(env) {
  const p = spawn(process.execPath, [path.join(__dirname, '..', '..', 'gen', 'main', 'price-tracker-mcp.js')], { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'inherit'] });
  let buf = ''; const waiting = new Map(); let id = 0;
  p.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); const w = waiting.get(m.id); if (w) { waiting.delete(m.id); w(m); } } });
  const rpc = (method, params) => new Promise((r) => { const i = ++id; waiting.set(i, r); p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: i, method, params }) + '\n'); });
  return { rpc, notify: (method) => p.stdin.write(JSON.stringify({ jsonrpc: '2.0', method }) + '\n'), close: () => p.stdin.end() };
}

test('MCP handshake, tool list and calls are forwarded to the local API with the token', async () => {
  const { srv, seen, port } = await fakeApi();
  const c = client({ PT_API_URL: `http://127.0.0.1:${port}`, PT_API_TOKEN: 'sekret' });
  const init = await c.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } });
  assert.equal(init.result.serverInfo.name, 'price-tracker');
  assert.ok(init.result.capabilities.tools);
  c.notify('notifications/initialized');
  const list = await c.rpc('tools/list', {});
  const names = list.result.tools.map((t) => t.name);
  for (const n of ['get_status', 'open_chart', 'get_candles', 'get_chart_screenshot', 'get_bounce_zones', 'draw_on_chart', 'calculate_position']) assert.ok(names.includes(n), n);
  for (const t of list.result.tools) assert.equal(t.inputSchema.type, 'object');

  const q = await c.rpc('tools/call', { name: 'get_quotes', arguments: { symbol: 'XAUUSD' } });
  assert.match(q.result.content[0].text, /3500.1/);
  const d = await c.rpc('tools/call', { name: 'draw_on_chart', arguments: { type: 'hline', points: [{ price: 3490 }], label: 'แนวรับ' } });
  assert.ok(!d.result.isError);
  const drawReq = seen.find((s) => s.url === '/api/cmd/draw');
  assert.deepEqual(drawReq.body, { type: 'hline', points: [{ price: 3490 }], label: 'แนวรับ' });
  assert.equal(drawReq.auth, 'Bearer sekret');
  const shot = await c.rpc('tools/call', { name: 'get_chart_screenshot', arguments: {} });
  assert.equal(shot.result.content[0].type, 'image'); assert.equal(shot.result.content[0].mimeType, 'image/png');
  const bad = await c.rpc('tools/call', { name: 'nope', arguments: {} });
  assert.ok(bad.error);
  c.close(); srv.close();
});

test('MCP reports a clear error when the app is not running', async () => {
  const c = client({ PT_API_URL: 'http://127.0.0.1:1', PT_API_TOKEN: '' });
  await c.rpc('initialize', {});
  const r = await c.rpc('tools/call', { name: 'get_quotes', arguments: {} });
  assert.ok(r.result.isError);
  assert.match(r.result.content[0].text, /Price Tracker/);
  c.close();
});
