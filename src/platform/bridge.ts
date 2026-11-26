// window.vcg for platforms without Electron:
//  • Android (Capacitor): drives a hidden native WebView with VCG WebTrader (plugin "VcgWeb") — same logic as the desktop main process
//  • plain browser: no VCG connection (the Demo data source is used instead)
// On the desktop app, the preload (src/main/preload.ts) already defines window.vcg and this file does nothing.
import { toast } from '../ui/toast';
import VCGI from '../vcg-inject';
import type { CapacitorGlobal, PluginListenerHandle } from '@capacitor/core';
import type { RawQuote, ParsedQuote } from '../vcg-inject';
import type { ChartRequest, LogEntry, LogLevel, NetLevel } from '../main/types';

/** The native Android plugin (android/app/src/main/java/…/VcgWebPlugin.java). */
export interface VcgWebPlugin {
  start(o: { url: string }): Promise<void>;
  show(): Promise<{ visible?: boolean; w?: number; h?: number; url?: string } | undefined>;
  hide(): Promise<void>;
  minimize(): Promise<void>;
  reload(): Promise<void>;
  navigate(o: { url: string }): Promise<void>;
  clearData(): Promise<void>;
  getUrl(): Promise<{ url?: string }>;
  eval(o: { js: string }): Promise<{ value: string }>;
  addListener(ev: 'message', cb: (e: { data: string }) => void): Promise<PluginListenerHandle> | PluginListenerHandle;
  addListener(ev: 'page', cb: (e: { url: string }) => void): Promise<PluginListenerHandle> | PluginListenerHandle;
  addListener(ev: 'pageError', cb: (e: { code: number; description: string }) => void): Promise<PluginListenerHandle> | PluginListenerHandle;
  addListener(ev: 'hidden' | 'back' | 'googleBlocked', cb: () => void): Promise<PluginListenerHandle> | PluginListenerHandle;
}
/** window.Capacitor as the Android WebView injects it (core may be missing → raw bridge calls). */
type CapacitorBridge = CapacitorGlobal & {
  Plugins?: Record<string, unknown>;
  nativePromise?: (plugin: string, method: string, opts: unknown) => Promise<unknown>;
  nativeCallback?: (plugin: string, method: string, opts: unknown, cb: (d: unknown) => void) => string;
};
declare global {
  interface Window { vcg?: unknown; Capacitor?: CapacitorBridge; APP_VERSION?: string }
}
type Ev = 'quotes' | 'status' | 'chart' | 'logs' | 'net' | 'back';
type Cb = (d?: unknown) => void;
interface PageMsg { type: string; data?: unknown; slot?: string }

interface BridgeSettings {
  symbols: string[]; traySymbol: string; csv: boolean;
  api: { enabled: boolean; port: number; token: string; lan: boolean };
  webhook: { url: string; onSignal: boolean; onAlert: boolean };
  telegram: { botToken: string; chatId: string; onSignal: boolean; onAlert: boolean };
  net: { slowMs: number; delayMs: number; staleSec: number; stuckSec: number; notify: boolean };
  openAtLogin: boolean;
}

