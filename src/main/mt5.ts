// MT5 data source (desktop): a TCP server on 127.0.0.1 that the PriceTrackerBridge EA (mt5/PriceTrackerBridge.mq5)
// connects to from a logged-in MetaTrader 5 terminal. Lines are JSON from the EA and "CMD|a|b" text to the EA.
// Read-only: the only commands sent are WATCH / HIST / SUB / POS / DEALS (see src/core/mt5-protocol.ts).
import * as net from 'node:net';
import * as fs from 'node:fs';
import * as path from 'node:path';
import log from './logger';
import { parseEAMessage } from '../core/mt5-protocol';
import type { Deal, EAMessage, EAMessageOf, WireBar } from '../core/mt5-protocol';
import type { PositionsSnapshot } from './ipc';
import type { ChartMsg, ChartRequest, Mt5Status, Quote, WireCandle } from './types';

export interface Mt5Info { broker: string; server: string; login: number | string | null; build: number | null; offset: number; symbols: string[]; v: number; caps: string[] }
export interface Mt5Hooks {
  symbols(): string[];
  quote(q: Quote): void;
  chart(m: ChartMsg): void;
  status(): void;
  positions?(p: PositionsSnapshot | null): void;
  hello?(info: Mt5Info): void;
  disconnect?(): void;
}
interface Pending { slot: string; symbol: string; o: ChartRequest; tries?: number }
interface Waiter<T> { resolve(v: T): void; reject(e: Error): void }

const TF = ['M1', 'M5', 'M15', 'H1', 'H4', 'D1', 'W1'];
const st = {
  dealWait: new Map<string, Waiter<Deal[]>>(), wantPos: false, positions: null as PositionsSnapshot | null,
  server: null as net.Server | null, sock: null as net.Socket | null, buf: '', connected: false, info: null as Mt5Info | null,
  reqId: 0, pending: new Map<string, Pending>(), last: {} as Record<string, ChartRequest>, unknown: new Set<string>(), lastTick: 0,
};
let hooks: Mt5Hooks | null = null, port = 7788;
const H = (): Mt5Hooks => { if (!hooks) throw new Error('mt5 not started'); return hooks; };

function send(line: string): boolean { if (st.sock && !st.sock.destroyed) { st.sock.write(line + '\n'); return true; } return false; }
const candlesOf = (bars: WireBar[] | undefined): WireCandle[] => (bars || []).map((b) => ({ timeSeconds: b[0], open: b[1], high: b[2], low: b[3], close: b[4] }));

export function start(p: number, h: Mt5Hooks): void {
  hooks = h; port = p || 7788;
  stop();
  st.server = net.createServer((sock) => {
    if (st.sock) { try { st.sock.destroy(); } catch (_) { /* already closed */ } }
    st.sock = sock; st.buf = ''; sock.setEncoding('utf8'); sock.setNoDelay(true);
    sock.on('data', (d: string) => {
      st.buf += d;
      if (st.buf.length > 20e6) { log.error('mt5', 'ข้อมูลจาก EA ยาวผิดปกติ — ตัดการเชื่อมต่อ'); sock.destroy(); return; }
      let i;
      while ((i = st.buf.indexOf('\n')) >= 0) { const line = st.buf.slice(0, i); st.buf = st.buf.slice(i + 1); if (line.trim()) handle(line); }
    });
    sock.on('close', () => {
      if (st.sock !== sock) return;
      st.sock = null; st.connected = false; st.positions = null;
      const k = H(); if (k.positions) k.positions(null);
      log.warn('mt5', 'EA ตัดการเชื่อมต่อ'); k.status(); if (k.disconnect) k.disconnect();
    });
    sock.on('error', (e) => log.warn('mt5', 'socket: ' + e.message));
  });
  st.server.on('error', (e) => log.error('mt5', `เปิดพอร์ต MT5 ${port} ไม่ได้: ${e.message}`));
  st.server.listen(port, '127.0.0.1', () => log.info('mt5', `รอ EA จาก MT5 ที่ 127.0.0.1:${port}`));
}
export function stop(): void {
  if (st.sock) { try { st.sock.destroy(); } catch (_) { /* closed */ } st.sock = null; }
  if (st.server) { try { st.server.close(); } catch (_) { /* closed */ } st.server = null; }
  st.connected = false;
}

