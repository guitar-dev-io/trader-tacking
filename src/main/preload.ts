// Main window preload: exposes window.vcg to the renderer. Every call goes through the typed IPC map (./ipc.ts),
// so a wrong channel name or payload is a compile error here and in main.ts.
// Runs sandboxed: this file is bundled into one script (gen/main/preload.js) and only imports 'electron'.
import { contextBridge, ipcRenderer } from 'electron';
import type { InvokeArgs, InvokeChannel, InvokeResult, PushMap, SendMap } from './ipc';
import type { LogLevel, SettingsPatch, ChartRequest, ApiCmdResult } from './types';

const invoke = <K extends InvokeChannel>(ch: K, ...args: InvokeArgs<K>): Promise<InvokeResult<K>> => ipcRenderer.invoke(ch, ...args) as Promise<InvokeResult<K>>;
const send = <K extends keyof SendMap>(ch: K, ...args: SendMap[K]): void => ipcRenderer.send(ch, ...args);
const on = <K extends keyof PushMap>(ch: K, cb: (d: PushMap[K]) => void): void => { ipcRenderer.on(ch, (_e, d: PushMap[K]) => cb(d)); };

// OS class on <html> (os-darwin / os-win32) + Windows title bar: no traffic lights on the left,
// window buttons (titleBarOverlay) on the right.
window.addEventListener('DOMContentLoaded', () => {
  document.documentElement.classList.add('os-' + process.platform);
  if (process.platform !== 'darwin') {
    const st = document.createElement('style');
    st.textContent = '#titlebar{padding:0 150px 0 14px !important}';
    document.head.appendChild(st);
  }
});

const api = {
  platform: 'desktop' as const,
  os: process.platform,
  capabilities: { vcg: true, api: true, csv: true, files: true, mt5: true },
  setSource: (src: string) => send('set-source', src),
  saveEA: () => invoke('save-ea'),
  fetchJSON: (url: string) => invoke('fetch-json', url),
  fetchText: (url: string) => invoke('fetch-text', url),
  onQuotes: (cb: (d: PushMap['quotes']) => void) => on('quotes', cb),
  onStatus: (cb: (d: PushMap['status']) => void) => on('status', cb),
  onChart: (cb: (d: PushMap['chart']) => void) => on('chart', cb),
  onNet: (cb: (d: PushMap['net']) => void) => on('net', cb),
  signOut: () => invoke('sign-out'),
  onLogs: (cb: (d: PushMap['logs']) => void) => on('logs', cb),
  requestChart: (o: ChartRequest) => send('chart-request', o),
  pushChart: (d: unknown) => send('chart-data', d),
  pushAnalysis: (a: unknown) => send('analysis', a),
  onApiCmd: (cb: (d: PushMap['api-cmd']) => void) => on('api-cmd', cb),
  apiResult: (r: ApiCmdResult) => send('api-cmd-result', r),
  claudeSetup: (o?: InvokeArgs<'claude-setup'>[0]) => invoke('claude-setup', o),
  claudeStatus: () => invoke('claude-status'),
  mt5InstallEA: () => invoke('mt5-install-ea'),
  mt5EASource: () => invoke('mt5-ea-source'),
  mt5Launch: (o?: InvokeArgs<'mt5-launch'>[0]) => invoke('mt5-launch', o),
  openSite: (url: string) => invoke('open-site', url),
  onMt5Auto: (cb: (d: PushMap['mt5-auto']) => void) => on('mt5-auto', cb),
  mt5AutoNow: () => invoke('mt5-auto-now'),
  mt5UpdateEA: () => invoke('mt5-update-ea'),
  mt5EAInfo: () => invoke('mt5-ea-info'),
  mt5OpenEditor: () => invoke('mt5-open-editor'),
  onEAUpdate: (cb: (d: PushMap['ea-update']) => void) => on('ea-update', cb),
  journalGet: () => invoke('journal-get'),
  journalSync: () => invoke('journal-sync'),
  journalExport: (csv: string) => invoke('journal-export', csv),
  onJournal: (cb: () => void) => on('journal-changed', () => cb()),
  mt5Positions: (on_: boolean) => invoke('mt5-positions', on_),
  mt5Deals: (from: number, to?: number) => invoke('mt5-deals', from, to),
  onPositions: (cb: (d: PushMap['positions']) => void) => on('positions', cb),
  claudeDisable: () => invoke('claude-disable'),
  log: (level: LogLevel, msg: string, data?: unknown, source = 'ui') => send('log', { level, msg, data, source }),
  notify: (event: string, payload: unknown, text: string) => invoke('notify', { event, payload, text }),
  getSettings: () => invoke('get-settings'),
  setSettings: (s: SettingsPatch) => invoke('set-settings', s),
  openLogFile: () => send('open-log-file'),
  openLogFolder: () => send('open-log-folder'),
  addSymbol: (s: string) => send('add-symbol', s),
  removeSymbol: (s: string) => send('remove-symbol', s),
  setTray: (s: string) => send('set-tray', s),
  toggleCsv: () => send('toggle-csv'),
  openCsv: () => send('open-csv'),
  showTrader: () => send('show-trader'),
  reloadTrader: () => send('reload-trader'),
};

/** The type of `window.vcg` on the desktop app (the renderer can `import type { VcgDesktopApi }`). */
export type VcgDesktopApi = typeof api;

contextBridge.exposeInMainWorld('vcg', api);
