// ES-module entry of the renderer (runs after the classic legacy script, which Vite injects in index.html).
// New code lives under src/ as modules and is started from here; see docs/MIGRATION.md.
declare const __APP_VERSION__: string;
declare const __WEB__: boolean;

declare global {
  interface Window { __PT_BUILD__?: { version: string; web: boolean; dev: boolean } }
}

window.__PT_BUILD__ = { version: __APP_VERSION__, web: __WEB__, dev: import.meta.env.DEV };

export {};
