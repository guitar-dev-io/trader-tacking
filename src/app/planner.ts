import { def } from '../pt';
import { view } from '../state';
import { MM } from '../legacy/core';
import { $, DOWN, S, TC, UP, digits, fmt, store, qs } from './app-core';
import { activeSignal } from './app-analysis';
import { el, label, yOf } from '../ui/overlay';
import { mount, flushSync } from 'svelte';
import Planner from '../ui/tabs/Planner.svelte';
import { plannerTick } from '../ui/tabs/planner-view';
import { ui } from '../ui/registry';
def({ savePlan: [() => savePlan], computePlan: [() => computePlan], renderPlanner: [() => renderPlanner] });
// Position & scale-in calculator ("คำนวณ" tab): lot size from risk, add-on (เติมไม้) levels, average price,
// loss at SL, profit at TP, and the plan drawn on the chart.

S.plan = { balance: 1000, riskMode: 'pct', risk: 1, side: 'buy', entry: '', sl: '', tp1: '', tp2: '', vpp: '', lotStep: 0.01, minLot: 0.01,
  adds: 0, spacing: '', mode: 'avg', weight: 'equal', mult: 1.5, show: true, trail: 'none', account: 'auto', ...store.get('plan', {}) };
const savePlan = () => store.set('plan', S.plan);
// broker "point" = smallest price step (XAUUSD 2 digits → 0.01, so 1000 points = 10.00)
const pointSize = () => 10 ** -digits();
const toPts = (d: number) => Math.round(Math.abs(d) / pointSize());

// Contract size per 1.0 lot (typical; check your broker's contract specification)
function contractSize(sym: string) {
  sym = String(sym || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6);   // broker suffixes: XAUUSDc, EURUSD.m, XAUUSDbrex.
  if (/^XAU/.test(sym)) return 100;
  if (/^XAG/.test(sym)) return 5000;
  if (/^(XPT|XPD)/.test(sym)) return 100;
  if (/^(BTC|ETH|SOL|LTC|XRP|BNB|ADA|DOGE)/.test(sym)) return 1;
  if (/^[A-Z]{6}$/.test(sym)) return 100000;
  return 1;
}
// Converts a P/L amount in the symbol's quote currency to USD (account currency assumed USD)
function quoteToUSD(sym: string) {
  if (!/^[A-Z]{6,7}$/.test(sym)) return 1;
  const quote = sym.slice(-3), base = sym.slice(0, 3);
  if (quote === 'USD' || quote === 'UST') return 1;
  const q = S.quotes[sym];
  if (base === 'USD' && q) return 1 / q.bid;
  const direct = S.quotes[quote + 'USD'], inv = S.quotes['USD' + quote];
  if (direct) return direct.bid;
  if (inv) return 1 / inv.bid;
  return null;
}
// USD value of a 1.0 price move for 1.0 lot
function autoVpp(sym: any) { const c = quoteToUSD(sym); return c == null ? null : contractSize(sym) * c; }
function vpp() { const v = parseFloat(S.plan.vpp); return isFinite(v) && v > 0 ? v : autoVpp(S.symbol); }
// Account type: standard (USD) or cent (USC). Cent: balance and risk in USC, lots in cent lots (1.00 cent lot = 0.01 lot).
// The formulas stay the same when money is counted in USC: gold 1.00 cent lot = 1 USC per point, like 1.00 lot = $1.
// 'auto' guesses from the symbol suffix (XAUUSDc, EURUSD.c, …cent).
const isCentAcct = () => S.plan.account === 'cent' || (S.plan.account !== 'std' && typeof MM !== 'undefined' && MM.isCentSymbol(S.symbol));
const CUR = () => (isCentAcct() ? 'USC' : 'USD');
const floorStep = (x: number, step: number) => Math.floor(x / step + 1e-9) * step;
const lotFmt = (x: number, step: number) => x.toFixed(Math.max(0, -Math.floor(Math.log10(step))));
const money = (v: number | null | undefined) => {
  if (v == null || !isFinite(v)) return '—';
  const a = Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  return (v < 0 ? '-' : '') + (isCentAcct() ? a + ' USC' : '$' + a);
};
function riskAmount() { const p = S.plan; return p.riskMode === 'pct' ? (+p.balance * +p.risk) / 100 : +p.risk; }

