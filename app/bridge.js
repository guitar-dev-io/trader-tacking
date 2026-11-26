/* global VCGI */
// window.vcg for platforms without Electron:
//  • Android (Capacitor): drives a hidden native WebView with VCG WebTrader (plugin "VcgWeb") — same logic as main.js
//  • plain browser: no VCG connection (the Demo data source is used instead)
// On the desktop app, preload.js already defines window.vcg and this file does nothing.
(function () {
  if (window.vcg) return;
  const C = window.Capacitor;
  const native = !!(C && C.isNativePlatform && C.isNativePlatform());
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} },
  };
  const ev = {};
  const on = (n, cb) => (ev[n] || (ev[n] = [])).push(cb);
  const emit = (n, d) => (ev[n] || []).forEach((f) => { try { f(d); } catch (e) { console.error(e); } });

  // ---------------- logger ----------------
  const logs = ls.get('bridge.logs', []), pendingLogs = [];
  function log(level, source, msg, data) {
    const e = { t: new Date().toISOString(), level, source, msg: String(msg) };
    if (data !== undefined && data !== null) { try { e.data = typeof data === 'string' ? data : JSON.stringify(data).slice(0, 1500); } catch (_) {} }
    logs.push(e); if (logs.length > 1500) logs.splice(0, logs.length - 1500);
    pendingLogs.push(e);
  }
  setInterval(() => { if (pendingLogs.length) emit('logs', pendingLogs.splice(0)); }, 500);
  setInterval(() => ls.set('bridge.logs', logs.slice(-400)), 15000);

  // ---------------- settings / state ----------------
  const settings = {
    symbols: ['XAUUSD', 'EURUSD'], traySymbol: 'XAUUSD', csv: false,
    api: { enabled: false, port: 8787, token: '', lan: false },
    webhook: { url: '', onSignal: true, onAlert: true },
    telegram: { botToken: '', chatId: '', onSignal: true, onAlert: true },
    net: { slowMs: 800, delayMs: 3000, staleSec: 45, stuckSec: 60, notify: true },
    openAtLogin: false,
    ...ls.get('bridge.settings', {}),
  };
  const save = () => ls.set('bridge.settings', settings);
  const state = { connected: false, loggedIn: false, serverSubs: new Set(), invalid: new Set(), quotes: {}, lastTick: 0, ticks: 0 };
  const statusObj = () => ({ connected: state.connected, loggedIn: state.loggedIn, csv: false, symbols: settings.symbols, traySymbol: settings.traySymbol,
    lastTick: state.lastTick, ticks: state.ticks, api: { enabled: false }, invalid: [...state.invalid], platform: native ? 'android' : 'web',
    stage: native ? (state.stage || 'starting') : 'web', page: state.page || '', overlay: !!state.overlay, nativeOk: !!V });
  const sendStatus = () => emit('status', statusObj());

  let pendingQuotes = {};
  setInterval(() => { const l = Object.values(pendingQuotes); if (l.length) { pendingQuotes = {}; emit('quotes', l); } }, 100);
  const delays = [], base = [];
  function onQuotes(rawList) {
    for (const raw of rawList || []) {
      const q = VCGI.parseQuote(raw);
      if (!settings.symbols.includes(q.symbol)) continue;
      state.quotes[q.symbol] = q; state.lastTick = Date.now(); state.ticks++;
      const dl = Date.now() - Date.parse(q.time); if (isFinite(dl)) { delays.push(dl); if (delays.length > 40) delays.shift(); base.push(dl); if (base.length > 600) base.shift(); }
      pendingQuotes[q.symbol] = q;
    }
  }
  function handlePageMsg(m) {
    if (!m || !m.type) return;
    if (m.type === 'quotes') return onQuotes(m.data);
    if (m.type === 'subs') { state.serverSubs = new Set(m.data || []); for (const s of state.serverSubs) { subTries.delete(s); state.invalid.delete(s); } return; }
    if (m.type === 'feedError') return log('error', 'feed', 'symbol:error', m.data);
    if (m.type === 'chartError') log('error', 'chart', 'chart:error', m.data);
    else if (m.type === 'chartAuthRenew') log('warn', 'chart', 'token หมดอายุ (PERMISSION_DENIED) — กำลังขอ token ใหม่และโหลดซ้ำ');
    else if (m.type === 'chartLog') log('info', 'chart', String(m.data));
    else if (m.type === 'chartConnected') log('info', 'chart', 'chart-history เชื่อมต่อแล้ว');
    else if (m.type === 'chartDisconnected' || m.type === 'chartConnectError') log('warn', 'chart', m.type, m.data);
    emit('chart', m);
  }

  // ---------------- Android: hidden VCG WebView ----------------
  let lastStage = '', startedAt = Date.now(), overlayInfo = null;
  // show the native WebTrader overlay and record what Android reports (visible? size?) for the Log tab
  async function showOverlay(why) {
    if (!V) return false;
    try {
      const r = await V.show(); overlayInfo = r || {}; state.overlay = true;
      log(r && r.visible === false ? 'error' : 'info', 'auth', `${why || 'เปิดหน้า WebTrader'} · overlay visible=${r && r.visible} ${r && r.w}x${r && r.h}`);
      sendStatus(); return !(r && r.visible === false);
    } catch (e) { log('error', 'auth', 'เปิดหน้า WebTrader ไม่ได้: ' + (e && e.message)); return false; }
  }
  let hiddenAt = 0, V = null, lastChartReq = {}, shownForLogin = false, notConnectedSince = Date.now(), reconnects = 0;
  const subTries = new Map();
  const jsEval = async (js) => { const r = await V.eval({ js }); try { return JSON.parse(r.value); } catch (_) { return r.value; } };
  async function sendChartReq(o) {
    lastChartReq[o.slot || 'main'] = o;
    log('info', 'chart', `ขอแท่งเทียน ${o.symbol} type=${o.candleType} limit=${o.limit}`);
    if (!V || !state.connected) return;
    try { await jsEval(VCGI.CHART_REQ_JS(o)); } catch (e) { log('error', 'chart', e.message); }
  }
  async function tick() {
    if (!V) return;
    let url = '';
    try { url = (await V.getUrl()).url || ''; } catch (_) { return; }
    const onTrader = url.includes('/webtrader');
    let connected = false;
    if (onTrader) {
      try { await jsEval(VCGI.ANDROID_RELAY_JS); connected = (await jsEval(VCGI.CONNECTED_JS)) === true; } catch (_) {}
    }
    // login form visible? (the login can live on the /webtrader URL itself)
    let page = null;
    if (url) { try { page = await jsEval(VCGI.LOGIN_STATE_JS); if (typeof page === 'string') page = JSON.parse(page); } catch (_) { page = null; } }
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
      if (shownForLogin) { shownForLogin = false; state.overlay = false; V.hide(); log('info', 'auth', 'login สำเร็จ ซ่อนหน้าต่าง WebTrader'); }
      ls.set('bridge.everConnected', true);
      try { if ((await jsEval(VCGI.FEED_JS)) === 'ok') log('info', 'feed', 'ติดตั้งตัวรับราคาในหน้า WebTrader แล้ว'); } catch (_) {}
      try { if ((await jsEval(VCGI.CHART_JS)) === 'ok') Object.values(lastChartReq).forEach(sendChartReq); } catch (_) {}
      const want = settings.symbols.filter((s) => !state.invalid.has(s));
      const missing = want.filter((s) => !state.serverSubs.has(s));
      if (missing.length) {
        for (const s of missing) { const t = (subTries.get(s) || 0) + 1; subTries.set(s, t); if (t > 3) { state.invalid.add(s); log('warn', 'feed', `ไม่พบ ${s} ใน VCG — หยุดขอแล้ว`); } }
        const merged = [...new Set([...state.serverSubs, ...want.filter((s) => !state.invalid.has(s))])];
        try { await jsEval(VCGI.SUB_JS(merged)); } catch (_) {}
      }
    } else if (!shownForLogin && Date.now() - hiddenAt > 60000 &&      // user closed it → don't pop up again for a minute
      (needsLogin || (!ls.get('bridge.everConnected', false) && Date.now() - startedAt > 10000))) {
      shownForLogin = true; showOverlay('ต้อง login — เปิดหน้า WebTrader');
    } else if (onTrader && Date.now() - notConnectedSince > settings.net.stuckSec * 1000) {
      notConnectedSince = Date.now(); log('warn', 'feed', 'เชื่อมต่อไม่ได้นาน — โหลด WebTrader ใหม่'); V.reload();
    }
    sendStatus();
  }

  // ---------------- network monitor ----------------
  let rtt = null, fails = 0, netLevel = 'ok';
  const PROBE_URLS = ['https://prod-ws-server.anttix.app/', 'https://vcgmarkets.com/favicon.ico']; let probeIx = 0;
  async function probe() {
    const t0 = Date.now();
    const url = PROBE_URLS[probeIx];
    try { const hit = () => fetch(url + (url.includes('?') ? '&' : '?') + '_=' + Date.now(), { method: 'HEAD', cache: 'no-store' });
      await hit(); const t1 = Date.now(); await hit(); rtt = Date.now() - t1; fails = 0; void t0; }
    catch (_) { fails++; rtt = null; if (state.lastTick && Date.now() - state.lastTick < 15000) { probeIx = (probeIx + 1) % PROBE_URLS.length; fails = 0; } }
  }
  function evalNet() {
    if (!native) return;
    const bs = [...base].sort((a, b) => a - b), floor = bs.length >= 20 ? bs[Math.floor(bs.length * 0.1)] : null;
    const raw = delays.length ? [...delays].sort((a, b) => a - b)[Math.floor(delays.length / 2)] : null;
    const n = settings.net, med = raw == null || floor == null ? null : Math.max(0, Math.round(raw - floor));
    const since = state.lastTick ? (Date.now() - state.lastTick) / 1000 : null;
    let level = 'ok', detail = '';
    if (fails >= 2 && !(since != null && since < 15)) { level = 'offline'; detail = 'ติดต่อเซิร์ฟเวอร์ VCG ไม่ได้'; }
    else if (state.loggedIn && !state.connected) { level = 'down'; detail = 'การเชื่อมต่อราคาหลุด กำลังต่อใหม่'; }
    else if (state.connected && since != null && since > n.staleSec) { level = 'stale'; detail = `ไม่มีราคาใหม่ ${Math.round(since)} วินาที`; }
    else if ((rtt != null && rtt > n.slowMs) || (med != null && med > n.delayMs)) { level = 'slow'; detail = `เน็ตช้า: ping ${rtt ?? '—'} ms`; }
    if (level !== netLevel) { log(level === 'ok' ? 'info' : 'warn', 'network', level === 'ok' ? 'การเชื่อมต่อกลับมาปกติ' : detail); netLevel = level; }
    emit('net', { level, detail, rtt, feedDelay: med, lastTickAgo: since, reconnects, connected: state.connected, cpu: null });
  }

  // ---------------- outgoing notifications ----------------
  async function post(url, body) { const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); if (!r.ok) throw new Error('HTTP ' + r.status); }
  async function notify(event, payload, text) {
    const jobs = [], key = event === 'signal' ? 'onSignal' : 'onAlert';
    if (settings.webhook.url && settings.webhook[key] !== false) jobs.push(post(settings.webhook.url, { event, ...payload, text, content: text }).then(() => log('info', 'webhook', 'ส่งแล้ว'), (e) => log('error', 'webhook', e.message)));
    if (settings.telegram.botToken && settings.telegram.chatId && settings.telegram[key] !== false)
      jobs.push(post(`https://api.telegram.org/bot${settings.telegram.botToken}/sendMessage`, { chat_id: settings.telegram.chatId, text }).then(() => log('info', 'telegram', 'ส่งแล้ว'), (e) => log('error', 'telegram', e.message)));
    await Promise.all(jobs); return jobs.length;
  }

  // ---------------- public API (same shape as preload.js) ----------------
  window.vcg = {
    platform: native ? 'android' : 'web',
    capabilities: { vcg: native, api: false, csv: false, files: !native },
    onQuotes: (cb) => on('quotes', cb), onStatus: (cb) => on('status', cb), onChart: (cb) => on('chart', cb),
    onLogs: (cb) => { on('logs', cb); setTimeout(() => cb(logs.slice(-300)), 0); }, onNet: (cb) => on('net', cb),
    requestChart: (o) => sendChartReq(o),
    pushChart: () => {}, pushAnalysis: () => {},
    log: (level, msg, data, source = 'ui') => log(level, source, msg, data),
    notify: async (event, payload, text) => notify(event, payload, text),
    fetchJSON: async (url) => { const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); },
    openSite: (url) => { window.open(url, '_blank', 'noopener'); return true; },   // phone/web: system browser / new tab
    fetchText: async (url) => { const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); },
    getSettings: async () => ({ api: settings.api, webhook: settings.webhook, telegram: settings.telegram, net: settings.net, openAtLogin: false, version: window.APP_VERSION || '', userData: native ? 'Android' : 'browser', logFile: '' }),
    setSettings: async (s) => {
      if (s.webhook) settings.webhook = { ...settings.webhook, ...s.webhook };
      if (s.telegram) settings.telegram = { ...settings.telegram, ...s.telegram };
      if (s.net) settings.net = { ...settings.net, ...s.net };
      save(); log('info', 'settings', 'บันทึกการตั้งค่า'); return true;
    },
    signOut: async () => { if (V) { await V.clearData(); state.connected = false; V.navigate({ url: VCGI.WEBTRADER_URL }); log('warn', 'auth', 'ออกจากระบบแล้ว'); } return true; },
    openLogFile: () => {}, openLogFolder: () => {}, openCsv: () => {}, toggleCsv: () => log('info', 'csv', 'การบันทึก CSV ใช้ได้เฉพาะแอป Mac'),
    addSymbol: (s) => { s = String(s || '').trim().toUpperCase(); state.invalid.delete(s); subTries.delete(s); if (s && !settings.symbols.includes(s)) { settings.symbols.push(s); save(); tick(); } sendStatus(); },
    removeSymbol: (s) => { settings.symbols = settings.symbols.filter((x) => x !== s); delete state.quotes[s]; if (settings.traySymbol === s) settings.traySymbol = settings.symbols[0] || ''; save(); sendStatus(); },
    setTray: (s) => { settings.traySymbol = s; save(); sendStatus(); },
    showTrader: () => {
      if (V) { shownForLogin = true; showOverlay('ผู้ใช้กดเปิดหน้า Login'); return true; }
      log('error', 'app', 'เปิดหน้า VCG ไม่ได้: ส่วนเชื่อมต่อ Android ไม่ทำงาน (platform=' + (native ? 'android' : 'web') + ')');
      if (typeof toast === 'function') toast(/Android/.test(navigator.userAgent) ? 'ส่วนเชื่อมต่อ Android ไม่ทำงาน — ส่งภาพแท็บ Log ให้ผู้พัฒนา' : 'โหมดเว็บต่อ VCG ไม่ได้ — ใช้ข้อมูล Demo', 'error', 10000);
    },
    onBack: (cb) => on('back', cb),
    minimize: () => V && V.minimize(),
    reloadTrader: () => { if (V) { log('info', 'feed', 'ผู้ใช้สั่งเชื่อมต่อใหม่'); V.reload(); } },
  };

  // The Android WebView only injects Capacitor's native bridge; registerPlugin() comes from @capacitor/core
  // (www/capacitor.js). Fall back to the raw bridge calls if core is missing, so the app never silently loses VCG.
  function getPlugin(name) {
    if (typeof C.registerPlugin === 'function') return C.registerPlugin(name);
    if (C.Plugins && C.Plugins[name]) return C.Plugins[name];
    if (typeof C.nativePromise === 'function') {
      log('warn', 'app', 'ไม่มี @capacitor/core — เรียก plugin ผ่าน native bridge โดยตรง');
      return new Proxy({}, { get: (_, m) => (m === 'then' ? undefined
        : m === 'addListener' ? (ev, cb) => Promise.resolve(C.nativeCallback(name, 'addListener', { eventName: ev }, cb))
          : (opts) => C.nativePromise(name, String(m), opts || {})) });
    }
    throw new Error('Capacitor bridge has no registerPlugin/nativePromise (keys: ' + Object.keys(C).join(',') + ')');
  }
  if (native) try {
    V = getPlugin('VcgWeb');
    V.addListener('message', (e) => { try { handlePageMsg(JSON.parse(e.data)); } catch (_) {} });
    V.addListener('page', (e) => log('info', 'webtrader', 'เปิดหน้า ' + e.url));
    V.addListener('pageError', (e) => log('error', 'webtrader', `โหลดหน้าไม่สำเร็จ ${e.code} ${e.description}`));
    V.addListener('hidden', () => { shownForLogin = false; hiddenAt = Date.now(); state.overlay = false; sendStatus(); });
    V.addListener('back', () => emit('back'));
    V.addListener('googleBlocked', () => log('warn', 'auth', 'Google บล็อกการ login ในแอป — ให้ใช้อีเมล + รหัสผ่านของ VCG แทน'));
    V.start({ url: VCGI.WEBTRADER_URL }).then(() => {
      // first run (never connected yet): show the VCG login page straight away instead of waiting for the checks
      if (!ls.get('bridge.everConnected', false)) { shownForLogin = true; showOverlay('เปิดครั้งแรก — แสดงหน้า login'); }
    }, (e) => log('error', 'app', 'เริ่มหน้า VCG ไม่ได้: ' + (e && e.message)));
    log('info', 'app', `เริ่มโปรแกรม (Android) · Capacitor ${C.getPlatform ? C.getPlatform() : ''} · plugins: ${Object.keys(C.Plugins || {}).join(', ')}`);
    setInterval(tick, 3000); setInterval(probe, 10000); setInterval(evalNet, 2000); probe();
  } catch (e) { V = null; log('error', 'app', 'เริ่มส่วนเชื่อมต่อ Android ไม่สำเร็จ: ' + (e && e.message)); }
  else {
    log(/Android/.test(navigator.userAgent) && /wv\)/.test(navigator.userAgent) ? 'error' : 'info', 'app',
      `เปิดแบบเว็บ (Capacitor=${!!C}, native=${native}) — ไม่มีการเชื่อมต่อ VCG ใช้ข้อมูล Demo ได้`);
  }
  setTimeout(sendStatus, 100);
})();
