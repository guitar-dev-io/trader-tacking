/* global LightweightCharts, IND, AN, CUSTOM, LESSONS, ICON, vcg */
const { createChart, CandlestickSeries, BarSeries, LineSeries, AreaSeries, HistogramSeries, LineStyle, CrosshairMode } = LightweightCharts;

// ---------------------------------------------------------------- constants / storage
const TFS = [
  { label: '1m', type: 0, sec: 60 }, { label: '5m', type: 1, sec: 300 }, { label: '15m', type: 2, sec: 900 },
  { label: '1H', type: 3, sec: 3600 }, { label: '4H', type: 4, sec: 14400 }, { label: '1D', type: 5, sec: 86400 },
  { label: '1W', type: 6, sec: 604800 },
];
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} },
};

// Timezone of the chart: 'local' or an IANA zone. Candle times are shifted by this offset.
const _dtf = new Map();
function zoneOffsetSec(zone, date = new Date()) {
  if (!zone || zone === 'local') return -date.getTimezoneOffset() * 60;
  let f = _dtf.get(zone);
  if (!f) { f = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }); _dtf.set(zone, f); }
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(date.getTime() / 1000) * 1000) / 1000);
}
let TZ = zoneOffsetSec(store.get('tz', 'local'));
const FIB_DEF = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1], FIBX_DEF = [0, 0.618, 1, 1.272, 1.618, 2, 2.618];
let FIB = store.get('fibLevels', FIB_DEF), FIBX = store.get('fibExtLevels', FIBX_DEF);
const fibColor = (lv) => ({ 0: '#787b86', 0.236: '#f23645', 0.382: '#ff9800', 0.5: '#4caf50', 0.618: '#089981', 0.786: '#00bcd4', 1: '#787b86', 1.272: '#2962ff', 1.414: '#9c27b0', 1.618: '#f23645', 2: '#ff9800', 2.618: '#e91e63', 3.618: '#9c27b0', 4.236: '#00bcd4' })[lv] || '#b2b5be';
const FIB_COLORS = ['#787b86', '#f23645', '#ff9800', '#4caf50', '#089981', '#00bcd4', '#787b86'];
const IND_COLORS = ['#f5a623', '#2962ff', '#e040fb', '#00bcd4', '#ff5252', '#8bc34a', '#ffeb3b'];
let UP = '#26a69a', DOWN = '#ef5350';



// Clean chart by default: analysis overlays are opt-in from the 🧠 menu.
const AN_DEFAULT = { autofib: false, bounce: false, liquidity: false, bounceSide: 'both', swing: false, legs: false, structure: false, zones: false, patterns: false, signals: false, history: false, td: false, learnOnly: false, notify: false, swingLen: 5 };
const AN_VIEW_KEYS = ['autofib', 'bounce', 'liquidity', 'swing', 'legs', 'structure', 'zones', 'patterns', 'signals', 'history', 'td'];
// one-time migration (v2.0.3): switch existing installs to the clean default
if (store.get('defaultsV', 1) < 2) {
  const an = store.get('an', null);
  if (an) { AN_VIEW_KEYS.forEach((k) => { an[k] = false; }); an.notify = false; store.set('an', an); }
  const inds = store.get('inds', null);
  if (inds && JSON.stringify(inds.map((i) => [i.type, i.params])) === JSON.stringify([['ema', { period: 50 }], ['sma', { period: 200 }]])) store.set('inds', []);
  store.set('sessions', true);
  store.set('defaultsV', 2);
}
const S = {
  symbol: store.get('symbol', 'XAUUSD'),
  tf: store.get('tf', 3),
  ctype: store.get('ctype', 'candles'),
  inds: store.get('inds', []),
  scripts: store.get('scripts', []),
  alerts: store.get('alerts', []),
  an: { ...AN_DEFAULT, ...store.get('an', {}) },
  showAsk: store.get('showAsk', true),
  magnet: store.get('magnet', true),
  symbols: [], traySymbol: '', quotes: {}, candles: [], digits: {},
  tool: 'cursor', pending: null, mouse: null, selected: null, measure: null,
  pendingHistory: false, loadingMore: false, noMore: false,
  A: null, notified: store.get('notified', {}),
  source: store.get('source', 'vcg'),   // 'vcg' | 'demo'
};
const PREF_DEFAULT = { sound: true, desktop: true, toast: true, historyBars: 1500, rr1: 1, rr2: 2, slBuf: 0.2, minSamples: 5, maxBars: 100 };
S.prefs = { ...PREF_DEFAULT, ...store.get('prefs', {}) };
const tf = () => TFS.find((t) => t.type === S.tf) || TFS[3];
const drawingsKey = () => 'drawings:' + S.symbol;
let drawings = [];
const saveDrawings = () => store.set(drawingsKey(), drawings);
const digits = () => S.digits[S.symbol] ?? 2;
const fmt = (v, d = digits()) => (v == null || !isFinite(v) ? '—' : Number(v).toFixed(d));
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// icons
document.querySelectorAll('[data-icon]').forEach((i) => (i.innerHTML = ICON.svg(i.dataset.icon, 16)));

// renderer errors → log
window.addEventListener('error', (e) => vcg.log('error', `${e.message} @ ${(e.filename || '').split('/').pop()}:${e.lineno}`));
window.addEventListener('unhandledrejection', (e) => vcg.log('error', 'unhandledrejection: ' + (e.reason && e.reason.message || e.reason)));

// ---------------------------------------------------------------- chart
const chart = createChart($('chart'), {
  autoSize: true,
  layout: { background: { type: 'solid', color: '#0f1115' }, textColor: '#9aa0ad', fontSize: 11,
    panes: { separatorColor: '#232734', separatorHoverColor: '#2962ff55' } },
  grid: { vertLines: { color: '#1a1d27' }, horzLines: { color: '#1a1d27' } },
  crosshair: { mode: CrosshairMode.Normal },
  rightPriceScale: { borderColor: '#232734' },
  timeScale: { borderColor: '#232734', timeVisible: true, secondsVisible: false, rightOffset: 10 },
});
let main = null, askLine = null, hlineObjs = [], alertLines = [], indSeries = [];
const customOut = new Map(); // ind.id -> last run output

function priceFormat() { const d = digits(); return { type: 'price', precision: d, minMove: 1 / 10 ** d }; }
function displayData() {
  if (S.ctype === 'ha') return IND.heikinAshi(S.candles);
  if (S.ctype === 'line' || S.ctype === 'area') return S.candles.map((c) => ({ time: c.time, value: c.close }));
  return S.candles;
}
function buildMain() {
  if (main) { chart.removeSeries(main); main = null; askLine = null; hlineObjs = []; alertLines = []; }
  const common = { priceFormat: priceFormat(), priceLineVisible: true, lastValueVisible: true };
  if (S.ctype === 'line') main = chart.addSeries(LineSeries, { ...common, color: '#2962ff', lineWidth: 2 }, 0);
  else if (S.ctype === 'area') main = chart.addSeries(AreaSeries, { ...common, lineColor: '#2962ff', topColor: '#2962ff55', bottomColor: '#2962ff05', lineWidth: 2 }, 0);
  else if (S.ctype === 'bars') main = chart.addSeries(BarSeries, { ...common, upColor: UP, downColor: DOWN, thinBars: false }, 0);
  else main = chart.addSeries(CandlestickSeries, { ...common, upColor: UP, downColor: DOWN, borderVisible: false, wickUpColor: UP, wickDownColor: DOWN }, 0);
  main.setData(displayData());
  refreshPriceLines();
}
function refreshPriceLines() {
  if (!main) return;
  hlineObjs.forEach((l) => main.removePriceLine(l)); hlineObjs = [];
  alertLines.forEach((l) => main.removePriceLine(l)); alertLines = [];
  if (askLine) { main.removePriceLine(askLine); askLine = null; }
  S.alerts.filter((a) => a.symbol === S.symbol && !a.fired).forEach((a) => {
    alertLines.push(main.createPriceLine({ price: a.price, color: '#ff9800', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: '🔔' }));
  });
  const q = S.quotes[S.symbol];
  if (S.showAsk && q && q.ask != null) askLine = main.createPriceLine({ price: q.ask, color: '#ef535099', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: 'Ask' });
}

