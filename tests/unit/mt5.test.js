// MT5 bridge server against a fake EA speaking the PriceTrackerBridge protocol.
const test = require('node:test'), assert = require('node:assert'), net = require('node:net');
process.env.PT_LOG_DIR = require('node:os').tmpdir();
const mt5 = require('../../mt5.js');

test('EA hello → watch, ticks become quotes, HIST → candles', async () => {
  const quotes = [], charts = []; const port = 17000 + Math.floor(Math.random() * 2000);
  mt5.start(port, { symbols: () => ['XAUUSD.m'], quote: (q) => quotes.push(q), chart: (c) => charts.push(c), status: () => {} });
  await new Promise((r) => setTimeout(r, 100));
  const cmds = [];
  const sock = net.connect(port, '127.0.0.1');
  await new Promise((r) => sock.on('connect', r));
  let buf = '';
  sock.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); cmds.push(line);
    const f = line.split('|');
    if (f[0] === 'HIST') { const [, id, sym, tf] = f; const t0 = 1.7e9; sock.write(JSON.stringify({ t: 'bars', id: +id, s: sym, tf, dg: 2, bars: [[t0, 1, 2, 0.5, 1.5], [t0 + 3600, 1.5, 2.5, 1, 2]] }) + '\n'); } } });
  sock.write(JSON.stringify({ t: 'hello', v: 1, broker: 'Test', server: 'T-1', offset: 0, symbols: ['XAUUSD.m'] }) + '\n');
  await new Promise((r) => setTimeout(r, 100));
  sock.write(JSON.stringify({ t: 'tick', s: 'XAUUSD.m', bid: 3500.1, ask: 3500.3, ms: Date.now(), dg: 2 }) + '\n');
  mt5.request({ symbol: 'XAUUSD.m', candleType: 3, limit: 2, to: new Date().toISOString(), inclusive: true, slot: 'main' });
  await new Promise((r) => setTimeout(r, 200));
  assert.ok(cmds.some((c) => c.startsWith('WATCH|XAUUSD.m')), 'WATCH sent');
  assert.equal(quotes[0].symbol, 'XAUUSD.m'); assert.equal(quotes[0].bid, 3500.1);
  const h = charts.find((c) => c.type === 'chart' && c.data.history);
  assert.ok(h && h.data.history.candles.length === 2, 'history delivered');
  assert.ok(mt5.status().connected);
  sock.end(); mt5.stop();
});

test('finds MT5 Experts folders in macOS Wine bottles (MetaQuotes app, broker-branded, terminal data folders)', () => {
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-home-'));
  const mk = (...p) => fs.mkdirSync(path.join(home, ...p), { recursive: true });
  const AS = ['Library', 'Application Support'];
  mk(...AS, 'net.metaquotes.wine.metatrader5', 'drive_c', 'Program Files', 'MetaTrader 5', 'MQL5', 'Experts');
  mk(...AS, 'com.brex.mt5', 'drive_c', 'users', 'user', 'AppData', 'Roaming', 'MetaQuotes', 'Terminal', 'ABC123', 'MQL5', 'Experts');
  mk(...AS, 'Slack', 'Cache');                                           // unrelated app
  const dirs = mt5.findExpertDirs({ home, platform: 'darwin' });
  assert.equal(dirs.length, 2);
  assert.ok(dirs.some((d) => d.includes('MetaTrader 5')) && dirs.some((d) => d.includes('ABC123')));
  assert.deepEqual(mt5.findExpertDirs({ home: path.join(home, 'nope'), platform: 'darwin' }), []);
});

test('resolve maps watchlist names to broker MT5 names', () => {
  const { resolve } = require('../../mt5');
  const L = ['XAUUSDbrex.', 'EURUSDbrex.', 'BTCUSD'];
  assert.equal(resolve('XAUUSD', L), 'XAUUSDbrex.');
  assert.equal(resolve('XAUUSDBREX.', L), 'XAUUSDbrex.');
  assert.equal(resolve('BTCUSD', L), 'BTCUSD');
  assert.equal(resolve('GBPJPY', L), 'GBPJPY');
});
