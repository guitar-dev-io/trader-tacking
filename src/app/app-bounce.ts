import { def } from '../pt';
import { view } from '../state';
import { toast } from '../ui/toast';
import { ICON } from './icons';
import { AN, BOUNCE } from '../legacy/core';
import { ui } from '../ui/registry';
import type { PatternKey } from '../core/analysis';
import type { ZoneType } from '../core/bounce';
import { $, DOWN, S, TC, UP, esc, fibColor, fmt, store, tf } from './app-core';
import { SETUP_TH, pct, rr, sigPayload } from './app-analysis';
import { mount, flushSync } from 'svelte';
import Bounce from '../ui/tabs/Bounce.svelte';
import { bounceTick as bounceTickStore } from '../ui/tabs/bounce-view';
import { el, ltxt, xIdx, yOf } from '../ui/overlay';
def({ runBounce: [() => runBounce], checkNewSignal: [() => checkNewSignal] });
ui.bounce = { run: () => runBounce(), checkNewSignal: () => checkNewSignal() };
// Price Tracker renderer · bounce finder (จุดเด้ง), liquidity map, auto-Fibo
// ---------------------------------------------------------------- bounce finder (จุดเด้ง)
function runBounce() {
  const closed = S.candles.slice(0, -1);
  const q = !S.replay && S.quotes[S.symbol], live = S.candles[S.candles.length - 1];
  S.B = S.A ? BOUNCE.find(closed, S.A, { F: fmt, price: q ? (q.bid + q.ask) / 2 : live ? live.close : undefined, slBuf: +S.prefs.slBuf, rr1: +S.prefs.rr1, rr2: +S.prefs.rr2, maxBars: +S.prefs.maxBars }) : null;
  renderBounce(); checkBounce();
}
const bnSides = () => (S.an.bounceSide === 'buy' ? ['buy'] : S.an.bounceSide === 'sell' ? ['sell'] : ['buy', 'sell']);
// the panel is src/ui/tabs/Bounce.svelte (mounted below); renderBounce() re-renders it
function renderBounce() { bounceTickStore.update((n) => n + 1); flushSync(); }
function drawBounce(W: number) {
  const both = bnSides().length === 2;
  for (const sd of bnSides()) {
    const zs = both ? S.B[sd].slice(0, 2) : S.B[sd], col = sd === 'buy' ? UP : DOWN;
    zs.forEach((z: { lo: number; hi: number; born: number; stars: number; types: any[]; sl: number; tp1: number; rr1: number; }, k: number) => {
      const yt = yOf(Math.max(z.lo, z.hi)), yb = yOf(Math.min(z.lo, z.hi)); if (yt == null || yb == null) return;
      const x0 = Math.max(0, xIdx(z.born) ?? 0);
      el('rect', { x: x0, y: yt, width: Math.max(0, W - x0), height: Math.max(3, yb - yt), fill: col + (k === 0 ? '30' : '1c'), stroke: col + (k === 0 ? 'cc' : '66'), 'stroke-width': k === 0 ? 1.5 : 1 });
      ltxt(W - 8, (sd === 'buy' ? yb + 12 : yt - 4), `${sd === 'buy' ? 'จุดเด้ง Buy' : 'จุดเด้ง Sell'} ${'★'.repeat(z.stars)} ${z.types.map((t: ZoneType) => BOUNCE.TYPE[t].short).join('+')}`, col, 'end', 10, k === 0 ? 700 : 400);
      if (k === 0) {
        const ys = yOf(z.sl), ytp = yOf(z.tp1), lx = x0 + 4;
        if (ys != null) { el('line', { x1: x0, y1: ys, x2: W, y2: ys, stroke: col, 'stroke-dasharray': '2 3', opacity: 0.8 }); ltxt(lx, ys + (sd === 'buy' ? 12 : -4), `SL ${sd === 'buy' ? 'Buy' : 'Sell'} ${fmt(z.sl)}`, col, 'start', 10); }
        if (ytp != null && !both) { el('line', { x1: x0, y1: ytp, x2: W, y2: ytp, stroke: col, 'stroke-dasharray': '6 3' }); ltxt(lx, ytp + (sd === 'buy' ? -4 : 12), `TP ${fmt(z.tp1)} (${z.rr1.toFixed(1)}R)`, col, 'start', 10); }
      }
    });
  }
}
function drawLiquidity(W: number) {
  const L = S.B.liq, AMB = '#f6c343';
  for (const p of [...L.highs.slice(0, 4), ...L.lows.slice(0, 4)]) {
    const y = yOf(p.price); if (y == null) continue;
    const x0 = Math.max(0, xIdx(p.first) ?? 0);
    el('line', { x1: x0, y1: y, x2: W, y2: y, stroke: AMB, 'stroke-width': p.strength >= 2 ? 1.5 : 1, 'stroke-dasharray': '6 4', opacity: p.strength >= 2 ? 0.95 : 0.6 });
    const ly = p.side === 'high' ? y - 4 : y + 12;
    ltxt(W - 8, ly, `${'$'.repeat(Math.min(3, p.strength))} SL ${p.side === 'high' ? 'Sell' : 'Buy'} · ${BOUNCE.poolName(p, false)}`, AMB, 'end', 10, p.strength >= 2 ? 700 : 400);
  }
  for (const x of L.sweeps) {
    const xx = xIdx(x.j), y = yOf(x.price); if (xx == null || y == null) continue;
    el('line', { x1: xx - 14, y1: y, x2: xx + 14, y2: y, stroke: AMB, 'stroke-width': 2 });
    ltxt(xx, x.side === 'low' ? y + 22 : y - 12, 'กวาด SL', AMB, 'middle', 10, 700);
  }
}
// auto Fibonacci on the latest completed swing leg: retracement inside the leg + extension targets beyond it
function autoFibLeg() {
  const A = S.A; if (!A || A.swings.length < 2) return null;
  // the most recent leg that is big enough to matter (≥ 3 ATR); tiny last legs make unreadable levels
  const atr = A.atr[A.n - 1] || 0, sw = A.swings;
  for (let k = sw.length - 1; k >= 1 && k >= sw.length - 8; k--) {
    const a = sw[k - 1], b = sw[k];
    if (Math.abs(b.price - a.price) >= 3 * atr) return { a, b, dir: b.price > a.price ? 1 : -1 };
  }
  const a = sw[sw.length - 2], b = sw[sw.length - 1];
  return { a, b, dir: b.price > a.price ? 1 : -1 };
}
function drawAutoFib(W: number) {
  const L = autoFibLeg(); if (!L) return;
  const { a, b } = L, x0 = Math.max(0, xIdx(a.i) ?? 0), at = (k: number) => b.price - (b.price - a.price) * k, ext = (k: number) => a.price + (b.price - a.price) * k;
  const xa = xIdx(a.i), xb = xIdx(b.i), ya = yOf(a.price), yb = yOf(b.price);
  if (xa != null && xb != null && ya != null && yb != null) el('line', { x1: xa, y1: ya, x2: xb, y2: yb, stroke: TC().muted, 'stroke-dasharray': '4 4' });
  const line = (price: number, k: number, text: string, strong: boolean) => { const y = yOf(price); if (y == null) return; const c = fibColor(k);
    el('line', { x1: x0, y1: y, x2: W, y2: y, stroke: c, 'stroke-width': strong ? 1.5 : 1, opacity: strong ? 1 : 0.75, 'stroke-dasharray': strong ? '' : '5 4' });
    ltxt(x0 + 4, y - 3, `${text} ${fmt(price)}`, c, 'start', 10, strong ? 700 : 400); };
  const g1 = yOf(at(0.618)), g2 = yOf(at(0.786));
  if (g1 != null && g2 != null) el('rect', { x: x0, y: Math.min(g1, g2), width: Math.max(0, W - x0), height: Math.abs(g2 - g1), fill: '#08998118' });
  for (const k of [0.382, 0.5, 0.618, 0.786]) line(at(k), k, `Fibo ${(k * 100).toFixed(1)}%`, k === 0.618);
  for (const k of [1.272, 1.618, 2.618]) line(ext(k), k, `เป้า ${(k * 100).toFixed(1)}%${k >= 1.618 ? ' ◎' : ''}`, k === 1.618 || k === 2.618);
}
let bounceTimer: ReturnType<typeof setTimeout> | 0 = 0;
function bounceTick() { // re-evaluate status as the live price moves (throttled)
  if (!S.A || bounceTimer) return;
  bounceTimer = setTimeout(() => { bounceTimer = 0; if (S.A) { runBounce(); view.dirty = true; } }, 1500);
}
function checkBounce() {
  const B = S.B; if (!B || !S.an.notify) return;
  for (const sd of ['buy', 'sell']) {
    const z = B[sd][0]; if (!z || z.stars < 3 || z.status === 'wait') continue;
    const key = `bn|${S.symbol}|${tf().label}|${sd}|${fmt(z.entry)}|${z.status}`;
    if (S.notified[key]) continue;
    S.notified[key] = Date.now(); store.set('notified', S.notified);
    const title = `${z.status === 'confirmed' ? '✅' : '👀'} ${S.symbol} ${tf().label} ${z.status === 'confirmed' ? 'ยืนยันเด้ง' : 'เข้าโซนเด้ง'} ${sd === 'buy' ? 'Buy' : 'Sell'}`;
    const body = `โซน ${fmt(Math.min(z.lo, z.hi))}–${fmt(Math.max(z.lo, z.hi))} · Entry ${fmt(z.entry)} · SL ${fmt(z.sl)} · TP ${fmt(z.tp1)}`;
    ui.notify?.desktop(title, body); ui.notify?.beep(); toast(title + ' · ' + body, 'ok', 8000);
    vcg.log('info', title + ' ' + body, null, 'signal');
    vcg.notify('bounce', { symbol: S.symbol, timeframe: tf().label, side: sd.toUpperCase(), status: z.status, zone: [z.lo, z.hi], entry: z.entry, sl: z.sl, tp1: z.tp1, tp2: z.tp2, stars: z.stars }, title + '\n' + body);
  }
}

