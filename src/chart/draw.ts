// Drawing tools (TradingView-style), zoom bar, bottom bar (ranges / timezone / sessions / scale), chart settings.
// Phase 5a: typed module (was draw.js). Canvas/SVG drawing stays imperative; the drawings array lives in
// ./drawings.ts, chart prefs (FIB levels, candle colours, timezone) change through app-core setters, and the
// modules loaded later (news, MTF, trade sim, calculator) are reached through the UI registry instead of PT.
import { def } from '../pt';
import { ui } from '../ui/registry';
import { view } from '../state';
import { ICON } from '../app/icons';
import { $, DOWN, FIB, FIBX, FIBX_DEF, FIB_DEF, FIB_PRESETS, FIB_PRESET_REVERSE, FIB_REVERSE, S, TC, THEME, TZ, UP, digits, esc, fibColor, fmt, store, tf, zoneOffsetSec, setFib, setFibX, setFibReverse, setCandleColors, setTZ, qs, qsa, tgt, mk } from '../app/app-core';
import { buildIndicators, buildMain, chart, main } from './chart';
import { addAlert, loadChart } from '../app/app-data';
import { el, label, logicalToTime, lToX, resetLabels, svg, timeToLogical, txt, yOf } from '../ui/overlay';
import { drawAnalysis } from './analysis-overlay';
import { renderTfs } from '../app/app';
import { TXT } from './text-tools';
import { chartHooks, onChartEvent } from './hooks';
import { drawings, drawingsKey, saveDrawings, setDrawings } from './drawings';
import type { DPoint, Drawing, DrawingKind, LegacyDrawing, ToolDef, ToolKind } from './types';


type N = number | null;
/** a chart point under the mouse: time/price + pixels + logical bar index */
export interface Pt extends DPoint { x: number; y: number; l: number }
/** a drag handle of a drawing (k = point index, -1 = position TP) */
export interface Handle { x: number; y: number; k: number }
export interface PosLevels { e: number; sl: number; tp: number; rr: number }
/** a shape being drawn (preview before the last click): like a Drawing without an id */
type Draft = Drawing;   // preview shapes get id 0 (never stored)
interface Drag { i: number; k?: number | null; box?: { dx: number; dy: number; x0: number; y0: number }; l0?: number; p0?: number; orig?: DPoint[]; rr0?: number; moved: boolean }
export interface Session { name: string; zone: string; open: string; close: string; color: string; on: boolean }

// Drawing tools (TradingView-style), zoom bar, bottom bar (ranges / timezone / sessions / scale), chart settings.

// ---------------------------------------------------------------- tool catalogue
const TOOLS: Record<ToolKind, ToolDef> = {
  cursor: { icon: 'cursor', name: 'Cursor', n: 0, key: 'Esc' },
  trend: { icon: 'trend', name: 'เส้นเทรนด์ (Trend line)', n: 2, key: 'T' },
  ray: { icon: 'ray', name: 'Ray (ยืดไปขวา)', n: 2, key: 'R' },
  hline: { icon: 'hline', name: 'เส้นแนวนอน', n: 1, key: 'H' },
  vline: { icon: 'vline', name: 'เส้นแนวตั้ง', n: 1, key: 'V' },
  channel: { icon: 'channel', name: 'Parallel channel (3 คลิก)', n: 3, key: 'C' },
  fib: { icon: 'fib', name: 'Fibonacci retracement (ย่อตัว)', n: 2, key: 'F' },
  fibext: { icon: 'fibext', name: 'Fibonacci extension (เป้า 161.8 / 261.8) · 3 คลิก', n: 3, key: 'G' },
  rect: { icon: 'rect', name: 'กรอบโซน (Rectangle)', n: 2, key: 'B' },
  brush: { icon: 'brush', name: 'ปากกา (Brush)', n: -1, key: 'P' },
  long: { icon: 'long', name: 'Long position (Entry → SL)', n: 2, key: 'L' },
  short: { icon: 'short', name: 'Short position (Entry → SL)', n: 2, key: 'S' },
  text: { icon: 'text', name: 'ข้อความ', n: 1, key: 'X' },
  callout: { icon: 'callout', name: 'โน้ตชี้จุด (Callout)', n: 1, key: 'N' },
  arrowUp: { icon: 'arrowUp', name: 'ลูกศรขึ้น', n: 1 },
  arrowDown: { icon: 'arrowDown', name: 'ลูกศรลง', n: 1 },
  measure: { icon: 'measure', name: 'วัดระยะ (Measure)', n: 2, key: 'M' },
  alert: { icon: 'alert', name: 'ตั้งแจ้งเตือนราคา', n: 1, key: 'A' },
};
const GROUPS: ToolKind[][] = [['cursor'], ['trend', 'ray', 'hline', 'vline', 'channel'], ['fib', 'fibext'], ['rect', 'brush'], ['long', 'short'], ['text', 'callout', 'arrowUp', 'arrowDown'], ['measure'], ['alert']];
const groupSel: ToolKind[] = store.get('groupSel', GROUPS.map((g) => g[0]));
GROUPS.forEach((g, i) => { if (!g.includes(groupSel[i])) groupSel[i] = g[0]; });
S.locked = store.get('locked', false);
S.hidden = false;
S.pts = [];          // points collected for the drawing in progress
let hist: string[] = [], redoStack: string[] = [];