function handle(line: string): void {
  const m: EAMessage | null = parseEAMessage(line);
  if (!m) { log.warn('mt5', 'ข้อความจาก EA อ่านไม่ได้', line.slice(0, 200)); return; }
  const k = H();
  switch (m.t) {
    case 'hello': {
      const info: Mt5Info = { broker: m.broker, server: m.server, login: m.login || null, build: m.build || null, offset: m.offset, symbols: m.symbols || [], v: m.v || 1, caps: m.caps || [] };
      st.connected = true; st.info = info; st.positions = null;
      log.info('mt5', `EA เชื่อมต่อแล้ว: ${m.broker} (${m.server}) เวลา server = GMT${m.offset >= 0 ? '+' : ''}${m.offset / 3600}`, { symbols: (m.symbols || []).slice(0, 40) });
      watch(k.symbols());
      if (st.wantPos && info.caps.includes('pos')) send('POS|1');
      if (info.v < 2) log.warn('mt5', 'EA ใน MT5 เป็นรุ่นเก่า — ติดตั้ง EA ใหม่เพื่อดูออเดอร์/โพซิชันของคุณ (ตั้งค่า → แหล่งราคา → MT5)');
      Object.values(st.last).forEach(request);   // resend chart requests made before the EA connected
      k.status();
      if (k.hello) k.hello(info);
      break;
    }
    case 'tick': {
      st.lastTick = Date.now();
      const dg = m.dg, ch = m.open ? m.bid - m.open : null;
      const q = { time: new Date(m.ms).toISOString(), bid: m.bid, ask: m.ask, digits: dg, spread: +(m.ask - m.bid).toFixed(dg),
        change: ch == null ? null : +ch.toFixed(dg), changePct: ch == null || !m.open ? null : +((ch / m.open) * 100).toFixed(3) };
      const names = new Set([m.s, ...(alias.get(m.s) || [])]);
      for (const n of names) k.quote({ symbol: n, ...q });
      break;
    }
    case 'bars': {
      const p = st.pending.get(String(m.id)); if (!p) return; st.pending.delete(String(m.id));
      const candles = candlesOf(m.bars);
      log.info('mt5', `ได้แท่งเทียน ${m.s} ${m.tf} ${candles.length} แท่ง`);
      k.chart({ type: 'chart', slot: p.slot, data: { symbol: p.symbol, history: { candles } } });
      break;
    }
    case 'bar': {
      const slot = m.slot || 'main';
      k.chart({ type: 'chart', slot, data: { symbol: (st.last[slot] || { symbol: m.s }).symbol || m.s, updates: { candles: candlesOf(m.bars) } } });
      break;
    }
    case 'err': {
      const id = String(m.id);
      const dw = st.dealWait.get(id); if (dw) { st.dealWait.delete(id); dw.reject(new Error(m.msg)); break; }
      const p = st.pending.get(id);
      log.warn('mt5', 'EA: ' + m.msg);
      if (p && m.retry && (p.tries || 0) < 5) { p.tries = (p.tries || 0) + 1; setTimeout(() => sendHist(id, p), 1500); }   // MT5 is still downloading history
      else if (p) { st.pending.delete(id); k.chart({ type: 'chartError', slot: p.slot, data: { message: 'MT5: ' + m.msg } }); }
      break;
    }
    case 'unknown':
      if (!st.unknown.has(m.s)) { st.unknown.add(m.s); log.warn('mt5', `ไม่พบ ${m.s} ใน MT5 — ชื่อ symbol ของโบรกเกอร์อาจมีคำต่อท้าย เช่น ${m.s}.m / ${m.s}m`); k.status(); }
      break;
    case 'pos':
      st.positions = { at: Date.now(), acct: m.acct || ({} as EAMessageOf<'pos'>['acct']), positions: m.positions || [], orders: m.orders || [] };
      if (k.positions) k.positions(st.positions);
      break;
    case 'deals': {
      const w = st.dealWait.get(String(m.id)); if (w) { st.dealWait.delete(String(m.id)); w.resolve(m.deals || []); }
      break;
    }
    case 'pong': break;
  }
}

