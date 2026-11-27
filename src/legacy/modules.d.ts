// Types for the legacy (still .js) app modules that TypeScript/Svelte code imports. Loose on purpose: these are
// replaced in Phase 4; until then only the names are checked, not their shapes.

// the chart library is a classic <script> (src/legacy-order.mjs → VENDOR_SCRIPTS)
declare const LightweightCharts: any;