// ---------------------------------------------------------------- data
let _uid = Date.now();
const uid = () => ++_uid;
function normalize(d: Drawing | LegacyDrawing): Drawing {
  if ('pts' in d && d.pts) return d as Drawing;
  const o = d as LegacyDrawing;
  if (o.type === 'hline') return { id: uid(), type: 'hline', pts: [{ time: 0, price: o.price as number }], color: '#f5a623' };
  return { id: uid(), type: o.type as DrawingKind, pts: [o.p1 as DPoint, o.p2 as DPoint], color: o.color || '#2962ff' };
}
function loadDrawings(): Drawing[] { hist = []; redoStack = []; return store.get<(Drawing | LegacyDrawing)[]>(drawingsKey(), []).map(normalize); }
setDrawings(loadDrawings());
function pushHistory(): void { hist.push(JSON.stringify(drawings)); if (hist.length > 100) hist.shift(); redoStack = []; }
function undo(): void { if (!hist.length) return; redoStack.push(JSON.stringify(drawings)); setDrawings(JSON.parse(hist.pop() as string)); S.selected = null; saveDrawings(); view.dirty = true; }
function redo(): void { if (!redoStack.length) return; hist.push(JSON.stringify(drawings)); setDrawings(JSON.parse(redoStack.pop() as string)); S.selected = null; saveDrawings(); view.dirty = true; }
// white/near-white user colors are drawn in the theme's ink color on the light theme
const inkColor = (c?: string): string => { c = c || '#ffffff'; return /^#f{3}(f{3})?$/i.test(c) && THEME.get() === 'light' ? TC().fg : c; };
const DEFAULT_COLOR: Partial<Record<ToolKind, string>> = { hline: '#f5a623', vline: '#9aa0ad', text: '#ffffff', arrowUp: '#26a69a', arrowDown: '#ef5350', brush: '#f5a623' };

// ---------------------------------------------------------------- toolbar
function buildToolbar(): void {
  const tb = $('tools');
  const btn = (name: ToolKind, cls = '') => `<button data-tool="${name}" class="${cls}" title="${TOOLS[name].name}${TOOLS[name].key ? ' (' + TOOLS[name].key + ')' : ''}">${ICON.svg(TOOLS[name].icon)}</button>`;
  let h = '';
  GROUPS.forEach((g, gi) => {
    const cur = groupSel[gi];
    h += `<div class="tg" data-g="${gi}">${btn(cur, S.tool === cur ? 'active' : '')}${g.length > 1 ? '<span class="more"></span>' : ''}</div>`;
  });
  h += '<div class="sep"></div>';
  h += `<div class="tg"><button id="t-magnet" class="${S.magnet ? 'on' : ''}" title="Magnet: ดูดเข้าราคา OHLC">${ICON.svg('magnet')}</button></div>`;
  h += `<div class="tg"><button id="t-lock" class="${S.locked ? 'on' : ''}" title="ล็อกรูปวาด (กันลาก/ลบโดยไม่ตั้งใจ)">${ICON.svg(S.locked ? 'lock' : 'unlock')}</button></div>`;
  h += `<div class="tg"><button id="t-hide" class="${S.hidden ? 'on' : ''}" title="ซ่อน/แสดงรูปวาด">${ICON.svg(S.hidden ? 'eyeOff' : 'eye')}</button></div>`;
  h += `<div class="tg"><button id="t-layers" title="รายการรูปวาด (Object tree)">${ICON.svg('layers')}</button></div>`;
  h += `<div class="tg"><button id="t-clear" title="ลบรูปวาดทั้งหมด">${ICON.svg('trash')}</button></div>`;
  tb.innerHTML = h;

  tb.querySelectorAll('.tg[data-g]').forEach((g: HTMLElement) => {
    const gi = +(g.dataset.g as string), group = GROUPS[gi];
    (g.querySelector('button') as HTMLButtonElement).onclick = (e: MouseEvent) => {
      e.stopPropagation();
      if (group.length === 1) return setTool(group[0]);
      if (g.querySelector('.fly')) { closeFly(); return; }
      closeFly();
      const fly = mk('div'); fly.className = 'fly';
      fly.innerHTML = group.map((t) => `<button data-t="${t}">${ICON.svg(TOOLS[t].icon, 18)} ${TOOLS[t].name}<small>${TOOLS[t].key || ''}</small></button>`).join('');
      fly.querySelectorAll('button').forEach((b) => (b.onclick = (ev) => { ev.stopPropagation(); groupSel[gi] = b.dataset.t as ToolKind; store.set('groupSel', groupSel); closeFly(); setTool(b.dataset.t as ToolKind); }));
      g.appendChild(fly);
    };
  });
  $('t-magnet').onclick = () => { S.magnet = !S.magnet; store.set('magnet', S.magnet); $('magnet').checked = S.magnet; buildToolbar(); };
  $('t-lock').onclick = () => { S.locked = !S.locked; store.set('locked', S.locked); buildToolbar(); };
  $('t-hide').onclick = () => { S.hidden = !S.hidden; S.selected = null; buildToolbar(); view.dirty = true; };
  $('t-layers').onclick = (e: MouseEvent) => { e.stopPropagation(); toggleLayers(); };
  $('t-clear').onclick = () => { if (!drawings.length || S.locked) return; pushHistory(); setDrawings([]); S.selected = null; saveDrawings(); view.dirty = true; renderLayers(); };
}
function closeFly(): void { qsa('#tools .fly').forEach((f) => f.remove()); }
document.addEventListener('click', (e) => { const t = tgt(e) as Element; if (!t.closest('#tools')) closeFly(); if (!t.closest('#layers-pop') && !t.closest('#t-layers')) $('layers-pop').classList.add('hidden'); });

const toolListeners: ((t: ToolKind) => void)[] = [];
/** called after every tool change (toolbar, keys, back to cursor after a drawing) — e.g. the mobile tool pill */
function onToolChange(cb: (t: ToolKind) => void): void { toolListeners.push(cb); }
function setTool(t: ToolKind): void {
  S.tool = t; S.pending = null; S.pts = []; S.measure = null; TXT.close();
  const gi = GROUPS.findIndex((g) => g.includes(t)); if (gi >= 0 && groupSel[gi] !== t) { groupSel[gi] = t; store.set('groupSel', groupSel); }
  buildToolbar();
  const drawing = t !== 'cursor';
  $('chart').classList.toggle('crosshair-tool', drawing);
  $('chart-wrap').style.touchAction = drawing ? 'none' : '';
  chart.applyOptions({ handleScroll: !drawing, handleScale: !drawing });
  const hints: Partial<Record<ToolKind, string>> = { hline: 'คลิกที่ราคาเพื่อวางเส้นแนวนอน', vline: 'คลิกเพื่อวางเส้นแนวตั้ง', trend: 'คลิก 2 จุดเพื่อวาดเส้นเทรนด์', ray: 'คลิก 2 จุด เส้นจะยืดไปทางขวา',
    channel: 'คลิก 2 จุดเป็นเส้นหลัก แล้วคลิกจุดที่ 3 เพื่อกำหนดความกว้างช่อง', fib: 'คลิกจุดเริ่ม (100%) แล้วจุดจบ (0%)', fibext: 'คลิก 3 จุด: ① จุดเริ่มขา ② ปลายขา ③ จุดย่อ → ได้เป้า 100% / 161.8% / 261.8% จากจุดย่อ', rect: 'คลิก 2 มุมเพื่อวาดกรอบโซน',
    brush: 'กดค้างแล้วลากเพื่อวาด', long: 'คลิกจุด Entry แล้วคลิกระดับ SL (TP ตั้งที่ 2R ลากปรับได้)', short: 'คลิกจุด Entry แล้วคลิกระดับ SL (TP ตั้งที่ 2R ลากปรับได้)',
    text: 'คลิกตรงที่ต้องการแล้วพิมพ์ข้อความ (Enter = ขึ้นบรรทัดใหม่ · Ctrl/⌘+Enter = บันทึก)', callout: 'คลิกจุดที่ต้องการชี้ แล้วพิมพ์ข้อความ — ลากกล่องข้อความไปวางที่อื่นได้', arrowUp: 'คลิกเพื่อวางลูกศร', arrowDown: 'คลิกเพื่อวางลูกศร',
    measure: 'คลิก 2 จุดเพื่อวัดระยะ', alert: 'คลิกที่ราคาเพื่อตั้งแจ้งเตือน',
    cursor: S.locked ? 'รูปวาดถูกล็อกอยู่' : 'คลิกรูปวาดเพื่อเลือก · ลากเพื่อย้าย · ลากจุดปลายเพื่อปรับ · Delete = ลบ' };
  $('hint').textContent = hints[t] || '';
  view.dirty = true;
  for (const cb of toolListeners) { try { cb(t); } catch (e: any) { console.error('tool listener', e); } }
}

// ---------------------------------------------------------------- geometry helpers
const xOfT = (t: number): number | null => { const l = timeToLogical(t); return l == null ? null : lToX(chart.timeScale(), l); };
let _cw = $('chart').clientWidth, _ch = $('chart').clientHeight;   // cached: reading clientWidth every frame forces a re-layout
const chartW = (): number => _cw - chart.priceScale('right').width();
const paneH = (): number => (chart.panes()[0] ? chart.panes()[0].getHeight() : _ch);
function mousePos(ev: MouseEvent | PointerEvent): { x: number; y: number } { const r = $('chart').getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; }
function pointAt(x: number, y: number, snap = true): Pt | null {
  if (!main || !S.candles.length) return null;
  let l = chart.timeScale().coordinateToLogical(x); if (l == null) return null;
  l = Math.round(l);
  let price = main.coordinateToPrice(y); if (price == null) return null;
  if (snap && S.magnet) {
    const bar = S.candles[Math.max(0, Math.min(S.candles.length - 1, l))];
    if (bar) { let best: number | null = null, bd = 18; for (const v of [bar.open, bar.high, bar.low, bar.close]) { const yv = yOf(v); if (yv == null) continue; const d = Math.abs(yv - y); if (d < bd) { bd = d; best = v; } } if (best != null) price = best; }
  }
  return { time: logicalToTime(l) as number, price, x, y, l };
}
function distToSeg(px: number, py: number, x1: N, y1: N, x2: N, y2: N): number {
  if (x1 == null || y1 == null || x2 == null || y2 == null) return Infinity;
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
function fmtTime(t: number): string { const d = new Date(t * 1000), p = (n: number) => String(n).padStart(2, '0'); return `${d.getUTCDate()}/${d.getUTCMonth() + 1} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`; }
function posLevels(d: Drawing): PosLevels {
  const e = d.pts[0].price, sl = d.pts[1].price, rr = d.rr || 2;
  return { e, sl, tp: e + (e - sl) * rr * 1, rr };
}
function rayEnd(x1: N, y1: N, x2: N, y2: N, W: number): [number, number] {
  if (x1 == null || y1 == null || x2 == null || y2 == null) return [NaN, NaN]; if (x2 === x1) return [x2, y2]; const ex = x2 > x1 ? W : 0; return [ex, y1 + ((y2 - y1) * (ex - x1)) / (x2 - x1)]; }
function channelOffset(d: Drawing): number {
  const [a, b, c] = d.pts; if (!c) return 0;
  const la = timeToLogical(a.time) as number, lb = timeToLogical(b.time) as number, lc = timeToLogical(c.time) as number;
  const priceOnLine = lb === la ? a.price : a.price + ((b.price - a.price) * (lc - la)) / (lb - la);
  return c.price - priceOnLine;
}

// handles (for dragging): [{x, y, k}] k = point index, -1 = position TP
function handles(d: Drawing): Handle[] {
  if (d.type === 'hline') { const y = yOf(d.pts[0].price); return y == null ? [] : [{ x: chartW() - 40, y, k: 0 }]; }
  if (d.type === 'vline') { const x = xOfT(d.pts[0].time); return x == null ? [] : [{ x, y: paneH() / 2, k: 0 }]; }
  const hs: { x: N; y: N; k: number }[] = d.pts.map((p, k) => ({ x: xOfT(p.time), y: yOf(p.price), k }));
  if (d.type === 'channel' && d.pts.length === 3) { const off = channelOffset(d); hs[2] = { x: ((hs[0].x as number) + (hs[1].x as number)) / 2, y: yOf((d.pts[0].price + d.pts[1].price) / 2 + off), k: 2 }; }
  if (d.type === 'long' || d.type === 'short') { const L = posLevels(d); hs.push({ x: hs[0].x, y: yOf(L.tp), k: -1 }); hs[1] = { x: hs[1].x, y: yOf(L.sl), k: 1 }; }
  return hs.filter((h): h is Handle => h.x != null && h.y != null);
}

// ---------------------------------------------------------------- render
function renderDrawing(d: Drawing | Draft, sel: boolean, W: number, H: number): void {
  const col = sel ? TC().sel : inkColor(d.color || DEFAULT_COLOR[d.type as ToolKind] || '#2962ff'), sw = sel ? 2.2 : 1.5;
  const P0 = d.pts.map((p) => ({ x: xOfT(p.time), y: yOf(p.price) }));
  const bad = P0.some((p) => p.x == null || p.y == null);
  const P = P0 as { x: number; y: number }[];   // only read where !bad (or checked)
  switch (d.type) {
    case 'hline': { const y = P[0].y; if (y == null) return; el('line', { x1: 0, y1: y, x2: W, y2: y, stroke: col, 'stroke-width': sw }); label(W - 4, y + 4, fmt(d.pts[0].price), d.color || (DEFAULT_COLOR.hline as string), '#000', 'end'); break; }
    case 'vline': { const x = P[0].x; if (x == null) return; el('line', { x1: x, y1: 0, x2: x, y2: H, stroke: col, 'stroke-width': sw, 'stroke-dasharray': '4 3' }); label(x, H - 6, fmtTime(d.pts[0].time), '#434651'); break; }
    case 'trend': if (bad) return; el('line', { x1: P[0].x, y1: P[0].y, x2: P[1].x, y2: P[1].y, stroke: col, 'stroke-width': sw }); break;
    case 'ray': { if (bad) return; const [ex, ey] = rayEnd(P[0].x, P[0].y, P[1].x, P[1].y, W); el('line', { x1: P[0].x, y1: P[0].y, x2: ex, y2: ey, stroke: col, 'stroke-width': sw }); break; }
    case 'channel': {
      if (P.slice(0, 2).some((p) => p.x == null || p.y == null)) return;
      const off = d.pts.length === 3 ? channelOffset(d) : 0;
      const y3 = yOf(d.pts[0].price + off), y4 = yOf(d.pts[1].price + off), ym1 = yOf(d.pts[0].price + off / 2), ym2 = yOf(d.pts[1].price + off / 2);
      el('polygon', { points: `${P[0].x},${P[0].y} ${P[1].x},${P[1].y} ${P[1].x},${y4} ${P[0].x},${y3}`, fill: (d.color || '#2962ff') + '1f' });
      el('line', { x1: P[0].x, y1: P[0].y, x2: P[1].x, y2: P[1].y, stroke: col, 'stroke-width': sw });
      if (d.pts.length === 3) { el('line', { x1: P[0].x, y1: y3, x2: P[1].x, y2: y4, stroke: col, 'stroke-width': sw }); el('line', { x1: P[0].x, y1: ym1, x2: P[1].x, y2: ym2, stroke: col, 'stroke-width': 1, 'stroke-dasharray': '4 4', opacity: 0.6 }); }
      break;
    }
    case 'rect': if (bad) return; el('rect', { x: Math.min(P[0].x, P[1].x), y: Math.min(P[0].y, P[1].y), width: Math.abs(P[1].x - P[0].x), height: Math.abs(P[1].y - P[0].y), fill: (d.color || '#2962ff') + '26', stroke: col, 'stroke-width': sw }); break;
    case 'fib': {
      if (bad) return;
      const L = Math.min(P[0].x, P[1].x), R = Math.max(P[0].x, P[1].x, W - 70);
      const rev = d.reverse ?? FIB_REVERSE, lv = [...FIB].sort((x, y) => x - y);
      // normal: start = 1, end = 0 (retracement) · reverse: start = 0, end = 1, levels > 1 continue past the end point (targets)
      const at = (k: number): number => (rev ? d.pts[0].price + (d.pts[1].price - d.pts[0].price) * k : d.pts[1].price + (d.pts[0].price - d.pts[1].price) * k);
      lv.forEach((k: number, i: number) => {
        const y = yOf(at(k)); if (y == null) return;
        if (i < lv.length - 1) { const yn = yOf(at(lv[i + 1])); if (yn != null) el('rect', { x: L, y: Math.min(y, yn), width: R - L, height: Math.abs(yn - y), fill: fibColor(lv[i + 1]) + '14' }); }
        el('line', { x1: L, y1: y, x2: R, y2: y, stroke: sel ? TC().sel : fibColor(k), 'stroke-width': 1 });
        txt(L + 4, y - 3, `${k} (${fmt(at(k))})`, fibColor(k));
      });
      el('line', { x1: P[0].x, y1: P[0].y, x2: P[1].x, y2: P[1].y, stroke: '#787b86', 'stroke-width': 1, 'stroke-dasharray': '4 4' });
      break;
    }
    case 'fibext': {
      if (bad) return;
      el('polyline', { points: P.map((p) => `${p.x},${p.y}`).join(' '), fill: 'none', stroke: '#787b86', 'stroke-width': 1, 'stroke-dasharray': '4 4' });
      if (d.pts.length < 3) break;
      const leg = d.pts[1].price - d.pts[0].price, base = d.pts[2].price, at = (k: number): number => base + leg * k;
      const L = Math.min(P[2].x, P[1].x), R = Math.max(P[2].x + 40, W - 70);
      [...FIBX].sort((x, y) => x - y).forEach((k: number) => {
        const y = yOf(at(k)); if (y == null) return; const big = k === 1.618 || k === 2.618;
        el('line', { x1: L, y1: y, x2: R, y2: y, stroke: sel ? TC().sel : fibColor(k), 'stroke-width': big ? 1.6 : 1, 'stroke-dasharray': k === 0 ? '3 3' : '' });
        txt(L + 4, y - 3, `${(k * 100).toFixed(1).replace(/\.0$/, '')}% (${fmt(at(k))})${big ? ' ◎' : ''}`, fibColor(k), 'start', 11, big ? 700 : 400);
      });
      break;
    }
    case 'brush': { const pts = P.filter((p) => p.x != null && p.y != null).map((p) => `${p.x},${p.y}`).join(' '); if (pts) el('polyline', { points: pts, fill: 'none', stroke: col, 'stroke-width': sel ? 3 : 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }); break; }
    case 'text': if (bad) return; TXT.renderText(d, P, sel); break;
    case 'callout': if (bad) return; TXT.renderCallout(d, P, sel); break;
    case 'arrowUp': case 'arrowDown': {
      if (bad) return; const up = d.type === 'arrowUp', x = P[0].x, y = P[0].y, c = sel ? TC().sel : d.color || DEFAULT_COLOR[d.type];
      el('path', { d: up ? `M${x} ${y} l9 12 h-5 v10 h-8 v-10 h-5 z` : `M${x} ${y} l9 -12 h-5 v-10 h-8 v10 h-5 z`, fill: c }); break;
    }
    case 'long': case 'short': {
      if (bad) return;
      const Lv = posLevels(d), x1 = P[0].x; let x2 = P[1].x; if (x2 - x1 < 40) x2 = x1 + 120;
      const ye = yOf(Lv.e), ys = yOf(Lv.sl), yt = yOf(Lv.tp); if (ye == null || ys == null || yt == null) return;
      el('rect', { x: x1, y: Math.min(ye, yt), width: x2 - x1, height: Math.abs(yt - ye), fill: '#26a69a33', stroke: sel ? TC().sel : '#26a69a88' });
      el('rect', { x: x1, y: Math.min(ye, ys), width: x2 - x1, height: Math.abs(ys - ye), fill: '#ef535033', stroke: sel ? TC().sel : '#ef535088' });
      el('line', { x1, y1: ye, x2, y2: ye, stroke: TC().fg, 'stroke-width': 1.5 });
      const pct = (p: number) => (((p - Lv.e) / Lv.e) * 100).toFixed(2) + '%';
      const lot = ui.planner?.lot ? ui.planner.lot(Lv.e, Lv.sl) : null;
      const cx = (x1 + x2) / 2;
      label(cx, yt + (yt < ye ? -4 : 16), `Target ${fmt(Lv.tp)} (${pct(Lv.tp)}) · ${Lv.rr.toFixed(2)}R`, UP);
      label(cx, ys + (ys > ye ? 16 : -4), `Stop ${fmt(Lv.sl)} (${pct(Lv.sl)})`, DOWN);
      label(cx, ye + (yt < ye ? 16 : -4), `${d.type === 'long' ? 'Long' : 'Short'} ${fmt(Lv.e)}${lot ? ' · ' + lot + ' lot' : ''}`, '#434651');
      break;
    }
  }
  if (d.label) TXT.renderLabel(d, P, W, H, sel);
  if (sel && d.type !== 'text') handles(d).forEach((h) => el('circle', { cx: h.x, cy: h.y, r: 4.5, fill: TC().handle, stroke: TC().sel, 'stroke-width': 2 }));
}
function measureShape(a: DPoint, b: DPoint): void {
  const x1 = xOfT(a.time), y1 = yOf(a.price), x2 = xOfT(b.time), y2 = yOf(b.price);
  if (x1 == null || y1 == null || x2 == null || y2 == null) return;
  const up = b.price >= a.price, col = up ? '#2962ff' : DOWN;
  el('rect', { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1), fill: col + '26', stroke: col });
  const dp = b.price - a.price, pc = (dp / a.price) * 100;
  const bars = Math.round(Math.abs((timeToLogical(b.time) as number) - (timeToLogical(a.time) as number)));
  label((x1 + x2) / 2, up ? Math.min(y1, y2) - 6 : Math.max(y1, y2) + 18, `${dp >= 0 ? '+' : ''}${fmt(dp)} (${pc >= 0 ? '+' : ''}${pc.toFixed(2)}%) · ${bars} แท่ง · ${fmtDur(bars * tf().sec)}`, col);
}
function fmtDur(s: number): string { const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return d ? `${d}ว ${h}ชม` : h ? `${h}ชม ${m}น` : `${m}น`; }

function redraw(): void {
  if (!view.dirty) return; view.dirty = false;
  const W = chartW(), H = paneH();
  svg.setAttribute('width', String(Math.max(0, W))); svg.setAttribute('height', String(Math.max(0, H)));
  svg.textContent = ''; resetLabels();
  if (!S.candles.length) return;
  if (S.showSessions) drawSessions(W, H);
  if (ui.news) ui.news.draw(W, H);
  if (ui.mtf) ui.mtf.drawOnMain(W);
  drawAnalysis(W, H);
  if (!S.hidden) drawings.forEach((d: Drawing, i: number) => renderDrawing(d, S.selected === i, W, H));
  if (S.tool !== 'cursor' && S.pts.length && S.mouse) {
    const n = TOOLS[S.tool as ToolKind].n;
    if (S.tool === 'measure') measureShape(S.pts[0], S.mouse);
    else if (n > 1) renderDrawing({ id: 0, type: S.tool, pts: [...S.pts, S.mouse].slice(0, n), rr: 2 }, false, W, H);
  }
  if (S.tool === 'brush' && S.brush) renderDrawing(S.brush, false, W, H);
  if (S.measure) measureShape(S.measure.a, S.measure.b);
  if (ui.sim) ui.sim.draw(W);
  if (ui.planner?.draw) ui.planner.draw(W, H);
  TXT.sync();
}
(function loop() { redraw(); requestAnimationFrame(loop); })();
['wheel', 'mousedown', 'mouseup'].forEach((ev) => $('chart-wrap').addEventListener(ev, () => { view.dirty = true; }, { passive: true }));
new ResizeObserver((es: ResizeObserverEntry[]) => { const r = es[0].contentRect; _cw = r.width; _ch = r.height; view.dirty = true; }).observe($('chart'));
// redraw in the same frame the chart moves, so drawings don't trail behind while panning/zooming
chart.timeScale().subscribeVisibleLogicalRangeChange(() => { view.dirty = true; redraw(); });

// ---------------------------------------------------------------- hit test
function hitTest(x: number, y: number): number | null {
  if (S.hidden) return null;
  const W = chartW();
  for (let i = drawings.length - 1; i >= 0; i--) {
    const d = drawings[i], P = d.pts.map((p) => ({ x: xOfT(p.time), y: yOf(p.price) })) as { x: number; y: number }[];
    if (handles(d).some((h) => Math.hypot(h.x - x, h.y - y) < 8)) return i;
    switch (d.type) {
      case 'hline': if (P[0].y != null && Math.abs(P[0].y - y) < 6) return i; break;
      case 'vline': if (P[0].x != null && Math.abs(P[0].x - x) < 6) return i; break;
      case 'trend': if (distToSeg(x, y, P[0].x, P[0].y, P[1].x, P[1].y) < 6) return i; break;
      case 'ray': { const [ex, ey] = rayEnd(P[0].x, P[0].y, P[1].x, P[1].y, W); if (distToSeg(x, y, P[0].x, P[0].y, ex, ey) < 6) return i; break; }
      case 'channel': { const off = channelOffset(d); const y3 = yOf(d.pts[0].price + off), y4 = yOf(d.pts[1].price + off);
        if (distToSeg(x, y, P[0].x, P[0].y, P[1].x, P[1].y) < 6 || distToSeg(x, y, P[0].x, y3, P[1].x, y4) < 6) return i; break; }
      case 'rect': case 'fib': case 'long': case 'short': {
        let xs: number[] = [P[0].x, P[1].x], ys: number[] = [P[0].y, P[1].y];
        if (d.type === 'fib') xs.push(W - 70);
        if (d.type === 'long' || d.type === 'short') { const L = posLevels(d); ys = [yOf(L.sl), yOf(L.tp)].filter((v): v is number => v != null); if (P[1].x - P[0].x < 40) xs = [P[0].x, P[0].x + 120]; }
        if (x >= Math.min(...xs) - 4 && x <= Math.max(...xs) + 4 && y >= Math.min(...ys) - 4 && y <= Math.max(...ys) + 4) return i; break;
      }
      case 'fibext': {
        for (let k = 1; k < P.length; k++) if (distToSeg(x, y, P[k - 1].x, P[k - 1].y, P[k].x, P[k].y) < 6) return i;
        if (d.pts.length === 3) { const leg = d.pts[1].price - d.pts[0].price; for (const k of FIBX) { const yy = yOf(d.pts[2].price + leg * k); if (yy != null && Math.abs(yy - y) < 5 && x >= Math.min(P[1].x, P[2].x) - 4) return i; } }
        break;
      }
      case 'brush': for (let k = 1; k < P.length; k++) if (distToSeg(x, y, P[k - 1].x, P[k - 1].y, P[k].x, P[k].y) < 6) return i; break;
      case 'text': case 'callout': if (TXT.hit(d, P, x, y)) return i; break;
      case 'arrowUp': if (Math.abs(x - P[0].x) < 10 && y >= P[0].y - 2 && y <= P[0].y + 24) return i; break;
      case 'arrowDown': if (Math.abs(x - P[0].x) < 10 && y <= P[0].y + 2 && y >= P[0].y - 24) return i; break;
    }
  }
  return null;
}

// ---------------------------------------------------------------- mouse: select / drag / create
let drag: Drag | null = null;
$('chart-wrap').addEventListener('pointerdown', (ev: PointerEvent) => {
  if (ev.button !== 0 || (tgt(ev) as Element).closest('#legend, #zoombar, #layers-pop, .txe, .txt-bar, #notes-pop')) return;
  const { x, y } = mousePos(ev);
  if (S.tool === 'brush') {
    const p = pointAt(x, y, false); if (!p) return;
    chart.applyOptions({ handleScroll: false, handleScale: false });
    S.brush = { type: 'brush', pts: [{ time: p.time, price: p.price }], color: DEFAULT_COLOR.brush, lastX: x, lastY: y };
    ev.stopPropagation(); ev.preventDefault(); return;
  }
  if (S.tool !== 'cursor') return;
  const hit = hitTest(x, y);
  if (hit == null) { if (S.selected != null) { S.selected = null; view.dirty = true; } return; }
  S.selected = hit; view.dirty = true; renderLayers();
  if (S.locked) return;
  ev.stopPropagation(); ev.preventDefault();   // stop the chart from panning
  chart.applyOptions({ handleScroll: false, handleScale: false });   // (touch: the chart listens to touch events, so also switch panning off)
  const d = drawings[hit];
  const h = handles(d).find((q) => Math.hypot(q.x - x, q.y - y) < 8);
  const p = pointAt(x, y, false);
  const P0 = d.pts.map((q) => ({ x: xOfT(q.time), y: yOf(q.price) })) as { x: number; y: number }[];
  if (!h && TXT.hitCalloutBox(d, P0, x, y)) { const o = d.off || { dx: 24, dy: -56 }; drag = { i: hit, box: { dx: o.dx, dy: o.dy, x0: x, y0: y }, moved: false }; return; }
  drag = { i: hit, k: h ? h.k : null, l0: chart.timeScale().coordinateToLogical(x), p0: p ? p.price : 0, orig: JSON.parse(JSON.stringify(d.pts)), rr0: d.rr, moved: false };
}, true);
window.addEventListener('pointermove', (ev: PointerEvent) => {
  const { x, y } = mousePos(ev);
  if (S.brush) {
    if (Math.hypot(x - S.brush.lastX, y - S.brush.lastY) > 3) { const p = pointAt(x, y, false); if (p) { S.brush.pts.push({ time: logicalToTime(chart.timeScale().coordinateToLogical(x)) as number, price: p.price }); S.brush.lastX = x; S.brush.lastY = y; view.dirty = true; } }
    return;
  }
  if (drag) {
    const d = drawings[drag.i]; if (!d) { drag = null; return; }
    if (!drag.moved) { pushHistory(); drag.moved = true; }
    if (drag.box) { d.off = { dx: Math.round(drag.box.dx + x - drag.box.x0), dy: Math.round(drag.box.dy + y - drag.box.y0) }; view.dirty = true; return; }
    if (drag.k === -1) { const p = pointAt(x, y, false); if (p) { const e = d.pts[0].price, sl = d.pts[1].price; d.rr = Math.max(0.1, Math.abs(p.price - e) / Math.abs(e - sl)); } }
    else if (drag.k != null) {
      const p = pointAt(x, y, true); if (!p) return;
      if (d.type === 'hline') d.pts[0].price = p.price;
      else if (d.type === 'vline') d.pts[0].time = p.time;
      else if (d.type === 'long' || d.type === 'short') { if (drag.k === 0) d.pts[0] = { time: p.time, price: p.price }; else d.pts[1] = { time: p.time, price: p.price }; }
      else d.pts[drag.k] = { time: p.time, price: p.price };
    } else {
      const l = chart.timeScale().coordinateToLogical(x), pr = main.coordinateToPrice(y); if (l == null || pr == null) return;
      const dl = Math.round(l - (drag.l0 as number)), dp = pr - (drag.p0 as number);
      d.pts = (drag.orig as DPoint[]).map((q: DPoint) => ({ time: d.type === 'hline' ? q.time : logicalToTime((timeToLogical(q.time) as number) + dl) as number, price: d.type === 'vline' ? q.price : q.price + dp }));
    }
    view.dirty = true; return;
  }
  if (S.tool !== 'cursor' && $('chart').contains(tgt(ev) as Node)) { S.mouse = pointAt(x, y, true); if (S.pts.length) view.dirty = true; }
});
window.addEventListener('pointerup', () => {
  if (drag || S.brush) chart.applyOptions({ handleScroll: S.tool === 'cursor', handleScale: S.tool === 'cursor' });
  if (S.brush) { if (S.brush.pts.length > 1) { pushHistory(); const { lastX, lastY, ...b } = S.brush; drawings.push({ ...b, id: uid() }); saveDrawings(); renderLayers(); } S.brush = null; view.dirty = true; return; }
  if (drag) { if (drag.moved) saveDrawings(); drag = null; }
});
$('chart-wrap').addEventListener('click', (ev: MouseEvent) => {
  if (S.tool === 'cursor' || S.tool === 'brush' || (tgt(ev) as Element).closest('#legend, #zoombar, #layers-pop, .txe, .txt-bar, #notes-pop')) return;
  const { x, y } = mousePos(ev);
  const p = pointAt(x, y, true); if (!p) return;
  const pt = { time: p.time, price: p.price };
  const t = S.tool as ToolKind, n = TOOLS[t].n;
  if (t === 'alert') { addAlert(+p.price.toFixed(digits())); setTool('cursor'); return; }
  if (t === 'text' || t === 'callout') { TXT.edit({ kind: t, pt, x, y }); return; }
  if (t === 'measure' && S.measure) { S.measure = null; }
  S.pts.push(pt);
  if (S.pts.length < n) { S.mouse = p; view.dirty = true; return; }
  const pts: DPoint[] = S.pts; S.pts = [];
  if (t === 'measure') { S.measure = { a: pts[0], b: pts[1] }; view.dirty = true; return; }
  pushHistory();
  const d: Drawing = { id: uid(), type: t as DrawingKind, pts, color: DEFAULT_COLOR[t] || '#2962ff' };
  if (t === 'long' || t === 'short') {
    d.rr = 2;
    if ((t === 'long' && pts[1].price >= pts[0].price) || (t === 'short' && pts[1].price <= pts[0].price)) { // clicked TP side → mirror to SL side
      pts[1] = { ...pts[1], price: pts[0].price - (pts[1].price - pts[0].price) / 2 };
    }
  }
  drawings.push(d); saveDrawings(); renderLayers(); view.dirty = true;
  if (!ev.shiftKey && ['long', 'short', 'text', 'callout', 'arrowUp', 'arrowDown'].includes(t)) setTool('cursor');
});
$('chart-wrap').addEventListener('dblclick', (ev: MouseEvent) => {
  if (S.tool !== 'cursor' || S.locked) return;
  const { x, y } = mousePos(ev); const i = hitTest(x, y); if (i == null) return;
  const d = drawings[i];
  if ((d.type === 'long' || d.type === 'short') && ui.planner?.from) ui.planner.from(d);
  else TXT.openEditor(i);   // text / callout: edit the text · other shapes: their label
});

// text editing: text-tools.js (TXT)

// ---------------------------------------------------------------- layers (object tree)
function toggleLayers(): void { const p = $('layers-pop'); p.classList.toggle('hidden'); renderLayers(); }
function renderLayers(): void {
  const p = $('layers-pop'); if (p.classList.contains('hidden')) return;
  const desc = (d: Drawing): string => d.type === 'hline' ? fmt(d.pts[0].price) : (d.type === 'text' || d.type === 'callout') ? esc(String(d.text || '').split('\n')[0]) : d.label ? esc(d.label.split('\n')[0]) : d.type === 'vline' ? fmtTime(d.pts[0].time) : d.pts[0] ? fmt(d.pts[0].price) : '';
  p.innerHTML = `<div class="group">รูปวาดบน ${S.symbol} (${drawings.length})</div>` + (drawings.map((d: Drawing, i: number) =>
    `<div class="item ${S.selected === i ? 'sel' : ''}" data-i="${i}"><span>${ICON.svg(TOOLS[d.type as ToolKind]?.icon || 'trend', 16)} ${TOOLS[d.type as ToolKind]?.name.split(' (')[0] || d.type} <small>${desc(d)}</small></span>
     <span><input type="color" data-c="${i}" value="${(d.color || '#2962ff').slice(0, 7)}" style="width:22px;height:18px;padding:0;border:none;background:none"> <button data-del="${i}" aria-label="ลบ">${ICON.svg('x', 14)}</button></span></div>`).join('') || '<div class="item muted">ยังไม่มีรูปวาด</div>');
  p.querySelectorAll('[data-i]').forEach((r: HTMLElement) => (r.onclick = (e) => { if ((tgt(e) as Element).closest('button, input')) return; S.selected = +(r.dataset.i as string); view.dirty = true; renderLayers(); }));
  p.querySelectorAll('[data-del]').forEach((b: HTMLElement) => (b.onclick = () => { if (S.locked) return; pushHistory(); drawings.splice(+(b.dataset.del as string), 1); S.selected = null; saveDrawings(); view.dirty = true; renderLayers(); }));
  p.querySelectorAll('[data-c]').forEach((c) => (c.oninput = () => { drawings[+(c.dataset.c as string)].color = c.value; saveDrawings(); view.dirty = true; }));
}

// ---------------------------------------------------------------- keyboard
document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes((tgt(e) as Element).tagName)) return;
  if ([...qsa('.modal')].some((m) => !m.classList.contains('hidden'))) { if (e.key === 'Escape') qsa('.modal').forEach((m) => m.classList.add('hidden')); return; }
  const k = e.key.toLowerCase();
  if ((e.metaKey || e.ctrlKey) && k === 'z') { e.preventDefault(); return e.shiftKey ? redo() : undo(); }
  if ((e.metaKey || e.ctrlKey) && k === 'y') { e.preventDefault(); return redo(); }
  if (e.key === 'Escape') { setTool('cursor'); S.selected = null; view.dirty = true; return; }
  if ((e.key === 'Delete' || e.key === 'Backspace') && S.selected != null && !S.locked) { pushHistory(); drawings.splice(S.selected, 1); S.selected = null; saveDrawings(); renderLayers(); view.dirty = true; return; }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const t = (Object.keys(TOOLS) as ToolKind[]).find((n) => TOOLS[n].key && (TOOLS[n].key as string).toLowerCase() === k);
  if (t) setTool(t);
  if (k === '+' || k === '=') zoom(0.8); if (k === '-') zoom(1.25);
});

