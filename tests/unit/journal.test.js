const test = require('node:test'), assert = require('node:assert');
const J = require('../../journal.js');
const D = (ticket, pos, side, entry, vol, price, profit, time, extra = {}) => ({ ticket, pos, s: 'XAUUSD', side, entry, vol, price, profit, commission: 0, swap: 0, time, ...extra });

test('3 trades +10 −5 +20 → net 25, PF 6, win rate 2/3', () => {
  const deals = [D(1, 1, 'buy', 'in', 0.01, 3000, 0, 100), D(2, 1, 'sell', 'out', 0.01, 3010, 10, 200),
    D(3, 2, 'sell', 'in', 0.02, 3010, 0, 300), D(4, 2, 'buy', 'out', 0.02, 3012.5, -5, 400),
    D(5, 3, 'buy', 'in', 0.01, 3000, 0, 500), D(6, 3, 'sell', 'out', 0.01, 3020, 20, 600)];
  const ts = J.trades(deals), s = J.stats(ts);
  assert.equal(ts.length, 3);
  assert.equal(s.net, 25); assert.equal(s.gross, 30); assert.equal(s.grossLoss, 5);
  assert.equal(s.profitFactor, 6);
  assert.equal(Math.round(s.winRate * 1000) / 10, 66.7);
  assert.equal(s.lots, 0.04); assert.equal(s.expectancy, 8.33);
  assert.equal(s.largestWin, 20); assert.equal(s.largestLoss, -5);
  assert.equal(s.maxDrawdown, 5);                         // peak +10 → +5
  assert.equal(ts[1].side, 'sell'); assert.equal(ts[1].duration, 100);
});

test('partial closes are one trade (by position id); open positions are not closed trades', () => {
  const deals = [D(1, 7, 'buy', 'in', 0.04, 3000, 0, 100, { commission: -0.28 }),
    D(2, 7, 'sell', 'out', 0.02, 3010, 20, 200), D(3, 7, 'sell', 'out', 0.02, 3020, 40, 300, { swap: -1 }),
    D(4, 8, 'buy', 'in', 0.01, 3000, 0, 400), D(5, 8, 'sell', 'out', 0.005, 3005, 2.5, 450)];   // still half open
  const ts = J.trades(deals), closed = ts.filter((t) => t.closed);
  assert.equal(closed.length, 1);
  const t = closed[0];
  assert.equal(t.vol, 0.04); assert.equal(t.partial, true); assert.equal(t.close, 300);
  assert.equal(t.net, 58.72); assert.equal(t.closePrice, 3015);
  assert.equal(J.stats(ts).trades, 1);
});

test('drawdown ignores deposits; consecutive losses; balance ops on the curve', () => {
  const deals = [{ ticket: 1, pos: 0, side: 'balance', entry: 'in', vol: 0, price: 0, profit: 1000, commission: 0, swap: 0, time: 10 },
    D(2, 1, 'buy', 'in', 0.1, 1, 0, 20), D(3, 1, 'sell', 'out', 0.1, 1, 50, 30),
    D(4, 2, 'buy', 'in', 0.1, 1, 0, 40), D(5, 2, 'sell', 'out', 0.1, 1, -30, 50),
    { ticket: 6, pos: 0, side: 'balance', entry: 'in', vol: 0, price: 0, profit: 500, commission: 0, swap: 0, time: 55 },
    D(7, 3, 'buy', 'in', 0.1, 1, 0, 60), D(8, 3, 'sell', 'out', 0.1, 1, -40, 70)];
  const s = J.stats(J.trades(deals), { balanceOps: J.balanceOps(deals) });
  assert.equal(s.maxDrawdown, 70);                        // +50 → −20, deposit not counted as recovery
  assert.equal(s.maxConsecLosses, 2);
  assert.equal(s.curve.at(-1).balance, 1480);
  assert.equal(s.curve.filter((c) => c.op).length, 2);
});

test('breakdowns by day (timezone), symbol, side, session; merge dedupes', () => {
  const t0 = Date.UTC(2026, 10, 25, 23, 30) / 1000;     // 23:30 UTC = 06:30 next day in Bangkok
  const deals = [D(1, 1, 'buy', 'in', 0.01, 1, 0, t0 - 600), D(2, 1, 'sell', 'out', 0.01, 1, 5, t0)];
  const s = J.stats(J.trades(deals), { tz: 7 * 3600 });
  assert.equal(s.byDay[0].key, '2026-11-26');
  assert.equal(J.stats(J.trades(deals)).byDay[0].key, '2026-11-25');
  assert.equal(s.bySide[0].key, 'buy'); assert.equal(s.bySession[0].key, 'asia');     // opened 23:20 UTC
  const m = J.merge(deals, [deals[1], D(9, 2, 'buy', 'in', 0.01, 1, 0, t0 + 5)]);
  assert.equal(m.deals.length, 3); assert.equal(m.added, 1);
  assert.match(J.csv(J.trades(deals)), /^position,symbol,side/);
});

test('sample account is deterministic and realistic', () => {
  const a = J.sample(7, 1795680000), b = J.sample(7, 1795680000);
  assert.deepEqual(a.deals.length, b.deals.length);
  const s = J.stats(J.trades(a.deals), { balanceOps: J.balanceOps(a.deals) });
  assert.ok(s.trades > 80 && s.trades < 300, String(s.trades));
  assert.ok(s.winRate > 0.35 && s.winRate < 0.8);
  assert.ok(s.byMonth.length >= 4);
});
