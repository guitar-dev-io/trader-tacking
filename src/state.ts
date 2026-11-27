// Central renderer state (Phase 3). One module that the legacy modules AND the Svelte components import:
//  • store      — persisted prefs (localStorage, JSON)
//  • THEME / TC — dark | light | contrast (+ auto), chart colours per theme
//  • S          — the app's shared mutable state (symbol, timeframe, candles, source, …)
//  • connStatus — the last status object from the main process / native bridge
//  • mainCfg    — the cached main-process settings (filled when the settings dialog opens)
//  • view       — small UI flags (view.dirty = redraw the overlay on the next frame)
// Svelte components subscribe through the small stores at the bottom (theme, conn, tick, persisted()).
import { writable, type Writable, type Readable } from 'svelte/store';
import { def } from './pt';

// ------------------------------------------------------------ storage
export const store = {
  get<T = any>(k: string, d?: T): T { try { const v = localStorage.getItem(k); return v == null ? (d as T) : JSON.parse(v); } catch (_) { return d as T; } },
  set(k: string, v: unknown): void { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* quota / private mode */ } },
};

// ------------------------------------------------------------ themes
export type ThemeName = 'dark' | 'light' | 'contrast';
export type ThemePref = ThemeName | 'auto';
export interface ChartColors { bg: string; text: string; grid: string; border: string; fg: string; sel: string; muted: string; box: string; handle: string; cross: string }
export const CHART_THEME: Record<ThemeName, ChartColors> = {
  dark: { bg: '#0f1115', text: '#9aa0ad', grid: '#1a1d27', border: '#232734', fg: '#d6d9e0', sel: '#ffffff', muted: '#b2b5be', box: '#0f1115cc', handle: '#0f1115', cross: '#758696' },
  light: { bg: '#ffffff', text: '#4a4f5c', grid: '#eef0f4', border: '#d9dce3', fg: '#1f2330', sel: '#131722', muted: '#7a7f8c', box: '#ffffffd9', handle: '#ffffff', cross: '#9598a1' },
  contrast: { bg: '#000000', text: '#e6e6e6', grid: '#1c1c1c', border: '#5a5f6e', fg: '#ffffff', sel: '#ffff00', muted: '#d0d3da', box: '#000000d9', handle: '#000000', cross: '#bbbbbb' },
};
type ThemeCb = (t: ThemeName, byUser?: boolean) => void;
export const THEME = (() => {
  const NAMES: Record<ThemePref, string> = { auto: 'ตามระบบ', dark: 'มืด', light: 'สว่าง', contrast: 'คอนทราสต์สูง' };
  const mq: MediaQueryList | null = typeof window.matchMedia === 'function' ? matchMedia('(prefers-color-scheme: light)') : null;
  let pref: ThemePref = store.get<ThemePref>('theme', 'auto');
  const subs: ThemeCb[] = [];
  const resolve = (): ThemeName => (pref === 'auto' ? (mq && mq.matches ? 'light' : 'dark') : pref);
  let cur: ThemeName | null = null;
  function apply(): void {
    const t = resolve(); if (t === cur) return; cur = t;
    document.documentElement.dataset.theme = t;
    document.documentElement.style.colorScheme = t === 'light' ? 'light' : 'dark';
    subs.forEach((cb) => { try { cb(t); } catch (_) { /* a subscriber's bug must not stop the others */ } });
  }
  if (mq && mq.addEventListener) mq.addEventListener('change', apply);
  apply();
  return {
    NAMES,
    get: (): ThemeName => cur as ThemeName,      // resolved theme: dark | light | contrast
    pref: (): ThemePref => pref,                  // user choice incl. 'auto'
    set(name: string): void {
      if (!(name in NAMES)) return; pref = name as ThemePref; store.set('theme', name); apply();
      subs.forEach((cb) => { try { cb(cur as ThemeName, true); } catch (_) { /* ignore */ } });
    },
    next(): void { const order: ThemeName[] = ['dark', 'light', 'contrast']; this.set(order[(order.indexOf(cur as ThemeName) + 1) % order.length]); },
    onChange(cb: ThemeCb): void { subs.push(cb); },
    colors: (): ChartColors => CHART_THEME[cur as ThemeName] || CHART_THEME.dark,
  };
})();
export const TC = (): ChartColors => THEME.colors();

