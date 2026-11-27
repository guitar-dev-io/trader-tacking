// SVG overlay on the chart + coordinate mapping (bar index / time ↔ pixels) and small text helpers.
// Shared by every module that draws on the chart (analysis, bounce, drawings, MTF, replay, planner…).
import { def } from '../pt';
import { $, S, tf } from '../../app-core.js';
import { chart, main } from '../../app-chart.js';

/** something with logicalToCoordinate — a lightweight-charts time scale */
export interface TimeScaleLike { logicalToCoordinate(l: number): number | null }
export type Attrs = Record<string, string | number | null | undefined>;
export type Anchor = 'start' | 'middle' | 'end';

export const NS = 'http://www.w3.org/2000/svg';
export const svg: SVGSVGElement = document.createElementNS(NS, 'svg');
svg.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;z-index:3;overflow:hidden';
$('chart-wrap').appendChild(svg);

export function period(): number { return tf().sec; }
export function timeToLogical(t: number): number | null {
  const c = S.candles, n = c.length; if (!n) return null;
  if (t <= c[0].time) return (t - c[0].time) / period();
  if (t >= c[n - 1].time) return n - 1 + (t - c[n - 1].time) / period();
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m].time <= t) lo = m; else hi = m; }
  return lo + (t - c[lo].time) / (c[hi].time - c[lo].time);
}
export function logicalToTime(l: number): number | null {
  const c = S.candles, n = c.length; if (!n) return null;
  if (l <= 0) return c[0].time + l * period();
  if (l >= n - 1) return c[n - 1].time + (l - (n - 1)) * period();
  const i = Math.floor(l); return c[i].time + (l - i) * (c[i + 1].time - c[i].time);
}
// logicalToCoordinate() only handles whole bar indexes → interpolate fractional positions ourselves
export function lToX(ts: TimeScaleLike, l: number | null | undefined): number | null {
  if (l == null || !isFinite(l)) return null;
  const f = Math.floor(l), a = ts.logicalToCoordinate(f);
  if (l === f || a == null) return a;
  const b = ts.logicalToCoordinate(f + 1);
  return b == null ? a : a + (b - a) * (l - f);
}
export const xOf = (t: number): number | null => { const l = timeToLogical(t); return l == null ? null : lToX(chart.timeScale(), l); };
export const xIdx = (i: number): number | null => chart.timeScale().logicalToCoordinate(i);
export const yOf = (p: number): number | null => (main ? main.priceToCoordinate(p) : null);

export function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs, parent?: Element): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  (parent || svg).appendChild(e); return e;
}
export function txt(x: number, y: number, s: string, color: string, anchor: Anchor = 'start', size = 11, weight = 400): SVGTextElement {
  const t = el('text', { x, y, fill: color, 'font-size': size, 'font-weight': weight, 'text-anchor': anchor, 'font-family': '-apple-system, sans-serif' });
  t.textContent = s; return t;
}
// layout-aware text for analysis overlays: nudges a label up/down until it no longer overlaps another one
interface Box { x0: number; x1: number; y0: number; y1: number }
let _lbls: Box[] = [];
export function resetLabels(): void { _lbls = []; }
export function ltxt(x: number, y: number, s: string, color: string, anchor: Anchor = 'start', size = 10, weight = 400): SVGTextElement {
  const w = String(s).length * size * 0.6, h = size + 2;
  const box = (yy: number): Box => { const x0 = anchor === 'end' ? x - w : anchor === 'middle' ? x - w / 2 : x; return { x0, x1: x0 + w, y0: yy - size, y1: yy + 2 }; };
  const hit = (b: Box) => _lbls.some((o) => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0);
  let yy = y;
  for (let k = 1; k <= 8 && hit(box(yy)); k++) yy = y + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * h;
  _lbls.push(box(yy));
  return txt(x, yy, s, color, anchor, size, weight);
}
export function label(x: number, y: number, s: string, bg: string, fg = '#fff', anchor: Anchor = 'middle'): void {
  const w = s.length * 6.4 + 10, x0 = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
  el('rect', { x: x0, y: y - 12, width: w, height: 16, rx: 3, fill: bg });
  txt(x0 + w / 2, y, s, fg, 'middle', 10.5, 600);
}

// tests / devtools read these through window.PT
def({ svg: [() => svg], yOf: [() => yOf] });
