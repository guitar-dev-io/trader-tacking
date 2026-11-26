import { PT, def } from './src/pt.ts';
import { AN } from './src/legacy/core.ts';
import { $, DOWN, S, TC, UP, fmt, tf } from './app-core.js';
import { chart, customOut, main } from './app-chart.js';
import { activeSignal } from './app-analysis.js';
import { drawAutoFib, drawBounce, drawLiquidity } from './app-bounce.js';
def({ NS: [() => NS], svg: [() => svg], dirty: [() => dirty, (v) => { dirty = v; }], period: [() => period, (v) => { period = v; }], timeToLogical: [() => timeToLogical, (v) => { timeToLogical = v; }], logicalToTime: [() => logicalToTime, (v) => { logicalToTime = v; }], lToX: [() => lToX, (v) => { lToX = v; }], xOf: [() => xOf], xIdx: [() => xIdx], yOf: [() => yOf], el: [() => el, (v) => { el = v; }], txt: [() => txt, (v) => { txt = v; }], _lbls: [() => _lbls, (v) => { _lbls = v; }], resetLabels: [() => resetLabels, (v) => { resetLabels = v; }], ltxt: [() => ltxt, (v) => { ltxt = v; }], label: [() => label, (v) => { label = v; }], positionBox: [() => positionBox, (v) => { positionBox = v; }], drawAnalysis: [() => drawAnalysis, (v) => { drawAnalysis = v; }] });
// Price Tracker renderer · SVG overlay: analysis drawing helpers and coordinate mapping
// ---------------------------------------------------------------- SVG overlay: drawings + analysis
const NS = 'http://www.w3.org/2000/svg';
const svg = document.createElementNS(NS, 'svg');
svg.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;z-index:3;overflow:hidden';
$('chart-wrap').appendChild(svg);
let dirty = true;

function period() { return tf().sec; }
function timeToLogical(t) {
  const c = S.candles, n = c.length; if (!n) return null;
  if (t <= c[0].time) return (t - c[0].time) / period();
  if (t >= c[n - 1].time) return n - 1 + (t - c[n - 1].time) / period();
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m].time <= t) lo = m; else hi = m; }
  return lo + (t - c[lo].time) / (c[hi].time - c[lo].time);
}
function logicalToTime(l) {
  const c = S.candles, n = c.length; if (!n) return null;
  if (l <= 0) return c[0].time + l * period();
  if (l >= n - 1) return c[n - 1].time + (l - (n - 1)) * period();
  const i = Math.floor(l); return c[i].time + (l - i) * (c[i + 1].time - c[i].time);
}
// logicalToCoordinate() only handles whole bar indexes → interpolate fractional positions ourselves
function lToX(ts, l) {
  if (l == null || !isFinite(l)) return null;
  const f = Math.floor(l), a = ts.logicalToCoordinate(f);
  if (l === f || a == null) return a;
  const b = ts.logicalToCoordinate(f + 1);
  return b == null ? a : a + (b - a) * (l - f);
}
const xOf = (t) => { const l = timeToLogical(t); return l == null ? null : lToX(chart.timeScale(), l); };
const xIdx = (i) => chart.timeScale().logicalToCoordinate(i);
const yOf = (p) => (main ? main.priceToCoordinate(p) : null);

function el(tag, attrs, parent) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); (parent || svg).appendChild(e); return e; }
function txt(x, y, s, color, anchor = 'start', size = 11, weight = 400) { const t = el('text', { x, y, fill: color, 'font-size': size, 'font-weight': weight, 'text-anchor': anchor, 'font-family': '-apple-system, sans-serif' }); t.textContent = s; return t; }
// layout-aware text for analysis overlays: nudges a label up/down until it no longer overlaps another one
let _lbls = [];
function resetLabels() { _lbls = []; }
function ltxt(x, y, s, color, anchor = 'start', size = 10, weight = 400) {
  const w = String(s).length * size * 0.6, h = size + 2;
  const box = (yy) => { const x0 = anchor === 'end' ? x - w : anchor === 'middle' ? x - w / 2 : x; return { x0, x1: x0 + w, y0: yy - size, y1: yy + 2 }; };
  const hit = (b) => _lbls.some((o) => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0);
  let yy = y;
  for (let k = 1; k <= 8 && hit(box(yy)); k++) yy = y + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * h;
  _lbls.push(box(yy));
  return txt(x, yy, s, color, anchor, size, weight);
}
function label(x, y, s, bg, fg = '#fff', anchor = 'middle') {
  const w = s.length * 6.4 + 10, x0 = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
  el('rect', { x: x0, y: y - 12, width: w, height: 16, rx: 3, fill: bg });
  txt(x0 + w / 2, y, s, fg, 'middle', 10.5, 600);
}

