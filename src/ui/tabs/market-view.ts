// ราคา tab: app-data.js owns symbols/quotes/alerts; it pushes snapshots here and Watchlist/Alerts.svelte render them.
import { mount, flushSync } from 'svelte';
import { writable } from 'svelte/store';
import Watchlist from './Watchlist.svelte';
import Alerts from './Alerts.svelte';

export interface Quote { symbol: string; bid: number; ask: number; digits?: number; changePct?: number | null }
export interface WlSnap { symbols: string[]; sel: string; tray: string; quotes: Record<string, Quote | undefined> }
export interface AlertRow { id: number; symbol: string; price: number; dir: 'up' | 'down'; fired?: boolean }
export const wlView = writable<WlSnap>({ symbols: [], sel: '', tray: '', quotes: {} });
export const alertView = writable<{ symbol: string; list: AlertRow[] }>({ symbol: '', list: [] });

let wlMounted = false, alMounted = false;
export function showWatchlist(snap: WlSnap, api: { pick: (s: string) => void; rm: (s: string) => void; star: (s: string) => void; fmt: (v: number, d?: number) => string }) {
  wlView.set(snap);
  if (!wlMounted) { const tb = document.querySelector('#wl tbody'); if (!tb) return; tb.replaceChildren(); mount(Watchlist, { target: tb, props: { api } }); wlMounted = true; }
  flushSync();
}
/** per tick: only the changed quote (rows patch their text; bid cells flash) */
export function quoteWatchlist(q: Quote) { wlView.update((v) => ({ ...v, quotes: { ...v.quotes, [q.symbol]: q } })); flushSync(); }
export function showAlerts(symbol: string, list: AlertRow[], api: { rm: (id: number) => void; fmt: (v: number) => string }) {
  alertView.set({ symbol, list });
  if (!alMounted) { const ul = document.getElementById('alerts'); if (!ul) return; ul.replaceChildren(); mount(Alerts, { target: ul, props: { api } }); alMounted = true; }
  flushSync();
  const n = document.getElementById('alerts-n'); if (n) n.textContent = list.length ? String(list.length) : '';
}
