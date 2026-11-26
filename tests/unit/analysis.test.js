const test = require('node:test'), assert = require('node:assert');
const AN = require('../../gen/analysis.js'), B = require('../../gen/bounce.js');
const { series } = require('./helpers');

test('analyze returns structure for a long series quickly', () => {
  const c = series(5000), t = Date.now(), A = AN.analyze(c, { swingLen: 5, digits: 2 });
  assert.ok(Date.now() - t < 3000, 'analysis too slow');
  assert.ok(A.swings.length > 50 && A.pivots.length > 50);
  assert.equal(A.atr.length, c.length);
});

test('signals do not look ahead: past signals stay identical when future bars are appended', () => {
  const c = series(1500), m = 1100;
  const key = (s) => `${s.i}|${s.dir}|${s.entry.toFixed(4)}|${s.sl.toFixed(4)}`;
  const early = AN.analyze(c.slice(0, m), { swingLen: 5 }).signals.map(key);
  const later = AN.analyze(c, { swingLen: 5 }).signals.filter((s) => s.i < m - 6).map(key);   // allow pivot-confirmation window
  for (const k of later) assert.ok(early.includes(k), 'signal changed after future data: ' + k);
});

test('bounce finder: buy zones below price, sell zones above, sane plans', () => {
  const c = series(2000), A = AN.analyze(c, { swingLen: 5 }), R = B.find(c, A, {});
  assert.ok(R && R.buy.length + R.sell.length > 0, 'no zones');
  for (const z of R.buy) { assert.ok(Math.min(z.lo, z.hi) <= R.price); assert.ok(z.sl < z.entry && z.tp1 > z.entry, 'buy plan'); assert.ok(z.stars >= 1 && z.stars <= 5); }
  for (const z of R.sell) { assert.ok(Math.max(z.lo, z.hi) >= R.price); assert.ok(z.sl > z.entry && z.tp1 < z.entry, 'sell plan'); }
  for (const z of [...R.buy, ...R.sell]) assert.ok(['wait', 'in', 'confirmed'].includes(z.status));
});

test('bounce stats exist for several zone types and are proportions', () => {
  const c = series(3000), A = AN.analyze(c, { swingLen: 5 }), R = B.find(c, A, {});
  const st = R.stats.buy; assert.ok(Object.keys(st).length >= 3);
  for (const v of Object.values(st)) { assert.ok(v.n > 0); assert.ok(v.wr1 >= 0 && v.wr1 <= 1 && v.wr2 <= v.wr1 + 1e-9); }
});

test('liquidity pools sit on the right side of price', () => {
  const c = series(2000), A = AN.analyze(c, { swingLen: 5 }), R = B.find(c, A, {});
  for (const p of R.liq.lows) assert.ok(p.price < R.price);
  for (const p of R.liq.highs) assert.ok(p.price > R.price);
});

test('bounce finder handles short input', () => {
  const c = series(40), A = AN.analyze(c, { swingLen: 5 });
  assert.equal(B.find(c, A, {}), null);
});