// ---------------------------------------------------------------- indicators (built-in + custom scripts)
const scriptOf = (ind) => S.scripts.find((s) => s.id === ind.scriptId);
function indName(ind) {
  if (ind.type === 'custom') { const sc = scriptOf(ind); return (sc ? sc.name : '(ลบแล้ว)') + (Object.keys(ind.params || {}).length ? ' ' + Object.values(ind.params).join(', ') : ''); }
  const def = IND.DEFS[ind.type]; return `${def.name} ${Object.values(ind.params).join(', ')}`;
}
function runCustom(ind) {
  const sc = scriptOf(ind);
  if (!sc) return { plots: [], hlines: [], markers: [], inputs: {}, error: 'ไม่พบสคริปต์' };
  const out = CUSTOM.run(sc.code, S.candles, ind.params || {});
  if (out.error && customOut.get(ind.id)?.error !== out.error) vcg.log('error', `indicator "${sc.name}": ${out.error}`, null, 'script');
  ind.params = { ...out.inputs };
  customOut.set(ind.id, out);
  return out;
}
function buildIndicators() {
  indSeries.forEach((x) => chart.removeSeries(x.series)); indSeries = [];
  for (let i = chart.panes().length - 1; i > 0; i--) if (chart.panes()[i].getSeries().length === 0) chart.removePane(i);
  let pane = 0;
  for (const ind of S.inds) {
    if (ind.type === 'custom') {
      const out = runCustom(ind);
      let sub = null;
      out.plots.forEach((pl, k) => {
        let p = 0;
        if (pl.pane === 'sub') { if (sub == null) sub = ++pane; p = sub; }
        const s = pl.type === 'histogram'
          ? chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false, priceFormat: { type: 'price', precision: 4, minMove: 0.0001 } }, p)
          : chart.addSeries(LineSeries, { color: pl.color || IND_COLORS[k % IND_COLORS.length], lineWidth: pl.width, priceLineVisible: false, lastValueVisible: p > 0, crosshairMarkerVisible: false,
            priceFormat: p === 0 ? priceFormat() : { type: 'price', precision: 2, minMove: 0.01 } }, p);
        indSeries.push({ ind, key: k, series: s, hist: pl.type === 'histogram', custom: true, color: pl.color });
        if (k === 0 || (pl.pane === 'sub' && out.plots.findIndex((x) => x.pane === 'sub') === k)) {
          if (pl.pane === 'sub') out.hlines.forEach((h) => s.createPriceLine({ price: h.price, color: h.color, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false }));
        }
      });
      continue;
    }
    const def = IND.DEFS[ind.type]; if (!def) continue;
    const p = def.pane === 'main' ? 0 : ++pane;
    let first = null;
    for (const [key, col] of Object.entries(def.lines)) {
      const color = Object.keys(def.lines).length === 1 ? ind.color || col : col;
      const s = col === 'hist'
        ? chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false, priceFormat: { type: 'price', precision: 5, minMove: 0.00001 } }, p)
        : chart.addSeries(LineSeries, { color, lineWidth: key === 'mid' ? 1 : 2, priceLineVisible: false, lastValueVisible: def.pane === 'sub', crosshairMarkerVisible: false,
          priceFormat: def.pane === 'main' ? priceFormat() : { type: 'price', precision: 2, minMove: 0.01 } }, p);
      indSeries.push({ ind, key, series: s, hist: col === 'hist' });
      if (!first) first = s;
    }
    if (def.levels && first) def.levels.forEach((lv) => first.createPriceLine({ price: lv, color: '#787b8666', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false }));
  }
  const subs = chart.panes().length - 1;
  chart.panes().forEach((pn, i) => pn.setStretchFactor(i === 0 ? Math.max(3, 5 - subs) : 1));
  updateIndicators();
  renderLegend();
}
const histColor = (data) => data.map((d, i) => ({ ...d, color: d.value >= 0 ? (i && data[i - 1].value > d.value ? '#26a69a88' : UP) : (i && data[i - 1].value < d.value ? '#ef535088' : DOWN) }));
let indTimer = null, lastIndRun = 0;
function updateIndicators(throttle) {
  if (throttle) { // live ticks: recompute at most once per second
    if (indTimer) return;
    indTimer = setTimeout(() => { indTimer = null; updateIndicators(); }, Math.max(0, 1000 - (Date.now() - lastIndRun)));
    return;
  }
  lastIndRun = Date.now();
  const cache = new Map();
  for (const x of indSeries) {
    if (x.custom) {
      if (!cache.has(x.ind)) {
        const out = S.candles.length ? runCustom(x.ind) : { plots: [] };
        cache.set(x.ind, out);
      }
      const out = cache.get(x.ind), pl = out.plots[x.key];
      if (!pl) continue;
      let data = S.candles.map((c, i) => (pl.values[i] == null || !isFinite(pl.values[i]) ? null : { time: c.time, value: pl.values[i] })).filter(Boolean);
      if (x.hist) data = histColor(data);
      setSeries(x, data);
      continue;
    }
    if (!cache.has(x.ind)) cache.set(x.ind, S.candles.length ? IND.DEFS[x.ind.type].calc(S.candles, x.ind.params) : {});
    let data = cache.get(x.ind)[x.key] || [];
    if (x.hist) data = histColor(data);
    setSeries(x, data);
  }
  dirty = true;
}
// Only the last point changes on a live tick → update() it instead of re-sending the whole series (smoother).
function setSeries(x, data) {
  const last = data[data.length - 1];
  x.last = last ? last.value : null;
  if (x.len === data.length && x.firstT === (data[0] && data[0].time) && last && x.lastT === last.time) { try { x.series.update(last); return; } catch (_) {} }
  x.series.setData(data);
  x.len = data.length; x.firstT = data[0] && data[0].time; x.lastT = last && last.time;
}

