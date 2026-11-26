import { PT, def } from './src/pt.ts';
import { view } from './src/state.ts';
import { toast } from './src/ui/toast.ts';
import { ICON } from './icons.js';
import { AN, BOUNCE } from './src/legacy/core.ts';
import { $, DOWN, S, TC, UP, esc, fibColor, fmt, store, tf } from './app-core.js';
import { SETUP_TH, pct, rr, sigPayload } from './app-analysis.js';
import { mount, flushSync } from 'svelte';
import Bounce from './src/ui/tabs/Bounce.svelte';
import { bounceTick as bounceTickStore } from './src/ui/tabs/bounce-view.ts';
def({ runBounce: [() => runBounce, (v) => { runBounce = v; }], renderBounce: [() => renderBounce, (v) => { renderBounce = v; }], drawBounce: [() => drawBounce, (v) => { drawBounce = v; }], drawLiquidity: [() => drawLiquidity, (v) => { drawLiquidity = v; }], autoFibLeg: [() => autoFibLeg, (v) => { autoFibLeg = v; }], drawAutoFib: [() => drawAutoFib, (v) => { drawAutoFib = v; }], bounceTimer: [() => bounceTimer, (v) => { bounceTimer = v; }], bounceTick: [() => bounceTick, (v) => { bounceTick = v; }], checkBounce: [() => checkBounce, (v) => { checkBounce = v; }], checkNewSignal: [() => checkNewSignal, (v) => { checkNewSignal = v; }] });
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
function drawBounce(W) {
  const both = bnSides().length === 2;
  for (const sd of bnSides()) {
    const zs = both ? S.B[sd].slice(0, 2) : S.B[sd], col = sd === 'buy' ? UP : DOWN;
    zs.forEach((z, k) => {
      const yt = PT.yOf(Math.max(z.lo, z.hi)), yb = PT.yOf(Math.min(z.lo, z.hi)); if (yt == null || yb == null) return;
      const x0 = Math.max(0, PT.xIdx(z.born) ?? 0);
      PT.el('rect', { x: x0, y: yt, width: Math.max(0, W - x0), height: Math.max(3, yb - yt), fill: col + (k === 0 ? '30' : '1c'), stroke: col + (k === 0 ? 'cc' : '66'), 'stroke-width': k === 0 ? 1.5 : 1 });
      PT.ltxt(W - 8, (sd === 'buy' ? yb + 12 : yt - 4), `${sd === 'buy' ? 'จุดเด้ง Buy' : 'จุดเด้ง Sell'} ${'★'.repeat(z.stars)} ${z.types.map((t) => BOUNCE.TYPE[t].short).join('+')}`, col, 'end', 10, k === 0 ? 700 : 400);
      if (k === 0) {
        const ys = PT.yOf(z.sl), ytp = PT.yOf(z.tp1), lx = x0 + 4;
        if (ys != null) { PT.el('line', { x1: x0, y1: ys, x2: W, y2: ys, stroke: col, 'stroke-dasharray': '2 3', opacity: 0.8 }); PT.ltxt(lx, ys + (sd === 'buy' ? 12 : -4), `SL ${sd === 'buy' ? 'Buy' : 'Sell'} ${fmt(z.sl)}`, col, 'start', 10); }
        if (ytp != null && !both) { PT.el('line', { x1: x0, y1: ytp, x2: W, y2: ytp, stroke: col, 'stroke-dasharray': '6 3' }); PT.ltxt(lx, ytp + (sd === 'buy' ? -4 : 12), `TP ${fmt(z.tp1)} (${z.rr1.toFixed(1)}R)`, col, 'start', 10); }
      }
    });
  }
}
function drawLiquidity(W) {
  const L = S.B.liq, AMB = '#f6c343';
  for (const p of [...L.highs.slice(0, 4), ...L.lows.slice(0, 4)]) {
    const y = PT.yOf(p.price); if (y == null) continue;
    const x0 = Math.max(0, PT.xIdx(p.first) ?? 0);
    PT.el('line', { x1: x0, y1: y, x2: W, y2: y, stroke: AMB, 'stroke-width': p.strength >= 2 ? 1.5 : 1, 'stroke-dasharray': '6 4', opacity: p.strength >= 2 ? 0.95 : 0.6 });
    const ly = p.side === 'high' ? y - 4 : y + 12;
    PT.ltxt(W - 8, ly, `${'$'.repeat(Math.min(3, p.strength))} SL ${p.side === 'high' ? 'Sell' : 'Buy'} · ${BOUNCE.poolName(p, false)}`, AMB, 'end', 10, p.strength >= 2 ? 700 : 400);
  }
  for (const x of L.sweeps) {
    const xx = PT.xIdx(x.j), y = PT.yOf(x.price); if (xx == null || y == null) continue;
    PT.el('line', { x1: xx - 14, y1: y, x2: xx + 14, y2: y, stroke: AMB, 'stroke-width': 2 });
    PT.ltxt(xx, x.side === 'low' ? y + 22 : y - 12, 'กวาด SL', AMB, 'middle', 10, 700);
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
function drawAutoFib(W) {
  const L = autoFibLeg(); if (!L) return;
  const { a, b } = L, x0 = Math.max(0, PT.xIdx(a.i) ?? 0), at = (k) => b.price - (b.price - a.price) * k, ext = (k) => a.price + (b.price - a.price) * k;
  const xa = PT.xIdx(a.i), xb = PT.xIdx(b.i), ya = PT.yOf(a.price), yb = PT.yOf(b.price);
  if (xa != null && xb != null && ya != null && yb != null) PT.el('line', { x1: xa, y1: ya, x2: xb, y2: yb, stroke: TC().muted, 'stroke-dasharray': '4 4' });
  const line = (price, k, text, strong) => { const y = PT.yOf(price); if (y == null) return; const c = fibColor(k);
    PT.el('line', { x1: x0, y1: y, x2: W, y2: y, stroke: c, 'stroke-width': strong ? 1.5 : 1, opacity: strong ? 1 : 0.75, 'stroke-dasharray': strong ? '' : '5 4' });
    PT.ltxt(x0 + 4, y - 3, `${text} ${fmt(price)}`, c, 'start', 10, strong ? 700 : 400); };
  const g1 = PT.yOf(at(0.618)), g2 = PT.yOf(at(0.786));
  if (g1 != null && g2 != null) PT.el('rect', { x: x0, y: Math.min(g1, g2), width: Math.max(0, W - x0), height: Math.abs(g2 - g1), fill: '#08998118' });
  for (const k of [0.382, 0.5, 0.618, 0.786]) line(at(k), k, `Fibo ${(k * 100).toFixed(1)}%`, k === 0.618);
  for (const k of [1.272, 1.618, 2.618]) line(ext(k), k, `เป้า ${(k * 100).toFixed(1)}%${k >= 1.618 ? ' ◎' : ''}`, k === 1.618 || k === 2.618);
}
let bounceTimer = 0;
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
    PT.desktopNotify(title, body); PT.beep(); toast(title + ' · ' + body, 'ok', 8000);
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
  const text = `${s.dir === 1 ? '🟢' : '🔴'} ${side} ${S.symbol} ${tf().label}\n${SETUP_TH[s.setup]} · ${AN.PAT[s.pattern].name}\nEntry ${fmt(s.entry)} | SL ${fmt(s.sl)} | TP1 ${fmt(s.tp1)} | TP2 ${fmt(s.tp2)}\nสถิติก่อนหน้า: ${s.prior.n} ไม้, TP2 ${pct(s.prior.wr2)}, ${rr(s.prior.exp)}`;
  PT.desktopNotify(`${side} ${S.symbol} ${tf().label}`, `Entry ${fmt(s.entry)} · SL ${fmt(s.sl)} · TP2 ${fmt(s.tp2)}`);
  PT.beep();
  vcg.log('info', `สัญญาณใหม่ ${side} ${S.symbol} ${tf().label} @ ${fmt(s.entry)}`, null, 'signal');
  vcg.notify('signal', sigPayload(s), text);
}
if ($('an-bounce')) mount(Bounce, { target: $('an-bounce'), props: { pct } });
export { bounceTick, drawAutoFib, drawBounce, drawLiquidity, runBounce };