// ------------------------------------------------------------ S (shared app state)
// Clean chart by default: analysis overlays are opt-in from the analysis menu.
export const AN_DEFAULT = { autofib: false, bounce: false, liquidity: false, bounceSide: 'both', swing: false, legs: false, structure: false, zones: false, patterns: false, signals: false, history: false, td: false, learnOnly: false, notify: false, swingLen: 5 };
export const AN_VIEW_KEYS = ['autofib', 'bounce', 'liquidity', 'swing', 'legs', 'structure', 'zones', 'patterns', 'signals', 'history', 'td'];
// one-time migration (v2.0.3): switch existing installs to the clean default
if (store.get('defaultsV', 1) < 2) {
  const an = store.get<Record<string, unknown> | null>('an', null);
  if (an) { AN_VIEW_KEYS.forEach((k) => { an[k] = false; }); an.notify = false; store.set('an', an); }
  const inds = store.get<{ type: string; params: unknown }[] | null>('inds', null);
  if (inds && JSON.stringify(inds.map((i) => [i.type, i.params])) === JSON.stringify([['ema', { period: 50 }], ['sma', { period: 200 }]])) store.set('inds', []);
  store.set('sessions', true);
  store.set('defaultsV', 2);
}
export const PREF_DEFAULT = { sound: true, desktop: true, toast: true, historyBars: 1500, rr1: 1, rr2: 2, slBuf: 0.2, minSamples: 5, maxBars: 100 };
// S is deliberately loose: ~40 legacy modules add and read their own keys on it.
export const S: Record<string, any> = {
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
  source: store.get('source', 'vcg'),   // 'vcg' | 'mt5' | 'demo'
};
S.prefs = { ...PREF_DEFAULT, ...store.get('prefs', {}) };

// ------------------------------------------------------------ connection status + settings cache
// Loose on purpose: the status object comes from the main process / native bridge and grows over time.
export type ConnStatus = Record<string, any>;
export let connStatus: ConnStatus = {};
export let mainCfg: Record<string, any> | null = null;
export function setMainCfg(c: Record<string, any> | null): void { mainCfg = c; }

// ------------------------------------------------------------ small UI flags
// `view.dirty = true` asks the overlay to redraw on the next frame (src/chart/draw.ts).
export const view = { dirty: true };

// ------------------------------------------------------------ stores for Svelte components
/** resolved theme name; updates on every theme change */
export const theme: Readable<ThemeName> = (() => { const w = writable<ThemeName>(THEME.get()); THEME.onChange((t) => w.set(t)); return { subscribe: w.subscribe }; })();
/** last connection status */
export const conn: Writable<ConnStatus> = writable(connStatus);
export function setConnStatus(st: ConnStatus): void { connStatus = st || {}; conn.set(connStatus); }
/** a clock tick (ms) every 30 s — for "x minutes ago" texts and data that is polled, not pushed */
export const tick: Readable<number> = (() => {
  const w = writable(Date.now()); setInterval(() => w.set(Date.now()), 30000);
  return { subscribe: w.subscribe };
})();
/** a store persisted under a localStorage key (same keys as the legacy code, so saved user data carries over) */
export function persisted<T>(key: string, init: T): Writable<T> {
  const w = writable<T>(store.get<T>(key, init));
  w.subscribe((v) => store.set(key, v));
  return w;
}

def({ dirty: [() => view.dirty, (v) => { view.dirty = Boolean(v); }], connStatus: [() => connStatus, (v) => setConnStatus(v as ConnStatus)] });
