// Money-management math (pure, no DOM): lot size, $ at SL, R:R, drawdown, scale-in average, margin,
// cent accounts, MM plans by account size and random practice problems.
// Built to gen/mm.js: window.MM in the browser, module.exports in Node.

export interface Spec { size: number; point: number; pip: number; digits: number; name: string; price: number }
export type SpecSymbol = 'XAUUSD' | 'EURUSD';
export type AccountType = 'cent' | 'either' | 'standard';
export type ProblemKind = 'lot' | 'loss' | 'breakeven' | 'recovery' | 'avg' | 'margin' | 'cent';

// Contract specs used for teaching (typical; brokers can differ — always check the contract specification)
//  XAUUSD: 1.00 lot = 100 oz, 2 digits → 1 point = 0.01 → $1 per point per 1.00 lot ($0.01 per point per 0.01 lot)
//  EURUSD: 1.00 lot = 100,000 EUR, 5 digits → 1 pip = 0.0001 = 10 points → $10 per pip per 1.00 lot
export const SPEC: Record<SpecSymbol, Spec> = {
  XAUUSD: { size: 100, point: 0.01, pip: 0.1, digits: 2, name: 'ทองคำ (XAUUSD)', price: 3500 },
  EURUSD: { size: 100000, point: 0.00001, pip: 0.0001, digits: 5, name: 'EURUSD', price: 1.08 },
};
export const spec = (sym?: string | null): Spec => SPEC[String(sym || 'XAUUSD').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6) as SpecSymbol] || SPEC.XAUUSD;
const r2 = (x: number, d = 2): number => Math.round(x * 10 ** d) / 10 ** d;
export const floorStep = (x: number, step: number): number => Math.floor(x / step + 1e-9) * step;
export const fixStep = (x: number, step: number): number => +x.toFixed(Math.max(0, -Math.floor(Math.log10(step) + 1e-9)));
export const STD_MIN = 0.01, CENT_FACTOR = 100;   // cent account: 1.00 cent lot = 0.01 standard lot, 100 USC = $1

// $ per 1 point (or per 1 pip) for `lot` standard lots
export const perPoint = (sym: string, lot = 1): number => spec(sym).size * spec(sym).point * lot;
export const perPip = (sym: string, lot = 1): number => spec(sym).size * spec(sym).pip * lot;
export const riskUSD = (balance: number, pct: number): number => (balance * pct) / 100;
export const lossAt = (sym: string, lot: number, slPoints: number): number => perPoint(sym, lot) * slPoints;
// largest lot (multiple of step) that keeps the loss at SL within `risk` $
export function lotFor(sym: string, risk: number, slPoints: number, step = STD_MIN): { raw: number; lot: number } {
  const raw = risk / perPoint(sym, 1) / slPoints;
  return { raw, lot: fixStep(floorStep(raw, step), step) };
}
export const pipsToPoints = (sym: string, pips: number): number => Math.round((pips * spec(sym).pip) / spec(sym).point);
export const breakEvenWinRate = (rr: number): number => 100 / (1 + rr);          // % of trades that must win at this R:R to break even
export const expectancy = (winPct: number, rr: number): number => (winPct / 100) * rr - (1 - winPct / 100);   // in R per trade
export const recoveryPct = (ddPct: number): number => (ddPct / (100 - ddPct)) * 100;                 // gain needed to get back after a DD
export const afterLosses = (balance: number, pct: number, n: number): number => balance * (1 - pct / 100) ** n;     // fixed-% risk, n losses in a row
export function avgPrice(fills: { lot: number; price: number }[]): { lot: number; avg: number | null } {
  const lot = fills.reduce((s, f) => s + f.lot, 0);
  return { lot, avg: lot ? fills.reduce((s, f) => s + f.lot * f.price, 0) / lot : null };
}
export const margin = (sym: string, lot: number, price: number | null | undefined, leverage: number): number => (lot * spec(sym).size * (price ?? spec(sym).price)) / leverage;
export const marginLevel = (equity: number, usedMargin: number): number => (usedMargin ? (equity / usedMargin) * 100 : Infinity);
export const usdToUsc = (usd: number): number => usd * CENT_FACTOR;
export const uscToUsd = (usc: number): number => usc / CENT_FACTOR;
export const centLotToStd = (c: number): number => c / CENT_FACTOR;
export const stdLotToCent = (s: number): number => s * CENT_FACTOR;
// symbol suffix guess: XAUUSDc, EURUSD.c, XAUUSDcent, BTCUSD_cent → cent account
export const isCentSymbol = (sym?: string | null): boolean => { const t = String(sym || '').trim(); return /[._-]?cent$/i.test(t) || /^[A-Za-z]{6}[._-]c$/i.test(t) || (/^[A-Za-z]{6}c$/i.test(t) && !/usdc$/i.test(t)) || /^[A-Z]{6}c$/.test(t); };

