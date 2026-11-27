// Types for the chart drawing tools. The stored format (store key from drawingsKey()) is exactly these objects;
// old saved drawings ({type, p1, p2} or {type:'hline', price}) are upgraded by normalize() in draw.ts.

/** a point on the chart: time = UTC seconds (0 = "any time", e.g. a horizontal line), price */
export interface DPoint { time: number; price: number }

export type ToolKind =
  | 'cursor' | 'trend' | 'ray' | 'hline' | 'vline' | 'channel' | 'fib' | 'fibext' | 'rect' | 'brush'
  | 'long' | 'short' | 'text' | 'callout' | 'arrowUp' | 'arrowDown' | 'measure' | 'alert';
/** kinds that are stored as drawings (cursor / measure / alert are actions, not objects) */
export type DrawingKind = Exclude<ToolKind, 'cursor' | 'measure' | 'alert'>;

export type TextAlign = 'left' | 'center' | 'right';
/** style of a text / callout (all optional: missing = defaults in text-tools.ts) */
export interface TextStyle {
  size?: number;
  bold?: boolean;
  bg?: boolean;
  bgOp?: number;
  border?: boolean;
  align?: TextAlign;
}

export interface Drawing extends TextStyle {
  id: number;
  type: DrawingKind;
  pts: DPoint[];
  color?: string;
  /** caption shown on lines / boxes / fibs (double-click → "เพิ่มข้อความ") */
  label?: string;
  /** text and callout content (may contain line breaks) */
  text?: string;
  /** callout: box offset from the anchor point, in pixels */
  off?: { dx: number; dy: number };
  /** fib: draw levels from the start point (reverse) instead of the end */
  reverse?: boolean;
  /** long / short: take-profit as a multiple of the risk */
  rr?: number;
  /** drawn by Claude (cleared by clear_drawings) */
  claude?: boolean;
  [extra: string]: unknown;
}

/** an old-format drawing as it may still be in a user's store */
export interface LegacyDrawing { type: string; price?: number; p1?: DPoint; p2?: DPoint; color?: string }

export interface ToolDef { icon: string; name: string; /** points to click (-1 = free-hand) */ n: number; key?: string }
