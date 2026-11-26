// Local HTTP API + Server-Sent Events stream + small web dashboard.
// Other programs (Python, Excel, a web page, a phone on the same Wi-Fi) can read prices,
// candles, analysis and logs from the app.
const http = require('http');
const { URL } = require('url');
const log = require('./logger');

let server = null, isListening = false;
const clients = new Set(); // SSE clients {res, logs}

function start(cfg, hooks) {
  stop();
  if (!cfg || !cfg.enabled) return;
  const host = cfg.lan ? '0.0.0.0' : '127.0.0.1';
  server = http.createServer((req, res) => handle(req, res, cfg, hooks));
  server.on('error', (e) => { isListening = false; log.error('api', `ไม่สามารถเปิด API ที่พอร์ต ${cfg.port}: ${e.message}`); });
  server.listen(cfg.port, host, () => (isListening = true) && log.info('api', `API เปิดแล้วที่ http://${host === '0.0.0.0' ? '<IP เครื่อง>' : '127.0.0.1'}:${cfg.port}`));
}

function stop() {
  clients.forEach((c) => { try { c.res.end(); } catch (_) {} }); clients.clear();
  if (server) { try { server.close(); } catch (_) {} server = null; }
  isListening = false;
}

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve) => {
    let b = ''; req.on('data', (d) => { b += d; if (b.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch (_) { resolve({}); } });
  });
}

async function handle(req, res, cfg, hooks) {
  const u = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS' });
    return res.end();
  }
  const tokens = (cfg.tokens || [cfg.token]).filter(Boolean);
  if (tokens.length && !cfg.openNoToken) {
    const got = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || u.searchParams.get('token');
    if (!tokens.includes(got) && u.pathname !== '/') return json(res, 401, { error: 'unauthorized: ใส่ token ใน header Authorization: Bearer <token> หรือ ?token=' });
  }
  const p = u.pathname.replace(/\/+$/, '') || '/';
  try {
    if (p === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(dashboardHtml(cfg)); }
    if (p === '/api/status') return json(res, 200, hooks.status());
    if (p === '/api/quotes') return json(res, 200, hooks.quotes());
    if (p.startsWith('/api/quotes/')) { const q = hooks.quotes()[decodeURIComponent(p.slice(12)).toUpperCase()]; return q ? json(res, 200, q) : json(res, 404, { error: 'no quote (symbol นี้ยังไม่ได้อยู่ใน watchlist?)' }); }
    if (p === '/api/symbols' && req.method === 'GET') return json(res, 200, hooks.symbols());
    if (p === '/api/symbols' && req.method === 'POST') { const b = await readBody(req); hooks.addSymbol(b.symbol); return json(res, 200, hooks.symbols()); }
    if (p.startsWith('/api/symbols/') && req.method === 'DELETE') { hooks.removeSymbol(decodeURIComponent(p.slice(13))); return json(res, 200, hooks.symbols()); }
    if (p === '/api/chart') return json(res, 200, hooks.chart());
    if (p === '/api/analysis') return json(res, 200, hooks.analysis());
    if (p.startsWith('/api/cmd/') && req.method === 'POST') { const b = await readBody(req); return json(res, 200, await hooks.command(decodeURIComponent(p.slice(9)), b)); }
    if (p === '/api/screenshot') return json(res, 200, await hooks.screenshot());
    if (p === '/api/logs') return json(res, 200, log.recent(+u.searchParams.get('limit') || 200, u.searchParams.get('level') || undefined));
    if (p === '/api/stream') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'Access-Control-Allow-Origin': '*' });
      res.write(`event: hello\ndata: ${JSON.stringify(hooks.status())}\n\n`);
      const c = { res, logs: u.searchParams.get('logs') === '1' };
      clients.add(c); req.on('close', () => clients.delete(c));
      return;
    }
    json(res, 404, { error: 'not found', endpoints: ENDPOINTS.map((e) => e[0]) });
  } catch (e) {
    log.error('api', e.message); json(res, 500, { error: e.message });
  }
}

function broadcast(event, data) {
  if (!clients.size) return;
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  clients.forEach((c) => { if (event === 'log' && !c.logs) return; try { c.res.write(msg); } catch (_) {} });
}