function checkNewSignal() {
  const A = S.A; if (!A || !S.an.notify) return;
  const s = A.signals[A.signals.length - 1];
  if (!s || s.idx !== A.n - 1) return;            // only a signal on the candle that just closed
  if (S.an.learnOnly && s.learned !== 'good') return;
  const key = `${S.symbol}|${tf().label}|${s.time}`;
  if (S.notified[key]) return;
  S.notified[key] = Date.now();
  const keys = Object.keys(S.notified); if (keys.length > 300) keys.slice(0, keys.length - 300).forEach((k) => delete S.notified[k]);
  store.set('notified', S.notified);
  const side = s.dir === 1 ? 'BUY' : 'SELL';
  const text = `${s.dir === 1 ? '🟢' : '🔴'} ${side} ${S.symbol} ${tf().label}\n${SETUP_TH[s.setup]} · ${AN.PAT[s.pattern as PatternKey].name}\nEntry ${fmt(s.entry)} | SL ${fmt(s.sl)} | TP1 ${fmt(s.tp1)} | TP2 ${fmt(s.tp2)}\nสถิติก่อนหน้า: ${s.prior.n} ไม้, TP2 ${pct(s.prior.wr2)}, ${rr(s.prior.exp)}`;
  ui.notify?.desktop(`${side} ${S.symbol} ${tf().label}`, `Entry ${fmt(s.entry)} · SL ${fmt(s.sl)} · TP2 ${fmt(s.tp2)}`);
  ui.notify?.beep();
  vcg.log('info', `สัญญาณใหม่ ${side} ${S.symbol} ${tf().label} @ ${fmt(s.entry)}`, null, 'signal');
  vcg.notify('signal', sigPayload(s), text);
}
if ($('an-bounce')) mount(Bounce, { target: $('an-bounce'), props: { pct } });
export { bounceTick, drawAutoFib, drawBounce, drawLiquidity, runBounce };
