// Runs the in-page scripts injected into the hidden VCG WebTrader page against a fake page.
const test = require('node:test'), assert = require('node:assert'), vm = require('node:vm');
const V = require('../../gen/vcg-inject.js').default;

const channels = [];
test.after(() => { for (const m of channels) { m.port1.close(); m.port2.close(); } });
function fakePage(extra = {}) {
  const posted = [], store = {};
    // ports/timers are unref'd so a finished test never keeps the process alive
  const MC = class { constructor() { const m = new MessageChannel(); channels.push(m); return m; } };
  const st = (f, ms, ...a) => { const t = setTimeout(f, ms, ...a); t.unref && t.unref(); return t; };
  const si = (f, ms, ...a) => { const t = setInterval(f, ms, ...a); t.unref && t.unref(); return t; };
  const ctx = { posted, store, setTimeout: st, setInterval: si, clearInterval, clearTimeout, MessageChannel: MC, Promise, Symbol, JSON, console,
    localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = String(v)) }, ...extra };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.postMessage = (m) => posted.push(m);
  return vm.createContext(ctx);
}

test('FEED_JS coalesces a burst of quotes into one message, latest value wins, without timers', async () => {
  let handler;
  const ctx = fakePage({ _wsSharedManager: { socket: () => ({ onAny: (f) => (handler = f) }) }, setTimeout: () => { throw new Error('timers must not be used'); } });
  assert.equal(vm.runInContext(V.FEED_JS, ctx), 'ok');
  handler('symbol:data', { quote: { symbol: 'XAUUSD', bid: 1 } });
  handler('symbol:data', { quote: { symbol: 'XAUUSD', bid: 2 } });
  handler('symbol:data', { quote: { symbol: 'EURUSD', bid: 3 } });
  await new Promise((r) => setImmediate(r)); await new Promise((r) => setTimeout(r, 30));
  const q = ctx.posted.filter((m) => m.__vcg === 'quotes');
  assert.equal(q.length, 1);
  assert.deepEqual(q[0].d.map((x) => x.bid), [2, 3]);
});

test('CHART_JS finds a moved token getter, ignores decoys and remembers it', async () => {
  const jwt = 'aaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbbbbbb.cccccccccccccccc';
  const cache = {
    11: { exports: { a: () => 1, decoy: function () { return 'accessToken but not a getter'; } } },
    55555: { exports: { Xy: async function () { /* refresh accessToken before it expires */ return { accessToken: jwt, country: 'TH' }; } } },
  };
  const req = (id) => cache[id] && cache[id].exports; req.c = cache;
  class M { socket() { return { auth: { token: 'feed', account: 'A1' }, on() {}, onAny() {}, connect() {}, emit() {}, disconnect() {} }; } }
  const ctx = fakePage({ webpackChunk_N_E: { push: ([, , cb]) => cb(req) } });
  ctx._wsSharedManager = Object.assign(new M(), { constructor: M });
  vm.runInContext(V.CHART_JS, ctx);
  const a = await vm.runInContext('window.__vcgChart.auth()', ctx);
  assert.equal(a.token, jwt); assert.equal(a.account, 'A1');
  assert.deepEqual(JSON.parse(ctx.store.__vcgTokenGetter), { id: 55555, key: 'Xy' });
});

test('CHART_JS falls back to the feed token when no getter exists', async () => {
  class M { socket() { return { auth: { token: 'feed', account: 'A1' }, on() {}, onAny() {}, connect() {}, emit() {}, disconnect() {} }; } }
  const req = () => undefined; req.c = {};
  const ctx = fakePage({ webpackChunk_N_E: { push: ([, , cb]) => cb(req) } });
  ctx._wsSharedManager = Object.assign(new M(), { constructor: M });
  vm.runInContext(V.CHART_JS, ctx);
  const a = await vm.runInContext('window.__vcgChart.auth()', ctx);
  assert.equal(a.token, 'feed');
  assert.ok(ctx.posted.some((m) => /ไม่เจอ/.test(m.d)), 'should log a clear warning');
});

test('parseQuote reads scaled prices', () => {
  if (!V.parseQuote) return;
  const q = V.parseQuote({ symbol: 'XAUUSD', bid: { scale: 2, value: 347212 }, ask: { scale: 2, value: 347232 } });
  if (q) assert.ok(Math.abs(q.bid - 3472.12) < 1e-9);
});