const ENDPOINTS = [
  ['GET /api/status', 'สถานะการเชื่อมต่อ'],
  ['GET /api/quotes', 'ราคาล่าสุดทุก symbol'],
  ['GET /api/quotes/XAUUSD', 'ราคาล่าสุดของ symbol เดียว'],
  ['GET /api/symbols', 'รายชื่อ watchlist'],
  ['POST /api/symbols {"symbol":"GBPUSD"}', 'เพิ่ม symbol'],
  ['DELETE /api/symbols/GBPUSD', 'ลบ symbol'],
  ['GET /api/chart', 'แท่งเทียนของกราฟที่เปิดอยู่'],
  ['GET /api/analysis', 'เทรนด์ / โครงสร้าง / สัญญาณล่าสุด / สถิติ'],
  ['GET /api/logs?limit=200&level=error', 'log ของแอป'],
  ['POST /api/cmd/<name> {...}', 'สั่งงานหน้ากราฟ: view, open_chart, candles, analysis, bounce, draw, clear_drawings, plan'],
  ['GET /api/screenshot', 'ภาพกราฟปัจจุบัน (PNG base64)'],
  ['GET /api/stream', 'สตรีม real-time (Server-Sent Events): quote, signal, alert (+log ถ้า ?logs=1)'],
];

function dashboardHtml(cfg) {
  const tk = cfg.token ? `?token=${encodeURIComponent(cfg.token)}` : '';
  return `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Price Tracker API</title><style>
body{font:14px -apple-system,sans-serif;background:#0f1115;color:#d6d9e0;margin:0;padding:20px;max-width:900px}
h1{font-size:20px}code,pre{background:#1c2030;padding:2px 6px;border-radius:4px}pre{padding:10px;overflow:auto}
table{border-collapse:collapse;width:100%}td,th{padding:6px 8px;border-bottom:1px solid #232734;text-align:left}
.up{color:#26a69a}.down{color:#ef5350}#q td:not(:first-child){text-align:right;font-variant-numeric:tabular-nums}
</style></head><body>
<h1>Price Tracker — Local API</h1>
<p>ราคาสดจากแอป (หน้านี้อัปเดตผ่าน <code>/api/stream</code>)</p>
<table id="q"><thead><tr><th>Symbol</th><th>Bid</th><th>Ask</th><th>%</th><th>เวลา</th></tr></thead><tbody></tbody></table>
<h2>Endpoints</h2><table>${ENDPOINTS.map(([a, b]) => `<tr><td><code>${a}</code></td><td>${b}</td></tr>`).join('')}</table>
<h2>ตัวอย่าง</h2>
<pre>curl ${cfg.token ? `-H "Authorization: Bearer ${cfg.token}" ` : ''}http://127.0.0.1:${cfg.port}/api/quotes</pre>
<pre>import requests, json, sseclient  # pip install sseclient-py requests
r = requests.get("http://127.0.0.1:${cfg.port}/api/stream${tk}", stream=True)
for ev in sseclient.SSEClient(r).events():
    if ev.event == "quote": print(json.loads(ev.data))</pre>
<script>
const rows={};const tb=document.querySelector('#q tbody');
function put(q){let r=rows[q.symbol];if(!r){r=rows[q.symbol]=tb.insertRow();for(let i=0;i<5;i++)r.insertCell();r.cells[0].textContent=q.symbol;}
r.cells[1].textContent=q.bid.toFixed(q.digits);r.cells[2].textContent=q.ask.toFixed(q.digits);
r.cells[3].textContent=(q.changePct>=0?'+':'')+q.changePct.toFixed(2);r.cells[3].className=q.changePct>=0?'up':'down';
r.cells[4].textContent=new Date(q.time).toLocaleTimeString();}
fetch('/api/quotes${tk}').then(r=>r.json()).then(o=>Object.values(o).forEach(put));
const es=new EventSource('/api/stream${tk}');es.addEventListener('quote',e=>put(JSON.parse(e.data)));
</script></body></html>`;
}

module.exports = { listening: () => isListening, start, stop, broadcast, ENDPOINTS };
