// Late-bound hooks between chart modules. Modules evaluate in the old script order; a module loaded EARLY that
// needs a function owned by a module loaded LATER calls it through here (the later module registers it).
// Typed, internal replacement for the old window.PT lookups.
import type { DPoint, Drawing } from './types';

export interface ChartHooks {
  /** draw.ts: re-apply the user's chart settings (grid…) after a theme change */
  applyChartCfg?: () => void;
  /** draw.ts: load the drawings of the (new) symbol from the store, clearing undo/redo */
  reloadDrawings?: () => void;
  /** draw.ts: redraw the SVG overlay now */
  redraw?: () => void;
  /** draw.ts: switch the active drawing tool */
  setTool: (t: string) => void;
  /** draw.ts: push an undo snapshot */
  pushHistory: () => void;
  /** draw.ts: refresh the layers panel */
  renderLayers: () => void;
  /** draw.ts: time → x pixel (incl. future bars) */
  xOfT: (t: number) => number | null;
  /** draw.ts: a drawing's ink colour adapted to the theme */
  inkColor: (c?: string) => string;
  /** draw.ts: new drawing id */
  uid: () => number;
  /** draw.ts: handle points (pixels) of a drawing */
  handles: (d: Drawing) => { x: number; y: number; k: number }[];
  /** draw.ts: long/short levels */
  posLevels?: (d: Drawing) => { e: number; sl: number; tp: number; rr: number } | null;
  /** draw.ts: chart point under a pixel */
  pointAt: (x: number, y: number, magnet?: boolean) => DPoint | null;
  /** draw.ts: pointer event → chart pixels */
  mousePos: (e: MouseEvent | PointerEvent) => { x: number; y: number };
  /** draw.ts: index of the drawing under a pixel */
  hitTest: (x: number, y: number) => number | null;
}
const missing = (n: string) => () => { throw new Error(`chart hook ${n} used before draw.ts registered it`); };
export const chartHooks: ChartHooks = {
  uid: missing('uid'), handles: missing('handles'), pointAt: missing('pointAt'), mousePos: missing('mousePos'), hitTest: missing('hitTest'),
  setTool: missing('setTool'), pushHistory: missing('pushHistory'), renderLayers: missing('renderLayers'), xOfT: missing('xOfT'), inkColor: missing('inkColor'),
};

// ------------------------------------------------------------ chart load events (Phase 5a)
// app-data's loadChart() emits 'load' when it (re)requests the main chart (symbol / timeframe / source / timezone
// change) and 'loaded' when the history has arrived and is on screen. Replaces wrapping PT.loadChart (mtf) and
// the PT.onChartLoaded callback (draw: apply a pending range like 1D / 5D).
export type ChartEvent = 'load' | 'loaded';
const chartListeners: Record<ChartEvent, (() => void)[]> = { load: [], loaded: [] };
export function onChartEvent(ev: ChartEvent, cb: () => void): void { chartListeners[ev].push(cb); }
export function emitChart(ev: ChartEvent): void {
  for (const cb of chartListeners[ev]) { try { cb(); } catch (e: any) { console.error(`chart ${ev} listener`, e); } }
}

