// Types for the legacy (still .js) app modules that TypeScript/Svelte code imports. Loose on purpose: these are
// replaced in Phase 4; until then only the names are checked, not their shapes.
declare module '*/news.js' { export const HEADLINES: any; }
declare module '*/extras.js' { export const NEWS: any; export const DEMO: any; export const CACHE: any; export const setSource: (src: string) => void; }
declare module '*/pages.js' { export const PAGES: any; }
declare module '*/app-core.js' {
  export const $: (id: string) => any; export const esc: (s: unknown) => string; export const fmt: (v: number, d?: number) => string;
  export const S: Record<string, any>; export const store: { get<T = any>(k: string, d?: T): T; set(k: string, v: unknown): void };
  export const TFS: { label: string; type: number; sec: number }[]; export const THEME: any; export const TC: () => any;
  export const TZ: number; export const drawings: any[]; export const createChart: any; export const LineSeries: any; export const AreaSeries: any;
  export const HistogramSeries: any; export const CandlestickSeries: any; export const LineStyle: any; export const CrosshairMode: any; export const digits: () => number;
}
declare module '*/app-chart.js' { export const chart: any; export const chartThemeOptions: (...a: any[]) => any; export const applyChartTheme: (...a: any[]) => void; }
declare module '*/app-data.js' { export const switchSymbol: (s: string) => void; export const dedupe: any; export const renderAlerts: any; export const toCandle: any; export const valid: any; export const connStatus: any; }
declare module '*/setup.js' { export const SETUP: any; }
declare module '*/positions.js' { export const POSITIONS: any; }
declare module '*/lessons.js' { export const LESSONS: any; }
declare module '*/lessons-guide.js' { export const LESSON_CATS: any; export const LESSONS_EXTRA: any; export const LESSON_CAT_OF: any; }
declare module '*/learn.js' { export const QUIZ: any; export const SIM: any; export const LESSON: any; export const REPLAY: any; }
declare module '*/mm-learn.js' { export const MM_LEARN: any; }
declare module '*/app.js' { export const renderLessons: any; }