// ---------------------------------------------------------------- top bar buttons
$('undo').innerHTML = ICON.svg('undo', 18); $('redo').innerHTML = ICON.svg('redo', 18);
$('cs-btn').innerHTML = ICON.svg('gear', 18); $('full').innerHTML = ICON.svg('full', 18); $('shot').innerHTML = ICON.svg('camera', 18);
$('undo').onclick = undo; $('redo').onclick = redo;
$('full').onclick = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen());
$('shot').onclick = async () => {
  const c = chart.takeScreenshot(); const ctx = c.getContext('2d');
  const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg));
  await new Promise<void>((r) => { img.onload = () => r(); img.onerror = () => r(); });
  const ratio = c.width / $('chart').clientWidth;
  try { ctx.drawImage(img, 0, 0, img.width * ratio, img.height * ratio); } catch (_: any) {}
  const a = mk('a'); a.href = c.toDataURL('image/png');
  a.download = `${S.symbol}_${tf().label}_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`; a.click();
};

// chart settings
S.chartCfg = { up: '#26a69a', down: '#ef5350', grid: true, news: false, ...store.get('chartCfg', {}) };
S.showSessions = store.get('sessions', true);
function applyChartCfg(): void {
  setCandleColors(S.chartCfg.up, S.chartCfg.down);
  chart.applyOptions({ grid: { vertLines: { visible: S.chartCfg.grid }, horzLines: { visible: S.chartCfg.grid } } });
}
$('cs-btn').onclick = (e: MouseEvent) => {
  e.stopPropagation();
  const m = $('cs-menu'); if (!m.classList.contains('hidden')) { m.classList.add('hidden'); return; }
  m.innerHTML = `<div class="group">ตั้งค่ากราฟ</div>
    <div class="item"><span>สีแท่งขึ้น</span><input type="color" id="cs-up" value="${S.chartCfg.up}"></div>
    <div class="item"><span>สีแท่งลง</span><input type="color" id="cs-down" value="${S.chartCfg.down}"></div>
    <div class="item"><span>สีแบบ VCG (น้ำเงิน/แดง)</span><button id="cs-vcg">ใช้</button></div>
    <label class="item"><input type="checkbox" id="cs-grid" ${S.chartCfg.grid ? 'checked' : ''}> เส้นตาราง</label>
    <label class="item"><input type="checkbox" id="cs-sess" ${S.showSessions ? 'checked' : ''}> แสดงช่วงเวลาตลาด (Sessions)</label>
    <label class="item"><input type="checkbox" id="cs-news" ${S.chartCfg.news ? 'checked' : ''}> แสดงเวลาข่าวสำคัญบนกราฟ</label>
    <div class="group">ระดับ Fibonacci (คั่นด้วย ,)</div>
    <div class="item fibrow"><span>ย่อตัว</span><input id="cs-fib" value="${FIB.join(', ')}"></div>
    <label class="item"><input type="checkbox" id="cs-fibrev" ${FIB_REVERSE ? 'checked' : ''}> Fibo กลับด้าน: จุดแรก = 0, จุดที่สอง = 1 (ระดับ 1.272 / 1.618 / 2 / 2.618 ต่อเลยจุดที่สอง เป็นเป้า)</label>
    <div class="item fibrow"><span>เป้า (Extension)</span><input id="cs-fibx" value="${FIBX.join(', ')}"></div>
    <div class="item fibpre" style="gap:6px;justify-content:flex-start;flex-wrap:wrap">${Object.keys(FIB_PRESETS).map((k) => `<button data-fp="${k}" title="${FIB_PRESETS[k as keyof typeof FIB_PRESETS].join(', ')}">${k}</button>`).join('')}<button id="cs-fib-reset">ค่าเริ่มต้น</button></div>`;
  m.classList.remove('hidden');
  const save = () => { store.set('chartCfg', S.chartCfg); applyChartCfg(); buildMain(); buildIndicators(); view.dirty = true; };
  $('cs-up').oninput = () => { S.chartCfg.up = $('cs-up').value; save(); };
  $('cs-down').oninput = () => { S.chartCfg.down = $('cs-down').value; save(); };
  $('cs-vcg').onclick = () => { S.chartCfg.up = '#3b5bdb'; S.chartCfg.down = '#e03131'; $('cs-up').value = S.chartCfg.up; $('cs-down').value = S.chartCfg.down; save(); };
  $('cs-grid').onchange = () => { S.chartCfg.grid = $('cs-grid').checked; save(); };
  $('cs-news').onchange = () => { S.chartCfg.news = $('cs-news').checked; store.set('chartCfg', S.chartCfg); view.dirty = true; };
  const parseLv = (v: string): number[] => [...new Set(String(v).split(/[,\s]+/).map(Number).filter((x) => isFinite(x) && x >= -5 && x <= 10))];
  $('cs-fib').onchange = () => { const a = parseLv($('cs-fib').value); if (a.length) { setFib(a); store.set('fibLevels', FIB); } $('cs-fib').value = FIB.join(', '); view.dirty = true; };
  $('cs-fibx').onchange = () => { const a = parseLv($('cs-fibx').value); if (a.length) { setFibX(a); store.set('fibExtLevels', FIBX); } $('cs-fibx').value = FIBX.join(', '); view.dirty = true; };
  const setRev = (v: boolean): void => { setFibReverse(!!v); store.set('fibReverse', FIB_REVERSE); $('cs-fibrev').checked = FIB_REVERSE; view.dirty = true; };
  $('cs-fibrev').onchange = (e: Event) => setRev(tgt(e).checked);
  $('cs-menu').querySelectorAll('[data-fp]').forEach((b: HTMLElement) => (b.onclick = () => { setFib(FIB_PRESETS[b.dataset.fp as keyof typeof FIB_PRESETS].slice()); store.set('fibLevels', FIB); $('cs-fib').value = FIB.join(', '); setRev(!!(FIB_PRESET_REVERSE as Record<string, boolean>)[b.dataset.fp as string]); }));
  $('cs-fib-reset').onclick = () => { setFib(FIB_DEF.slice()); setFibX(FIBX_DEF.slice()); store.set('fibLevels', FIB); store.set('fibExtLevels', FIBX); $('cs-fib').value = FIB.join(', '); $('cs-fibx').value = FIBX.join(', '); setRev(false); };
  $('cs-sess').onchange = () => { S.showSessions = $('cs-sess').checked; store.set('sessions', S.showSessions); view.dirty = true; };
};
document.addEventListener('click', (e) => { const t = tgt(e) as Element; if (!t.closest('#cs-menu') && !t.closest('#cs-btn')) $('cs-menu').classList.add('hidden'); });

