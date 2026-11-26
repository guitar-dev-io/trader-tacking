// Price Tracker — desktop app (macOS + Windows)
// Opens VCG WebTrader in a hidden browser window (it handles login + 15-min token refresh),
// reads the Socket.IO price stream (wss://prod-ws-server.anttix.app, namespace /symbol)
// through the Chrome DevTools protocol, and shows live prices, charts and analysis.

import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell, Notification, net as enet, session, dialog } from 'electron';
import type { IpcMainEvent, IpcMainInvokeEvent, MenuItem } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import log from './logger';
import api from './api';
import type { ApiHooks } from './api';
import notify from './notify';
import * as mt5 from './mt5';
import type { LaunchPlan, Mt5Info } from './mt5';
import * as mt5Auto from './mt5-auto';
import * as eaUpd from './ea-update';
import { createJournal } from './journal-store';
import type { Journal } from './journal-store';
import * as J from '../core/journal';
import VCGI from '../vcg-inject';
import type { InvokeArgs, InvokeChannel, InvokeResult, PushMap, SendMap, TraderMsg } from './ipc';
import type { LogEntry } from './types';
import type { AppStatus, ApiCmdResult, ChartMsg, ChartRequest, ClaudeSetupResult, LogLevel, McpEntry, NetLevel, NetReport, Quote, Settings, SettingsPatch, Source, Step, StepsResult } from './types';
import type { RawQuote } from '../vcg-inject';

// compiled to <app>/gen/main/main.js: app files (renderer build, EA source, icons) live two folders up
const ROOT = path.join(__dirname, '..', '..');
// typed IPC (see ./ipc.ts): channel names and payloads must match the preload side
function handle<K extends InvokeChannel>(ch: K, fn: (e: IpcMainInvokeEvent, ...args: InvokeArgs<K>) => InvokeResult<K> | Promise<InvokeResult<K>>): void {
  ipcMain.handle(ch, (e, ...args) => fn(e, ...(args as InvokeArgs<K>)));
}
function listen<K extends keyof SendMap>(ch: K, fn: (e: IpcMainEvent, ...args: SendMap[K]) => void): void {
  ipcMain.on(ch, (e, ...args) => fn(e, ...(args as SendMap[K])));
}
const IS_WIN = process.platform === 'win32', IS_MAC = process.platform === 'darwin';

// Portable Windows build: keep settings/logs/login next to the .exe instead of %APPDATA%.
//  - portable .exe: electron-builder sets PORTABLE_EXECUTABLE_DIR
//  - zip: create a folder named "Price Tracker Data" next to Price Tracker.exe to make it portable
(() => {
  const base = process.env.PORTABLE_EXECUTABLE_DIR || (IS_WIN && path.dirname(process.execPath));
  if (!base) return;
  const dir = path.join(base, 'Price Tracker Data');
  if (process.env.PORTABLE_EXECUTABLE_DIR || fs.existsSync(dir)) {
    try { fs.mkdirSync(dir, { recursive: true }); app.setPath('userData', dir); } catch (_) {}
  }
})();
// one copy only: opening the app again just brings the running window back (it lives in the tray)
if (!app.requestSingleInstanceLock()) app.exit(0);
app.on('second-instance', () => showMain());

const { WEBTRADER_URL, SUB_JS, CONNECTED_JS, FEED_JS, CHART_JS, CHART_REQ_JS, parseQuote } = VCGI;

// Look like normal Chrome so sign-in pages (incl. Google) accept the browser.
app.userAgentFallback = app.userAgentFallback
  .replace(/\sElectron\/\S+/, '')
  .replace(/\svcg-price-ticker\/\S+/i, '')
  .replace(/\sVCG Price Ticker\/\S+/i, '')
  .replace(/\sPrice Tracker\/\S+/i, '')
  .replace(/\sprice-tracker\/\S+/i, '');

let mainWin: BrowserWindow | null = null;
let traderWin: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;

const state = {
  connected: false,
  loggedIn: false,
  serverSubs: new Set<string>(),
  invalid: new Set<string>(),   // symbols the server never accepted
  quotes: {} as Record<string, Quote>,          // symbol -> latest quote
  lastTick: 0,
  ticks: 0,
  chart: { symbol: null, tf: null, candles: [] } as unknown,   // pushed by the window, served by the API
  analysis: null as unknown,                                     // pushed by the window, served by the API
};

// ---------------- settings ----------------
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
let settings: Settings = {
  symbols: ['XAUUSD', 'EURUSD', 'BTCUSD'], traySymbol: 'XAUUSD', csv: false,
  api: { enabled: false, port: 8787, token: '', lan: false },
  claude: { enabled: false, token: '' },   // Claude (MCP) access: keeps the local API on for 127.0.0.1 with its own token, independent of the API settings form
  webhook: { url: '', onSignal: true, onAlert: true },
  telegram: { botToken: '', chatId: '', onSignal: true, onAlert: true },
  net: { slowMs: 800, delayMs: 3000, staleSec: 45, stuckSec: 60, notify: true },
  openAtLogin: false,
  source: 'vcg',            // 'vcg' | 'mt5' (Demo is handled in the window)
  mt5: { port: 7788, autoUpdateEA: true, eaAttempted: {}, autoLaunch: true, closeOnQuit: true, eaSeen: false },
};
function loadSettings() {
  try {
    const s = JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) as Partial<Settings>;
    settings = { ...settings, ...s, api: { ...settings.api, ...s.api }, webhook: { ...settings.webhook, ...s.webhook }, telegram: { ...settings.telegram, ...s.telegram }, claude: { ...settings.claude, ...s.claude }, net: { ...settings.net, ...s.net }, mt5: { ...settings.mt5, ...s.mt5 } };
  } catch (_) {}
}
function saveSettings() {
  try { fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2)); } catch (e) { log.error('settings', (e as Error).message); }
}

// Quotes are batched and sent to the window every 100 ms (prevents UI lag on fast markets).
let pendingQuotes: Record<string, Quote> = {};
setInterval(() => {
  const list = Object.values(pendingQuotes); if (!list.length) return;
  pendingQuotes = {};
  send('quotes', list);
}, 100);

// Quotes arrive from a small listener injected into the WebTrader page (FEED_JS), already batched.
function onQuotes(rawList: RawQuote[]): void {
  if (settings.source === 'mt5') return;
  for (const raw of rawList) { const q = parseQuote(raw); if (q.bid != null && q.ask != null) acceptQuote(q as Quote); }
}
function acceptQuote(q: Quote): void {
  {
    // MT5 also reports the broker's exact name (XAUUSDbrex.) next to the watchlist name (XAUUSDBREX.): keep both,
    // so a chart opened with the exact name gets live prices too
    if (!settings.symbols.includes(q.symbol) && !settings.symbols.some((x) => x.toUpperCase() === String(q.symbol).toUpperCase())) return;
    state.quotes[q.symbol] = q;
    if (state.invalid.has(q.symbol)) state.invalid.delete(q.symbol);
    subTries.delete(q.symbol);
    state.lastTick = Date.now(); state.ticks++;
    const dl = Date.now() - Date.parse(q.time); if (isFinite(dl)) { netState.delays.push(dl); if (netState.delays.length > 40) netState.delays.shift(); netState.base.push(dl); if (netState.base.length > 600) netState.base.shift(); }
    pendingQuotes[q.symbol] = q;
    api.broadcast('quote', q);
    writeCsv(q);
    if (q.symbol === settings.traySymbol) updateTray();
  }
}
function onSubs(list: string[] | null | undefined): void {
  state.serverSubs = new Set(list || []);
  for (const s of state.serverSubs) { subTries.delete(s); state.invalid.delete(s); }
}

// ---------------- CSV ----------------
const csvDir = () => path.join(app.getPath('documents'), 'Price Tracker');
function writeCsv(q: Quote): void {
  if (!settings.csv) return;
  try {
    fs.mkdirSync(csvDir(), { recursive: true });
    const f = path.join(csvDir(), `prices-${new Date().toISOString().slice(0, 10)}.csv`);
    const header = fs.existsSync(f) ? '' : 'time,symbol,bid,ask,spread,change,change_pct\n';
    fs.appendFileSync(f, header + [q.time, q.symbol, q.bid, q.ask, q.spread, q.change, q.changePct].join(',') + '\n');
  } catch (e) { log.error('csv', (e as Error).message); }
}

