// Types for the legacy (still .js) app modules that TypeScript/Svelte code imports. Loose on purpose: these are
// replaced in Phase 4; until then only the names are checked, not their shapes.
declare module '*/news.js' { export const HEADLINES: any; }
declare module '*/extras.js' { export const NEWS: any; export const DEMO: any; export const CACHE: any; export const setSource: (src: string) => void; }
declare module '*/pages.js' { export const PAGES: any; }
declare module '*/app-core.js' {
  export const $: (id: string) => any; export const esc: (s: unknown) => string; export const fmt: (v: number, d?: number) => string;
  export const S: Record<string, any>; export const store: { get<T = any>(k: string, d?: T): T; set(k: string, v: unknown): void };
  export const TFS: { label: string; type: number; sec: number }[]; export const THEME: any; export const TC: () => any;
  export const TZ: number; export const zoneOffsetSec: (tz: string) => number; export const UP: string; export const DOWN: string; export const drawings: any[]; export const createChart: any; export const LineSeries: any; export const AreaSeries: any; export const BarSeries: any; export const IND_COLORS: string[];
  export const HistogramSeries: any; export const CandlestickSeries: any; export const LineStyle: any; export const CrosshairMode: any; export const digits: () => number; export const tf: () => { label: string; type: number; sec: number };
}
declare module '*/app-chart.js' { export const chart: any; export const main: any; export const customOut: Map<string, unknown>; export const chartThemeOptions: (...a: any[]) => any; export const applyChartTheme: (...a: any[]) => void; }
declare module '*/app-data.js' { export const switchSymbol: (s: string) => void; export const loadChart: (...a: any[]) => any; export const dedupe: any; export const renderAlerts: any; export const toCandle: any; export const valid: any; export const connStatus: any; export const onQuotesMsg: (list: any[]) => void; }
declare module '*/positions.js' { export const POSITIONS: any; }
declare module '*/lessons.js' { export const LESSONS: any; }
declare module '*/lessons-guide.js' { export const LESSON_CATS: any; export const LESSONS_EXTRA: any; export const LESSON_CAT_OF: any; }
declare module '*/learn.js' { export const QUIZ: any; export const SIM: any; export const LESSON: any; export const REPLAY: any; }
declare module '*/mm-learn.js' { export const MM_LEARN: any; }
declare module '*/app.js' { export const renderLessons: any; }
declare module '*/app-analysis.js' { export const runAnalysis: (...a: any[]) => any; export const activeSignal: () => any; }
declare module '*/app-bounce.js' { export const drawAutoFib: (W: number) => void; export const drawBounce: (W: number) => void; export const drawLiquidity: (W: number) => void; }
declare module '*/draw.js' { export const xOfT: (t: number) => number | null; export const DEFAULT_SESSIONS: any[]; export const SESSIONS_ALL: any[]; export const ZONES: [string, string][]; export const _sessionWindow: (x: any, y: number, m: number, d: number) => [number, number]; export const setSessions: (s: any[]) => void; }

// the chart library is a classic <script> (src/legacy-order.mjs → VENDOR_SCRIPTS)
declare const LightweightCharts: any;
