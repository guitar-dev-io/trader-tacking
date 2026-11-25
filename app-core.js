// Price Tracker renderer · core: constants, storage, shared state (S), formatting helpers
/* global LightweightCharts, IND, AN, BOUNCE, CUSTOM, LESSONS, ICON, vcg */
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
