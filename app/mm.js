// Money-management math (pure, no DOM): lot size, $ at SL, R:R, drawdown, scale-in average, margin,
// cent accounts, MM plans by account size and random practice problems.
// Works in the browser (window.MM) and in Node (module.exports) like analysis.js.
(function () {
  // Contract specs used for teaching (typical; brokers can differ — always check the contract specification)
  //  XAUUSD: 1.00 lot = 100 oz, 2 digits → 1 point = 0.01 → $1 per point per 1.00 lot ($0.01 per point per 0.01 lot)
  //  EURUSD: 1.00 lot = 100,000 EUR, 5 digits → 1 pip = 0.0001 = 10 points → $10 per pip per 1.00 lot
  const SPEC = {
    XAUUSD: { size: 100, point: 0.01, pip: 0.1, digits: 2, name: 'ทองคำ (XAUUSD)', price: 3500 },
    EURUSD: { size: 100000, point: 0.00001, pip: 0.0001, digits: 5, name: 'EURUSD', price: 1.08 },
  };
  const spec = (sym) => SPEC[String(sym || 'XAUUSD').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6)] || SPEC.XAUUSD;
  const r2 = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
  const floorStep = (x, step) => Math.floor(x / step + 1e-9) * step;
  const fixStep = (x, step) => +x.toFixed(Math.max(0, -Math.floor(Math.log10(step) + 1e-9)));
  const STD_MIN = 0.01, CENT_FACTOR = 100;   // cent account: 1.00 cent lot = 0.01 standard lot, 100 USC = $1

  // $ per 1 point (or per 1 pip) for `lot` standard lots
  const perPoint = (sym, lot = 1) => spec(sym).size * spec(sym).point * lot;
  const perPip = (sym, lot = 1) => spec(sym).size * spec(sym).pip * lot;
  const riskUSD = (balance, pct) => (balance * pct) / 100;
  const lossAt = (sym, lot, slPoints) => perPoint(sym, lot) * slPoints;
  // largest lot (multiple of step) that keeps the loss at SL within `risk` $
  function lotFor(sym, risk, slPoints, step = STD_MIN) {
    const raw = risk / perPoint(sym, 1) / slPoints;
    return { raw, lot: fixStep(floorStep(raw, step), step) };
  }
  const pipsToPoints = (sym, pips) => Math.round((pips * spec(sym).pip) / spec(sym).point);
  const breakEvenWinRate = (rr) => 100 / (1 + rr);          // % of trades that must win at this R:R to break even
  const expectancy = (winPct, rr) => (winPct / 100) * rr - (1 - winPct / 100);   // in R per trade
  const recoveryPct = (ddPct) => (ddPct / (100 - ddPct)) * 100;                 // gain needed to get back after a DD
  const afterLosses = (balance, pct, n) => balance * (1 - pct / 100) ** n;     // fixed-% risk, n losses in a row
  function avgPrice(fills) {
    const lot = fills.reduce((s, f) => s + f.lot, 0);
    return { lot, avg: lot ? fills.reduce((s, f) => s + f.lot * f.price, 0) / lot : null };
  }
  const margin = (sym, lot, price, leverage) => (lot * spec(sym).size * (price ?? spec(sym).price)) / leverage;
  const marginLevel = (equity, usedMargin) => (usedMargin ? (equity / usedMargin) * 100 : Infinity);
  const usdToUsc = (usd) => usd * CENT_FACTOR, uscToUsd = (usc) => usc / CENT_FACTOR;
  const centLotToStd = (c) => c / CENT_FACTOR, stdLotToCent = (s) => s * CENT_FACTOR;
  // symbol suffix guess: XAUUSDc, EURUSD.c, XAUUSDcent, BTCUSD_cent → cent account
  const isCentSymbol = (sym) => { const t = String(sym || '').trim(); return /[._-]?cent$/i.test(t) || /^[A-Za-z]{6}[._-]c$/i.test(t) || (/^[A-Za-z]{6}c$/i.test(t) && !/usdc$/i.test(t)) || /^[A-Z]{6}c$/.test(t); };

  // ------------------------------------------------------------ MM plan by account size
  const SIZES = [100, 300, 500, 1000, 3000, 5000, 10000];
  // account type: small balances can't keep 1% risk at the 0.01 standard minimum lot → cent account
  function accountType(balance, riskPct = 1) {
    const r = riskUSD(balance, riskPct), minLotRisk = lossAt('XAUUSD', STD_MIN, 500);     // 0.01 lot, SL 500 points = $5
    if (r < minLotRisk) return 'cent';
    if (r < 2 * minLotRisk) return 'either';
    return 'standard';
  }
  function plan(balance, o = {}) {
    const riskPct = o.riskPct ?? 1, leverage = o.leverage ?? 500, dailyStopR = o.dailyStopR ?? 3, maxRiskPct = o.maxOpenRiskPct ?? 5;
    const gold = o.goldPrice ?? SPEC.XAUUSD.price, eur = o.eurPrice ?? SPEC.EURUSD.price;
    const type = o.type || accountType(balance, riskPct);
    const cent = type !== 'standard';                                       // 'either' shows cent lots too
    const cstep = centLotToStd(0.01);                                       // cent: 0.01 cent lot = 0.0001 standard lot
    const risk = riskUSD(balance, riskPct);
    const row = (sym, sl, unit) => {
      const pts = unit === 'pip' ? pipsToPoints(sym, sl) : sl;
      const { raw, lot } = lotFor(sym, risk, pts, STD_MIN);                  // standard account (0.01 steps)
      const c = lotFor(sym, risk, pts, cstep).lot;                             // cent account precision
      const ok = lot >= STD_MIN - 1e-12, used = cent ? c : ok ? lot : STD_MIN;
      return { sym, sl, unit, points: pts, raw, lotStd: lot, tooSmall: !ok, lotCent: fixStep(stdLotToCent(c), 0.01), centStd: c,
        riskAtMinLot: r2(lossAt(sym, STD_MIN, pts)), riskAtMinLotPct: r2((lossAt(sym, STD_MIN, pts) / balance) * 100, 1),
        lossUSD: r2(lossAt(sym, used, pts)), marginUSD: r2(margin(sym, used, sym === 'EURUSD' ? eur : gold, leverage)) };
    };
    const maxOpen = Math.max(1, Math.floor(maxRiskPct / riskPct));
    return {
      balance, balanceUSC: cent ? usdToUsc(balance) : null, type, riskPct, leverage, risk: r2(risk), riskUSC: cent ? r2(usdToUsc(risk)) : null,
      gold: [300, 500, 1000].map((sl) => row('XAUUSD', sl, 'point')),
      eur: [20, 30].map((sl) => row('EURUSD', sl, 'pip')),
      maxOpen, maxOpenRisk: r2(maxOpen * risk), maxOpenRiskPct: r2(maxOpen * riskPct, 1),
      dailyStop: r2(dailyStopR * risk), dailyStopPct: r2(dailyStopR * riskPct, 1),
      weeklyStop: r2(2 * dailyStopR * risk), weeklyStopPct: r2(2 * dailyStopR * riskPct, 1),
      monthly: { lowPct: 2, highPct: 5, low: r2(balance * 0.02), high: r2(balance * 0.05) },
      lossStreak10: r2(balance - afterLosses(balance, riskPct, 10)), lossStreak10Pct: r2(100 - afterLosses(100, riskPct, 10), 1),
    };
  }

  // ------------------------------------------------------------ random practice problems
  function rng(seed) {                    // mulberry32 (deterministic with a seed; Math.random otherwise)
    if (seed == null) return Math.random;
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const KINDS = ['lot', 'loss', 'breakeven', 'recovery', 'avg', 'margin', 'cent'];
  const KIND_NAME = { lot: 'ขนาด lot', loss: 'ขาดทุนที่ SL', breakeven: 'R:R / Win rate', recovery: 'Drawdown', avg: 'ราคาเฉลี่ย (เติมไม้)', margin: 'Margin / Leverage', cent: 'บัญชีเซ็นต์' };
  const money = (v) => '$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 });
  const num = (v, d = 2) => Number(v).toLocaleString('en-US', { maximumFractionDigits: d });
  function problem(kind, level = 1, seed) {
    const R = rng(seed), pick = (a) => a[Math.floor(R() * a.length)], int = (a, b) => a + Math.floor(R() * (b - a + 1));
    kind = kind && KINDS.includes(kind) ? kind : pick(KINDS);
    const L = Math.max(1, Math.min(3, level));
    const bal = pick(L === 1 ? [1000, 2000, 5000, 10000] : L === 2 ? [500, 1500, 3000, 7500] : [300, 1200, 2500, 6400]);
    const pct = pick(L === 1 ? [1, 2] : [0.5, 1, 1.5, 2]);
    const sym = L === 1 ? 'XAUUSD' : pick(['XAUUSD', 'EURUSD']);
    const P = { kind, level: L, kindName: KIND_NAME[kind] };
    if (kind === 'lot' || kind === 'loss') {
      if (sym === 'XAUUSD') {
        const sl = pick(L === 1 ? [500, 1000, 2000] : [300, 400, 600, 800, 1200, 1500]);
        if (kind === 'lot') {
          const risk = riskUSD(bal, pct), { raw, lot } = lotFor(sym, risk, sl);
          return { ...P, q: `ทุน ${money(bal)} เสี่ยง ${pct}% ต่อไม้ เทรดทอง (XAUUSD) ตั้ง SL ${num(sl, 0)} จุด ควรเปิดกี่ lot? (ปัดลงทีละ 0.01)`, answer: lot, tol: 0.0001, unit: 'lot',
            steps: [`เงินที่ยอมเสีย = ${money(bal)} × ${pct}% = ${money(risk)}`, 'ทอง 1.00 lot ราคาขยับ 1 จุด (0.01) = $1 → 0.01 lot = $0.01 ต่อจุด',
              `ขาดทุนต่อ 1.00 lot ถ้าโดน SL = ${num(sl, 0)} จุด × $1 = ${money(sl)}`, `lot = ${money(risk)} ÷ ${money(sl)} = ${num(raw, 4)} → ปัดลง = ${lot.toFixed(2)} lot`] };
        }
        const lot = pick(L === 1 ? [0.01, 0.02, 0.05, 0.1] : [0.03, 0.07, 0.15, 0.25]), loss = r2(lossAt(sym, lot, sl));
        return { ...P, q: `เปิด Buy ทอง ${lot.toFixed(2)} lot ตั้ง SL ห่าง ${num(sl, 0)} จุด ถ้าโดน SL จะขาดทุนกี่ดอลลาร์?`, answer: loss, tol: 0.01, unit: '$',
          steps: ['ทอง 1.00 lot = $1 ต่อ 1 จุด', `${lot.toFixed(2)} lot = $${num(perPoint(sym, lot), 4)} ต่อจุด`, `${num(sl, 0)} จุด × $${num(perPoint(sym, lot), 4)} = ${money(loss)}`] };
      }
      const pips = pick(L === 2 ? [15, 20, 25, 30] : [12, 18, 35, 40]);
      if (kind === 'lot') {
        const risk = riskUSD(bal, pct), { raw, lot } = lotFor(sym, risk, pipsToPoints(sym, pips));
        return { ...P, q: `ทุน ${money(bal)} เสี่ยง ${pct}% เทรด EURUSD ตั้ง SL ${pips} pips ควรเปิดกี่ lot? (ปัดลงทีละ 0.01)`, answer: lot, tol: 0.0001, unit: 'lot',
          steps: [`เงินที่ยอมเสีย = ${money(bal)} × ${pct}% = ${money(risk)}`, 'EURUSD 1.00 lot = $10 ต่อ 1 pip', `ขาดทุนต่อ 1.00 lot = ${pips} pips × $10 = ${money(pips * 10)}`,
            `lot = ${money(risk)} ÷ ${money(pips * 10)} = ${num(raw, 4)} → ปัดลง = ${lot.toFixed(2)} lot`] };
      }
      const lot = pick([0.05, 0.1, 0.2, 0.3, 0.5]), loss = r2(perPip(sym, lot) * pips);
      return { ...P, q: `เปิด EURUSD ${lot.toFixed(2)} lot SL ${pips} pips ถ้าโดน SL ขาดทุนกี่ดอลลาร์?`, answer: loss, tol: 0.01, unit: '$',
        steps: ['EURUSD 1.00 lot = $10 ต่อ pip', `${lot.toFixed(2)} lot = $${num(perPip(sym, lot))} ต่อ pip`, `${pips} × $${num(perPip(sym, lot))} = ${money(loss)}`] };
    }
    if (kind === 'breakeven') {
      const rr = pick(L === 1 ? [1, 2, 3] : [1.5, 2.5, 4, 0.5]), be = r2(breakEvenWinRate(rr), 1);
      return { ...P, q: `ระบบเทรดที่ได้ R:R = 1:${rr} (เสีย 1 ได้ ${rr}) ต้องชนะอย่างน้อยกี่ % ถึงจะเสมอตัว (ไม่รวมค่าธรรมเนียม)?`, answer: be, tol: 0.15, unit: '%',
        steps: ['เสมอตัวเมื่อ (Win% × RR) = (Loss% × 1)', `Win% = 1 ÷ (1 + RR) = 1 ÷ (1 + ${rr})`, `= ${num(1 / (1 + rr), 4)} = ${be}%`] };
    }
    if (kind === 'recovery') {
      const dd = pick(L === 1 ? [10, 20, 25, 50] : [15, 30, 40, 60]), need = r2(recoveryPct(dd), 1);
      return { ...P, q: `พอร์ตขาดทุน (Drawdown) ${dd}% ต้องทำกำไรกี่ % จากเงินที่เหลือ ถึงจะกลับมาเท่าทุนเดิม?`, answer: need, tol: 0.15, unit: '%',
        steps: [`สมมติทุน 100 → เหลือ ${100 - dd}`, `ต้องได้กลับ ${dd} จากฐาน ${100 - dd}`, `${dd} ÷ ${100 - dd} × 100 = ${need}%`] };
    }
    if (kind === 'avg') {
      const p0 = int(3300, 3600), gap = pick(L === 1 ? [5, 10] : [3, 7, 12]), n = L === 1 ? 2 : 3;
      const lots = L === 3 ? [0.01, 0.02, 0.04] : Array(n).fill(pick([0.01, 0.02, 0.05]));
      const fills = lots.slice(0, n).map((lot, i) => ({ price: p0 - i * gap, lot }));
      const { lot, avg } = avgPrice(fills), ans = r2(avg, 2);
      return { ...P, q: `Buy ทองที่ ${fills.map((f) => `${num(f.price)} (${f.lot.toFixed(2)} lot)`).join(', ')} ราคาเฉลี่ย (จุดคุ้มทุน) คือเท่าไร?`, answer: ans, tol: 0.011, unit: '',
        steps: ['ราคาเฉลี่ย = Σ(ราคา × lot) ÷ lot รวม', `= (${fills.map((f) => `${num(f.price)}×${f.lot}`).join(' + ')}) ÷ ${num(lot, 2)}`, `= ${num(ans)}`] };
    }
    if (kind === 'margin') {
      const lev = pick(L === 1 ? [100, 500] : [200, 400, 1000, 2000]), lot = pick([0.01, 0.05, 0.1, 0.5]), price = int(3300, 3700);
      const m = r2(margin('XAUUSD', lot, price, lev));
      return { ...P, q: `ทองราคา ${num(price)} เปิด ${lot.toFixed(2)} lot ที่ Leverage 1:${lev} ต้องใช้ Margin กี่ดอลลาร์?`, answer: m, tol: 0.011, unit: '$',
        steps: [`มูลค่าสัญญา = ${lot} lot × 100 oz × ${num(price)} = ${money(lot * 100 * price)}`, `Margin = มูลค่าสัญญา ÷ ${lev}`, `= ${money(m)}`] };
    }
    // cent
    const t = pick(L === 1 ? ['usc', 'lot'] : ['usc', 'lot', 'risk']);
    if (t === 'usc') {
      const usd = pick([10, 50, 100, 250, 500]);
      return { ...P, q: `ฝากเงิน ${money(usd)} เข้าบัญชีเซ็นต์ ในแอป MT5 จะเห็นยอด Balance กี่ USC?`, answer: usdToUsc(usd), tol: 0.5, unit: 'USC',
        steps: ['$1 = 100 เซ็นต์ (USC)', `${money(usd)} × 100 = ${num(usdToUsc(usd), 0)} USC`] };
    }
    if (t === 'lot') {
      const c = pick([0.1, 0.5, 1, 2, 5]);
      return { ...P, q: `บัญชีเซ็นต์เปิด XAUUSDc ${c.toFixed(2)} lot (cent lot) มีขนาดเท่ากับบัญชีมาตรฐานกี่ lot?`, answer: centLotToStd(c), tol: 0.00001, unit: 'lot',
        steps: ['1.00 cent lot = 0.01 lot มาตรฐาน (เล็กกว่า 100 เท่า)', `${c} ÷ 100 = ${num(centLotToStd(c), 4)} lot`] };
    }
    const usc = pick([10000, 20000, 50000]), p = pick([1, 2]), sl = pick([500, 1000]);
    const riskUsc = (usc * p) / 100, cl = fixStep(floorStep(riskUsc / sl, 0.01), 0.01);
    return { ...P, q: `บัญชีเซ็นต์มี ${num(usc, 0)} USC เสี่ยง ${p}% เทรด XAUUSDc SL ${sl} จุด ควรเปิดกี่ cent lot?`, answer: cl, tol: 0.0001, unit: 'cent lot',
      steps: [`เงินที่ยอมเสีย = ${num(usc, 0)} × ${p}% = ${num(riskUsc, 0)} USC (= ${money(uscToUsd(riskUsc))})`, 'บัญชีเซ็นต์: 1.00 cent lot ทอง = 1 USC ต่อจุด (เท่ากับ $0.01)',
        `lot = ${num(riskUsc, 0)} ÷ ${sl} = ${num(riskUsc / sl, 4)} → ปัดลง ${cl.toFixed(2)} cent lot (= ${num(centLotToStd(cl), 4)} lot มาตรฐาน)`] };
  }
  function check(p, input) {
    const s = String(input ?? '').replace(/[,\s$%]|usc|lot|cent/gi, '');
    if (s === '' || !isFinite(+s)) return { ok: false, empty: s === '' };
    const x = +s;
    return { ok: Math.abs(x - p.answer) <= p.tol + 1e-9, value: x };
  }

  const MM = { SPEC, spec, SIZES, KINDS, KIND_NAME, STD_MIN, CENT_FACTOR, perPoint, perPip, riskUSD, lossAt, lotFor, pipsToPoints, breakEvenWinRate,
    expectancy, recoveryPct, afterLosses, avgPrice, margin, marginLevel, usdToUsc, uscToUsd, centLotToStd, stdLotToCent, isCentSymbol, accountType,
    plan, problem, check, rng, floorStep, fixStep };
  if (typeof module !== 'undefined' && module.exports) module.exports = MM;
  if (typeof window !== 'undefined') window.MM = MM;
})();
