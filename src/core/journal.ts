// Trading journal statistics: MT5 deals → closed trades → metrics and breakdowns.
// Pure functions, no DOM. Built to gen/journal.js: window.JOURNAL in the browser, module.exports in Node.
import type { Deal, DealSide } from './mt5-protocol';

export interface Trade {
  pos: number;
  s: string;
  side: 'buy' | 'sell';
  closed: boolean;
  vol: number;
  open: number | null;
  close: number | null;
  openPrice: number | null;
  closePrice: number | null;
  profit: number;
  commission: number;
  swap: number;
  net: number;
  duration: number | null;
  deals: number;
  partial: boolean;
}

export interface Group<K extends string | number = string | number> {
  key: K; net: number; n: number; wins: number; losses: number; lots: number; gross: number; grossLoss: number; winRate: number;
}

export interface BalanceOp { time: number; amount: number; ticket?: number }
export interface CurvePoint { time: number; balance: number; op: boolean; amount: number }
export type Session = 'asia' | 'london' | 'newyork';

export interface Metrics {
  trades: number; wins: number; losses: number; breakeven: number;
  net: number; gross: number; grossLoss: number; winRate: number; profitFactor: number;
  avgWin: number; avgLoss: number; expectancy: number; largestWin: number; largestLoss: number;
  maxConsecWins: number; maxConsecLosses: number; lots: number; commission: number; swap: number;
  maxDrawdown: number; maxDrawdownPct: number; avgHoldSec: number | null;
  bestDay: Group<string> | null; worstDay: Group<string> | null;
  curve: CurvePoint[];
  byDay: Group<string>[]; byWeek: Group<string>[]; byMonth: Group<string>[]; bySymbol: Group<string>[];
  bySide: Group<string>[]; byWeekday: Group<number>[]; byHour: Group<number>[]; bySession: Group<Session>[];
}

export interface StatsOptions { tz?: number; startBalance?: number; balanceOps?: BalanceOp[] }

export interface JournalData {
  sample?: boolean;
  account: { key: string; broker: string; server: string; currency: string; demo: boolean };
  deals: Deal[];
  snapshots: { time: number; balance: number; equity: number }[];
  syncedAt: number;
  from: number;
}

const EPS = 1e-9;
const r2 = (v: number): number => Math.round(v * 100) / 100;
export const net = (d: Pick<Deal, 'profit' | 'commission' | 'swap'>): number => (d.profit || 0) + (d.commission || 0) + (d.swap || 0);

// Group deals by position id into trades. A trade is closed when its closed volume reaches its opened volume
// (partial closes are merged into one trade). A position whose opening deal is older than the stored history
// is still counted (open time/price unknown) — its side is the opposite of the closing deal.
export function trades(deals: Deal[] | null | undefined): Trade[] {
  const byPos = new Map<number, Deal[]>();
  for (const d of deals || []) {
    if (d.side === 'balance') continue;
    const k = d.pos || d.ticket;
    let list = byPos.get(k);
    if (!list) byPos.set(k, (list = []));
    list.push(d);
  }
  const out: Trade[] = [];
  for (const [pos, ds] of byPos) {
    ds.sort((a, b) => a.time - b.time || a.ticket - b.ticket);
    const ins = ds.filter((d) => d.entry === 'in'), outs = ds.filter((d) => d.entry !== 'in');
    const inVol = ins.reduce((s, d) => s + d.vol, 0), outVol = outs.reduce((s, d) => s + d.vol, 0);
    const first = ins[0], firstOut = outs[0], lastOut = outs[outs.length - 1];
    const side: 'buy' | 'sell' = first ? (first.side === 'sell' ? 'sell' : 'buy') : firstOut ? (firstOut.side === 'buy' ? 'sell' : 'buy') : 'buy';
    const vwap = (xs: Deal[]): number | null => { const v = xs.reduce((s, d) => s + d.vol, 0); return v ? xs.reduce((s, d) => s + d.price * d.vol, 0) / v : null; };
    const closed = outs.length > 0 && (ins.length === 0 || outVol >= inVol - EPS);
    const profit = r2(ds.reduce((s, d) => s + (d.profit || 0), 0));
    const commission = r2(ds.reduce((s, d) => s + (d.commission || 0), 0));
    const swap = r2(ds.reduce((s, d) => s + (d.swap || 0), 0));
    const open = first ? first.time : null, close = lastOut ? lastOut.time : null;
    out.push({
      pos, s: ds[0]!.s, side, closed,
      vol: r2(Math.max(inVol, outVol)),
      open, close,
      openPrice: vwap(ins), closePrice: vwap(outs),
      profit, commission, swap,
      net: r2(profit + commission + swap),
      duration: open != null && close != null ? close - open : null,
      deals: ds.length, partial: outs.length > 1,
    });
  }
  return out.sort((a, b) => (a.close || a.open || 0) - (b.close || b.open || 0));
}

