// Late-bound hooks between chart modules. Modules evaluate in the old script order; a module loaded EARLY that
// needs a function owned by a module loaded LATER calls it through here (the later module registers it).
// Typed, internal replacement for the old window.PT lookups.
import type { DPoint, Drawing } from './types';

export interface ChartHooks {
  /** draw.ts: re-apply the user's chart settings (grid…) after a theme change */
  applyChartCfg?: () => void;
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
  inkColor: (c: string | undefined) => string;
  /** draw.ts: new drawing id */
  uid: () => number;
  /** draw.ts: handle points (pixels) of a drawing */
  handles: (d: Drawing) => { x: number; y: number }[];
  /** draw.ts: long/short levels */
  posLevels?: (d: Drawing) => { entry: number; sl: number; tp: number } | null;
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
