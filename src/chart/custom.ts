import { def } from '../pt';
import type { Candle } from '../core/types';

// User-written indicators (JavaScript). A script is the body of a function that receives:
//   candles, open, high, low, close   – data (arrays, oldest → newest)
//   input(name, default)              – a parameter the user can edit with ⚙
//   ta                                – helper functions (see TA below)
//   plot(name, values, opts)          – draw a line/histogram; opts: {color, pane:'main'|'sub', type:'line'|'histogram', width}
//   hline(price, opts)                – horizontal level in the sub pane (e.g. 70 / 30)
//   marker(index, opts)               – label on a candle; opts: {text, position:'above'|'below', color}

interface PlotOpts { color?: string; pane?: string; type?: string; width?: number }
export interface CustomPlot { name: string; values: (number | null)[]; color: string | null; pane: 'main' | 'sub'; type: 'line' | 'histogram'; width: number }
export interface CustomMarker { index: number; text: string; position: 'above' | 'below'; color: string }
export interface CustomResult { plots: CustomPlot[]; hlines: { price: number; color: string }[]; markers: CustomMarker[]; inputs: Record<string, unknown>; error: string | null }

type Arr = (number | null)[];

export const TA = {
  sma(a: Arr, n: number): Arr { const o: Arr = Array(a.length).fill(null); let s = 0; for (let i = 0; i < a.length; i++) { s += a[i] as number; if (i >= n) s -= a[i - n] as number; if (i >= n - 1) o[i] = s / n; } return o; },
  ema(a: Arr, n: number): Arr { const o: Arr = Array(a.length).fill(null), k = 2 / (n + 1); let e: number | null = null, c = 0, s = 0;
    for (let i = 0; i < a.length; i++) { const v = a[i]; if (v == null) continue; if (e == null) { s += v; c++; if (c === n) { e = s / n; o[i] = e; } continue; } e = v * k + e * (1 - k); o[i] = e; } return o; },
  rma(a: Arr, n: number): Arr { const o: Arr = Array(a.length).fill(null); let r: number | null = null, c = 0, s = 0;
    for (let i = 0; i < a.length; i++) { const v = a[i]; if (v == null) continue; if (r == null) { s += v; c++; if (c === n) { r = s / n; o[i] = r; } continue; } r = (r * (n - 1) + v) / n; o[i] = r; } return o; },
  wma(a: Arr, n: number): Arr { const o: Arr = Array(a.length).fill(null), d = (n * (n + 1)) / 2; for (let i = n - 1; i < a.length; i++) { let s = 0; for (let j = 0; j < n; j++) s += (a[i - j] as number) * (n - j); o[i] = s / d; } return o; },
  stdev(a: Arr, n: number): Arr { const m = TA.sma(a, n); return a.map((_, i) => { const mi = m[i]; if (mi == null) return null; let s = 0; for (let j = i - n + 1; j <= i; j++) s += ((a[j] as number) - mi) ** 2; return Math.sqrt(s / n); }); },
  highest(a: Arr, n: number): Arr { return a.map((_, i) => (i < n - 1 ? null : Math.max(...(a.slice(i - n + 1, i + 1) as number[])))); },
  lowest(a: Arr, n: number): Arr { return a.map((_, i) => (i < n - 1 ? null : Math.min(...(a.slice(i - n + 1, i + 1) as number[])))); },
  change(a: Arr, n = 1): Arr { return a.map((v, i) => (i < n ? null : (v as number) - (a[i - n] as number))); },
  rsi(a: Arr, n = 14): Arr { const ch = TA.change(a), g = TA.rma(ch.map((d) => (d == null ? null : Math.max(d, 0))), n), l = TA.rma(ch.map((d) => (d == null ? null : Math.max(-d, 0))), n);
    return g.map((x, i) => (x == null ? null : l[i] === 0 ? 100 : 100 - 100 / (1 + x / (l[i] as number)))); },
  tr(c: Candle[]): number[] { return c.map((x, i) => (i === 0 ? x.high - x.low : Math.max(x.high - x.low, Math.abs(x.high - c[i - 1].close), Math.abs(x.low - c[i - 1].close)))); },
  atr(c: Candle[], n = 14): Arr { return TA.rma(TA.tr(c), n); },
  crossover(a: Arr, b: Arr | number, i: number): boolean { const bv = (k: number) => (Array.isArray(b) ? b[k] : b); const a0 = a[i], a1 = a[i - 1], b0 = bv(i), b1 = bv(i - 1); return i > 0 && a0 != null && a1 != null && b0 != null && b1 != null && a0 > b0 && a1 <= b1; },
  crossunder(a: Arr, b: Arr | number, i: number): boolean { const bv = (k: number) => (Array.isArray(b) ? b[k] : b); const a0 = a[i], a1 = a[i - 1], b0 = bv(i), b1 = bv(i - 1); return i > 0 && a0 != null && a1 != null && b0 != null && b1 != null && a0 < b0 && a1 >= b1; },
};

