// Chart core: the lightweight-charts chart, main series, built-in + custom-script indicators, legend and the
// script editor. lightweight-charts is a classic <script> (global LightweightCharts), so its objects are typed
// loosely here (Lw* aliases); the app's own data (indicators, scripts, points) is typed.
import { def } from '../pt';
import { view } from '../state';
import { CUSTOM, type CustomResult } from './custom';
import { IND, type IndicatorDef, type Point } from './indicators';
import { chartHooks } from './hooks';
import { ICON } from '../../icons.js';
import { $, AreaSeries, BarSeries, CandlestickSeries, CrosshairMode, DOWN, HistogramSeries, IND_COLORS, LineSeries, LineStyle, S, TC, THEME, UP, createChart, digits, esc, fmt, store, tf } from '../../app-core.js';
import type { Candle } from '../core/types';

declare const vcg: { log(level: string, msg: string, data?: unknown, src?: string): void };

/* lightweight-charts objects (library is untyped here) */
export type LwChart = any;
export type LwSeries = any;
export type LwPriceLine = any;

/** an indicator on the chart (stored in S.inds / store 'inds') */
export interface Ind { id: number; type: string; color?: string; params: Record<string, number>; scriptId?: number }
/** a user script (store 'scripts') */
export interface Script { id: number; name: string; code: string }
interface IndSeries { ind: Ind; key: string | number; series: LwSeries; hist: boolean; custom?: boolean; color?: string | null; last?: number | null; len?: number; firstT?: number; lastT?: number }

// Price Tracker renderer · chart: main series, indicators, legend, custom-script editor
// ---------------------------------------------------------------- chart
// colors of a lightweight-charts chart for the current theme (also used by the MTF chart)
export function chartThemeOptions(fontSize = 11) {
  const c = TC();
  return {
    layout: { background: { type: 'solid', color: c.bg }, textColor: c.text, fontSize, panes: { separatorColor: c.border, separatorHoverColor: '#2962ff55' } },
    grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
    crosshair: { vertLine: { color: c.cross, labelBackgroundColor: c.text === '#4a4f5c' ? '#4a4f5c' : '#2a2e39' }, horzLine: { color: c.cross, labelBackgroundColor: c.text === '#4a4f5c' ? '#4a4f5c' : '#2a2e39' } },
    rightPriceScale: { borderColor: c.border }, leftPriceScale: { borderColor: c.border },
    timeScale: { borderColor: c.border },
  };
}
export const chart: LwChart = createChart($('chart'), {
  autoSize: true,
  ...chartThemeOptions(11),
  crosshair: { ...chartThemeOptions(11).crosshair, mode: CrosshairMode.Normal },
  timeScale: { borderColor: TC().border, timeVisible: true, secondsVisible: false, rightOffset: 10 },
});
// re-apply theme colors to the chart(s) — called on theme change
export function applyChartTheme(): void {
  chart.applyOptions(chartThemeOptions(11));
  chartHooks.applyChartCfg?.();                                        // keep the user's grid on/off
  try { view.dirty = true; } catch (_) {}                              // redraw SVG overlays with the new colors
}
THEME.onChange(() => { applyChartTheme(); try { chartHooks.redraw?.(); } catch (_) {} });
export let main: LwSeries | null = null, askLine: LwPriceLine | null = null;
let hlineObjs: LwPriceLine[] = [], alertLines: LwPriceLine[] = [], indSeries: IndSeries[] = [];
export const customOut = new Map<number, CustomResult>(); // ind.id -> last run output