// ---------------------------------------------------------------- zoom bar
const ZI: Record<string, string> = { out: 'minus', in: 'plus', left: 'left', right: 'right', reset: 'reset' };
document.querySelectorAll<HTMLElement>('#zoombar [data-z]').forEach((b) => {
  b.innerHTML = ICON.svg(ZI[b.dataset.z as string], 16);
  b.onclick = () => ({ out: () => zoom(1.25), in: () => zoom(0.8), left: () => scrollBars(-1), right: () => scrollBars(1), reset: resetView } as Record<string, () => void>)[b.dataset.z as string]();
});
function zoom(f: number): void { const r = chart.timeScale().getVisibleLogicalRange(); if (!r) return; const w = (r.to - r.from) * f; chart.timeScale().setVisibleLogicalRange({ from: r.to - w, to: r.to }); }
function scrollBars(dir: number): void { const r = chart.timeScale().getVisibleLogicalRange(); if (!r) return; const s = (r.to - r.from) * 0.2 * dir; chart.timeScale().setVisibleLogicalRange({ from: r.from + s, to: r.to + s }); }
function resetView(): void { const n = S.candles.length; chart.priceScale('right').applyOptions({ autoScale: true }); setScale('auto'); chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - 150), to: n + 10 }); }

// ---------------------------------------------------------------- bottom bar: ranges, timezone, sessions, scale
const RANGES: [string, number, number][] = [['1D', 1, 86400], ['5D', 2, 5 * 86400], ['1M', 3, 30 * 86400], ['3M', 4, 91 * 86400], ['6M', 4, 182 * 86400], ['1Y', 5, 365 * 86400], ['5Y', 6, 5 * 365 * 86400]];
$('ranges').innerHTML = RANGES.map(([l]) => `<button data-r="${l}">${l}</button>`).join('') + '<span class="sep"></span>';
let pendingSpan: number | null = null;
$('ranges').querySelectorAll('button').forEach((b: HTMLElement) => (b.onclick = () => {
  const [, type, span] = RANGES.find((r) => r[0] === b.dataset.r) as [string, number, number];
  pendingSpan = span;
  if (S.tf !== type) { S.tf = type; store.set('tf', type); renderTfs(); loadChart(); } else applySpan();
}));
function applySpan(): void {
  if (!pendingSpan || !S.candles.length) return;
  const last = S.candles[S.candles.length - 1].time;
  try { chart.timeScale().setVisibleRange({ from: Math.max(S.candles[0].time, last - pendingSpan), to: last }); } catch (_: any) {}
  pendingSpan = null;
}
onChartEvent('loaded', () => { setTimeout(applySpan, 50); });

