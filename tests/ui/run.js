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

    // lessons tab: categories render
    const les = JSON.parse(await js(`(() => { document.querySelector('#tabs [data-tab="learn"]').click(); const el = document.getElementById('lessons');
      return JSON.stringify({ items: el.querySelectorAll('details').length, cats: el.querySelectorAll('.lesson-cats button').length, svgs: el.querySelectorAll('.lg-fig svg').length }); })()`));
    check('lessons: book with categories and figures', les.items >= 40 && les.cats >= 7 && les.svgs >= 10, les);
    const srch = JSON.parse(await js(`(() => { const i = document.querySelector('.lesson-search'); i.value = 'hammer'; i.dispatchEvent(new Event('input')); return JSON.stringify({ shown: [...document.querySelectorAll('#lessons details')].filter((d) => d.offsetParent !== null).length }); })()`));
    check('lessons: search filters', srch.shown >= 1 && srch.shown < les.items, srch);
    await js(`(() => { document.querySelector('#tabs [data-tab="learn"]').click(); const d = [...document.querySelectorAll('#lessons details')].find((x) => !x.hidden && /Hammer/.test(x.querySelector('summary').textContent)); d.open = true; d.scrollIntoView(); return 1; })()`); await sleep(300);
    await A.shot('lessons');
    await js(`(() => { const i = document.querySelector('.lesson-search'); i.value = ''; i.dispatchEvent(new Event('input')); document.querySelector('[data-lc=ds]').click(); const d = document.querySelector('#lessons details:not([hidden])'); d.open = true; return 1; })()`); await sleep(200); await A.shot('lessons-ds');

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
      await js(`document.querySelector('#tabs [data-tab="news"]').click(); HEADLINES.refresh(true); 1`); await sleep(1200);
      const nw = JSON.parse(await js(`(() => { const items = [...document.querySelectorAll('#newsfeed .nw-item')];
        const rel = items.map((a) => a.querySelector('.nw-t').textContent);
        document.querySelector('[data-nf=all]').click(); const all = document.querySelectorAll('#newsfeed .nw-item').length;
        return JSON.stringify({ rel, all, blank: items.every((a) => a.target === '_blank'), invTime: [...document.querySelectorAll('#newsfeed .nw-m')].map((m) => m.textContent).find((t) => /Investing/.test(t)) }); })()`));
      check('news: relevant headlines for XAUUSD (gold, Fed) and not GBP/JPY', nw.rel.some((t) => /Gold Price/.test(t)) && nw.rel.some((t) => /FOMC/.test(t)) && !nw.rel.some((t) => /GBP\/JPY/.test(t)), nw.rel);
      check('news: all sources merged, open in browser', nw.all === 4 && nw.blank, nw);
      await js(`document.querySelector('[data-nf=rel]').click(); 1`); await sleep(200); await A.shot('news');
      check('news: Investing.com time parsed', /30 นาที/.test(nw.invTime || ''), nw.invTime);
    }

    // layout: narrow window, wide side panel → toolbar buttons stay inside the chart column
    A.w.setSize(1100, 760); await sleep(300);
    await js(`document.documentElement.style.setProperty('--side-w', '530px'); document.querySelector('#tabs [data-tab="calc"]').click(); 'ok'`); await sleep(300);
    const lay = JSON.parse(await js(`JSON.stringify((() => { const r = (id) => document.getElementById(id).getBoundingClientRect(); return { shot: Math.round(r('shot').right), side: Math.round(r('side').left) }; })())`));
    check('layout: toolbar does not overlap side panel', lay.shot <= lay.side, lay);
    await A.shot('layout');
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
        document.querySelector('[data-go=learn]').click(); await W(80); r.learnVisible = !document.getElementById('tab-learn').classList.contains('hidden');
        document.querySelector('[data-nav=chart]').click(); await W(80); r.chartHidden = document.body.classList.contains('hide-side');
        document.getElementById('m-draw').click(); await W(80); r.toolsSheet = MSHEET.isOpen() && document.querySelectorAll('#msheet [data-t]').length >= 15;
        document.querySelector('#msheet [data-t=trend]').click(); await W(80); r.pill = !document.getElementById('m-pill').classList.contains('hidden') && S.tool === 'trend';
        r.back1 = window.__mobileBack() && S.tool === 'cursor';
        document.querySelector('[data-m=ind]').dispatchEvent(new MouseEvent('click', { bubbles: true })); await W(80); r.indSheet = MSHEET.isOpen() && !!document.querySelector('#msheet #ind-menu');
        r.back2 = window.__mobileBack() && !MSHEET.isOpen() && !!document.querySelector('.dropdown #ind-menu');
        return JSON.stringify(r); })()`));
      check('android shell: pages fill the screen', ['market', 'analysis', 'practice', 'more'].every((k) => shell[k] >= 380), shell);
      check('android shell: more → lessons, back to chart', shell.learnVisible && shell.chartHidden, shell);
      check('android shell: drawing sheet + tool pill + back', shell.toolsSheet && shell.pill && shell.back1, shell);
      check('android shell: indicator sheet borrows and returns the menu', shell.indSheet && shell.back2, shell);
      await N.js(`document.getElementById('connect').classList.remove('hidden'); renderConnect(); 1`);
      await N.js(`document.querySelector('[data-cn=demo]').click(); 1`); await sleep(800);
      check('android: demo button hides connect screen', await N.js(`S.source === 'demo' && document.getElementById('connect').classList.contains('hidden')`));
      N.w.destroy();
    } else console.log('skip mobile: run `npm run build:www` first');
  } catch (e) { check('suite crashed', false, String(e && e.message || e) + ' | renderer: ' + (globalThis.__lastErrs || []).slice(-3).join(' || ')); }

  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  console.log(`\n${results.length - failed}/${results.length} passed`);
  app.exit(failed ? 1 : 0);
});
