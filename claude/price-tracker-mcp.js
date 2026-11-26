#!/usr/bin/env node
// Price Tracker — MCP server for Claude (Claude Desktop / Claude Code).
// Speaks the Model Context Protocol over stdio (newline-delimited JSON-RPC 2.0) and forwards tool calls to the
// Price Tracker app's local API (127.0.0.1). No dependencies: run it with Node, or with the app itself:
//   ELECTRON_RUN_AS_NODE=1 "/Applications/Price Tracker.app/Contents/MacOS/Price Tracker" price-tracker-mcp.js
// Env: PT_API_URL (default http://127.0.0.1:8787), PT_API_TOKEN (the token shown in the app's API settings).
'use strict';
const http = require('http');

const API = (process.env.PT_API_URL || 'http://127.0.0.1:8787').replace(/\/+$/, '');
const TOKEN = process.env.PT_API_TOKEN || '';
const VERSION = '1.0.0';

function call(method, path, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(API + path);
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method,
      headers: { ...(TOKEN ? { Authorization: 'Bearer ' + TOKEN } : {}), ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}) },
      timeout: 30000 }, (res) => {
      let b = ''; res.setEncoding('utf8');
      res.on('data', (d) => (b += d));
      res.on('end', () => {
        let j; try { j = b ? JSON.parse(b) : {}; } catch (_) { j = { raw: b }; }
        if (res.statusCode >= 400) reject(new Error((j && j.error) || 'HTTP ' + res.statusCode)); else resolve(j);
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (e) => reject(new Error(e.code === 'ECONNREFUSED'
      ? 'ต่อแอป Price Tracker ไม่ได้ — เปิดแอปบน Mac และเปิด Local API (ตั้งค่า → API) ก่อน (' + API + ')' : e.message)));
    if (data) req.write(data);
    req.end();
  });
}
const cmd = (name, args) => call('POST', '/api/cmd/' + name, args || {});

const POINT = { type: 'object', properties: { time: { description: 'UTC unix seconds or ISO time (optional: defaults spread over recent bars)', type: ['number', 'string'] }, price: { type: 'number' } }, required: ['price'] };
const TOOLS = [
  { name: 'get_status', description: 'Connection status of the Price Tracker app (data source, connected, logged in, current symbol).', inputSchema: { type: 'object', properties: {} },
    run: async () => ({ status: await call('GET', '/api/status'), chart: await cmd('view') }) },
  { name: 'get_quotes', description: 'Latest bid/ask for the watchlist, or one symbol.', inputSchema: { type: 'object', properties: { symbol: { type: 'string' } } },
    run: (a) => call('GET', a.symbol ? '/api/quotes/' + encodeURIComponent(a.symbol) : '/api/quotes') },
  { name: 'open_chart', description: 'Switch the app chart to a symbol and/or timeframe (1m,5m,15m,1H,4H,1D,1W) and wait for candles. Other chart tools read whatever chart is open.',
    inputSchema: { type: 'object', properties: { symbol: { type: 'string' }, timeframe: { type: 'string', enum: ['1m', '5m', '15m', '1H', '4H', '1D', '1W'] } } },
    run: (a) => cmd('open_chart', a) },
  { name: 'get_candles', description: 'OHLC candles of the open chart (UTC unix seconds). The last candle is still forming.', inputSchema: { type: 'object', properties: { limit: { type: 'number', description: '1-2000, default 200' } } },
    run: (a) => cmd('candles', a) },
  { name: 'get_chart_screenshot', description: 'A PNG picture of the chart exactly as the user sees it (with drawings and overlays).', inputSchema: { type: 'object', properties: {} },
    run: async () => { const r = await call('GET', '/api/screenshot'); return { content: [{ type: 'image', data: r.data, mimeType: r.mimeType }, { type: 'text', text: JSON.stringify(r.view) }] }; } },
  { name: 'get_analysis', description: 'Market structure of the open chart: trend, swings (HH/HL/LH/LL), last BOS/CHoCH, support/resistance zones, recent signals with walk-forward stats.', inputSchema: { type: 'object', properties: {} },
    run: () => cmd('analysis') },
  { name: 'get_bounce_zones', description: 'Bounce finder: ranked buy/sell reaction zones (order block, FVG, S/R, Fibo pocket) with entry/SL/TP/RR, live status, reasons and historical bounce rates; plus liquidity pools (equal highs/lows, PDH/PDL, stop clusters) and recent sweeps.', inputSchema: { type: 'object', properties: {} },
    run: () => cmd('bounce') },
  { name: 'draw_on_chart', description: 'Draw on the user\'s chart to explain an idea. Types: hline(1 point), trend/ray/rect/fib/long/short(2 points), fibext(3), text/arrowUp/arrowDown(1). Drawings are marked as Claude\'s and can be removed with clear_claude_drawings.',
    inputSchema: { type: 'object', properties: {
      type: { type: 'string', enum: ['hline', 'trend', 'ray', 'rect', 'fib', 'fibext', 'text', 'arrowUp', 'arrowDown', 'long', 'short'] },
      points: { type: 'array', items: POINT }, text: { type: 'string', description: 'for type=text' },
      label: { type: 'string', description: 'optional caption shown next to the drawing' }, color: { type: 'string', description: 'hex colour, e.g. #26a69a' } }, required: ['type', 'points'] },
    run: (a) => cmd('draw', a) },
  { name: 'clear_claude_drawings', description: 'Remove the drawings Claude added (the user\'s own drawings stay).', inputSchema: { type: 'object', properties: {} },
    run: () => cmd('clear_drawings', {}) },
  { name: 'calculate_position', description: 'Lot size calculator of the app: risk % (or $) of balance between entry and SL, optional scale-in entries (adds, spacing, mode avg|pyramid). Fills the app\'s calculator tab too.',
    inputSchema: { type: 'object', properties: { side: { type: 'string', enum: ['buy', 'sell'] }, entry: { type: 'number' }, sl: { type: 'number' }, tp1: { type: 'number' }, tp2: { type: 'number' },
      balance: { type: 'number' }, riskPct: { type: 'number' }, adds: { type: 'number' }, spacing: { type: 'number' }, mode: { type: 'string', enum: ['avg', 'pyramid'] } }, required: ['side', 'entry', 'sl'] },
    run: (a) => cmd('plan', a) },
  { name: 'add_symbol', description: 'Add a symbol to the watchlist (e.g. EURUSD, BTCUSD).', inputSchema: { type: 'object', properties: { symbol: { type: 'string' } }, required: ['symbol'] },
    run: (a) => call('POST', '/api/symbols', { symbol: a.symbol }) },
  { name: 'get_logs', description: 'Recent app log lines (connection problems etc.).', inputSchema: { type: 'object', properties: { limit: { type: 'number' }, level: { type: 'string', enum: ['info', 'warn', 'error'] } } },
    run: (a) => call('GET', `/api/logs?limit=${a.limit || 100}${a.level ? '&level=' + a.level : ''}`) },
];