// ---- calendar keys in a given timezone offset (seconds east of UTC)
const pad = (n: number): string => String(n).padStart(2, '0');
const local = (t: number, tz: number): Date => new Date((t + tz) * 1000);
export const dayKey = (t: number, tz = 0): string => { const d = local(t, tz); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
export const monthKey = (t: number, tz = 0): string => dayKey(t, tz).slice(0, 7);
export const weekKey = (t: number, tz = 0): string => { const d = local(t, tz), wd = (d.getUTCDay() + 6) % 7; return dayKey(t - wd * 86400, tz); };   // Monday
export const weekday = (t: number, tz = 0): number => (local(t, tz).getUTCDay() + 6) % 7;                    // 0 = Monday
export const hour = (t: number, tz = 0): number => local(t, tz).getUTCHours();
// trading session by the UTC hour the trade was opened
export const session = (t: number): Session => { const h = new Date(t * 1000).getUTCHours(); return h >= 7 && h < 13 ? 'london' : h >= 13 && h < 21 ? 'newyork' : 'asia'; };

export function group<K extends string | number>(ts: Trade[], keyFn: (t: Trade) => K | null | undefined): Group<K>[] {
  const m = new Map<K, Omit<Group<K>, 'winRate'>>();
  for (const t of ts) {
    const k = keyFn(t); if (k == null) continue;
    let g = m.get(k);
    if (!g) m.set(k, (g = { key: k, net: 0, n: 0, wins: 0, losses: 0, lots: 0, gross: 0, grossLoss: 0 }));
    g.net += t.net; g.n++; g.lots += t.vol; if (t.net > 0) { g.wins++; g.gross += t.net; } else if (t.net < 0) { g.losses++; g.grossLoss += -t.net; }
  }
  return [...m.values()].map((g) => ({ ...g, net: r2(g.net), lots: r2(g.lots), gross: r2(g.gross), grossLoss: r2(g.grossLoss), winRate: g.n ? g.wins / g.n : 0 }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

// Metrics for closed trades. opts: { tz, startBalance, balanceOps: [{time, amount}] (deposits/withdrawals) }
export function stats(allTrades: Trade[], opts: StatsOptions = {}): Metrics {
  const tz = opts.tz || 0;
  const ts = allTrades.filter((t) => t.closed);
  const closeOf = (t: Trade): number => t.close ?? 0;
  const startOf = (t: Trade): number => t.open ?? t.close ?? 0;
  const wins = ts.filter((t) => t.net > 0), losses = ts.filter((t) => t.net < 0);
  const gross = wins.reduce((s, t) => s + t.net, 0), grossLoss = -losses.reduce((s, t) => s + t.net, 0);
  const total = gross - grossLoss;
  // closed-trade equity curve (+ deposits/withdrawals as their own steps) and max drawdown
  const ops = (opts.balanceOps || []).map((o) => ({ time: o.time, amount: o.amount, op: true }));
  const evs = [...ts.map((t) => ({ time: closeOf(t), amount: t.net, op: false })), ...ops].sort((a, b) => a.time - b.time);
  let bal = opts.startBalance || 0, peak = bal, maxDD = 0, maxDDpct = 0, perf = 0, perfPeak = 0, balAtPeak = bal;
  const curve: CurvePoint[] = [];
  for (const e of evs) {
    bal += e.amount;
    if (!e.op) {
      perf += e.amount;
      if (perf > perfPeak) { perfPeak = perf; balAtPeak = bal; }
      const dd = perfPeak - perf;
      // % of the account balance at the peak (deposits count as account size, not as profit)
      if (dd > maxDD) { maxDD = dd; maxDDpct = balAtPeak > 0 ? dd / balAtPeak : 0; }
    } else if (perf >= perfPeak) balAtPeak = bal;
    if (bal > peak) peak = bal;
    curve.push({ time: e.time, balance: r2(bal), op: e.op, amount: r2(e.amount) });
  }
  let cw = 0, cl = 0, maxCW = 0, maxCL = 0;
  for (const t of ts) { if (t.net > 0) { cw++; cl = 0; } else if (t.net < 0) { cl++; cw = 0; } maxCW = Math.max(maxCW, cw); maxCL = Math.max(maxCL, cl); }
  const days = group(ts, (t) => dayKey(closeOf(t), tz));
  const durs = ts.filter((t) => t.duration != null).map((t) => t.duration as number);
  const n = ts.length;
  return {
    trades: n, wins: wins.length, losses: losses.length, breakeven: n - wins.length - losses.length,
    net: r2(total), gross: r2(gross), grossLoss: r2(grossLoss),
    winRate: n ? wins.length / n : 0,
    profitFactor: grossLoss > 0 ? gross / grossLoss : gross > 0 ? Infinity : 0,
    avgWin: wins.length ? r2(gross / wins.length) : 0, avgLoss: losses.length ? r2(-grossLoss / losses.length) : 0,
    expectancy: n ? r2(total / n) : 0,
    largestWin: wins.length ? r2(Math.max(...wins.map((t) => t.net))) : 0, largestLoss: losses.length ? r2(Math.min(...losses.map((t) => t.net))) : 0,
    maxConsecWins: maxCW, maxConsecLosses: maxCL,
    lots: r2(ts.reduce((s, t) => s + t.vol, 0)),
    commission: r2(ts.reduce((s, t) => s + t.commission, 0)), swap: r2(ts.reduce((s, t) => s + t.swap, 0)),
    maxDrawdown: r2(maxDD), maxDrawdownPct: maxDDpct,
    avgHoldSec: durs.length ? Math.round(durs.reduce((s, x) => s + x, 0) / durs.length) : null,
    bestDay: days.length ? days.reduce((a, b) => (b.net > a.net ? b : a)) : null,
    worstDay: days.length ? days.reduce((a, b) => (b.net < a.net ? b : a)) : null,
    curve,
    byDay: days,
    byWeek: group(ts, (t) => weekKey(closeOf(t), tz)),
    byMonth: group(ts, (t) => monthKey(closeOf(t), tz)),
    bySymbol: group(ts, (t) => t.s).sort((a, b) => b.net - a.net),
    bySide: group<string>(ts, (t) => t.side),
    byWeekday: group(ts, (t) => weekday(startOf(t), tz)),
    byHour: group(ts, (t) => hour(startOf(t), tz)),
    bySession: group(ts, (t) => session(startOf(t))),
  };
}

export const balanceOps = (deals: Deal[] | null | undefined): Required<BalanceOp>[] => (deals || []).filter((d) => d.side === 'balance').map((d) => ({ time: d.time, amount: net(d), ticket: d.ticket })).sort((a, b) => a.time - b.time);
export const inRange = (deals: Deal[] | null | undefined, from?: number | null, to?: number | null): Deal[] => (deals || []).filter((d) => (from == null || d.time >= from) && (to == null || d.time < to));

// Merge new deals into a stored list (dedupe by ticket, keep time order).
export function merge(stored: Deal[] | null | undefined, incoming: Deal[] | null | undefined): { deals: Deal[]; added: number } {
  const m = new Map<number, Deal>((stored || []).map((d) => [d.ticket, d]));
  let added = 0;
  for (const d of incoming || []) { if (!m.has(d.ticket)) added++; m.set(d.ticket, d); }
  return { deals: [...m.values()].sort((a, b) => a.time - b.time || a.ticket - b.ticket), added };
}

// CSV of closed trades
export function csv(ts: Trade[]): string {
  const iso = (t: number | null): string => (t == null ? '' : new Date(t * 1000).toISOString().replace('T', ' ').slice(0, 19));
  const rows: (string | number)[][] = [['position', 'symbol', 'side', 'lots', 'open_time_utc', 'open_price', 'close_time_utc', 'close_price', 'profit', 'commission', 'swap', 'net']];
  for (const t of ts.filter((x) => x.closed)) rows.push([t.pos, t.s, t.side, t.vol, iso(t.open), t.openPrice ?? '', iso(t.close), t.closePrice ?? '', t.profit, t.commission, t.swap, t.net]);
  return rows.map((r) => r.map((v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v)).join(',')).join('\n') + '\n';
}

// Sample account for the "ดูตัวอย่าง" preview: deterministic (seeded), ~4 months of gold/forex trades.
export function sample(seed = 7, now = Math.floor(Date.now() / 1000), days = 120): JournalData {
  let x = seed >>> 0 || 1;
  const rnd = (): number => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
  const deals: Deal[] = [], start = now - days * 86400;
  let tk = 1000, pos = 500;
  deals.push({ ticket: tk++, pos: 0, s: '', side: 'balance', entry: 'in', vol: 0, price: 0, profit: 1000, commission: 0, swap: 0, time: start - 3600 });
  const SY: [string, number, number, number][] = [['XAUUSD', 2, 3300, 0.62], ['XAUUSD', 2, 3300, 0.62], ['XAUUSD', 2, 3300, 0.62], ['EURUSD', 5, 1.08, 0.55], ['GBPUSD', 5, 1.27, 0.5], ['USDJPY', 3, 150, 0.52]];
  const VOLS = [0.01, 0.02, 0.03, 0.05, 0.1];
  for (let d = 0; d < days; d++) {
    const day0 = start + d * 86400, wd = new Date(day0 * 1000).getUTCDay();
    if (wd === 0 || wd === 6) continue;
    if (d === 45) deals.push({ ticket: tk++, pos: 0, s: '', side: 'balance', entry: 'in', vol: 0, price: 0, profit: 500, commission: 0, swap: 0, time: day0 + 3 * 3600 });
    const n = Math.floor(rnd() * 4);
    for (let i = 0; i < n; i++) {
      const [s, dg, base, wr] = SY[Math.floor(rnd() * SY.length)]!;
      const side: DealSide = rnd() < 0.55 ? 'buy' : 'sell', vol = VOLS[Math.floor(rnd() * 5)]!;
      const back: DealSide = side === 'buy' ? 'sell' : 'buy';
      const open = day0 + Math.floor((1 + rnd() * 20) * 3600), dur = Math.floor(600 + rnd() * 6 * 3600);
      const win = rnd() < wr, risk = vol * 100 * (s === 'XAUUSD' ? 6 : 0.8) * (0.6 + rnd());
      const pl = Math.round((win ? risk * (1 + rnd() * 1.4) : -risk) * 100) / 100;
      const px = base * (1 + (rnd() - 0.5) * 0.02), p = pos++;
      const move = (pl / (vol * (s === 'XAUUSD' ? 100 : s === 'USDJPY' ? 670 : 100000))) * (side === 'buy' ? 1 : -1);
      const comm = -Math.round(vol * 7 * 100) / 100 / 2;
      deals.push({ ticket: tk++, pos: p, s, side, entry: 'in', vol, price: +px.toFixed(dg), profit: 0, commission: comm, swap: 0, time: open });
      if (rnd() < 0.15 && vol >= 0.02) {        // partial close
        const v1 = Math.round(vol / 2 * 100) / 100;
        deals.push({ ticket: tk++, pos: p, s, side: back, entry: 'out', vol: v1, price: +(px + move).toFixed(dg), profit: Math.round(pl * v1 / vol * 100) / 100, commission: comm / 2, swap: 0, time: open + Math.floor(dur / 2) });
        deals.push({ ticket: tk++, pos: p, s, side: back, entry: 'out', vol: Math.round((vol - v1) * 100) / 100, price: +(px + move).toFixed(dg), profit: Math.round(pl * (vol - v1) / vol * 100) / 100, commission: comm / 2, swap: 0, time: open + dur });
      } else {
        const swap = dur > 20 * 3600 ? -Math.round(vol * 4 * 100) / 100 : 0;
        deals.push({ ticket: tk++, pos: p, s, side: back, entry: 'out', vol, price: +(px + move).toFixed(dg), profit: pl, commission: comm, swap, time: open + dur });
      }
    }
  }
  const ts = trades(deals), st = stats(ts, { balanceOps: balanceOps(deals) });
  const last = st.curve[st.curve.length - 1];
  const bal = last ? last.balance : 1000;
  return { sample: true, account: { key: 'sample', broker: 'ตัวอย่าง (Demo data)', server: 'Sample-Server', currency: 'USD', demo: true }, deals: deals.filter((d) => d.time <= now),
    snapshots: [{ time: now, balance: bal, equity: r2(bal + 12.4) }], syncedAt: now, from: start };
}
