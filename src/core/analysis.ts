// Price-action analysis engine.
// Input: CLOSED candles only [{time, open, high, low, close}] (the forming candle must be excluded).
// Everything used for a signal at bar k is known at the close of bar k (no look-ahead):
// pivots count only after their right-side bars have closed, and the "learning" statistics
// for a signal use only earlier signals whose outcome was already decided before bar k.
// Built to gen/analysis.js: window.AN in the browser, module.exports in Node.
import type { Candle, Dir } from './types';

export type PatternKey = 'morning' | 'evening' | 'bullEng' | 'bearEng' | 'hammer' | 'star' | 'doji' | 'inside';
export type SetupKey = 'pullback' | 'choch' | 'sr';

export const PAT: Record<PatternKey, { name: string; short: string; dir: Dir | 0; rank: number }> = {
  morning: { name: 'Morning Star', short: 'MS', dir: 1, rank: 5 },
  evening: { name: 'Evening Star', short: 'ES', dir: -1, rank: 5 },
  bullEng: { name: 'Bullish Engulfing', short: 'BE', dir: 1, rank: 4 },
  bearEng: { name: 'Bearish Engulfing', short: 'SE', dir: -1, rank: 4 },
  hammer: { name: 'Hammer / Pin bar', short: 'HM', dir: 1, rank: 3 },
  star: { name: 'Shooting Star / Pin bar', short: 'SS', dir: -1, rank: 3 },
  doji: { name: 'Doji', short: 'DJ', dir: 0, rank: 1 },
  inside: { name: 'Inside Bar', short: 'IB', dir: 0, rank: 1 },
};
export const SETUP: Record<SetupKey, { name: string; short: string }> = {
  pullback: { name: 'ย่อตามเทรนด์ (Pullback)', short: 'PB' },
  choch: { name: 'กลับตัวหลัง CHoCH', short: 'CH' },
  sr: { name: 'เด้งแนวรับ/แนวต้าน', short: 'SR' },
};

export interface Pivot { i: number; type: 'H' | 'L'; price: number; conf: number }
export interface Swing extends Pivot { label: 'H' | 'L' | 'HH' | 'LH' | 'HL' | 'LL'; time: number; legBars: number | null }
export interface StructureEvent { type: 'BOS' | 'CHoCH'; dir: Dir; from: number; idx: number; price: number }
export interface Structure { trendAt: (Dir | 0)[]; events: StructureEvent[]; lastEventAt: (StructureEvent | null)[] }
export interface Zone { top: number; bottom: number; touches: number; first: number; last: number; kind: 'support' | 'resistance'; mid: number }
export interface SimResult { res: 'win' | 'loss' | 'expired' | 'open'; at: number | null }
export interface Stat { n: number; w1: number; w2: number; l2: number; open: number; wr1?: number | null; wr2?: number | null; exp?: number | null }
export interface Signal {
  idx: number; time: number; dir: Dir; setup: SetupKey; pattern: PatternKey; entry: number; sl: number; tp1: number; tp2: number; tpS: number | null;
  risk: number; reasons: string[]; r1: SimResult; r2: SimResult; prior?: Stat; learned?: 'good' | 'bad' | 'unknown';
}
export interface AnalyzeOptions { swingLen?: number; rr1?: number; rr2?: number; maxBars?: number; minSamples?: number; slBuf?: number; digits?: number }
export interface Analysis {
  n: number; atr: (number | null)[]; pivots: Pivot[]; swings: Swing[]; events: StructureEvent[]; trendAt: (Dir | 0)[];
  lastEvent: StructureEvent | null; lastTrend: Dir | 0; patterns: PatternKey[][]; td: { up: number[]; dn: number[] }; zones: Zone[];
  signals: Signal[];
  stats: { all: Stat; learned: Stat; bySetup: Record<string, Stat>; byPattern: Record<string, Stat>; byCombo: Record<string, Stat> };
  opt: Required<Omit<AnalyzeOptions, 'digits'>> & { digits?: number };
}

const at = <T>(a: readonly T[], i: number): T => a[i] as T;   // index known to be in range

