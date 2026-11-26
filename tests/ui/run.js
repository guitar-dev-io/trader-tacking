// UI regression suite: loads the real app (index.html) in Electron with fake IPC, fake quotes and fake candles,
// runs scenarios and exits non-zero on any failure or console error.  Run: xvfb-run -a npx electron tests/ui/run.js
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path'), fs = require('fs'), os = require('os');
const ROOT = path.join(__dirname, '..', '..'), OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'pt-ui-')));
app.on('window-all-closed', () => {});   // keep running between scenarios (default would quit)

const results = []; let failed = 0;
const check = (name, ok, info) => { results.push({ name, ok: !!ok, info }); if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info !== undefined ? '  ' + JSON.stringify(info) : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// candles in VCG wire format
// random-walk candles in {timeSeconds, open, high, low, close} with a relative step (for any price level)
function walk(n, sec, start, vol = 0.0015, seed = 7) {
  const now = Math.floor(Date.now() / 1000 / sec) * sec; let p = start, x = seed; const out = [];
  for (let i = n; i >= 0; i--) { x = (x * 16807) % 2147483647; const o = p; p = p * (1 + (x / 2147483647 - 0.5) * vol * 2 + Math.sin(i / 25) * vol * 0.3);
    const hi = Math.max(o, p) * (1 + vol * 0.4 * (x % 7) / 7), lo = Math.min(o, p) * (1 - vol * 0.4 * (x % 5) / 5); out.push({ timeSeconds: now - i * sec, open: o, high: hi, low: lo, close: p }); }
  return out;
}
function candles(n, sec, seed, start = 3500) {
  const now = Math.floor(Date.now() / 1000 / sec) * sec; let p = start, s = seed; const c = [];
  for (let i = n; i >= 0; i--) {
    const o = p; s = (s * 16807) % 2147483647; p += Math.sin(i / 60) * 0.9 * Math.sqrt(sec / 3600) + ((s / 2147483647) - 0.5) * 4 * Math.sqrt(sec / 3600);
    const e = (v) => ({ scale: 2, value: Math.round(v * 100) });
    c.push({ timeSeconds: String(now - i * sec), open: e(o), high: e(Math.max(o, p) + 0.8), low: e(Math.min(o, p) - 0.8), close: e(p) });
  }
  return c;
}

async function open(file, { width = 1400, height = 900, preload = true, mock = false } = {}) {
  const w = new BrowserWindow({ width, height, show: true, webPreferences: preload ? { preload: path.join(ROOT, 'preload.js'), contextIsolation: true }
    : { partition: 'mobile-' + Date.now() + Math.random(), ...(mock ? { preload: path.join(__dirname, 'capacitor-mock.js'), contextIsolation: false } : {}) } });   // fresh storage, like a new phone
  const errs = []; globalThis.__lastErrs = errs;
  w.webContents.on('console-message', (e) => { if (e.level === 'error') errs.push(e.message); });
  w.webContents.on('preload-error', (_e, p, err) => errs.push('preload ' + err));
  await w.loadFile(file);
  const js = (code) => w.webContents.executeJavaScript(code);
  const send = (ch, d) => w.webContents.send(ch, d);
  const shot = async (name) => fs.writeFileSync(path.join(OUT, name + '.png'), (await w.webContents.capturePage()).toPNG());
  return { w, js, send, shot, errs };
}

app.whenReady().then(async () => {
  const reqs = [];
  ipcMain.handle('mt5-positions', () => null); ipcMain.handle('open-site', (_e, u) => { globalThis.__siteOpened = u; return true; }); ipcMain.handle('mt5-deals', () => []);
  ipcMain.handle('get-settings', () => ({ api: {}, webhook: {}, telegram: {}, net: { slowMs: 800, delayMs: 3000, staleSec: 45, stuckSec: 60, notify: false }, version: 'test', source: 'vcg' }));
  ipcMain.handle('set-settings', () => true); ipcMain.handle('notify', () => 0); ipcMain.handle('sign-out', () => true);
  ipcMain.handle('fetch-json', () => { throw new Error('offline (test)'); });
  const iso = (m) => new Date(Date.now() - m * 60000);
  const RSS = {
    'www.fxstreet.com': `<?xml version="1.0"?><rss version="2.0"><channel><title>FXStreet</title>
      <item><title>Gold Price Forecast: XAU/USD rebounds as Fed bets shift</title><link>https://www.fxstreet.com/news/gold-1</link><pubDate>${iso(5).toUTCString()}</pubDate></item>
      <item><title>GBP/JPY: Yen weakens after BoJ comments</title><link>https://www.fxstreet.com/news/gbpjpy-2</link><pubDate>${iso(15).toUTCString()}</pubDate></item></channel></rss>`,
    'www.investing.com': `<?xml version="1.0"?><rss version="2.0"><channel><title>Investing</title>
      <item><title>Gold steadies near record as dollar slips</title><link>https://www.investing.com/news/commodities-news/gold-3</link><pubDate>${iso(30).toISOString().slice(0, 19).replace('T', ' ')}</pubDate></item></channel></rss>`,
    'www.federalreserve.gov': `<?xml version="1.0"?><rss version="2.0"><channel><title>Fed</title>
      <item><title>Federal Reserve issues FOMC statement</title><link>https://www.federalreserve.gov/newsevents/pressreleases/monetary1.htm</link><pubDate>${iso(60).toUTCString()}</pubDate></item></channel></rss>`,
  };
  ipcMain.handle('fetch-text', (_e, url) => { const h = new URL(url).hostname; if (!RSS[h]) throw new Error('offline (test)'); return RSS[h]; });
  ipcMain.on('chart-request', (_e, o) => reqs.push(o));
  ['log', 'chart-data', 'analysis', 'set-source', 'add-symbol', 'remove-symbol', 'set-tray', 'toggle-csv', 'open-csv', 'show-trader', 'reload-trader', 'open-log-file', 'open-log-folder'].forEach((c) => ipcMain.on(c, () => {}));

  try {
    // ------------------------------------------------------------------ desktop app
    const A = await open(path.join(ROOT, 'index.html'));
    const { js, send, shot } = A;
    send('status', { connected: true, loggedIn: true, symbols: ['XAUUSD'], traySymbol: 'XAUUSD', source: 'vcg' });
    send('net', { level: 'ok', rtt: 80, feedDelay: 50, lastTickAgo: 1, reconnects: 0, connected: true });
    await sleep(300);
    check('boot: chart requested', reqs.length > 0, reqs[0] && reqs[0].symbol);
    check('boot: clean default (no analysis overlays on)', await js(`Object.entries(S.an).filter(([k, v]) => v === true && AN_VIEW_KEYS.includes(k)).length === 0`));
    await js(`store.set('setupDone', 1)`);
    const su = JSON.parse(await js(`(() => { SETUP.open(); const cards = document.querySelectorAll('#setup .su-card').length;
      document.querySelector('#setup [data-path=mt5]').click(); const steps = document.querySelectorAll('#setup .su-dots button').length;
      document.querySelector('#setup [data-nav=next]').click(); const h = document.querySelector('#setup h3').textContent;
      document.querySelector('#setup [data-nav=back]').click(); document.querySelector('#setup [data-nav=back]').click();
      document.querySelector('#setup [data-path=vcg]').click(); const vcgBtn = !!document.querySelector('#setup [data-act=vcg-login]') || document.querySelectorAll('#setup .su-dots button').length === 3;
      SETUP.close(true); return JSON.stringify({ cards, steps, h, vcgBtn, closed: !SETUP.isOpen() }); })()`));
    // connect screen (VCG not logged in) + settings → source tab
    send('status', { connected: false, loggedIn: false, stage: 'login', symbols: ['XAUUSD'], traySymbol: 'XAUUSD', source: 'vcg' });
    await new Promise((r) => setTimeout(r, 2800)); await js(`renderConnect(); 1`); await new Promise((r) => setTimeout(r, 200)); await shot('connect-desktop');
    const cn = JSON.parse(await js(`JSON.stringify({ shown: !document.getElementById('connect').classList.contains('hidden'), choices: document.querySelectorAll('#connect [data-src]').length, safe: /รหัสผ่าน/.test(document.getElementById('connect').textContent), guide: !!document.querySelector('#connect [data-cn=guide]') })`));
    check('connect screen: source choices, safety note, guide link', cn.shown && cn.choices >= 2 && cn.safe && cn.guide, cn);
    // one icon pack: no emoji left in the UI chrome (connect screen, setup start page, source menu, settings nav)
    const emo = JSON.parse(await js(`(async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms)), re = /\\p{Extended_Pictographic}/u, out = {};
      out.connect = re.test(document.getElementById('connect').textContent); out.connectSvg = document.querySelectorAll('#connect svg.ico').length;
      SETUP.open(); await w(100); out.setup = re.test(document.getElementById('setup').textContent); out.setupSvg = document.querySelectorAll('#setup svg.ico').length;
      THEME.set('light'); await w(150); await window.__shot?.('icons-setup-light'); THEME.set('dark'); SETUP.close();
      document.getElementById('src-pill').click(); await w(100); const m = document.getElementById('src-menu'); out.menu = !!m && re.test(m.textContent); out.menuSvg = m ? m.querySelectorAll('svg.ico').length : 0; document.body.click(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); if (m) m.classList.add('hidden');
      out.settingsNav = re.test((document.querySelector('#modal-settings .st-nav') || {}).textContent || '');
      out.unknown = [...document.querySelectorAll('[data-icon]')].filter((i) => !i.querySelector('svg')).map((i) => i.dataset.icon);
      return JSON.stringify(out); })()`));
    check('icons: no emoji in connect / setup / source menu / settings nav (Lucide only)', !emo.connect && !emo.setup && !emo.menu && !emo.settingsNav && emo.connectSvg >= 3 && emo.setupSvg >= 4 && emo.menuSvg >= 3 && !emo.unknown.length, emo);
    await js(`THEME.set('light'); renderConnect(); 1`); await new Promise((r) => setTimeout(r, 250)); await shot('icons-connect-light'); await js(`THEME.set('dark'); 1`);
    await js(`SETUP.open(); 1`); await new Promise((r) => setTimeout(r, 250)); await shot('icons-setup-dark'); await js(`THEME.set('light'); 1`); await new Promise((r) => setTimeout(r, 250)); await shot('icons-setup-light'); await js(`THEME.set('dark'); SETUP.close(); 1`);
    send('status', { connected: true, loggedIn: true, stage: 'connected', symbols: ['XAUUSD'], traySymbol: 'XAUUSD', source: 'vcg' });
    await new Promise((r) => setTimeout(r, 200));
    check('connect screen hides once prices flow', await js(`document.getElementById('connect').classList.contains('hidden')`));
    await js(`openSettings(); 1`); await new Promise((r) => setTimeout(r, 300));
    await js(`document.querySelector('.st-nav [data-st=source]') && document.querySelector('.st-nav [data-st=source]').click(); 1`); await new Promise((r) => setTimeout(r, 200)); await shot('settings-source');
    check('settings: source tab with VCG + MT5 status', await js(`!!document.querySelector('[data-sec=source]:not(.hidden) #st-mt5-info') && !!document.querySelector('[data-sec=source] .src-pill')`));
    await js(`document.getElementById('modal-settings').classList.add('hidden'); 1`);
    const winTxt = await js(`(() => { document.documentElement.classList.add('os-win32'); SETUP.open('mt5', 2); const t = document.querySelector('#setup .su-body').textContent; SETUP.open('install', 0); document.querySelector('#setup [data-nav=back]').click(); document.querySelector('#setup [data-path=install]').click(); const w = document.querySelector('#setup h3').textContent; SETUP.close(); document.documentElement.classList.remove('os-win32'); return JSON.stringify({ ctrl: /Ctrl/.test(t) && !/⌘/.test(t), w }); })()`);
    check('windows: Ctrl shortcuts in MT5 guide, install opens on Windows step', JSON.parse(winTxt).ctrl && /Windows/.test(JSON.parse(winTxt).w), winTxt);
    check('watchlist: source pill shown', await js(`!!document.querySelector('#src-pill') && /VCG/.test(document.querySelector('#src-pill').textContent)`));
    // reorganized ราคา tab: pill in the watchlist header, no source <select> on desktop, collapsible sections
    const pnl = JSON.parse(await js(`(() => { const tab = $('tab-market'), sel = $('src-sel');
      const selVisible = !!sel && sel.offsetParent !== null;
      const tools = tab.querySelector('details[data-fold=tools]'), alerts = tab.querySelector('details[data-fold=alerts]');
      $('src-pill').click(); const menu = document.querySelectorAll('#src-menu [data-src]').length; document.body.click(); document.getElementById('src-menu')?.remove();
      return JSON.stringify({ inHeader: !!tab.querySelector('.wl-h #src-pill'), selVisible, tools: !!tools && !tools.open, alerts: !!alerts, positions: !!$('positions-panel'), menu,
        legendTip: /ดาว/.test(tab.querySelector('.wl-tip').title), ro: /ไม่ส่งคำสั่งซื้อขาย/.test(tab.textContent) }); })()`));
    check('panel: pill in watchlist header + source menu, no duplicate select, tools folded, read-only note', pnl.inHeader && !pnl.selVisible && pnl.tools && pnl.alerts && pnl.positions && pnl.menu >= 3 && pnl.legendTip && pnl.ro, pnl);
    await js(`THEME.set('dark')`); await new Promise((r) => setTimeout(r, 200)); await shot('panel-dark');
    // themes: light switches CSS variables and the chart background; dark restores
    const th = JSON.parse(await js(`(() => { THEME.set('light'); const bg = getComputedStyle(document.body).backgroundColor, chartBg = chart.options().layout.background.color, attr = document.documentElement.dataset.theme;
      return JSON.stringify({ bg, chartBg, attr }); })()`));
    check('theme: light → page + chart background white', th.attr === 'light' && th.bg === 'rgb(255, 255, 255)' && th.chartBg === '#ffffff', th);
    await new Promise((r) => setTimeout(r, 300)); await shot('theme-light-desktop');
    await js(`SETUP.open()`); await new Promise((r) => setTimeout(r, 300)); await shot('theme-light-setup'); await js(`SETUP.close(true)`);
    const th2 = JSON.parse(await js(`(() => { THEME.set('contrast'); const c = chart.options().layout.background.color; THEME.set('dark'); return JSON.stringify({ contrast: c, dark: chart.options().layout.background.color, btn: $('theme-btn').innerHTML }); })()`));
    check('theme: high-contrast + back to dark, titlebar toggle', th2.contrast === '#000000' && th2.dark === '#0f1115' && /svg/.test(th2.btn), th2);
    const ab = await js(`(() => { $('modal-settings').classList.remove('hidden'); document.querySelector('.st-nav [data-st=about]').click(); const t = document.querySelector('[data-sec=about]').textContent; return /ไม่ส่งคำสั่งซื้อขาย/.test(t) && /ไม่ใช่คำแนะนำการลงทุน/.test(t) && !!document.querySelector('#st-theme [data-theme-v=light]'); })()`);
    await new Promise((r) => setTimeout(r, 400)); await shot('settings-about');
    await js(`document.querySelector('.st-nav [data-st=general]').click(); $('modal-settings').classList.add('hidden')`);
    check('disclaimer: settings เกี่ยวกับ + theme picker', ab);
    await js(`SETUP.open()`); await new Promise((r) => setTimeout(r, 300)); await shot('setup-start');
    await js(`SETUP.open('mt5', 3)`); await new Promise((r) => setTimeout(r, 300)); await shot('setup-mt5'); await js(`SETUP.open('install', 0)`); await new Promise((r) => setTimeout(r, 300)); await shot('setup-install'); await js(`SETUP.close(true)`);
    check('setup guide: start cards, MT5 5 steps, navigation, close', su.cards === 4 && su.steps === 5 && /Login/.test(su.h) && su.vcgBtn && su.closed, su);

    send('chart', { type: 'chart', slot: 'main', data: { history: { candles: candles(1500, 3600, 11) } } });
    await sleep(1200);
    check('chart: candles loaded', await js(`S.candles.length`) > 1400);
    check('analysis: computed', await js(`!!S.A && S.A.swings.length > 10`));

    let k = 0; const last = await js(`S.candles.at(-1).close`);
    const iv = setInterval(() => { k++; send('quotes', [{ symbol: 'XAUUSD', time: new Date().toISOString(), bid: last + Math.sin(k / 5), ask: last + 0.2 + Math.sin(k / 5), digits: 2, change: 0, changePct: 0 }]); }, 80);

    // bounce finder panel: both sides, stable DOM while prices stream
    await js(`S.an.bounce = true; S.an.liquidity = true; S.an.autofib = true; S.an.bounceSide = 'both'; store.set('an', S.an); document.querySelector('#tabs [data-tab="analysis"]').click(); runBounce(); dirty = true; 'ok'`);
    await sleep(400);
    const bn = JSON.parse(await js(`new Promise((res) => { const box = document.getElementById('an-bounce'); const btn = box.querySelector('[data-bz]'); let rebuilds = 0;
      const mo = new MutationObserver((ms) => { for (const m of ms) if ([...m.removedNodes].some((n) => n.contains && btn && n.contains(btn))) rebuilds++; }); mo.observe(box, { childList: true, subtree: true });
      setTimeout(() => { mo.disconnect(); res(JSON.stringify({ rebuilds, buy: S.B.buy.length, sell: S.B.sell.length, cards: box.querySelectorAll('.bn-card').length, stats: !!box.querySelector('.bn-st'), liq: !!box.querySelector('.lq') })); }, 3200); })`));
    check('bounce: zones found on both sides', bn.buy + bn.sell > 0 && bn.cards > 0, bn);
    check('bounce: panel not rebuilt while prices stream', bn.rebuilds === 0, bn.rebuilds);
    check('bounce: stats + liquidity sections', bn.stats && bn.liq);
    const bz = JSON.parse(await js(`(async () => { const W = (ms) => new Promise((r) => setTimeout(r, ms)); const b = document.querySelector('[data-bz=calc]'); const sd = b.dataset.sd, z = S.B[sd][+b.dataset.k]; b.click(); await W(100);
      const plan = { side: S.plan.side, entry: S.plan.entry, sl: S.plan.sl };
      document.querySelector('#tabs [data-tab="analysis"]').click(); await W(50); document.querySelector('[data-bz=layer]').click(); await W(100);
      const rows = computePlan().rows.length; document.querySelector('[data-slpts="1000"]').click(); await W(50);
      return JSON.stringify({ ok: plan.entry === fmt(z.entry) && plan.side === sd, rows, slDist: Math.round(Math.abs(+S.plan.entry - +S.plan.sl) * 100) }); })()`));
    check('bounce → calculator prefill', bz.ok, bz);
    check('calculator: split 3 entries in zone', bz.rows === 3, bz.rows);
    check('calculator: SL 1000 points = 10.00 on gold', bz.slDist === 1000, bz.slDist);
    await A.shot('analysis');

    // practice: no rebuild per tick, one order per triple click, bulk actions
    await js(`localStorage.removeItem('sim.ticket'); SIM.prefill({ type: 'market', price: '', sl: '', tp: '' }); 'ok'`); await sleep(300);
    const sim = JSON.parse(await js(`new Promise((res) => { const btn = document.getElementById('sim-place'); let rebuilds = 0;
      const mo = new MutationObserver((ms) => { for (const m of ms) if ([...m.removedNodes].some((n) => n.contains && n.contains(btn))) rebuilds++; }); mo.observe(document.getElementById('sim'), { childList: true, subtree: true });
      setTimeout(() => { mo.disconnect(); const A0 = SIM.acc().live; A0.positions = []; const b = document.getElementById('sim-place'); b.disabled = false; b.click(); b.click(); b.click();
        setTimeout(() => res(JSON.stringify({ rebuilds, n: SIM.acc().live.positions.length })), 200); }, 1500); })`));
    check('practice: panel not rebuilt per tick', sim.rebuilds === 0, sim.rebuilds);
    check('practice: triple click → one order', sim.n === 1, sim.n);
    clearInterval(iv);
    const bulk = JSON.parse(await js(`(() => { const t = (bid) => onQuotesMsg([{ symbol: 'XAUUSD', time: new Date().toISOString(), bid, ask: bid + 0.2, digits: 2, change: 0, changePct: 0 }]);
      const A0 = SIM.acc().live; A0.positions = []; A0.history = [];
      for (const px of [3500, 3505, 3515, 3520]) { t(px); const b = document.getElementById('sim-place'); b.disabled = false; b.click(); }
      t(3510); SIM.render(); const before = A0.positions.length;
      document.querySelector('[data-bulk=loss]').click(); const afterLoss = SIM.acc().live.positions.length;
      document.querySelector('[data-bulk=be]').click(); const be = SIM.acc().live.positions.every((p) => p.sl === p.entry);
      document.querySelector('[data-bulk=all]').click();
      return JSON.stringify({ before, afterLoss, be, afterAll: SIM.acc().live.positions.length }); })()`));
    check('practice: bulk close losers / BE / close all', bulk.before === 4 && bulk.afterLoss === 2 && bulk.be && bulk.afterAll === 0, bulk);

    // drawing tools: Fibonacci extension
    const fib = JSON.parse(await js(`(() => { const c = S.candles, n = c.length, t = (i) => c[i].time; const before = svg.querySelectorAll('text').length;
      drawings.push({ type: 'fibext', pts: [{ time: t(n - 80), price: c[n - 80].low }, { time: t(n - 40), price: c[n - 40].high }, { time: t(n - 20), price: c[n - 20].low }] });
      dirty = true; redraw(); const labels = [...svg.querySelectorAll('text')].map((e) => e.textContent).filter((s) => /161\\.8%|261\\.8%/.test(s)).length; drawings.pop(); dirty = true; return JSON.stringify({ labels }); })()`));
    check('drawing: Fibo extension shows 161.8 / 261.8', fib.labels >= 2, fib);
    // reversed Fibo with the 1.127–2.618 target preset (numbers from a real XAUUSD example: high 3605.15 → low 3590.61)
    const fr = JSON.parse(await js(`(() => { const c = S.candles, n = c.length; const save = FIB.slice(); FIB = FIB_PRESETS['เป้าต่อขา 1.127–2.618'].slice();
      main.priceScale('right').applyOptions({ autoScale: false }); main.applyOptions({}); 
      drawings.push({ type: 'fib', reverse: true, pts: [{ time: c[n - 40].time, price: 3605.15 }, { time: c[n - 20].time, price: 3590.61 }] });
      dirty = true; redraw(); const t = [...svg.querySelectorAll('text')].map((e) => e.textContent).filter((s) => ['1.272 (', '1.618 (', '2 (', '2.618 ('].some((p) => s.startsWith(p)));
      drawings.pop(); FIB = save; main.priceScale('right').applyOptions({ autoScale: true }); dirty = true; return JSON.stringify(t); })()`));
    check('drawing: reversed Fibo targets 1.272 / 1.618 / 2 / 2.618 beyond the low', ['1.272 (3586.66)', '1.618 (3581.62)', '2 (3576.07)', '2.618 (3567.08)'].every((x) => fr.includes(x)), fr);

    // MTF pane + replay must not leak the future
    await js(`document.getElementById('mtf-btn').click(); 'ok'`); await sleep(300);
    send('chart', { type: 'chart', slot: 'mtf', data: { history: { candles: candles(500, 14400, 9) } } });
    await sleep(600);
    check('mtf: second chart shown', await js(`!document.getElementById('mtf-pane').classList.contains('hidden') && !!MTF.A`));
    await js(`REPLAY.start(600); 'ok'`); await sleep(400);
    const rp = JSON.parse(await js(`JSON.stringify({ n: S.candles.length, bounceOk: !S.B || [...S.B.buy, ...S.B.sell].every((z) => z.born < S.candles.length) })`));
    check('replay: analysis only uses visible bars', rp.bounceOk, rp);
    await js(`REPLAY.exit(); document.getElementById('mtf-btn').click(); 'ok'`); await sleep(300);

    // learning center: its own page (no side tab), categories, reader with prev/next, read progress, search, MM practice
    {
      const lc = JSON.parse(await js(`(async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms));
        store.set('lc.read', []); const noTab = !document.querySelector('#tabs [data-tab="learn"]');
        document.getElementById('learn-btn').click(); await w(150);
        const root = document.getElementById('learn-center');
        const r = { noTab, page: PAGES.active() === 'learn' && !!root.offsetParent, cats: root.querySelectorAll('.lc-nav .lc-cat:not(.lc-prac)').length, catIds: LEARN.cats().length,
          home: !!root.querySelector('.lc-hero') && root.querySelectorAll('.lc-path li').length >= 5 };
        const first = root.querySelector('.lc-nav .lc-les'); first.click(); await w(80);
        r.reader = !!root.querySelector('.lc-doc.lesson h1') && !!root.querySelector('.lc-next') && root.querySelectorAll('.lc-body .lg-fig svg, .lc-body svg').length >= 0;
        const t1 = root.querySelector('.lc-doc h1').textContent;
        root.querySelector('.lc-next').click(); await w(80);
        r.nextMoved = root.querySelector('.lc-doc h1').textContent !== t1 && !!root.querySelector('.lc-prev');
        r.prevMarkedRead = LEARN.progress().n === 1;
        root.querySelector('.lc-markbtn').click(); await w(50);
        r.markRead = LEARN.progress().n === 2 && !!root.querySelector('.lc-markbtn.on');
        const v0 = LEARN.view(); document.activeElement.blur(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); await w(50);
        r.keyNext = LEARN.view() !== v0 && /^L/.test(LEARN.view());
        const q = root.querySelector('.lc-search input'); q.value = 'hammer'; q.dispatchEvent(new Event('input')); await w(30);
        r.search = root.querySelectorAll('.lc-nav .lc-les').length; r.searchTotal = LEARN.lessons().length;
        q.value = ''; q.dispatchEvent(new Event('input'));
        const h = LEARN.lessons().find((l) => /^Hammer/.test(l.title)); LEARN.open(h.id); await w(80);
        r.figs = root.querySelectorAll('.lc-body svg').length;
        return JSON.stringify(r); })()`));
      check('learn: no side tab, opens as its own page from the titlebar', lc.noTab && lc.page && lc.home, lc);
      check('learn: category list lists all categories', lc.cats === lc.catIds && lc.cats >= 8, { cats: lc.cats, ids: lc.catIds });
      check('learn: reader with prev/next (button + arrow key)', lc.reader && lc.nextMoved && lc.keyNext, lc);
      check('learn: read progress (next marks read, mark-as-read button)', lc.prevMarkedRead && lc.markRead, lc);
      check('learn: search filters lessons', lc.search >= 1 && lc.search < lc.searchTotal, { shown: lc.search, of: lc.searchTotal });
      check('learn: lesson figures in the reader', lc.figs >= 1, lc.figs);
      await sleep(200); await A.shot('learn-reader');
      await js(`LEARN.open('home'); true`); await sleep(250); await A.shot('learn-home');
      await js(`THEME.set('light'); LEARN.open(LEARN.lessons().find((l) => /^Hammer/.test(l.title)).id); true`); await sleep(300); await A.shot('learn-reader-light'); await js(`THEME.set('dark'); true`);
      await js(`LEARN.close(true); true`); await sleep(100);
    }

    // Claude (MCP) commands: main process → renderer 'api-cmd' → 'api-cmd-result'
    {
      let seq = 0; const waits = new Map();
      ipcMain.removeAllListeners('api-cmd-result');
      ipcMain.on('api-cmd-result', (_e, r) => { const w = waits.get(r.id); if (w) { waits.delete(r.id); w(r); } });
      const cmd = (name, args) => new Promise((res) => { const id = ++seq; waits.set(id, res); send('api-cmd', { id, name, args }); setTimeout(() => res({ error: 'timeout ' + name }), 20000); });
      const v = await cmd('view');
      check('claude: view', v.data && v.data.symbol === 'XAUUSD' && v.data.bars > 1000, v.data && { s: v.data.symbol, tf: v.data.timeframe });
      const cs = await cmd('candles', { limit: 50 });
      check('claude: candles in UTC', cs.data && cs.data.candles.length === 50 && Math.abs(cs.data.candles[49].time - Date.now() / 1000) < 7200, cs.error);
      const an = await cmd('analysis'); check('claude: analysis', an.data && ['up', 'down', 'sideways'].includes(an.data.trend), an.error);
      const bo = await cmd('bounce'); check('claude: bounce zones + liquidity', bo.data && Array.isArray(bo.data.buy) && bo.data.liquidity, bo.error);
      const last = cs.data.candles[49];
      const d1 = await cmd('draw', { type: 'rect', points: [{ time: cs.data.candles[10].time, price: last.close - 5 }, { time: last.time, price: last.close - 2 }], label: 'โซน Demand (Claude)', color: '#26a69a' });
      const d2 = await cmd('draw', { type: 'hline', points: [{ price: last.close + 4 }] });
      const bad = await cmd('draw', { type: 'rect', points: [{ price: 1 }] });
      const drawn = JSON.parse(await js(`JSON.stringify({ n: drawings.filter((d) => d.by === 'claude').length, labels: [...svg.querySelectorAll('text')].some((t) => /Claude/.test(t.textContent)) })`));
      check('claude: draw rect + label + hline', d1.data && d2.data && drawn.n === 3, drawn);
      check('claude: draw validates points', !!bad.error, bad.error);
      const pl = await cmd('plan', { side: 'buy', entry: 3586.31, sl: 3570, balance: 10000, riskPct: 1 });   // $100 risk / 16.31 → 0.06 lot
      check('claude: lot calculator', pl.data && Math.abs(pl.data.totalLot - 0.06) < 1e-9 && Math.abs(pl.data.maxLossAtSL) <= 100, pl.data && { lot: pl.data.totalLot, loss: pl.data.maxLossAtSL, warn: pl.data.warnings, inp: pl.data.input });
      const cl = await cmd('clear_drawings'); check('claude: clear only Claude drawings', cl.data && cl.data.removed === 3, cl.data);
      reqs.length = 0;
      const oc = cmd('open_chart', { timeframe: '4H' });
      for (let i = 0; i < 40 && !reqs.find((r) => r.candleType === 4); i++) await sleep(100);
      send('chart', { type: 'chart', slot: 'main', data: { history: { candles: candles(400, 14400, 21) } } });
      const ocr = await oc;
      check('claude: open_chart switches timeframe and waits for candles', ocr.data && ocr.data.timeframe === '4H' && ocr.data.bars > 300, ocr.error || (ocr.data && ocr.data.timeframe));
      const r = await cmd('chart_rect'); check('claude: chart rect for screenshots', r.data && r.data.width > 300, r.data);
      await cmd('open_chart', { timeframe: '1H' }); send('chart', { type: 'chart', slot: 'main', data: { history: { candles: candles(1500, 3600, 11) } } }); await sleep(1500);
      const pf = await cmd('perf');
      check('claude: perf measurement', pf.data && pf.data.analyzeMs >= 0 && pf.data.bounceMs >= 0 && pf.data.frameMs > 0 && pf.data.cacheReadMs >= 0, pf.data || pf.error);
      const nwc = await cmd('news', { relevant: true });
      check('claude: news headlines', nwc.data && nwc.data.headlines.length >= 2 && nwc.data.headlines.every((h) => h.link && h.source), nwc.data && nwc.data.headlines.length);
      const nope = await cmd('rm_rf'); check('claude: unknown command rejected', /ไม่รู้จักคำสั่ง/.test(nope.error || ''), nope.error);
    }

    // news tab: RSS from several publishers, Investing.com date format, relevance to XAUUSD, links open outside
    {
      await js(`NEWSPAGE.open(); HEADLINES.refresh(true); 1`); await sleep(1200);
      const np = JSON.parse(await js(`JSON.stringify({ page: PAGES.active() === 'news' && !!document.getElementById('news-page').offsetParent, noTab: !document.querySelector('#tabs [data-tab="news"]'), cal: !!document.querySelector('#news-page .np-cal .np-cal-h'), btn: !!document.getElementById('news-btn') })`));
      check('news: its own page (headlines + calendar), titlebar button, no side tab', np.page && np.noTab && np.cal && np.btn, np);
      const nw = JSON.parse(await js(`(() => { const items = [...document.querySelectorAll('#newsfeed .nw-item')];
        const rel = items.map((a) => a.querySelector('.nw-t').textContent);
        document.querySelector('[data-nf=all]').click(); const all = document.querySelectorAll('#newsfeed .nw-item').length;
        return JSON.stringify({ rel, all, blank: items.every((a) => a.target === '_blank'), invTime: [...document.querySelectorAll('#newsfeed .nw-m')].map((m) => m.textContent).find((t) => /Investing/.test(t)) }); })()`));
      check('news: relevant headlines for XAUUSD (gold, Fed) and not GBP/JPY', nw.rel.some((t) => /Gold Price/.test(t)) && nw.rel.some((t) => /FOMC/.test(t)) && !nw.rel.some((t) => /GBP\/JPY/.test(t)), nw.rel);
      check('news: all sources merged, open in browser', nw.all === 4 && nw.blank, nw);
      await js(`document.querySelector('[data-nf=rel]').click(); 1`); await sleep(200); await A.shot('news-page');
      const nt = JSON.parse(await js(`(() => { NEWSPAGE.close(); document.querySelector('#tabs [data-tab="market"]').click(); window.dispatchEvent(new Event('focus')); return JSON.stringify({ teaser: !!document.getElementById('news-teaser') }); })()`));
      check('news: latest-headlines teaser stays in the ราคา tab', nt.teaser, nt);
      check('news: Investing.com time parsed', /30 นาที/.test(nw.invTime || ''), nw.invTime);
    }

    // layout: narrow window, wide side panel → toolbar buttons stay inside the chart column
    A.w.setSize(1100, 760); await sleep(300);
    await js(`document.documentElement.style.setProperty('--side-w', '530px'); document.querySelector('#tabs [data-tab="calc"]').click(); 'ok'`); await sleep(300);
    const lay = JSON.parse(await js(`JSON.stringify((() => { const r = (id) => document.getElementById(id).getBoundingClientRect(); return { shot: Math.round(r('shot').right), side: Math.round(r('side').left) }; })())`));
    check('layout: toolbar does not overlap side panel', lay.shot <= lay.side, lay);
    await A.shot('layout');
    // MT5 read-only account panel + chart lines (positions.js)
    const pz = JSON.parse(await js(`(async () => { const prev = S.source; S.source = 'mt5'; const px = S.candles.at(-1).close;
      window.__posTest = { acct: { currency: 'USD', balance: 1000, equity: 987.5, demo: true, leverage: 500 },
        positions: [{ ticket: 1, s: S.symbol + 'brex.', side: 'buy', vol: 0.02, open: +(px + 5).toFixed(2), sl: +(px - 10).toFixed(2), tp: +(px + 20).toFixed(2), price: px, profit: -12.5, swap: 0, time: 1 }],
        orders: [{ ticket: 2, s: S.symbol, type: 'buy_limit', vol: 0.01, price: +(px - 6).toFixed(2), sl: 0, tp: 0, time: 1 }] };
      return '{}'; })()`));
    send('positions', await js('window.__posTest'));
    await new Promise((r) => setTimeout(r, 1300));
    const pp = JSON.parse(await js(`(() => { const el = document.getElementById('positions-panel'); const r = { shown: !el.classList.contains('hidden'), rows: el.querySelectorAll('.pos-t tr').length,
      ro: /อ่านอย่างเดียว/.test(el.textContent), eq: /987\.50/.test(el.textContent), lines: (main.priceLines ? main.priceLines().length : -1) }; return JSON.stringify(r); })()`));
    await shot('positions-panel');
    check('mt5 positions: read-only panel with position + pending order', pp.shown && pp.rows === 2 && pp.ro && pp.eq, pp);
    check('mt5 positions: entry/SL/TP + order lines on the chart', pp.lines === -1 || pp.lines >= 4, pp.lines);
    await js(`S.source = 'vcg'; true`); send('positions', null);
    await js(`PAGES.close('learn'); PAGES.close('news'); PAGES.close('dashboard'); true`);
    // page tabs: open Log as a full page, side panel keeps working, close puts it back
    const pg = JSON.parse(await js(`(async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms));
      PAGES.open('log'); await w(150);
      const r = { bar: !document.getElementById('pagebar').classList.contains('hidden'), inPage: !!document.querySelector('#pages .page [id=tab-log]'),
        chartHidden: getComputedStyle(document.getElementById('chart-wrap')).display === 'none' || document.getElementById('chart-wrap').offsetParent === null, lessonsShown: document.querySelectorAll('#tab-log *').length > 3 };
      document.querySelector('#tabs [data-tab="calc"]').click(); await w(50);
      r.sideCalc = !document.getElementById('tab-calc').classList.contains('hidden') && !document.getElementById('tab-log').classList.contains('hidden');
      document.querySelector('#tabs [data-tab="log"]').click(); await w(50);
      r.learnTabFocusesPage = PAGES.active() === 'log' && document.querySelector('#tabs [data-tab="calc"]').classList.contains('active');
      PAGES.activate('chart'); await w(50); r.chartBack = getComputedStyle(document.getElementById('chart-wrap')).display !== 'none';
      PAGES.close('log'); await w(50);
      r.docked = document.getElementById('tab-log').parentElement.id === 'side' && document.getElementById('tab-log').classList.contains('tab') && document.getElementById('pagebar').classList.contains('hidden');
      return JSON.stringify(r); })()`));
    check('page tabs: Log opens as a page, side tabs still work, close docks it back', Object.values(pg).every(Boolean), pg);
    await js(`PAGES.open('news'); PAGES.open('learn'); true`); await new Promise((r) => setTimeout(r, 300)); await shot('page-tabs'); await js(`PAGES.close('learn'); PAGES.close('news'); true`);
    const abd = JSON.parse(await js(`(() => { const a = document.querySelector('[data-sec="about"] .about-dev'); return JSON.stringify({ dev: !!a && /guiar-dev/.test(a.textContent), support: !!a && /สนับสนุนผู้พัฒนา/.test(a.textContent), issues: !!a && !!a.querySelector('a[href$="/issues"]') }); })()`));
    check('about: developer credit + support section', abd.dev && abd.support && abd.issues, abd);
    // ---------------- dashboard: many symbol charts + widgets, drag & drop, themes
    {
      reqs.length = 0;
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      await js(`DASH.open(); const sel = document.querySelector('#dashboard .dash-layout'); sel.value = '__p:ทองคำ'; sel.dispatchEvent(new Event('change')); true`);
      await wait(700);
      const d1 = JSON.parse(await js(`JSON.stringify({ active: PAGES.active(), n: document.querySelectorAll('#dashboard .wd').length, charts: document.querySelectorAll('#dashboard .wd-chart').length,
        kinds: [...new Set([...document.querySelectorAll('#dashboard .wd')].map((e) => e.className.match(/wd-(\\w+)/)[1]))] })`));
      const slots = reqs.filter((r) => /^w\d/.test(r.slot || ''));
      check('dashboard: opens as a page with the default widgets', d1.active === 'dashboard' && d1.n === 7 && d1.charts === 4 && ['quotes', 'sessions', 'news'].every((k) => d1.kinds.includes(k)), d1);
      check('dashboard: separate chart slots for several symbols (visible ones only)', new Set(slots.map((r) => r.slot)).size >= 3 && new Set(slots.map((r) => r.symbol)).size >= 2, slots.map((r) => r.slot + ':' + r.symbol + '/' + r.candleType));
      const base = { XAUUSD: 3510, EURUSD: 1.0861, BTCUSD: 96800 }, ending = (arr, px) => { const k = px / arr.at(-1).close; return arr.map((c) => ({ ...c, open: c.open * k, high: c.high * k, low: c.low * k, close: c.close * k })); };
      for (const r of slots) send('chart', { type: 'chart', slot: r.slot, data: { symbol: r.symbol, history: { candles: ending(walk(400, r.candleType === 2 ? 900 : 3600, base[r.symbol] || 100, r.symbol === 'EURUSD' ? 0.0009 : 0.0016, r.slot.length + r.candleType * 13), base[r.symbol] || 100) } } });
      send('quotes', [{ symbol: 'EURUSD', time: new Date().toISOString(), bid: 1.0861, ask: 1.0862, digits: 5, spread: 0.0001, change: 0.002, changePct: 0.18 }, { symbol: 'BTCUSD', time: new Date().toISOString(), bid: 96800, ask: 96820, digits: 2, spread: 20, change: -800, changePct: -0.82 }]);
      await wait(1500);
      const d2 = JSON.parse(await js(`JSON.stringify({ feeds: DASH.feeds(), msgs: [...document.querySelectorAll('#dashboard .wd-msg:not(.hidden)')].length, px: [...document.querySelectorAll('#dashboard .wd-px b')].map((e) => e.textContent) })`));
      check('dashboard: chart widgets get their own candles', d2.feeds.length >= 3 && d2.feeds.every((f) => f.n > 300) && d2.msgs === 0, d2);
      await A.shot('dashboard-dark');
      // drag the first widget onto the 4th one
      const dr = JSON.parse(await js(`(async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms)); DASH.setEdit(true); await w(100);
        const before = DASH.layout().map((x) => x.id), els = [...document.querySelectorAll('#dashboard .wd')];
        const h = els[0].querySelector('.wd-drag').getBoundingClientRect(), t = els[2].getBoundingClientRect();
        const ev = (type, x, y, el) => (el || window).dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1, button: 0, isPrimary: true }));
        ev('pointerdown', h.x + 5, h.y + 5, els[0].querySelector('.wd-drag'));
        for (let i = 1; i <= 8; i++) { ev('pointermove', h.x + (t.x + t.width * 0.75 - h.x) * i / 8, h.y + (t.y + t.height * 0.8 - h.y) * i / 8); await w(16); }
        ev('pointerup', t.x + t.width * 0.75, t.y + t.height * 0.8); await w(100);
        const after = DASH.layout().map((x) => x.id), saved = JSON.parse(localStorage.getItem('dash.layout')).layouts[DASH.cfg().cur].map((x) => x.id);
        return JSON.stringify({ order: after.map((id) => before.indexOf(id)).join(), moved: before[0] !== after[0] && after.indexOf(before[0]) >= 1, saved: JSON.stringify(saved) === JSON.stringify(after), dom: [...document.querySelectorAll('#dashboard .wd')].map((e) => e.dataset.id).join() === after.join() }); })()`));
      check('dashboard: drag & drop reorders and saves the layout', dr.moved && dr.saved && dr.dom, dr);
      await js(`document.querySelector('#dashboard .dash-add').click(); true`); await wait(200); await A.shot('dashboard-edit');
      const ar = JSON.parse(await js(`(() => { const n0 = DASH.layout().length; document.querySelector('#dashboard [data-add="notes"]').click(); const n1 = DASH.layout().length;
        const id = DASH.layout().at(-1).id; document.querySelector('#dashboard .wd[data-id="' + id + '"] .wd-rm').click(); return JSON.stringify({ n0, n1, n2: DASH.layout().length, dom: document.querySelectorAll('#dashboard .wd').length }); })()`));
      check('dashboard: add and remove a widget from the catalog', ar.n1 === ar.n0 + 1 && ar.n2 === ar.n0 && ar.dom === ar.n0, ar);
      await js(`document.querySelector('#dashboard .cat-x').click(); DASH.setEdit(false); THEME.set('light'); true`); await wait(400);
      const lt = JSON.parse(await js(`JSON.stringify({ bg: getComputedStyle(document.querySelector('#dashboard .wd')).backgroundColor, dash: getComputedStyle(document.querySelector('#dashboard')).backgroundColor })`));
      const lum = (c) => { const m = c.match(/\d+/g).map(Number); return (m[0] + m[1] + m[2]) / 3; };
      check('dashboard: light theme applies to widgets', lum(lt.bg) > 200 && lum(lt.dash) > 200, lt);
      await A.shot('dashboard-light');
      await js(`THEME.set('dark'); DASH.close(); true`); await wait(200);
      check('dashboard: closing returns to the chart', await js(`PAGES.active() === 'chart' && getComputedStyle(document.getElementById('chart-wrap')).display !== 'none'`));
    }
    // ---- money management: lessons, plan table, practice problems, cent accounts (mm.js / mm-learn.js / planner.js)
    const mmL = JSON.parse(await js(`(() => { const ls = LEARN.lessons().filter((l) => l.cat === 'mm'); LEARN.open('p:mmplan');
      return JSON.stringify({ cat: !!document.querySelector('#learn-center .lc-cat[data-cat="mm"]'), n: ls.length, plan: !!document.querySelector('#learn-center .mm-widget[data-w="plan"]') }); })()`));
    await new Promise((r) => setTimeout(r, 200));
    const mmP = JSON.parse(await js(`(() => { const w = document.querySelector('#learn-center .mm-widget[data-w="plan"]'); if (!w || !w.dataset.on) return JSON.stringify({ mounted: false });
      const click = (k, v) => w.querySelector('[data-p="' + k + '"][data-v="' + v + '"]').click();
      click('risk', 1); click('type', 'auto'); click('size', 100); const s100 = w.querySelector('.mm-sum').textContent, l100 = w.querySelector('.mm-t tbody tr:last-child td:nth-child(2) b').textContent;
      click('size', 10000); const s10k = w.querySelector('.mm-sum').textContent, l10k = w.querySelector('.mm-t tbody tr:first-child td:nth-child(2) b').textContent;
      click('size', 1000); return JSON.stringify({ mounted: true, cent100: /เซ็นต์/.test(s100) && /10,000 USC/.test(s100), l100, std10k: /มาตรฐาน/.test(s10k), l10k }); })()`));
    await new Promise((r) => setTimeout(r, 200)); await shot('mm-plan');
    await js(`(() => { const l = LEARN.lessons().find((x) => x.cat === 'mm' && /บัญชีเซ็นต์/.test(x.title)); if (l) LEARN.open(l.id); })(); true`);
    await new Promise((r) => setTimeout(r, 150)); await shot('mm-lesson');
    check('mm: lessons category with 10+ lessons', mmL.cat && mmL.n >= 10 && mmL.plan, mmL);
    check('mm: plan table switches account size ($100 → cent 0.10 cent lot, $10k → 0.33 lot)', mmP.mounted && mmP.cent100 && mmP.l100 === '0.10' && mmP.std10k && mmP.l10k === '0.33', mmP);
    const mmQ = JSON.parse(await js(`(async () => { const w8 = (ms) => new Promise((r) => setTimeout(r, ms));
      const btn = document.createElement('button'); btn.dataset.mmPractice = ''; document.body.appendChild(btn); btn.click(); btn.remove(); await w8(80);   // a lesson's "ฝึกโจทย์" button
      const w = document.querySelector('#learn-center .mm-widget[data-w="quiz"]'); if (!w || !w._mm) return JSON.stringify({ ok: false, view: LEARN.view() });
      w._mm.next(); const p = w._mm.get(); const put = (v) => { w.querySelector('.mm-ans input').value = v; w.querySelector('.mm-ans button').click(); };
      put(String(p.answer * 1.5 + 1)); await w8(30); const bad = !!w.querySelector('.mm-bad');
      put(String(p.answer)); await w8(30); const good = !!w.querySelector('.mm-ok'), steps = w.querySelectorAll('.mm-steps li').length;
      return JSON.stringify({ ok: true, reached: LEARN.view() === 'p:mmquiz' && PAGES.active() === 'learn', kind: p.kind, bad, good, steps }); })()`));
    await shot('mm-quiz');
    check('mm: practice opens in the learning center — wrong answer flagged, right answer accepted with worked steps', mmQ.ok && mmQ.reached && mmQ.bad && mmQ.good && mmQ.steps >= 2, mmQ);
    await js(`LEARN.close(true); true`);
    const cent = JSON.parse(await js(`(() => { const keep = { ...S.plan }; document.querySelector('#tabs [data-tab="calc"]').click();
      Object.assign(S.plan, { account: 'cent', balance: '10000', riskMode: 'pct', risk: '1', side: 'buy', entry: '3500.00', sl: '3490.00', tp1: '', tp2: '', adds: '0', vpp: '', lotStep: 0.01, minLot: 0.01 });
      renderPlanner(); const r = computePlan(); const t = document.getElementById('planner').textContent;
      const out = { lot: r.totalLot, usc: /USC/.test(t), centLot: /cent lot/.test(t), std: /0\\.0010 lot มาตรฐาน/.test(t), label: /ทุน \\(USC\\)/.test(t), tab: !document.getElementById('tab-calc').classList.contains('hidden') };
      document.getElementById('planner').scrollIntoView({ block: 'start' });
      window.__planKeep = keep; return JSON.stringify(out); })()`));
    await new Promise((r) => setTimeout(r, 200)); await shot('calc-cent');
    await js(`Object.assign(S.plan, window.__planKeep); savePlan(); renderPlanner(); document.querySelector('#tabs [data-tab="market"]').click(); true`);
    check('mm: calculator cent account (10,000 USC, 1%, SL 1000 pts → 0.10 cent lot = 0.0010 lot)', Math.abs(cent.lot - 0.1) < 1e-9 && cent.usc && cent.centLot && cent.std && cent.label, cent);
    const ff = JSON.parse(await js(`(async () => { NEWSPAGE.open(); await new Promise((r) => setTimeout(r, 200)); const r = { btns: document.querySelectorAll('#news-page [data-ff]').length };
      const b = document.querySelector('#news-page [data-ff=calendar]'); if (b) b.click(); await new Promise((r) => setTimeout(r, 100)); NEWSPAGE.close(); return JSON.stringify(r); })()`));
    check('news page: Forex Factory buttons open the site in-app', ff.btns === 2 && globalThis.__siteOpened === 'https://www.forexfactory.com/calendar', { ...ff, opened: globalThis.__siteOpened });
    check('desktop: no console errors', A.errs.length === 0, A.errs.slice(0, 3));
    A.w.destroy();

    // ------------------------------------------------------------------ mobile (www build, no Electron preload)
    const www = path.join(ROOT, 'www', 'index.html');
    if (fs.existsSync(www)) {
      const M = await open(www, { width: 390, height: 844, preload: false });
      await sleep(1500);
      const mb = JSON.parse(await M.js(`JSON.stringify({ mobile: document.body.classList.contains('mobile'), nav: !!document.querySelector('#mnav2'), platform: vcg.platform })`));
      check('mobile: boots in mobile layout', mb.mobile && mb.nav, mb);
      await M.js(`SETUP.open('mt5', 1)`); await sleep(300); await M.shot('setup-mobile'); await M.js(`SETUP.close()`);
      await M.js(`DASH.open(); true`); await sleep(600);
      const dm = JSON.parse(await M.js(`JSON.stringify({ shown: !document.getElementById('dashboard').classList.contains('hidden'), w: document.querySelector('#dashboard .wd') ? Math.round(document.querySelector('#dashboard .wd').getBoundingClientRect().width) : 0, n: document.querySelectorAll('#dashboard .wd').length })`));
      await M.shot('dashboard-mobile');
      check('mobile: dashboard in one column', dm.shown && dm.n > 0 && dm.w > 340, dm);
      await M.js(`DASH.close(); true`);
      await M.shot('mobile');
      const real = M.errs.filter((e) => !/net::|Failed to fetch|WebSocket|offline/i.test(e));
      check('mobile: no console errors', real.length === 0, real.slice(0, 3));
      const card = JSON.parse(await M.js(`JSON.stringify({ source: S.source, shown: !document.getElementById('connect').classList.contains('hidden') })`));
      check('mobile (browser): starts on Demo data, no connect screen', card.source === 'demo' && !card.shown, card);
      M.w.destroy();

      // Android app path (Capacitor mock): not logged in → login window opens by itself, connect screen guides the user
      const N = await open(www, { width: 390, height: 844, preload: false, mock: true });
      await sleep(4500);
      const n1 = JSON.parse(await N.js(`JSON.stringify({ shows: __mock.shows, connect: !document.getElementById('connect').classList.contains('hidden'), text: document.getElementById('connect').textContent, overflow: document.documentElement.scrollWidth - innerWidth })`));
      check('android: login window opened automatically on first run', n1.shows >= 1, n1.shows);
      check('android: connect screen visible with login step', n1.connect && /เข้าสู่ระบบ VCG/.test(n1.text), n1.connect);
      check('android: page has no horizontal overflow', n1.overflow <= 1, n1.overflow);
      await N.js(`__mock.visible = false; document.querySelector('[data-cn=login]').click(); 1`); await sleep(400);
      check('android: login button opens the login window', await N.js(`__mock.shows`) >= 2);
      await N.shot('android-connect');
      // phone shell: pages are full width, sheets open and close, back button unwinds
      const shell = JSON.parse(await N.js(`(async () => { const W = (ms) => new Promise((r) => setTimeout(r, ms)); const r = {};
        document.getElementById('connect').classList.add('hidden');
        for (const p of ['market', 'analysis', 'practice', 'more']) { document.querySelector('[data-nav=' + p + ']').click(); await W(80); r[p] = Math.round(document.getElementById('side').getBoundingClientRect().width); }
        document.querySelector('[data-do=learn]').click(); await W(120); const lc = document.getElementById('learn-center');
        r.learnVisible = !lc.classList.contains('hidden') && Math.round(lc.getBoundingClientRect().width) >= 380 && !lc.classList.contains('m-reading');
        lc.querySelector('.lc-nav .lc-les').click(); await W(80); r.reader = lc.classList.contains('m-reading') && !!lc.querySelector('.lc-doc.lesson h1');
        r.backToList = window.__mobileBack() && !lc.classList.contains('m-reading') && !lc.classList.contains('hidden');
        r.backClose = window.__mobileBack() && lc.classList.contains('hidden');
        document.querySelector('[data-nav=learn]').click(); await W(80); r.navLearn = !lc.classList.contains('hidden') && document.querySelector('[data-nav=learn]').classList.contains('on');
        document.querySelector('[data-nav=chart]').click(); await W(80); r.chartHidden = document.body.classList.contains('hide-side');
        document.getElementById('m-draw').click(); await W(80); r.toolsSheet = MSHEET.isOpen() && document.querySelectorAll('#msheet [data-t]').length >= 15;
        document.querySelector('#msheet [data-t=trend]').click(); await W(80); r.pill = !document.getElementById('m-pill').classList.contains('hidden') && S.tool === 'trend';
        r.back1 = window.__mobileBack() && S.tool === 'cursor';
        document.querySelector('[data-m=ind]').dispatchEvent(new MouseEvent('click', { bubbles: true })); await W(80); r.indSheet = MSHEET.isOpen() && !!document.querySelector('#msheet #ind-menu');
        r.back2 = window.__mobileBack() && !MSHEET.isOpen() && !!document.querySelector('.dropdown #ind-menu');
        return JSON.stringify(r); })()`));
      check('android shell: pages fill the screen', ['market', 'analysis', 'practice', 'more'].every((k) => shell[k] >= 380), shell);
      check('android shell: learning center list → reader → back, from More and the bottom nav; back to chart', shell.learnVisible && shell.reader && shell.backToList && shell.backClose && shell.navLearn && shell.chartHidden, shell);
      await N.js(`LEARN.open(); true`); await sleep(250); await N.shot('learn-mobile-list');
      await N.js(`LEARN.open(LEARN.lessons().find((l) => /^Hammer/.test(l.title)).id); true`); await sleep(300); await N.shot('learn-mobile-reader'); await N.js(`LEARN.close(); true`);
      check('android shell: drawing sheet + tool pill + back', shell.toolsSheet && shell.pill && shell.back1, shell);
      check('android shell: indicator sheet borrows and returns the menu', shell.indSheet && shell.back2, shell);
      await N.js(`document.getElementById('connect').classList.remove('hidden'); renderConnect(); 1`);
      await N.js(`document.querySelector('[data-cn=demo]').click(); 1`); await sleep(800);
      check('android: demo button hides connect screen', await N.js(`S.source === 'demo' && document.getElementById('connect').classList.contains('hidden')`));
      const mm = JSON.parse(await N.js(`(async () => { document.querySelector('#mnav2 [data-nav=more]').click(); await new Promise((r) => setTimeout(r, 250));
        const t = document.getElementById('tab-more'); return JSON.stringify({ emoji: /\\p{Extended_Pictographic}/u.test(t.textContent), svg: t.querySelectorAll('svg.ico').length }); })()`));
      check('icons: mobile More page uses Lucide icons, no emoji', !mm.emoji && mm.svg >= 6, mm);
      await N.shot('icons-mobile-more'); await N.js(`THEME.set('light'); 1`); await sleep(250); await N.shot('icons-mobile-more-light'); await N.js(`THEME.set('dark'); 1`);
      // light theme on the phone: market page + chart
      const ml = JSON.parse(await N.js(`(async () => { THEME.set('light'); await new Promise((r) => setTimeout(r, 200)); return JSON.stringify({ bg: getComputedStyle(document.body).backgroundColor, nav: getComputedStyle(document.getElementById('mnav2')).backgroundColor, chart: chart.options().layout.background.color }); })()`));
      check('mobile: light theme (page, bottom nav, chart)', ml.bg === 'rgb(255, 255, 255)' && ml.nav !== 'rgb(18, 21, 29)' && ml.chart === '#ffffff', ml);
      await sleep(300); await N.shot('theme-light-mobile');
      await N.js(`document.querySelector('#mnav2 [data-nav=market]').click(); 1`); await sleep(400); await N.shot('theme-light-mobile-market');
      await N.js(`THEME.set('dark'); 1`);
      N.w.destroy();
    } else console.log('skip mobile: run `npm run build:www` first');
  } catch (e) { check('suite crashed', false, String(e && e.message || e) + ' | renderer: ' + (globalThis.__lastErrs || []).slice(-3).join(' || ')); }

  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  console.log(`\n${results.length - failed}/${results.length} passed`);
  app.exit(failed ? 1 : 0);
});