// ---------------------------------------------------------------- legend
let legendTimer = null;
function renderLegend(param) {
  const el = $('legend');
  let bar = null;
  if (param && param.time != null && main) {
    const d = param.seriesData.get(main);
    if (d) bar = d.open != null ? d : { open: d.value, high: d.value, low: d.value, close: d.value };
  }
  if (!bar && S.candles.length) bar = S.candles[S.candles.length - 1];
  let html = '';
  if (bar) {
    const ch = bar.close - bar.open, cls = ch >= 0 ? 'up' : 'down';
    html += `<div class="row"><b>${S.symbol} · ${tf().label}</b>
      <span>O <span class="${cls}">${fmt(bar.open)}</span></span><span>H <span class="${cls}">${fmt(bar.high)}</span></span>
      <span>L <span class="${cls}">${fmt(bar.low)}</span></span><span>C <span class="${cls}">${fmt(bar.close)}</span></span>
      <span class="${cls}">${ch >= 0 ? '+' : ''}${fmt(ch)} (${((ch / bar.open) * 100).toFixed(2)}%)</span></div>`;
  }
  for (const ind of S.inds) {
    const isC = ind.type === 'custom', def = IND.DEFS[ind.type];
    if (!isC && !def) continue;
    const vals = indSeries.filter((x) => x.ind === ind).map((x) => {
      const d = param && param.seriesData ? param.seriesData.get(x.series) : null;
      const v = d ? d.value : x.last;
      const col = x.hist ? '#9aa0ad' : isC ? (x.color || '#d6d9e0') : (Object.keys(def.lines).length === 1 ? ind.color : def.lines[x.key]);
      const isMain = isC ? (customOut.get(ind.id)?.plots[x.key]?.pane === 'main') : def.pane === 'main';
      return `<span style="color:${col}">${v == null ? '—' : isMain ? fmt(v) : v.toFixed(2)}</span>`;
    }).join(' ');
    const err = isC && customOut.get(ind.id)?.error ? `<span class="err" title="${esc(customOut.get(ind.id).error)}">⚠ error</span>` : '';
    html += `<div class="row"><span class="ind" data-id="${ind.id}"><b style="color:${ind.color || '#d6d9e0'}">${esc(indName(ind))}</b> ${vals} ${err}
      ${isC ? '<button data-act="code" title="แก้โค้ด">{ }</button>' : ''}<button data-act="edit" title="ตั้งค่า">⚙</button><button data-act="del" title="ลบ">✕</button></span></div>`;
  }
  el.innerHTML = html;
}
chart.subscribeCrosshairMove((p) => { if (legendTimer) return; legendTimer = requestAnimationFrame(() => { legendTimer = null; renderLegend(p); }); });
$('legend').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const id = +b.closest('.ind').dataset.id;
  const ind = S.inds.find((i) => i.id === id);
  if (b.dataset.act === 'del') { S.inds = S.inds.filter((i) => i.id !== id); customOut.delete(id); store.set('inds', S.inds); buildIndicators(); }
  else if (b.dataset.act === 'code') openScriptEditor(ind.scriptId);
  else editIndicator(ind);
});

function editIndicator(ind) {
  closeMenus();
  const menu = $('ind-menu'); menu.classList.remove('hidden');
  const isC = ind.type === 'custom';
  const def = isC ? null : IND.DEFS[ind.type];
  const single = isC || Object.keys(def.lines).length === 1;
  menu.innerHTML = `<div class="group">${esc(isC ? indName(ind) : def.name)}</div>` +
    Object.entries(ind.params || {}).map(([k, v]) => `<div class="item"><span>${esc(k)}</span><input data-k="${esc(k)}" type="number" step="any" value="${v}" style="width:80px"></div>`).join('') +
    (single && !isC ? `<div class="item"><span>สี</span><input data-color type="color" value="${ind.color || '#f5a623'}" style="width:80px;padding:0"></div>` : '') +
    `<div class="item" style="justify-content:flex-end;gap:6px"><button data-cancel>ยกเลิก</button><button data-ok class="primary">ตกลง</button></div>`;
  menu.querySelector('[data-cancel]').onclick = closeMenus;
  menu.querySelector('[data-ok]').onclick = () => {
    menu.querySelectorAll('input[data-k]').forEach((i) => { const v = parseFloat(i.value); if (isFinite(v)) ind.params[i.dataset.k] = v; });
    const c = menu.querySelector('input[data-color]'); if (c) ind.color = c.value;
    store.set('inds', S.inds); closeMenus(); buildIndicators();
  };
}
function addIndicator(o) {
  const id = Math.max(0, ...S.inds.map((i) => i.id)) + 1;
  S.inds.push({ id, color: IND_COLORS[S.inds.length % IND_COLORS.length], params: {}, ...o });
  store.set('inds', S.inds); buildIndicators();
}
function openIndicatorMenu() {
  const menu = $('ind-menu');
  if (!menu.classList.contains('hidden')) return closeMenus();
  closeMenus();
  const item = ([k, d]) => `<div class="item" data-type="${k}"><span>${d.name}</span><small>${Object.values(d.params).join(', ')}</small></div>`;
  const all = Object.entries(IND.DEFS);
  menu.innerHTML = '<div class="group">บนกราฟราคา</div>' + all.filter(([, d]) => d.pane === 'main').map(item).join('') +
    '<div class="group">หน้าต่างแยก (Oscillators)</div>' + all.filter(([, d]) => d.pane === 'sub').map(item).join('') +
    '<div class="group">สคริปต์ของฉัน</div>' +
    S.scripts.map((s) => `<div class="item sc" data-script="${s.id}"><span>${esc(s.name)}</span><button data-edit="${s.id}">แก้โค้ด</button></div>`).join('') +
    '<div class="item" data-new><span>✏️ เขียน indicator ใหม่…</span></div>';
  menu.classList.remove('hidden');
  menu.querySelectorAll('[data-type]').forEach((el) => el.onclick = () => { addIndicator({ type: el.dataset.type, params: { ...IND.DEFS[el.dataset.type].params } }); closeMenus(); });
  menu.querySelectorAll('[data-script]').forEach((el) => el.onclick = (e) => {
    if (e.target.dataset.edit) { closeMenus(); return openScriptEditor(+e.target.dataset.edit); }
    addIndicator({ type: 'custom', scriptId: +el.dataset.script }); closeMenus();
  });
  menu.querySelector('[data-new]').onclick = () => { closeMenus(); openScriptEditor(null); };
}
function closeMenus() { $('ind-menu').classList.add('hidden'); $('an-menu').classList.add('hidden'); }
$('ind-btn').onclick = (e) => { e.stopPropagation(); openIndicatorMenu(); };
document.addEventListener('click', (e) => { if (!e.target.closest('.dropdown')) closeMenus(); });