// position box like TradingView's long/short tool
function positionBox(s, W, active) {
  const x1 = xIdx(s.idx); if (x1 == null) return;
  const endIdx = active ? s.idx + 25 : (s.r2.at ?? s.idx + 25);
  let x2 = Math.min(W, xIdx(endIdx)); if (x2 - x1 < 30) x2 = x1 + 30;
  const ye = yOf(s.entry), ys = yOf(s.sl), yt1 = yOf(s.tp1), yt2 = yOf(s.tp2);
  if ([ye, ys, yt2].some((v) => v == null)) return;
  el('rect', { x: x1, y: Math.min(ye, yt2), width: x2 - x1, height: Math.abs(yt2 - ye), fill: '#26a69a2e', stroke: '#26a69a88' });
  el('rect', { x: x1, y: Math.min(ye, ys), width: x2 - x1, height: Math.abs(ys - ye), fill: '#ef53502e', stroke: '#ef535088' });
  el('line', { x1, y1: yt1, x2, y2: yt1, stroke: UP, 'stroke-dasharray': '3 3' });
  el('line', { x1, y1: ye, x2, y2: ye, stroke: TC().fg, 'stroke-width': 1.5 });
  if (active) {
    const lx = x2 + 4;
    label(lx, ye + 4, `Entry ${fmt(s.entry)}`, '#434651', '#fff', 'start');
    label(lx, ys + 4, `SL ${fmt(s.sl)}`, DOWN, '#fff', 'start');
    label(lx, yt1 + 4, `TP1 ${fmt(s.tp1)}`, '#1e7d74', '#fff', 'start');
    label(lx, yt2 + 4, `TP2 ${fmt(s.tp2)}`, UP, '#fff', 'start');
  }
}