function atrArr(c: Candle[], n = 14): (number | null)[] {
  const out: (number | null)[] = new Array<number | null>(c.length).fill(null); let r: number | null = null;
  for (let i = 0; i < c.length; i++) {
    const x = at(c, i), tr = i === 0 ? x.high - x.low : Math.max(x.high - x.low, Math.abs(x.high - at(c, i - 1).close), Math.abs(x.low - at(c, i - 1).close));
    if (i < n - 1) { r = (r || 0) + tr; continue; }
    if (i === n - 1) { r = ((r ?? 0) + tr) / n; out[i] = r; continue; }
    r = ((r ?? 0) * (n - 1) + tr) / n; out[i] = r;
  }
  return out;
}

// Raw pivots (fractals): high/low that is the extreme of L bars on each side.
function pivots(c: Candle[], L: number): Pivot[] {
  const out: Pivot[] = [];
  for (let i = L; i < c.length - L; i++) {
    let isH = true, isL = true;
    const ci = at(c, i);
    for (let j = i - L; j <= i + L && (isH || isL); j++) {
      if (j === i) continue;
      const cj = at(c, j);
      if (j < i) { if (cj.high >= ci.high) isH = false; if (cj.low <= ci.low) isL = false; }
      else { if (cj.high > ci.high) isH = false; if (cj.low < ci.low) isL = false; }
    }
    if (isH) out.push({ i, type: 'H', price: ci.high, conf: i + L });
    if (isL) out.push({ i, type: 'L', price: ci.low, conf: i + L });
  }
  return out;
}

// Alternating swings for display (zigzag) with HH/HL/LH/LL labels and bars per leg.
function swings(c: Candle[], piv: Pivot[]): Swing[] {
  const alt: Swing[] = [];
  for (const p of piv) {
    const s: Swing = { ...p, label: p.type, time: 0, legBars: null }, last = alt[alt.length - 1];
    if (last && last.type === s.type) {
      if ((s.type === 'H' && s.price > last.price) || (s.type === 'L' && s.price < last.price)) alt[alt.length - 1] = s;
    } else alt.push(s);
  }
  let pH: Swing | null = null, pL: Swing | null = null;
  alt.forEach((s, k) => {
    if (s.type === 'H') { s.label = pH ? (s.price > pH.price ? 'HH' : 'LH') : 'H'; pH = s; }
    else { s.label = pL ? (s.price > pL.price ? 'HL' : 'LL') : 'L'; pL = s; }
    s.time = at(c, s.i).time;
    s.legBars = k ? s.i - at(alt, k - 1).i : null;
  });
  return alt;
}

// Market structure: BOS = break in trend direction, CHoCH = first break against the trend.
function structure(c: Candle[], piv: Pivot[]): Structure {
  const n = c.length, trendAt: (Dir | 0)[] = new Array<Dir | 0>(n).fill(0), events: StructureEvent[] = [];
  const lastEventAt: (StructureEvent | null)[] = new Array<StructureEvent | null>(n).fill(null);
  const byConf = [...piv].sort((a, b) => a.conf - b.conf);
  let trend: Dir | 0 = 0, lastH: Pivot | null = null, lastL: Pivot | null = null, bH = false, bL = false, pi = 0, lastEv: StructureEvent | null = null;
  for (let k = 0; k < n; k++) {
    while (pi < byConf.length && at(byConf, pi).conf <= k) {
      const p = at(byConf, pi++);
      if (p.type === 'H') { lastH = p; bH = false; } else { lastL = p; bL = false; }
    }
    const ck = at(c, k);
    if (lastH && !bH && ck.close > lastH.price) {
      lastEv = { type: trend === -1 ? 'CHoCH' : 'BOS', dir: 1, from: lastH.i, idx: k, price: lastH.price };
      events.push(lastEv); trend = 1; bH = true;
    } else if (lastL && !bL && ck.close < lastL.price) {
      lastEv = { type: trend === 1 ? 'CHoCH' : 'BOS', dir: -1, from: lastL.i, idx: k, price: lastL.price };
      events.push(lastEv); trend = -1; bL = true;
    }
    trendAt[k] = trend; lastEventAt[k] = lastEv;
  }
  return { trendAt, events, lastEventAt };
}