export function priceFormat() { const d = digits(); return { type: 'price', precision: d, minMove: 1 / 10 ** d }; }
export function displayData(): unknown[] {
  if (S.ctype === 'ha') return IND.heikinAshi(S.candles);
  if (S.ctype === 'line' || S.ctype === 'area') return S.candles.map((c: Candle) => ({ time: c.time, value: c.close }));
  return S.candles;
}
export function buildMain(): void {
  if (main) { chart.removeSeries(main); main = null; askLine = null; hlineObjs = []; alertLines = []; }
  const common = { priceFormat: priceFormat(), priceLineVisible: true, lastValueVisible: true };
  if (S.ctype === 'line') main = chart.addSeries(LineSeries, { ...common, color: '#2962ff', lineWidth: 2 }, 0);
  else if (S.ctype === 'area') main = chart.addSeries(AreaSeries, { ...common, lineColor: '#2962ff', topColor: '#2962ff55', bottomColor: '#2962ff05', lineWidth: 2 }, 0);
  else if (S.ctype === 'bars') main = chart.addSeries(BarSeries, { ...common, upColor: UP, downColor: DOWN, thinBars: false }, 0);
  else main = chart.addSeries(CandlestickSeries, { ...common, upColor: UP, downColor: DOWN, borderVisible: false, wickUpColor: UP, wickDownColor: DOWN }, 0);
  (main as LwSeries).setData(displayData());
  refreshPriceLines();
}
export function refreshPriceLines(): void {
  const m = main; if (!m) return;
  hlineObjs.forEach((l) => m.removePriceLine(l)); hlineObjs = [];
  alertLines.forEach((l) => m.removePriceLine(l)); alertLines = [];
  if (askLine) { m.removePriceLine(askLine); askLine = null; }
  S.alerts.filter((a: { symbol: string; fired?: boolean }) => a.symbol === S.symbol && !a.fired).forEach((a: { price: number }) => {
    alertLines.push(m.createPriceLine({ price: a.price, color: '#ff9800', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'Alert' }));
  });
  const q = S.quotes[S.symbol];
  if (S.showAsk && q && q.ask != null) askLine = m.createPriceLine({ price: q.ask, color: '#ef535099', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: 'Ask' });
}

// ---------------------------------------------------------------- indicators (built-in + custom scripts)
const scriptOf = (ind: Ind): Script | undefined => (S.scripts as Script[]).find((s) => s.id === ind.scriptId);
export function indName(ind: Ind): string {
  if (ind.type === 'custom') { const sc = scriptOf(ind); return (sc ? sc.name : '(ลบแล้ว)') + (Object.keys(ind.params || {}).length ? ' ' + Object.values(ind.params).join(', ') : ''); }
  const def = IND.DEFS[ind.type]; return `${def.name} ${Object.values(ind.params).join(', ')}`;
}
function runCustom(ind: Ind): CustomResult {
  const sc = scriptOf(ind);
  if (!sc) return { plots: [], hlines: [], markers: [], inputs: {}, error: 'ไม่พบสคริปต์' };
  const out = CUSTOM.run(sc.code, S.candles, ind.params || {});
  if (out.error && customOut.get(ind.id)?.error !== out.error) vcg.log('error', `indicator "${sc.name}": ${out.error}`, null, 'script');
  ind.params = { ...out.inputs } as Record<string, number>;
  customOut.set(ind.id, out);
  return out;
}
export function buildIndicators(): void {
  indSeries.forEach((x) => chart.removeSeries(x.series)); indSeries = [];
  for (let i = chart.panes().length - 1; i > 0; i--) if (chart.panes()[i].getSeries().length === 0) chart.removePane(i);
  let pane = 0;
  for (const ind of S.inds as Ind[]) {
    if (ind.type === 'custom') {
      const out = runCustom(ind);
      let sub: number | null = null;
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
    let first: LwSeries | null = null;
    for (const [key, col] of Object.entries(def.lines)) {
      const color = Object.keys(def.lines).length === 1 ? ind.color || col : col;
      const s = col === 'hist'
        ? chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false, priceFormat: { type: 'price', precision: 5, minMove: 0.00001 } }, p)
        : chart.addSeries(LineSeries, { color, lineWidth: key === 'mid' ? 1 : 2, priceLineVisible: false, lastValueVisible: def.pane === 'sub', crosshairMarkerVisible: false,
          priceFormat: def.pane === 'main' ? priceFormat() : { type: 'price', precision: 2, minMove: 0.01 } }, p);
      indSeries.push({ ind, key, series: s, hist: col === 'hist' });
      if (!first) first = s;
    }
    const f1 = first; if (def.levels && f1) def.levels.forEach((lv) => f1.createPriceLine({ price: lv, color: '#787b8666', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false }));
  }
  const subs = chart.panes().length - 1;
  chart.panes().forEach((pn: any, i: number) => pn.setStretchFactor(i === 0 ? Math.max(3, 5 - subs) : 1));
  updateIndicators();
  renderLegend();
}
const histColor = (data: Point[]) => data.map((d, i) => ({ ...d, color: d.value >= 0 ? (i && data[i - 1].value > d.value ? '#26a69a88' : UP) : (i && data[i - 1].value < d.value ? '#ef535088' : DOWN) }));
let indTimer: ReturnType<typeof setTimeout> | null = null, lastIndRun = 0;
export function updateIndicators(throttle?: boolean): void {
  if (throttle) { // live ticks: recompute at most once per second
    if (indTimer) return;
    indTimer = setTimeout(() => { indTimer = null; updateIndicators(); }, Math.max(0, 1000 - (Date.now() - lastIndRun)));
    return;
  }
  lastIndRun = Date.now();
  const cache = new Map<Ind, CustomResult | Record<string, Point[]>>();
  for (const x of indSeries) {
    if (x.custom) {
      if (!cache.has(x.ind)) {
        const out: CustomResult = S.candles.length ? runCustom(x.ind) : { plots: [], hlines: [], markers: [], inputs: {}, error: null };
        cache.set(x.ind, out);
      }
      const out = cache.get(x.ind) as CustomResult, pl = out.plots[x.key as number];
      if (!pl) continue;
      let data: Point[] = (S.candles as Candle[]).map((c, i) => { const v = pl.values[i]; return v == null || !isFinite(v) ? null : { time: c.time, value: v }; }).filter((p): p is Point => p != null);
      if (x.hist) data = histColor(data);
      setSeries(x, data);
      continue;
    }
    if (!cache.has(x.ind)) cache.set(x.ind, S.candles.length ? IND.DEFS[x.ind.type].calc(S.candles, x.ind.params) : {});
    let data: Point[] = (cache.get(x.ind) as Record<string, Point[]>)[x.key] || [];
    if (x.hist) data = histColor(data);
    setSeries(x, data);
  }
  view.dirty = true;
}
// Only the last point changes on a live tick → update() it instead of re-sending the whole series (smoother).
function setSeries(x: IndSeries, data: Point[]): void {
  const last = data[data.length - 1];
  x.last = last ? last.value : null;
  if (x.len === data.length && x.firstT === (data[0] && data[0].time) && last && x.lastT === last.time) { try { x.series.update(last); return; } catch (_) {} }
  x.series.setData(data);
  x.len = data.length; x.firstT = data[0] && data[0].time; x.lastT = last && last.time;
}

