import { PT, def } from './src/pt.ts';
import { view } from './src/state.ts';
import { toast } from './src/ui/toast.ts';
import { ICON } from './icons.js';
import { AN, BOUNCE } from './src/legacy/core.ts';
import { $, DOWN, S, TC, UP, esc, fibColor, fmt, store, tf } from './app-core.js';
import { SETUP_TH, pct, rr, sigPayload } from './app-analysis.js';
def({ runBounce: [() => runBounce, (v) => { runBounce = v; }], BSTAT_TH: [() => BSTAT_TH], bnSides: [() => bnSides], renderBounce: [() => renderBounce, (v) => { renderBounce = v; }], statHtml: [() => statHtml, (v) => { statHtml = v; }], liqHtml: [() => liqHtml, (v) => { liqHtml = v; }], bindBounce: [() => bindBounce, (v) => { bindBounce = v; }], drawBounce: [() => drawBounce, (v) => { drawBounce = v; }], drawLiquidity: [() => drawLiquidity, (v) => { drawLiquidity = v; }], autoFibLeg: [() => autoFibLeg, (v) => { autoFibLeg = v; }], drawAutoFib: [() => drawAutoFib, (v) => { drawAutoFib = v; }], bounceTimer: [() => bounceTimer, (v) => { bounceTimer = v; }], bounceTick: [() => bounceTick, (v) => { bounceTick = v; }], checkBounce: [() => checkBounce, (v) => { checkBounce = v; }], checkNewSignal: [() => checkNewSignal, (v) => { checkNewSignal = v; }] });
// Price Tracker renderer · bounce finder (จุดเด้ง), liquidity map, auto-Fibo
// ---------------------------------------------------------------- bounce finder (จุดเด้ง)
function runBounce() {
  const closed = S.candles.slice(0, -1);
  const q = !S.replay && S.quotes[S.symbol], live = S.candles[S.candles.length - 1];
  S.B = S.A ? BOUNCE.find(closed, S.A, { F: fmt, price: q ? (q.bid + q.ask) / 2 : live ? live.close : undefined, slBuf: +S.prefs.slBuf, rr1: +S.prefs.rr1, rr2: +S.prefs.rr2, maxBars: +S.prefs.maxBars }) : null;
  renderBounce(); checkBounce();
}
const BSTAT_TH = { wait: ['รอราคา', ''], in: ['ราคาอยู่ในโซน · รอแท่งยืนยัน', 'warn'], confirmed: ['ยืนยันแล้ว · เข้าได้', 'ok'] };
const bnSides = () => (S.an.bounceSide === 'buy' ? ['buy'] : S.an.bounceSide === 'sell' ? ['sell'] : ['buy', 'sell']);
function renderBounce() {
  const box = $('an-bounce'); if (!box) return;
  const B = S.B, mode = ['buy', 'sell'].includes(S.an.bounceSide) ? S.an.bounceSide : 'both', sides = bnSides(), both = mode === 'both';
  const head = `<div class="panel-h bn-h"><span>${ICON.html('target', 16)}หาจุดเด้ง · ${S.symbol} ${tf().label}</span>
    <label class="chk" title="แสดงโซนบนกราฟ"><input type="checkbox" id="bn-show" ${S.an.bounce ? 'checked' : ''}> บนกราฟ</label></div>
    <div class="seg bn-seg"><button data-bs="both" class="${both ? 'on' : ''}">▲▼ ทั้งสองฝั่ง</button><button data-bs="buy" class="${mode === 'buy' ? 'on buy' : ''}">▲ Buy</button><button data-bs="sell" class="${mode === 'sell' ? 'on sell' : ''}">▼ Sell</button></div>`;
  if (!B) { const h = head + '<p class="muted">ต้องมีข้อมูลกราฟอย่างน้อย 60 แท่ง</p>'; if (h !== box._html) { box._html = h; box.innerHTML = h; bindBounce(box); } return; }
  const stars = (k) => '★'.repeat(k) + '<span class="muted">' + '★'.repeat(5 - k) + '</span>';
  const card = (sd) => (z, k) => {
    const buy = sd === 'buy';
    const [stTxt, stCls] = BSTAT_TH[z.status];
    const st = z.stat ? `แตะโซนแบบนี้ (${BOUNCE.TYPE[z.main].short}) ย้อนหลังในกราฟนี้ ${z.stat.n} ครั้ง → เด้งถึง 1R <b>${pct(z.stat.wr1)}</b> · ถึง 2R <b>${pct(z.stat.wr2)}</b>` : 'ยังไม่มีสถิติย้อนหลังของโซนแบบนี้ในข้อมูลที่โหลด';
    return `<div class="bn-card ${sd} ${k === 0 ? 'top' : ''}">
      <div class="bn-top"><span class="${buy ? 'up' : 'down'}"><b>${buy ? '▲ BUY' : '▼ SELL'}</b></span><span class="bn-stars">${stars(z.stars)}</span><b>${fmt(Math.min(z.lo, z.hi))} – ${fmt(Math.max(z.lo, z.hi))}</b>
        <span class="muted" data-bd="${sd}${k}"></span></div>
      <div class="bn-status ${stCls}">${z.status === 'wait' ? ICON.html('hourglass', 14) + (buy ? 'รอราคาย่อลงมาที่โซน' : 'รอราคาเด้งขึ้นมาที่โซน') : ICON.html(z.status === 'in' ? 'eye' : 'circle-check', 14) + stTxt}${z.pattern && z.status !== 'wait' ? ` · ${AN.PAT[z.pattern].name}` : ''}</div>
      <div class="lv">
        <span>Entry</span><b>${fmt(z.entry)}</b><span>${buy ? 'Buy' : 'Sell'} Limit ขอบโซน</span>
        <span class="down">SL</span><b>${fmt(z.sl)}</b><span>${buy ? 'ใต้' : 'เหนือ'}โซน · 1R = ${fmt(Math.abs(z.entry - z.sl))}</span>
        <span class="up">TP1</span><b>${fmt(z.tp1)}</b><span>${z.rr1.toFixed(1)}R ${z.rr1 < 1 ? ICON.html('triangle-alert', 13) + 'ต่ำกว่า 1R' : 'Swing ถัดไป'}</span>
        ${z.tp2 !== z.tp1 ? `<span class="up">TP2</span><b>${fmt(z.tp2)}</b><span>${z.rr2.toFixed(1)}R</span>` : ''}
      </div>
      <ul class="bn-why">${z.why.map((w) => `<li class="${w.neg ? 'neg' : ''}">${esc(w.txt)}</li>`).join('')}</ul>
      <div class="muted bn-stat">${st}</div>
      <div class="btns"><button data-bz="calc" data-sd="${sd}" data-k="${k}">คำนวณ lot</button><button data-bz="sim" data-sd="${sd}" data-k="${k}">ตั้งคำสั่งฝึก</button></div>
      <div class="btns"><button data-bz="layer" data-sd="${sd}" data-k="${k}" title="ไม้ 1 ขอบโซน · ไม้ 2 กลางโซน · ไม้ 3 ปลายโซน · SL เดียวกัน">แบ่ง 3 ไม้ในโซน</button><button data-bz="pyr" data-sd="${sd}" data-k="${k}" title="ไม้แรกที่โซน แล้วเข้าต่อเมื่อราคาไปทางเรา">เข้าแล้วเข้าต่อ (Pyramid)</button></div>
    </div>`;
  };
  let summary = '';
  if (both) {
    const bb = B.buy[0], ss = B.sell[0], tr = S.A.lastTrend;
    const bs = bb ? bb.stars : 0, sss = ss ? ss.stars : 0;
    const bias = bs > sss ? '<b class="up">ฝั่ง Buy น่าสนใจกว่า</b>' : sss > bs ? '<b class="down">ฝั่ง Sell น่าสนใจกว่า</b>' : 'สองฝั่งคะแนนพอๆ กัน — รอดูว่าราคาไปแตะฝั่งไหนก่อนแล้วรอยืนยัน';
    summary = `<div class="bn-sum">เทรนด์ ${tr === 1 ? '<b class="up">ขาขึ้น</b>' : tr === -1 ? '<b class="down">ขาลง</b>' : '<b>ไซด์เวย์</b>'} · Buy ดีสุด ${bb ? '★' + bs + ' ที่ ' + fmt(bb.entry) : '—'} · Sell ดีสุด ${ss ? '★' + sss + ' ที่ ' + fmt(ss.entry) : '—'}<br>→ ${bias}</div>`;
  }
  const section = (sd) => {
    const zs = both ? B[sd].slice(0, 2) : B[sd];
    return (both ? `<div class="bn-sec ${sd === 'buy' ? 'up' : 'down'}">${sd === 'buy' ? '▲ จุดเข้าซื้อ (ใต้ราคา)' : '▼ จุดเข้าขาย (เหนือราคา)'}</div>` : '') +
      (zs.length ? zs.map(card(sd)).join('') : `<p class="muted">ยังไม่พบโซน${sd === 'buy' ? 'รับ' : 'ต้าน'}ที่ยังใช้ได้ในระยะ 10 ATR</p>`);
  };
  const order = both ? ['sell', 'buy'] : sides;   // both: sell zones (above price) on top, buy zones below — same as on the chart
  const html = head + summary + order.map(section).join('') +
    statHtml(order) + liqHtml() + `<p class="muted bn-note">วิธีใช้: ตั้ง Limit ที่ Entry หรือรอให้สถานะเป็น ${ICON.html('circle-check', 13)} (แท่งเทียนกลับตัวในโซน) แล้วค่อยเข้า · ★ มาก = เหตุผลซ้อนกันมาก + ตามเทรนด์ · ไม่ใช่คำแนะนำการลงทุน</p>`;
  if (html !== box._html) { box._html = html; box.innerHTML = html; bindBounce(box); } // unchanged → keep DOM (buttons/clicks stay stable)
  for (const sd of ['buy', 'sell']) B[sd].forEach((z, k) => { const d = box.querySelector(`[data-bd="${sd}${k}"]`); if (d) d.textContent = z.status === 'wait' ? `ห่าง ${fmt(Math.abs(z.dist))} (${Math.abs(z.distAtr).toFixed(1)} ATR)` : ''; });
}
function statHtml(sides) {
  const B = S.B; if (!B) return '';
  const types = ['ob', 'fvg', 'sr', 'fib', 'sweep'];
  const rows = sides.flatMap((sd) => types.map((t) => [sd, t, B.stats[sd][t]]).filter((r) => r[2] && r[2].n >= 3));
  if (!rows.length) return '';
  const cell = (v) => `<td class="${v >= 0.55 ? 'up' : v < 0.4 ? 'down' : ''}">${pct(v)}</td>`;
  return `<div class="panel-h bn-h" style="margin-top:12px"><span>${ICON.html('chart-column', 16)}โซนแบบไหนเด้งดีในกราฟนี้</span></div>
    <table class="stat bn-st"><thead><tr><th>ฝั่ง</th><th>แบบ</th><th>ครั้ง</th><th>ถึง 1R</th><th>ถึง 2R</th></tr></thead><tbody>
    ${rows.map(([sd, t, v]) => `<tr><td class="${sd === 'buy' ? 'up' : 'down'}">${sd === 'buy' ? '▲' : '▼'}</td><td>${BOUNCE.TYPE[t][sd === 'buy' ? 'name' : 'sname']}</td><td>${v.n}</td>${cell(v.wr1)}${cell(v.wr2)}</tr>`).join('')}
    </tbody></table>
    <p class="muted bn-note">วัดแบบเดินหน้า (ใช้ข้อมูล ณ ตอนนั้นเท่านั้น): ตั้ง Limit ที่ขอบโซนตอนราคาแตะครั้งแรก SL ใต้โซน · ใช้เทียบว่าแบบไหนเข้ากับ symbol/TF นี้ ไม่ได้รับประกันอนาคต</p>`;
}
function liqHtml() {
  const L = S.B && S.B.liq; if (!L) return '';
  const row = (p) => `<tr><td>${p.side === 'high' ? '<span class="down">▲</span>' : '<span class="up">▼</span>'} <b>${fmt(p.price)}</b></td><td>${BOUNCE.poolName(p, false)}</td><td>${'$'.repeat(Math.min(3, p.strength))}</td></tr>`;
  const ups = L.highs.slice(0, 3).reverse(), dns = L.lows.slice(0, 3);
  const sw = L.sweeps.slice(0, 3).map((x) => `<li>${ICON.html('brush-cleaning', 14)}กวาด SL ${x.side === 'low' ? 'ใต้' : 'เหนือ'} ${fmt(x.price)} แล้วปิดกลับ · ${S.B && S.A ? S.A.n - 1 - x.j : '?'} แท่งก่อน → ${x.side === 'low' ? '<span class="up">มักเด้งขึ้น</span>' : '<span class="down">มักร่วงลง</span>'}</li>`).join('');
  return `<div class="panel-h bn-h" style="margin-top:12px"><span>${ICON.html('coins', 16)}จุดที่มีเงิน (SL เม่ากองอยู่)</span>
      <label class="chk"><input type="checkbox" id="lq-show" ${S.an.liquidity ? 'checked' : ''}> บนกราฟ</label></div>
    <table class="stat lq"><tbody>${ups.map(row).join('')}<tr class="lq-now"><td colspan="3">— ราคาปัจจุบัน —</td></tr>${dns.map(row).join('')}</tbody></table>
    ${sw ? `<ul class="bn-why">${sw}</ul>` : ''}
    <p class="muted bn-note">▲ เหนือ Swing High / Equal Highs = SL ของคนที่ Sell กองอยู่ · ▼ ใต้ Swing Low / Equal Lows = SL ของคนที่ Buy · ยิ่ง $ มาก (ยอดเท่ากันหลายจุด, PDH/PDL) ยิ่งมีเงินเยอะ ราคามักวิ่งไปกวาดก่อนกลับตัว — อย่าวาง SL ตรงนั้นพอดี และใช้เป็นเป้า TP ได้</p>`;
}
function bindBounce(box) {
  const sw = $('bn-show'); if (sw) sw.onchange = () => { S.an.bounce = sw.checked; store.set('an', S.an); view.dirty = true; };
  const lq = $('lq-show'); if (lq) lq.onchange = () => { S.an.liquidity = lq.checked; store.set('an', S.an); view.dirty = true; };
  box.querySelectorAll('[data-bs]').forEach((b) => (b.onclick = () => { S.an.bounceSide = b.dataset.bs; store.set('an', S.an); renderBounce(); view.dirty = true; }));
  box.querySelectorAll('[data-bz]').forEach((b) => (b.onclick = () => {
    const sd = b.dataset.sd, z = S.B && S.B[sd] && S.B[sd][+b.dataset.k]; if (!z) return;
    if (b.dataset.bz === 'layer' || b.dataset.bz === 'pyr') {
      const lay = b.dataset.bz === 'layer', h = Math.abs(z.hi - z.lo), risk = Math.abs(z.entry - z.sl);
      Object.assign(S.plan, { side: sd, entry: fmt(z.entry), sl: fmt(z.sl), tp1: fmt(z.tp1), tp2: fmt(z.tp2), adds: '2', mode: lay ? 'avg' : 'pyramid',
        spacing: fmt(lay ? Math.max(h / 2, risk * 0.25) : risk), weight: 'equal', trail: lay ? (S.plan.trail || 'none') : 'prev' });
      PT.savePlan(); PT.renderPlanner(); view.dirty = true; document.querySelector('#tabs [data-tab="calc"]').click();
      toast(lay ? 'แบ่ง 3 ไม้ในโซน: ความเสี่ยงรวมทุกไม้ = ที่ตั้งไว้ (ไม่ใช่ไม้ละเท่านั้น)' : 'Pyramid: เข้าต่อทุก 1R ที่ราคาไปทางเรา และเลื่อน SL ไปที่ไม้ก่อนหน้า', 'ok');
      return;
    }
    if (b.dataset.bz === 'calc') {
      Object.assign(S.plan, { side: sd, entry: fmt(z.entry), sl: fmt(z.sl), tp1: fmt(z.tp1), tp2: fmt(z.tp2) });
      PT.savePlan(); PT.renderPlanner(); view.dirty = true; document.querySelector('#tabs [data-tab="calc"]').click();
    } else if (typeof PT.SIM !== 'undefined') PT.SIM.prefill({ side: sd === 'buy' ? 1 : -1, type: 'limit', price: fmt(z.entry), sl: fmt(z.sl), tp: fmt(z.tp1), tag: 'range' });
  }));
}
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
export { bounceTick, drawAutoFib, drawBounce, drawLiquidity, runBounce };