export const EXAMPLES: Record<string, string> = {
  'EMA Cross + สัญญาณ': `// เส้น EMA เร็ว/ช้า และป้าย BUY/SELL เมื่อเส้นตัดกัน
const fast = input('fast', 9);
const slow = input('slow', 21);
const f = ta.ema(close, fast), s = ta.ema(close, slow);
plot('EMA fast', f, { color: '#26a69a' });
plot('EMA slow', s, { color: '#ef5350' });
for (let i = 1; i < close.length; i++) {
if (ta.crossover(f, s, i)) marker(i, { text: 'BUY', position: 'below', color: '#26a69a' });
if (ta.crossunder(f, s, i)) marker(i, { text: 'SELL', position: 'above', color: '#ef5350' });
}`,
  'Supertrend': `// Supertrend: เส้นเขียว = ขาขึ้น, แดง = ขาลง
const period = input('period', 10);
const mult = input('multiplier', 3);
const atr = ta.atr(candles, period);
const up = [], dn = [];
let dir = 1, finalUp = null, finalDn = null;
for (let i = 0; i < close.length; i++) {
if (atr[i] == null) { up.push(null); dn.push(null); continue; }
const hl2 = (high[i] + low[i]) / 2;
let bu = hl2 - mult * atr[i], bd = hl2 + mult * atr[i];
finalUp = finalUp == null || close[i - 1] < finalUp ? bu : Math.max(bu, finalUp);
finalDn = finalDn == null || close[i - 1] > finalDn ? bd : Math.min(bd, finalDn);
const prev = dir;
if (close[i] > finalDn) dir = 1; else if (close[i] < finalUp) dir = -1;
up.push(dir === 1 ? finalUp : null); dn.push(dir === -1 ? finalDn : null);
if (dir !== prev) marker(i, { text: dir === 1 ? '▲ ST' : '▼ ST', position: dir === 1 ? 'below' : 'above', color: dir === 1 ? '#26a69a' : '#ef5350' });
}
plot('Up', up, { color: '#26a69a', width: 2 });
plot('Down', dn, { color: '#ef5350', width: 2 });`,
  'RSI + Overbought/Oversold': `// RSI ในหน้าต่างแยก พร้อมป้ายเมื่อออกจากโซน 70/30
const n = input('period', 14);
const r = ta.rsi(close, n);
plot('RSI', r, { pane: 'sub', color: '#ab47bc' });
hline(70, { color: '#ef535088' });
hline(30, { color: '#26a69a88' });
for (let i = 1; i < r.length; i++) {
if (ta.crossunder(r, 70, i)) marker(i, { text: 'OB', position: 'above', color: '#ef5350' });
if (ta.crossover(r, 30, i)) marker(i, { text: 'OS', position: 'below', color: '#26a69a' });
}`,
  'Momentum histogram': `// โมเมนตัม = close - close[n] แสดงเป็นแท่ง
const n = input('length', 10);
const m = ta.change(close, n);
plot('Momentum', m, { pane: 'sub', type: 'histogram' });`,
};

export const TEMPLATE = `// เขียน indicator ของคุณที่นี่ (JavaScript)
// ข้อมูล: candles, open, high, low, close (array เก่า → ใหม่)
// พารามิเตอร์: const n = input('period', 20)
// ฟังก์ชัน: ta.sma ta.ema ta.wma ta.rma ta.rsi ta.atr ta.stdev ta.highest ta.lowest ta.change ta.crossover ta.crossunder
// วาด: plot(name, values, {color, pane:'main'|'sub', type:'line'|'histogram', width})
//      hline(70, {color})   marker(i, {text:'BUY', position:'below', color:'#26a69a'})
const n = input('period', 20);
plot('My SMA', ta.sma(close, n), { color: '#f5a623' });
`;

// Run a script; returns {plots, hlines, markers, inputs, error}
export function run(code: string, candles: Candle[], params: Record<string, unknown> = {}): CustomResult {
  const out: CustomResult = { plots: [], hlines: [], markers: [], inputs: {}, error: null };
  const input = (name: string, def: unknown) => { const v = params[name] != null ? params[name] : def; out.inputs[name] = v; return v; };
  const plot = (name: string, values: unknown, o: PlotOpts = {}) => {
    if (!Array.isArray(values)) throw new Error(`plot('${name}') ต้องส่ง array`);
    out.plots.push({ name: String(name), values: values as Arr, color: o.color || null, pane: o.pane === 'sub' ? 'sub' : 'main', type: o.type === 'histogram' ? 'histogram' : 'line', width: o.width || 2 });
  };
  const hline = (price: number, o: { color?: string } = {}) => out.hlines.push({ price, color: o.color || '#787b8688' });
  const marker = (index: number, o: { text?: string; position?: string; color?: string } = {}) => out.markers.push({ index, text: String(o.text || '●'), position: o.position === 'above' ? 'above' : 'below', color: o.color || '#f5a623' });
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function('candles', 'open', 'high', 'low', 'close', 'input', 'ta', 'plot', 'hline', 'marker', '"use strict";\n' + code);
    fn(candles, candles.map((c) => c.open), candles.map((c) => c.high), candles.map((c) => c.low), candles.map((c) => c.close), input, TA, plot, hline, marker);
  } catch (e: any) { out.error = (e as Error).message; }
  return out;
}


export const CUSTOM = { run, TA, EXAMPLES, TEMPLATE };