// lot for a single entry (used by the Long/Short drawing tool)
function plannerLot(entry: number, sl: number) {
  const v = vpp(); const dist = Math.abs(entry - sl); if (!v || !dist) return null;
  const lot = floorStep(riskAmount() / (dist * v), +S.plan.lotStep || 0.01);
  return lot >= (+S.plan.minLot || 0.01) ? lotFmt(lot, +S.plan.lotStep || 0.01) : null;
}

/** one entry of the calculator table (main entry + scale-in adds) */
export interface PlanLevel { i: number; price: number; w: number; lot?: number }
export interface PlanRow extends PlanLevel { lot: number; cumLot: number; avg: number | null; slLoss: number | null; trailSL: number | null; trailPnl: number | null; tp1: number | null; tp2: number | null; dist: number }
export interface PlanResult { warn: string[]; rows: PlanRow[]; totalLot?: number; avg?: number | null; maxLoss?: number | null; v?: number; spacing?: number; risk?: number; firstOnly?: PlanRow; error?: string; err?: string }
function computePlan(): PlanResult {
  const p = S.plan, dir = p.side === 'buy' ? 1 : -1;
  const entry = parseFloat(p.entry), sl = parseFloat(p.sl), tp1 = parseFloat(p.tp1), tp2 = parseFloat(p.tp2);
  const out: PlanResult = { warn: [], rows: [] };
  if (!isFinite(entry) || !isFinite(sl)) { out.warn.push('ใส่ราคาเข้าและ SL ก่อน'); return out; }
  if ((entry - sl) * dir <= 0) { out.warn.push(p.side === 'buy' ? 'Buy: SL ต้องต่ำกว่าราคาเข้า' : 'Sell: SL ต้องสูงกว่าราคาเข้า'); return out; }
  const v = vpp(); if (!v) { out.warn.push('คำนวณมูลค่าต่อจุดอัตโนมัติไม่ได้ (คู่เงินข้ามสกุล) — ใส่ "มูลค่า 1.0 ราคา ต่อ 1 lot (USD)" เอง หรือเพิ่มคู่ ???USD ใน watchlist'); return out; }
  const step = +p.lotStep || 0.01, minLot = +p.minLot || 0.01, adds = Math.max(0, Math.min(20, parseInt(p.adds, 10) || 0));
  const slDist = Math.abs(entry - sl);
  let spacing = parseFloat(p.spacing);
  if (!isFinite(spacing) || spacing <= 0) spacing = adds ? slDist / (adds + 1) : 0;
  const levels: PlanLevel[] = [];
  for (let i = 0; i <= adds; i++) {
    const price = p.mode === 'avg' ? entry - dir * i * spacing : entry + dir * i * spacing;
    if (p.mode === 'avg' && (price - sl) * dir <= 0) { out.warn.push(`ไม้ที่ ${i + 1} (${fmt(price)}) เลย SL แล้ว — ตัดออก (ลดจำนวนไม้หรือระยะเติม)`); break; }
    if (p.mode === 'pyramid' && isFinite(tp2) && (price - tp2) * dir >= 0) { out.warn.push(`ไม้ที่ ${i + 1} เลย TP2 แล้ว — ตัดออก`); break; }
    levels.push({ i, price, w: p.weight === 'mult' ? (+p.mult || 1) ** i : p.weight === 'down' ? (+p.mult || 1) ** (adds - i) : 1 });
  }
  const risk = riskAmount();
  const denom = levels.reduce((s, L) => s + L.w * Math.abs(L.price - sl) * v, 0);
  const base = risk / denom;
  let cumLot = 0, cumCost = 0;
  for (const L of levels) {
    const lot = L.lot = floorStep(base * L.w, step);
    if (L.lot < minLot) { out.warn.push(`ไม้ที่ ${L.i + 1} ได้ ${lotFmt(base * L.w, 0.0001)} lot ต่ำกว่าขั้นต่ำ ${minLot} — เพิ่มทุน/ความเสี่ยง หรือลดจำนวนไม้`); L.lot = 0; }
    cumLot += lot; cumCost += lot * L.price;
    const avg = cumLot ? cumCost / cumLot : null;
    const pnl = (target: number) => (isFinite(target) && cumLot && avg != null ? (target - avg) * dir * cumLot * v : null);
    // pyramid (เข้าต่อ): after adding, SL of the whole position is usually trailed up
    let trailSL: number | null = null;
    if (p.mode === 'pyramid' && L.i > 0 && p.trail !== 'none') trailSL = p.trail === 'be' ? avg : levels[L.i - 1].price;
    out.rows.push({ ...L, lot, cumLot, avg, slLoss: pnl(sl), trailSL, trailPnl: trailSL != null ? pnl(trailSL) : null, tp1: pnl(tp1), tp2: pnl(tp2), dist: (L.price - entry) * dir });
  }
  const last = out.rows[out.rows.length - 1];
  out.totalLot = cumLot; out.avg = last && last.avg; out.maxLoss = last && last.slLoss; out.v = v; out.spacing = spacing; out.risk = risk;
  out.firstOnly = out.rows[0];
  if (p.mode === 'avg' && adds) out.warn.push('การเติมไม้เฉลี่ยต้นทุน (สวนทาง) จะเพิ่มขนาดสถานะตอนราคาวิ่งผิดทาง — ต้องตั้ง SL รวมเสมอ ห้ามเลื่อน SL ออก');
  if (p.mode === 'pyramid' && adds && p.trail === 'none') out.warn.push('Pyramid: ปกติควรเลื่อน SL ตามขึ้นมาเมื่อเติมไม้ — เลือก "เลื่อน SL เมื่อเข้าต่อ" เพื่อดูผลแบบเลื่อน SL (ตาราง "โดน SL" ยังเป็นกรณีแย่สุดเสมอ)');
  if (out.maxLoss != null && Math.abs(out.maxLoss) > +p.balance * 0.05) out.warn.push(`ขาดทุนสูงสุด ${money(out.maxLoss)} เกิน 5% ของทุน`);
  return out;
}