(function (): void {
  if (window.vcg) return;
  const C = window.Capacitor;
  const native = !!(C && C.isNativePlatform && C.isNativePlatform());
  const ls = {
    get<T>(k: string, d: T): T { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v) as T; } catch (_) { return d; } },
    set(k: string, v: unknown): void { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* storage full / private mode */ } },
  };
  const ev: Partial<Record<Ev, Cb[]>> = {};
  const on = (n: Ev, cb: Cb): void => { (ev[n] || (ev[n] = [])).push(cb); };
  const emit = (n: Ev, d?: unknown): void => (ev[n] || []).forEach((f) => { try { f(d); } catch (e) { console.error(e); } });

  // ---------------- logger ----------------
  const logs = ls.get<LogEntry[]>('bridge.logs', []), pendingLogs: LogEntry[] = [];
  function log(level: LogLevel, source: string, msg: unknown, data?: unknown): void {
    const e: LogEntry = { t: new Date().toISOString(), level, source, msg: String(msg) };
    if (data !== undefined && data !== null) { try { e.data = typeof data === 'string' ? data : JSON.stringify(data).slice(0, 1500); } catch (_) { /* unserialisable */ } }
    logs.push(e); if (logs.length > 1500) logs.splice(0, logs.length - 1500);
    pendingLogs.push(e);
  }
  setInterval(() => { if (pendingLogs.length) emit('logs', pendingLogs.splice(0)); }, 500);
  setInterval(() => ls.set('bridge.logs', logs.slice(-400)), 15000);

  const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));
  // ---------------- settings / state ----------------
  const settings = {
    symbols: ['XAUUSD', 'EURUSD'], traySymbol: 'XAUUSD', csv: false,
    api: { enabled: false, port: 8787, token: '', lan: false },
    webhook: { url: '', onSignal: true, onAlert: true },
    telegram: { botToken: '', chatId: '', onSignal: true, onAlert: true },
    net: { slowMs: 800, delayMs: 3000, staleSec: 45, stuckSec: 60, notify: true },
    openAtLogin: false,
    ...ls.get<Record<string, unknown>>('bridge.settings', {}),
  } as BridgeSettings;
  const save = () => ls.set('bridge.settings', settings);
  const state = { connected: false, loggedIn: false, serverSubs: new Set<string>(), invalid: new Set<string>(), quotes: {} as Record<string, ParsedQuote>, lastTick: 0, ticks: 0,
    stage: '' as string, page: '' as string, overlay: false };
  const statusObj = () => ({ connected: state.connected, loggedIn: state.loggedIn, csv: false, symbols: settings.symbols, traySymbol: settings.traySymbol,
    lastTick: state.lastTick, ticks: state.ticks, api: { enabled: false }, invalid: [...state.invalid], platform: native ? 'android' : 'web',
    stage: native ? (state.stage || 'starting') : 'web', page: state.page || '', overlay: !!state.overlay, nativeOk: !!V });
  const sendStatus = () => emit('status', statusObj());

  let pendingQuotes: Record<string, ParsedQuote> = {};
  setInterval(() => { const l = Object.values(pendingQuotes); if (l.length) { pendingQuotes = {}; emit('quotes', l); } }, 100);
  const delays: number[] = [], base: number[] = [];
  function onQuotes(rawList: RawQuote[] | null | undefined): void {
    for (const raw of rawList || []) {
      const q = VCGI.parseQuote(raw);
      if (!settings.symbols.includes(q.symbol)) continue;
      state.quotes[q.symbol] = q; state.lastTick = Date.now(); state.ticks++;
      const dl = Date.now() - Date.parse(q.time); if (isFinite(dl)) { delays.push(dl); if (delays.length > 40) delays.shift(); base.push(dl); if (base.length > 600) base.shift(); }
      pendingQuotes[q.symbol] = q;
    }
  }
  function handlePageMsg(m: PageMsg | null): void {
    if (!m || !m.type) return;
    if (m.type === 'quotes') return onQuotes(m.data as RawQuote[]);
    if (m.type === 'subs') { state.serverSubs = new Set((m.data || []) as string[]); for (const s of state.serverSubs) { subTries.delete(s); state.invalid.delete(s); } return; }
    if (m.type === 'feedError') return log('error', 'feed', 'symbol:error', m.data);
    if (m.type === 'chartError') log('error', 'chart', 'chart:error', m.data);
    else if (m.type === 'chartAuthRenew') log('warn', 'chart', 'token หมดอายุ (PERMISSION_DENIED) — กำลังขอ token ใหม่และโหลดซ้ำ');
    else if (m.type === 'chartLog') log('info', 'chart', String(m.data));
    else if (m.type === 'chartConnected') log('info', 'chart', 'chart-history เชื่อมต่อแล้ว');
    else if (m.type === 'chartDisconnected' || m.type === 'chartConnectError') log('warn', 'chart', m.type, m.data);
    emit('chart', m);
  }

  // ---------------- Android: hidden VCG WebView ----------------
  let lastStage = '', startedAt = Date.now(), overlayInfo: unknown = null;
  // show the native WebTrader overlay and record what Android reports (visible? size?) for the Log tab
  async function showOverlay(why: string): Promise<boolean> {
    if (!V) return false;
    try {
      const r = await V.show(); overlayInfo = r || {}; state.overlay = true;
      log(r && r.visible === false ? 'error' : 'info', 'auth', `${why || 'เปิดหน้า WebTrader'} · overlay visible=${r && r.visible} ${r && r.w}x${r && r.h}`);
      sendStatus(); return !(r && r.visible === false);
    } catch (e) { log('error', 'auth', 'เปิดหน้า WebTrader ไม่ได้: ' + errMsg(e)); return false; }
  }
  let hiddenAt = 0, V: VcgWebPlugin | null = null, shownForLogin = false, notConnectedSince = Date.now(), reconnects = 0;
  const lastChartReq: Record<string, ChartRequest> = {};
  const subTries = new Map<string, number>();
  const jsEval = async (js: string): Promise<unknown> => { if (!V) throw new Error('no VCG WebView'); const r = await V.eval({ js }); try { return JSON.parse(r.value) as unknown; } catch (_) { return r.value; } };
  async function sendChartReq(o: ChartRequest): Promise<void> {
    lastChartReq[o.slot || 'main'] = o;
    log('info', 'chart', `ขอแท่งเทียน ${o.symbol} type=${o.candleType} limit=${o.limit}`);
    if (!V || !state.connected) return;
    try { await jsEval(VCGI.CHART_REQ_JS(o)); } catch (e) { log('error', 'chart', errMsg(e)); }
  }
  async function tick(): Promise<void> {
    const v = V; if (!v) return;
    let url = '';
    try { url = (await v.getUrl()).url || ''; } catch (_) { return; }
    const onTrader = url.includes('/webtrader');
    let connected = false;
    if (onTrader) {
      try { await jsEval(VCGI.ANDROID_RELAY_JS); connected = (await jsEval(VCGI.CONNECTED_JS)) === true; } catch (_) { /* page busy */ }
    }
    // login form visible? (the login can live on the /webtrader URL itself)
    type LoginPage = { pw?: boolean; path?: string; title?: string };
    let page: LoginPage | null = null;
    if (url) { try { const p = await jsEval(VCGI.LOGIN_STATE_JS); page = (typeof p === 'string' ? JSON.parse(p) : p) as LoginPage | null; } catch (_) { page = null; } }
    const needsLogin = !connected && (!onTrader || /login|signin|sign-in|auth/i.test(url) || !!(page && page.pw));
    state.loggedIn = onTrader && !needsLogin;
    state.stage = connected ? 'connected' : !url ? 'starting' : needsLogin ? 'login' : 'connecting';
    state.page = page ? `${page.path || ''}${page.title ? ' · ' + page.title : ''}` : url.replace(/^https?:\/\/[^/]+/, '');
    if (state.stage !== lastStage) { log('info', 'auth', `สถานะหน้า VCG: ${state.stage} (${state.page})`); lastStage = state.stage; }
    if (connected !== state.connected) {
      if (!connected && state.connected) reconnects++;
      state.connected = connected;
      log(connected ? 'info' : 'warn', 'feed', connected ? 'เชื่อมต่อราคาแล้ว' : 'การเชื่อมต่อราคาหลุด');
    }
    if (connected) {
      notConnectedSince = Date.now();
      if (shownForLogin) { shownForLogin = false; state.overlay = false; void v.hide(); log('info', 'auth', 'login สำเร็จ ซ่อนหน้าต่าง WebTrader'); }
      ls.set('bridge.everConnected', true);
      try { if ((await jsEval(VCGI.FEED_JS)) === 'ok') log('info', 'feed', 'ติดตั้งตัวรับราคาในหน้า WebTrader แล้ว'); } catch (_) { /* retried next tick */ }
      try { if ((await jsEval(VCGI.CHART_JS)) === 'ok') Object.values(lastChartReq).forEach((o) => { void sendChartReq(o); }); } catch (_) { /* retried next tick */ }
      const want = settings.symbols.filter((s) => !state.invalid.has(s));
      const missing = want.filter((s) => !state.serverSubs.has(s));
      if (missing.length) {
        for (const s of missing) { const t = (subTries.get(s) || 0) + 1; subTries.set(s, t); if (t > 3) { state.invalid.add(s); log('warn', 'feed', `ไม่พบ ${s} ใน VCG — หยุดขอแล้ว`); } }
        const merged = [...new Set([...state.serverSubs, ...want.filter((s) => !state.invalid.has(s))])];
        try { await jsEval(VCGI.SUB_JS(merged)); } catch (_) { /* retried next tick */ }
      }
    } else if (!shownForLogin && Date.now() - hiddenAt > 60000 &&      // user closed it → don't pop up again for a minute
      (needsLogin || (!ls.get('bridge.everConnected', false) && Date.now() - startedAt > 10000))) {
      shownForLogin = true; void showOverlay('ต้อง login — เปิดหน้า WebTrader');
    } else if (onTrader && Date.now() - notConnectedSince > settings.net.stuckSec * 1000) {
      notConnectedSince = Date.now(); log('warn', 'feed', 'เชื่อมต่อไม่ได้นาน — โหลด WebTrader ใหม่'); void v.reload();
    }
    sendStatus();
  }

  // ---------------- network monitor ----------------
  let rtt: number | null = null, fails = 0, netLevel: NetLevel = 'ok';
  const PROBE_URLS = ['https://prod-ws-server.anttix.app/', 'https://vcgmarkets.com/favicon.ico']; let probeIx = 0;
  async function probe(): Promise<void> {
    const t0 = Date.now();
    const url = PROBE_URLS[probeIx] || '';
    try { const hit = () => fetch(url + (url.includes('?') ? '&' : '?') + '_=' + Date.now(), { method: 'HEAD', cache: 'no-store' });
      await hit(); const t1 = Date.now(); await hit(); rtt = Date.now() - t1; fails = 0; void t0; }
    catch (_) { fails++; rtt = null; if (state.lastTick && Date.now() - state.lastTick < 15000) { probeIx = (probeIx + 1) % PROBE_URLS.length; fails = 0; } }
  }
  function evalNet(): void {
    if (!native) return;
    const bs = [...base].sort((a, b) => a - b), floor = bs.length >= 20 ? bs[Math.floor(bs.length * 0.1)] : null;
    const raw = delays.length ? [...delays].sort((a, b) => a - b)[Math.floor(delays.length / 2)] : null;
    const n = settings.net, med = raw == null || floor == null ? null : Math.max(0, Math.round(raw - floor));
    const since = state.lastTick ? (Date.now() - state.lastTick) / 1000 : null;
    let level: NetLevel = 'ok', detail = '';
    if (fails >= 2 && !(since != null && since < 15)) { level = 'offline'; detail = 'ติดต่อเซิร์ฟเวอร์ VCG ไม่ได้'; }
    else if (state.loggedIn && !state.connected) { level = 'down'; detail = 'การเชื่อมต่อราคาหลุด กำลังต่อใหม่'; }
    else if (state.connected && since != null && since > n.staleSec) { level = 'stale'; detail = `ไม่มีราคาใหม่ ${Math.round(since)} วินาที`; }
    else if ((rtt != null && rtt > n.slowMs) || (med != null && med > n.delayMs)) { level = 'slow'; detail = `เน็ตช้า: ping ${rtt ?? '—'} ms`; }
    if (level !== netLevel) { log(level === 'ok' ? 'info' : 'warn', 'network', level === 'ok' ? 'การเชื่อมต่อกลับมาปกติ' : detail); netLevel = level; }
    emit('net', { level, detail, rtt, feedDelay: med, lastTickAgo: since, reconnects, connected: state.connected, cpu: null });
  }

  // ---------------- outgoing notifications ----------------
  async function post(url: string, body: unknown): Promise<void> { const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); if (!r.ok) throw new Error('HTTP ' + r.status); }
  async function notify(event: string, payload: unknown, text: string): Promise<number> {
    const jobs: Promise<unknown>[] = [], key = event === 'signal' ? 'onSignal' : 'onAlert';
    if (settings.webhook.url && settings.webhook[key] !== false) jobs.push(post(settings.webhook.url, { event, ...(payload as object), text, content: text }).then(() => log('info', 'webhook', 'ส่งแล้ว'), (e: unknown) => log('error', 'webhook', errMsg(e))));
    if (settings.telegram.botToken && settings.telegram.chatId && settings.telegram[key] !== false)
      jobs.push(post(`https://api.telegram.org/bot${settings.telegram.botToken}/sendMessage`, { chat_id: settings.telegram.chatId, text }).then(() => log('info', 'telegram', 'ส่งแล้ว'), (e: unknown) => log('error', 'telegram', errMsg(e))));
    await Promise.all(jobs); return jobs.length;
  }

  // ---------------- public API (same shape as preload.js) ----------------
  window.vcg = {
    platform: native ? 'android' : 'web',
    capabilities: { vcg: native, api: false, csv: false, files: !native },
    onQuotes: (cb: Cb) => on('quotes', cb), onStatus: (cb: Cb) => on('status', cb), onChart: (cb: Cb) => on('chart', cb),
    onLogs: (cb: Cb) => { on('logs', cb); setTimeout(() => cb(logs.slice(-300)), 0); }, onNet: (cb: Cb) => on('net', cb),
    requestChart: (o: ChartRequest) => sendChartReq(o),
    pushChart: () => { /* desktop only (local API) */ }, pushAnalysis: () => { /* desktop only (local API) */ },
    log: (level: LogLevel, msg: unknown, data?: unknown, source = 'ui') => log(level, source, msg, data),
    notify: async (event: string, payload: unknown, text: string) => notify(event, payload, text),
    fetchJSON: async (url: string): Promise<unknown> => { const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json() as Promise<unknown>; },
    openSite: (url: string) => { window.open(url, '_blank', 'noopener'); return true; },   // phone/web: system browser / new tab
    fetchText: async (url: string) => { const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); },
    getSettings: async () => ({ api: settings.api, webhook: settings.webhook, telegram: settings.telegram, net: settings.net, openAtLogin: false, version: window.APP_VERSION || '', userData: native ? 'Android' : 'browser', logFile: '' }),
    setSettings: async (s: { webhook?: Partial<BridgeSettings['webhook']>; telegram?: Partial<BridgeSettings['telegram']>; net?: Partial<BridgeSettings['net']> }) => {
      if (s.webhook) settings.webhook = { ...settings.webhook, ...s.webhook };
      if (s.telegram) settings.telegram = { ...settings.telegram, ...s.telegram };
      if (s.net) settings.net = { ...settings.net, ...s.net };
      save(); log('info', 'settings', 'บันทึกการตั้งค่า'); return true;
    },
    signOut: async () => { if (V) { await V.clearData(); state.connected = false; void V.navigate({ url: VCGI.WEBTRADER_URL }); log('warn', 'auth', 'ออกจากระบบแล้ว'); } return true; },
    openLogFile: () => { /* desktop only */ }, openLogFolder: () => { /* desktop only */ }, openCsv: () => { /* desktop only */ }, toggleCsv: () => log('info', 'csv', 'การบันทึก CSV ใช้ได้เฉพาะแอป Mac'),
    addSymbol: (sym: unknown) => { const s = String(sym || '').trim().toUpperCase(); state.invalid.delete(s); subTries.delete(s); if (s && !settings.symbols.includes(s)) { settings.symbols.push(s); save(); void tick(); } sendStatus(); },
    removeSymbol: (s: string) => { settings.symbols = settings.symbols.filter((x) => x !== s); delete state.quotes[s]; if (settings.traySymbol === s) settings.traySymbol = settings.symbols[0] || ''; save(); sendStatus(); },
    setTray: (s: string) => { settings.traySymbol = s; save(); sendStatus(); },
    showTrader: () => {
      if (V) { shownForLogin = true; void showOverlay('ผู้ใช้กดเปิดหน้า Login'); return true; }
      log('error', 'app', 'เปิดหน้า VCG ไม่ได้: ส่วนเชื่อมต่อ Android ไม่ทำงาน (platform=' + (native ? 'android' : 'web') + ')');
      toast(/Android/.test(navigator.userAgent) ? 'ส่วนเชื่อมต่อ Android ไม่ทำงาน — ส่งภาพแท็บ Log ให้ผู้พัฒนา' : 'โหมดเว็บต่อ VCG ไม่ได้ — ใช้ข้อมูล Demo', 'error', 10000);
    },
    onBack: (cb: Cb) => on('back', cb),
    minimize: () => { if (V) void V.minimize(); },
    reloadTrader: () => { if (V) { log('info', 'feed', 'ผู้ใช้สั่งเชื่อมต่อใหม่'); void V.reload(); } },
  };

  // The Android WebView only injects Capacitor's native bridge; registerPlugin() comes from @capacitor/core
  // (www/capacitor.js). Fall back to the raw bridge calls if core is missing, so the app never silently loses VCG.
  function getPlugin(cap: CapacitorBridge, name: string): VcgWebPlugin {
    if (typeof cap.registerPlugin === 'function') return cap.registerPlugin<VcgWebPlugin>(name);
    if (cap.Plugins && cap.Plugins[name]) return cap.Plugins[name] as VcgWebPlugin;
    const np = cap.nativePromise, nc = cap.nativeCallback;
    if (typeof np === 'function') {
      log('warn', 'app', 'ไม่มี @capacitor/core — เรียก plugin ผ่าน native bridge โดยตรง');
      return new Proxy({}, { get: (_, m) => (m === 'then' ? undefined
        : m === 'addListener' ? (evName: string, cb: (d: unknown) => void) => Promise.resolve(nc ? nc(name, 'addListener', { eventName: evName }, cb) : undefined)
          : (opts?: unknown) => np(name, String(m), opts || {})) }) as VcgWebPlugin;
    }
    throw new Error('Capacitor bridge has no registerPlugin/nativePromise (keys: ' + Object.keys(cap).join(',') + ')');
  }
  if (native && C) try {
    const v = getPlugin(C, 'VcgWeb');
    V = v;
    void v.addListener('message', (e) => { try { handlePageMsg(JSON.parse(e.data) as PageMsg); } catch (_) { /* not ours */ } });
    void v.addListener('page', (e) => log('info', 'webtrader', 'เปิดหน้า ' + e.url));
    void v.addListener('pageError', (e) => log('error', 'webtrader', `โหลดหน้าไม่สำเร็จ ${e.code} ${e.description}`));
    void v.addListener('hidden', () => { shownForLogin = false; hiddenAt = Date.now(); state.overlay = false; sendStatus(); });
    void v.addListener('back', () => emit('back'));
    void v.addListener('googleBlocked', () => log('warn', 'auth', 'Google บล็อกการ login ในแอป — ให้ใช้อีเมล + รหัสผ่านของ VCG แทน'));
    v.start({ url: VCGI.WEBTRADER_URL }).then(() => {
      // first run (never connected yet): show the VCG login page straight away instead of waiting for the checks
      if (!ls.get('bridge.everConnected', false)) { shownForLogin = true; void showOverlay('เปิดครั้งแรก — แสดงหน้า login'); }
    }, (e: unknown) => log('error', 'app', 'เริ่มหน้า VCG ไม่ได้: ' + errMsg(e)));
    log('info', 'app', `เริ่มโปรแกรม (Android) · Capacitor ${C.getPlatform ? C.getPlatform() : ''} · plugins: ${Object.keys(C.Plugins || {}).join(', ')}`);
    setInterval(() => { void tick(); }, 3000); setInterval(() => { void probe(); }, 10000); setInterval(evalNet, 2000); void probe();
  } catch (e) { V = null; log('error', 'app', 'เริ่มส่วนเชื่อมต่อ Android ไม่สำเร็จ: ' + errMsg(e)); }
  else {
    log(/Android/.test(navigator.userAgent) && /wv\)/.test(navigator.userAgent) ? 'error' : 'info', 'app',
      `เปิดแบบเว็บ (Capacitor=${!!C}, native=${native}) — ไม่มีการเชื่อมต่อ VCG ใช้ข้อมูล Demo ได้`);
  }
  setTimeout(sendStatus, 100);
})();