// ---------------- UI helpers ----------------
function send<K extends keyof PushMap>(ch: K, data: PushMap[K]): void {
  if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send(ch, data);
}
function statusObj(): AppStatus {
  return { version: app.getVersion(), stage: state.connected ? 'connected' : state.loggedIn ? 'connecting' : 'login', connected: state.connected, loggedIn: state.loggedIn, csv: settings.csv, symbols: settings.symbols,
    traySymbol: settings.traySymbol, lastTick: state.lastTick, ticks: state.ticks, api: { ...settings.api, token: settings.api.token ? '***' : '' }, invalid: [...state.invalid], net: { level: netState.level, detail: netState.detail, pingMs: netState.rtt }, arch: process.arch, rosetta: !!app.runningUnderARM64Translation, bootSec: feedReadyAt ? +((feedReadyAt - BOOT) / 1000).toFixed(1) : null, source: settings.source, mt5: mt5.status() };
}
function sendStatus(): void { send('status', statusObj()); }
function updateTray(): void {
  if (!tray) return;
  const q = state.quotes[settings.traySymbol];
  const label = settings.traySymbol.replace(/USD$/, '');
  const txt = q ? `${label} ${q.bid.toFixed(q.digits)}` : `${label} …`;
  if (IS_MAC) tray.setTitle(' ' + txt); else tray.setToolTip('Price Tracker — ' + txt);
}
function buildTrayMenu(): Menu {
  return Menu.buildFromTemplate([
    { label: 'Show Prices', click: showMain },
    { label: 'Open WebTrader / Log in', click: showTrader },
    { type: 'separator' },
    { label: 'Menu bar symbol', submenu: settings.symbols.map((s) => ({
      label: s, type: 'radio', checked: s === settings.traySymbol,
      click: () => { settings.traySymbol = s; saveSettings(); updateTray(); sendStatus(); },
    })) },
    { label: 'Log ticks to CSV', type: 'checkbox', checked: settings.csv,
      click: (i: MenuItem) => { settings.csv = i.checked; saveSettings(); sendStatus(); } },
    { label: 'Open log file', click: () => { const f = log.file(); if (f) void shell.openPath(f); } },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } },
  ]);
}
function refreshTrayMenu(): void { if (tray) tray.setContextMenu(buildTrayMenu()); }

function showMain(): void { if (mainWin) { mainWin.show(); mainWin.focus(); } }
function showTrader(): void { if (traderWin) { traderWin.show(); traderWin.focus(); } }

// ---------------- windows ----------------
function createMain(): void {
  const win = new BrowserWindow({
    width: 1440, height: 880, minWidth: 980, minHeight: 600,
    title: 'Price Tracker', backgroundColor: '#0f1115',
    ...(IS_MAC ? { titleBarStyle: 'hiddenInset' } : { titleBarStyle: 'hidden', titleBarOverlay: { color: '#0f1115', symbolColor: '#d6d9e0', height: 38 }, autoHideMenuBar: true, icon: path.join(ROOT, 'assets', 'tray@2x.png') }),
    webPreferences: { preload: path.join(ROOT, 'preload.js'), contextIsolation: true },
  });
  mainWin = win;
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) void shell.openExternal(url); return { action: 'deny' }; });
  // renderer: Vite dev server in `npm run dev`, otherwise the built files (npm run build:renderer → dist-renderer/)
  if (process.env.VITE_DEV_SERVER_URL) void win.loadURL(process.env.VITE_DEV_SERVER_URL);
  else void win.loadFile(path.join(ROOT, 'dist-renderer', 'index.html'));
  win.on('close', (e) => { if (!quitting) { e.preventDefault(); win.hide(); } });
  win.webContents.on('did-finish-load', () => {
    sendStatus();
    send('quotes', Object.values(state.quotes));
    send('logs', log.recent(500));
  });
  win.webContents.on('render-process-gone', (_e, d) => log.error('ui', 'หน้าต่างหลักล่ม', d));
}

function createTrader(): void {
  const win = new BrowserWindow({
    width: 1280, height: 820, show: false, title: 'VCG WebTrader',
    // backgroundThrottling ON: the hidden WebTrader stops drawing its own charts (big CPU saver);
    // the WebSocket keeps streaming normally.
    // throttling stays OFF while the page boots (timers in a hidden throttled page run at most 1×/s, which made
    // VCG's own start-up take 10–20 s); switched on once our feed is installed and prices flow (see tick()).
    webPreferences: { partition: 'persist:vcg', backgroundThrottling: false,
      preload: path.join(ROOT, 'trader-preload.js'), contextIsolation: true },
  });
  traderWin = win;
  win.on('close', (e) => { if (!quitting) { e.preventDefault(); win.hide(); } });
  win.webContents.on('did-navigate', (_e, url) => log.info('webtrader', 'เปิดหน้า ' + url));
  win.webContents.on('did-fail-load', (_e, code, desc, url) => log.error('webtrader', `โหลดหน้าไม่สำเร็จ ${code} ${desc}`, url));
  win.webContents.on('render-process-gone', (_e, d) => { log.error('webtrader', 'WebTrader ล่ม — กำลังโหลดใหม่', d); setTimeout(() => win.reload(), 2000); });
  win.webContents.on('console-message', (e) => {
    const m = e.message || '';
    if (/useWebSocket|Socket\.IO|PERMISSION_DENIED|auth:error/.test(m)) log.write(e.level === 'error' ? 'error' : e.level === 'warning' ? 'warn' : 'debug', 'webtrader', m.slice(0, 500));
  });

  void win.loadURL(WEBTRADER_URL);
}
/** The hidden WebTrader page (created at start-up, never destroyed while the app runs). */
const trader = (): BrowserWindow | null => (traderWin && !traderWin.isDestroyed() ? traderWin : null);

// Price feed: listen on the page's own /symbol socket and post quotes in batches.
// Flushing is driven by incoming data (not timers), so it keeps up even in a hidden, throttled window.

let feedReadyAt = 0, throttled = false;
/** Run a script in the hidden WebTrader page. */
const runInTrader = (js: string): Promise<unknown> => { const w = trader(); return w ? w.webContents.executeJavaScript(js, true) as Promise<unknown> : Promise.reject(new Error('no WebTrader window')); };
const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));
async function ensureFeed(): Promise<void> {
  try {
    const r = await runInTrader(FEED_JS);
    if (r === 'ok') { feedReadyAt = Date.now(); log.info('feed', `ติดตั้งตัวรับราคาในหน้า WebTrader แล้ว (${((Date.now() - BOOT) / 1000).toFixed(1)} วิหลังเปิดแอป)`); }
    else if (r && !feedReadyAt) feedReadyAt = Date.now();
  } catch (e) { log.error('feed', 'ensureFeed: ' + errMsg(e)); }
}

// Chart history: a second Socket.IO connection (namespace /chart-history), created inside the
// WebTrader page with the same auth the app uses, like the page's own chart does.

const lastChartReq: Record<string, ChartRequest> = {};   // slot → last request
async function ensureChart(): Promise<void> {
  try {
    const r = await runInTrader(CHART_JS);
    if (r === 'ok') { log.info('chart', 'สร้างการเชื่อมต่อ chart-history'); Object.values(lastChartReq).forEach((o) => { void sendChartReq(o); }); }
  } catch (e) { log.error('chart', 'ensureChart: ' + errMsg(e)); }
}
async function sendChartReq(o: ChartRequest): Promise<void> {
  lastChartReq[o.slot || 'main'] = o;
  log.info('chart', `ขอแท่งเทียน ${o.symbol} type=${o.candleType} limit=${o.limit}${o.slot ? ' [' + o.slot + ']' : ''}`, { to: o.to });
  if (!state.connected) return;
  try { await runInTrader(CHART_REQ_JS(o)); } catch (e) { log.error('chart', errMsg(e)); }
}

