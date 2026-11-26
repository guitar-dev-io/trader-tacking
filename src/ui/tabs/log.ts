// Log tab: keeps the last 3000 log lines from the main process, counts errors while the tab is closed
// (badge on the tab button) and renders through LogTab.svelte.
import { mount, flushSync } from 'svelte';
import { writable, get } from 'svelte/store';
import LogTab from './LogTab.svelte';
declare const vcg: any;

export interface LogEntry { t: string | number; level: 'debug' | 'info' | 'warn' | 'error'; source: string; msg: string; data?: string | null }
export const LV: Record<string, number> = { debug: 0, info: 1, warn: 2, error: 3 };
export const logs = writable<LogEntry[]>([]);
export const errCount = writable(0);

const all: LogEntry[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
const isOpen = () => { const t = document.getElementById('tab-log'); return !!t && !t.classList.contains('hidden'); };
function badge(n: number) { const b = document.getElementById('log-badge'); if (b) b.textContent = n ? String(n) : ''; }

export function push(list: LogEntry[]) {
  all.push(...list); if (all.length > 3000) all.splice(0, all.length - 3000);
  if (!isOpen()) { errCount.update((n) => n + list.filter((e) => e.level === 'error').length); badge(get(errCount)); }
  else if (!timer) timer = setTimeout(() => { timer = null; refresh(); }, 1000);
}
/** called when the Log tab is shown */
export function opened() { errCount.set(0); badge(0); refresh(); }
export function refresh() { logs.set(all.slice()); flushSync(); }
export const allLogs = () => all;
export const copyText = () => all.map((e) => `${e.t} [${e.level}] ${e.source}: ${e.msg}${e.data ? ' ' + e.data : ''}`).join('\n');

export function init() {
  const host = document.getElementById('tab-log'); if (!host) return;
  host.replaceChildren(); mount(LogTab, { target: host });
  vcg.onLogs((list: LogEntry[]) => push(list));
}
