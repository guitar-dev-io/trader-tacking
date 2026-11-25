// Price Tracker — macOS app
// Opens VCG WebTrader in a hidden browser window (it handles login + 15-min token refresh),
// reads the Socket.IO price stream (wss://prod-ws-server.anttix.app, namespace /symbol)
// through the Chrome DevTools protocol, and shows live prices, charts and analysis.

const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell, Notification, net: enet, session } = require('electron');
const path = require('path');
const fs = require('fs');
const log = require('./logger');
const api = require('./api');
const notify = require('./notify');

const { WEBTRADER_URL, WS_HOST, SUB_JS, CONNECTED_JS, FEED_JS, CHART_JS, CHART_REQ_JS, parseQuote } = require('./vcg-inject');

// Look like normal Chrome so sign-in pages (incl. Google) accept the browser.
app.userAgentFallback = app.userAgentFallback
  .replace(/\sElectron\/\S+/, '')
  .replace(/\svcg-price-ticker\/\S+/i, '')
  .replace(/\sVCG Price Ticker\/\S+/i, '')
  .replace(/\sPrice Tracker\/\S+/i, '')
  .replace(/\sprice-tracker\/\S+/i, '');

let mainWin = null;
let traderWin = null;
let tray = null;
let quitting = false;

const state = {
  connected: false,
  loggedIn: false,
  serverSubs: new Set(),
  invalid: new Set(),   // symbols the server never accepted
  quotes: {},          // symbol -> latest quote
  lastTick: 0,
  ticks: 0,
  chart: { symbol: null, tf: null, candles: [] },   // pushed by the window, served by the API
  analysis: null,                                     // pushed by the window, served by the API
};

// ---------------- settings ----------------
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
let settings = {
  symbols: ['XAUUSD', 'EURUSD', 'BTCUSD'], traySymbol: 'XAUUSD', csv: false,
  api: { enabled: false, port: 8787, token: '', lan: false },
  webhook: { url: '', onSignal: true, onAlert: true },
  telegram: { botToken: '', chatId: '', onSignal: true, onAlert: true },
  net: { slowMs: 800, delayMs: 3000, staleSec: 45, stuckSec: 60, notify: true },
  openAtLogin: false,
};
function loadSettings() {
  try {
    const s = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
    settings = { ...settings, ...s, api: { ...settings.api, ...s.api }, webhook: { ...settings.webhook, ...s.webhook }, telegram: { ...settings.telegram, ...s.telegram }, net: { ...settings.net, ...s.net } };
  } catch (_) {}
}
function saveSettings() {
  try { fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2)); } catch (e) { log.error('settings', e.message); }
}

// Quotes are batched and sent to the window every 100 ms (prevents UI lag on fast markets).
let pendingQuotes = {};
setInterval(() => {
  const list = Object.values(pendingQuotes); if (!list.length) return;
  pendingQuotes = {};
  send('quotes', list);
}, 100);

// Quotes arrive from a small listener injected into the WebTrader page (FEED_JS), already batched.
function onQuotes(rawList) {
  for (const raw of rawList) {
    const q = parseQuote(raw);
    if (!settings.symbols.includes(q.symbol)) continue;
    state.quotes[q.symbol] = q;
    state.lastTick = Date.now(); state.ticks++;
    const dl = Date.now() - Date.parse(q.time); if (isFinite(dl)) { netState.delays.push(dl); if (netState.delays.length > 40) netState.delays.shift(); }
    pendingQuotes[q.symbol] = q;
    api.broadcast('quote', q);
    writeCsv(q);
    if (q.symbol === settings.traySymbol) updateTray();
  }
}
function onSubs(list) {
  state.serverSubs = new Set(list || []);
  for (const s of state.serverSubs) { subTries.delete(s); state.invalid.delete(s); }
}