const subTries = new Map<string, number>();
const BOOT = Date.now();
let notConnectedSince = Date.now();
let shownForLogin = false;
let staleWarned = false;
async function tick(): Promise<void> {
  const tw = trader(); if (!tw) return;
  const url = tw.webContents.getURL();
  const onTrader = url.includes('/webtrader');
  let connected = false;
  if (onTrader) {
    try { connected = await runInTrader(CONNECTED_JS) === true; } catch (_) { /* page busy */ }
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
    if (shownForLogin) { shownForLogin = false; tw.hide(); showMain(); log.info('auth', 'login สำเร็จ ซ่อนหน้าต่าง WebTrader'); }
    await ensureFeed();
    await ensureChart();
    if (!throttled && feedReadyAt && state.lastTick > feedReadyAt) {   // prices flow → let Chromium save CPU on the hidden page again
      throttled = true; try { tw.webContents.setBackgroundThrottling(true); } catch (_) { /* window closing */ }
      log.info('feed', `ราคาแรกมาถึง ${((state.lastTick - BOOT) / 1000).toFixed(1)} วิหลังเปิดแอป`);
    }
    const want = settings.symbols.filter((s) => !state.invalid.has(s));
    const missing = want.filter((s) => !state.serverSubs.has(s) && !(state.quotes[s] && Date.now() - state.lastTick < 60000));
    if (missing.length) {
      const settled = feedReadyAt && Date.now() - feedReadyAt > 15000;   // the server's subscription list arrives a few seconds after start-up
      for (const s of missing) {
        const t = settled ? (subTries.get(s) || 0) + 1 : 0; subTries.set(s, t);
        if (t > 5) { state.invalid.add(s); log.warn('feed', `ไม่พบ ${s} ใน VCG (server ไม่รับ subscribe) — หยุดขอแล้ว ตรวจชื่อ symbol อีกครั้ง`); }
      }
      const merged = [...new Set([...state.serverSubs, ...want.filter((s) => !state.invalid.has(s))])];
      try { await runInTrader(SUB_JS(merged)); log.debug('feed', 'subscribe', merged); } catch (_) { /* retried next tick */ }
    }
    // no ticks for 2 minutes while "connected" → warn once (market may be closed)
    if (state.lastTick && Date.now() - state.lastTick > 120000 && !staleWarned) { staleWarned = true; log.warn('feed', 'ไม่มีราคาเข้ามา 2 นาที (ตลาดปิด หรือการเชื่อมต่อค้าง)'); }
    if (Date.now() - state.lastTick < 120000) staleWarned = false;
  } else if (!onTrader && url && !shownForLogin) {
    shownForLogin = true; showTrader(); log.info('auth', 'ต้อง login — เปิดหน้าต่าง WebTrader');
  } else if (onTrader && Date.now() - notConnectedSince > settings.net.stuckSec * 1000) {
    notConnectedSince = Date.now();
    log.warn('feed', `เชื่อมต่อไม่ได้นาน ${settings.net.stuckSec} วินาที — โหลด WebTrader ใหม่`);
    tw.webContents.reload();
  }
  sendStatus();
}

// ---------------- symbols ----------------
function addSymbol(sym: unknown): void {
  const s = String(sym || '').trim().toUpperCase();
  state.invalid.delete(s); subTries.delete(s);
  if (s && !settings.symbols.includes(s)) { settings.symbols.push(s); saveSettings(); refreshTrayMenu(); void tick(); log.info('watchlist', 'เพิ่ม ' + s); if (settings.source === 'mt5') mt5.watch(settings.symbols); }
  sendStatus();
}
function removeSymbol(sym: unknown): void {
  const s = String(sym || '').toUpperCase();
  settings.symbols = settings.symbols.filter((x) => x !== s);
  delete state.quotes[s];
  if (settings.traySymbol === s) settings.traySymbol = settings.symbols[0] || '';
  saveSettings(); refreshTrayMenu(); updateTray(); sendStatus(); log.info('watchlist', 'ลบ ' + s);
  if (settings.source === 'mt5') mt5.watch(settings.symbols);
}

// ---------------- API ----------------
const apiHooks: ApiHooks = {
  status: statusObj,
  quotes: () => state.quotes,
  symbols: () => settings.symbols,
  addSymbol, removeSymbol,
  chart: () => state.chart,
  positions: async () => {
    if (!mt5.getPositions()) { mt5.positions(true); for (let i = 0; i < 20 && !mt5.getPositions(); i++) await new Promise((r) => setTimeout(r, 100)); }
    return mt5.getPositions() || { note: settings.source === 'mt5' ? 'ยังไม่มีข้อมูล — เปิดแท็บราคาในแอป หรือ EA ใน MT5 เป็นรุ่นเก่า' : 'ใช้ได้เมื่อเลือก MT5 เป็นแหล่งราคา' };
  },
  deals: (from: number, to: number) => mt5.deals(from, to),
  journal: () => {
    const g = mt5.status().connected ? journal().get() : journal().openLast();
    const s = J.stats(J.trades(g.deals), { balanceOps: J.balanceOps(g.deals) });
    const { curve: _curve, byHour: _byHour, ...rest } = s;
    return { account: g.account, syncedAt: g.syncedAt, status: g.status, deals: g.deals.length, stats: { ...rest, byDay: s.byDay.slice(-60) },
      lastSnapshot: g.snapshots[g.snapshots.length - 1] || null };
  },
  analysis: () => state.analysis || { note: 'ยังไม่มีผลวิเคราะห์ (เปิดกราฟในแอปก่อน)' },
  command: rendererCommand,
  screenshot: chartScreenshot,
};

// ---------------- commands for the local API / Claude (MCP): run inside the app window ----------------
interface CmdWaiter { resolve(v: unknown): void; reject(e: Error): void; t: ReturnType<typeof setTimeout> }
let cmdSeq = 0; const cmdWait = new Map<number, CmdWaiter>();
listen('api-cmd-result', (_e, r) => { const w = cmdWait.get(r.id); if (w) { cmdWait.delete(r.id); clearTimeout(w.t); r.error ? w.reject(new Error(r.error)) : w.resolve(r.data); } });
function rendererCommand(name: string, args: Record<string, unknown> = {}, timeoutMs = 20000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const w = mainWin;
    if (!w || w.isDestroyed()) { reject(new Error('หน้าต่างแอปไม่ได้เปิดอยู่')); return; }
    const id = ++cmdSeq;
    cmdWait.set(id, { resolve, reject, t: setTimeout(() => { cmdWait.delete(id); reject(new Error('แอปไม่ตอบ (timeout) — ' + name)); }, timeoutMs) });
    w.webContents.send('api-cmd', { id, name, args });
  });
}
interface Rect { x: number; y: number; width: number; height: number }
async function chartScreenshot(): Promise<{ mimeType: string; data: string; view: unknown }> {
  const r = await rendererCommand('chart_rect') as Rect | null;
  const w = mainWin; if (!w) throw new Error('หน้าต่างแอปไม่ได้เปิดอยู่');
  const img = await w.webContents.capturePage(r && r.width ? { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) } : undefined);
  const out = img.getSize().width > 1400 ? img.resize({ width: 1400 }) : img;
  return { mimeType: 'image/png', data: out.toPNG().toString('base64'), view: await rendererCommand('view') };
}

