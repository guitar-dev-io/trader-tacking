import { PT, def } from './src/pt.ts';
def({ createChart: [() => createChart], CandlestickSeries: [() => CandlestickSeries], BarSeries: [() => BarSeries], LineSeries: [() => LineSeries], AreaSeries: [() => AreaSeries], HistogramSeries: [() => HistogramSeries], LineStyle: [() => LineStyle], CrosshairMode: [() => CrosshairMode], TFS: [() => TFS], store: [() => store], _dtf: [() => _dtf], zoneOffsetSec: [() => zoneOffsetSec, (v) => { zoneOffsetSec = v; }], TZ: [() => TZ, (v) => { TZ = v; }], FIB_DEF: [() => FIB_DEF], FIBX_DEF: [() => FIBX_DEF], FIB: [() => FIB, (v) => { FIB = v; }], FIBX: [() => FIBX, (v) => { FIBX = v; }], FIB_REVERSE: [() => FIB_REVERSE, (v) => { FIB_REVERSE = v; }], FIB_PRESETS: [() => FIB_PRESETS], FIB_PRESET_REVERSE: [() => FIB_PRESET_REVERSE], fibColor: [() => fibColor], IND_COLORS: [() => IND_COLORS], UP: [() => UP, (v) => { UP = v; }], DOWN: [() => DOWN, (v) => { DOWN = v; }], CHART_THEME: [() => CHART_THEME], THEME: [() => THEME], TC: [() => TC], AN_DEFAULT: [() => AN_DEFAULT], AN_VIEW_KEYS: [() => AN_VIEW_KEYS], S: [() => S], PREF_DEFAULT: [() => PREF_DEFAULT], tf: [() => tf], drawingsKey: [() => drawingsKey], drawings: [() => drawings, (v) => { drawings = v; }], saveDrawings: [() => saveDrawings], digits: [() => digits], fmt: [() => fmt], $: [() => $], esc: [() => esc] });
// Price Tracker renderer · core: constants, storage, shared state (S), formatting helpers
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

// ---------------------------------------------------------------- themes: 'dark' | 'light' | 'contrast' (+ 'auto' = follow the OS)
// CSS colors live in variables on <html data-theme>; the chart and SVG overlays read CHART_THEME[THEME.get()].
const CHART_THEME = {
  dark: { bg: '#0f1115', text: '#9aa0ad', grid: '#1a1d27', border: '#232734', fg: '#d6d9e0', sel: '#ffffff', muted: '#b2b5be', box: '#0f1115cc', handle: '#0f1115', cross: '#758696' },
  light: { bg: '#ffffff', text: '#4a4f5c', grid: '#eef0f4', border: '#d9dce3', fg: '#1f2330', sel: '#131722', muted: '#7a7f8c', box: '#ffffffd9', handle: '#ffffff', cross: '#9598a1' },
  contrast: { bg: '#000000', text: '#e6e6e6', grid: '#1c1c1c', border: '#5a5f6e', fg: '#ffffff', sel: '#ffff00', muted: '#d0d3da', box: '#000000d9', handle: '#000000', cross: '#bbbbbb' },
};
const THEME = (() => {
  const NAMES = { auto: 'ตามระบบ', dark: 'มืด', light: 'สว่าง', contrast: 'คอนทราสต์สูง' };
  const mq = window.matchMedia ? matchMedia('(prefers-color-scheme: light)') : null;
  let pref = store.get('theme', 'auto');
  const subs = [];
  const resolve = () => (pref === 'auto' ? (mq && mq.matches ? 'light' : 'dark') : pref);
  let cur = null;
  function apply() {
    const t = resolve(); if (t === cur) return; cur = t;
    document.documentElement.dataset.theme = t;
    document.documentElement.style.colorScheme = t === 'light' ? 'light' : 'dark';
    subs.forEach((cb) => { try { cb(t); } catch (_) {} });
  }
  if (mq && mq.addEventListener) mq.addEventListener('change', apply);
  apply();
  return {
    NAMES,
    get: () => cur,                       // resolved theme: dark | light | contrast
    pref: () => pref,                     // user choice incl. 'auto'
    set(name) { if (!NAMES[name]) return; pref = name; store.set('theme', name); apply(); subs.forEach((cb) => { try { cb(cur, true); } catch (_) {} }); },
    next() { const order = ['dark', 'light', 'contrast']; this.set(order[(order.indexOf(cur) + 1) % order.length]); },
    onChange(cb) { subs.push(cb); },
    colors: () => CHART_THEME[cur] || CHART_THEME.dark,
  };
})();
const TC = () => THEME.colors();



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
document.querySelectorAll('[data-icon]').forEach((i) => (i.innerHTML = PT.ICON.svg(i.dataset.icon, 16)));

// renderer errors → log
window.addEventListener('error', (e) => vcg.log('error', `${e.message} @ ${(e.filename || '').split('/').pop()}:${e.lineno}`));
window.addEventListener('unhandledrejection', (e) => vcg.log('error', 'unhandledrejection: ' + (e.reason && e.reason.message || e.reason)));
export { $, AN_VIEW_KEYS, AreaSeries, BarSeries, CandlestickSeries, CrosshairMode, DOWN, FIB, FIBX, FIBX_DEF, FIB_DEF, FIB_PRESETS, FIB_PRESET_REVERSE, FIB_REVERSE, HistogramSeries, IND_COLORS, LineSeries, LineStyle, S, TC, TFS, THEME, TZ, UP, createChart, digits, drawings, drawingsKey, esc, fibColor, fmt, saveDrawings, store, tf, zoneOffsetSec };