function candlePatterns(c: Candle[], atr: (number | null)[]): PatternKey[][] {
  return c.map((x, i) => {
    const out: PatternKey[] = [], a = atr[i] || (x.high - x.low) || 1e-9;
    const body = Math.abs(x.close - x.open), range = x.high - x.low || 1e-9;
    const upper = x.high - Math.max(x.open, x.close), lower = Math.min(x.open, x.close) - x.low;
    const bull = x.close > x.open, bear = x.close < x.open;
    if (i >= 1) {
      const p = at(c, i - 1), pb = Math.abs(p.close - p.open);
      if (p.close < p.open && bull && x.close >= p.open && x.open <= p.close && body > pb && body > 0.3 * a) out.push('bullEng');
      if (p.close > p.open && bear && x.close <= p.open && x.open >= p.close && body > pb && body > 0.3 * a) out.push('bearEng');
      if (x.high < p.high && x.low > p.low) out.push('inside');
    }
    if (range > 0.6 * a) {
      if (lower >= 2 * body && upper <= 0.25 * range) out.push('hammer');
      if (upper >= 2 * body && lower <= 0.25 * range) out.push('star');
    }
    if (body <= 0.1 * range && range > 0.4 * a && !out.includes('hammer') && !out.includes('star')) out.push('doji');
    if (i >= 2) {
      const a2 = at(c, i - 2), a1 = at(c, i - 1), b2 = Math.abs(a2.close - a2.open), b1 = Math.abs(a1.close - a1.open);
      if (a2.close < a2.open && b2 > 0.6 * a && b1 < 0.4 * b2 && bull && x.close > (a2.open + a2.close) / 2) out.push('morning');
      if (a2.close > a2.open && b2 > 0.6 * a && b1 < 0.4 * b2 && bear && x.close < (a2.open + a2.close) / 2) out.push('evening');
    }
    return out;
  });
}

// TD Sequential setup count (1–9): consecutive closes above/below the close 4 bars earlier.
function tdCount(c: Candle[]): { up: number[]; dn: number[] } {
  const up: number[] = new Array<number>(c.length).fill(0), dn: number[] = new Array<number>(c.length).fill(0);
  for (let i = 4; i < c.length; i++) {
    const ci = at(c, i).close, c4 = at(c, i - 4).close, u = at(up, i - 1), d = at(dn, i - 1);
    up[i] = ci > c4 ? (u >= 9 ? 1 : u + 1) : 0;
    dn[i] = ci < c4 ? (d >= 9 ? 1 : d + 1) : 0;
  }
  return { up, dn };
}

// Support / resistance zones from clustered recent pivots (display only).
function zones(c: Candle[], piv: Pivot[], atr: (number | null)[]): Zone[] {
  const n = c.length; if (!n) return [];
  const lastC = at(c, n - 1);
  const a = atr[n - 1] || (lastC.high - lastC.low);
  const recent = piv.filter((p) => p.i > n - 400).sort((x, y) => x.price - y.price);
  const groups: { m: Pivot[]; mean: number }[] = [];
  for (const p of recent) {
    const g = groups[groups.length - 1];
    if (g && p.price - g.mean <= 0.5 * a) { g.m.push(p); g.mean = g.m.reduce((s, q) => s + q.price, 0) / g.m.length; }
    else groups.push({ m: [p], mean: p.price });
  }
  const last = lastC.close;
  const z: Zone[] = groups.filter((g) => g.m.length >= 2).map((g) => ({
    top: Math.max(...g.m.map((q) => q.price)) + 0.1 * a, bottom: Math.min(...g.m.map((q) => q.price)) - 0.1 * a,
    touches: g.m.length, first: Math.min(...g.m.map((q) => q.i)), last: Math.max(...g.m.map((q) => q.i)),
    kind: g.mean < last ? 'support' : 'resistance', mid: g.mean,
  }));
  const sup = z.filter((x) => x.kind === 'support').sort((x, y) => y.mid - x.mid).slice(0, 4);
  const res = z.filter((x) => x.kind === 'resistance').sort((x, y) => x.mid - y.mid).slice(0, 4);
  return sup.concat(res);
}