// ---------------- Claude (MCP) setup: local API on 127.0.0.1 + token, MCP script, Claude Desktop config ----------------
const claudeConfigFile = () => path.join(app.getPath('appData'), 'Claude', 'claude_desktop_config.json');   // mac: ~/Library/Application Support · win: %APPDATA%
function mcpEntry(): McpEntry {
  const script = path.join(app.getPath('userData'), 'claude', 'price-tracker-mcp.js');
  fs.mkdirSync(path.dirname(script), { recursive: true });
  fs.writeFileSync(script, fs.readFileSync(path.join(__dirname, 'price-tracker-mcp.js')));   // gen/main/price-tracker-mcp.js
  return { command: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath, args: [script], env: { ELECTRON_RUN_AS_NODE: '1', PT_API_URL: `http://127.0.0.1:${settings.api.port}`, PT_API_TOKEN: settings.claude.token } };
}
function ensureClaudeApi(): void {
  const c = settings.claude; let changed = false;
  if (!c.enabled) { c.enabled = true; changed = true; }
  if (!c.token) { c.token = crypto.randomBytes(18).toString('base64url'); changed = true; }
  if (changed) { saveSettings(); restartApi(); }
}
// v2.7.0 put Claude's token in the API settings (and saving the settings form could switch it off again):
// adopt the token already written into Claude Desktop's config so the user doesn't have to set it up again
interface ClaudeDesktopConfig { mcpServers?: Record<string, McpEntry | undefined> }
const readClaudeConfig = (): ClaudeDesktopConfig => JSON.parse(fs.readFileSync(claudeConfigFile(), 'utf8')) as ClaudeDesktopConfig;
function adoptClaudeConfig(): void {
  if (settings.claude.enabled) return;
  try {
    const e = (readClaudeConfig().mcpServers || {})['price-tracker'];
    if (e && e.env && e.env.PT_API_TOKEN) {
      settings.claude = { enabled: true, token: e.env.PT_API_TOKEN };
      const port = +((e.env.PT_API_URL || '').split(':').pop() || 0); if (port && port !== settings.api.port && !settings.api.enabled) settings.api.port = port;
      saveSettings(); mcpEntry(); log.info('claude', 'ใช้การเชื่อมต่อ Claude Desktop เดิม');
    }
  } catch (_) { /* no Claude Desktop config */ }
}
handle('claude-setup', (_e, opts = {}) => {
  ensureClaudeApi();
  const entry = mcpEntry();
  const q = (s: unknown): string => `'${String(s).replace(/'/g, `'\\''`)}'`;
  const codeCmd = `claude mcp add price-tracker -s user -e ELECTRON_RUN_AS_NODE=1 -e PT_API_URL=${entry.env.PT_API_URL} -e PT_API_TOKEN=${entry.env.PT_API_TOKEN} -- ${q(entry.command)} ${q(entry.args[0])}`;
  const res: ClaudeSetupResult = { ok: true, entry, codeCmd, desktopConfig: claudeConfigFile(), wroteDesktop: false };
  if (opts.desktop) {
    const f = claudeConfigFile();
    let cfg: ClaudeDesktopConfig = {};
    try { if (fs.existsSync(f)) { cfg = JSON.parse(fs.readFileSync(f, 'utf8') || '{}') as ClaudeDesktopConfig; fs.copyFileSync(f, f + '.backup-' + Date.now()); } }
    catch (e) { return { ...res, ok: false, error: 'อ่านไฟล์ตั้งค่า Claude ไม่ได้: ' + errMsg(e) }; }
    cfg.mcpServers = { ...(cfg.mcpServers || {}), 'price-tracker': entry };
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify(cfg, null, 2));
    res.wroteDesktop = true;
    log.info('claude', 'เพิ่ม Price Tracker ใน Claude Desktop แล้ว (' + f + ')');
  }
  return res;
});
handle('claude-disable', () => { settings.claude.enabled = false; saveSettings(); restartApi(); log.info('claude', 'ปิดการเข้าถึงของ Claude'); return true; });
handle('claude-status', () => {
  let desktop = false;
  try { desktop = !!(readClaudeConfig().mcpServers || {})['price-tracker']; } catch (_) { /* no config */ }
  return { api: settings.claude.enabled || settings.api.enabled, claude: settings.claude.enabled, port: settings.api.port, desktop, mac: process.platform === 'darwin', listening: api.listening() };
});
function restartApi(): void {
  const a = settings.api, c = settings.claude;
  // the server runs if the user enabled the API or Claude access; Claude's token is always accepted
  api.start({ ...a, enabled: !!(a.enabled || c.enabled), lan: !!(a.enabled && a.lan),
    tokens: [a.enabled ? a.token : null, c.enabled ? c.token : null].filter((t): t is string => t !== null), openNoToken: a.enabled && !a.token }, apiHooks);
}

// ---------------- IPC ----------------
listen('add-symbol', (_e, s) => addSymbol(s));
listen('remove-symbol', (_e, s) => removeSymbol(s));
listen('set-tray', (_e, s) => { settings.traySymbol = s; saveSettings(); refreshTrayMenu(); updateTray(); sendStatus(); });
listen('toggle-csv', () => { settings.csv = !settings.csv; saveSettings(); refreshTrayMenu(); sendStatus(); log.info('csv', settings.csv ? 'เปิดบันทึก CSV' : 'ปิดบันทึก CSV'); });
listen('open-csv', () => { fs.mkdirSync(csvDir(), { recursive: true }); void shell.openPath(csvDir()); });
listen('show-trader', () => showTrader());
listen('reload-trader', () => { log.info('feed', 'ผู้ใช้สั่งเชื่อมต่อใหม่'); trader()?.webContents.reload(); });
listen('chart-msg', (_e, m) => {
  if (m.type === 'quotes') return onQuotes((m.data || []) as RawQuote[]);
  if (m.type === 'subs') return onSubs(m.data as string[]);
  if (m.type === 'feedError') { log.error('feed', 'symbol:error', m.data); return; }
  if (settings.source === 'mt5') return;   // VCG charts are not used while MT5 is the source
  if (m.type === 'chartError') log.error('chart', 'chart:error', m.data);
  else if (m.type === 'chartAuthRenew') log.warn('chart', 'token หมดอายุ (PERMISSION_DENIED) — กำลังขอ token ใหม่และโหลดซ้ำ');
  else if (m.type === 'chartLog') log.info('chart', String(m.data));
  else if (m.type === 'chartConnected') log.info('chart', 'chart-history เชื่อมต่อแล้ว');
  else if (m.type === 'chartDisconnected' || m.type === 'chartConnectError') log.warn('chart', m.type, m.data);
  send('chart', m as ChartMsg);
});
listen('chart-request', (_e, o) => (settings.source === 'mt5' ? mt5.request(o) : sendChartReq(o)));
listen('set-source', (_e, src) => {
  if ((src !== 'vcg' && src !== 'mt5') || src === settings.source) return;
  settings.source = src as Source; saveSettings(); state.quotes = {};
  log.info('source', 'แหล่งข้อมูล: ' + (src === 'mt5' ? 'MT5 (EA)' : 'VCG'));
  if (src === 'mt5') startMt5(); else mt5.stop();
  sendStatus();
});
/** Save dialog attached to the main window when it exists. */
const showSave = (o: Electron.SaveDialogOptions): Promise<Electron.SaveDialogReturnValue> => (mainWin ? dialog.showSaveDialog(mainWin, o) : dialog.showSaveDialog(o));
handle('save-ea', async () => {
    const r = await showSave({ title: 'บันทึก EA สำหรับ MT5', defaultPath: path.join(app.getPath('downloads'), 'PriceTrackerBridge.mq5') });
  if (r.canceled || !r.filePath) return null;
  fs.copyFileSync(path.join(ROOT, 'mt5', 'PriceTrackerBridge.mq5'), r.filePath);
  shell.showItemInFolder(r.filePath);
  return r.filePath;
});
// Find MT5 "Experts" folders on this computer:
//  macOS: MetaTrader runs in a Wine bottle under ~/Library/Application Support/<bottle>/drive_c/…
//  Windows: %APPDATA%\MetaQuotes\Terminal\<id>\MQL5\Experts and Program Files installs
const mt5Bundles = (): string[] => ['/Applications/MetaTrader 5.app', path.join(app.getPath('home'), 'Applications', 'MetaTrader 5.app')].filter((b) => fs.existsSync(b));
const findMt5ExpertDirs = (): string[] => mt5.findExpertDirs({ home: app.getPath('home'), appData: app.getPath('appData'), platform: process.platform, env: process.env });
handle('mt5-install-ea', async () => {
  const src = fs.readFileSync(path.join(ROOT, 'mt5', 'PriceTrackerBridge.mq5'));
  const dirs = findMt5ExpertDirs(), done: string[] = [], failed: string[] = [];
  for (const d of dirs) { try { fs.writeFileSync(path.join(d, 'PriceTrackerBridge.mq5'), src); done.push(d); } catch (e) { failed.push(d + ': ' + errMsg(e)); } }
  log.info('mt5', done.length ? 'ติดตั้ง EA ลง MT5: ' + done.join(' | ') : 'ไม่พบโฟลเดอร์ MT5 ในเครื่อง', failed.length ? failed : undefined);
  if (done[0]) shell.showItemInFolder(path.join(done[0], 'PriceTrackerBridge.mq5'));
  return { installed: done, failed };
});
// One-click: copy the EA, compile it with MetaEditor, then start MT5 with the EA already on a chart.
handle('mt5-launch', async (_e, opt = {}) => {
  const steps: Step[] = [], ok = (t: string): void => { steps.push({ ok: true, t }); }, bad = (t: string): void => { steps.push({ ok: false, t }); };
  const dirs = findMt5ExpertDirs();
  const dir = dirs[0];
  if (!dir) { bad('ไม่พบ MT5 ในเครื่อง — ติดตั้ง MT5 แล้วเปิดโปรแกรม 1 ครั้งก่อน'); return { ok: false, steps }; }
  try { fs.writeFileSync(path.join(dir, 'PriceTrackerBridge.mq5'), fs.readFileSync(path.join(ROOT, 'mt5', 'PriceTrackerBridge.mq5'))); ok('คัดลอก EA ลง MT5 แล้ว'); }
  catch (e) { bad('คัดลอก EA ไม่ได้: ' + errMsg(e)); return { ok: false, steps }; }
  const sym = mt5.status().symbols.find((x) => /^XAUUSD/i.test(x));
  const plan = mt5.planLaunch({ expertsDir: dir, platform: process.platform, appBundles: mt5Bundles(), symbol: opt.symbol || sym, period: opt.period || 'M5' });
  log.info('mt5', 'แผนเปิด MT5', plan && { launch: plan.launch, compile: plan.compile, missing: plan.missing, iniPath: plan.iniPath });
  const launch = plan && !plan.missing ? plan.launch : undefined;
  if (!plan || !launch) { bad('หาโปรแกรม MT5 (' + ((plan && plan.missing) || 'terminal64.exe') + ') ไม่เจอ — เปิด MT5 เองแล้วลาก EA ลงกราฟ'); return { ok: false, steps, manual: true }; }
  let running = false;
  try { running = !!String(execFileSync(process.platform === 'win32' ? 'tasklist' : 'pgrep', process.platform === 'win32' ? ['/FI', 'IMAGENAME eq terminal64.exe'] : ['-fl', 'terminal64'], { encoding: 'utf8' })).match(/terminal64/i); } catch (_) { /* pgrep: no match */ }
  if (running && !opt.force) { bad('MT5 เปิดอยู่ — ปิด MT5 ก่อน (Cmd+Q) แล้วกดใหม่ ให้ MT5 เปิดพร้อม EA'); return { ok: false, steps, running: true }; }
  const env = { ...process.env, ...plan.env };
  const compile = plan.compile;
  if (compile) {
    const code = await new Promise<number | null>((res) => { const p = spawn(compile.cmd, compile.args, { env }); const t = setTimeout(() => { try { p.kill(); } catch (_) { /* gone */ } res(-1); }, 90000); p.on('error', () => { clearTimeout(t); res(-2); }); p.on('exit', (c) => { clearTimeout(t); res(c); }); });
    let logTxt = ''; try { logTxt = fs.readFileSync(path.join(dir, 'PriceTrackerBridge.log'), 'utf16le'); } catch (_) { /* no log */ }
    const m = logTxt.match(/(\d+)\s+errors?,\s*(\d+)\s+warnings?/i), ex5 = fs.existsSync(path.join(dir, 'PriceTrackerBridge.ex5'));
    log.info('mt5', 'compile EA', { code, result: m ? m[0] : null });
    if (m && +(m[1] || 0) > 0) { bad('compile ไม่ผ่าน: ' + m[0] + ' — ดูรายละเอียดใน Log'); log.warn('mt5', 'compile log', logTxt.slice(-3000)); return { ok: false, steps }; }
    if (ex5) ok('compile EA แล้ว' + (m ? ` (${m[0]})` : '')); else bad('ยังไม่เห็นไฟล์ .ex5 — MT5 จะ compile ให้ตอนเปิด หรือเปิด MetaEditor แล้วกด F7');
  }
  try { fs.mkdirSync(path.dirname(plan.iniPath), { recursive: true }); fs.writeFileSync(plan.iniPath, plan.ini); } catch (e) { bad('เขียนไฟล์ตั้งค่าไม่ได้: ' + errMsg(e)); return { ok: false, steps }; }
  try { const p = spawn(launch.cmd, launch.args, { env, detached: true, stdio: 'ignore' }); p.unref(); ok('กำลังเปิด MT5 พร้อม EA…'); }
  catch (e) { bad('เปิด MT5 ไม่ได้: ' + errMsg(e)); return { ok: false, steps }; }
  return { ok: true, steps };
});
// External sites shown inside the app (their own pages, nothing copied): currently Forex Factory.
const SITE_HOSTS = /^(www\.)?forexfactory\.com$/i;
let siteWin: BrowserWindow | null = null;
handle('open-site', (_e, url) => {
  let u: URL; try { u = new URL(url); } catch (_) { return false; }
  if (u.protocol !== 'https:' || !SITE_HOSTS.test(u.hostname)) { void shell.openExternal(u.href); return 'external'; }
  if (siteWin && !siteWin.isDestroyed()) { void siteWin.loadURL(u.href); siteWin.show(); siteWin.focus(); return true; }
  const b = settings.siteBounds || { width: 1280, height: 860 };
  const win = new BrowserWindow({ ...b, minWidth: 700, minHeight: 500, title: 'Forex Factory', backgroundColor: '#ffffff', autoHideMenuBar: true,
    webPreferences: { partition: 'persist:sites', contextIsolation: true, sandbox: true } });
  siteWin = win;
  // stay on the allowed site; anything else (ads, other sites) opens in the normal browser
  const keep = (to: string): boolean => { try { const h = new URL(to); return h.protocol === 'https:' && SITE_HOSTS.test(h.hostname); } catch (_) { return false; } };
  win.webContents.setWindowOpenHandler(({ url: to }) => { if (keep(to)) void win.loadURL(to); else if (/^https?:/.test(to)) void shell.openExternal(to); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (ev, to) => { if (!keep(to)) { ev.preventDefault(); if (/^https?:/.test(to)) void shell.openExternal(to); } });
  win.on('close', () => { settings.siteBounds = win.getBounds(); saveSettings(); });
  win.on('closed', () => { siteWin = null; });
  void win.loadURL(u.href);
  log.info('ui', 'เปิด ' + u.hostname);
  return true;
});
handle('mt5-positions', (_e, on) => mt5.positions(on));
handle('mt5-deals', (_e, from, to) => mt5.deals(from, to));
handle('mt5-ea-source', () => fs.readFileSync(path.join(ROOT, 'mt5', 'PriceTrackerBridge.mq5'), 'utf8'));
function startMt5(): void {
  mt5.start(settings.mt5.port, {
    symbols: () => settings.symbols,
    quote: (q) => { if (settings.source === 'mt5') acceptQuote(q); },
    chart: (m) => { if (settings.source === 'mt5') send('chart', m); },
    status: () => sendStatus(),
    positions: (p) => { send('positions', p); api.broadcast('positions', p); journal().onPositions(p); },
    hello: (info) => { eaHello(info); journal().onConnect(info); if ((info.caps || []).includes('pos')) mt5.positions(true); send('journal-changed', null); },
    disconnect: () => journal().onDisconnect(),
  });
}
// ---------------- MT5 auto-launch: start MT5 minimized when needed, close the copy we started on quit ----------------
const AUTO = { started: Date.now(), launchedByApp: false, launching: false, tries: [] as number[], timer: null as ReturnType<typeof setInterval> | null, gaveUp: false, noPlan: false };
/** A launch plan that found MT5 (launch command present). */
type ReadyPlan = LaunchPlan & { launch: NonNullable<LaunchPlan['launch']> };
function mt5Plan(withEA: boolean): ReadyPlan | null {
  const dir = findMt5ExpertDirs()[0]; if (!dir) return null;
  const sym = mt5.status().symbols.find((x) => /^XAUUSD/i.test(x));
  const plan = mt5.planLaunch({ expertsDir: dir, platform: process.platform, appBundles: mt5Bundles(), symbol: sym, period: 'M5' });
  if (!plan || plan.missing || !plan.launch) return null;
  if (withEA) { try { fs.mkdirSync(path.dirname(plan.iniPath), { recursive: true }); fs.writeFileSync(plan.iniPath, plan.ini); } catch (_) { /* MT5 opens without the startup chart */ } }
  return plan as ReadyPlan;
}
function mt5IsRunning(): boolean {
  try { return /terminal64/i.test(String(execFileSync(process.platform === 'win32' ? 'tasklist' : 'pgrep', process.platform === 'win32' ? ['/FI', 'IMAGENAME eq terminal64.exe'] : ['-fl', 'terminal64'], { encoding: 'utf8', timeout: 4000 }))); }
  catch (_) { return false; }
}
function mt5AutoCheck(): void {
  const st = mt5.status();
  const d = mt5Auto.decide({ source: settings.source, enabled: settings.mt5.autoLaunch !== false, connected: st.connected, running: st.connected ? true : mt5IsRunning(),
    launching: AUTO.launching, tries: AUTO.tries, now: Date.now(), sinceStart: Date.now() - AUTO.started, eaSeen: !!settings.mt5.eaSeen });
  if (d.act !== 'launch') { if (d.why === 'gave-up' && !AUTO.gaveUp) { AUTO.gaveUp = true; log.warn('mt5', 'เปิด MT5 อัตโนมัติไม่สำเร็จ 3 ครั้งใน 1 ชม. — หยุดลองแล้ว เปิด MT5 เองได้'); } return; }
  const plan = mt5Plan(d.withEA);
  if (!plan) { if (!AUTO.noPlan) { AUTO.noPlan = true; log.warn('mt5', 'เปิด MT5 อัตโนมัติไม่ได้: หาโปรแกรม MT5 ไม่เจอ'); } return; }
  const c = mt5Auto.minimized(plan, process.platform, d.withEA);
  AUTO.tries.push(Date.now()); AUTO.launching = true; AUTO.launchedByApp = true;
  log.info('mt5', 'เปิด MT5 ให้อัตโนมัติ (ย่อหน้าต่าง)' + (d.withEA ? ' พร้อมติด EA' : ''), { cmd: c.cmd, args: c.args });
  try { const p = spawn(c.cmd, c.args, { env: { ...process.env, ...c.env }, detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: !!c.verbatim }); p.on('error', (e) => log.warn('mt5', 'เปิด MT5 ไม่ได้: ' + e.message)); p.unref(); }
  catch (e) { log.warn('mt5', 'เปิด MT5 ไม่ได้: ' + errMsg(e)); }
  setTimeout(() => { AUTO.launching = false; }, 60000);           // MT5 under wine can take ~30-60 s to come up
  send('mt5-auto', { state: 'launching' });
}
function mt5AutoStart(): void {
  // users from before this version already have the EA on a chart (MT5 restores it): don't add a second one
  if (!settings.mt5.eaSeen && (Object.keys(settings.mt5.eaAttempted || {}).length || fs.existsSync(path.join(app.getPath('userData'), 'journal')))) { settings.mt5.eaSeen = true; saveSettings(); }
  if (AUTO.timer) clearInterval(AUTO.timer);
  AUTO.started = Date.now(); AUTO.timer = setInterval(mt5AutoCheck, 5000);
}
function mt5AutoQuit(): void {
  if (AUTO.timer) clearInterval(AUTO.timer);
  if (!AUTO.launchedByApp || settings.mt5.closeOnQuit === false) return;
  const plan = mt5Plan(false); if (!plan) return;
  const c = mt5Auto.closeCmd(plan, process.platform);
  try { spawn(c.cmd, c.args, { env: { ...process.env, ...c.env }, detached: true, stdio: 'ignore', windowsHide: true }).unref(); log.info('mt5', 'ปิด MT5 ที่แอปเปิดไว้'); } catch (_) { /* MT5 already gone */ }
}
handle('mt5-auto-now', () => { AUTO.tries = []; AUTO.gaveUp = false; AUTO.started = 0; mt5AutoCheck(); return true; });
// ---------------- EA auto-update: copy + compile the bundled EA when MT5 runs an older one ----------------
let eaUpdating = false, eaWaiter: ((info: Mt5Info | null) => void) | null = null;
const eaSource = (): Buffer => fs.readFileSync(path.join(ROOT, 'mt5', 'PriceTrackerBridge.mq5'));
const EA_BUNDLED = eaUpd.bundledBuild(fs.readFileSync(path.join(ROOT, 'mt5', 'PriceTrackerBridge.mq5'), 'utf8'));
const fmtBuild = (b: number | null): string => (b == null ? '?' : (b / 100).toFixed(2));
function eaHello(info: Mt5Info): void {
  if (!settings.mt5.eaSeen) { settings.mt5.eaSeen = true; saveSettings(); }
  if (eaWaiter && EA_BUNDLED && eaUpd.helloBuild(info) >= EA_BUNDLED) { eaWaiter(info); eaWaiter = null; }
  const account = String(info.server || '') + '|' + (info.login || '');
  const d = eaUpd.shouldUpdate({ info, bundled: EA_BUNDLED, enabled: settings.mt5.autoUpdateEA !== false, attempted: settings.mt5.eaAttempted || {}, account, running: eaUpdating });
  if (d.ok) updateEA({ account, from: d.have }).catch((e: unknown) => log.warn('mt5', 'อัปเดต EA ล้มเหลว: ' + errMsg(e)));
}
async function updateEA({ account = '', from = null, force = false }: { account?: string; from?: number | null; force?: boolean } = {}): Promise<StepsResult> {
  if (eaUpdating) return { ok: false, steps: [{ ok: false, t: 'กำลังอัปเดตอยู่' }] };
  eaUpdating = true;
  try {
    log.info('mt5', `อัปเดต EA: ${from ? fmtBuild(from) : '?'} → ${fmtBuild(EA_BUNDLED)}${force ? ' (สั่งเอง)' : ''}`);
    send('ea-update', { state: 'start', msg: `กำลังอัปเดต EA ใน MT5 เป็น ${fmtBuild(EA_BUNDLED)}…` });
    if (EA_BUNDLED) { settings.mt5.eaAttempted = { ...(settings.mt5.eaAttempted || {}), [account]: EA_BUNDLED }; saveSettings(); }
    const dirs = findMt5ExpertDirs(), first = dirs[0];
    const plan = first ? mt5.planLaunch({ expertsDir: first, platform: process.platform, appBundles: mt5Bundles() }) : null;
    if (plan && plan.wine) log.info('mt5', 'อัปเดต EA: ใช้ wine ' + plan.wine);
    const r = await eaUpd.install({ dirs, source: eaSource(), plan, deps: { spawn, log } });
    if (!r.ok) { send('ea-update', { state: 'fail', msg: 'อัปเดต EA อัตโนมัติไม่สำเร็จ — ' + r.steps.filter((x) => !x.ok).map((x) => x.t).join(' · '), steps: r.steps, manual: true }); return r; }
    // MT5 reloads the running EA when its .ex5 changes → wait for its hello with the new build
    const got = await new Promise<Mt5Info | null>((res) => { eaWaiter = res; setTimeout(() => { if (eaWaiter === res) { eaWaiter = null; res(null); } }, 60000); });
    if (got) { log.info('mt5', 'อัปเดต EA สำเร็จ: ' + fmtBuild(EA_BUNDLED)); send('ea-update', { state: 'ok', msg: `อัปเดต EA เป็น ${fmtBuild(EA_BUNDLED)} แล้ว` }); return { ...r, ok: true }; }
    send('ea-update', { state: 'fail', msg: 'compile แล้ว แต่ EA บนกราฟยังเป็นรุ่นเดิม — ลาก PriceTrackerBridge ลงกราฟใหม่ใน MT5', steps: r.steps });
    return { ...r, ok: false, reattach: true };
  } finally { eaUpdating = false; }
}
handle('mt5-update-ea', () => updateEA({ account: String(mt5.status().server || ''), from: mt5.status().eaBuild, force: true }));
handle('mt5-ea-info', () => ({ bundled: EA_BUNDLED, running: mt5.status().connected ? eaUpd.helloBuild({ build: mt5.status().eaBuild, v: mt5.status().eaVersion ?? undefined }) : null, auto: settings.mt5.autoUpdateEA !== false }));
handle('mt5-open-editor', () => {
  const dir = findMt5ExpertDirs()[0]; if (!dir) return false;
  try { fs.writeFileSync(path.join(dir, 'PriceTrackerBridge.mq5'), eaSource()); } catch (_) { /* opens the old copy */ }
  const plan = mt5.planLaunch({ expertsDir: dir, platform: process.platform, appBundles: mt5Bundles() });
  if (!plan || !plan.editor) { shell.showItemInFolder(path.join(dir, 'PriceTrackerBridge.mq5')); return 'folder'; }
  const p = spawn(plan.editor.cmd, plan.editor.args, { env: { ...process.env, ...(plan.env || {}) }, detached: true, stdio: 'ignore' }); p.unref();
  log.info('mt5', 'เปิด MetaEditor', plan.editor);
  return true;
});

// ---------------- trading journal (my MT5 history, stored on this computer only) ----------------
let _journal: Journal | null = null;
function journal(): Journal {
  if (!_journal) _journal = createJournal({ dir: path.join(app.getPath('userData'), 'journal'), mt5: { connected: () => mt5.status().connected, deals: (a: number, b: number) => mt5.deals(a, b) }, log });
  return _journal;
}
handle('journal-get', () => (mt5.status().connected ? journal().get() : journal().openLast()));
handle('journal-sync', async () => { const r = await journal().sync(); send('journal-changed', null); return { ...r, ...journal().get().status }; });
handle('journal-export', async (_e, csvText) => {
    const r = await showSave({ title: 'ส่งออกประวัติการเทรด (CSV)', defaultPath: path.join(app.getPath('downloads'), `trades-${new Date().toISOString().slice(0, 10)}.csv`), filters: [{ name: 'CSV', extensions: ['csv'] }] });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, '\ufeff' + String(csvText || ''));     // BOM: Excel opens Thai/UTF-8 correctly
  shell.showItemInFolder(r.filePath);
  return r.filePath;
});
listen('chart-data', (_e, d) => { state.chart = d; });
listen('analysis', (_e, a) => { state.analysis = a; });
listen('log', (_e, e) => { log.write(e.level || 'info', e.source || 'ui', e.msg, e.data); });
listen('open-log-file', () => { const f = log.file(); if (f) void shell.openPath(f); });
listen('open-log-folder', () => { const f = log.file(); if (f) shell.showItemInFolder(f); });
handle('get-settings', () => ({ mt5: settings.mt5, source: settings.source, api: settings.api, webhook: settings.webhook, telegram: settings.telegram, net: settings.net, openAtLogin: settings.openAtLogin, version: app.getVersion(), logFile: log.file(), userData: app.getPath('userData') }));
handle('set-settings', (_e, s) => {
  const apiChanged = JSON.stringify(s.api) !== JSON.stringify(settings.api);
  settings.api = { ...settings.api, ...s.api, port: Math.max(1024, Math.min(65535, parseInt(String(s.api.port), 10) || 8787)) };
  settings.webhook = { ...settings.webhook, ...s.webhook };
  settings.telegram = { ...settings.telegram, ...s.telegram };
  if (s.net) settings.net = { ...settings.net, ...s.net };
  if (s.mt5 && typeof s.mt5.autoUpdateEA === 'boolean') settings.mt5.autoUpdateEA = s.mt5.autoUpdateEA;
  if (s.mt5 && typeof s.mt5.autoLaunch === 'boolean') settings.mt5.autoLaunch = s.mt5.autoLaunch;
  if (s.mt5 && typeof s.mt5.closeOnQuit === 'boolean') settings.mt5.closeOnQuit = s.mt5.closeOnQuit;
  const mt5Port = s.mt5 && s.mt5.port != null ? +s.mt5.port : 0;
  if (mt5Port && mt5Port !== settings.mt5.port) { settings.mt5.port = Math.max(1024, Math.min(65535, mt5Port)); if (settings.source === 'mt5') startMt5(); }
  if (typeof s.openAtLogin === 'boolean' && s.openAtLogin !== settings.openAtLogin) {
    settings.openAtLogin = s.openAtLogin;
    try { app.setLoginItemSettings({ openAtLogin: s.openAtLogin }); } catch (e) { log.warn('settings', 'ตั้งเปิดพร้อมเครื่องไม่สำเร็จ: ' + errMsg(e)); }
  }
  saveSettings(); log.info('settings', 'บันทึกการตั้งค่า API/แจ้งเตือน');
  if (apiChanged) restartApi();
  sendStatus();
  return true;
});
// small allowlisted JSON fetcher for the window (economic calendar, update check, demo data) — no CORS issues here
const FETCH_HOSTS = ['nfs.faireconomy.media', 'api.github.com', 'api.binance.com', 'data-api.binance.vision'];
handle('fetch-json', async (_e, url) => {
  const u = new URL(url);
  if (u.protocol !== 'https:' || !FETCH_HOSTS.includes(u.hostname)) throw new Error('host not allowed: ' + u.hostname);
  const r = await enet.fetch(url, { headers: { 'User-Agent': 'PriceTracker', Accept: 'application/json' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json() as Promise<unknown>;
});
// news feeds (RSS/XML) from a fixed list of publishers — text, not JSON
const FEED_HOSTS = ['www.fxstreet.com', 'www.investing.com', 'www.federalreserve.gov', 'www.ecb.europa.eu', 'www.bls.gov'];
handle('fetch-text', async (_e, url) => {
  const u = new URL(url);
  if (u.protocol !== 'https:' || !FEED_HOSTS.includes(u.hostname)) throw new Error('host not allowed: ' + u.hostname);
  const r = await enet.fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) PriceTracker', Accept: 'application/rss+xml, application/xml, text/xml, */*' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return (await r.text()).slice(0, 2e6);
});
handle('sign-out', async () => {
  log.warn('auth', 'ผู้ใช้สั่งออกจากระบบ — ล้าง session ของ WebTrader');
  await session.fromPartition('persist:vcg').clearStorageData();
  state.connected = false; void trader()?.loadURL(WEBTRADER_URL);
  return true;
});
handle('notify', async (_e, { event, payload, text }) => {
  api.broadcast(event, payload);
  return notify.send(settings, event, payload, text);
});

// ---------------- network monitor ----------------
const netState = { rtt: null as number | null, fails: 0, delays: [] as number[], base: [] as number[], reconnects: 0, level: 'ok' as NetLevel, detail: '', probeIx: 0 };
const median = (a: number[]): number | null => { if (!a.length) return null; const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
const PROBE_URLS = ['https://prod-ws-server.anttix.app/', 'https://vcgmarkets.com/favicon.ico'];
async function probe(): Promise<void> {
  const t0 = Date.now(), ac = new AbortController(), to = setTimeout(() => ac.abort(), 8000);
  try {
    // ping the PRICE server itself (not the website), twice: the 2nd request reuses the open connection,
    // so it measures the real round-trip instead of DNS + TLS handshake (which made "ping" look like 500–3000 ms)
    // if the price server refuses plain HTTP, fall back to the website so the pill still means something
    // through the WebTrader session (same connection pool and cookies as the price feed)
    const url = PROBE_URLS[netState.probeIx || 0] || PROBE_URLS[0] || '', ses = session.fromPartition('persist:vcg');
    const hit = (): Promise<Response> => ses.fetch(url + (url.includes('?') ? '&' : '?') + '_=' + Date.now(), { method: 'HEAD', cache: 'no-store', signal: ac.signal });
    await hit(); const t1 = Date.now(); await hit();
    netState.rtt = Date.now() - t1; netState.fails = 0; void t0;
  } catch (_) {
    netState.fails++; netState.rtt = null;
    // prices still arriving → the probe target is the problem, not the network: try the next target
    if (state.lastTick && Date.now() - state.lastTick < 15000) { netState.probeIx = ((netState.probeIx || 0) + 1) % PROBE_URLS.length; netState.fails = 0; }
  }
  clearTimeout(to);
}
function hasCrypto(): boolean { return settings.symbols.some((s) => /^(BTC|ETH|SOL|LTC|XRP|BNB|ADA|DOGE)/.test(s)); }
function fxWeekend(): boolean { const d = new Date(), wd = d.getUTCDay(), h = d.getUTCHours(); return wd === 6 || (wd === 0 && h < 21) || (wd === 5 && h >= 22); }
function evalNet(): void {
  // "delay" = how much later than usual prices arrive now. Raw (now − quote time) also contains the clock
  // difference between this computer and the broker server, so subtract the best (10th percentile) recent value.
  const b = [...netState.base].sort((x, y) => x - y), floor = b.length >= 20 ? b[Math.floor(b.length * 0.1)] : null, med = median(netState.delays);
  const n = settings.net, delay = med == null ? null : floor == null ? null : Math.max(0, Math.round(med - floor)), since = state.lastTick ? (Date.now() - state.lastTick) / 1000 : null;
  let level: NetLevel = 'ok', detail = '';
  if (settings.source === 'mt5') {
    const m = mt5.status(), ago = m.lastTick ? (Date.now() - m.lastTick) / 1000 : null;
    if (!m.connected) { level = 'down'; detail = 'ยังไม่ได้เชื่อมต่อกับ EA ใน MT5'; }
    else if (ago != null && ago > n.staleSec && !fxWeekend()) { level = 'stale'; detail = `MT5 ไม่ส่งราคาใหม่ ${Math.round(ago)} วินาที`; }
  } else if (netState.fails >= 2 && !(since != null && since < 15)) { level = 'offline'; detail = 'ติดต่อเซิร์ฟเวอร์ VCG ไม่ได้ (อินเทอร์เน็ตหลุด?)'; }
  else if (state.loggedIn && !state.connected) { level = 'down'; detail = 'การเชื่อมต่อราคาหลุด กำลังต่อใหม่'; }
  else if (state.connected && since != null && since > n.staleSec && (hasCrypto() || !fxWeekend())) { level = 'stale'; detail = `ไม่มีราคาใหม่ ${Math.round(since)} วินาที`; }
  else if ((netState.rtt != null && netState.rtt > n.slowMs) || (delay != null && delay > n.delayMs)) { level = 'slow'; detail = `เน็ตช้า: ping ${netState.rtt ?? '—'} ms, ราคามาช้ากว่าปกติ ~${delay ?? '—'} ms`; }
  if (Date.now() - BOOT < 30000 && level !== 'ok' && !state.connected) { level = netState.level; detail = 'กำลังเริ่มต้น…'; }   // start-up: not an outage
  if (level !== netState.level) {
    const worse = ['ok', 'slow', 'stale', 'down', 'offline'].indexOf(level) > ['ok', 'slow', 'stale', 'down', 'offline'].indexOf(netState.level);
    log[level === 'ok' ? 'info' : 'warn']('network', level === 'ok' ? 'การเชื่อมต่อกลับมาปกติ' : detail);
    if (worse && n.notify && Notification.isSupported()) new Notification({ title: 'Price Tracker — การเชื่อมต่อ', body: detail }).show();
    netState.level = level;
  }
  netState.detail = detail;
  let cpu: NetReport['cpu'] = null;
  try {
    const ms = app.getAppMetrics(), pid = (w: BrowserWindow | null): number => (w && !w.isDestroyed() ? w.webContents.getOSProcessId() : -1);
    const by = (p: number): number | null => { const m = ms.find((x) => x.pid === p); return m ? Math.round(m.cpu.percentCPUUsage) : null; };
    const browser = ms.find((x) => x.type === 'Browser'), gpu = ms.find((x) => x.type === 'GPU');
    cpu = { app: browser ? Math.round(browser.cpu.percentCPUUsage) : null, ui: by(pid(mainWin)), webtrader: by(pid(traderWin)), gpu: gpu ? Math.round(gpu.cpu.percentCPUUsage) : null };
  } catch (_) { /* metrics unavailable */ }
  const st: NetReport = { cpu, level, detail, rtt: netState.rtt, feedDelay: delay, lastTickAgo: since, reconnects: netState.reconnects, connected: state.connected };
  send('net', st); api.broadcast('network', st);
}
setInterval(probe, 10000);
setInterval(evalNet, 2000);

// forward logs to the window in batches
let pendingLogs: LogEntry[] = [];
log.onLog((e) => { pendingLogs.push(e); api.broadcast('log', e); });
setInterval(() => { if (pendingLogs.length) { send('logs', pendingLogs); pendingLogs = []; } }, 500);

// ---------------- app ----------------
app.whenReady().then(() => {
  log.init(path.join(app.getPath('userData'), 'logs'));
  app.setAboutPanelOptions({ applicationName: 'Price Tracker', applicationVersion: app.getVersion(), authors: ['guiar-dev'],
    credits: 'พัฒนาโดย guiar-dev · อ่านราคาอย่างเดียว ไม่ส่งคำสั่งซื้อขาย', copyright: '© guiar-dev', website: 'https://github.com/guitar-dev-io/trader-tacking' });
  loadSettings();
  log.info('app', `เริ่มโปรแกรม v${app.getVersion()} (Electron ${process.versions.electron}, ${process.platform}/${process.arch})`);
  if (app.runningUnderARM64Translation) log.warn('app', 'แอปนี้เป็นรุ่น Intel (x64) แต่ Mac เป็นชิป Apple (M1/M2/M3/M4) — ทำงานผ่าน Rosetta จะช้ากว่า ให้ติดตั้งไฟล์ Price-Tracker-mac-arm64.zip แทน');
  // macOS shows the price as menu-bar text; Windows needs an icon (otherwise the tray is invisible and a
  // closed window could not be reopened) and shows the price in the tooltip.
  tray = new Tray(IS_MAC ? nativeImage.createEmpty() : nativeImage.createFromPath(path.join(ROOT, 'assets', 'tray.png')));
  tray.setToolTip('Price Tracker');
  if (!IS_MAC) { tray.on('click', showMain); tray.on('double-click', showMain); }
  refreshTrayMenu();
  updateTray();
  createMain();
  createTrader();
  adoptClaudeConfig();
  restartApi();
  if (settings.source === 'mt5') startMt5();
  mt5AutoStart();
  probe();
  // start-up: check every 0.7 s until the feed is installed and the first price arrives, then every 3 s
  (function loop() { tick().finally(() => setTimeout(loop, throttled || Date.now() - BOOT > 60000 ? 3000 : 700)); })();
});
process.on('uncaughtException', (e) => log.error('app', 'uncaughtException: ' + e.stack));
process.on('unhandledRejection', (e) => log.error('app', 'unhandledRejection: ' + ((e instanceof Error && e.stack) || String(e))));
app.on('activate', showMain);
app.on('before-quit', () => { quitting = true; mt5AutoQuit(); if (_journal) _journal.flush(); api.stop(); mt5.stop(); log.info('app', 'ปิดโปรแกรม'); });
app.on('window-all-closed', () => {});