// ---------------------------------------------------------------- script editor
let editingScript = null;
function openScriptEditor(id) {
  editingScript = id != null ? S.scripts.find((s) => s.id === id) : null;
  $('sc-name').value = editingScript ? editingScript.name : 'My Indicator';
  $('sc-code').value = editingScript ? editingScript.code : CUSTOM.TEMPLATE;
  $('sc-delete').classList.toggle('hidden', !editingScript);
  $('sc-msg').textContent = 'ทดสอบกับข้อมูลกราฟที่เปิดอยู่ได้ด้วยปุ่ม "ทดสอบ"';
  $('modal-script').classList.remove('hidden');
  $('sc-code').focus();
}
$('sc-example').innerHTML += Object.keys(CUSTOM.EXAMPLES).map((k) => `<option>${esc(k)}</option>`).join('');
$('sc-example').onchange = () => { const k = $('sc-example').value; if (!k) return; $('sc-code').value = CUSTOM.EXAMPLES[k]; $('sc-name').value = k; $('sc-example').value = ''; };
$('sc-code').addEventListener('keydown', (e) => {
  if (e.key === 'Tab') { e.preventDefault(); const t = e.target, s = t.selectionStart; t.setRangeText('  ', s, t.selectionEnd, 'end'); }
});
function testScript() {
  if (!S.candles.length) { $('sc-msg').textContent = 'ยังไม่มีข้อมูลกราฟให้ทดสอบ'; return true; }
  const out = CUSTOM.run($('sc-code').value, S.candles, {});
  if (out.error) { $('sc-msg').innerHTML = `<span class="down">❌ ${esc(out.error)}</span>`; return false; }
  $('sc-msg').innerHTML = `<span class="up">✅ ผ่าน</span> — ${out.plots.length} plot, ${out.markers.length} marker, inputs: ${esc(JSON.stringify(out.inputs))}`;
  return true;
}
function saveScript() {
  const name = $('sc-name').value.trim() || 'My Indicator', code = $('sc-code').value;
  if (editingScript) { editingScript.name = name; editingScript.code = code; }
  else { editingScript = { id: Date.now(), name, code }; S.scripts.push(editingScript); }
  store.set('scripts', S.scripts); vcg.log('info', `บันทึกสคริปต์ "${name}"`, null, 'script');
  if (S.inds.some((i) => i.scriptId === editingScript.id)) buildIndicators();
}
$('sc-test').onclick = testScript;
$('sc-save').onclick = () => { if (testScript()) { saveScript(); $('sc-msg').innerHTML += ' · บันทึกแล้ว'; } };
$('sc-add').onclick = () => {
  if (!testScript()) return;
  saveScript();
  if (!S.inds.some((i) => i.scriptId === editingScript.id)) addIndicator({ type: 'custom', scriptId: editingScript.id });
  $('modal-script').classList.add('hidden');
};
$('sc-delete').onclick = () => {
  if (!editingScript) return;
  S.scripts = S.scripts.filter((s) => s !== editingScript);
  S.inds = S.inds.filter((i) => i.scriptId !== editingScript.id);
  store.set('scripts', S.scripts); store.set('inds', S.inds); buildIndicators();
  $('modal-script').classList.add('hidden');
};
document.querySelectorAll('[data-close]').forEach((b) => (b.onclick = () => b.closest('.modal').classList.add('hidden')));

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
  const head = `<div class="panel-h bn-h"><span>🎯 หาจุดเด้ง · ${S.symbol} ${tf().label}</span>
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
      <div class="bn-status ${stCls}">${z.status === 'wait' ? (buy ? '⏳ รอราคาย่อลงมาที่โซน' : '⏳ รอราคาเด้งขึ้นมาที่โซน') : (z.status === 'in' ? '👀 ' : '✅ ') + stTxt}${z.pattern && z.status !== 'wait' ? ` · ${AN.PAT[z.pattern].name}` : ''}</div>
      <div class="lv">
        <span>Entry</span><b>${fmt(z.entry)}</b><span>${buy ? 'Buy' : 'Sell'} Limit ขอบโซน</span>
        <span class="down">SL</span><b>${fmt(z.sl)}</b><span>${buy ? 'ใต้' : 'เหนือ'}โซน · 1R = ${fmt(Math.abs(z.entry - z.sl))}</span>
        <span class="up">TP1</span><b>${fmt(z.tp1)}</b><span>${z.rr1.toFixed(1)}R ${z.rr1 < 1 ? '⚠️ ต่ำกว่า 1R' : 'Swing ถัดไป'}</span>
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
    liqHtml() + `<p class="muted bn-note">วิธีใช้: ตั้ง Limit ที่ Entry หรือรอให้สถานะเป็น ✅ (แท่งเทียนกลับตัวในโซน) แล้วค่อยเข้า · ★ มาก = เหตุผลซ้อนกันมาก + ตามเทรนด์ · ไม่ใช่คำแนะนำการลงทุน</p>`;
  if (html !== box._html) { box._html = html; box.innerHTML = html; bindBounce(box); } // unchanged → keep DOM (buttons/clicks stay stable)
  for (const sd of ['buy', 'sell']) B[sd].forEach((z, k) => { const d = box.querySelector(`[data-bd="${sd}${k}"]`); if (d) d.textContent = z.status === 'wait' ? `ห่าง ${fmt(Math.abs(z.dist))} (${Math.abs(z.distAtr).toFixed(1)} ATR)` : ''; });
}
function liqHtml() {
  const L = S.B && S.B.liq; if (!L) return '';
  const row = (p) => `<tr><td>${p.side === 'high' ? '<span class="down">▲</span>' : '<span class="up">▼</span>'} <b>${fmt(p.price)}</b></td><td>${BOUNCE.poolName(p, false)}</td><td>${'$'.repeat(Math.min(3, p.strength))}</td></tr>`;
  const ups = L.highs.slice(0, 3).reverse(), dns = L.lows.slice(0, 3);
  const sw = L.sweeps.slice(0, 3).map((x) => `<li>🧹 กวาด SL ${x.side === 'low' ? 'ใต้' : 'เหนือ'} ${fmt(x.price)} แล้วปิดกลับ · ${S.B && S.A ? S.A.n - 1 - x.j : '?'} แท่งก่อน → ${x.side === 'low' ? '<span class="up">มักเด้งขึ้น</span>' : '<span class="down">มักร่วงลง</span>'}</li>`).join('');
  return `<div class="panel-h bn-h" style="margin-top:12px"><span>💰 จุดที่มีเงิน (SL เม่ากองอยู่)</span>
      <label class="chk"><input type="checkbox" id="lq-show" ${S.an.liquidity ? 'checked' : ''}> บนกราฟ</label></div>
    <table class="stat lq"><tbody>${ups.map(row).join('')}<tr class="lq-now"><td colspan="3">— ราคาปัจจุบัน —</td></tr>${dns.map(row).join('')}</tbody></table>
    ${sw ? `<ul class="bn-why">${sw}</ul>` : ''}
    <p class="muted bn-note">▲ เหนือ Swing High / Equal Highs = SL ของคนที่ Sell กองอยู่ · ▼ ใต้ Swing Low / Equal Lows = SL ของคนที่ Buy · ยิ่ง $ มาก (ยอดเท่ากันหลายจุด, PDH/PDL) ยิ่งมีเงินเยอะ ราคามักวิ่งไปกวาดก่อนกลับตัว — อย่าวาง SL ตรงนั้นพอดี และใช้เป็นเป้า TP ได้</p>`;
}
function bindBounce(box) {
  const sw = $('bn-show'); if (sw) sw.onchange = () => { S.an.bounce = sw.checked; store.set('an', S.an); dirty = true; };
  const lq = $('lq-show'); if (lq) lq.onchange = () => { S.an.liquidity = lq.checked; store.set('an', S.an); dirty = true; };
  box.querySelectorAll('[data-bs]').forEach((b) => (b.onclick = () => { S.an.bounceSide = b.dataset.bs; store.set('an', S.an); renderBounce(); dirty = true; }));
  box.querySelectorAll('[data-bz]').forEach((b) => (b.onclick = () => {
    const sd = b.dataset.sd, z = S.B && S.B[sd] && S.B[sd][+b.dataset.k]; if (!z) return;
    if (b.dataset.bz === 'layer' || b.dataset.bz === 'pyr') {
      const lay = b.dataset.bz === 'layer', h = Math.abs(z.hi - z.lo), risk = Math.abs(z.entry - z.sl);
      Object.assign(S.plan, { side: sd, entry: fmt(z.entry), sl: fmt(z.sl), tp1: fmt(z.tp1), tp2: fmt(z.tp2), adds: '2', mode: lay ? 'avg' : 'pyramid',
        spacing: fmt(lay ? Math.max(h / 2, risk * 0.25) : risk), weight: 'equal', trail: lay ? (S.plan.trail || 'none') : 'prev' });
      savePlan(); renderPlanner(); dirty = true; document.querySelector('#tabs [data-tab="calc"]').click();
      toast(lay ? 'แบ่ง 3 ไม้ในโซน: ความเสี่ยงรวมทุกไม้ = ที่ตั้งไว้ (ไม่ใช่ไม้ละเท่านั้น)' : 'Pyramid: เข้าต่อทุก 1R ที่ราคาไปทางเรา และเลื่อน SL ไปที่ไม้ก่อนหน้า', 'ok');
      return;
    }
    if (b.dataset.bz === 'calc') {
      Object.assign(S.plan, { side: sd, entry: fmt(z.entry), sl: fmt(z.sl), tp1: fmt(z.tp1), tp2: fmt(z.tp2) });
      savePlan(); renderPlanner(); dirty = true; document.querySelector('#tabs [data-tab="calc"]').click();
    } else if (typeof SIM !== 'undefined') SIM.prefill({ side: sd === 'buy' ? 1 : -1, type: 'limit', price: fmt(z.entry), sl: fmt(z.sl), tp: fmt(z.tp1), tag: 'range' });
  }));
}
function drawBounce(W) {
  const both = bnSides().length === 2;
  for (const sd of bnSides()) {
    const zs = both ? S.B[sd].slice(0, 2) : S.B[sd], col = sd === 'buy' ? UP : DOWN;
    zs.forEach((z, k) => {
      const yt = yOf(Math.max(z.lo, z.hi)), yb = yOf(Math.min(z.lo, z.hi)); if (yt == null || yb == null) return;
      const x0 = Math.max(0, xIdx(z.born) ?? 0);
      el('rect', { x: x0, y: yt, width: Math.max(0, W - x0), height: Math.max(3, yb - yt), fill: col + (k === 0 ? '30' : '1c'), stroke: col + (k === 0 ? 'cc' : '66'), 'stroke-width': k === 0 ? 1.5 : 1 });
      txt(W - 8, (sd === 'buy' ? yb + 12 : yt - 4), `${sd === 'buy' ? 'จุดเด้ง Buy' : 'จุดเด้ง Sell'} ${'★'.repeat(z.stars)} ${z.types.map((t) => BOUNCE.TYPE[t].short).join('+')}`, col, 'end', 10, k === 0 ? 700 : 400);
      if (k === 0) {
        const ys = yOf(z.sl), ytp = yOf(z.tp1), lx = x0 + 4;
        if (ys != null) { el('line', { x1: x0, y1: ys, x2: W, y2: ys, stroke: col, 'stroke-dasharray': '2 3', opacity: 0.8 }); txt(lx, ys + (sd === 'buy' ? 12 : -4), `SL ${sd === 'buy' ? 'Buy' : 'Sell'} ${fmt(z.sl)}`, col, 'start', 10); }
        if (ytp != null && !both) { el('line', { x1: x0, y1: ytp, x2: W, y2: ytp, stroke: col, 'stroke-dasharray': '6 3' }); txt(lx, ytp + (sd === 'buy' ? -4 : 12), `TP ${fmt(z.tp1)} (${z.rr1.toFixed(1)}R)`, col, 'start', 10); }
      }
    });
  }
}
function drawLiquidity(W) {
  const L = S.B.liq, AMB = '#f6c343';
  const used = [];
  for (const p of [...L.highs.slice(0, 4), ...L.lows.slice(0, 4)]) {
    const y = yOf(p.price); if (y == null) continue;
    const x0 = Math.max(0, xIdx(p.first) ?? 0);
    el('line', { x1: x0, y1: y, x2: W, y2: y, stroke: AMB, 'stroke-width': p.strength >= 2 ? 1.5 : 1, 'stroke-dasharray': '6 4', opacity: p.strength >= 2 ? 0.95 : 0.6 });
    const ly = p.side === 'high' ? y - 4 : y + 12; if (used.some((u) => Math.abs(u - ly) < 12)) continue; used.push(ly);
    txt(W - 8, ly, `${'$'.repeat(Math.min(3, p.strength))} SL ${p.side === 'high' ? 'Sell' : 'Buy'} · ${BOUNCE.poolName(p, false)}`, AMB, 'end', 10, p.strength >= 2 ? 700 : 400);
  }
  for (const x of L.sweeps) {
    const xx = xIdx(x.j), y = yOf(x.price); if (xx == null || y == null) continue;
    el('line', { x1: xx - 14, y1: y, x2: xx + 14, y2: y, stroke: AMB, 'stroke-width': 2 });
    txt(xx, x.side === 'low' ? y + 22 : y - 12, '🧹 กวาด', AMB, 'middle', 10, 700);
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
  const { a, b } = L, x0 = Math.max(0, xIdx(a.i) ?? 0), at = (k) => b.price - (b.price - a.price) * k, ext = (k) => a.price + (b.price - a.price) * k;
  const xa = xIdx(a.i), xb = xIdx(b.i), ya = yOf(a.price), yb = yOf(b.price);
  if (xa != null && xb != null && ya != null && yb != null) el('line', { x1: xa, y1: ya, x2: xb, y2: yb, stroke: '#b2b5be', 'stroke-dasharray': '4 4' });
  const line = (price, k, text, strong) => { const y = yOf(price); if (y == null) return; const c = fibColor(k);
    el('line', { x1: x0, y1: y, x2: W, y2: y, stroke: c, 'stroke-width': strong ? 1.5 : 1, opacity: strong ? 1 : 0.75, 'stroke-dasharray': strong ? '' : '5 4' });
    txt(x0 + 4, y - 3, `${text} ${fmt(price)}`, c, 'start', 10, strong ? 700 : 400); };
  const g1 = yOf(at(0.618)), g2 = yOf(at(0.786));
  if (g1 != null && g2 != null) el('rect', { x: x0, y: Math.min(g1, g2), width: W - x0, height: Math.abs(g2 - g1), fill: '#08998118' });
  for (const k of [0.382, 0.5, 0.618, 0.786]) line(at(k), k, `Fibo ${(k * 100).toFixed(1)}%`, k === 0.618);
  for (const k of [1.272, 1.618, 2.618]) line(ext(k), k, `เป้า ${(k * 100).toFixed(1)}%${k >= 1.618 ? ' 🎯' : ''}`, k === 1.618 || k === 2.618);
}
let bounceTimer = 0;
function bounceTick() { // re-evaluate status as the live price moves (throttled)
  if (!S.A || bounceTimer) return;
  bounceTimer = setTimeout(() => { bounceTimer = 0; if (S.A) { runBounce(); dirty = true; } }, 1500);
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
    desktopNotify(title, body); beep(); toast(title + ' · ' + body, 'ok', 8000);
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
  desktopNotify(`${side} ${S.symbol} ${tf().label}`, `Entry ${fmt(s.entry)} · SL ${fmt(s.sl)} · TP2 ${fmt(s.tp2)}`);
  beep();
  vcg.log('info', `สัญญาณใหม่ ${side} ${S.symbol} ${tf().label} @ ${fmt(s.entry)}`, null, 'signal');
  vcg.notify('signal', sigPayload(s), text);
}

// ---------------------------------------------------------------- data loading
let loadTimeout = null;
function loadChart() {
  S.candles = []; S.pendingHistory = true; S.loadingMore = false; S.noMore = false; S.A = null;
  if (main) main.setData([]);
  updateIndicators(); renderAnalysis();
  $('loading').textContent = 'กำลังโหลดกราฟ…'; $('loading').classList.remove('hidden');
  (S.source === 'demo' ? DEMO.requestChart : vcg.requestChart)({ symbol: S.symbol, candleType: tf().type, to: new Date().toISOString(), inclusive: true, limit: Math.max(200, Math.min(5000, +S.prefs.historyBars || 1500)) });
  if (typeof CACHE !== 'undefined') CACHE.restore();
  clearTimeout(loadTimeout);
  loadTimeout = setTimeout(() => { if (S.pendingHistory) { $('loading').textContent = 'ยังไม่ได้ข้อมูลกราฟ — ตรวจสอบว่า login แล้ว (เปิด WebTrader) หรือกด "เชื่อมต่อใหม่" · ดูรายละเอียดในแท็บ Log'; vcg.log('warn', `ยังไม่ได้แท่งเทียน ${S.symbol} ${tf().label} หลัง 12 วินาที`, null, 'chart'); } }, 12000);
}
function loadMore() {
  if (S.replay) return;
  if (S.loadingMore || S.noMore || S.pendingHistory || !S.candles.length) return;
  S.loadingMore = true;
  const to = new Date((S.candles[0].time - TZ) * 1000 - 1000).toISOString();
  (S.source === 'demo' ? DEMO.requestChart : vcg.requestChart)({ symbol: S.symbol, candleType: tf().type, to, inclusive: false, limit: 1000 });
  setTimeout(() => { S.loadingMore = false; }, 8000);
}
const num = (v) => (v == null ? null : typeof v === 'object' ? ('value' in v ? Number(v.value) / 10 ** (v.scale || 0) : null) : Number(v));
const toCandle = (c) => ({ time: Number(c.timeSeconds ?? c.time) + TZ, open: num(c.open), high: num(c.high), low: num(c.low), close: num(c.close) });
const valid = (c) => isFinite(c.time) && c.open > 0 && c.high > 0 && c.low > 0 && c.close > 0;
function dedupe(arr) { const out = []; for (const c of arr) { if (out.length && out[out.length - 1].time === c.time) out[out.length - 1] = c; else out.push(c); } return out; }

function setAllData() {
  if (!main) return;
  main.setData(displayData());
  updateIndicators();
  runAnalysis();
  renderLegend();
  pushChartData();
}
let pushChartTimer = null;
function pushChartData() {
  clearTimeout(pushChartTimer);
  pushChartTimer = setTimeout(() => (typeof CACHE !== 'undefined' && CACHE.save(), vcg.pushChart({ symbol: S.symbol, timeframe: tf().label,
    candles: S.candles.map((c) => ({ time: c.time - TZ, open: c.open, high: c.high, low: c.low, close: c.close })) })), 500);
}

function onChartMsg(m) {
  if (m.type === 'chartAuthRenew') { if (S.pendingHistory) $('loading').textContent = 'token หมดอายุ — กำลังขอ token ใหม่และโหลดซ้ำ…'; else toast('ต่อ token ใหม่ให้กราฟแล้ว (token ของ VCG มีอายุ 15 นาที)', 'info'); return; }
  if (m.type === 'chartError') {
    const msg = (m.data && m.data.message) || JSON.stringify(m.data).slice(0, 200);
    if (S.candles.length && !S.pendingHistory) toast('กราฟ: ' + msg, 'warn');
    else { $('loading').textContent = 'โหลดกราฟไม่สำเร็จ: ' + msg + ' — กำลังลองใหม่'; $('loading').classList.remove('hidden'); }
    return;
  }
  if (m.type !== 'chart' || !m.data) return;
  const d = m.data;
  const sym = d.symbol || (d.history && d.history.symbol);
  if (sym && sym !== S.symbol) return;
  if (d.history && d.history.candles) {
    const arr = d.history.candles.map(toCandle).filter(valid).sort((a, b) => a.time - b.time);
    if (S.pendingHistory) {
      const q = S.quotes[S.symbol], lastC = arr[arr.length - 1];
      if (q && lastC && Math.abs(lastC.close - q.bid) / q.bid > 0.25) { vcg.log('warn', `ข้ามข้อมูลกราฟที่ไม่ตรงกับ ${S.symbol} (ราคา ${lastC.close} vs ${q.bid}) — น่าจะเป็นของ symbol ก่อนหน้า`, null, 'chart'); return; }
      S.pendingHistory = false; $('loading').classList.add('hidden');
      S.candles = dedupe(arr);
      vcg.log('info', `ได้แท่งเทียน ${S.symbol} ${tf().label} ${S.candles.length} แท่ง`, null, 'chart');
      setAllData();
      if (S.candles.length > 150) chart.timeScale().setVisibleLogicalRange({ from: S.candles.length - 150, to: S.candles.length + 10 });
      else chart.timeScale().fitContent();
      if (typeof onChartLoaded === 'function') onChartLoaded();
    } else if (S.loadingMore) {
      S.loadingMore = false;
      const older = arr.filter((c) => c.time < S.candles[0].time);
      if (!older.length) { S.noMore = true; return; }
      const r = chart.timeScale().getVisibleLogicalRange();
      S.candles = older.concat(S.candles);
      if (S.candles.length > 20000) { S.noMore = true; }
      setAllData();
      if (r) chart.timeScale().setVisibleLogicalRange({ from: r.from + older.length, to: r.to + older.length });
    }
  }
  if (d.updates && d.updates.candles && !S.pendingHistory) d.updates.candles.map(toCandle).filter(valid).forEach(upsert);
}
vcg.onChart((m) => { if (S.source === 'demo') return; if (m.slot === 'mtf') { if (typeof MTF !== 'undefined') MTF.onMsg(m); } else onChartMsg(m); });

function upsert(c) {
  if (S.replay) return;
  const cs = S.candles; if (!cs.length) return;
  const last = cs[cs.length - 1];
  if (c.time < last.time) { const i = cs.findIndex((x) => x.time === c.time); if (i >= 0) { cs[i] = c; setAllData(); } return; }
  const isNew = c.time > last.time;
  if (isNew) cs.push(c); else cs[cs.length - 1] = c;
  pushLast(isNew);
}
function pushLast(isNew) {
  const cs = S.candles; const last = cs[cs.length - 1];
  if (!main || !last) return;
  if (S.ctype === 'ha') main.setData(displayData());
  else main.update(S.ctype === 'line' || S.ctype === 'area' ? { time: last.time, value: last.close } : last);
  if (isNew) { updateIndicators(); runAnalysis(); pushChartData(); } // a candle just closed
  else updateIndicators(true);
  dirty = true;
}
function tickToCandle(q) {
  if (S.replay) return;   // chart is frozen during Bar Replay
  const cs = S.candles; if (!cs.length || q.bid == null) return;
  const t = Math.floor(Date.parse(q.time) / 1000) + TZ;
  const last = cs[cs.length - 1]; const sec = tf().sec;
  if (sec <= 14400 && t >= last.time + sec) {
    const start = Math.floor((t - TZ) / sec) * sec + TZ;
    cs.push({ time: start, open: q.bid, high: q.bid, low: q.bid, close: q.bid });
    pushLast(true);
  } else {
    last.close = q.bid; last.high = Math.max(last.high, q.bid); last.low = Math.min(last.low, q.bid);
    pushLast(false);
  }
}
chart.timeScale().subscribeVisibleLogicalRangeChange((r) => { dirty = true; if (r && r.from < 15) loadMore(); });

// ---------------------------------------------------------------- quotes / watchlist
function onQuotesMsg(list) {
  let cur = null;
  for (const q of list) {
    const prev = S.quotes[q.symbol];
    S.quotes[q.symbol] = q;
    if (S.digits[q.symbol] !== q.digits) {
      S.digits[q.symbol] = q.digits;
      if (q.symbol === S.symbol && main) { main.applyOptions({ priceFormat: priceFormat() }); buildIndicators(); }
    }
    updateRow(q, prev);
    checkAlerts(q);
    if (q.symbol === S.symbol) cur = q;
  }
  if (cur) {
    tickToCandle(cur);
    if (askLine && cur.ask != null) askLine.applyOptions({ price: cur.ask });
    else if (S.showAsk && !askLine) refreshPriceLines();
    updateHeader();
    bounceTick();
  }
}
vcg.onQuotes((list) => { if (S.source !== 'demo') onQuotesMsg(list); });
function updateHeader() {
  const q = S.quotes[S.symbol];
  $('cur-sym').textContent = S.symbol;
  $('cur-bid').textContent = q ? fmt(q.bid) : '—';
  const c = $('cur-chg');
  if (q && q.changePct != null) { c.textContent = `${q.change >= 0 ? '+' : ''}${fmt(q.change)} (${q.changePct >= 0 ? '+' : ''}${q.changePct.toFixed(2)}%)`; c.className = q.change >= 0 ? 'up' : 'down'; }
  else c.textContent = '';
  document.title = q ? `${S.symbol} ${fmt(q.bid)} — Price Tracker` : 'Price Tracker';
}
function renderWatchlist() {
  const tb = document.querySelector('#wl tbody');
  tb.innerHTML = S.symbols.map((s) => `<tr data-s="${s}" class="${s === S.symbol ? 'sel' : ''}">
    <td><button class="star ${s === S.traySymbol ? 'on' : ''}" data-act="star" title="แสดงบนแถบเมนู">★</button>${s}</td>
    <td class="b">—</td><td class="a">—</td><td class="p">—</td>
    <td><button class="x" data-act="rm" title="ลบ">✕</button></td></tr>`).join('');
  S.symbols.forEach((s) => S.quotes[s] && updateRow(S.quotes[s]));
}
function updateRow(q, prev) {
  const tr = document.querySelector(`#wl tr[data-s="${q.symbol}"]`); if (!tr) return;
  const b = tr.querySelector('.b'), a = tr.querySelector('.a'), p = tr.querySelector('.p');
  b.textContent = fmt(q.bid, q.digits); a.textContent = fmt(q.ask, q.digits);
  p.textContent = q.changePct == null ? '—' : (q.changePct >= 0 ? '+' : '') + q.changePct.toFixed(2);
  p.className = 'p ' + (q.changePct >= 0 ? 'up' : 'down');
  if (prev && prev.bid !== q.bid && b.animate) {   // Web Animations: no forced re-layout per tick
    b.animate([{ backgroundColor: q.bid > prev.bid ? 'rgba(38,166,154,.45)' : 'rgba(239,83,80,.45)' }, { backgroundColor: 'transparent' }], { duration: 600 });
  }
}
document.querySelector('#wl tbody').addEventListener('click', (e) => {
  const tr = e.target.closest('tr'); if (!tr) return;
  const s = tr.dataset.s, act = e.target.dataset.act;
  if (act === 'rm') return vcg.removeSymbol(s);
  if (act === 'star') return vcg.setTray(s);
  switchSymbol(s);
});
$('add-form').onsubmit = (e) => {
  e.preventDefault();
  const s = $('add-input').value.trim().toUpperCase(); if (!s) return;
  vcg.addSymbol(s); $('add-input').value = ''; switchSymbol(s);
};
function switchSymbol(s) {
  if (s === S.symbol) return;
  if (S.replay && typeof REPLAY !== 'undefined') REPLAY.exit();
  S.symbol = s; store.set('symbol', s);
  drawings = loadDrawings(); S.selected = null; S.pending = null; S.measure = null;
  if (main) main.applyOptions({ priceFormat: priceFormat() });
  refreshPriceLines(); buildIndicators(); renderWatchlist(); renderAlerts(); updateHeader();
  if (typeof NEWS !== 'undefined') NEWS.render();
  if (S.source === 'demo' && typeof DEMO !== 'undefined') DEMO.connect();
  loadChart();
}