// ---------------------------------------------------------------- legend
let legendTimer: number | null = null;
export function renderLegend(param?: any): void {
  const el = $('legend');
  let bar: { open: number; high: number; low: number; close: number } | null = null;
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
  for (const ind of S.inds as Ind[]) {
    const isC = ind.type === 'custom', def = IND.DEFS[ind.type];
    if (!isC && !def) continue;
    const vals = indSeries.filter((x) => x.ind === ind).map((x) => {
      const d = param && param.seriesData ? param.seriesData.get(x.series) : null;
      const v = d ? d.value : x.last;
      const col = x.hist ? '#9aa0ad' : isC ? (x.color || TC().fg) : (Object.keys(def.lines).length === 1 ? ind.color : def.lines[x.key]);
      const isMain = isC ? (customOut.get(ind.id)?.plots[x.key as number]?.pane === 'main') : def.pane === 'main';
      return `<span style="color:${col}">${v == null ? '—' : isMain ? fmt(v) : v.toFixed(2)}</span>`;
    }).join(' ');
    const err = isC && customOut.get(ind.id)?.error ? `<span class="err" title="${esc(customOut.get(ind.id)?.error)}">${ICON.html('triangle-alert', 12)}error</span>` : '';
    html += `<div class="row"><span class="ind" data-id="${ind.id}"><b style="color:${ind.color || 'var(--text)'}">${esc(indName(ind))}</b> ${vals} ${err}
      ${isC ? '<button data-act="code" title="แก้โค้ด">{ }</button>' : ''}<button data-act="edit" title="ตั้งค่า" aria-label="ตั้งค่า">${ICON.svg('settings', 14)}</button><button data-act="del" title="ลบ" aria-label="ลบ">${ICON.svg('x', 14)}</button></span></div>`;
  }
  el.innerHTML = html;
}
chart.subscribeCrosshairMove((p: unknown) => { if (legendTimer) return; legendTimer = requestAnimationFrame(() => { legendTimer = null; renderLegend(p); }); });
$('legend').addEventListener('click', (e: MouseEvent) => {
  const b = (e.target as HTMLElement).closest('button'); if (!b) return;
  const id = +((b.closest('.ind') as HTMLElement).dataset.id as string);
  const ind = (S.inds as Ind[]).find((i) => i.id === id); if (!ind) return;
  if (b.dataset.act === 'del') { S.inds = (S.inds as Ind[]).filter((i) => i.id !== id); customOut.delete(id); store.set('inds', S.inds); buildIndicators(); }
  else if (b.dataset.act === 'code') openScriptEditor(ind.scriptId);
  else editIndicator(ind);
});

