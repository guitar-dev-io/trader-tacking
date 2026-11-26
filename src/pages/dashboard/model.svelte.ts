// Dashboard state (Svelte runes): widget catalog, preset layouts, the saved layouts (dash.layout — same key as
// before), edit mode, the catalog/popover state and a 1-second tick that list widgets re-render on.
import { S, store } from '../../state';
import { TFS } from '../../../app-core.js';
import { IC } from './icons';

export interface WidgetCfg { id: string; type: string; w: number; h: number; opts: Record<string, any> }
export interface Layouts { cur: string; layouts: Record<string, WidgetCfg[]> }

export const mobile = document.body.classList.contains('mobile');
export const MAX = 6;                       // live chart-history slots (w1…w6)
export const W12 = [3, 4, 6, 8, 12];
export const uid = () => 'w' + Math.random().toString(36).slice(2, 9);
export const tfOf = (type: number | string) => TFS.find((t) => t.type === +type) || TFS.find((t) => t.label === '1H') || TFS[0];
export const guessDigits = (s: string): number => S.digits[s] ?? (/JPY/.test(s) ? 3 : /^(XAU|XAG|BTC|ETH|SOL|BNB|US30|NAS|SPX|GER)/.test(s) ? 2 : /^[A-Z]{6}/.test(s) ? 5 : 2);
export const fx = (v: number | null | undefined, d: number) => (v == null || !isFinite(v) ? '—' : Number(v).toFixed(d));
const base = (s: string) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
export { base };
export const quote = (s: string): any => S.quotes[s] || S.quotes[String(s).toUpperCase()] || Object.entries(S.quotes).find(([k]) => base(k) === base(s))?.[1] || null;
export const quoteSyms = (o: Record<string, any>): string[] => (o.symbols ? o.symbols.split(/[\s,]+/).filter(Boolean) : S.symbols || []);

// ------------------------------------------------------------ widget catalog
export const TYPES: Record<string, { name: string; icon: string; desc: string; w: number; h: number; opts: () => Record<string, any> }> = {
  chart: { name: 'กราฟ', icon: IC.chart, desc: 'แท่งเทียนสดของ symbol ใดก็ได้ เลือก timeframe ได้ · กดชื่อเพื่อเปิดในกราฟหลัก', w: 6, h: 2, opts: () => ({ symbol: S.symbol, tf: 3 }) },
  quotes: { name: 'ราคา (Watchlist)', icon: IC.quotes, desc: 'Bid / Ask / % เปลี่ยนแปลง พร้อมเส้นราคาย่อ', w: 4, h: 2, opts: () => ({ symbols: '' }) },
  positions: { name: 'ออเดอร์ของฉัน (MT5)', icon: IC.wallet, desc: 'Balance / Equity และโพซิชันที่เปิดอยู่ — อ่านอย่างเดียว', w: 4, h: 2, opts: () => ({}) },
  news: { name: 'ข่าวตลาด', icon: IC.news, desc: 'หัวข้อข่าวล่าสุดจาก FXStreet, Investing, Fed, ECB', w: 4, h: 2, opts: () => ({ relevant: false }) },
  calendar: { name: 'ปฏิทินเศรษฐกิจ', icon: IC.cal, desc: 'ข่าวสำคัญที่กำลังจะมา (High impact)', w: 4, h: 1, opts: () => ({}) },
  sessions: { name: 'ช่วงตลาด (Session)', icon: IC.clock, desc: 'Sydney / Tokyo / London / New York เปิด–ปิด และเวลาที่เหลือ', w: 4, h: 1, opts: () => ({}) },
  bounce: { name: 'จุดเด้ง', icon: IC.target, desc: 'โซนซื้อ/ขายเด่นของ symbol ที่เลือก (Order block, FVG, S/R)', w: 4, h: 2, opts: () => ({ symbol: S.symbol, tf: 3 }) },
  alerts: { name: 'แจ้งเตือนราคา', icon: IC.bell, desc: 'การแจ้งเตือนราคาทั้งหมดทุก symbol', w: 4, h: 1, opts: () => ({}) },
  notes: { name: 'โน้ต', icon: IC.note, desc: 'จดแผนเทรด / สิ่งที่ต้องดูวันนี้ (เก็บในเครื่อง)', w: 4, h: 1, opts: () => ({}) },
};
export const mk = (type: string, w?: number, h?: number, opts: Record<string, any> = {}): WidgetCfg =>
  ({ id: uid(), type, w: w ?? TYPES[type].w, h: h ?? TYPES[type].h, opts: { ...TYPES[type].opts(), ...opts } });
