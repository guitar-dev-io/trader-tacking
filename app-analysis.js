import { PT, def } from './src/pt.ts';
import { view } from './src/state.ts';
import { ICON } from './icons.js';
import { AN } from './src/legacy/core.ts';
import { $, AN_VIEW_KEYS, S, TZ, digits, fmt, store, tf } from './app-core.js';
import { closeMenus } from './app-chart.js';
import { mount, flushSync } from 'svelte';
import Analysis from './src/ui/tabs/Analysis.svelte';
import { analysisTick } from './src/ui/tabs/analysis-view.ts';
def({ AN_ITEMS: [() => AN_ITEMS], openAnalysisMenu: [() => openAnalysisMenu, (v) => { openAnalysisMenu = v; }], SETUP_TH: [() => SETUP_TH], pct: [() => pct], rr: [() => rr], PERF: [() => PERF], runAnalysis: [() => runAnalysis, (v) => { runAnalysis = v; }], activeSignal: [() => activeSignal, (v) => { activeSignal = v; }], renderAnalysis: [() => renderAnalysis, (v) => { renderAnalysis = v; }], pushTimer: [() => pushTimer, (v) => { pushTimer = v; }], pushAnalysis: [() => pushAnalysis, (v) => { pushAnalysis = v; }], sigPayload: [() => sigPayload, (v) => { sigPayload = v; }] });
// Price Tracker renderer · structure analysis: menu, run/render, signal notifications
// ---------------------------------------------------------------- analysis menu
const AN_ITEMS = [
  ['bounce', 'จุดเด้ง / จุดเข้าซื้อ-ขาย (โซนรอเข้า)'],
  ['liquidity', 'จุด SL เม่า / สภาพคล่อง ($$$) + การกวาด'],
  ['autofib', 'Fibo อัตโนมัติ ขาล่าสุด (61.8 / 161.8 / 261.8)'],
  ['swing', 'Swing + HH/HL/LH/LL'], ['legs', 'จำนวนแท่งในแต่ละขา'], ['structure', 'โครงสร้าง BOS / CHoCH'],
  ['zones', 'แนวรับ / แนวต้าน (โซน)'], ['patterns', 'แพทเทิร์นแท่งเทียน'], ['td', 'นับแท่ง TD Sequential 1–9'],
  ['signals', 'สัญญาณ Entry / SL / TP'], ['history', 'สัญญาณย้อนหลัง + ผลลัพธ์'],
  ['learnOnly', 'โหมดเรียนรู้: เฉพาะ setup ที่สถิติผ่าน'], ['notify', 'แจ้งเตือนเมื่อมีสัญญาณใหม่'],
];
function openAnalysisMenu() {
  const menu = $('an-menu');
  if (!menu.classList.contains('hidden')) return closeMenus();
  closeMenus();
  menu.innerHTML = '<div class="item" style="gap:6px;justify-content:flex-start"><button id="an-all">แสดงทั้งหมด</button><button id="an-none">ซ่อนทั้งหมด</button></div><div class="group">แสดงบนกราฟ</div>' +
    AN_ITEMS.map(([k, t]) => `<label class="item"><input type="checkbox" data-k="${k}" ${S.an[k] ? 'checked' : ''}> ${t}</label>`).join('') +
    `<div class="item"><span>Swing length (แท่ง)</span><input type="number" id="an-len" min="2" max="30" value="${S.an.swingLen}"></div>`;
  menu.classList.remove('hidden');
  menu.querySelectorAll('input[data-k]').forEach((i) => (i.onchange = () => { S.an[i.dataset.k] = i.checked; store.set('an', S.an); runAnalysis(); }));
  const setAll = (v) => { AN_VIEW_KEYS.forEach((k) => { S.an[k] = v && k !== 'td'; }); store.set('an', S.an); runAnalysis(); closeMenus(); openAnalysisMenu(); };
  $('an-all').onclick = (e) => { e.stopPropagation(); setAll(true); };
  $('an-none').onclick = (e) => { e.stopPropagation(); setAll(false); };
  $('an-len').onchange = () => { S.an.swingLen = Math.max(2, Math.min(30, +$('an-len').value || 5)); store.set('an', S.an); runAnalysis(); };
}
$('an-btn').onclick = (e) => { e.stopPropagation(); openAnalysisMenu(); };

