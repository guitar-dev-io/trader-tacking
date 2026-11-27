// Live data for the dashboard's chart/bounce widgets: one chart-history "slot" (w1…w6) per symbol+timeframe,
// shared by every widget that shows it. Not reactive on purpose — the widgets subscribe with a callback.
import { S } from '../../state';
import { TZ } from '../../app/app-core';
import { dedupe, toCandle, valid } from '../../app/app-data';
import { DEMO } from '../../app/extras';
import { MAX, base, quote, tfOf } from './model.svelte';

export interface Candle { time: number; open: number; high: number; low: number; close: number }
export interface Feed { key: string; sym: string; tf: number; slot: string; candles: Candle[]; subs: Set<string>; pending: boolean; err: string; at: number; src: string }
type View = { update?: (f: Feed, full?: boolean) => void };

export const feeds = new Map<string, Feed>();
const cache = new Map<string, Candle[]>();
const views = new Map<string, View>();             // widget id → its feed callback

const freeSlot = () => { const used = new Set([...feeds.values()].map((f) => f.slot)); for (let i = 1; i <= MAX; i++) if (!used.has('w' + i)) return 'w' + i; return null; };
function request(f: Feed) {
  f.pending = true; f.err = ''; f.src = S.source; f.at = Date.now();
  const req = { symbol: f.sym, candleType: f.tf, to: new Date().toISOString(), inclusive: true, limit: 400, slot: f.slot };
  try { if (S.source === 'demo') DEMO.requestChart(req); else (window as any).vcg.requestChart(req); } catch (e) { f.err = (e as Error).message; }
}
export function acquire(sym: string, tf: number, wid: string, view: View): Feed | null {
  const key = sym + '|' + tf;
  let f = feeds.get(key);
  if (!f) {
    const slot = freeSlot(); if (!slot) return null;
    f = { key, sym, tf: +tf, slot, candles: cache.get(key) || [], subs: new Set(), pending: true, err: '', at: 0, src: S.source };
    feeds.set(key, f); request(f);
  }
  f.subs.add(wid); views.set(wid, view); return f;
}
export function release(wid: string) {
  views.delete(wid);
  for (const [k, f] of feeds) { f.subs.delete(wid); if (!f.subs.size) { if (f.candles.length) cache.set(k, f.candles); feeds.delete(k); } }
}
function notify(f: Feed, full?: boolean) { for (const id of f.subs) { const v = views.get(id); if (v && v.update) v.update(f, full); } }

export function onMsg(m: any) {
  if (!m) return;
  const f = [...feeds.values()].find((x) => x.slot === m.slot); if (!f) return;
  if (m.type === 'chartError') { f.err = (m.data && m.data.message) || 'โหลดไม่สำเร็จ'; f.pending = false; return notify(f); }
  if (m.type !== 'chart' || !m.data) return;
  const d = m.data, sym = d.symbol || (d.history && d.history.symbol);
  if (sym && base(sym) !== base(f.sym)) return;                        // an older request on this slot
  if (d.history && d.history.candles) {
    const arr: Candle[] = dedupe(d.history.candles.map(toCandle).filter(valid).sort((a: Candle, b: Candle) => a.time - b.time));
    if (!arr.length) { f.err = 'ไม่มีข้อมูล'; f.pending = false; return notify(f); }
    f.candles = arr; f.pending = false; f.err = ''; f.at = Date.now(); notify(f, true);
  } else if (d.updates && d.updates.candles && !f.pending) {
    for (const c of d.updates.candles.map(toCandle).filter(valid)) upsert(f, c);
    f.at = Date.now(); notify(f);
  }
}
function upsert(f: Feed, c: Candle) {
  const a = f.candles, last = a[a.length - 1]; if (!last || c.time < last.time) return;
  if (c.time > last.time) { a.push(c); if (a.length > 1500) a.shift(); } else a[a.length - 1] = c;
}
/** build the forming candle from live quotes; re-request stale feeds (every second while the dashboard is shown) */
export function tickFeeds() {
  for (const f of feeds.values()) {
    if (f.src !== S.source) { request(f); continue; }
    const q = quote(f.sym), a = f.candles;
    if (q && a.length && !f.pending) {
      const sec = tfOf(f.tf).sec, t = Math.floor(Date.parse(q.time) / 1000) + TZ, start = Math.floor((t - TZ) / sec) * sec + TZ, last = a[a.length - 1];
      if (start > last.time) upsert(f, { time: start, open: q.bid, high: q.bid, low: q.bid, close: q.bid });
      else if (start === last.time) { last.close = q.bid; last.high = Math.max(last.high, q.bid); last.low = Math.min(last.low, q.bid); }
      notify(f);
    } else if (!f.pending && Date.now() - f.at > 60000) request(f);     // no live quote for this symbol: refresh every minute
    else if (f.pending && Date.now() - f.at > 20000 && !f.err) { f.err = 'ยังไม่ได้ข้อมูล — กำลังลองใหม่'; notify(f); request(f); }
  }
}