function setScale(which: string): void {
  const ps = chart.priceScale('right');
  qsa('#bottombar [data-scale]').forEach((b) => b.classList.remove('active'));
  if (which === 'auto') { ps.applyOptions({ autoScale: true }); }
  else {
    const mode = which === 'log' ? 1 : 2;
    const cur = ps.options().mode;
    ps.applyOptions({ mode: cur === mode ? 0 : mode, autoScale: true });
    if (cur !== mode) qs(`#bottombar [data-scale="${which}"]`)?.classList.add('active');
  }
  if (ps.options().autoScale) qs('#bottombar [data-scale="auto"]')?.classList.add('active');
  view.dirty = true;
}
document.querySelectorAll<HTMLElement>('#bottombar [data-scale]').forEach((b) => (b.onclick = () => setScale(b.dataset.scale as string)));

// timezone selector + clock + sessions status
const ZONES: [string, string][] = [['local', 'เวลาเครื่อง'], ['Asia/Bangkok', 'Bangkok (UTC+7)'], ['UTC', 'UTC'], ['Europe/London', 'London'], ['America/New_York', 'New York'], ['Asia/Tokyo', 'Tokyo'], ['Australia/Sydney', 'Sydney']];
// Trading sessions — editable in Settings → ช่วงเวลาตลาด. Times are in `zone` (a market's own zone follows its DST).
const DEFAULT_SESSIONS: Session[] = [
  { name: 'Sydney', zone: 'Australia/Sydney', open: '07:00', close: '16:00', color: '#ab47bc', on: true },
  { name: 'Tokyo', zone: 'Asia/Tokyo', open: '09:00', close: '18:00', color: '#ef5350', on: true },
  { name: 'London', zone: 'Europe/London', open: '08:00', close: '17:00', color: '#2962ff', on: true },
  { name: 'New York', zone: 'America/New_York', open: '08:00', close: '17:00', color: '#ff9800', on: true },
];
let SESSIONS_ALL: Session[] = store.get('sessionsCfg', DEFAULT_SESSIONS);
let SESSIONS = SESSIONS_ALL.filter((x) => x.on);
function setSessions(list: Session[]): void { SESSIONS_ALL = list; SESSIONS = list.filter((x) => x.on); store.set('sessionsCfg', list); _sessCache.clear(); tickClock(); view.dirty = true; }
const hmParse = (t: string): [number, number] => { const [h, m] = String(t || '0:0').split(':').map((x) => parseInt(x, 10) || 0); return [Math.max(0, Math.min(24, h)), Math.max(0, Math.min(59, m))]; };
const curZone = (): string => store.get('tz', 'local');
$('clock').insertAdjacentHTML('beforebegin', `<span id="sess-status" title="คลิกเพื่อดูตารางเวลาตลาด" style="cursor:pointer"></span><span class="sep"></span>
  <select id="tz-sel" title="Timezone ของกราฟ">${ZONES.map(([z, n]) => `<option value="${z}">${n}</option>`).join('')}</select>`);