// ---------------- CSV ----------------
const csvDir = () => path.join(app.getPath('documents'), 'Price Tracker');
function writeCsv(q) {
  if (!settings.csv) return;
  try {
    fs.mkdirSync(csvDir(), { recursive: true });
    const f = path.join(csvDir(), `prices-${new Date().toISOString().slice(0, 10)}.csv`);
    const header = fs.existsSync(f) ? '' : 'time,symbol,bid,ask,spread,change,change_pct\n';
    fs.appendFileSync(f, header + [q.time, q.symbol, q.bid, q.ask, q.spread, q.change, q.changePct].join(',') + '\n');
  } catch (e) { log.error('csv', e.message); }
}

// ---------------- UI helpers ----------------
function send(ch, data) {
  if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send(ch, data);
}
function statusObj() {
  return { connected: state.connected, loggedIn: state.loggedIn, csv: settings.csv, symbols: settings.symbols,
    traySymbol: settings.traySymbol, lastTick: state.lastTick, ticks: state.ticks, api: settings.api, invalid: [...state.invalid] };
}
function sendStatus() { send('status', statusObj()); }
function updateTray() {
  if (!tray) return;
  const q = state.quotes[settings.traySymbol];
  const label = settings.traySymbol.replace(/USD$/, '');
  tray.setTitle(q ? ` ${label} ${q.bid.toFixed(q.digits)}` : ` ${label} …`);
}
function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: 'Show Prices', click: showMain },
    { label: 'Open WebTrader / Log in', click: showTrader },
    { type: 'separator' },
    { label: 'Menu bar symbol', submenu: settings.symbols.map((s) => ({
      label: s, type: 'radio', checked: s === settings.traySymbol,
      click: () => { settings.traySymbol = s; saveSettings(); updateTray(); sendStatus(); },
    })) },
    { label: 'Log ticks to CSV', type: 'checkbox', checked: settings.csv,
      click: (i) => { settings.csv = i.checked; saveSettings(); sendStatus(); } },
    { label: 'Open log file', click: () => shell.openPath(log.file()) },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } },
  ]);
}
function refreshTrayMenu() { if (tray) tray.setContextMenu(buildTrayMenu()); }

function showMain() { if (mainWin) { mainWin.show(); mainWin.focus(); } }
function showTrader() { if (traderWin) { traderWin.show(); traderWin.focus(); } }

// ---------------- windows ----------------
function createMain() {
  mainWin = new BrowserWindow({
    width: 1440, height: 880, minWidth: 980, minHeight: 600,
    title: 'Price Tracker', backgroundColor: '#0f1115',
    titleBarStyle: 'hiddenInset',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
  });
  mainWin.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  mainWin.loadFile(path.join(__dirname, 'index.html'));
  mainWin.on('close', (e) => { if (!quitting) { e.preventDefault(); mainWin.hide(); } });
  mainWin.webContents.on('did-finish-load', () => {
    sendStatus();
    send('quotes', Object.values(state.quotes));
    send('logs', log.recent(500));
  });
  mainWin.webContents.on('render-process-gone', (_e, d) => log.error('ui', 'หน้าต่างหลักล่ม', d));
}

function createTrader() {
  traderWin = new BrowserWindow({
    width: 1280, height: 820, show: false, title: 'VCG WebTrader',
    // backgroundThrottling ON: the hidden WebTrader stops drawing its own charts (big CPU saver);
    // the WebSocket keeps streaming normally.
    webPreferences: { partition: 'persist:vcg', backgroundThrottling: true,
      preload: path.join(__dirname, 'trader-preload.js'), contextIsolation: true },
  });
  traderWin.on('close', (e) => { if (!quitting) { e.preventDefault(); traderWin.hide(); } });
  traderWin.webContents.on('did-navigate', (_e, url) => log.info('webtrader', 'เปิดหน้า ' + url));
  traderWin.webContents.on('did-fail-load', (_e, code, desc, url) => log.error('webtrader', `โหลดหน้าไม่สำเร็จ ${code} ${desc}`, url));
  traderWin.webContents.on('render-process-gone', (_e, d) => { log.error('webtrader', 'WebTrader ล่ม — กำลังโหลดใหม่', d); setTimeout(() => traderWin.reload(), 2000); });
  traderWin.webContents.on('console-message', (e) => {
    const m = e.message || '';
    if (/useWebSocket|Socket\.IO|PERMISSION_DENIED|auth:error/.test(m)) log.write(e.level === 'error' ? 'error' : e.level === 'warning' ? 'warn' : 'debug', 'webtrader', m.slice(0, 500));
  });

  traderWin.loadURL(WEBTRADER_URL);
}

