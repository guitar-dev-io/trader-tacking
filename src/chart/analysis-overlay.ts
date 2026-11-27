// Analysis overlay: swings, structure (BOS/CHoCH), zones, patterns, TD counts, signal history and the
// long/short position box, drawn on the SVG overlay each frame (called from the drawing loop in draw.js).
import { AN } from '../legacy/core';
import { DOWN, S, TC, UP, fmt } from '../app/app-core';
import { chart, customOut } from './chart';
import { activeSignal } from '../app/app-analysis';
import { drawAutoFib, drawBounce, drawLiquidity } from '../app/app-bounce';
import { el, label, txt, xIdx, yOf } from '../ui/overlay';
import type { CustomResult } from './custom';

// position box like TradingView's long/short tool
export function positionBox(s: any, W: number, active: boolean): void {
  const x1 = xIdx(s.idx); if (x1 == null) return;
  const endIdx = active ? s.idx + 25 : (s.r2.at ?? s.idx + 25);
  let x2 = Math.min(W, xIdx(endIdx) as number); if (x2 - x1 < 30) x2 = x1 + 30;
  const ye = yOf(s.entry), ys = yOf(s.sl), yt1 = yOf(s.tp1), yt2 = yOf(s.tp2);
  if (ye == null || ys == null || yt2 == null || yt1 == null) return;
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

export function drawAnalysis(W: number, _H?: number): void {
  const A = S.A; if (!A) return;
  const vr = chart.timeScale().getVisibleLogicalRange(); if (!vr) return;
  const from = Math.max(0, Math.floor(vr.from) - 2), to = Math.min(A.n - 1, Math.ceil(vr.to) + 2);
  const inView = (i: number) => i >= from && i <= to;
  const a = A.atr[A.n - 1] || 0;
  const pad = 14;

  if (S.an.autofib) drawAutoFib(W);
  if (S.an.liquidity && S.B) drawLiquidity(W);
  if (S.an.bounce && S.B) drawBounce(W);
  if (S.an.zones) for (const z of A.zones as any[]) {
    const yt = yOf(z.top), yb = yOf(z.bottom); if (yt == null || yb == null) continue;
    const x0 = Math.max(0, xIdx(z.first) ?? 0);
    const col = z.kind === 'support' ? UP : DOWN;
    el('rect', { x: x0, y: Math.min(yt, yb), width: Math.max(0, W - x0), height: Math.max(2, Math.abs(yb - yt)), fill: col + '1a', stroke: col + '55', 'stroke-dasharray': '2 3' });
    txt(W - 6, Math.min(yt, yb) - 3, `${z.kind === 'support' ? 'แนวรับ' : 'แนวต้าน'} ×${z.touches}`, col, 'end', 10);
  }

  if (S.an.swing) {
    const sw = (A.swings as any[]).filter((s, k) => inView(s.i) || (A.swings[k + 1] && inView(A.swings[k + 1].i)) || (A.swings[k - 1] && inView(A.swings[k - 1].i)));
    if (sw.length > 1) {
      const pts = sw.map((s: any) => `${xIdx(s.i)},${yOf(s.price)}`).join(' ');
      el('polyline', { points: pts, fill: 'none', stroke: TC().muted, 'stroke-width': 1.2, 'stroke-opacity': 0.75 });
    }
    sw.forEach((s: any, k: number) => {
      const x = xIdx(s.i), y = yOf(s.price); if (x == null || y == null) return;
      const isH = s.type === 'H';
      const strong = s.label === 'HH' || s.label === 'HL';
      const col = s.label === 'H' || s.label === 'L' ? '#9aa0ad' : strong ? UP : DOWN;
      txt(x, isH ? y - 8 : y + 16, s.label, col, 'middle', 10.5, 700);
      if (S.an.legs && k > 0 && s.legBars) {
        const p = sw[k - 1], mx = (x + (xIdx(p.i) as number)) / 2, my = (y + (yOf(p.price) as number)) / 2;
        txt(mx + 6, my, String(s.legBars), '#787b86', 'start', 9.5);
      }
    });
  }

  if (S.an.structure) for (const e of A.events as any[]) {
    if (e.idx < from - 50 || e.from > to) continue;
    const x1 = xIdx(e.from), x2 = xIdx(e.idx), y = yOf(e.price); if (x1 == null || x2 == null || y == null) continue;
    const col = e.dir === 1 ? UP : DOWN;
    el('line', { x1, y1: y, x2, y2: y, stroke: col, 'stroke-width': 1, 'stroke-dasharray': e.type === 'CHoCH' ? '5 3' : '2 2' });
    txt((x1 + x2) / 2, e.dir === 1 ? y - 4 : y + 12, e.type, col, 'middle', 10, e.type === 'CHoCH' ? 700 : 500);
  }

  if (S.an.patterns || S.an.td) for (let i = from; i <= to; i++) {
    const c = S.candles[i]; if (!c) continue;
    const x = xIdx(i); if (x == null) continue;
    const yH = yOf(c.high) as number, yL = yOf(c.low) as number;
    let above = yH - 6, below = yL + 14;
    if (S.an.swing) { const s = (A.swings as any[]).find((q) => q.i === i); if (s) { if (s.type === 'H') above -= 13; else below += 13; } }
    if (S.an.patterns) for (const p of A.patterns[i] as (keyof typeof AN.PAT)[]) {
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
  if (S.an.history) for (const s of A.signals as any[]) {
    if (!inView(s.idx) || s === act) continue;
    if (S.an.learnOnly && s.learned !== 'good') continue;
    const x = xIdx(s.idx) as number, c = S.candles[s.idx];
    const res = s.r2.res, col = res === 'win' ? UP : res === 'loss' ? DOWN : '#9aa0ad';
    if (s.dir === 1) { const y = (yOf(c.low) as number) + 30; el('path', { d: `M${x} ${y - 9} l5 8 h-10 z`, fill: col }); txt(x, y + 11, res === 'win' ? '✓' : res === 'loss' ? '✗' : '·', col, 'middle', 10, 700); }
    else { const y = (yOf(c.high) as number) - 30; el('path', { d: `M${x} ${y + 9} l5 -8 h-10 z`, fill: col }); txt(x, y - 4, res === 'win' ? '✓' : res === 'loss' ? '✗' : '·', col, 'middle', 10, 700); }
  }
  if (S.an.signals && act && !(S.an.learnOnly && act.learned !== 'good')) positionBox(act, W, true);

  // custom-script markers
  for (const ind of S.inds as any[]) {
    if (ind.type !== 'custom') continue;
    const out = customOut.get(ind.id) as CustomResult | undefined; if (!out) continue;
    for (const m of out.markers) {
      if (!inView(m.index)) continue;
      const c = S.candles[m.index]; if (!c) continue;
      const x = xIdx(m.index) as number;
      if (m.position === 'above') label(x, (yOf(c.high) as number) - pad - 6, m.text, m.color);
      else label(x, (yOf(c.low) as number) + pad + 14, m.text, m.color);
    }
  }
}
