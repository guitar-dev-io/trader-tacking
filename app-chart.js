// Price Tracker renderer · chart: main series, indicators, legend, custom-script editor
/* global LightweightCharts, IND, AN, BOUNCE, CUSTOM, LESSONS, ICON, vcg */
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