$('tz-sel').value = curZone();
$('tz-sel').onchange = () => { store.set('tz', $('tz-sel').value); setTZ(zoneOffsetSec($('tz-sel').value)); vcg.log('info', 'เปลี่ยน timezone ของกราฟเป็น ' + $('tz-sel').value); loadChart(); };

// session [startUTC, endUTC] (seconds) for the session's local calendar day containing `dayUTC`
const _sessCache = new Map<string, [number, number]>();
function sessionWindow(s: Session, y: number, m: number, d: number): [number, number] {
  const key = `${s.name}|${s.zone}|${s.open}|${s.close}|${y}-${m}-${d}|${TZ}`, hit = _sessCache.get(key); if (hit) return hit;
  if (_sessCache.size > 2000) _sessCache.clear();
  const r = _sessionWindow(s, y, m, d); _sessCache.set(key, r); return r;
}
function _sessionWindow(s: Session, y: number, m: number, d: number): [number, number] {
  const guess = Date.UTC(y, m, d, 12) / 1000;
  const off = zoneOffsetSec(s.zone, new Date(guess * 1000));
  const [oh, om] = hmParse(s.open), [ch, cm] = hmParse(s.close);
  const start = Date.UTC(y, m, d, oh, om) / 1000 - off;
  let end = Date.UTC(y, m, d, ch, cm) / 1000 - off;
  if (end <= start) end += 86400;   // crosses midnight
  return [start, end];
}
function sessionsAround(nowSec: number): { s: Session; a: number; b: number }[] {
  const out: { s: Session; a: number; b: number }[] = []; const d0 = new Date(nowSec * 1000);
  for (let k = -1; k <= 1; k++) {
    const dd = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), d0.getUTCDate() + k));
    for (const s of SESSIONS) { const [a, b] = sessionWindow(s, dd.getUTCFullYear(), dd.getUTCMonth(), dd.getUTCDate()); out.push({ s, a, b }); }
  }
  return out;
}
const hm = (sec: number): string => { const d = new Date((sec + TZ) * 1000); return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0'); };
function tickClock(): void {
  const now = Math.floor(Date.now() / 1000);
  const d = new Date((now + TZ) * 1000), p = (n: number) => String(n).padStart(2, '0');
  const off = TZ / 3600;
  $('clock').textContent = `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} (UTC${off >= 0 ? '+' : ''}${off})`;
  const wd = new Date(now * 1000).getUTCDay();
  const open = sessionsAround(now).filter((x) => now >= x.a && now < x.b);
  const weekend = wd === 6 || (wd === 0 && !open.length);
  $('sess-status').innerHTML = weekend ? '<i class="imp hi"></i>ตลาด FX ปิด (เสาร์-อาทิตย์)' : open.length
    ? open.map((x) => `<span style="color:${x.s.color}">● ${x.s.name}</span> <small>ปิด ${fmtDur(x.b - now)}</small>`).join(' &nbsp;')
    : '○ ช่วงรอยต่อ session';
}
setInterval(tickClock, 1000); tickClock();
$('sess-status').onclick = (e: MouseEvent) => {
  e.stopPropagation();
  const now = Math.floor(Date.now() / 1000);
  const p = $('layers-pop');
  const today = sessionsAround(now).filter((x) => x.b > now).sort((a, b) => a.a - b.a).slice(0, 4);
  p.innerHTML = `<div class="group">ตารางเวลาตลาด (เวลาตาม timezone กราฟ)</div>` +
    SESSIONS.map((s) => { const x = (today.find((q) => q.s === s) || sessionsAround(now).find((q) => q.s === s && q.b > now)) as { s: Session; a: number; b: number };
      const isOpen = now >= x.a && now < x.b;
      return `<div class="item"><span style="color:${s.color}">● ${s.name}</span><span>${hm(x.a)}–${hm(x.b)} ${isOpen ? '<b class="up">เปิดอยู่</b>' : `<small>เปิดอีก ${fmtDur(x.a - now)}</small>`}</span></div>`; }).join('') +
    `<div class="item muted" style="display:block;line-height:1.5">ช่วง London+New York ซ้อนกันมักผันผวนสูงสุด · เวลาปรับตามเวลาฤดูร้อน (DST) อัตโนมัติ</div>
    <div class="item"><button id="sess-edit">${ICON.html('settings', 14)}แก้ไขช่วงเวลา…</button></div>`;
  $('sess-edit').onclick = () => { p.classList.add('hidden'); ui.settings?.open('sess'); };
  p.classList.remove('hidden'); p.style.left = 'auto'; p.style.right = '10px'; p.style.top = 'auto'; p.style.bottom = '6px';
  setTimeout(() => { p.style.left = ''; }, 0);
};

// session boxes on the chart (intraday timeframes): high–low range of each session
function drawSessions(W: number, _H: number): void {
  if (tf().sec > 3600 || !S.candles.length) return;
  const vr = chart.timeScale().getVisibleLogicalRange(); if (!vr) return;
  const c = S.candles, from = Math.max(0, Math.floor(vr.from)), to = Math.min(c.length - 1, Math.ceil(vr.to));
  if (to <= from) return;
  const seen = new Set();
  for (let day = c[from].time - TZ - 86400; day <= c[to].time - TZ + 86400; day += 86400) {
    const d = new Date(day * 1000);
    for (const s of SESSIONS) {
      const [a, b] = sessionWindow(s, d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
      const key = s.name + a; if (seen.has(key)) continue; seen.add(key);
      const wd = new Date(a * 1000).getUTCDay(); if (wd === 6 || (wd === 0 && s.name !== 'Sydney')) continue;
      let hi = -Infinity, lo = Infinity, any = false;
      for (let i = from; i <= to; i++) { const t = c[i].time - TZ; if (t >= a && t < b) { hi = Math.max(hi, c[i].high); lo = Math.min(lo, c[i].low); any = true; } }
      if (!any) continue;
      const x1 = xOfT(a + TZ), x2 = xOfT(b + TZ), y1 = yOf(hi), y2 = yOf(lo);
      if (x1 == null || x2 == null || y1 == null || y2 == null) continue;
      el('rect', { x: x1, y: y1, width: Math.max(1, x2 - x1), height: Math.max(1, y2 - y1), fill: s.color + '12', stroke: s.color + '66', 'stroke-dasharray': '3 3' });
      txt(x1 + 3, y1 - 3, s.name, s.color, 'start', 9.5, 600);
    }
  }
}

// ---------------------------------------------------------------- init
$('magnet').checked = S.magnet;
$('magnet').onchange = () => { S.magnet = $('magnet').checked; store.set('magnet', S.magnet); buildToolbar(); };
applyChartCfg(); buildMain(); buildIndicators();
setTool('cursor');
// functions that modules loaded earlier (text-tools, chart) call at run time
Object.assign(chartHooks, {
  applyChartCfg, redraw, setTool: (t: string) => setTool(t as ToolKind), pushHistory, renderLayers,
  xOfT, inkColor, uid, handles, posLevels, pointAt, mousePos, hitTest, reloadDrawings: () => setDrawings(loadDrawings()),
});
export { onToolChange, DEFAULT_COLOR, DEFAULT_SESSIONS, GROUPS, SESSIONS_ALL, TOOLS, ZONES, _sessionWindow, applyChartCfg, handles, hitTest, inkColor, normalize, pointAt, posLevels, pushHistory, redo, redraw, renderLayers, setSessions, setTool, uid, undo, xOfT };

// tests / devtools (window.PT): only the names the UI suite uses
def({ redraw: [() => redraw], undo: [() => undo], redo: [() => redo], setTool: [() => setTool], xOfT: [() => xOfT], hitTest: [() => hitTest] });