// the tab UI is src/ui/tabs/Planner.svelte; renderPlanner() re-renders it (after outside changes to S.plan)
function renderPlanner() { plannerTick.update((n) => n + 1); flushSync(); }

// fill from a Long/Short drawing (double-click it)
function plannerFrom(d: { pts: { price: any; }[]; rr: number; type: string; }) {
  const e = d.pts[0].price, sl = d.pts[1].price, rr = d.rr || 2;
  Object.assign(S.plan, { side: d.type === 'long' ? 'buy' : 'sell', entry: fmt(e), sl: fmt(sl), tp1: fmt(e + (e - sl)), tp2: fmt(e + (e - sl) * rr) });
  savePlan(); renderPlanner(); view.dirty = true;
  qs('#tabs [data-tab="calc"]').click();
}

function drawPlanner(W: number) {
  if (!S.plan.show || $('tab-calc').classList.contains('hidden')) return;
  const r = computePlan(); if (!r.rows.length) return;
  const line = (price: number, color: string, text: string, dash?: string) => { const y = yOf(price); if (y == null) return; el('line', { x1: W * 0.55, y1: y, x2: W, y2: y, stroke: color, 'stroke-width': 1.2, 'stroke-dasharray': dash || '' }); label(W * 0.55, y + 4, text, color, '#fff', 'end'); };
  const step = +S.plan.lotStep || 0.01;
  line(parseFloat(S.plan.sl), DOWN, `SL ${fmt(parseFloat(S.plan.sl))}`);
  if (isFinite(parseFloat(S.plan.tp1))) line(parseFloat(S.plan.tp1), '#1e7d74', `TP1 ${fmt(parseFloat(S.plan.tp1))}`, '4 3');
  if (isFinite(parseFloat(S.plan.tp2))) line(parseFloat(S.plan.tp2), UP, `TP2 ${fmt(parseFloat(S.plan.tp2))}`);
  r.rows.forEach((x) => line(x.price, '#2962ff', `${x.i ? 'เติม #' + (x.i + 1) : 'Entry'} ${lotFmt(x.lot, step)} lot`, x.i ? '5 4' : ''));
  if (r.rows.length > 1 && r.avg != null) line(r.avg, TC().fg, `เฉลี่ย ${fmt(r.avg)}`, '2 3');
}

ui.planner = { save: savePlan, render: renderPlanner, lot: (e, sl) => plannerLot(e, sl), from: (d) => plannerFrom(d), draw: (W) => drawPlanner(W) };
mount(Planner, { target: $('planner'), props: { api: { computePlan, autoVpp, contractSize, isCentAcct, CUR, money, lotFmt, pointSize, toPts, savePlan, activeSignal,
  changed: () => { renderPlanner(); view.dirty = true; } } } });
qs('#tabs [data-tab="calc"]').addEventListener('click', () => { renderPlanner(); view.dirty = true; });
export { autoVpp, computePlan, isCentAcct, plannerLot, renderPlanner, savePlan, vpp };
