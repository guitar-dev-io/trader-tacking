/* global S, store, $, esc, fmt, digits, tf, TZ, setAllData, pushLast, chart, toast, vcg, el, label, txt, yOf, xIdx, chartW, autoVpp, vpp, plannerLot,
   drawings:writable, saveDrawings, drawingsKey, switchSymbol, renderTfs, loadChart, dirty:writable, UP, DOWN, renderLayers, normalize, onQuotesMsg:writable, desktopNotify, beep */
// Learning tools: Bar Replay, paper trading (simulated orders on live or replay data), practice exercises, journal & stats, lesson packs.

// ================================================================ Bar Replay
const REPLAY = (() => {
  const bar = document.createElement('div');
  bar.id = 'replaybar'; bar.className = 'hidden';
  bar.innerHTML = `<span class="rp-title">⏪ Replay</span>
    <button data-r="back" title="ถอย 1 แท่ง">⏮</button><button data-r="play" title="เล่น/หยุด (Space)">▶</button><button data-r="step" title="เดินหน้า 1 แท่ง (→)">⏭</button>
    <select data-r="speed" title="ความเร็ว"><option value="1">1 แท่ง/วิ</option><option value="2">2/วิ</option><option value="5">5/วิ</option><option value="10">10/วิ</option><option value="25">25/วิ</option></select>
    <span class="rp-info"></span><button data-r="exit" class="rp-exit" title="ออกจาก Replay">✕ ออก</button>`;
  $('chart-wrap').appendChild(bar);
  const info = bar.querySelector('.rp-info'), playBtn = bar.querySelector('[data-r=play]');
  let timer = null, picking = false;

  function start(idx) {
    const full = S.replay ? S.replay.full : S.candles.slice();
    if (full.length < 60) return toast('ข้อมูลกราฟน้อยเกินไปสำหรับ Replay', 'warn');
    idx = Math.max(30, Math.min(full.length - 2, idx));
    stopPlay();
    S.replay = { full, idx, symbol: S.symbol, tf: S.tf };
    S.candles = full.slice(0, idx + 1);
    setAllData();
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, idx - 120), to: idx + 25 });
    bar.classList.remove('hidden'); document.body.classList.add('replaying');
    if (typeof MTF !== 'undefined') MTF.replaySync();
    update(); vcg.log('info', `เริ่ม Replay ${S.symbol} ${tf().label} ที่แท่ง ${idx}`, null, 'learn');
  }
  function step(n = 1) {
    const R = S.replay; if (!R) return;
    for (let k = 0; k < n; k++) {
      if (R.idx >= R.full.length - 1) { stopPlay(); toast('ถึงแท่งล่าสุดแล้ว', 'info'); break; }
      R.idx++; const b = R.full[R.idx];
      S.candles.push({ ...b });
      pushLast(true);
      SIM.onBar(b);
      QUIZ.onBar();
      if (typeof MTF !== 'undefined') MTF.replaySync();
    }
    update();
  }
  function back() {
    const R = S.replay; if (!R || R.idx <= 30) return;
    R.idx--; S.candles = R.full.slice(0, R.idx + 1); setAllData(); update();
    if (typeof MTF !== 'undefined') MTF.replaySync();
  }
  function play() { if (timer) return stopPlay(); const sp = +bar.querySelector('[data-r=speed]').value; timer = setInterval(() => step(1), 1000 / sp); playBtn.textContent = '⏸'; }
  function stopPlay() { clearInterval(timer); timer = null; playBtn.textContent = '▶'; }
  function exit() {
    if (!S.replay) return;
    stopPlay(); QUIZ.abort();
    S.candles = S.replay.full; S.replay = null;
    bar.classList.add('hidden'); document.body.classList.remove('replaying');
    setAllData(); loadChart();
    vcg.log('info', 'ออกจาก Replay', null, 'learn');
  }
  function update() {
    const R = S.replay; if (!R) return;
    const b = R.full[R.idx], d = new Date(b.time * 1000), p = (x) => String(x).padStart(2, '0');
    info.textContent = `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} · ซ่อนอยู่ ${R.full.length - 1 - R.idx} แท่ง`;
    SIM.render();
  }
  bar.addEventListener('click', (e) => {
    const r = e.target.dataset.r; if (!r) return;
    ({ back, play, step: () => step(1), exit })[r]?.();
  });
  bar.querySelector('[data-r=speed]').onchange = () => { if (timer) { stopPlay(); play(); } };
  // pick a start bar by clicking on the chart
  function pick() { picking = true; toast('คลิกบนกราฟที่แท่งที่จะเริ่ม Replay (Esc = ยกเลิก)', 'info'); document.body.classList.add('picking'); }
  $('chart-wrap').addEventListener('click', (ev) => {
    if (!picking) return;
    ev.stopPropagation(); picking = false; document.body.classList.remove('picking');
    const r = $('chart').getBoundingClientRect(); const l = chart.timeScale().coordinateToLogical(ev.clientX - r.left);
    if (l != null) start(Math.round(l));
  }, true);
  document.addEventListener('keydown', (e) => {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (picking && e.key === 'Escape') { picking = false; document.body.classList.remove('picking'); }
    if (!S.replay) return;
    if (e.key === ' ') { e.preventDefault(); play(); }
    if (e.key === 'ArrowRight' && e.shiftKey) { e.preventDefault(); step(10); } else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); back(); }
  });
  return { start, step, exit, pick, stopPlay, play, update, get active() { return !!S.replay; } };
})();