export const PRESETS: Record<string, () => WidgetCfg[]> = {
  'ทองคำ': () => [mk('chart', 6, 2, { symbol: 'XAUUSD', tf: 3 }), mk('chart', 6, 2, { symbol: 'XAUUSD', tf: 2 }), mk('chart', 4, 2, { symbol: 'EURUSD', tf: 3 }), mk('chart', 4, 2, { symbol: 'BTCUSD', tf: 3 }),
    mk('quotes', 4, 2, { symbols: 'XAUUSD, EURUSD, BTCUSD' }), mk('sessions', 4, 1), mk('news', 8, 1)],
  'Forex หลัก': () => [mk('chart', 6, 2, { symbol: 'EURUSD', tf: 3 }), mk('chart', 6, 2, { symbol: 'GBPUSD', tf: 3 }), mk('chart', 4, 2, { symbol: 'USDJPY', tf: 3 }), mk('chart', 4, 2, { symbol: 'AUDUSD', tf: 3 }),
    mk('quotes', 4, 2, { symbols: 'EURUSD, GBPUSD, USDJPY, AUDUSD, USDCAD' }), mk('calendar', 6, 1), mk('sessions', 6, 1)],
  'คริปโต': () => [mk('chart', 8, 2, { symbol: 'BTCUSD', tf: 3 }), mk('quotes', 4, 2, { symbols: 'BTCUSD, ETHUSD, SOLUSD, XRPUSD' }), mk('chart', 4, 2, { symbol: 'ETHUSD', tf: 3 }),
    mk('chart', 4, 2, { symbol: 'SOLUSD', tf: 3 }), mk('news', 4, 2)],
};

let saved = store.get<Layouts | null>('dash.layout', null);
if (!saved || !saved.layouts || !Object.keys(saved.layouts).length) saved = { cur: 'ทองคำ', layouts: { 'ทองคำ': PRESETS['ทองคำ']() } };
if (!saved.layouts[saved.cur]) saved.cur = Object.keys(saved.layouts)[0];

export const dash = $state({
  cfg: saved as Layouts,
  editing: false,
  active: false,          // the dashboard is on screen (widgets mount and feeds refresh only then)
  catOpen: false,
  pop: null as null | { id: string; anchor: DOMRect },
  dragId: null as string | null,
  naming: false,          // inline "name the new layout" form
  tick: 0,                // +1 per second while active: list widgets re-render on it
});
export const layout = (): WidgetCfg[] => dash.cfg.layouts[dash.cfg.cur];
export const save = () => store.set('dash.layout', dash.cfg);

// ------------------------------------------------------------ small widget helpers
export const sparks = new Map<string, number[]>();             // symbol → recent bids (1/s)
export function ago(iso: string) { const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000)); return m < 60 ? m + ' นาที' : m < 1440 ? Math.round(m / 60) + ' ชม.' : Math.round(m / 1440) + ' วัน'; }
export const SESS: [string, string, number, number][] = [['Sydney', 'Australia/Sydney', 7, 16], ['Tokyo', 'Asia/Tokyo', 9, 18], ['London', 'Europe/London', 8, 17], ['New York', 'America/New_York', 8, 17]];
export function localHour(zone: string, d = new Date()) {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value; return { h: +g('hour')! + +g('minute')! / 60, wd: g('weekday') };
}
export function sparkPoints(arr: number[] | undefined, wpx = 56, hpx = 20) {
  if (!arr || arr.length < 2) return null;
  const lo = Math.min(...arr), hi = Math.max(...arr), r = hi - lo || 1;
  return { pts: arr.map((v, i) => `${((i / (arr.length - 1)) * wpx).toFixed(1)},${(hpx - 2 - ((v - lo) / r) * (hpx - 4)).toFixed(1)}`).join(' '), up: arr[arr.length - 1] >= arr[0] };
}
