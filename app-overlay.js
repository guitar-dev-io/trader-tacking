// Moved: overlay helpers → src/ui/overlay.ts, analysis drawing → src/chart/analysis-overlay.ts.
// This file only re-exports them for modules that still import './app-overlay.js'.
export { NS, svg, period, timeToLogical, logicalToTime, lToX, xOf, xIdx, yOf, el, txt, resetLabels, ltxt, label } from './src/ui/overlay.ts';
export { drawAnalysis, positionBox } from './src/chart/analysis-overlay.ts';