function simulate(c: Candle[], k: number, dir: Dir, sl: number, tp: number, maxBars: number): SimResult {
  for (let j = k + 1; j < c.length && j <= k + maxBars; j++) {
    const cj = at(c, j);
    const hitSL = dir === 1 ? cj.low <= sl : cj.high >= sl;
    const hitTP = dir === 1 ? cj.high >= tp : cj.low <= tp;
    if (hitSL) return { res: 'loss', at: j };          // same-bar SL+TP → count as loss (conservative)
    if (hitTP) return { res: 'win', at: j };
  }
  return { res: c.length - 1 >= k + maxBars ? 'expired' : 'open', at: null };
}

const emptyStat = (): Stat => ({ n: 0, w1: 0, w2: 0, l2: 0, open: 0 });
function addStat(st: Stat, s: Signal): void {
  if (s.r2.res === 'open') { st.open++; return; }
  st.n++; if (s.r1.res === 'win') st.w1++;
  if (s.r2.res === 'win') st.w2++; else if (s.r2.res === 'loss') st.l2++;
}
function finishStat(st: Stat, rr2: number): Stat {
  st.wr1 = st.n ? st.w1 / st.n : null; st.wr2 = st.n ? st.w2 / st.n : null;
  st.exp = st.n ? (st.w2 * rr2 - st.l2) / st.n : null; // R per trade at TP2 (expired trades = 0R)
  return st;
}