// ================================================================ Paper trading simulator
const SIM = (() => {
  const blank = () => ({ start: 10000, balance: 10000, positions: [], orders: [], history: [] });
  const acc = { live: { ...blank(), ...store.get('sim.live', {}) }, replay: { ...blank(), ...store.get('sim.replay', {}) } };
  const mode = () => (S.replay ? 'replay' : 'live');
  const A = () => acc[mode()];
  const saveAcc = () => { store.set('sim.live', acc.live); store.set('sim.replay', acc.replay); };
  const valuePer = (sym) => autoVpp(sym) || (sym === S.symbol ? vpp() : null) || 1;
  const money = (v) => (v == null || !isFinite(v) ? '—' : (v < 0 ? '-$' : '$') + Math.abs(v).toFixed(2));
  let ticket = { side: 1, type: 'market', price: '', lot: 0.01, sl: '', tp: '', tag: 'pullback', note: '' , ...store.get('sim.ticket', {}) };
  const TAGS = { pullback: 'ย่อตามเทรนด์', breakout: 'เบรกโครงสร้าง', reversal: 'กลับตัว/CHoCH', range: 'เด้งในกรอบ/โซน', news: 'ข่าว', other: 'อื่นๆ' };

  // current prices: live → bid/ask quote; replay → close of the current bar (no spread)
  function px(sym) {
    if (S.replay) { const b = S.candles[S.candles.length - 1]; return sym === S.replay.symbol && b ? { bid: b.close, ask: b.close, t: b.time - TZ } : null; }
    const q = S.quotes[sym]; return q ? { bid: q.bid, ask: q.ask, t: Date.parse(q.time) / 1000 } : null;
  }
  const pnlOf = (p, exit) => (exit - p.entry) * p.side * p.lot * valuePer(p.symbol);
  const rOf = (p, exit) => (p.sl ? ((exit - p.entry) * p.side) / Math.abs(p.entry - p.sl) : null);

  function place() {
    const sym = S.replay ? S.replay.symbol : S.symbol, P = px(sym);
    if (!P) return toast('ยังไม่มีราคาของ ' + sym, 'warn');
    const side = ticket.side, lot = Math.max(0.01, +ticket.lot || 0.01), sl = parseFloat(ticket.sl) || null, tp = parseFloat(ticket.tp) || null;
    const base = { id: Date.now(), symbol: sym, side, lot, sl, tp, tag: ticket.tag, note: ticket.note, mode: mode(), quiz: QUIZ.active() };
    if (ticket.type === 'market') {
      const entry = side === 1 ? P.ask : P.bid;
      if (sl && (entry - sl) * side <= 0) return toast('SL อยู่ผิดฝั่งของราคาเข้า', 'warn');
      if (tp && (tp - entry) * side <= 0) return toast('TP อยู่ผิดฝั่งของราคาเข้า', 'warn');
      A().positions.push({ ...base, entry, openTime: P.t });
      toast(`${side === 1 ? 'BUY' : 'SELL'} ${lot} ${sym} @ ${fmt(entry)} (จำลอง)`, 'ok');
    } else {
      const price = parseFloat(ticket.price); if (!isFinite(price)) return toast('ใส่ราคาของคำสั่งรอ', 'warn');
      A().orders.push({ ...base, type: ticket.type, price, created: P.t });
      toast(`ตั้งคำสั่ง ${ticket.type === 'limit' ? 'Limit' : 'Stop'} ${side === 1 ? 'BUY' : 'SELL'} @ ${fmt(price)}`, 'ok');
    }
    vcg.log('info', `จำลอง: ${ticket.type} ${side === 1 ? 'BUY' : 'SELL'} ${lot} ${sym}`, null, 'sim');
    saveAcc(); render(); dirty = true; QUIZ.onTrade();
  }
  function close(p, exit, reason, t) {
    const a = acc[p.mode] || A();
    a.positions = a.positions.filter((x) => x.id !== p.id);
    const pnl = pnlOf(p, exit), r = rOf(p, exit);
    a.balance += pnl;
    const h = { ...p, exit, reason, closeTime: t, pnl, r };
    a.history.push(h); if (a.history.length > 2000) a.history.shift();
    saveAcc(); render(); dirty = true;
    const msg = `${reason === 'TP' ? '🎯 TP' : reason === 'SL' ? '🛑 SL' : 'ปิด'} ${p.side === 1 ? 'BUY' : 'SELL'} ${p.symbol} ${money(pnl)}${r != null ? ` (${r >= 0 ? '+' : ''}${r.toFixed(2)}R)` : ''}`;
    toast(msg, pnl >= 0 ? 'ok' : 'warn');
    QUIZ.onClose(h);
  }
  // live ticks
  function onQuote(q) {
    const a = acc.live, t = Date.parse(q.time) / 1000;
    for (const o of [...a.orders]) {
      if (o.symbol !== q.symbol) continue;
      const hit = o.side === 1 ? (o.type === 'limit' ? q.ask <= o.price : q.ask >= o.price) : (o.type === 'limit' ? q.bid >= o.price : q.bid <= o.price);
      if (hit) { a.orders = a.orders.filter((x) => x !== o); a.positions.push({ ...o, entry: o.side === 1 ? q.ask : q.bid, openTime: t }); toast(`คำสั่งรอทำงาน: ${o.side === 1 ? 'BUY' : 'SELL'} ${o.symbol} @ ${fmt(o.price)}`, 'ok'); saveAcc(); }
    }
    for (const p of [...a.positions]) {
      if (p.symbol !== q.symbol) continue;
      const px_ = p.side === 1 ? q.bid : q.ask;
      if (p.sl && (px_ - p.sl) * p.side <= 0) close(p, p.sl, 'SL', t);
      else if (p.tp && (px_ - p.tp) * p.side >= 0) close(p, p.tp, 'TP', t);
    }
  }
  // replay bars: conservative — if a bar touches both SL and TP, SL counts first
  function onBar(b) {
    const a = acc.replay, sym = S.replay && S.replay.symbol, t = b.time - TZ;
    for (const o of [...a.orders]) {
      if (o.symbol !== sym) continue;
      const hit = o.side === 1 ? (o.type === 'limit' ? b.low <= o.price : b.high >= o.price) : (o.type === 'limit' ? b.high >= o.price : b.low <= o.price);
      if (hit) { a.orders = a.orders.filter((x) => x !== o); a.positions.push({ ...o, entry: o.price, openTime: t, fillBar: true }); saveAcc(); }
    }
    for (const p of [...a.positions]) {
      if (p.symbol !== sym || p.fillBar) { delete p.fillBar; continue; }
      const slHit = p.sl && (p.side === 1 ? b.low <= p.sl : b.high >= p.sl), tpHit = p.tp && (p.side === 1 ? b.high >= p.tp : b.low <= p.tp);
      if (slHit) close(p, p.sl, 'SL', t); else if (tpHit) close(p, p.tp, 'TP', t);
    }
    render();
  }
  function stats(list) {
    const n = list.length, wins = list.filter((h) => h.pnl > 0), losses = list.filter((h) => h.pnl <= 0);
    const gw = wins.reduce((s, h) => s + h.pnl, 0), gl = -losses.reduce((s, h) => s + h.pnl, 0);
    const rs = list.filter((h) => h.r != null).map((h) => h.r);
    let eq = 0, peak = 0, dd = 0; for (const h of list) { eq += h.pnl; peak = Math.max(peak, eq); dd = Math.max(dd, peak - eq); }
    return { n, win: n ? wins.length / n : null, avgR: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null, pf: gl ? gw / gl : gw ? Infinity : null, total: gw - gl, dd };
  }
  function render() {
    const box = $('sim'); if (!box || $('tab-practice').classList.contains('hidden')) return;
    const a = A(), m = mode();
    let open = 0; for (const p of a.positions) { const P = px(p.symbol); if (P) open += pnlOf(p, p.side === 1 ? P.bid : P.ask); }
    const st = stats(a.history), pct = (v) => (v == null ? '—' : (v * 100).toFixed(0) + '%');
    const byTag = Object.keys(TAGS).map((k) => [k, stats(a.history.filter((h) => h.tag === k))]).filter(([, s]) => s.n);
    box.innerHTML = `
      <div class="panel-h">บัญชีจำลอง · ${m === 'replay' ? 'Replay' : 'ราคาสด'}</div>
      <div class="sum"><span>เงินทุน</span><b>${money(a.balance)}</b><span>กำไร/ขาดทุนที่เปิดอยู่</span><b class="${open >= 0 ? 'up' : 'down'}">${money(open)}</b><span>Equity</span><b>${money(a.balance + open)}</b></div>
      <h4>ส่งคำสั่ง (จำลอง)</h4>
      <div class="seg"><button data-t="side" data-v="1" class="${ticket.side === 1 ? 'on buy' : ''}">▲ Buy</button><button data-t="side" data-v="-1" class="${ticket.side === -1 ? 'on sell' : ''}">▼ Sell</button></div>
      <div class="grid" style="margin-top:6px">
        <label>ประเภท<select data-k="type"><option value="market">Market</option><option value="limit">Limit</option><option value="stop">Stop</option></select></label>
        <label>ราคา (คำสั่งรอ)<input data-k="price" type="number" step="any" value="${esc(ticket.price)}" ${ticket.type === 'market' ? 'disabled' : ''}></label>
        <label>Lot<input data-k="lot" type="number" step="0.01" min="0.01" value="${esc(ticket.lot)}"></label>
        <label>เหตุผล (แท็ก)<select data-k="tag">${Object.entries(TAGS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
        <label>SL<input data-k="sl" type="number" step="any" value="${esc(ticket.sl)}"></label>
        <label>TP<input data-k="tp" type="number" step="any" value="${esc(ticket.tp)}"></label>
      </div>
      <label class="note">บันทึก (ทำไมถึงเข้า)<input data-k="note" value="${esc(ticket.note)}" placeholder="เช่น ย่อมาแตะ HL + BE ที่โซน H1"></label>
      <div class="btns"><button id="sim-plan">ใช้ค่าจากเครื่องคำนวณ</button><button id="sim-lot">lot ตามความเสี่ยง</button><button id="sim-place" class="primary">ส่งคำสั่ง</button></div>
      ${a.positions.length ? `<h4>สถานะที่เปิด</h4><table class="stat"><tbody>${a.positions.map((p) => { const P = px(p.symbol); const pl = P ? pnlOf(p, p.side === 1 ? P.bid : P.ask) : null;
        return `<tr><td class="${p.side === 1 ? 'up' : 'down'}">${p.side === 1 ? 'BUY' : 'SELL'} ${p.lot}</td><td>${p.symbol} @ ${fmt(p.entry)}</td><td class="${pl >= 0 ? 'up' : 'down'}">${money(pl)}</td><td><button data-close="${p.id}">ปิด</button></td></tr>`; }).join('')}</tbody></table>` : ''}
      ${a.orders.length ? `<h4>คำสั่งรอ</h4><table class="stat"><tbody>${a.orders.map((o) => `<tr><td>${o.type} ${o.side === 1 ? 'BUY' : 'SELL'} ${o.lot}</td><td>${o.symbol} @ ${fmt(o.price)}</td><td><button data-cancel="${o.id}">ยกเลิก</button></td></tr>`).join('')}</tbody></table>` : ''}
      <h4>สถิติการฝึก (${st.n} ไม้)</h4>
      <div class="sum"><span>ชนะ</span><b>${pct(st.win)}</b><span>R เฉลี่ย</span><b>${st.avgR == null ? '—' : st.avgR.toFixed(2) + 'R'}</b><span>Profit factor</span><b>${st.pf == null ? '—' : st.pf === Infinity ? '∞' : st.pf.toFixed(2)}</b><span>กำไรรวม</span><b class="${st.total >= 0 ? 'up' : 'down'}">${money(st.total)}</b><span>Drawdown สูงสุด</span><b>${money(-st.dd)}</b></div>
      ${byTag.length ? `<table class="stat"><thead><tr><th>แท็ก</th><th>ไม้</th><th>ชนะ</th><th>R เฉลี่ย</th></tr></thead><tbody>${byTag.map(([k, s]) => `<tr><td>${TAGS[k]}</td><td>${s.n}</td><td>${pct(s.win)}</td><td>${s.avgR == null ? '—' : s.avgR.toFixed(2)}</td></tr>`).join('')}</tbody></table>` : ''}
      ${a.history.length ? `<h4>บันทึกการเทรด (ล่าสุด)</h4><div class="journal">${a.history.slice(-15).reverse().map((h) => `<div class="jr"><b class="${h.pnl >= 0 ? 'up' : 'down'}">${h.pnl >= 0 ? '✓' : '✗'} ${h.side === 1 ? 'BUY' : 'SELL'} ${h.symbol}</b> ${fmt(h.entry)} → ${fmt(h.exit)} · ${h.reason} · ${money(h.pnl)}${h.r != null ? ` · ${h.r.toFixed(2)}R` : ''}${h.quiz ? ' · โจทย์' : ''}<br><span class="muted">${esc(TAGS[h.tag] || '')}${h.note ? ' — ' + esc(h.note) : ''}</span></div>`).join('')}</div>` : ''}
      <div class="btns"><button id="sim-csv">ส่งออกบันทึก (CSV)</button><button id="sim-reset" class="danger">รีเซ็ตบัญชี${m === 'replay' ? ' Replay' : 'สด'}</button></div>`;
    box.querySelector('select[data-k=type]').value = ticket.type; box.querySelector('select[data-k=tag]').value = ticket.tag;
    box.querySelectorAll('[data-k]').forEach((i) => (i.onchange = () => { ticket[i.dataset.k] = i.value; store.set('sim.ticket', ticket); if (i.dataset.k === 'type') render(); }));
    box.querySelectorAll('[data-t=side]').forEach((b) => (b.onclick = () => { ticket.side = +b.dataset.v; store.set('sim.ticket', ticket); render(); }));
    box.querySelectorAll('[data-close]').forEach((b) => (b.onclick = () => { const p = a.positions.find((x) => x.id === +b.dataset.close); const P = p && px(p.symbol); if (P) close(p, p.side === 1 ? P.bid : P.ask, 'manual', P.t); }));
    box.querySelectorAll('[data-cancel]').forEach((b) => (b.onclick = () => { a.orders = a.orders.filter((x) => x.id !== +b.dataset.cancel); saveAcc(); render(); dirty = true; }));
    $('sim-place').onclick = place;
    $('sim-plan').onclick = () => { const p = S.plan; ticket.side = p.side === 'buy' ? 1 : -1; ticket.sl = p.sl; ticket.tp = p.tp2 || p.tp1; if (p.entry) ticket.price = p.entry; store.set('sim.ticket', ticket); render(); };
    $('sim-lot').onclick = () => {
      const sym = S.replay ? S.replay.symbol : S.symbol, P = px(sym), sl = parseFloat(ticket.sl);
      if (!P || !isFinite(sl)) return toast('ใส่ SL ก่อน แล้วแอปจะคำนวณ lot จากความเสี่ยงในแท็บคำนวณ', 'warn');
      const lot = plannerLot(ticket.type === 'market' ? (ticket.side === 1 ? P.ask : P.bid) : parseFloat(ticket.price), sl);
      if (lot) { ticket.lot = lot; store.set('sim.ticket', ticket); render(); } else toast('lot ที่คำนวณได้ต่ำกว่าขั้นต่ำ', 'warn');
    };
    $('sim-reset').onclick = (e) => {
      if (e.target.dataset.armed !== '1') { e.target.dataset.armed = '1'; e.target.textContent = 'กดอีกครั้งเพื่อยืนยัน'; return; }
      acc[m] = blank(); saveAcc(); render(); dirty = true;
    };
    $('sim-csv').onclick = () => {
      const rows = [['mode', 'symbol', 'side', 'lot', 'entry', 'exit', 'sl', 'tp', 'reason', 'pnl', 'r', 'tag', 'note', 'open', 'close', 'quiz']]
        .concat(['live', 'replay'].flatMap((k) => acc[k].history.map((h) => [k, h.symbol, h.side === 1 ? 'BUY' : 'SELL', h.lot, h.entry, h.exit, h.sl, h.tp, h.reason, h.pnl.toFixed(2), h.r == null ? '' : h.r.toFixed(2), h.tag, (h.note || '').replace(/[",\n]/g, ' '), new Date(h.openTime * 1000).toISOString(), new Date(h.closeTime * 1000).toISOString(), h.quiz ? 1 : 0])));
      downloadText(`practice-journal-${new Date().toISOString().slice(0, 10)}.csv`, rows.map((r) => r.join(',')).join('\n'));
    };
  }
  // open positions & pending orders on the chart
  function draw(W) {
    const a = A(), sym = S.replay ? S.replay.symbol : S.symbol;
    for (const p of a.positions.filter((x) => x.symbol === sym)) {
      const P = px(sym), pl = P ? pnlOf(p, p.side === 1 ? P.bid : P.ask) : 0, y = yOf(p.entry); if (y == null) continue;
      el('line', { x1: 0, y1: y, x2: W, y2: y, stroke: p.side === 1 ? '#2962ff' : '#e040fb', 'stroke-width': 1.5 });
      label(W - 6, y + 4, `${p.side === 1 ? 'BUY' : 'SELL'} ${p.lot} · ${money(pl)}`, pl >= 0 ? UP : DOWN, '#fff', 'end');
      if (p.sl) { const ys = yOf(p.sl); el('line', { x1: 0, y1: ys, x2: W, y2: ys, stroke: DOWN, 'stroke-dasharray': '6 4' }); label(W - 6, ys + 4, `SL ${fmt(p.sl)}`, DOWN, '#fff', 'end'); }
      if (p.tp) { const yt = yOf(p.tp); el('line', { x1: 0, y1: yt, x2: W, y2: yt, stroke: UP, 'stroke-dasharray': '6 4' }); label(W - 6, yt + 4, `TP ${fmt(p.tp)}`, UP, '#fff', 'end'); }
    }
    for (const o of a.orders.filter((x) => x.symbol === sym)) {
      const y = yOf(o.price); if (y == null) continue;
      el('line', { x1: 0, y1: y, x2: W, y2: y, stroke: '#ff9800', 'stroke-dasharray': '3 3' });
      label(W - 6, y + 4, `${o.type.toUpperCase()} ${o.side === 1 ? 'BUY' : 'SELL'} ${o.lot}`, '#ff9800', '#000', 'end');
    }
  }
  return { place, onQuote, onBar, render, draw, stats, acc: () => acc, positionsOpen: () => A().positions.length + A().orders.length };
})();

// hook live quotes into the simulator
const _onQuotesMsg = onQuotesMsg;
onQuotesMsg = function (list) { _onQuotesMsg(list); if (!S.replay) { for (const q of list) SIM.onQuote(q); SIM.render(); } };

// ================================================================ Practice exercises (random replay quiz)
const QUIZ = (() => {
  let q = null; // { startIdx, traded, revealUntil }
  function start() {
    const full = S.replay ? S.replay.full : S.candles;
    if (full.length < 400) return toast('ต้องมีข้อมูลอย่างน้อย 400 แท่ง (เปลี่ยน timeframe หรือรอโหลด)', 'warn');
    const idx = 200 + Math.floor(Math.random() * (full.length - 320));
    if (S.replay) REPLAY.exit();
    REPLAY.start(idx);
    q = { startIdx: idx, traded: false, played: 0 };
    toast('🎯 โจทย์ใหม่: วิเคราะห์โครงสร้าง แล้ววางคำสั่งจำลอง (หรือกด "ข้าม") — แอปจะเล่นต่อจนรู้ผล', 'info', 10000);
    render();
  }
  function onTrade() { if (!q || q.traded) return; q.traded = true; render(); REPLAY.play(); }
  function onBar() { if (!q) return; q.played++; if (!q.traded && q.played > 60) finish(null); }
  function onClose(h) { if (!q || !h.quiz) return; if (SIM.positionsOpen() === 0) finish(h); }
  function skip() { if (!q) return; q.traded = true; q.skipped = true; REPLAY.play(); setTimeout(() => finish(null), 0); }
  function finish(h) {
    REPLAY.stopPlay();
    const qq = q; q = null;
    const res = store.get('quiz.results', []);
    res.push({ t: Date.now(), symbol: S.symbol, tf: tf().label, skipped: !!(qq && qq.skipped) || !h, r: h ? h.r : null, pnl: h ? h.pnl : null });
    store.set('quiz.results', res.slice(-500));
    if (h) { const good = h.r != null ? h.r > 0 : h.pnl > 0; toast(`${good ? '✅ ถูกทาง' : '❌ ผิดทาง'} — ${h.reason} ${h.r != null ? h.r.toFixed(2) + 'R' : ''} · ดูกราฟต่อได้ หรือกด "โจทย์ถัดไป"`, good ? 'ok' : 'warn', 10000); beep(); }
    render();
  }
  function abort() { q = null; render(); }
  function render() {
    const box = $('quiz'); if (!box) return;
    const res = store.get('quiz.results', []), done = res.filter((r) => !r.skipped);
    const wins = done.filter((r) => (r.r != null ? r.r > 0 : r.pnl > 0)).length;
    const rs = done.filter((r) => r.r != null).map((r) => r.r);
    box.innerHTML = `<div class="panel-h">ฝึกด้วย Replay</div>
      <p class="muted">ย้อนกราฟแล้วเล่นทีละแท่ง โดยไม่เห็นอนาคต — ฝึกตีโซน วางจุดเข้า SL TP แล้วดูผล</p>
      <div class="btns"><button id="rp-pick">⏪ เลือกจุดเริ่มบนกราฟ</button><button id="rp-quiz" class="primary">🎯 สุ่มโจทย์</button>${q && !q.traded ? '<button id="rp-skip">ข้าม (ไม่เข้า)</button>' : ''}${S.replay ? '<button id="rp-exit">ออกจาก Replay</button>' : ''}</div>
      <div class="sum" style="margin-top:8px"><span>โจทย์ที่ทำ</span><b>${done.length} (ข้าม ${res.length - done.length})</b><span>ถูกทาง</span><b>${done.length ? Math.round((wins / done.length) * 100) + '%' : '—'}</b><span>R เฉลี่ย</span><b>${rs.length ? (rs.reduce((a, b) => a + b, 0) / rs.length).toFixed(2) + 'R' : '—'}</b></div>
      <p class="muted">คีย์ลัด: Space = เล่น/หยุด · → = 1 แท่ง · Shift+→ = 10 แท่ง · ← = ถอย</p>`;
    $('rp-pick').onclick = () => REPLAY.pick();
    $('rp-quiz').onclick = start;
    if ($('rp-skip')) $('rp-skip').onclick = skip;
    if ($('rp-exit')) $('rp-exit').onclick = () => REPLAY.exit();
  }
  return { start, onTrade, onBar, onClose, abort, render, active: () => !!q };
})();

// ================================================================ Lesson packs (share drawings + notes)
function downloadText(name, text) {
  if (vcg.capabilities?.files) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' })); a.download = name; a.click(); }
  navigator.clipboard?.writeText(text).then(() => toast('คัดลอกไว้ในคลิปบอร์ดแล้วด้วย', 'ok'), () => {});
}
const LESSON = (() => {
  function exportPack() {
    const pack = { app: 'Price Tracker', kind: 'lesson', v: 1, symbol: S.symbol, tf: S.tf, note: $('lp-note').value || '', created: new Date().toISOString(),
      replayAt: S.replay ? S.replay.full[S.replay.idx].time - TZ : null, drawings };
    downloadText(`lesson-${S.symbol}-${tf().label}.json`, JSON.stringify(pack));
    vcg.log('info', `ส่งออกบทเรียน ${S.symbol} (${drawings.length} รูปวาด)`, null, 'learn');
  }
  function importPack(text) {
    let p; try { p = JSON.parse(text); } catch (_) { return toast('ข้อความไม่ใช่ไฟล์บทเรียน', 'warn'); }
    if (p.app !== 'Price Tracker' || p.kind !== 'lesson') return toast('ไม่ใช่ไฟล์บทเรียนของ Price Tracker', 'warn');
    if (S.replay) REPLAY.exit();
    store.set('drawings:' + p.symbol, (p.drawings || []).map(normalize));
    if (p.symbol !== S.symbol) switchSymbol(p.symbol); else { drawings = (p.drawings || []).map(normalize); saveDrawings(); dirty = true; }
    if (p.tf !== S.tf) { S.tf = p.tf; store.set('tf', p.tf); renderTfs(); loadChart(); }
    if (p.replayAt) { const go = () => { const i = S.candles.findIndex((c) => c.time - TZ >= p.replayAt); if (i > 0) REPLAY.start(i); }; setTimeout(go, 2500); }
    toast(`นำเข้าบทเรียน ${p.symbol}${p.note ? ': ' + p.note : ''}`, 'ok', 10000);
  }
  function render() {
    const box = $('lesson-pack'); if (!box) return;
    box.innerHTML = `<div class="panel-h">แพ็กบทเรียน (แชร์รูปวาด)</div>
      <p class="muted">ส่งออกโซน/เส้นที่วาดบน ${S.symbol} พร้อมโน้ต ให้คนอื่นนำเข้าแล้วเห็นบนกราฟจุดเดียวกัน (ถ้าอยู่ใน Replay จะจำจุดเริ่มไว้ด้วย)</p>
      <input id="lp-note" placeholder="โน้ตสำหรับผู้เรียน เช่น ดูการย่อมาแตะ Demand H1" style="width:100%">
      <div class="btns"><button id="lp-export">ส่งออก / คัดลอก</button><button id="lp-import-btn">นำเข้า</button></div>
      <textarea id="lp-import" class="hidden" placeholder="วางข้อความบทเรียนที่นี่ แล้วกด นำเข้า อีกครั้ง" style="width:100%;height:80px;margin-top:6px"></textarea>`;
    $('lp-export').onclick = exportPack;
    $('lp-import-btn').onclick = () => { const t = $('lp-import'); if (t.classList.contains('hidden')) { t.classList.remove('hidden'); t.focus(); } else importPack(t.value); };
  }
  return { render, importPack };
})();

// ================================================================ tab + hooks
document.querySelector('#tabs [data-tab="practice"]').addEventListener('click', () => { QUIZ.render(); SIM.render(); LESSON.render(); });
QUIZ.render(); LESSON.render();
