const test = require('node:test'), assert = require('node:assert'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const U = require('../../gen/main/ea-update.js'), mt5 = require('../../gen/main/mt5.js');
const SRC = fs.readFileSync(path.join(__dirname, '../../mt5/PriceTrackerBridge.mq5'), 'utf8');

test('bundled build parsed from #property version and matches the hello build', () => {
  const b = U.bundledBuild(SRC);
  assert.equal(b, 103);
  assert.match(SRC, new RegExp('\\\\"build\\\\":' + b + ','), 'hello must report the same build');
  assert.equal(U.bundledBuild('#property version   "2.15"'), 215);
  assert.equal(U.helloBuild({ v: 1 }), 101); assert.equal(U.helloBuild({ v: 2 }), 102); assert.equal(U.helloBuild({ v: 3, build: 103 }), 103);
});

test('when to update', () => {
  const info = { v: 2, server: 'B' };
  assert.equal(U.shouldUpdate({ info, bundled: 103, account: 'a' }).ok, true);
  assert.equal(U.shouldUpdate({ info: { v: 3, build: 103 }, bundled: 103, account: 'a' }).why, 'current');
  assert.equal(U.shouldUpdate({ info, bundled: 103, account: 'a', attempted: { a: 103 } }).why, 'already-tried');
  assert.equal(U.shouldUpdate({ info, bundled: 104, account: 'a', attempted: { a: 103 } }).ok, true);   // newer app → try again
  assert.equal(U.shouldUpdate({ info, bundled: 103, account: 'a', enabled: false }).why, 'disabled');
  assert.equal(U.shouldUpdate({ info, bundled: 103, account: 'a', running: true }).why, 'running');
});

// fake spawn: "compiles" by writing the .log (UTF-16 like MetaEditor) and a fresh .ex5
const fakeSpawn = (dir, { errors = 0, fail } = {}) => (cmd, args, opts) => {
  const ee = new (require('node:events'))(); ee.kill = () => {}; ee.calls = { cmd, args, opts };
  setTimeout(() => {
    if (fail) return ee.emit('error', new Error(fail));
    fs.writeFileSync(path.join(dir, 'PriceTrackerBridge.log'), Buffer.from('\uFEFFResult: ' + errors + ' errors, 2 warnings, 830 msec elapsed', 'utf16le'));
    if (!errors) fs.writeFileSync(path.join(dir, 'PriceTrackerBridge.ex5'), 'ex5');
    ee.emit('exit', errors ? 1 : 0);
  }, 10);
  fakeSpawn.last = ee.calls; return ee;
};
const mkdir = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ea-')); return d; };

test('install: copy + compile ok; compile errors and missing MetaEditor go to manual', async () => {
  const d = mkdir(), plan = { compile: { cmd: '/w/wine', args: ['C:\\MT5\\metaeditor64.exe', '/compile:x', '/log'] }, env: { WINEPREFIX: '/p', WINEDEBUG: '-all' } };
  const r = await U.install({ dirs: [d], source: SRC, plan, deps: { spawn: fakeSpawn(d) } });
  assert.equal(r.ok, true, JSON.stringify(r.steps));
  assert.equal(fs.readFileSync(path.join(d, 'PriceTrackerBridge.mq5'), 'utf8'), SRC);
  assert.equal(fakeSpawn.last.opts.env.WINEDEBUG, '-all'); assert.equal(fakeSpawn.last.opts.env.WINEPREFIX, '/p');
  const d2 = mkdir(); const bad = await U.install({ dirs: [d2], source: SRC, plan, deps: { spawn: fakeSpawn(d2, { errors: 2 }) } });
  assert.equal(bad.ok, false); assert.equal(bad.manual, true); assert.match(bad.steps.at(-1).t, /2 errors/);
  const d3 = mkdir(); const nf = await U.install({ dirs: [d3], source: SRC, plan: { missing: 'wine' }, deps: { spawn: fakeSpawn(d3) } });
  assert.equal(nf.ok, false); assert.equal(nf.manual, true); assert.ok(fs.existsSync(path.join(d3, 'PriceTrackerBridge.mq5')), 'source still copied');
  const d4 = mkdir(); const er = await U.install({ dirs: [d4], source: SRC, plan, deps: { spawn: fakeSpawn(d4, { fail: 'ENOENT' }) } });
  assert.equal(er.ok, false); assert.match(er.steps.at(-1).t, /ENOENT/);
});

test("MetaQuotes' Mac app: wine (no wine64) in SharedSupport/wine/bin is used, wine.inf decoy ignored, compile in the same prefix", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mq-'));
  const app = path.join(root, 'MetaTrader 5.app'), bin = path.join(app, 'Contents/SharedSupport/wine/bin');
  fs.mkdirSync(bin, { recursive: true }); fs.writeFileSync(path.join(bin, 'wine'), ''); fs.writeFileSync(path.join(bin, 'wineserver'), '');
  fs.mkdirSync(path.join(app, 'Contents/SharedSupport/wine/share/wine'), { recursive: true }); fs.writeFileSync(path.join(app, 'Contents/SharedSupport/wine/share/wine/wine.inf'), '');
  const prefix = path.join(root, 'Library/Application Support/net.metaquotes.wine.metatrader5');
  const inst = path.join(prefix, 'drive_c/Program Files/MetaTrader 5'), exp = path.join(inst, 'MQL5/Experts');
  fs.mkdirSync(exp, { recursive: true }); fs.writeFileSync(path.join(inst, 'terminal64.exe'), ''); fs.writeFileSync(path.join(inst, 'metaeditor64.exe'), '');
  assert.equal(mt5.findWine({ appBundles: [app], extra: [] }), path.join(bin, 'wine'));
  const p = mt5.planLaunch({ expertsDir: exp, platform: 'darwin', appBundles: [app], wineCandidates: [] });
  assert.equal(p.compile.cmd, path.join(bin, 'wine'));
  assert.equal(p.env.WINEPREFIX, prefix); assert.equal(p.env.WINEDEBUG, '-all');
  assert.match(p.compile.args[0], /^C:\\Program Files\\MetaTrader 5\\metaeditor64\.exe$/i);
  assert.equal(p.compile.args[1], '/compile:C:\\Program Files\\MetaTrader 5\\MQL5\\Experts\\PriceTrackerBridge.mq5');
  assert.equal(p.editor.args.length, 2);
});
