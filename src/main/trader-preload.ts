// Runs in the hidden WebTrader window. Forwards chart messages posted by the injected
// helper (window.postMessage({__vcg: ...})) to the main process.
import { ipcRenderer } from 'electron';
import type { TraderMsg } from './ipc';

window.addEventListener('message', (e: MessageEvent<{ __vcg?: unknown; d?: unknown; slot?: string }>) => {
  if (e.source !== window || !e.data || typeof e.data.__vcg !== 'string') return;
  const m: TraderMsg = { type: e.data.__vcg, data: e.data.d, slot: e.data.slot || 'main' };
  ipcRenderer.send('chart-msg', m);
});