export function editIndicator(ind: Ind): void {
  closeMenus();
  const menu = $('ind-menu'); menu.classList.remove('hidden');
  const isC = ind.type === 'custom';
  const def = isC ? null : IND.DEFS[ind.type];
  const single = isC || Object.keys((def as IndicatorDef).lines).length === 1;
  menu.innerHTML = `<div class="group">${esc(isC ? indName(ind) : (def as IndicatorDef).name)}</div>` +
    Object.entries(ind.params || {}).map(([k, v]) => `<div class="item"><span>${esc(k)}</span><input data-k="${esc(k)}" type="number" step="any" value="${v}" style="width:80px"></div>`).join('') +
    (single && !isC ? `<div class="item"><span>สี</span><input data-color type="color" value="${ind.color || '#f5a623'}" style="width:80px;padding:0"></div>` : '') +
    `<div class="item" style="justify-content:flex-end;gap:6px"><button data-cancel>ยกเลิก</button><button data-ok class="primary">ตกลง</button></div>`;
  menu.querySelector('[data-cancel]').onclick = closeMenus;
  menu.querySelector('[data-ok]').onclick = () => {
    menu.querySelectorAll('input[data-k]').forEach((i: HTMLInputElement) => { const v = parseFloat(i.value); if (isFinite(v)) ind.params[i.dataset.k as string] = v; });
    const c = menu.querySelector('input[data-color]') as HTMLInputElement | null; if (c) ind.color = c.value;
    store.set('inds', S.inds); closeMenus(); buildIndicators();
  };
}
export function addIndicator(o: Partial<Ind> & { type: string }): void {
  const id = Math.max(0, ...(S.inds as Ind[]).map((i) => i.id)) + 1;
  S.inds.push({ id, color: IND_COLORS[S.inds.length % IND_COLORS.length], params: {}, ...o });
  store.set('inds', S.inds); buildIndicators();
}
export function openIndicatorMenu(): void {
  const menu = $('ind-menu');
  if (!menu.classList.contains('hidden')) return closeMenus();
  closeMenus();
  const item = ([k, d]: [string, IndicatorDef]) => `<div class="item" data-type="${k}"><span>${d.name}</span><small>${Object.values(d.params).join(', ')}</small></div>`;
  const all = Object.entries(IND.DEFS);
  menu.innerHTML = '<div class="group">บนกราฟราคา</div>' + all.filter(([, d]) => d.pane === 'main').map(item).join('') +
    '<div class="group">หน้าต่างแยก (Oscillators)</div>' + all.filter(([, d]) => d.pane === 'sub').map(item).join('') +
    '<div class="group">สคริปต์ของฉัน</div>' +
    (S.scripts as Script[]).map((s) => `<div class="item sc" data-script="${s.id}"><span>${esc(s.name)}</span><button data-edit="${s.id}">แก้โค้ด</button></div>`).join('') +
    '<div class="item" data-new><span>' + ICON.html('pencil', 14) + 'เขียน indicator ใหม่…</span></div>';
  menu.classList.remove('hidden');
  menu.querySelectorAll('[data-type]').forEach((el: HTMLElement) => el.onclick = () => { const t = el.dataset.type as string; addIndicator({ type: t, params: { ...IND.DEFS[t].params } }); closeMenus(); });
  menu.querySelectorAll('[data-script]').forEach((el: HTMLElement) => el.onclick = (e: MouseEvent) => {
    const ed = (e.target as HTMLElement).dataset.edit;
    if (ed) { closeMenus(); return openScriptEditor(+ed); }
    addIndicator({ type: 'custom', scriptId: +(el.dataset.script as string) }); closeMenus();
  });
  menu.querySelector('[data-new]').onclick = () => { closeMenus(); openScriptEditor(null); };
}
export function closeMenus(): void { $('ind-menu').classList.add('hidden'); $('an-menu').classList.add('hidden'); }
$('ind-btn').onclick = (e: MouseEvent) => { e.stopPropagation(); openIndicatorMenu(); };
document.addEventListener('click', (e) => { if (!(e.target as HTMLElement).closest('.dropdown')) closeMenus(); });