function sendHist(id: string, p: Pending): void {
  const o = p.o;
  send(`HIST|${id}|${resolve(o.symbol)}|${TF[o.candleType] || 'H1'}|${o.limit || 1500}|${Math.floor(Date.parse(o.to) / 1000)}`);
}
export function request(o: ChartRequest): void {
  const slot = o.slot || 'main';
  if (o.inclusive) st.last[slot] = o;
  if (!st.connected) { log.info('mt5', `รอ EA เชื่อมต่อก่อนขอแท่งเทียน ${o.symbol}`); return; }
  const id = String(++st.reqId), p: Pending = { slot, symbol: o.symbol, o };
  st.pending.set(id, p);
  sendHist(id, p);
  if (o.inclusive) send(`SUB|${slot}|${resolve(o.symbol)}|${TF[o.candleType] || 'H1'}`);
}
/** Watchlist names are upper-case and generic (XAUUSD); MT5 names are case-sensitive and often carry a
 *  broker suffix (XAUUSDbrex.). Map each watchlist name to the name this terminal really has. */
export function resolve(symIn: unknown, list: string[] = st.info ? st.info.symbols : []): string {
  const sym = String(symIn || '');
  if (!list.length || list.includes(sym)) return sym;
  const up = sym.toUpperCase(), ci = list.find((x) => x.toUpperCase() === up);
  if (ci) return ci;
  const base = up.replace(/[^A-Z0-9]/g, '');
  const pre = list.filter((x) => x.toUpperCase().replace(/[^A-Z0-9]/g, '').startsWith(base)).sort((a, b) => a.length - b.length);
  return pre[0] || sym;
}
const alias = new Map<string, Set<string>>();   // MT5 name -> watchlist names that point to it
/** Read-only account data from the EA (v2+): push of positions/orders on/off. */
export function positions(on: boolean): PositionsSnapshot | null {
  st.wantPos = !!on;
  if (st.connected && st.info && st.info.caps.includes('pos')) send('POS|' + (on ? 1 : 0));
  return st.positions;
}
/** Deal history (UTC seconds; to = 0 → now). */
export function deals(fromUnix: number, toUnix = 0): Promise<Deal[]> {
  if (!st.connected || !st.info) return Promise.reject(new Error('EA ยังไม่ได้เชื่อมต่อ'));
  if (!st.info.caps.includes('deals')) return Promise.reject(new Error('EA รุ่นเก่า — ติดตั้ง EA ใหม่'));
  const id = String(++st.reqId);
  return new Promise<Deal[]>((res, rej) => {
    const t = setTimeout(() => { if (st.dealWait.delete(id)) rej(new Error('EA ไม่ตอบ')); }, 15000);
    st.dealWait.set(id, { resolve: (v) => { clearTimeout(t); res(v); }, reject: (e) => { clearTimeout(t); rej(e); } });
    send(`DEALS|${id}|${Math.floor(fromUnix)}|${Math.floor(toUnix)}`);
  });
}
export function watch(symbols: string[]): void {
  st.unknown.clear(); alias.clear();
  const out: string[] = [];
  for (const s of symbols) {
    const r = resolve(s);
    let set = alias.get(r);
    if (!set) { set = new Set(); alias.set(r, set); out.push(r); }
    set.add(s);
    if (r !== s) log.info('mt5', `${s} → ใช้ชื่อใน MT5: ${r}`);
  }
  send('WATCH|' + out.join(','));
}

/** MT5 "Experts" folders on this computer (for installing the EA):
 *  macOS: MetaTrader runs in a Wine bottle under ~/Library/Application Support/<bottle>/drive_c/… (or ~/.wine)
 *  Windows: %APPDATA%\MetaQuotes\Terminal\<id>\MQL5\Experts and Program Files installs */
