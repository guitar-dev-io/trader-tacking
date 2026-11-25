// Runs in the hidden WebTrader window. Forwards chart messages posted by the injected
// helper (window.postMessage({__vcg: ...})) to the main process.
const { ipcRenderer } = require('electron');

window.addEventListener('message', (e) => {
  if (e.source !== window || !e.data || typeof e.data.__vcg !== 'string') return;
  ipcRenderer.send('chart-msg', { type: e.data.__vcg, data: e.data.d, slot: e.data.slot || 'main' });
});