// ---------------------------------------------------------------- script editor
let editingScript: Script | null = null;
export function openScriptEditor(id: number | null | undefined): void {
  editingScript = id != null ? (S.scripts as Script[]).find((s) => s.id === id) ?? null : null;
  $('sc-name').value = editingScript ? editingScript.name : 'My Indicator';
  $('sc-code').value = editingScript ? editingScript.code : CUSTOM.TEMPLATE;
  $('sc-delete').classList.toggle('hidden', !editingScript);
  $('sc-msg').textContent = 'ทดสอบกับข้อมูลกราฟที่เปิดอยู่ได้ด้วยปุ่ม "ทดสอบ"';
  $('modal-script').classList.remove('hidden');
  $('sc-code').focus();
}
$('sc-example').innerHTML += Object.keys(CUSTOM.EXAMPLES).map((k) => `<option>${esc(k)}</option>`).join('');
$('sc-example').onchange = () => { const k = $('sc-example').value; if (!k) return; $('sc-code').value = CUSTOM.EXAMPLES[k]; $('sc-name').value = k; $('sc-example').value = ''; };
$('sc-code').addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Tab') { e.preventDefault(); const t = e.target as HTMLTextAreaElement, s = t.selectionStart; t.setRangeText('  ', s, t.selectionEnd, 'end'); }
});
function testScript(): boolean {
  if (!S.candles.length) { $('sc-msg').textContent = 'ยังไม่มีข้อมูลกราฟให้ทดสอบ'; return true; }
  const out = CUSTOM.run($('sc-code').value, S.candles, {});
  if (out.error) { $('sc-msg').innerHTML = `<span class="down">${ICON.html('circle-x', 14)}${esc(out.error)}</span>`; return false; }
  $('sc-msg').innerHTML = `<span class="up">${ICON.html('circle-check', 14)}ผ่าน</span> — ${out.plots.length} plot, ${out.markers.length} marker, inputs: ${esc(JSON.stringify(out.inputs))}`;
  return true;
}
function saveScript(): void {
  const name = $('sc-name').value.trim() || 'My Indicator', code = $('sc-code').value;
  const sc: Script = editingScript ?? { id: Date.now(), name, code };
  if (editingScript) { sc.name = name; sc.code = code; } else { editingScript = sc; S.scripts.push(sc); }
  store.set('scripts', S.scripts); vcg.log('info', `บันทึกสคริปต์ "${name}"`, null, 'script');
  if ((S.inds as Ind[]).some((i) => i.scriptId === sc.id)) buildIndicators();
}
$('sc-test').onclick = testScript;
$('sc-save').onclick = () => { if (testScript()) { saveScript(); $('sc-msg').innerHTML += ' · บันทึกแล้ว'; } };
$('sc-add').onclick = () => {
  if (!testScript()) return;
  saveScript();
  const sc = editingScript as Script | null;
  if (sc && !(S.inds as Ind[]).some((i) => i.scriptId === sc.id)) addIndicator({ type: 'custom', scriptId: sc.id });
  $('modal-script').classList.add('hidden');
};
$('sc-delete').onclick = () => {
  const sc = editingScript; if (!sc) return;
  S.scripts = (S.scripts as Script[]).filter((s) => s !== sc);
  S.inds = (S.inds as Ind[]).filter((i) => i.scriptId !== sc.id);
  store.set('scripts', S.scripts); store.set('inds', S.inds); buildIndicators();
  $('modal-script').classList.add('hidden');
};
document.querySelectorAll<HTMLElement>('[data-close]').forEach((b) => (b.onclick = () => b.closest('.modal')?.classList.add('hidden')));

// tests / devtools read these through window.PT
def({ main: [() => main], chart: [() => chart] });