// ---------------------------------------------------------------- status
let lastConnected = null;
vcg.onStatus((st) => {
  const symChanged = JSON.stringify(st.symbols) !== JSON.stringify(S.symbols) || st.traySymbol !== S.traySymbol;
  S.symbols = st.symbols; S.traySymbol = st.traySymbol;
  if (symChanged) renderWatchlist();
  const inv = (st.invalid || []).join(',');
  if (inv !== S.invalidKey) {
    S.invalidKey = inv;
    document.querySelectorAll('#wl tr').forEach((tr) => { const bad = (st.invalid || []).includes(tr.dataset.s); tr.classList.toggle('invalid', bad); tr.title = bad ? 'ไม่พบ symbol นี้ใน VCG — ลองชื่ออื่น เช่น BTCUSD.x / BTCUSDT' : ''; });
    if (inv) toast(`ไม่พบใน VCG: ${inv} — ตรวจชื่อ symbol`, 'warn', 8000);
  }
  $('csv').checked = st.csv;
  if (S.source === 'mt5') {
    const m = st.mt5 || {};
    $('conn').classList.toggle('ok', !!m.connected);
    $('conn-text').textContent = m.connected ? `MT5: ${m.broker || 'เชื่อมต่อแล้ว'}` : `MT5: รอ EA (พอร์ต ${m.port || 7788})`;
    if (m.connected && S.mt5WasDown && S.pendingHistory) loadChart();
    // brokers often add a suffix (XAUUSD.m, XAUUSDm…) — switch to the name this MT5 actually has
    if (m.connected && (m.symbols || []).length && !m.symbols.includes(S.symbol)) {
      const base = S.symbol.replace(/[^A-Z]/g, '').slice(0, 6);
      const alt = m.symbols.find((x) => x.toUpperCase().replace(/[^A-Z]/g, '').startsWith(base));
      if (alt && alt !== S.symbol) { toast(`MT5 ใช้ชื่อ ${alt} แทน ${S.symbol}`, 'info', 8000); vcg.addSymbol(alt); switchSymbol(alt); }
    }
    S.mt5WasDown = !m.connected;
  }
  if (S.source === 'vcg') $('conn').classList.toggle('ok', st.connected);
  if (S.source === 'vcg') $('conn-text').textContent = st.connected ? 'เชื่อมต่อแล้ว' : st.loggedIn ? 'กำลังเชื่อมต่อ…' : 'ยังไม่ได้ login — กด "เปิด WebTrader / Login"';
  $('api-info').innerHTML = st.api && st.api.enabled ? `API: <b>http://127.0.0.1:${st.api.port}</b>${st.api.lan ? ' (เปิดให้วง LAN)' : ''}` : 'API: ปิดอยู่';
  if (st.connected && lastConnected === false && S.pendingHistory) loadChart();
  lastConnected = st.connected;
});
$('csv').onchange = () => vcg.toggleCsv();
$('open-csv').onclick = () => vcg.openCsv();
$('show-trader').onclick = () => vcg.showTrader();
$('reload-trader').onclick = () => { vcg.reloadTrader(); setTimeout(loadChart, 8000); };

