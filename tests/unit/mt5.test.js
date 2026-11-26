// MT5 bridge server against a fake EA speaking the PriceTrackerBridge protocol.
const test = require('node:test'), assert = require('node:assert'), net = require('node:net');
process.env.PT_LOG_DIR = require('node:os').tmpdir();
const mt5 = require('../../gen/main/mt5.js');

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
  const { resolve } = require('../../gen/main/mt5.js');
  const L = ['XAUUSDbrex.', 'EURUSDbrex.', 'BTCUSD'];
  assert.equal(resolve('XAUUSD', L), 'XAUUSDbrex.');
  assert.equal(resolve('XAUUSDBREX.', L), 'XAUUSDbrex.');
  assert.equal(resolve('BTCUSD', L), 'BTCUSD');
  assert.equal(resolve('GBPJPY', L), 'GBPJPY');
});

test('planLaunch builds a Wine command for a macOS MT5 bottle', () => {
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mt5-'));
  const inst = path.join(root, 'bottle', 'drive_c', 'Program Files', 'MetaTrader 5'), exp = path.join(inst, 'MQL5', 'Experts');
  fs.mkdirSync(exp, { recursive: true }); fs.writeFileSync(path.join(inst, 'terminal64.exe'), ''); fs.writeFileSync(path.join(inst, 'MetaEditor64.exe'), '');
  const bin = path.join(root, 'MetaTrader 5.app', 'Contents', 'SharedSupport', 'wine', 'bin'); fs.mkdirSync(bin, { recursive: true }); fs.writeFileSync(path.join(bin, 'wine64'), '');
  const p = mt5.planLaunch({ expertsDir: exp, platform: 'darwin', appBundles: [path.join(root, 'MetaTrader 5.app')], symbol: 'XAUUSDbrex.' });
  assert.equal(p.launch.cmd, path.join(bin, 'wine64'));
  assert.equal(p.env.WINEPREFIX, path.join(root, 'bottle'));
  assert.deepEqual(p.launch.args, ['C:\\Program Files\\MetaTrader 5\\terminal64.exe', '/portable', '/config:C:\\Program Files\\MetaTrader 5\\config\\pricetracker-start.ini']);
  assert.match(p.compile.args[1], /^\/compile:C:\\Program Files\\MetaTrader 5\\MQL5\\Experts\\PriceTrackerBridge\.mq5$/);
  assert.match(p.ini, /Expert=PriceTrackerBridge\r\nSymbol=XAUUSDbrex\.\r\nPeriod=M5/);
  assert.equal(mt5.planLaunch({ expertsDir: exp, platform: 'darwin', appBundles: [] }).missing, 'wine');
});

test('planLaunch on Windows: portable install and AppData data folder', () => {
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mt5w-'));
  const port = path.join(root, 'MT5'), exp = path.join(port, 'MQL5', 'Experts'); fs.mkdirSync(exp, { recursive: true }); fs.writeFileSync(path.join(port, 'terminal64.exe'), '');
  const p = mt5.planLaunch({ expertsDir: exp, platform: 'win32' });
  assert.equal(p.launch.cmd, path.join(port, 'terminal64.exe'));
  assert.equal(p.launch.args[0], '/portable');
  const inst = path.join(root, 'Program Files', 'MetaTrader 5'); fs.mkdirSync(inst, { recursive: true }); fs.writeFileSync(path.join(inst, 'terminal64.exe'), '');
  const data = path.join(root, 'AppData', 'MetaQuotes', 'Terminal', 'ABC123'), exp2 = path.join(data, 'MQL5', 'Experts'); fs.mkdirSync(exp2, { recursive: true });
  fs.writeFileSync(path.join(data, 'origin.txt'), Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(inst, 'utf16le')]));
  const q = mt5.planLaunch({ expertsDir: exp2, platform: 'win32' });
  assert.equal(q.launch.cmd, path.join(inst, 'terminal64.exe'));
  assert.ok(!q.launch.args.includes('/portable'));
});

test('EA v2: positions push (POS|1) and deal history (DEALS) are read-only requests', async () => {
  const port = 19500 + Math.floor(Math.random() * 400), pushed = [];
  mt5.start(port, { symbols: () => [], quote: () => {}, chart: () => {}, status: () => {}, positions: (p) => pushed.push(p) });
  mt5.positions(true);                                   // asked before the EA connects
  await new Promise((r) => setTimeout(r, 100));
  const sock = net.connect(port, '127.0.0.1'); await new Promise((r) => sock.on('connect', r));
  const cmds = []; let buf = '';
  sock.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); cmds.push(line); const f = line.split('|');
    if (f[0] === 'POS') sock.write(JSON.stringify({ t: 'pos', acct: { currency: 'USD', balance: 1000, equity: 990.5, demo: true }, positions: [{ ticket: 1, s: 'XAUUSDbrex.', side: 'buy', vol: 0.01, open: 3581.39, sl: 3570, tp: 0, price: 3570.55, profit: -10.84, swap: 0, time: 1.79e9 }], orders: [] }) + '\n');
    if (f[0] === 'DEALS') sock.write(JSON.stringify({ t: 'deals', id: +f[1], deals: [{ ticket: 9, pos: 1, s: 'XAUUSDbrex.', side: 'buy', entry: 'in', vol: 0.01, price: 3581.39, profit: 0, commission: 0, swap: 0, time: 1.79e9 }] }) + '\n'); } });
  sock.write(JSON.stringify({ t: 'hello', v: 2, caps: ['pos', 'deals'], broker: 'Brex', server: 'B-1', offset: 7200, symbols: ['XAUUSDbrex.'] }) + '\n');
  await new Promise((r) => setTimeout(r, 150));
  assert.ok(cmds.includes('POS|1'), 'subscribed on hello');
  assert.equal(pushed.at(-1).positions[0].profit, -10.84);
  assert.equal(mt5.getPositions().acct.equity, 990.5);
  const d = await mt5.deals(1.78e9, 0);
  assert.equal(d[0].entry, 'in');
  assert.ok(cmds.every((c) => /^(WATCH|POS|DEALS|SUB|HIST|PING)\b/.test(c)), 'only read commands sent: ' + cmds.join(','));
  sock.destroy(); await new Promise((r) => setTimeout(r, 50));
  assert.equal(mt5.getPositions(), null, 'cleared on disconnect');
  mt5.stop();
});
