// Types for the legacy (still .js) app modules that TypeScript/Svelte code imports. Loose on purpose: these are
// replaced in Phase 4; until then only the names are checked, not their shapes.
declare module '*/news.js' { export const HEADLINES: any; }
declare module '*/extras.js' { export const NEWS: any; export const DEMO: any; export const CACHE: any; export const setSource: (src: string) => void; }
declare module '*/pages.js' { export const PAGES: any; }
declare module '*/app-core.js' {
  export const $: (id: string) => any; export const esc: (s: unknown) => string; export const fmt: (v: number, d?: number) => string;
  export const S: Record<string, any>; export const store: { get<T = any>(k: string, d?: T): T; set(k: string, v: unknown): void };
  export const TFS: { label: string; type: number; sec: number }[]; export const THEME: any; export const TC: () => any;
  export const TZ: number; export const zoneOffsetSec: (tz: string, date?: Date) => number; export const FIB: number[]; export const FIBX: number[]; export const FIB_DEF: number[]; export const FIBX_DEF: number[]; export const FIB_REVERSE: boolean; export const FIB_PRESETS: Record<string, number[]>; export const FIB_PRESET_REVERSE: Record<string, boolean>; export const fibColor: (lv: number) => string;
  export const setFib: (v: number[]) => void; export const setFibX: (v: number[]) => void; export const setFibReverse: (v: boolean) => void; export const setCandleColors: (up: string, down: string) => void; export const setTZ: (v: number) => void; export const UP: string; export const DOWN: string; export const drawings: import('../chart/types').Drawing[]; export const saveDrawings: () => void; export const drawingsKey: () => string; export const createChart: any; export const LineSeries: any; export const AreaSeries: any; export const BarSeries: any; export const IND_COLORS: string[];
  export const HistogramSeries: any; export const CandlestickSeries: any; export const LineStyle: any; export const CrosshairMode: any; export const digits: () => number; export const tf: () => { label: string; type: number; sec: number };
}
declare module '*/app-data.js' { export const switchSymbol: (s: string) => void; export const loadChart: (...a: any[]) => any; export const dedupe: any; export const renderAlerts: any; export const toCandle: any; export const valid: any; export const connStatus: any; export const onQuotesMsg: (list: any[]) => void; export const onQuotes: (fn: (list: any[]) => void) => void; export const addAlert: (price: number) => void; }
declare module '*/positions.js' { export const POSITIONS: any; }
declare module '*/lessons.js' { export const LESSONS: any; }
declare module '*/lessons-guide.js' { export const LESSON_CATS: any; export const LESSONS_EXTRA: any; export const LESSON_CAT_OF: any; }
declare module '*/learn.js' { export const QUIZ: any; export const SIM: any; export const LESSON: any; export const REPLAY: any; }
declare module '*/mm-learn.js' { export const MM_LEARN: any; }
declare module '*/app.js' { export const renderLessons: any; export const renderTfs: () => void; }
declare module '*/app-analysis.js' { export const runAnalysis: (...a: any[]) => any; export const activeSignal: () => any; }
declare module '*/app-bounce.js' { export const drawAutoFib: (W: number) => void; export const drawBounce: (W: number) => void; export const drawLiquidity: (W: number) => void; }

// the chart library is a classic <script> (src/legacy-order.mjs → VENDOR_SCRIPTS)
declare const LightweightCharts: any;
