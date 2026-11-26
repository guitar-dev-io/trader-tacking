// Phase 2 guard: every app module may only use its own/imported names, PT, and browser/vendor globals.
import traverseMod from '@babel/traverse';
import { parseFile } from './scan.mjs';
import { ORDER } from './order.mjs';
const traverse = traverseMod.default || traverseMod;
const OK = new Set(['window', 'document', 'globalThis', 'console', 'localStorage', 'sessionStorage', 'navigator', 'location', 'history', 'performance',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'queueMicrotask', 'fetch', 'URL', 'URLSearchParams',
  'Blob', 'File', 'FileReader', 'Image', 'XMLSerializer', 'DOMParser', 'MutationObserver', 'ResizeObserver', 'IntersectionObserver', 'CustomEvent', 'Event', 'KeyboardEvent',
  'Notification', 'AudioContext', 'indexedDB', 'matchMedia', 'getComputedStyle', 'innerWidth', 'innerHeight', 'confirm', 'alert', 'devicePixelRatio', 'screen',
  'HTMLElement', 'Element', 'Node', 'SVGElement', 'TextEncoder', 'TextDecoder', 'crypto', 'atob', 'btoa', 'structuredClone', 'caches', 'self', 'module',
  'Math', 'JSON', 'Date', 'Number', 'String', 'Boolean', 'Object', 'Array', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Promise', 'Symbol', 'Error', 'TypeError', 'RangeError',
  'RegExp', 'Intl', 'Infinity', 'NaN', 'undefined', 'isFinite', 'isNaN', 'parseFloat', 'parseInt', 'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'Proxy', 'Reflect',
  'Float64Array', 'Uint8Array', 'Int32Array', 'ArrayBuffer', 'DataView', 'BigInt', 'arguments', 'eval', 'Function', 'AbortController', 'WebSocket', 'MessageChannel', 'Worker',
  'vcg', 'LightweightCharts', 'Capacitor', 'APP_VERSION', 'PT']);
let bad = 0;
for (const f of ORDER) {
  const { ast } = parseFile(f);
  const seen = new Set();
  traverse(ast, { Identifier(p) {
    if (!p.isReferencedIdentifier()) return;
    const n = p.node.name; if (OK.has(n) || p.scope.hasBinding(n, { noGlobals: true }) || seen.has(n)) return;
    seen.add(n); bad++; console.log(`${f}:${p.node.loc.start.line} unknown global ${n}`);
  } });
}
if (bad) process.exitCode = 1; else console.log('ok: no stray globals in', ORDER.length, 'modules');
