import * as LightweightCharts from 'lightweight-charts';
import { PT, def } from '../pt';
import { ICON } from './icons';
import { store, THEME, TC, S, AN_DEFAULT, AN_VIEW_KEYS, PREF_DEFAULT, CHART_THEME } from '../state';
import { drawings, drawingsKey, saveDrawings } from '../chart/drawings';
def({ store: [() => store], FIB: [() => FIB, (v: any) => { FIB = v; }], FIB_PRESETS: [() => FIB_PRESETS], THEME: [() => THEME], AN_VIEW_KEYS: [() => AN_VIEW_KEYS], S: [() => S], fmt: [() => fmt], $: [() => $] });
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
function zoneOffsetSec(zone: string, date = new Date()) {
  if (!zone || zone === 'local') return -date.getTimezoneOffset() * 60;
  let f = _dtf.get(zone);
  if (!f) { f = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }); _dtf.set(zone, f); }
  const p = Object.fromEntries(f.formatToParts(date).map((x: { type: any; value: any; }) => [x.type, x.value]));
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
const fibColor = (lv: number) => ({ 1.127: '#4caf50',  '-1.618': '#e91e63', '-1': '#ff9800', '-0.618': '#f23645', '-0.27': '#2962ff', 0.62: '#089981', 0.65: '#089981', 0.705: '#00bcd4', 0.79: '#00bcd4', 0: '#787b86', 0.236: '#f23645', 0.382: '#ff9800', 0.5: '#4caf50', 0.618: '#089981', 0.786: '#00bcd4', 1: '#787b86', 1.272: '#2962ff', 1.414: '#9c27b0', 1.618: '#f23645', 2: '#ff9800', 2.618: '#e91e63', 3.618: '#9c27b0', 4.236: '#00bcd4' })[lv] || '#b2b5be';
const IND_COLORS = ['#f5a623', '#2962ff', '#e040fb', '#00bcd4', '#ff5252', '#8bc34a', '#ffeb3b'];
let UP = '#26a69a', DOWN = '#ef5350';
// setters (Phase 5a): the chart settings menu / timezone selector change these; importers see the live binding
function setFib(v: number[]) { FIB = v; }
function setFibX(v: number[]) { FIBX = v; }
function setFibReverse(v: boolean) { FIB_REVERSE = !!v; }
function setCandleColors(up: string, down: string) { UP = up; DOWN = down; }
function setTZ(v: number) { TZ = v; }





const tf = () => TFS.find((t) => t.type === S.tf) || TFS[3];
const digits = () => S.digits[S.symbol] ?? 2;
const fmt = (v: number|null, d = digits()) => (v == null || !isFinite(v) ? '—' : Number(v).toFixed(d));
/** document.getElementById for the app's own fixed ids: never null in the shipped markup; extra props are loose */
// The app's own markup is fixed, so lookups of its ids/selectors are never null; El keeps the HTMLElement members
// typed and lets form-control props (value, checked, …) through. Use qs/qsa for selectors.
export type El = { querySelector(s: string): El; querySelectorAll(s: string): NodeListOf<El>; closest(s: string): El; parentElement: El; firstElementChild: El; lastElementChild: El; nextElementSibling: El; previousElementSibling: El; dataset: { [k: string]: string } }
  & HTMLElement & { [prop: string]: any };
const $ = (id: string): El => document.getElementById(id) as El;
export const qs = (sel: string, root: ParentNode = document): El => root.querySelector(sel) as El;
export const qsa = (sel: string, root: ParentNode = document): NodeListOf<El> => root.querySelectorAll(sel) as NodeListOf<El>;
/** createElement typed as an app element */
export const mk = (tag: string): El => document.createElement(tag) as El;
/** event target as an app element */
export const tgt = (e: Event): El => e.target as El;
const esc = (s?: string|null) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as Record<string, string>)[c]);

// icons
qsa('[data-icon]').forEach((i) => (i.innerHTML = ICON.svg(i.dataset.icon, 16)));

// renderer errors → log
window.addEventListener('error', (e) => vcg.log('error', `${e.message} @ ${(e.filename || '').split('/').pop()}:${e.lineno}`));
window.addEventListener('unhandledrejection', (e) => vcg.log('error', 'unhandledrejection: ' + (e.reason && e.reason.message || e.reason)));
export { setFib, setFibX, setFibReverse, setCandleColors, setTZ };
export { $, AN_VIEW_KEYS, AreaSeries, BarSeries, CandlestickSeries, CrosshairMode, DOWN, FIB, FIBX, FIBX_DEF, FIB_DEF, FIB_PRESETS, FIB_PRESET_REVERSE, FIB_REVERSE, HistogramSeries, IND_COLORS, LineSeries, LineStyle, S, TC, TFS, THEME, TZ, UP, createChart, digits, drawings, drawingsKey, esc, fibColor, fmt, saveDrawings, store, tf, zoneOffsetSec };