// Keep our symbols subscribed and watch login state.



// Price feed: listen on the page's own /symbol socket and post quotes in batches.
// Flushing is driven by incoming data (not timers), so it keeps up even in a hidden, throttled window.

async function ensureFeed() {
  try { const r = await traderWin.webContents.executeJavaScript(FEED_JS, true); if (r === 'ok') log.info('feed', 'ติดตั้งตัวรับราคาในหน้า WebTrader แล้ว'); }
  catch (e) { log.error('feed', 'ensureFeed: ' + e.message); }
}

// Chart history: a second Socket.IO connection (namespace /chart-history), created inside the
// WebTrader page with the same auth the app uses, like the page's own chart does.

let lastChartReq = null;
async function ensureChart() {
  try {
    const r = await traderWin.webContents.executeJavaScript(CHART_JS, true);
    if (r === 'ok') { log.info('chart', 'สร้างการเชื่อมต่อ chart-history'); if (lastChartReq) sendChartReq(lastChartReq); }
  } catch (e) { log.error('chart', 'ensureChart: ' + e.message); }
}
async function sendChartReq(o) {
  lastChartReq = o;
  log.info('chart', `ขอแท่งเทียน ${o.symbol} type=${o.candleType} limit=${o.limit}`, { to: o.to });
  if (!state.connected) return;
  try { await traderWin.webContents.executeJavaScript(CHART_REQ_JS(o), true); } catch (e) { log.error('chart', e.message); }
}

const subTries = new Map();
let notConnectedSince = Date.now();
let shownForLogin = false;
let staleWarned = false;
async function tick() {
  if (!traderWin || traderWin.isDestroyed()) return;
  const url = traderWin.webContents.getURL();
  const onTrader = url.includes('/webtrader');
  let connected = false;
  if (onTrader) {
    try { connected = await traderWin.webContents.executeJavaScript(CONNECTED_JS, true); } catch (_) {}
  }
  state.loggedIn = onTrader;
  if (connected !== state.connected) {
    if (!connected && state.connected) netState.reconnects++;
    state.connected = connected;
    log[connected ? 'info' : 'warn']('feed', connected ? 'เชื่อมต่อราคาแล้ว' : 'การเชื่อมต่อราคาหลุด');
    api.broadcast('status', statusObj());
  }
  if (connected) {
    notConnectedSince = Date.now();
    if (shownForLogin) { shownForLogin = false; traderWin.hide(); showMain(); log.info('auth', 'login สำเร็จ ซ่อนหน้าต่าง WebTrader'); }
    await ensureFeed();
    await ensureChart();
    const want = settings.symbols.filter((s) => !state.invalid.has(s));
    const missing = want.filter((s) => !state.serverSubs.has(s));
    if (missing.length) {
      for (const s of missing) {
        const t = (subTries.get(s) || 0) + 1; subTries.set(s, t);
        if (t > 3) { state.invalid.add(s); log.warn('feed', `ไม่พบ ${s} ใน VCG (server ไม่รับ subscribe) — หยุดขอแล้ว ตรวจชื่อ symbol อีกครั้ง`); }
      }
      const merged = [...new Set([...state.serverSubs, ...want.filter((s) => !state.invalid.has(s))])];
      try { await traderWin.webContents.executeJavaScript(SUB_JS(merged), true); log.debug('feed', 'subscribe', merged); } catch (_) {}
    }
    // no ticks for 2 minutes while "connected" → warn once (market may be closed)
    if (state.lastTick && Date.now() - state.lastTick > 120000 && !staleWarned) { staleWarned = true; log.warn('feed', 'ไม่มีราคาเข้ามา 2 นาที (ตลาดปิด หรือการเชื่อมต่อค้าง)'); }
    if (Date.now() - state.lastTick < 120000) staleWarned = false;
  } else if (!onTrader && url && !shownForLogin) {
    shownForLogin = true; showTrader(); log.info('auth', 'ต้อง login — เปิดหน้าต่าง WebTrader');
  } else if (onTrader && Date.now() - notConnectedSince > settings.net.stuckSec * 1000) {
    notConnectedSince = Date.now();
    log.warn('feed', `เชื่อมต่อไม่ได้นาน ${settings.net.stuckSec} วินาที — โหลด WebTrader ใหม่`);
    traderWin.webContents.reload();
  }
  sendStatus();
}