// ---------------------------------------------------------------- alerts
function renderAlerts() {
  const ul = $('alerts');
  const list = S.alerts.filter((a) => a.symbol === S.symbol);
  ul.innerHTML = list.length ? list.map((a) => `<li class="${a.fired ? 'fired' : ''}"><span>${a.symbol} ${a.dir === 'up' ? '≥' : '≤'} ${fmt(a.price)}</span><button data-id="${a.id}">✕</button></li>`).join('')
    : '<li class="muted" style="border:none">ยังไม่มีการแจ้งเตือนของ ' + S.symbol + '</li>';
}
function addAlert(price) {
  const q = S.quotes[S.symbol]; if (!isFinite(price)) return;
  const cur = q ? q.bid : (S.candles.slice(-1)[0] || {}).close;
  S.alerts.push({ id: Date.now(), symbol: S.symbol, price, dir: cur != null && price < cur ? 'down' : 'up', fired: false });
  store.set('alerts', S.alerts); renderAlerts(); refreshPriceLines();
  vcg.log('info', `ตั้ง alert ${S.symbol} @ ${price}`, null, 'alert');
}
$('alerts').onclick = (e) => {
  const id = +e.target.dataset.id; if (!id) return;
  S.alerts = S.alerts.filter((a) => a.id !== id); store.set('alerts', S.alerts); renderAlerts(); refreshPriceLines();
};
$('alert-form').onsubmit = (e) => { e.preventDefault(); addAlert(parseFloat($('alert-input').value)); $('alert-input').value = ''; };
function desktopNotify(title, body) { if (S.prefs.desktop) try { new Notification(title, { body }); } catch (_) {} }
function beep() {
  if (!S.prefs.sound) return;
  try { const ac = new AudioContext(); [0, 0.25].forEach((t) => { const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.value = 880; o.connect(g); g.connect(ac.destination); g.gain.setValueAtTime(0.2, ac.currentTime + t);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + t + 0.2); o.start(ac.currentTime + t); o.stop(ac.currentTime + t + 0.2); }); } catch (_) {}
}
function checkAlerts(q) {
  let changed = false;
  for (const a of S.alerts) {
    if (a.fired || a.symbol !== q.symbol || q.bid == null) continue;
    if ((a.dir === 'up' && q.bid >= a.price) || (a.dir === 'down' && q.bid <= a.price)) {
      a.fired = true; changed = true;
      const title = `🔔 ${a.symbol} ${a.dir === 'up' ? 'ขึ้นถึง' : 'ลงถึง'} ${fmt(a.price, q.digits)}`;
      const body = `ราคาตอนนี้ Bid ${fmt(q.bid, q.digits)} / Ask ${fmt(q.ask, q.digits)}`;
      desktopNotify(title, body); beep();
      vcg.log('info', title, null, 'alert');
      vcg.notify('alert', { symbol: a.symbol, price: a.price, direction: a.dir, bid: q.bid, ask: q.ask, time: q.time }, `${title}\n${body}`);
    }
  }
  if (changed) { store.set('alerts', S.alerts); renderAlerts(); refreshPriceLines(); }
}

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
  el('line', { x1, y1: ye, x2, y2: ye, stroke: '#d6d9e0', 'stroke-width': 1.5 });
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
      el('polyline', { points: pts, fill: 'none', stroke: '#b2b5be', 'stroke-width': 1.2, 'stroke-opacity': 0.75 });
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

