// Phone screenshots of every main screen (www build + Capacitor mock). Run: xvfb-run -a npx electron --no-sandbox tests/ui/mobile-shots.js
const { app, BrowserWindow } = require('electron');
const path = require('path'), fs = require('fs'), os = require('os');
const ROOT = path.join(__dirname, '..', '..'), OUT = path.join(__dirname, 'out', 'mobile'); fs.mkdirSync(OUT, { recursive: true });
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'pt-m-')));
app.on('window-all-closed', () => {});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  const w = new BrowserWindow({ width: 390, height: 844, webPreferences: { partition: 'm' + Date.now(), preload: path.join(__dirname, 'capacitor-mock.js'), contextIsolation: false } });
  const errs = []; w.webContents.on('console-message', (e) => { if (e.level === 'error') errs.push(e.message); });
  await w.loadFile(path.join(ROOT, 'www', 'index.html'));
  const js = (c) => w.webContents.executeJavaScript(c), shot = async (n) => fs.writeFileSync(path.join(OUT, n + '.png'), (await w.webContents.capturePage()).toPNG());
  await sleep(1200);
  // pretend we are logged in and receiving data
  await js(`(() => { __mock.login(); PT.setSource('demo'); PT.S.source = 'demo'; PT.renderConnect && PT.renderConnect({ connected: true });
    const now = Math.floor(Date.now() / 3600000) * 3600; let p = 3480, s = 5; const c = [];
    for (let i = 300; i >= 0; i--) { const o = p; s = (s * 16807) % 2147483647; p += Math.sin(i / 25) * 1.2 + ((s / 2147483647) - .5) * 5; const e = (v) => ({ scale: 2, value: Math.round(v * 100) });
      c.push({ timeSeconds: String(now - i * 3600), open: e(o), high: e(Math.max(o, p) + 1), low: e(Math.min(o, p) - 1), close: e(p) }); }
    PT.S.pendingHistory = true; PT.onChartMsg({ type: 'chart', slot: 'main', data: { history: { candles: c } } });
    PT.onQuotesMsg([{ symbol: 'XAUUSD', time: new Date().toISOString(), bid: p, ask: p + .25, digits: 2, change: 12.4, changePct: 0.36 }, { symbol: 'EURUSD', time: new Date().toISOString(), bid: 1.0842, ask: 1.0843, digits: 5, change: -0.001, changePct: -0.12 }]);
    PT.$('connect').classList.add('hidden'); return 1; })()`);
  await sleep(800); await shot('01-chart');
  const step = async (name, code, wait = 500) => { await js(`(() => { ${code}; return 1; })()`); await sleep(wait); await shot(name); };
  await step('02-symbol-sheet', `document.getElementById('sym-title').click()`);
  await step('03-tools-sheet', `MSHEET.close(); document.getElementById('m-draw').click()`);
  await step('04-drawing-pill', `document.querySelector('#msheet [data-t=trend]').click()`);
  await step('05-options-sheet', `setTool('cursor'); document.querySelector('[data-m=opts]').click()`);
  await step('06-indicators-sheet', `MSHEET.close(); document.querySelector('[data-m=ind]').dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
  await step('07-analysis-sheet', `MSHEET.close(); document.querySelector('[data-m=an]').dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
  await step('08-page-market', `MSHEET.close(); document.querySelector('[data-nav=market]').click()`);
  await step('09-page-analysis', `document.querySelector('[data-nav=analysis]').click()`, 900);
  await step('10-page-practice', `document.querySelector('[data-nav=practice]').click()`);
  await step('11-page-more', `document.querySelector('[data-nav=more]').click()`);
  await step('12-page-learn', `document.querySelector('[data-go=learn]').click()`);
  await step('13-page-calc', `document.querySelector('.mph-back').click(); document.querySelector('[data-go=calc]').click()`);
  await step('14-back-to-chart', `document.querySelector('[data-nav=chart]').click()`);
  const ov = await js(`document.documentElement.scrollWidth - innerWidth`);
  console.log('overflow', ov, 'errors', JSON.stringify(errs.slice(0, 5)));
  app.exit(0);
});