function drawAnalysis(W, H) {
  const A = S.A; if (!A) return;
  const vr = chart.timeScale().getVisibleLogicalRange(); if (!vr) return;
  const from = Math.max(0, Math.floor(vr.from) - 2), to = Math.min(A.n - 1, Math.ceil(vr.to) + 2);
  const inView = (i) => i >= from && i <= to;
  const a = A.atr[A.n - 1] || 0;
  const pad = 14;

  if (S.an.autofib) drawAutoFib(W);
  if (S.an.liquidity && S.B) drawLiquidity(W);
  if (S.an.bounce && S.B) drawBounce(W);
  if (S.an.zones) for (const z of A.zones) {
    const yt = yOf(z.top), yb = yOf(z.bottom); if (yt == null || yb == null) continue;
    const x0 = Math.max(0, xIdx(z.first) ?? 0);
    const col = z.kind === 'support' ? UP : DOWN;
    el('rect', { x: x0, y: Math.min(yt, yb), width: Math.max(0, W - x0), height: Math.max(2, Math.abs(yb - yt)), fill: col + '1a', stroke: col + '55', 'stroke-dasharray': '2 3' });
    txt(W - 6, Math.min(yt, yb) - 3, `${z.kind === 'support' ? 'แนวรับ' : 'แนวต้าน'} ×${z.touches}`, col, 'end', 10);
  }

  if (S.an.swing) {
    const sw = A.swings.filter((s, k) => inView(s.i) || (A.swings[k + 1] && inView(A.swings[k + 1].i)) || (A.swings[k - 1] && inView(A.swings[k - 1].i)));
    if (sw.length > 1) {
      const pts = sw.map((s) => `${xIdx(s.i)},${yOf(s.price)}`).join(' ');
      el('polyline', { points: pts, fill: 'none', stroke: TC().muted, 'stroke-width': 1.2, 'stroke-opacity': 0.75 });
    }
    sw.forEach((s, k) => {
      const x = xIdx(s.i), y = yOf(s.price); if (x == null || y == null) return;
      const isH = s.type === 'H';
      const strong = s.label === 'HH' || s.label === 'HL';
      const col = s.label === 'H' || s.label === 'L' ? '#9aa0ad' : strong ? UP : DOWN;
      txt(x, isH ? y - 8 : y + 16, s.label, col, 'middle', 10.5, 700);
      if (S.an.legs && k > 0 && s.legBars) {
        const p = sw[k - 1], mx = (x + xIdx(p.i)) / 2, my = (y + yOf(p.price)) / 2;
        txt(mx + 6, my, String(s.legBars), '#787b86', 'start', 9.5);
      }
    });
  }

  if (S.an.structure) for (const e of A.events) {
    if (e.idx < from - 50 || e.from > to) continue;
    const x1 = xIdx(e.from), x2 = xIdx(e.idx), y = yOf(e.price); if (x1 == null || x2 == null || y == null) continue;
    const col = e.dir === 1 ? UP : DOWN;
    el('line', { x1, y1: y, x2, y2: y, stroke: col, 'stroke-width': 1, 'stroke-dasharray': e.type === 'CHoCH' ? '5 3' : '2 2' });
    txt((x1 + x2) / 2, e.dir === 1 ? y - 4 : y + 12, e.type, col, 'middle', 10, e.type === 'CHoCH' ? 700 : 500);
  }

  if (S.an.patterns || S.an.td) for (let i = from; i <= to; i++) {
    const c = S.candles[i]; if (!c) continue;
    const x = xIdx(i); if (x == null) continue;
    const yH = yOf(c.high), yL = yOf(c.low);
    let above = yH - 6, below = yL + 14;
    if (S.an.swing) { const s = A.swings.find((q) => q.i === i); if (s) { if (s.type === 'H') above -= 13; else below += 13; } }
    if (S.an.patterns) for (const p of A.patterns[i]) {
      const def = AN.PAT[p]; if (!def) continue;
      if (def.dir === 1) { txt(x, below, def.short, UP, 'middle', 9.5, 600); below += 11; }
      else if (def.dir === -1) { txt(x, above, def.short, DOWN, 'middle', 9.5, 600); above -= 11; }
      else { txt(x, above, def.short, '#787b86', 'middle', 9); above -= 11; }
    }
    if (S.an.td) {
      const u = A.td.up[i], d = A.td.dn[i];
      if (u) txt(x, above, String(u), u === 9 ? '#ff9800' : '#787b86', 'middle', u === 9 ? 11 : 9, u === 9 ? 700 : 400);
      if (d) txt(x, below, String(d), d === 9 ? '#00bcd4' : '#787b86', 'middle', d === 9 ? 11 : 9, d === 9 ? 700 : 400);
    }
  }

  const act = activeSignal();
  if (S.an.history) for (const s of A.signals) {
    if (!inView(s.idx) || s === act) continue;
    if (S.an.learnOnly && s.learned !== 'good') continue;
    const x = xIdx(s.idx), c = S.candles[s.idx];
    const res = s.r2.res, col = res === 'win' ? UP : res === 'loss' ? DOWN : '#9aa0ad';
    if (s.dir === 1) { const y = yOf(c.low) + 30; el('path', { d: `M${x} ${y - 9} l5 8 h-10 z`, fill: col }); txt(x, y + 11, res === 'win' ? '✓' : res === 'loss' ? '✗' : '·', col, 'middle', 10, 700); }
    else { const y = yOf(c.high) - 30; el('path', { d: `M${x} ${y + 9} l5 -8 h-10 z`, fill: col }); txt(x, y - 4, res === 'win' ? '✓' : res === 'loss' ? '✗' : '·', col, 'middle', 10, 700); }
  }
  if (S.an.signals && act && !(S.an.learnOnly && act.learned !== 'good')) positionBox(act, W, true);

  // custom-script markers
  for (const ind of S.inds) {
    if (ind.type !== 'custom') continue;
    const out = customOut.get(ind.id); if (!out) continue;
    for (const m of out.markers) {
      if (!inView(m.index)) continue;
      const c = S.candles[m.index]; if (!c) continue;
      const x = xIdx(m.index);
      if (m.position === 'above') label(x, yOf(c.high) - pad - 6, m.text, m.color);
      else label(x, yOf(c.low) + pad + 14, m.text, m.color);
    }
  }
}
export { dirty, drawAnalysis, el, lToX, label, logicalToTime, resetLabels, svg, timeToLogical, txt, yOf };