// ------------------------------------------------------------ MM plan by account size
export const SIZES = [100, 300, 500, 1000, 3000, 5000, 10000];
// account type: small balances can't keep 1% risk at the 0.01 standard minimum lot → cent account
export function accountType(balance: number, riskPct = 1): AccountType {
  const r = riskUSD(balance, riskPct), minLotRisk = lossAt('XAUUSD', STD_MIN, 500);     // 0.01 lot, SL 500 points = $5
  if (r < minLotRisk) return 'cent';
  if (r < 2 * minLotRisk) return 'either';
  return 'standard';
}

export interface PlanOptions { riskPct?: number; leverage?: number; dailyStopR?: number; maxOpenRiskPct?: number; goldPrice?: number; eurPrice?: number; type?: AccountType }
export interface PlanRow {
  sym: SpecSymbol; sl: number; unit: 'point' | 'pip'; points: number; raw: number; lotStd: number; tooSmall: boolean; lotCent: number; centStd: number;
  riskAtMinLot: number; riskAtMinLotPct: number; lossUSD: number; marginUSD: number;
}
export interface Plan {
  balance: number; balanceUSC: number | null; type: AccountType; riskPct: number; leverage: number; risk: number; riskUSC: number | null;
  gold: PlanRow[]; eur: PlanRow[]; maxOpen: number; maxOpenRisk: number; maxOpenRiskPct: number;
  dailyStop: number; dailyStopPct: number; weeklyStop: number; weeklyStopPct: number;
  monthly: { lowPct: number; highPct: number; low: number; high: number };
  lossStreak10: number; lossStreak10Pct: number;
}

