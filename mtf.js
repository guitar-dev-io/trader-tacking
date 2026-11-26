import { PT, def } from './src/pt.ts';
import { view } from './src/state.ts';
import { ICON } from './icons.js';
import { AN } from './src/legacy/core.ts';
import { $, DOWN, S, TC, TFS, THEME, TZ, UP, digits, fmt, store, tf } from './app-core.js';
import { chart, chartThemeOptions } from './app-chart.js';
import { dedupe, loadChart, onQuotesMsg, toCandle, valid } from './app-data.js';
import { el, lToX, label, txt, yOf } from './app-overlay.js';
import { xOfT } from './draw.js';
import { DEMO } from './extras.js';
def({ MTF: [() => MTF] });
// Multi-timeframe (top-down) view: a higher-timeframe chart beside the main chart, its structure and zones
// drawn onto the main chart, a band showing what the main chart is looking at, and both trends in the header.
const MTF = (() => {
  const AUTO = { 0: 2, 1: 3, 2: 4, 3: 4, 4: 5, 5: 6, 6: 6 };   // 1m→15m, 5m→1H, 15m→4H, 1H→4H, 4H→1D, 1D→1W
  const cfg = { on: false, tf: 'auto', zones: true, levels: true, ...store.get('mtf', {}) };
  const save = () => store.set('mtf', cfg);
  const activeType = () => (cfg.on ? (cfg.tf === 'auto' ? AUTO[S.tf] : +cfg.tf) : null);
  const tfo = () => TFS.find((t) => t.type === activeType()) || TFS[4];
  let candles = [], view = [], A = null, pending = false, hoverT = null, mdirty = true, err = '';

  // ---------------- layout
  const row = document.createElement('div'); row.id = 'chart-row';
  $('chart-wrap').before(row); row.appendChild($('chart-wrap'));
  const pane = document.createElement('div'); pane.id = 'mtf-pane'; pane.className = 'hidden';
  pane.innerHTML = `<div class="mtf-head"><b id="mtf-title"></b><span id="mtf-trend"></span><span class="grow"></span>
    <select id="mtf-tf" title="Timeframe ใหญ่"><option value="auto">อัตโนมัติ</option>${TFS.map((t) => `<option value="${t.type}">${t.label}</option>`).join('')}</select>
    <label class="chk" title="วาดโซนของ TF ใหญ่ลงบนกราฟหลัก"><input type="checkbox" id="mtf-zones"> โซน</label>
    <label class="chk" title="เส้น Swing High/Low ล่าสุดของ TF ใหญ่บนกราฟหลัก"><input type="checkbox" id="mtf-levels"> สวิง</label>
    <button id="mtf-x" class="pop-x" style="position:static" title="ปิด" aria-label="ปิด">${ICON.svg('x', 16)}</button></div>
    <div id="mtf-chart-wrap"><div id="mtf-chart"></div><div id="mtf-msg" class="hidden"></div></div>`;
  row.appendChild(pane);
  $('an-btn').closest('.dropdown').insertAdjacentHTML('afterend', `<button id="mtf-btn" class="tb-btn" title="ดูหลาย Timeframe (top-down)"><i>${ICON.svg('layers', 16)}</i>MTF</button>`);
  $('trend-badge').insertAdjacentHTML('afterend', '<span id="mtf-badge"></span>');

  const mch = LightweightCharts.createChart($('mtf-chart'), {
    autoSize: true,
    ...chartThemeOptions(10),
    crosshair: { ...chartThemeOptions(10).crosshair, mode: LightweightCharts.CrosshairMode.Normal },
    timeScale: { borderColor: TC().border, timeVisible: true, secondsVisible: false, rightOffset: 6 },
  });
  THEME.onChange(() => mch.applyOptions(chartThemeOptions(10)));
  let ms = null;
  function buildSeries() {
    if (ms) mch.removeSeries(ms);
    ms = mch.addSeries(LightweightCharts.CandlestickSeries, { upColor: UP, downColor: DOWN, borderVisible: false, wickUpColor: UP, wickDownColor: DOWN,
      priceFormat: { type: 'price', precision: digits(), minMove: 1 / 10 ** digits() }, priceLineVisible: true });
    ms.setData(view);
  }
  buildSeries();
  const NS = 'http://www.w3.org/2000/svg';
  const msvg = document.createElementNS(NS, 'svg');
  msvg.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;z-index:3;overflow:hidden';
  $('mtf-chart-wrap').appendChild(msvg);
  const mel = (tag, a) => { const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); msvg.appendChild(e); return e; };
  const mtxt = (x, y, s, c, anchor = 'middle', size = 10, w = 600) => { const t = mel('text', { x, y, fill: c, 'font-size': size, 'font-weight': w, 'text-anchor': anchor, 'font-family': '-apple-system, sans-serif' }); t.textContent = s; };

  // ---------------- data
  function load() {
    if (!cfg.on) return;
    candles = []; view = []; A = null; pending = true; err = ''; ms.setData([]); showMsg('กำลังโหลด ' + tfo().label + '…');
    $('mtf-title').textContent = `${S.symbol} · ${tfo().label}`;
    const req = { symbol: S.symbol, candleType: activeType(), to: new Date().toISOString(), inclusive: true, limit: 600, slot: 'mtf' };
    if (S.source === 'demo') DEMO.requestChart(req); else vcg.requestChart(req);
    if (S.source === 'demo') DEMO.connect();
  }
  function onMsg(m) {
    if (!cfg.on || !m) return;
    if (m.type === 'chartAuthRenew') return showMsg('ต่อ token ใหม่…');
    if (m.type === 'chartError') { err = (m.data && m.data.message) || 'error'; return showMsg('โหลดไม่สำเร็จ: ' + err); }
    if (m.type !== 'chart' || !m.data) return;
    const d = m.data, sym = d.symbol || (d.history && d.history.symbol);
    if (sym && sym !== S.symbol) return;
    if (d.history && d.history.candles && pending) {
      const arr = d.history.candles.map(toCandle).filter(valid).sort((a, b) => a.time - b.time);
      const q = S.quotes[S.symbol], lastC = arr[arr.length - 1];
      if (q && lastC && Math.abs(lastC.close - q.bid) / q.bid > 0.25) return;   // belongs to a previous symbol
      pending = false; candles = dedupe(arr); showMsg('');
      refresh(true);
    }
    if (d.updates && d.updates.candles && !pending) for (const c of d.updates.candles.map(toCandle).filter(valid)) upsert(c);
  }
  function upsert(c) {
    if (!candles.length) return;
    const last = candles[candles.length - 1];
    if (c.time < last.time) return;
    const isNew = c.time > last.time;
    if (isNew) candles.push(c); else candles[candles.length - 1] = c;
    refresh(isNew);
  }
  function onQuote(q) {
    if (!cfg.on || S.replay || q.symbol !== S.symbol || !candles.length || q.bid == null) return;
    const t = Math.floor(Date.parse(q.time) / 1000) + TZ, last = candles[candles.length - 1], sec = tfo().sec;
    if (sec <= 14400 && t >= last.time + sec) { candles.push({ time: Math.floor((t - TZ) / sec) * sec + TZ, open: q.bid, high: q.bid, low: q.bid, close: q.bid }); refresh(true); }
    else { last.close = q.bid; last.high = Math.max(last.high, q.bid); last.low = Math.min(last.low, q.bid); refresh(false); }
  }
  // During Bar Replay: hide future HTF bars and rebuild the current HTF bar from the replayed lower-TF bars (no look-ahead).
  function computeView() {
    if (!S.replay || !S.candles.length) return candles;
    const rt = S.candles[S.candles.length - 1].time;
    const vis = candles.filter((c) => c.time <= rt);
    if (!vis.length) return vis;
    const lastT = vis[vis.length - 1].time, part = S.candles.filter((c) => c.time >= lastT);
    if (part.length) vis[vis.length - 1] = { time: lastT, open: part[0].open, high: Math.max(...part.map((c) => c.high)), low: Math.min(...part.map((c) => c.low)), close: part[part.length - 1].close };
    return vis;
  }
  let lastLen = 0;
  function refresh(full) {
    view = computeView();
    if (full || view.length !== lastLen) {
      ms.setData(view);
      const closed = view.slice(0, -1);
      A = closed.length >= 50 ? AN.analyze(closed, { swingLen: S.an.swingLen, digits: digits(), rr1: +S.prefs.rr1, rr2: +S.prefs.rr2, slBuf: +S.prefs.slBuf }) : null;
      if (lastLen === 0 && view.length) mch.timeScale().setVisibleLogicalRange({ from: Math.max(0, view.length - 90), to: view.length + 5 });
      lastLen = view.length;
      renderBadges();
    } else if (view.length) ms.update(view[view.length - 1]);
    mdirty = true; view.dirty = true;
  }
  const replaySync = () => { if (cfg.on) refresh(true); };

  // ---------------- header / badges
  function renderBadges() {
    const b = $('mtf-badge'), t = $('mtf-trend');
    if (!cfg.on || !A) { b.textContent = ''; b.className = ''; t.textContent = ''; return; }
    const tr = A.lastTrend, txtT = tr === 1 ? '▲ ขาขึ้น' : tr === -1 ? '▼ ขาลง' : '◆ ไซด์เวย์', cls = tr === 1 ? 'up' : tr === -1 ? 'down' : 'flat';
    b.textContent = `${tfo().label} ${tr === 1 ? '▲' : tr === -1 ? '▼' : '◆'}`; b.className = 'tbadge ' + cls; b.title = `เทรนด์ ${tfo().label}: ${txtT}`;
    t.textContent = txtT; t.className = cls;
    const lt = S.A ? S.A.lastTrend : 0;
    if (A && S.A && tr && lt && tr !== lt) b.title += ` — สวนกับ ${tf().label} (ระวังการเทรดสวนเทรนด์ใหญ่)`;
  }
  function showMsg(s) { const m = $('mtf-msg'); m.textContent = s; m.classList.toggle('hidden', !s); }

  // ---------------- drawing in the HTF pane
  const idxOf = (t) => {   // fractional index of a time inside `view`
    const c = view, n = c.length; if (!n) return null;
    const sec = tfo().sec;
    if (t <= c[0].time) return (t - c[0].time) / sec;
    if (t >= c[n - 1].time) return n - 1 + (t - c[n - 1].time) / sec;
    let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m].time <= t) lo = m; else hi = m; }
    return lo + (t - c[lo].time) / (c[hi].time - c[lo].time);
  };
  const mx = (t) => { const l = idxOf(t); return l == null ? null : lToX(mch.timeScale(), l); };
  const my = (p) => ms.priceToCoordinate(p);
  function drawPane() {
    if (!mdirty || !cfg.on) return; mdirty = false;
    const r = $('mtf-chart').getBoundingClientRect();
    const W = r.width - mch.priceScale('right').width(), H = mch.panes()[0] ? mch.panes()[0].getHeight() : r.height;
    msvg.setAttribute('width', Math.max(0, W)); msvg.setAttribute('height', Math.max(0, H)); msvg.textContent = '';
    if (!view.length) return;
    // band = what the main chart is showing
    const vr = chart.timeScale().getVisibleRange();
    if (vr && S.candles.length) {
      const x1 = mx(vr.from), x2 = mx(vr.to);
      if (x1 != null && x2 != null) { mel('rect', { x: Math.max(0, x1), y: 0, width: Math.max(2, Math.min(W, x2) - Math.max(0, x1)), height: H, fill: '#2962ff14', stroke: '#2962ff55' }); mtxt(Math.max(0, x1) + 4, H - 6, `มุมมอง ${tf().label}`, '#82aaff', 'start', 9.5, 500); }
    }
    if (A) {
      for (const z of A.zones) {
        const yt = my(z.top), yb = my(z.bottom), x0 = Math.max(0, mx(view[z.first].time) ?? 0); if (yt == null || yb == null) continue;
        const col = z.kind === 'support' ? UP : DOWN;
        mel('rect', { x: x0, y: Math.min(yt, yb), width: Math.max(0, W - x0), height: Math.max(2, Math.abs(yb - yt)), fill: col + '1f', stroke: col + '66', 'stroke-dasharray': '2 3' });
      }
      const sw = A.swings.slice(-14);
      if (sw.length > 1) mel('polyline', { points: sw.map((s) => `${mx(view[s.i].time)},${my(s.price)}`).join(' '), fill: 'none', stroke: TC().muted, 'stroke-width': 1.2, 'stroke-opacity': 0.8 });
      for (const s of sw) {
        const x = mx(view[s.i].time), y = my(s.price); if (x == null || y == null) continue;
        const good = s.label === 'HH' || s.label === 'HL';
        mtxt(x, s.type === 'H' ? y - 7 : y + 14, s.label, s.label.length === 1 ? '#9aa0ad' : good ? UP : DOWN);
      }
      for (const e of A.events.slice(-6)) {
        const x1 = mx(view[e.from].time), x2 = mx(view[e.idx].time), y = my(e.price); if (x1 == null || x2 == null || y == null) continue;
        const col = e.dir === 1 ? UP : DOWN;
        mel('line', { x1, y1: y, x2, y2: y, stroke: col, 'stroke-dasharray': '4 3' }); mtxt((x1 + x2) / 2, e.dir === 1 ? y - 3 : y + 11, e.type, col, 'middle', 9.5);
      }
    }
    if (hoverT != null) { const x = mx(hoverT); if (x != null) mel('line', { x1: x, y1: 0, x2: x, y2: H, stroke: '#ffffff66', 'stroke-dasharray': '3 3' }); }
  }
  (function loop() { drawPane(); requestAnimationFrame(loop); })();
  mch.timeScale().subscribeVisibleLogicalRangeChange(() => { mdirty = true; });
  new ResizeObserver(() => { mdirty = true; }).observe($('mtf-chart'));
  $('mtf-chart-wrap').addEventListener('wheel', () => { mdirty = true; }, { passive: true });
  $('mtf-chart-wrap').addEventListener('pointermove', (e) => { if (e.buttons) mdirty = true; }, { passive: true });
  chart.timeScale().subscribeVisibleLogicalRangeChange(() => { mdirty = true; });
  chart.subscribeCrosshairMove((p) => { const t = p && p.time != null ? p.time : null; if (t !== hoverT) { hoverT = t; mdirty = true; } });
  // click on the HTF chart → move the main chart there
  mch.subscribeClick((p) => {
    if (!p || p.time == null || !S.candles.length) return;
    const vr = chart.timeScale().getVisibleRange(); const span = vr ? vr.to - vr.from : tf().sec * 120;
    const t = Math.max(S.candles[0].time + span / 2, p.time + tfo().sec / 2);
    try { chart.timeScale().setVisibleRange({ from: t - span / 2, to: t + span / 2 }); } catch (_) {}
  });

  // ---------------- HTF levels drawn on the main chart (called from draw.js redraw)
  function drawOnMain(W) {
    if (!cfg.on || !A || !view.length) return;
    const L = tfo().label, col = '#ce93d8';
    if (cfg.zones) for (const z of A.zones) {
      const yt = yOf(z.top), yb = yOf(z.bottom); if (yt == null || yb == null) continue;
      const x0 = Math.max(0, xOfT(view[z.first].time) ?? 0), zc = z.kind === 'support' ? UP : DOWN;
      el('rect', { x: x0, y: Math.min(yt, yb), width: Math.max(0, W - x0), height: Math.max(2, Math.abs(yb - yt)), fill: zc + '14', stroke: col, 'stroke-width': 1.2, 'stroke-opacity': 0.7 });
      txt(Math.max(x0, 0) + 6, Math.min(yt, yb) - 3, `${L} ${z.kind === 'support' ? 'แนวรับ' : 'แนวต้าน'} ×${z.touches}`, col, 'start', 10, 600);
    }
    if (cfg.levels) {
      const lastH = [...A.swings].reverse().find((s) => s.type === 'H'), lastL = [...A.swings].reverse().find((s) => s.type === 'L');
      for (const s of [lastH, lastL]) {
        if (!s) continue; const y = yOf(s.price); if (y == null) continue;
        el('line', { x1: 0, y1: y, x2: W, y2: y, stroke: col, 'stroke-width': 1.2, 'stroke-dasharray': '8 4' });
        label(70, y + 4, `${L} ${s.label} ${fmt(s.price)}`, '#6a1b9a', '#fff', 'start');
      }
    }
  }

  // ---------------- toggles
  function setOn(v) {
    cfg.on = v; save();
    pane.classList.toggle('hidden', !v); $('mtf-btn').classList.toggle('active', v); document.body.classList.toggle('mtf-on', v);
    if (v) { buildSeries(); load(); } else { candles = []; view = []; A = null; renderBadges(); }
    view.dirty = true;
    if (S.source === 'demo') DEMO.connect();
  }
  $('mtf-btn').onclick = () => setOn(!cfg.on);
  $('mtf-x').onclick = () => setOn(false);
  $('mtf-tf').value = String(cfg.tf);
  $('mtf-tf').onchange = () => { cfg.tf = $('mtf-tf').value === 'auto' ? 'auto' : +$('mtf-tf').value; save(); load(); };
  $('mtf-zones').checked = cfg.zones; $('mtf-zones').onchange = () => { cfg.zones = $('mtf-zones').checked; save(); view.dirty = true; };
  $('mtf-levels').checked = cfg.levels; $('mtf-levels').onchange = () => { cfg.levels = $('mtf-levels').checked; save(); view.dirty = true; };

  // reload the HTF whenever the main chart reloads (symbol / timeframe / source / timezone change)
  const _load = loadChart;
  PT.loadChart = function () { _load(); if (cfg.on) { buildSeries(); load(); } };
  const _oq = onQuotesMsg;
  PT.onQuotesMsg = function (list) { _oq(list); for (const q of list) onQuote(q); };

  // Phones: a normal single chart (switch timeframe by tapping) — the split view is a desktop feature.
  const isMobile = () => document.body.classList.contains('mobile');
  if (isMobile()) $('mtf-btn').classList.add('hidden');
  setTimeout(() => setOn(cfg.on && !isMobile()), 0);
  return { onMsg, drawOnMain, replaySync, activeType, setOn, get A() { return A; } };
})();