const INSTRUCTIONS = 'Tools for the Price Tracker app (a price-action learning/charting app for VCG Markets / MT5). ' +
  'Typical flow: get_status → open_chart(symbol,timeframe) → get_chart_screenshot / get_analysis / get_bounce_zones → explain, and draw_on_chart to mark zones, levels or Fibonacci for the user. ' +
  'The app has no live trading: calculate_position is a calculator only. Explain in the user\'s language (often Thai). Analysis is educational, not investment advice.';

function send(m) { process.stdout.write(JSON.stringify(m) + '\n'); }
async function onMessage(m) {
  if (!m || m.jsonrpc !== '2.0') return;
  const reply = (result) => m.id != null && send({ jsonrpc: '2.0', id: m.id, result });
  const fail = (code, message) => m.id != null && send({ jsonrpc: '2.0', id: m.id, error: { code, message } });
  switch (m.method) {
    case 'initialize':
      return reply({ protocolVersion: (m.params && m.params.protocolVersion) || '2025-06-18', capabilities: { tools: {} },
        serverInfo: { name: 'price-tracker', version: VERSION }, instructions: INSTRUCTIONS });
    case 'ping': return reply({});
    case 'tools/list': return reply({ tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    case 'tools/call': {
      const t = TOOLS.find((x) => x.name === (m.params && m.params.name));
      if (!t) return fail(-32602, 'unknown tool');
      try {
        const r = await t.run((m.params && m.params.arguments) || {});
        return reply(r && r.content ? r : { content: [{ type: 'text', text: JSON.stringify(r, null, 1) }] });
      } catch (e) { return reply({ content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true }); }
    }
    default:
      if (m.id != null && !String(m.method).startsWith('notifications/')) fail(-32601, 'method not found: ' + m.method);
  }
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => {
  buf += d; let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!line) continue;
    let m; try { m = JSON.parse(line); } catch (_) { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }); continue; }
    onMessage(m);
  }
});
process.stdin.on('end', () => process.exit(0));
