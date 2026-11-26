const { contextBridge, ipcRenderer } = require('electron');

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

contextBridge.exposeInMainWorld('vcg', {
  platform: 'desktop',
  os: process.platform,
  capabilities: { vcg: true, api: true, csv: true, files: true, mt5: true },
  setSource: (src) => ipcRenderer.send('set-source', src),
  saveEA: () => ipcRenderer.invoke('save-ea'),
  fetchJSON: (url) => ipcRenderer.invoke('fetch-json', url),
  fetchText: (url) => ipcRenderer.invoke('fetch-text', url),
  onQuotes: (cb) => ipcRenderer.on('quotes', (_e, list) => cb(list)),
  onStatus: (cb) => ipcRenderer.on('status', (_e, s) => cb(s)),
  onChart: (cb) => ipcRenderer.on('chart', (_e, m) => cb(m)),
  onNet: (cb) => ipcRenderer.on('net', (_e, n) => cb(n)),
  signOut: () => ipcRenderer.invoke('sign-out'),
  onLogs: (cb) => ipcRenderer.on('logs', (_e, list) => cb(list)),
  requestChart: (o) => ipcRenderer.send('chart-request', o),
  pushChart: (d) => ipcRenderer.send('chart-data', d),
  pushAnalysis: (a) => ipcRenderer.send('analysis', a),
  onApiCmd: (cb) => ipcRenderer.on('api-cmd', (_e, c) => cb(c)),
  apiResult: (r) => ipcRenderer.send('api-cmd-result', r),
  claudeSetup: (o) => ipcRenderer.invoke('claude-setup', o),
  claudeStatus: () => ipcRenderer.invoke('claude-status'),
  mt5InstallEA: () => ipcRenderer.invoke('mt5-install-ea'),
  mt5EASource: () => ipcRenderer.invoke('mt5-ea-source'),
  mt5Launch: (o) => ipcRenderer.invoke('mt5-launch', o),
  openSite: (url) => ipcRenderer.invoke('open-site', url),
  onMt5Auto: (cb) => ipcRenderer.on('mt5-auto', (_e, m) => cb(m)),
  mt5AutoNow: () => ipcRenderer.invoke('mt5-auto-now'),
  mt5UpdateEA: () => ipcRenderer.invoke('mt5-update-ea'),
  mt5EAInfo: () => ipcRenderer.invoke('mt5-ea-info'),
  mt5OpenEditor: () => ipcRenderer.invoke('mt5-open-editor'),
  onEAUpdate: (cb) => ipcRenderer.on('ea-update', (_e, d) => cb(d)),
  journalGet: () => ipcRenderer.invoke('journal-get'),
  journalSync: () => ipcRenderer.invoke('journal-sync'),
  journalExport: (csv) => ipcRenderer.invoke('journal-export', csv),
  onJournal: (cb) => ipcRenderer.on('journal-changed', () => cb()),
  mt5Positions: (on) => ipcRenderer.invoke('mt5-positions', on),
  mt5Deals: (from, to) => ipcRenderer.invoke('mt5-deals', from, to),
  onPositions: (cb) => ipcRenderer.on('positions', (_e, p) => cb(p)),
  claudeDisable: () => ipcRenderer.invoke('claude-disable'),
  log: (level, msg, data, source = 'ui') => ipcRenderer.send('log', { level, msg, data, source }),
  notify: (event, payload, text) => ipcRenderer.invoke('notify', { event, payload, text }),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSettings: (s) => ipcRenderer.invoke('set-settings', s),
  openLogFile: () => ipcRenderer.send('open-log-file'),
  openLogFolder: () => ipcRenderer.send('open-log-folder'),
  addSymbol: (s) => ipcRenderer.send('add-symbol', s),
  removeSymbol: (s) => ipcRenderer.send('remove-symbol', s),
  setTray: (s) => ipcRenderer.send('set-tray', s),
  toggleCsv: () => ipcRenderer.send('toggle-csv'),
  openCsv: () => ipcRenderer.send('open-csv'),
  showTrader: () => ipcRenderer.send('show-trader'),
  reloadTrader: () => ipcRenderer.send('reload-trader'),
});
