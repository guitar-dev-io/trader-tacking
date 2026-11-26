// Money-management math (mm.js): the numbers shown in the MM lessons, plan table and practice problems.
const test = require('node:test'), assert = require('node:assert');
const MM = require('../../mm.js');
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) <= e, `${a} ≠ ${b}`);

test('basic formulas', () => {
  near(MM.riskUSD(1000, 1), 10);
  near(MM.perPoint('XAUUSD', 1), 1);                 // gold 1.00 lot: $1 per point (0.01)
  near(MM.lossAt('XAUUSD', 0.01, 1000), 10);          // 1000 points at 0.01 lot = $10
  assert.equal(MM.lotFor('XAUUSD', 10, 1000).lot, 0.01);
  near(MM.perPip('EURUSD', 1), 10);                   // EURUSD 1.00 lot: $10 per pip
  assert.equal(MM.pipsToPoints('EURUSD', 20), 200);
  assert.equal(MM.lotFor('EURUSD', 10, 200).lot, 0.05);
  assert.equal(MM.lotFor('XAUUSD', 30, 700).lot, 0.04); // 0.0428 → rounded DOWN
  near(MM.breakEvenWinRate(2), 100 / 3);
  near(MM.recoveryPct(50), 100);
  near(MM.recoveryPct(20), 25);
  near(MM.expectancy(50, 2), 0.5);
  near(MM.avgPrice([{ price: 3500, lot: 0.01 }, { price: 3490, lot: 0.01 }]).avg, 3495);
  near(MM.margin('XAUUSD', 0.1, 3500, 500), 70);
  near(MM.usdToUsc(100), 10000);
  near(MM.centLotToStd(1), 0.01);
  assert.ok(MM.isCentSymbol('XAUUSDc') && MM.isCentSymbol('EURUSD.c') && MM.isCentSymbol('XAUUSDcent'));
  assert.ok(!MM.isCentSymbol('XAUUSD') && !MM.isCentSymbol('XAUUSDbrex.') && !MM.isCentSymbol('BTCUSDC'));
});

test('MM plan by account size: exact numbers', () => {
  const P = Object.fromEntries(MM.SIZES.map((b) => [b, MM.plan(b, { riskPct: 1, leverage: 500 })]));
  assert.deepEqual(MM.SIZES, [100, 300, 500, 1000, 3000, 5000, 10000]);
  // small accounts → cent: $100 = 10,000 USC, $1 risk, gold SL 1000 points → 0.10 cent lot
  assert.equal(P[100].type, 'cent'); assert.equal(P[100].balanceUSC, 10000); assert.equal(P[100].risk, 1);
  assert.deepEqual(P[100].gold.map((g) => g.lotCent), [0.33, 0.2, 0.1]);
  assert.ok(P[100].gold.every((g) => g.tooSmall));      // 0.01 standard lot would risk far more than 1%
  assert.equal(P[100].gold[2].riskAtMinLot, 10); assert.equal(P[100].gold[2].riskAtMinLotPct, 10);
  assert.equal(P[300].type, 'cent'); assert.equal(P[500].type, 'either');
  // $1000 × 1% = $10 → gold SL 300/500/1000 = 0.03 / 0.02 / 0.01 lot; EURUSD SL 20/30 pips = 0.05 / 0.03
  assert.equal(P[1000].type, 'standard'); assert.equal(P[1000].risk, 10);
  assert.deepEqual(P[1000].gold.map((g) => g.lotStd), [0.03, 0.02, 0.01]);
  assert.deepEqual(P[1000].eur.map((g) => g.lotStd), [0.05, 0.03]);
  assert.deepEqual(P[10000].gold.map((g) => g.lotStd), [0.33, 0.2, 0.1]);
  assert.deepEqual(P[5000].eur.map((g) => g.lotStd), [0.25, 0.16]);
  // limits: max 5% open risk → 5 trades at 1%; daily stop 3R; 10 losses in a row at 1% ≈ -9.6%
  assert.equal(P[1000].maxOpen, 5); assert.equal(P[1000].dailyStop, 30); assert.equal(P[1000].dailyStopPct, 3);
  assert.equal(P[1000].lossStreak10Pct, 9.6);
  assert.deepEqual([P[3000].monthly.low, P[3000].monthly.high], [60, 150]);
  // margin for the gold SL-1000 lot at 1:500, gold 3500: 0.1 lot × 100 × 3500 / 500 = $70
  assert.equal(P[10000].gold[2].marginUSD, 70);
  // risk 2% doubles the lots
  assert.deepEqual(MM.plan(1000, { riskPct: 2 }).gold.map((g) => g.lotStd), [0.06, 0.04, 0.02]);
});

test('random practice problems: every kind/level has a correct, checkable answer and worked steps', () => {
  for (const k of MM.KINDS) for (const lv of [1, 2, 3]) for (let s = 1; s <= 25; s++) {
    const p = MM.problem(k, lv, s * 101 + lv);
    assert.equal(p.kind, k); assert.ok(p.q && p.steps.length >= 2, k);
    assert.ok(isFinite(p.answer), `${k} ${lv} ${s}`);
    assert.ok(MM.check(p, String(p.answer)).ok, `${k}: own answer accepted`);
    assert.ok(!MM.check(p, String(p.answer * 1.5 + 1)).ok, `${k}: wrong answer rejected`);
  }
  const p = MM.problem('lot', 1, 7);
  assert.ok(MM.check(p, `${p.answer} lot`).ok);
  assert.ok(MM.check(MM.problem('cent', 1, 3), '1,000,000').ok === false);
  assert.equal(MM.check(p, '').empty, true);
  // the same seed gives the same problem
  assert.deepEqual(MM.problem('margin', 2, 42), MM.problem('margin', 2, 42));
});