export function plan(balance: number, o: PlanOptions = {}): Plan {
  const riskPct = o.riskPct ?? 1, leverage = o.leverage ?? 500, dailyStopR = o.dailyStopR ?? 3, maxRiskPct = o.maxOpenRiskPct ?? 5;
  const gold = o.goldPrice ?? SPEC.XAUUSD.price, eur = o.eurPrice ?? SPEC.EURUSD.price;
  const type = o.type || accountType(balance, riskPct);
  const cent = type !== 'standard';                                       // 'either' shows cent lots too
  const cstep = centLotToStd(0.01);                                       // cent: 0.01 cent lot = 0.0001 standard lot
  const risk = riskUSD(balance, riskPct);
  const row = (sym: SpecSymbol, sl: number, unit: 'point' | 'pip'): PlanRow => {
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
export type Rng = () => number;
export function rng(seed?: number | null): Rng {                    // mulberry32 (deterministic with a seed; Math.random otherwise)
  if (seed == null) return Math.random;
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const KINDS: ProblemKind[] = ['lot', 'loss', 'breakeven', 'recovery', 'avg', 'margin', 'cent'];
export const KIND_NAME: Record<ProblemKind, string> = { lot: 'ขนาด lot', loss: 'ขาดทุนที่ SL', breakeven: 'R:R / Win rate', recovery: 'Drawdown', avg: 'ราคาเฉลี่ย (เติมไม้)', margin: 'Margin / Leverage', cent: 'บัญชีเซ็นต์' };
const money = (v: number): string => '$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 });
const num = (v: number, d = 2): string => Number(v).toLocaleString('en-US', { maximumFractionDigits: d });

export interface Problem { kind: ProblemKind; level: number; kindName: string; q: string; answer: number; tol: number; unit: string; steps: string[] }

export function problem(kind?: string | null, level = 1, seed?: number | null): Problem {
  const R = rng(seed);
  const pick = <T>(a: readonly T[]): T => a[Math.floor(R() * a.length)] as T;
  const int = (a: number, b: number): number => a + Math.floor(R() * (b - a + 1));
  const k: ProblemKind = kind && (KINDS as string[]).includes(kind) ? (kind as ProblemKind) : pick(KINDS);
  const L = Math.max(1, Math.min(3, level));
  const bal = pick(L === 1 ? [1000, 2000, 5000, 10000] : L === 2 ? [500, 1500, 3000, 7500] : [300, 1200, 2500, 6400]);
  const pct = pick(L === 1 ? [1, 2] : [0.5, 1, 1.5, 2]);
  const sym = L === 1 ? 'XAUUSD' : pick(['XAUUSD', 'EURUSD']);
  const P = { kind: k, level: L, kindName: KIND_NAME[k] };
  if (k === 'lot' || k === 'loss') {
    if (sym === 'XAUUSD') {
      const sl = pick(L === 1 ? [500, 1000, 2000] : [300, 400, 600, 800, 1200, 1500]);
      if (k === 'lot') {
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
    if (k === 'lot') {
      const risk = riskUSD(bal, pct), { raw, lot } = lotFor(sym, risk, pipsToPoints(sym, pips));
      return { ...P, q: `ทุน ${money(bal)} เสี่ยง ${pct}% เทรด EURUSD ตั้ง SL ${pips} pips ควรเปิดกี่ lot? (ปัดลงทีละ 0.01)`, answer: lot, tol: 0.0001, unit: 'lot',
        steps: [`เงินที่ยอมเสีย = ${money(bal)} × ${pct}% = ${money(risk)}`, 'EURUSD 1.00 lot = $10 ต่อ 1 pip', `ขาดทุนต่อ 1.00 lot = ${pips} pips × $10 = ${money(pips * 10)}`,
          `lot = ${money(risk)} ÷ ${money(pips * 10)} = ${num(raw, 4)} → ปัดลง = ${lot.toFixed(2)} lot`] };
    }
    const lot = pick([0.05, 0.1, 0.2, 0.3, 0.5]), loss = r2(perPip(sym, lot) * pips);
    return { ...P, q: `เปิด EURUSD ${lot.toFixed(2)} lot SL ${pips} pips ถ้าโดน SL ขาดทุนกี่ดอลลาร์?`, answer: loss, tol: 0.01, unit: '$',
      steps: ['EURUSD 1.00 lot = $10 ต่อ pip', `${lot.toFixed(2)} lot = $${num(perPip(sym, lot))} ต่อ pip`, `${pips} × $${num(perPip(sym, lot))} = ${money(loss)}`] };
  }
  if (k === 'breakeven') {
    const rr = pick(L === 1 ? [1, 2, 3] : [1.5, 2.5, 4, 0.5]), be = r2(breakEvenWinRate(rr), 1);
    return { ...P, q: `ระบบเทรดที่ได้ R:R = 1:${rr} (เสีย 1 ได้ ${rr}) ต้องชนะอย่างน้อยกี่ % ถึงจะเสมอตัว (ไม่รวมค่าธรรมเนียม)?`, answer: be, tol: 0.15, unit: '%',
      steps: ['เสมอตัวเมื่อ (Win% × RR) = (Loss% × 1)', `Win% = 1 ÷ (1 + RR) = 1 ÷ (1 + ${rr})`, `= ${num(1 / (1 + rr), 4)} = ${be}%`] };
  }
  if (k === 'recovery') {
    const dd = pick(L === 1 ? [10, 20, 25, 50] : [15, 30, 40, 60]), need = r2(recoveryPct(dd), 1);
    return { ...P, q: `พอร์ตขาดทุน (Drawdown) ${dd}% ต้องทำกำไรกี่ % จากเงินที่เหลือ ถึงจะกลับมาเท่าทุนเดิม?`, answer: need, tol: 0.15, unit: '%',
      steps: [`สมมติทุน 100 → เหลือ ${100 - dd}`, `ต้องได้กลับ ${dd} จากฐาน ${100 - dd}`, `${dd} ÷ ${100 - dd} × 100 = ${need}%`] };
  }
  if (k === 'avg') {
    const p0 = int(3300, 3600), gap = pick(L === 1 ? [5, 10] : [3, 7, 12]), n = L === 1 ? 2 : 3;
    const lots: number[] = L === 3 ? [0.01, 0.02, 0.04] : Array<number>(n).fill(pick([0.01, 0.02, 0.05]));
    const fills = lots.slice(0, n).map((lot, i) => ({ price: p0 - i * gap, lot }));
    const { lot, avg } = avgPrice(fills), ans = r2(avg ?? 0, 2);
    return { ...P, q: `Buy ทองที่ ${fills.map((f) => `${num(f.price)} (${f.lot.toFixed(2)} lot)`).join(', ')} ราคาเฉลี่ย (จุดคุ้มทุน) คือเท่าไร?`, answer: ans, tol: 0.011, unit: '',
      steps: ['ราคาเฉลี่ย = Σ(ราคา × lot) ÷ lot รวม', `= (${fills.map((f) => `${num(f.price)}×${f.lot}`).join(' + ')}) ÷ ${num(lot, 2)}`, `= ${num(ans)}`] };
  }
  if (k === 'margin') {
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

export function check(p: Pick<Problem, 'answer' | 'tol'>, input: unknown): { ok: boolean; empty?: boolean; value?: number } {
  const s = String(input ?? '').replace(/[,\s$%]|usc|lot|cent/gi, '');
  if (s === '' || !isFinite(+s)) return { ok: false, empty: s === '' };
  const x = +s;
  return { ok: Math.abs(x - p.answer) <= p.tol + 1e-9, value: x };
}
