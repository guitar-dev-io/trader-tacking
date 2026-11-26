// Classic (non-module) scripts the renderer still loads with a plain <script> tag, before the ES modules.
// Only third-party code that defines its own global stays here; all app code is ES modules (src/app.ts imports
// them in the old order — see docs/MIGRATION.md, Phase 2).
export const VENDOR_SCRIPTS = ['lib/lightweight-charts.standalone.production.js'];
// Only in the web/Android build (www/): Capacitor core + version.js are added by the plugin before these.
export const WEB_ONLY_SCRIPTS = [];
