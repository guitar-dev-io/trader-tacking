import { PT, def } from '../pt';
import { view } from '../state';
import { toast } from '../ui/toast';
import { $, DOWN, S, TZ, UP, drawings, esc, fmt, saveDrawings, store, tf, qs, tgt, mk } from './app-core';
import { chart } from '../chart/chart';
import { beep, loadChart, onQuotes, pushLast, setAllData, switchSymbol } from './app-data';
import { el, label, yOf } from '../ui/overlay';
import { renderTfs } from './app';
import { normalize } from '../chart/draw';
import { autoVpp, plannerLot, vpp } from './planner';
import { ui } from '../ui/registry';
import { showSim, tickSim, showQuiz, showLesson } from '../ui/tabs/practice-view';
import { mountReplayBar, setReplay, replaySpeed } from '../ui/tabs/replay-view';

def({ REPLAY: [() => REPLAY], SIM: [() => SIM] });
// Learning tools: Bar Replay, paper trading (simulated orders on live or replay data), practice exercises, journal & stats, lesson packs.

// ================================================================ Bar Replay
const REPLAY = (() => {
  // the control bar is ReplayBar.svelte (src/ui/tabs/replay-view.ts); this module keeps the replay logic
  mountReplayBar($('chart-wrap'), { back: () => back(), play: () => play(), step: () => step(1), exit: () => exit(), speed: (v) => { setReplay({ speed: v }); if (timer) { stopPlay(); play(); } } });
  let timer: ReturnType<typeof setTimeout> | undefined = undefined, picking = false;

  function start(idx: number) {
    const full = S.replay ? S.replay.full : S.candles.slice();
    if (full.length < 60) return toast('ข้อมูลกราฟน้อยเกินไปสำหรับ Replay', 'warn');
    idx = Math.max(30, Math.min(full.length - 2, idx));
    stopPlay();
    S.replay = { full, idx, symbol: S.symbol, tf: S.tf };
    S.candles = full.slice(0, idx + 1);
    setAllData();
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, idx - 120), to: idx + 25 });
    setReplay({ visible: true }); document.body.classList.add('replaying');
    if (typeof PT.MTF !== 'undefined') PT.MTF.replaySync();
    update(); SIM.render(); QUIZ.render(); vcg.log('info', `เริ่ม Replay ${S.symbol} ${tf().label} ที่แท่ง ${idx}`, null, 'learn');
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
      if (typeof PT.MTF !== 'undefined') PT.MTF.replaySync();
    }
    update();
  }
  function back() {
    const R = S.replay; if (!R || R.idx <= 30) return;
    R.idx--; S.candles = R.full.slice(0, R.idx + 1); setAllData(); update();
    if (typeof PT.MTF !== 'undefined') PT.MTF.replaySync();
  }
  function play() { if (timer) return stopPlay(); timer = setInterval(() => step(1), 1000 / replaySpeed()); setReplay({ playing: true }); }
  function stopPlay() { clearInterval(timer); timer = undefined; setReplay({ playing: false }); }
  function exit() {
    if (!S.replay) return;
    stopPlay(); QUIZ.abort();
    S.candles = S.replay.full; S.replay = null;
    setReplay({ visible: false }); document.body.classList.remove('replaying');
    setAllData(); loadChart(); SIM.render(); QUIZ.render();
    vcg.log('info', 'ออกจาก Replay', null, 'learn');
  }
  function update() {
    const R = S.replay; if (!R) return;
    const b = R.full[R.idx], d = new Date(b.time * 1000), p = (x: number) => String(x).padStart(2, '0');
    setReplay({ info: `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} · ซ่อนอยู่ ${R.full.length - 1 - R.idx} แท่ง` });
    SIM.tickUpdate();
  }
  // pick a start bar by clicking on the chart
  function pick() { picking = true; toast('คลิกบนกราฟที่แท่งที่จะเริ่ม Replay (Esc = ยกเลิก)', 'info'); document.body.classList.add('picking'); }
  $('chart-wrap').addEventListener('click', (ev) => {
    if (!picking) return;
    ev.stopPropagation(); picking = false; document.body.classList.remove('picking');
    const r = $('chart').getBoundingClientRect(); const l = chart.timeScale().coordinateToLogical(ev.clientX - r.left);
    if (l != null) start(Math.round(l));
  }, true);
  document.addEventListener('keydown', (e) => {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tgt(e).tagName)) return;
    if (picking && e.key === 'Escape') { picking = false; document.body.classList.remove('picking'); }
    if (!S.replay) return;
    if (e.key === ' ') { e.preventDefault(); play(); }
    if (e.key === 'ArrowRight' && e.shiftKey) { e.preventDefault(); step(10); } else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); back(); }
  });
  return { start, step, exit, pick, stopPlay, play, update, get active() { return !!S.replay; } };
})();