export function analyze(c: Candle[], opt: AnalyzeOptions = {}): Analysis | null {
  const o = { swingLen: 5, rr1: 1, rr2: 2, maxBars: 100, minSamples: 5, slBuf: 0.2, ...opt };
  const n = c.length;
  if (n < 50) return null;
  const F = (v: number): string => (o.digits != null ? Number(v).toFixed(o.digits) : String(+Number(v).toPrecision(8)));
  const atr = atrArr(c, 14);
  const piv = pivots(c, o.swingLen);
  const sw = swings(c, piv);
  const st = structure(c, piv);
  const pats = candlePatterns(c, atr);
  const td = tdCount(c);
  const zn = zones(c, piv, atr);

  // ---- signals (rule-based setups) ----
  const signals: Signal[] = [];
  const recentL: Pivot[] = [], recentH: Pivot[] = [];
  const byConf = [...piv].sort((a, b) => a.conf - b.conf);
  let pi = 0; const lastSig: Record<Dir, number> = { 1: -99, [-1]: -99 } as Record<Dir, number>;
  for (let k = 30; k < n; k++) {
    while (pi < byConf.length && at(byConf, pi).conf <= k) { const p = at(byConf, pi++); (p.type === 'L' ? recentL : recentH).push(p); }
    const a = atr[k]; if (!a) continue;
    const cand = at(pats, k).filter((p) => PAT[p].dir !== 0).sort((x, y) => PAT[y].rank - PAT[x].rank);
    const pat = cand[0];
    if (!pat) continue;
    const dir = PAT[pat].dir as Dir;
    if (k - lastSig[dir] <= 3) continue;
    const ck = at(c, k), ck1 = at(c, k - 1);
    const extreme = dir === 1 ? Math.min(ck.low, ck1.low) : Math.max(ck.high, ck1.high);
    const pool = (dir === 1 ? recentL : recentH).slice(-8);
    const near = pool.filter((p) => Math.abs(extreme - p.price) <= 0.5 * a).sort((x, y) => y.i - x.i)[0];
    const touches = near ? pool.filter((p) => Math.abs(p.price - near.price) <= 0.5 * a).length : 0;
    const trend = at(st.trendAt, k), ev = at(st.lastEventAt, k);
    let setup: SetupKey | null = null;
    if (trend === dir && near) setup = 'pullback';
    else if (ev && ev.type === 'CHoCH' && ev.dir === dir && k - ev.idx <= 20) setup = 'choch';
    else if (near && touches >= 2) setup = 'sr';
    if (!setup) continue;

    const entry = ck.close;
    const sl = dir === 1 ? Math.min(extreme, near ? near.price : extreme) - o.slBuf * a : Math.max(extreme, near ? near.price : extreme) + o.slBuf * a;
    const risk = Math.abs(entry - sl);
    if (risk < 0.3 * a || risk > 4 * a) continue;
    const tp1 = entry + dir * risk * o.rr1, tp2 = entry + dir * risk * o.rr2;
    const opp = (dir === 1 ? recentH : recentL).slice().reverse().find((p) => (dir === 1 ? p.price > entry : p.price < entry));
    const reasons: string[] = [];
    reasons.push(trend === 1 ? 'โครงสร้างเป็นขาขึ้น (ทำ HH/HL และ BOS ขึ้น)' : trend === -1 ? 'โครงสร้างเป็นขาลง (ทำ LH/LL และ BOS ลง)' : 'ยังไม่มีเทรนด์ชัดเจน');
    if (ev && k - ev.idx <= 20) reasons.push(`${ev.type} ${ev.dir === 1 ? 'ขึ้น' : 'ลง'} เมื่อ ${k - ev.idx} แท่งก่อน`);
    if (near) reasons.push(`ราคากลับมาแตะ Swing ${dir === 1 ? 'Low' : 'High'} เดิมที่ ${F(near.price)}${touches >= 2 ? ` (โซนนี้ถูกทดสอบ ${touches} ครั้ง)` : ''}`);
    reasons.push(`เกิดแท่งเทียน ${PAT[pat].name}`);
    if (opp) reasons.push(`เป้าตามโครงสร้าง: Swing ${dir === 1 ? 'High' : 'Low'} ล่าสุด ${F(opp.price)}`);
    const s: Signal = { idx: k, time: ck.time, dir, setup, pattern: pat, entry, sl, tp1, tp2, tpS: opp ? opp.price : null, risk, reasons,
      r1: simulate(c, k, dir, sl, tp1, o.maxBars), r2: simulate(c, k, dir, sl, tp2, o.maxBars) };
    signals.push(s); lastSig[dir] = k;
  }

  // ---- learning: walk-forward statistics per setup + pattern ----
  for (const s of signals) {
    const key = s.setup + '|' + s.pattern;
    const known = signals.filter((x) => x !== s && x.setup + '|' + x.pattern === key && x.r2.at != null && x.r2.at < s.idx);
    const ps = emptyStat(); known.forEach((x) => addStat(ps, x)); finishStat(ps, o.rr2);
    s.prior = ps;
    s.learned = ps.n >= o.minSamples ? ((ps.exp ?? 0) > 0 ? 'good' : 'bad') : 'unknown';
  }
  const stats: Analysis['stats'] = { all: emptyStat(), learned: emptyStat(), bySetup: {}, byPattern: {}, byCombo: {} };
  for (const s of signals) {
    addStat(stats.all, s);
    if (s.learned === 'good') addStat(stats.learned, s);
    addStat((stats.bySetup[s.setup] ||= emptyStat()), s);
    addStat((stats.byPattern[s.pattern] ||= emptyStat()), s);
    addStat((stats.byCombo[s.setup + '|' + s.pattern] ||= emptyStat()), s);
  }
  [stats.all, stats.learned, ...Object.values(stats.bySetup), ...Object.values(stats.byPattern), ...Object.values(stats.byCombo)].forEach((x) => finishStat(x, o.rr2));

  const lastTrend = at(st.trendAt, n - 1);
  return { n, atr, pivots: piv, swings: sw, events: st.events, trendAt: st.trendAt, lastEvent: at(st.lastEventAt, n - 1),
    lastTrend, patterns: pats, td, zones: zn, signals, stats, opt: o };
}

export { pivots as _pivots, structure as _structure, candlePatterns as _patterns, tdCount as _td };
