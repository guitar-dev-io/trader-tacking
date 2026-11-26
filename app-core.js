import { PT, def } from './src/pt.ts';
import { ICON } from './icons.js';
import { store, THEME, TC, S, AN_DEFAULT, AN_VIEW_KEYS, PREF_DEFAULT, CHART_THEME } from './src/state.ts';
def({ createChart: [() => createChart], CandlestickSeries: [() => CandlestickSeries], BarSeries: [() => BarSeries], LineSeries: [() => LineSeries], AreaSeries: [() => AreaSeries], HistogramSeries: [() => HistogramSeries], LineStyle: [() => LineStyle], CrosshairMode: [() => CrosshairMode], TFS: [() => TFS], store: [() => store], _dtf: [() => _dtf], zoneOffsetSec: [() => zoneOffsetSec, (v) => { zoneOffsetSec = v; }], TZ: [() => TZ, (v) => { TZ = v; }], FIB_DEF: [() => FIB_DEF], FIBX_DEF: [() => FIBX_DEF], FIB: [() => FIB, (v) => { FIB = v; }], FIBX: [() => FIBX, (v) => { FIBX = v; }], FIB_REVERSE: [() => FIB_REVERSE, (v) => { FIB_REVERSE = v; }], FIB_PRESETS: [() => FIB_PRESETS], FIB_PRESET_REVERSE: [() => FIB_PRESET_REVERSE], fibColor: [() => fibColor], IND_COLORS: [() => IND_COLORS], UP: [() => UP, (v) => { UP = v; }], DOWN: [() => DOWN, (v) => { DOWN = v; }], CHART_THEME: [() => CHART_THEME], THEME: [() => THEME], TC: [() => TC], AN_DEFAULT: [() => AN_DEFAULT], AN_VIEW_KEYS: [() => AN_VIEW_KEYS], S: [() => S], PREF_DEFAULT: [() => PREF_DEFAULT], tf: [() => tf], drawingsKey: [() => drawingsKey], drawings: [() => drawings, (v) => { drawings = v; }], saveDrawings: [() => saveDrawings], digits: [() => digits], fmt: [() => fmt], $: [() => $], esc: [() => esc] });
// Price Tracker renderer · core: constants, storage, shared state (S), formatting helpers
const { createChart, CandlestickSeries, BarSeries, LineSeries, AreaSeries, HistogramSeries, LineStyle, CrosshairMode } = LightweightCharts;

// ---------------------------------------------------------------- constants / storage
const TFS = [
  { label: '1m', type: 0, sec: 60 }, { label: '5m', type: 1, sec: 300 }, { label: '15m', type: 2, sec: 900 },
  { label: '1H', type: 3, sec: 3600 }, { label: '4H', type: 4, sec: 14400 }, { label: '1D', type: 5, sec: 86400 },
  { label: '1W', type: 6, sec: 604800 },
];

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
// popular level sets (negative = beyond the end point = targets, as people set them up in TradingView)
let FIB_REVERSE = store.get('fibReverse', false);
const FIB_PRESETS = {
  'มาตรฐาน': [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1],
  'ICT / OTE': [0, 0.5, 0.62, 0.705, 0.79, 1],
  'Golden pocket': [0, 0.382, 0.5, 0.618, 0.65, 0.786, 1],
  'มีเป้า TP (ติดลบ)': [-1.618, -1, -0.618, -0.27, 0, 0.382, 0.5, 0.618, 0.786, 1],
  'เป้าต่อขา 1.127–2.618': [0, 0.5, 0.618, 1, 1.127, 1.272, 1.618, 2, 2.618],   // used with "กลับด้าน": click start of the leg, then its end
};
const FIB_PRESET_REVERSE = { 'เป้าต่อขา 1.127–2.618': true };
const fibColor = (lv) => ({ 1.127: '#4caf50',  '-1.618': '#e91e63', '-1': '#ff9800', '-0.618': '#f23645', '-0.27': '#2962ff', 0.62: '#089981', 0.65: '#089981', 0.705: '#00bcd4', 0.79: '#00bcd4', 0: '#787b86', 0.236: '#f23645', 0.382: '#ff9800', 0.5: '#4caf50', 0.618: '#089981', 0.786: '#00bcd4', 1: '#787b86', 1.272: '#2962ff', 1.414: '#9c27b0', 1.618: '#f23645', 2: '#ff9800', 2.618: '#e91e63', 3.618: '#9c27b0', 4.236: '#00bcd4' })[lv] || '#b2b5be';
const IND_COLORS = ['#f5a623', '#2962ff', '#e040fb', '#00bcd4', '#ff5252', '#8bc34a', '#ffeb3b'];
let UP = '#26a69a', DOWN = '#ef5350';





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
export { $, AN_VIEW_KEYS, AreaSeries, BarSeries, CandlestickSeries, CrosshairMode, DOWN, FIB, FIBX, FIBX_DEF, FIB_DEF, FIB_PRESETS, FIB_PRESET_REVERSE, FIB_REVERSE, HistogramSeries, IND_COLORS, LineSeries, LineStyle, S, TC, TFS, THEME, TZ, UP, createChart, digits, drawings, drawingsKey, esc, fibColor, fmt, saveDrawings, store, tf, zoneOffsetSec };