// ---------------------------------------------------------------- tabs, lessons, logs
document.querySelectorAll('#tabs button[data-tab]').forEach((b) => (b.onclick = () => {
  document.querySelectorAll('#tabs button[data-tab]').forEach((x) => x.classList.toggle('active', x === b));
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('hidden', t.id !== 'tab-' + b.dataset.tab));
  if (b.dataset.tab === 'log') { errCount = 0; $('log-badge').textContent = ''; renderLogs(); }
}));
$('lessons').innerHTML = LESSONS.map((l, i) => `<details ${i === 0 ? 'open' : ''}><summary>${l.t}</summary>${l.b}</details>`).join('');

const logs = []; let errCount = 0, logRenderTimer = null;
vcg.onLogs((list) => {
  logs.push(...list); if (logs.length > 3000) logs.splice(0, logs.length - 3000);
  const logTabOpen = !$('tab-log').classList.contains('hidden');
  if (!logTabOpen) { errCount += list.filter((e) => e.level === 'error').length; $('log-badge').textContent = errCount || ''; }
  else if (!logRenderTimer) logRenderTimer = setTimeout(() => { logRenderTimer = null; renderLogs(); }, 1000);
});
const LV = { debug: 0, info: 1, warn: 2, error: 3 };
function renderLogs() {
  const lv = $('log-level').value, q = $('log-search').value.toLowerCase();
  const min = lv === 'error' ? 3 : lv === 'warn' ? 2 : lv === 'info' ? 1 : 0;
  const rows = logs.filter((e) => LV[e.level] >= min && (!q || (e.msg + ' ' + (e.data || '') + ' ' + e.source).toLowerCase().includes(q))).slice(-250).reverse();
  $('log-list').innerHTML = rows.map((e) => `<div class="le ${e.level}"><span class="t">${new Date(e.t).toLocaleTimeString()}</span> <span class="s">${esc(e.source)}</span> ${esc(e.msg)}${e.data ? ' <span class="t">' + esc(e.data) + '</span>' : ''}</div>`).join('') || '<p class="muted" style="padding:8px">ไม่มี log</p>';
}
$('log-level').onchange = renderLogs; $('log-search').oninput = renderLogs;
$('log-file').onclick = () => vcg.openLogFile();
$('log-folder').onclick = () => vcg.openLogFolder();
$('log-copy').onclick = () => navigator.clipboard.writeText(logs.map((e) => `${e.t} [${e.level}] ${e.source}: ${e.msg}${e.data ? ' ' + e.data : ''}`).join('\n'));

// ---------------------------------------------------------------- toolbar
function renderTfs() {
  $('tfs').innerHTML = TFS.map((t) => `<button data-t="${t.type}" class="${t.type === S.tf ? 'active' : ''}">${t.label}</button>`).join('');
  $('tfs').querySelectorAll('button').forEach((b) => (b.onclick = () => { if (S.replay && typeof REPLAY !== 'undefined') REPLAY.exit(); S.tf = +b.dataset.t; store.set('tf', S.tf); renderTfs(); loadChart(); }));
}
$('ctype').value = S.ctype;
$('ctype').onchange = () => { S.ctype = $('ctype').value; store.set('ctype', S.ctype); buildMain(); buildIndicators(); };
$('show-ask').checked = S.showAsk;
$('show-ask').onchange = () => { S.showAsk = $('show-ask').checked; store.set('showAsk', S.showAsk); refreshPriceLines(); };
$('magnet').checked = S.magnet;
$('magnet').onchange = () => { S.magnet = $('magnet').checked; store.set('magnet', S.magnet); };

// ---------------------------------------------------------------- init
renderTfs();
buildMain();
buildIndicators();
renderAlerts();
updateHeader();
renderAnalysis();
loadChart();
