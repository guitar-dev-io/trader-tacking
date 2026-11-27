// Late-bound hooks between chart modules. Modules evaluate in the old script order; a module loaded EARLY that
// needs a function owned by a module loaded LATER calls it through here (the later module registers it).
// Typed, internal replacement for the old window.PT lookups.
import type { Drawing } from './types';

export interface ChartHooks {
  /** draw.ts: re-apply the user's chart settings (grid…) after a theme change */
  applyChartCfg?: () => void;
  /** draw.ts: redraw the SVG overlay now */
  redraw?: () => void;
  /** draw.ts: switch the active drawing tool */
  setTool?: (t: string) => void;
  /** draw.ts: push an undo snapshot */
  pushHistory?: () => void;
  /** draw.ts: refresh the layers panel */
  renderLayers?: () => void;
  /** draw.ts: time → x pixel (incl. future bars) */
  xOfT?: (t: number) => number | null;
  /** draw.ts: a drawing's ink colour adapted to the theme */
  inkColor?: (c: string | undefined) => string;
  /** draw.ts: select a drawing */
  select?: (d: Drawing | null) => void;
}
export const chartHooks: ChartHooks = {};