// ---------------------------------------------------------------- analysis
const SETUP_TH = { pullback: 'ย่อตามเทรนด์', choch: 'กลับตัวหลัง CHoCH', sr: 'เด้งแนวรับ/ต้าน' };
const pct = (v) => (v == null ? '—' : (v * 100).toFixed(0) + '%');
const rr = (v) => (v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(2) + 'R');

const PERF = { analyze: 0, bounce: 0, render: 0, n: 0, at: 0 };
function runAnalysis() {
  const closed = S.candles.slice(0, -1); // never analyse the candle that is still forming
  const t0 = performance.now();
  S.A = closed.length >= 50 ? AN.analyze(closed, { swingLen: S.an.swingLen, digits: digits(), rr1: +S.prefs.rr1, rr2: +S.prefs.rr2, slBuf: +S.prefs.slBuf, minSamples: +S.prefs.minSamples, maxBars: +S.prefs.maxBars }) : null;
  const t1 = performance.now();
  PT.runBounce();
  const t2 = performance.now();
  renderAnalysis();
  Object.assign(PERF, { analyze: Math.round(t1 - t0), bounce: Math.round(t2 - t1), render: Math.round(performance.now() - t2), n: closed.length, at: Date.now() });
  if (performance.now() - t0 > 400) vcg.log('warn', `วิเคราะห์ช้า: ${Math.round(performance.now() - t0)} ms (${closed.length} แท่ง · โครงสร้าง ${PERF.analyze} · จุดเด้ง ${PERF.bounce} · แสดงผล ${PERF.render} ms)`, null, 'perf');
  pushAnalysis();
  PT.checkNewSignal();
  view.dirty = true;
}
function activeSignal() {
  if (!S.A || !S.A.signals.length) return null;
  const s = S.A.signals[S.A.signals.length - 1];
  return s.r2.res === 'open' && S.A.n - 1 - s.idx <= 10 ? s : null;
}
// panels: src/ui/tabs/Analysis.svelte (mounted below); this keeps the header trend badge and re-renders them
function renderAnalysis() {
  const A = S.A, badge = $('trend-badge');
  if (!A) { badge.textContent = ''; badge.className = ''; }
  else { const tr = A.lastTrend; badge.textContent = tr === 1 ? '▲ ขาขึ้น' : tr === -1 ? '▼ ขาลง' : '◆ ไซด์เวย์'; badge.className = tr === 1 ? 'up' : tr === -1 ? 'down' : 'flat'; }
  analysisTick.update((n) => n + 1); flushSync();
}

let pushTimer = null;
function pushAnalysis() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    const A = S.A;
    vcg.pushAnalysis(A ? {
      symbol: S.symbol, timeframe: tf().label, bars: A.n, trend: A.lastTrend === 1 ? 'up' : A.lastTrend === -1 ? 'down' : 'none',
      lastEvent: A.lastEvent && { ...A.lastEvent, time: S.candles[A.lastEvent.idx]?.time - TZ },
      swings: A.swings.slice(-10).map((s) => ({ label: s.label, price: s.price, time: s.time - TZ, bars: s.legBars })),
      zones: A.zones.map((z) => ({ kind: z.kind, top: z.top, bottom: z.bottom, touches: z.touches })),
      activeSignal: sigPayload(activeSignal()),
      lastSignal: sigPayload(A.signals[A.signals.length - 1]),
      stats: { all: A.stats.all, learned: A.stats.learned, bySetup: A.stats.bySetup, byPattern: A.stats.byPattern },
    } : null);
  }, 300);
}
function sigPayload(s) {
  if (!s) return null;
  return { symbol: S.symbol, timeframe: tf().label, side: s.dir === 1 ? 'BUY' : 'SELL', time: new Date((s.time - TZ) * 1000).toISOString(),
    setup: s.setup, pattern: AN.PAT[s.pattern].name, entry: s.entry, sl: s.sl, tp1: s.tp1, tp2: s.tp2, structureTarget: s.tpS,
    learned: s.learned, priorStats: s.prior, reasons: s.reasons, resultTP1: s.r1.res, resultTP2: s.r2.res };
}
const anApi = { activeSignal: () => activeSignal(), SETUP_TH, pct, rr };
for (const part of ['trend', 'signal', 'stats']) mount(Analysis, { target: $('an-' + part), props: { part, api: anApi } });
export { PERF, SETUP_TH, activeSignal, openAnalysisMenu, pct, renderAnalysis, rr, runAnalysis, sigPayload };
