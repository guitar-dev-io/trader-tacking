// ราคา tab "การเชื่อมต่อ & เครื่องมือ" section: app-data.js pushes CSV/API status; Tools.svelte renders it.
import { mount, flushSync } from 'svelte';
import { writable } from 'svelte/store';
import Tools from './Tools.svelte';

export interface ToolsApi { showTrader(): void; reload(): void; toggleCsv(): void; openCsv(): void }
export interface ToolsState { csv: boolean; api: { enabled?: boolean; port?: number; lan?: boolean } | null }
export const tools = writable<ToolsState>({ csv: false, api: null });

/** replaces the static section body (inside <details data-fold="tools">) with the component */
export function mountTools(api: ToolsApi) {
  const host = document.querySelector('details[data-fold="tools"]'); if (!host) return;
  host.querySelectorAll(':scope > :not(summary)').forEach((n) => n.remove());
  mount(Tools, { target: host, props: { api } }); flushSync();
}
export function setTools(p: Partial<ToolsState>) { tools.update((s) => ({ ...s, ...p })); flushSync(); }