// ---------------- symbols ----------------
function addSymbol(s) {
  s = String(s || '').trim().toUpperCase();
  state.invalid.delete(s); subTries.delete(s);
  if (s && !settings.symbols.includes(s)) { settings.symbols.push(s); saveSettings(); refreshTrayMenu(); tick(); log.info('watchlist', 'เพิ่ม ' + s); }
  sendStatus();
}
function removeSymbol(s) {
  s = String(s || '').toUpperCase();
  settings.symbols = settings.symbols.filter((x) => x !== s);
  delete state.quotes[s];
  if (settings.traySymbol === s) settings.traySymbol = settings.symbols[0] || '';
  saveSettings(); refreshTrayMenu(); updateTray(); sendStatus(); log.info('watchlist', 'ลบ ' + s);
}

// ---------------- API ----------------
const apiHooks = {
  status: statusObj,
  quotes: () => state.quotes,
  symbols: () => settings.symbols,
  addSymbol, removeSymbol,
  chart: () => state.chart,
  analysis: () => state.analysis || { note: 'ยังไม่มีผลวิเคราะห์ (เปิดกราฟในแอปก่อน)' },
};
function restartApi() { api.start(settings.api, apiHooks); }

// ---------------- IPC ----------------
ipcMain.on('add-symbol', (_e, s) => addSymbol(s));
ipcMain.on('remove-symbol', (_e, s) => removeSymbol(s));
ipcMain.on('set-tray', (_e, s) => { settings.traySymbol = s; saveSettings(); refreshTrayMenu(); updateTray(); sendStatus(); });
ipcMain.on('toggle-csv', () => { settings.csv = !settings.csv; saveSettings(); refreshTrayMenu(); sendStatus(); log.info('csv', settings.csv ? 'เปิดบันทึก CSV' : 'ปิดบันทึก CSV'); });
ipcMain.on('open-csv', () => { fs.mkdirSync(csvDir(), { recursive: true }); shell.openPath(csvDir()); });
ipcMain.on('show-trader', showTrader);
ipcMain.on('reload-trader', () => { log.info('feed', 'ผู้ใช้สั่งเชื่อมต่อใหม่'); traderWin && traderWin.webContents.reload(); });
ipcMain.on('chart-msg', (_e, m) => {
  if (m.type === 'quotes') return onQuotes(m.data || []);
  if (m.type === 'subs') return onSubs(m.data);
  if (m.type === 'feedError') { log.error('feed', 'symbol:error', m.data); return; }
  if (m.type === 'chartError') log.error('chart', 'chart:error', m.data);
  else if (m.type === 'chartAuthRenew') log.warn('chart', 'token หมดอายุ (PERMISSION_DENIED) — กำลังขอ token ใหม่และโหลดซ้ำ');
  else if (m.type === 'chartLog') log.info('chart', String(m.data));
  else if (m.type === 'chartConnected') log.info('chart', 'chart-history เชื่อมต่อแล้ว');
  else if (m.type === 'chartDisconnected' || m.type === 'chartConnectError') log.warn('chart', m.type, m.data);
  send('chart', m);
});
ipcMain.on('chart-request', (_e, o) => sendChartReq(o));
ipcMain.on('chart-data', (_e, d) => { state.chart = d; });
ipcMain.on('analysis', (_e, a) => { state.analysis = a; });
ipcMain.on('log', (_e, e) => log.write(e.level || 'info', e.source || 'ui', e.msg, e.data));
ipcMain.on('open-log-file', () => shell.openPath(log.file()));
ipcMain.on('open-log-folder', () => shell.showItemInFolder(log.file()));
ipcMain.handle('get-settings', () => ({ api: settings.api, webhook: settings.webhook, telegram: settings.telegram, net: settings.net, openAtLogin: settings.openAtLogin, version: app.getVersion(), logFile: log.file(), userData: app.getPath('userData') }));
ipcMain.handle('set-settings', (_e, s) => {
  const apiChanged = JSON.stringify(s.api) !== JSON.stringify(settings.api);
  settings.api = { ...settings.api, ...s.api, port: Math.max(1024, Math.min(65535, parseInt(s.api.port, 10) || 8787)) };
  settings.webhook = { ...settings.webhook, ...s.webhook };
  settings.telegram = { ...settings.telegram, ...s.telegram };
  if (s.net) settings.net = { ...settings.net, ...s.net };
  if (typeof s.openAtLogin === 'boolean' && s.openAtLogin !== settings.openAtLogin) {
    settings.openAtLogin = s.openAtLogin;
    try { app.setLoginItemSettings({ openAtLogin: s.openAtLogin }); } catch (e) { log.warn('settings', 'ตั้งเปิดพร้อมเครื่องไม่สำเร็จ: ' + e.message); }
  }
  saveSettings(); log.info('settings', 'บันทึกการตั้งค่า API/แจ้งเตือน');
  if (apiChanged) restartApi();
  sendStatus();
  return true;
});
// small allowlisted JSON fetcher for the window (economic calendar, update check, demo data) — no CORS issues here
const FETCH_HOSTS = ['nfs.faireconomy.media', 'api.github.com', 'api.binance.com', 'data-api.binance.vision'];
ipcMain.handle('fetch-json', async (_e, url) => {
  const u = new URL(url);
  if (u.protocol !== 'https:' || !FETCH_HOSTS.includes(u.hostname)) throw new Error('host not allowed: ' + u.hostname);
  const r = await enet.fetch(url, { headers: { 'User-Agent': 'PriceTracker', Accept: 'application/json' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
});
ipcMain.handle('sign-out', async () => {
  log.warn('auth', 'ผู้ใช้สั่งออกจากระบบ — ล้าง session ของ WebTrader');
  await session.fromPartition('persist:vcg').clearStorageData();
  state.connected = false; traderWin.loadURL(WEBTRADER_URL);
  return true;
});
ipcMain.handle('notify', async (_e, { event, payload, text }) => {
  api.broadcast(event, payload);
  return notify.send(settings, event, payload, text);
});

// ---------------- network monitor ----------------
const netState = { rtt: null, fails: 0, delays: [], reconnects: 0, level: 'ok', detail: '' };
const median = (a) => { if (!a.length) return null; const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
async function probe() {
  const t0 = Date.now(), ac = new AbortController(), to = setTimeout(() => ac.abort(), 8000);
  try {
    await enet.fetch('https://vcgmarkets.com/favicon.ico?_=' + t0, { method: 'HEAD', cache: 'no-store', signal: ac.signal, partition: 'persist:vcg' });
    netState.rtt = Date.now() - t0; netState.fails = 0;
  } catch (_) { netState.fails++; netState.rtt = null; }
  clearTimeout(to);
}
function hasCrypto() { return settings.symbols.some((s) => /^(BTC|ETH|SOL|LTC|XRP|BNB|ADA|DOGE)/.test(s)); }
function fxWeekend() { const d = new Date(), wd = d.getUTCDay(), h = d.getUTCHours(); return wd === 6 || (wd === 0 && h < 21) || (wd === 5 && h >= 22); }
function evalNet() {
  const n = settings.net, delay = median(netState.delays), since = state.lastTick ? (Date.now() - state.lastTick) / 1000 : null;
  let level = 'ok', detail = '';
  if (netState.fails >= 2) { level = 'offline'; detail = 'ติดต่อเซิร์ฟเวอร์ VCG ไม่ได้ (อินเทอร์เน็ตหลุด?)'; }
  else if (state.loggedIn && !state.connected) { level = 'down'; detail = 'การเชื่อมต่อราคาหลุด กำลังต่อใหม่'; }
  else if (state.connected && since != null && since > n.staleSec && (hasCrypto() || !fxWeekend())) { level = 'stale'; detail = `ไม่มีราคาใหม่ ${Math.round(since)} วินาที`; }
  else if ((netState.rtt != null && netState.rtt > n.slowMs) || (delay != null && delay > n.delayMs)) { level = 'slow'; detail = `เน็ตช้า: ping ${netState.rtt ?? '—'} ms, ราคาหน่วง ~${delay ?? '—'} ms`; }
  if (level !== netState.level) {
    const worse = ['ok', 'slow', 'stale', 'down', 'offline'].indexOf(level) > ['ok', 'slow', 'stale', 'down', 'offline'].indexOf(netState.level);
    log[level === 'ok' ? 'info' : 'warn']('network', level === 'ok' ? 'การเชื่อมต่อกลับมาปกติ' : detail);
    if (worse && n.notify && Notification.isSupported()) new Notification({ title: 'Price Tracker — การเชื่อมต่อ', body: detail }).show();
    netState.level = level;
  }
  netState.detail = detail;
  let cpu = null;
  try {
    const ms = app.getAppMetrics(), pid = (w) => (w && !w.isDestroyed() ? w.webContents.getOSProcessId() : -1);
    const by = (p) => { const m = ms.find((x) => x.pid === p); return m ? Math.round(m.cpu.percentCPUUsage) : null; };
    const browser = ms.find((x) => x.type === 'Browser'), gpu = ms.find((x) => x.type === 'GPU');
    cpu = { app: browser ? Math.round(browser.cpu.percentCPUUsage) : null, ui: by(pid(mainWin)), webtrader: by(pid(traderWin)), gpu: gpu ? Math.round(gpu.cpu.percentCPUUsage) : null };
  } catch (_) {}
  const st = { cpu, level, detail, rtt: netState.rtt, feedDelay: delay, lastTickAgo: since, reconnects: netState.reconnects, connected: state.connected };
  send('net', st); api.broadcast('network', st);
}
setInterval(probe, 10000);
setInterval(evalNet, 2000);

// forward logs to the window in batches
let pendingLogs = [];
log.onLog((e) => { pendingLogs.push(e); api.broadcast('log', e); });
setInterval(() => { if (pendingLogs.length) { send('logs', pendingLogs); pendingLogs = []; } }, 500);

// ---------------- app ----------------
app.whenReady().then(() => {
  log.init(path.join(app.getPath('userData'), 'logs'));
  loadSettings();
  log.info('app', `เริ่มโปรแกรม v${app.getVersion()} (Electron ${process.versions.electron}, ${process.platform}/${process.arch})`);
  tray = new Tray(nativeImage.createEmpty());
  tray.setToolTip('Price Tracker');
  refreshTrayMenu();
  updateTray();
  createMain();
  createTrader();
  restartApi();
  probe();
  setInterval(tick, 3000);
});
process.on('uncaughtException', (e) => log.error('app', 'uncaughtException: ' + e.stack));
process.on('unhandledRejection', (e) => log.error('app', 'unhandledRejection: ' + (e && e.stack || e)));
app.on('activate', showMain);
app.on('before-quit', () => { quitting = true; api.stop(); log.info('app', 'ปิดโปรแกรม'); });
app.on('window-all-closed', () => {});