export function findExpertDirs({ home, appData, platform, env = {} }: { home: string; appData: string; platform: string; env?: Record<string, string | undefined> }): string[] {
  const out = new Set<string>();
  const ls = (d: string): string[] => { try { return fs.readdirSync(d, { withFileTypes: true }).filter((x) => x.isDirectory()).map((x) => path.join(d, x.name)); } catch (_) { return []; } };
  const add = (d: string): void => { const e = path.join(d, 'MQL5', 'Experts'); if (fs.existsSync(e)) out.add(e); };
  const scanDriveC = (c: string): void => {
    for (const pf of ['Program Files', 'Program Files (x86)']) ls(path.join(c, pf)).forEach(add);
    for (const u of ls(path.join(c, 'users'))) ls(path.join(u, 'AppData', 'Roaming', 'MetaQuotes', 'Terminal')).forEach(add);
  };
  if (platform === 'darwin') {
    for (const b of ls(path.join(home, 'Library', 'Application Support'))) if (fs.existsSync(path.join(b, 'drive_c'))) scanDriveC(path.join(b, 'drive_c'));
    if (fs.existsSync(path.join(home, '.wine', 'drive_c'))) scanDriveC(path.join(home, '.wine', 'drive_c'));
  } else if (platform === 'win32') {
    ls(path.join(appData, 'MetaQuotes', 'Terminal')).forEach(add);
    for (const pf of [env.ProgramFiles, env['ProgramFiles(x86)']].filter((x): x is string => !!x)) ls(pf).forEach(add);
  }
  return [...out];
}

/** The wine launcher that runs MT5 on a Mac. MetaQuotes' app ships it in Contents/SharedSupport/wine/bin/wine
 *  (new WoW64 wine: no wine64). Known places first, then a search inside the app bundle, then system wine. */
export function findWine({ appBundles = [], extra }: { appBundles?: string[]; extra?: string[] } = {}): string | null {
  const isFile = (f: string): boolean => { try { return fs.statSync(f).isFile(); } catch (_) { return false; } };
  for (const b of appBundles) {
    for (const rel of ['Contents/SharedSupport/wine/bin', 'Contents/SharedSupport/metatrader5/wine/bin', 'Contents/Resources/wine/bin', 'Contents/SharedSupport/bin']) {
      for (const n of ['wine64', 'wine']) { const f = path.join(b, rel, n); if (isFile(f)) return f; }
    }
  }
  let found: string | null = null;
  const walk = (d: string, depth: number): void => {
    if (found || depth > 6) return;
    let ents: fs.Dirent[]; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
    if (path.basename(d) === 'bin') for (const n of ['wine64', 'wine']) { const e = ents.find((x) => x.name === n && x.isFile()); if (e) { found = path.join(d, n); return; } }
    for (const e of ents) if (e.isDirectory() && !/^(lib|lib64|share|include|drive_c|Frameworks)$/.test(e.name)) walk(path.join(d, e.name), depth + 1);
  };
  for (const b of appBundles) walk(path.join(b, 'Contents'), 0);
  if (found) return found;
  const sys = extra || ['/opt/homebrew/bin/wine64', '/opt/homebrew/bin/wine', '/usr/local/bin/wine64', '/usr/local/bin/wine',
    ...(() => { try { return fs.readdirSync('/Applications').filter((n) => /^Wine.*\.app$/.test(n)).flatMap((n) => ['wine64', 'wine'].map((w) => `/Applications/${n}/Contents/Resources/wine/bin/${w}`)); } catch (_) { return []; } })()];
  return sys.find(isFile) || null;
}

