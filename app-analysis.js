// Price Tracker renderer · structure analysis: menu, run/render, signal notifications
/* global LightweightCharts, IND, AN, BOUNCE, CUSTOM, LESSONS, ICON, vcg */
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
const resTH = (r) => ({ win: 'ชนะ', loss: 'แพ้', open: 'ยังไม่จบ', expired: 'หมดเวลา' }[r.res]);
const pct = (v) => (v == null ? '—' : (v * 100).toFixed(0) + '%');
const rr = (v) => (v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(2) + 'R');

function runAnalysis() {
  const closed = S.candles.slice(0, -1); // never analyse the candle that is still forming
  S.A = closed.length >= 50 ? AN.analyze(closed, { swingLen: S.an.swingLen, digits: digits(), rr1: +S.prefs.rr1, rr2: +S.prefs.rr2, slBuf: +S.prefs.slBuf, minSamples: +S.prefs.minSamples, maxBars: +S.prefs.maxBars }) : null;
  runBounce();
  renderAnalysis();
  pushAnalysis();
  checkNewSignal();
  dirty = true;
}
function activeSignal() {
  if (!S.A || !S.A.signals.length) return null;
  const s = S.A.signals[S.A.signals.length - 1];
  return s.r2.res === 'open' && S.A.n - 1 - s.idx <= 10 ? s : null;
}
function renderAnalysis() {
  const A = S.A;
  const badge = $('trend-badge');
  if (!A) {
    badge.textContent = ''; badge.className = '';
    $('an-trend').innerHTML = '<p class="muted">ต้องมีข้อมูลกราฟอย่างน้อย 50 แท่ง</p>'; $('an-signal').innerHTML = ''; $('an-stats').innerHTML = '';
    return;
  }
  const tr = A.lastTrend, ev = A.lastEvent;
  badge.textContent = tr === 1 ? '▲ ขาขึ้น' : tr === -1 ? '▼ ขาลง' : '◆ ไซด์เวย์';
  badge.className = tr === 1 ? 'up' : tr === -1 ? 'down' : 'flat';
  const sw = A.swings.slice(-4).map((s) => `<span class="${s.label[0] === 'H' && s.label !== 'HL' ? '' : ''}">${s.label}</span>`).join(' → ');
  $('an-trend').innerHTML = `<div class="panel-h">โครงสร้างตลาด · ${S.symbol} ${tf().label}</div>
    <div>เทรนด์: <b class="${tr === 1 ? 'up' : tr === -1 ? 'down' : ''}">${tr === 1 ? 'ขาขึ้น' : tr === -1 ? 'ขาลง' : 'ยังไม่ชัด'}</b></div>
    ${ev ? `<div>ล่าสุด: <b>${ev.type}</b> ${ev.dir === 1 ? 'ขึ้น' : 'ลง'} ทะลุ ${fmt(ev.price)} (${A.n - 1 - ev.idx} แท่งก่อน)</div>` : ''}
    <div>สวิงล่าสุด: ${sw || '—'}</div>`;

  const s = activeSignal();
  const last = A.signals[A.signals.length - 1];
  const card = (x, active) => {
    const buy = x.dir === 1, lr = x.learned;
    const dim = active && S.an.learnOnly && lr !== 'good';
    const reward = (k) => Math.abs(k - x.entry) / x.risk;
    return `<div class="sig-card ${buy ? 'buy' : 'sell'} ${dim ? 'dim' : ''}">
      <div class="sig-head"><span class="${buy ? 'up' : 'down'}">${buy ? '▲ BUY' : '▼ SELL'}</span>
        <small>${SETUP_TH[x.setup]} · ${AN.PAT[x.pattern].name}</small></div>
      <div class="lv">
        <span>Entry</span><b>${fmt(x.entry)}</b><span>ราคาปิดแท่งสัญญาณ</span>
        <span class="down">SL</span><b>${fmt(x.sl)}</b><span>-${fmt(x.risk)} (1R)</span>
        <span class="up">TP1</span><b>${fmt(x.tp1)}</b><span>1R</span>
        <span class="up">TP2</span><b>${fmt(x.tp2)}</b><span>2R</span>
        ${x.tpS != null ? `<span class="up">เป้าโครงสร้าง</span><b>${fmt(x.tpS)}</b><span>${reward(x.tpS).toFixed(1)}R</span>` : ''}
      </div>
      <div>โหมดเรียนรู้: <span class="badge ${lr}">${lr === 'good' ? '✅ สถิติผ่าน' : lr === 'bad' ? '❌ สถิติไม่ผ่าน' : '… ตัวอย่างยังน้อย'}</span>
        <span class="muted"> (ก่อนหน้า ${x.prior.n} ครั้ง · TP2 ${pct(x.prior.wr2)} · ${rr(x.prior.exp)})</span></div>
      <ol class="reasons">${x.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ol>
      ${active ? '' : `<div class="muted" style="margin-top:6px">ผล: TP1 ${resTH(x.r1)} · TP2 ${resTH(x.r2)} · ${A.n - 1 - x.idx} แท่งที่แล้ว</div>`}
    </div>`;
  };
  $('an-signal').innerHTML = s
    ? `<div class="panel-h">สัญญาณที่ยังเปิดอยู่</div>${card(s, true)}`
    : `<div class="panel-h">สัญญาณ</div><p class="muted">ตอนนี้ยังไม่มีสัญญาณใหม่ (รอแท่งเทียนกลับตัวที่โซน/ตามเทรนด์)</p>${last ? '<div class="panel-h" style="margin-top:8px">สัญญาณล่าสุด</div>' + card(last, false) : ''}`;

  const row = (name, st) => `<tr><td>${name}</td><td>${st.n}</td><td>${pct(st.wr1)}</td><td>${pct(st.wr2)}</td><td class="${st.exp > 0 ? 'up' : st.exp < 0 ? 'down' : ''}">${rr(st.exp)}</td></tr>`;
  const st = A.stats;
  $('an-stats').innerHTML = `<div class="panel-h">ทดสอบย้อนหลัง (${A.n} แท่ง · ${S.symbol} ${tf().label})</div>
    <table class="stat"><thead><tr><th>กลุ่ม</th><th>ไม้</th><th>TP1</th><th>TP2</th><th>เฉลี่ย</th></tr></thead><tbody>
    ${row('<b>ทั้งหมด</b>', st.all)}${row('<b>เฉพาะที่ผ่านโหมดเรียนรู้</b>', st.learned)}
    ${Object.entries(st.bySetup).map(([k, v]) => row(SETUP_TH[k], v)).join('')}
    ${Object.entries(st.byPattern).map(([k, v]) => row('· ' + AN.PAT[k].name, v)).join('')}
    </tbody></table>
    <p class="muted">TP1/TP2 = อัตราชนะ (ถึง TP ก่อน SL) · เฉลี่ย = กำไรเฉลี่ยต่อไม้ถ้าถือถึง TP2 (หน่วย R) · โดน SL และ TP ในแท่งเดียวกันนับเป็นแพ้</p>`;
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