// ================================================================ Paper trading simulator
// paper-trading records (stored in the user's store under sim.live / sim.replay — keep the shape)
type SimMode = 'live' | 'replay';
/** one replay-quiz attempt (stored under quiz.results) */
interface QuizResult { t: number; symbol: string; tf: string; skipped: boolean; r: number | null; pnl: number | null }
interface SimBase { id: number; symbol: string; side: 1 | -1; lot: number; sl: number | null; tp: number | null; tag: string; note: string; mode: SimMode; quiz: boolean }
interface SimOrder extends SimBase { type: 'limit' | 'stop'; price: number; created: number }
interface SimPos extends SimBase { entry: number; openTime: number; type?: string; price?: number; created?: number; fillBar?: boolean }
interface SimDeal extends SimPos { exit: number; reason: string; closeTime: number; pnl: number; r: number | null }
interface SimAcc { start: number; balance: number; positions: SimPos[]; orders: SimOrder[]; history: SimDeal[] }
const SIM = (() => {
  const blank = (): SimAcc => ({ start: 10000, balance: 10000, positions: [], orders: [], history: [] });
  const acc: Record<SimMode, SimAcc> = { live: { ...blank(), ...store.get('sim.live', {}) }, replay: { ...blank(), ...store.get('sim.replay', {}) } };
  const mode = (): SimMode => (S.replay ? 'replay' : 'live');
  const A = () => acc[mode()];
  const saveAcc = () => { store.set('sim.live', acc.live); store.set('sim.replay', acc.replay); };
  const valuePer = (sym: any) => autoVpp(sym) || (sym === S.symbol ? vpp() : null) || 1;
  const money = (v: number|null) => (v == null || !isFinite(v) ? '—' : (v < 0 ? '-$' : '$') + Math.abs(v).toFixed(2));
  // order ticket form (stored under sim.ticket); string fields are what the user typed
  let ticket: Record<string, any> = { side: 1, type: 'market', price: '', lot: 0.01, sl: '', tp: '', tag: 'pullback', note: '' , ...store.get('sim.ticket', {}) };
  const TAGS: Record<string, any> = { pullback: 'ย่อตามเทรนด์', breakout: 'เบรกโครงสร้าง', reversal: 'กลับตัว/CHoCH', range: 'เด้งในกรอบ/โซน', news: 'ข่าว', other: 'อื่นๆ' };

  // current prices: live → bid/ask quote; replay → close of the current bar (no spread)
  function px(sym: string|number) {
    if (S.replay) { const b = S.candles[S.candles.length - 1]; return sym === S.replay.symbol && b ? { bid: b.close, ask: b.close, t: b.time - TZ } : null; }
    const q = S.quotes[sym]; return q ? { bid: q.bid, ask: q.ask, t: Date.parse(q.time) / 1000 } : null;
  }
  const pnlOf = (p: SimPos, exit: number) => (exit - p.entry) * p.side * p.lot * valuePer(p.symbol);
  const rOf = (p: SimPos, exit: number) => (p.sl ? ((exit - p.entry) * p.side) / Math.abs(p.entry - p.sl) : null);

  function place() {
    const sym = S.replay ? S.replay.symbol : S.symbol, P = px(sym);
    if (!P) return toast('ยังไม่มีราคาของ ' + sym, 'warn');
    const side = (ticket.side === -1 ? -1 : 1) as 1 | -1, lot = Math.max(0.01, +ticket.lot || 0.01), sl = parseFloat(ticket.sl) || null, tp = parseFloat(ticket.tp) || null;
    const base: SimBase = { id: Date.now(), symbol: sym, side, lot, sl, tp, tag: ticket.tag, note: ticket.note, mode: mode(), quiz: QUIZ.active() };
    if (ticket.type === 'market') {
      const entry = side === 1 ? P.ask : P.bid;
      if (sl && (entry - sl) * side <= 0) return toast('SL อยู่ผิดฝั่งของราคาเข้า', 'warn');
      if (tp && (tp - entry) * side <= 0) return toast('TP อยู่ผิดฝั่งของราคาเข้า', 'warn');
      A().positions.push({ ...base, entry, openTime: P.t });
      toast(`${side === 1 ? 'BUY' : 'SELL'} ${lot} ${sym} @ ${fmt(entry)} (จำลอง)`, 'ok');
    } else {
      const price = parseFloat(ticket.price); if (!isFinite(price)) return toast('ใส่ราคาของคำสั่งรอ', 'warn');
      A().orders.push({ ...base, type: ticket.type === 'stop' ? 'stop' : 'limit', price, created: P.t });
      toast(`ตั้งคำสั่ง ${ticket.type === 'limit' ? 'Limit' : 'Stop'} ${side === 1 ? 'BUY' : 'SELL'} @ ${fmt(price)}`, 'ok');
    }
    vcg.log('info', `จำลอง: ${ticket.type} ${side === 1 ? 'BUY' : 'SELL'} ${lot} ${sym}`, null, 'sim');
    saveAcc(); render(); view.dirty = true; QUIZ.onTrade();
  }
  function close(p: SimPos, exit: number, reason: string, t: number, quiet?: boolean) {
    const a = acc[p.mode] || A();
    a.positions = a.positions.filter((x: { id: any; }) => x.id !== p.id);
    const pnl = pnlOf(p, exit), r = rOf(p, exit);
    a.balance += pnl;
    const h: SimDeal = { ...p, exit, reason, closeTime: t, pnl, r };
    a.history.push(h); if (a.history.length > 2000) a.history.shift();
    saveAcc(); if (quiet) { QUIZ.onClose(h); return; } render(); view.dirty = true;
    const msg = `${reason === 'TP' ? 'ถึง TP' : reason === 'SL' ? 'โดน SL' : 'ปิด'} ${p.side === 1 ? 'BUY' : 'SELL'} ${p.symbol} ${money(pnl)}${r != null ? ` (${r >= 0 ? '+' : ''}${r.toFixed(2)}R)` : ''}`;
    toast(msg, pnl >= 0 ? 'ok' : 'warn');
    QUIZ.onClose(h);
  }
  // live ticks
  function onQuote(q: { time: string; symbol: any; ask: number; bid: number; }) {
    const a = acc.live, t = Date.parse(q.time) / 1000;
    for (const o of [...a.orders]) {
      if (o.symbol !== q.symbol) continue;
      const hit = o.side === 1 ? (o.type === 'limit' ? q.ask <= o.price : q.ask >= o.price) : (o.type === 'limit' ? q.bid >= o.price : q.bid <= o.price);
      if (hit) { a.orders = a.orders.filter((x) => x !== o); a.positions.push({ ...o, entry: o.side === 1 ? q.ask : q.bid, openTime: t }); toast(`คำสั่งรอทำงาน: ${o.side === 1 ? 'BUY' : 'SELL'} ${o.symbol} @ ${fmt(o.price)}`, 'ok'); saveAcc(); render(); }
    }
    for (const p of [...a.positions]) {
      if (p.symbol !== q.symbol) continue;
      const px_ = p.side === 1 ? q.bid : q.ask;
      if (p.sl && (px_ - p.sl) * p.side <= 0) close(p, p.sl, 'SL', t);
      else if (p.tp && (px_ - p.tp) * p.side >= 0) close(p, p.tp, 'TP', t);
    }
  }
  // replay bars: conservative — if a bar touches both SL and TP, SL counts first
  function onBar(b: { time: number; low: number; high: number; }) {
    const a = acc.replay, sym = S.replay && S.replay.symbol, t = b.time - TZ;
    for (const o of [...a.orders]) {
      if (o.symbol !== sym) continue;
      const hit = o.side === 1 ? (o.type === 'limit' ? b.low <= o.price : b.high >= o.price) : (o.type === 'limit' ? b.high >= o.price : b.low <= o.price);
      if (hit) { a.orders = a.orders.filter((x) => x !== o); a.positions.push({ ...o, entry: o.price, openTime: t, fillBar: true }); saveAcc(); render(); }
    }
    for (const p of [...a.positions]) {
      if (p.symbol !== sym || p.fillBar) { delete p.fillBar; continue; }
      const slHit = p.sl && (p.side === 1 ? b.low <= p.sl : b.high >= p.sl), tpHit = p.tp && (p.side === 1 ? b.high >= p.tp : b.low <= p.tp);
      if (slHit) close(p, p.sl!, 'SL', t); else if (tpHit) close(p, p.tp!, 'TP', t);
    }
    tickUpdate();
  }
  function stats(list: any[]) {
    const n = list.length, wins = list.filter((h: { pnl: number; }) => h.pnl > 0), losses = list.filter((h: { pnl: number; }) => h.pnl <= 0);
    const gw = wins.reduce((s: any, h: { pnl: any; }) => s + h.pnl, 0), gl = -losses.reduce((s: any, h: { pnl: any; }) => s + h.pnl, 0);
    const rs = list.filter((h: { r: null; }) => h.r != null).map((h: { r: any; }) => h.r);
    let eq = 0, peak = 0, dd = 0; for (const h of list) { eq += h.pnl; peak = Math.max(peak, eq); dd = Math.max(dd, peak - eq); }
    return { n, win: n ? wins.length / n : null, avgR: rs.length ? rs.reduce((a: any, b: any) => a + b, 0) / rs.length : null, pf: gl ? gw / gl : gw ? Infinity : null, total: gw - gl, dd };
  }
  // snapshot for Sim.svelte (all numbers pre-formatted here, the component only renders)
  function snap() {
    const a = A(), m = mode();
    let open = 0;
    const positions = a.positions.map((p) => { const P = px(p.symbol); const pl = P ? pnlOf(p, p.side === 1 ? P.bid : P.ask) : null; if (pl != null) open += pl;
      return { id: p.id, buy: p.side === 1, lot: p.lot, at: `${p.symbol} @ ${fmt(p.entry)}`, pl, plS: money(pl) }; });
    const st = stats(a.history), pct = (v: number|null) => (v == null ? '—' : (v * 100).toFixed(0) + '%');
    return {
      mode: m, balance: money(a.balance), open, openS: money(open), eq: money(a.balance + open), ticket: { ...ticket }, tags: Object.entries(TAGS),
      positions, orders: a.orders.map((o) => ({ id: o.id, text: `${o.type} ${o.side === 1 ? 'BUY' : 'SELL'} ${o.lot}`, at: `${o.symbol} @ ${fmt(o.price)}` })),
      st: { n: st.n, win: pct(st.win), avgR: st.avgR == null ? '—' : st.avgR.toFixed(2) + 'R', pf: st.pf == null ? '—' : st.pf === Infinity ? '∞' : st.pf.toFixed(2), total: money(st.total), totalUp: st.total >= 0, dd: money(-st.dd) },
      byTag: Object.keys(TAGS).map((k): [string, ReturnType<typeof stats>] => [k, stats(a.history.filter((h) => h.tag === k))]).filter(([, s]) => s.n).map(([k, s]) => ({ label: TAGS[k], n: s.n, win: pct(s.win), avgR: s.avgR == null ? '—' : s.avgR.toFixed(2) })),
      history: a.history.slice(-15).reverse().map((h) => ({ up: h.pnl >= 0, head: `${h.pnl >= 0 ? '✓' : '✗'} ${h.side === 1 ? 'BUY' : 'SELL'} ${h.symbol}`,
        body: `${fmt(h.entry)} → ${fmt(h.exit)} · ${h.reason} · ${money(h.pnl)}${h.r != null ? ` · ${h.r.toFixed(2)}R` : ''}${h.quiz ? ' · โจทย์' : ''}`, sub: `${TAGS[h.tag] || ''}${h.note ? ' — ' + h.note : ''}` })),
    };
  }
  const setT = (k: string|number, v: any) => { ticket[k] = v; store.set('sim.ticket', ticket); render(); };
  const api = {
    place, bulk, setTicket: (k: string, v: string|number) => setT(k, k === 'side' ? +v : v),
    closePos: (id: any) => { const a = A(), p = a.positions.find((x) => x.id === id); const P = p && px(p.symbol); if (P) close(p, p.side === 1 ? P.bid : P.ask, 'manual', P.t); },
    cancel: (id: any) => { const a = A(); a.orders = a.orders.filter((x) => x.id !== id); saveAcc(); render(); view.dirty = true; },
    fromPlan: () => { const p = S.plan; ticket.side = p.side === 'buy' ? 1 : -1; ticket.sl = p.sl; ticket.tp = p.tp2 || p.tp1; if (p.entry) ticket.price = p.entry; store.set('sim.ticket', ticket); render(); },
    riskLot: () => {
      const sym = S.replay ? S.replay.symbol : S.symbol, P = px(sym), sl = parseFloat(ticket.sl);
      if (!P || !isFinite(sl)) return toast('ใส่ SL ก่อน แล้วแอปจะคำนวณ lot จากความเสี่ยงในแท็บคำนวณ', 'warn');
      const lot = plannerLot(ticket.type === 'market' ? (ticket.side === 1 ? P.ask : P.bid) : parseFloat(ticket.price), sl);
      if (lot) { ticket.lot = lot; store.set('sim.ticket', ticket); render(); } else toast('lot ที่คำนวณได้ต่ำกว่าขั้นต่ำ', 'warn');
    },
    reset: () => { acc[mode()] = blank(); saveAcc(); render(); view.dirty = true; },
    csv: () => {
      const rows = [['mode', 'symbol', 'side', 'lot', 'entry', 'exit', 'sl', 'tp', 'reason', 'pnl', 'r', 'tag', 'note', 'open', 'close', 'quiz']]
        .concat((['live', 'replay'] as SimMode[]).flatMap((k) => acc[k].history.map((h: { symbol: any; side: number; lot: any; entry: any; exit: any; sl: any; tp: any; reason: any; pnl: number; r: number|null; tag: any; note: any; openTime: number; closeTime: number; quiz: any; }) => [k, h.symbol, h.side === 1 ? 'BUY' : 'SELL', h.lot, h.entry, h.exit, h.sl, h.tp, h.reason, h.pnl.toFixed(2), h.r == null ? '' : h.r.toFixed(2), h.tag, (h.note || '').replace(/[",\n]/g, ' '), new Date(h.openTime * 1000).toISOString(), new Date(h.closeTime * 1000).toISOString(), h.quiz ? 1 : 0])));
      downloadText(`practice-journal-${new Date().toISOString().slice(0, 10)}.csv`, rows.map((r) => r.join(',')).join('\n'));
    },
  };
  function render() {
    if (!$('sim') || $('tab-practice').classList.contains('hidden')) return;
    showSim(snap(), api);
  }
  // bulk actions: close all / winners / losers, move SL to entry on winners, cancel pending orders
  function bulk(kind: string) {
    const a = A();
    if (kind === 'cancel') { const n = a.orders.length; a.orders = []; saveAcc(); render(); view.dirty = true; return toast(`ยกเลิกคำสั่งรอ ${n} รายการ`, 'ok'); }
    let n = 0, total = 0;
    for (const p of [...a.positions]) {
      const P = px(p.symbol); if (!P) continue;
      const exit = p.side === 1 ? P.bid : P.ask, pl = pnlOf(p, exit);
      if (kind === 'be') { if (pl > 0 && (!p.sl || (p.sl - p.entry) * p.side < 0)) { p.sl = p.entry; n++; } continue; }
      if (kind === 'all' || (kind === 'win' && pl > 0) || (kind === 'loss' && pl < 0)) { close(p, exit, 'manual', P.t, true); n++; total += pl; }
    }
    saveAcc(); render(); view.dirty = true;
    const label = { all: 'ปิดทั้งหมด', win: 'ปิดไม้กำไร', loss: 'ปิดไม้ขาดทุน', be: 'กันทุน' }[kind];
    toast(n ? (kind === 'be' ? `${label}: เลื่อน SL มาที่ทุน ${n} ไม้` : `${label} ${n} ไม้ รวม ${money(total)}`) : `${label}: ไม่มีไม้ที่ตรงเงื่อนไข`, n ? 'ok' : 'info');
  }
  // per-tick: only update the P/L numbers in place
  let lastTU = 0;
  function tickUpdate() {
    if ($('tab-practice').classList.contains('hidden') || !$('sim-open')) return;
    const now = Date.now(); if (now - lastTU < 400) return; lastTU = now;
    tickSim(snap());          // numbers only: the panel patches text, it is not rebuilt
  }
  // open positions & pending orders on the chart
  function draw(W: number) {
    const a = A(), sym = S.replay ? S.replay.symbol : S.symbol;
    for (const p of a.positions.filter((x) => x.symbol === sym)) {
      const P = px(sym), pl = P ? pnlOf(p, p.side === 1 ? P.bid : P.ask) : 0, y = yOf(p.entry); if (y == null) continue;
      el('line', { x1: 0, y1: y, x2: W, y2: y, stroke: p.side === 1 ? '#2962ff' : '#e040fb', 'stroke-width': 1.5 });
      label(W - 6, y + 4, `${p.side === 1 ? 'BUY' : 'SELL'} ${p.lot} · ${money(pl)}`, pl >= 0 ? UP : DOWN, '#fff', 'end');
      if (p.sl) { const ys = yOf(p.sl)!; el('line', { x1: 0, y1: ys, x2: W, y2: ys, stroke: DOWN, 'stroke-dasharray': '6 4' }); label(W - 6, ys + 4, `SL ${fmt(p.sl)}`, DOWN, '#fff', 'end'); }
      if (p.tp) { const yt = yOf(p.tp)!; el('line', { x1: 0, y1: yt, x2: W, y2: yt, stroke: UP, 'stroke-dasharray': '6 4' }); label(W - 6, yt + 4, `TP ${fmt(p.tp)}`, UP, '#fff', 'end'); }
    }
    for (const o of a.orders.filter((x) => x.symbol === sym)) {
      const y = yOf(o.price); if (y == null) continue;
      el('line', { x1: 0, y1: y, x2: W, y2: y, stroke: '#ff9800', 'stroke-dasharray': '3 3' });
      label(W - 6, y + 4, `${o.type.toUpperCase()} ${o.side === 1 ? 'BUY' : 'SELL'} ${o.lot}`, '#ff9800', '#000', 'end');
    }
  }
  // fill the order ticket from another panel (e.g. bounce finder) and open the practice tab — the user still presses the button
  function prefill(t: { side: number; type: string; price: string; lot: number; sl: string; tp: string; tag: string; note: string; }) { ticket = { ...ticket, ...t }; store.set('sim.ticket', ticket); qs('#tabs [data-tab="practice"]').click(); render(); toast('กรอกคำสั่งฝึกให้แล้ว ตรวจแล้วกดส่งคำสั่ง', 'ok'); }
  return { prefill, place, onQuote, onBar, render, tickUpdate, draw, stats, acc: () => acc, positionsOpen: () => A().positions.length + A().orders.length };
})();

// hook live quotes into the simulator
onQuotes((list) => { if (!S.replay) { for (const q of list) SIM.onQuote(q); SIM.tickUpdate(); } });

// ================================================================ Practice exercises (random replay quiz)
const QUIZ = (() => {
  let q: { traded: any; played: any; skipped?: any; startIdx?: number; }|null = null; // { startIdx, traded, revealUntil }
  function start() {
    const full = S.replay ? S.replay.full : S.candles;
    if (full.length < 400) return toast('ต้องมีข้อมูลอย่างน้อย 400 แท่ง (เปลี่ยน timeframe หรือรอโหลด)', 'warn');
    const idx = 200 + Math.floor(Math.random() * (full.length - 320));
    if (S.replay) REPLAY.exit();
    REPLAY.start(idx);
    q = { startIdx: idx, traded: false, played: 0 };
    toast('โจทย์ใหม่: วิเคราะห์โครงสร้าง แล้ววางคำสั่งจำลอง (หรือกด "ข้าม") — แอปจะเล่นต่อจนรู้ผล', 'info', 10000);
    render();
  }
  function onTrade() { if (!q || q.traded) return; q.traded = true; render(); REPLAY.play(); }
  function onBar() { if (!q) return; q.played++; if (!q.traded && q.played > 60) finish(null); }
  function onClose(h: SimDeal) { if (!q || !h.quiz) return; if (SIM.positionsOpen() === 0) finish(h); }
  function skip() { if (!q) return; q.traded = true; q.skipped = true; REPLAY.play(); setTimeout(() => finish(null), 0); }
  function finish(h: SimDeal | null) {
    REPLAY.stopPlay();
    const qq = q; q = null;
    const res = store.get<QuizResult[]>('quiz.results', []);
    res.push({ t: Date.now(), symbol: S.symbol, tf: tf().label, skipped: !!(qq && qq.skipped) || !h, r: h ? h.r : null, pnl: h ? h.pnl : null });
    store.set('quiz.results', res.slice(-500));
    if (h) { const good = h.r != null ? h.r > 0 : h.pnl > 0; toast(`${good ? 'ถูกทาง' : 'ผิดทาง'} — ${h.reason} ${h.r != null ? h.r.toFixed(2) + 'R' : ''} · ดูกราฟต่อได้ หรือกด "โจทย์ถัดไป"`, good ? 'ok' : 'warn', 10000); beep(); }
    render();
  }
  function abort() { q = null; render(); }
  function render() {
    const res = store.get<QuizResult[]>('quiz.results', []), done = res.filter((r) => !r.skipped);
    const wins = done.filter((r) => (r.r != null ? r.r > 0 : (r.pnl ?? 0) > 0)).length;
    const rs = done.map((r) => r.r).filter((x): x is number => x != null);
    showQuiz({ canSkip: !!(q && !q.traded), inReplay: !!S.replay, done: done.length, skipped: res.length - done.length,
      win: done.length ? Math.round((wins / done.length) * 100) + '%' : '—', avgR: rs.length ? (rs.reduce((a, b) => a + b, 0) / rs.length).toFixed(2) + 'R' : '—' },
      { pick: () => REPLAY.pick(), start, skip, exit: () => REPLAY.exit() });
  }
  return { start, onTrade, onBar, onClose, abort, render, active: () => !!q };
})();

// ================================================================ Lesson packs (share drawings + notes)
function downloadText(name: string, text: string) {
  if (vcg.capabilities?.files) { const a = mk('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' })); a.download = name; a.click(); }
  navigator.clipboard?.writeText(text).then(() => toast('คัดลอกไว้ในคลิปบอร์ดแล้วด้วย', 'ok'), () => {});
}
const LESSON = (() => {
  function exportPack(note = '') {
    const pack = { app: 'Price Tracker', kind: 'lesson', v: 1, symbol: S.symbol, tf: S.tf, note: note || '', created: new Date().toISOString(),
      replayAt: S.replay ? S.replay.full[S.replay.idx].time - TZ : null, drawings };
    downloadText(`lesson-${S.symbol}-${tf().label}.json`, JSON.stringify(pack));
    vcg.log('info', `ส่งออกบทเรียน ${S.symbol} (${drawings.length} รูปวาด)`, null, 'learn');
  }
  function importPack(text: string) {
    let p; try { p = JSON.parse(text); } catch (_: any) { return toast('ข้อความไม่ใช่ไฟล์บทเรียน', 'warn'); }
    if (p.app !== 'Price Tracker' || p.kind !== 'lesson') return toast('ไม่ใช่ไฟล์บทเรียนของ Price Tracker', 'warn');
    if (S.replay) REPLAY.exit();
    store.set('drawings:' + p.symbol, (p.drawings || []).map(normalize));
    if (p.symbol !== S.symbol) switchSymbol(p.symbol); else { PT.drawings = (p.drawings || []).map(normalize); saveDrawings(); view.dirty = true; }
    if (p.tf !== S.tf) { S.tf = p.tf; store.set('tf', p.tf); renderTfs(); loadChart(); }
    if (p.replayAt) { const go = () => { const i = S.candles.findIndex((c: { time: number; }) => c.time - TZ >= p.replayAt); if (i > 0) REPLAY.start(i); }; setTimeout(go, 2500); }
    toast(`นำเข้าบทเรียน ${p.symbol}${p.note ? ': ' + p.note : ''}`, 'ok', 10000);
  }
  function render() { showLesson({ symbol: S.symbol }, { exportPack, importPack }); }
  return { render, importPack };
})();

// ================================================================ tab + hooks
qs('#tabs [data-tab="practice"]').addEventListener('click', () => { QUIZ.render(); SIM.render(); LESSON.render(); });
QUIZ.render(); LESSON.render();
ui.sim = SIM;
ui.replay = REPLAY;
export { QUIZ, REPLAY };