export interface Exec { cmd: string; args: string[] }
/** How to start / compile with MT5 on this computer. `missing` set → something was not found. */
export interface LaunchPlan {
  ini: string; iniPath: string; env?: Record<string, string>;
  wine?: string | null; terminal?: string | null; missing?: 'terminal64.exe' | 'wine';
  compile?: Exec | null; editor?: Exec | null; launch?: Exec;
}
/** Plan how to start MT5 with the EA already on a chart (MT5 "/config:" startup file).
 *  expertsDir: an MQL5/Experts folder from findExpertDirs. Returns null if the folder is not inside a Wine drive_c on macOS.
 *  macOS: MT5 is a Wine bottle, so we run the bottle's wine with WINEPREFIX; Windows runs the exe directly. */
export function planLaunch({ expertsDir, platform, appBundles = [], symbol, period = 'M5', wineCandidates }:
  { expertsDir: string; platform: string; appBundles?: string[]; symbol?: string; period?: string; wineCandidates?: string[] }): LaunchPlan | null {
  const dataDir = path.dirname(path.dirname(expertsDir));            // …/MetaTrader 5 (or Terminal/<id>)
  let installDir = dataDir;
  try { const o = fs.readFileSync(path.join(dataDir, 'origin.txt'), 'utf16le').replace(/^\uFEFF/, '').trim(); if (o && /terminal/i.test(dataDir)) installDir = o; } catch (_) { /* no origin.txt: portable install */ }
  const exe = (n: string): string | null => { for (const x of [n, n.toLowerCase()]) { const f = path.join(installDir, x); if (fs.existsSync(f)) return f; } return null; };
  const terminal = exe('terminal64.exe'), editor = exe('MetaEditor64.exe');
  // data inside the install folder = portable mode (always the case for MT5 on Mac): start it the same way,
  // otherwise MT5 would open a fresh profile without the user's login.
  const portable = installDir === dataDir ? ['/portable'] : [];
  const ini = ['[StartUp]', 'Expert=PriceTrackerBridge', symbol ? 'Symbol=' + symbol : '', 'Period=' + period,
    '[Experts]', 'Enabled=1', 'AllowLiveTrading=0', 'AllowDllImport=0', 'WebRequest=1', 'WebRequestUrl=http://127.0.0.1', ''].filter((l) => l !== '').join('\r\n') + '\r\n';
  const iniPath = path.join(dataDir, 'config', 'pricetracker-start.ini');
  const ea = path.join(expertsDir, 'PriceTrackerBridge.mq5');
  if (platform === 'darwin') {
    const i = expertsDir.indexOf(path.sep + 'drive_c' + path.sep); if (i < 0) return null;
    const prefix = expertsDir.slice(0, i), win = (f: string): string => 'C:' + f.slice(i + 8).split(path.sep).join('\\');
    const wine = findWine({ appBundles, extra: wineCandidates });
    if (!terminal || !wine) return { terminal, wine, ini, iniPath, missing: !terminal ? 'terminal64.exe' : 'wine' };
    // same WINEPREFIX as the running MT5: wine reuses its wineserver instead of starting a second one
    return { ini, iniPath, wine, env: { WINEPREFIX: prefix, WINEDEBUG: '-all' },
      compile: editor ? { cmd: wine, args: [win(editor), '/compile:' + win(ea), '/log'] } : null,
      editor: editor ? { cmd: wine, args: [win(editor), win(ea)] } : null,
      launch: { cmd: wine, args: [win(terminal), ...portable, '/config:' + win(iniPath)] } };
  }
  if (!terminal) return { ini, iniPath, missing: 'terminal64.exe' };
  return { ini, iniPath, env: {},
    compile: editor ? { cmd: editor, args: ['/compile:' + ea, '/log'] } : null,
    editor: editor ? { cmd: editor, args: [ea] } : null,
    launch: { cmd: terminal, args: [...portable, '/config:' + iniPath] } };
}

export const getPositions = (): PositionsSnapshot | null => st.positions;
export const status = (): Mt5Status => ({ listening: !!st.server, connected: st.connected, broker: st.info && st.info.broker, server: st.info && st.info.server,
  symbols: st.info ? st.info.symbols : [], eaVersion: st.info ? st.info.v : null, eaBuild: st.info ? st.info.build || null : null, unknown: [...st.unknown], port, lastTick: st.lastTick });
