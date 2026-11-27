// UI singletons that modules loaded EARLIER need to reach (Phase 4): the settings window, the setup guide,
// the mobile sheet, the panel layout. Each registers itself here when its module runs; callers read the field
// at call time. A leaf module, so importing it never changes evaluation order (replaces PT.SETUP & co.).
export interface SettingsApi { open: (section?: string) => Promise<void> | void; show: (k: string) => void; close: () => void; eaInfo: () => Promise<void> }
export interface SetupApi { open: (path?: string, step?: number) => void; close: (done?: boolean) => void; isOpen: () => boolean; [k: string]: any }
export const ui: {
  settings?: SettingsApi;
  setup?: SetupApi;
  msheet?: { open: (...a: any[]) => void; close: () => void; isOpen: () => boolean };
  setUI?: (k: string, v: boolean) => void;
  srcPill?: { render: () => void; info: () => { cls: string; t: string; hint: string }; menu: () => void };
  /** calculator tab (planner.js): also the lot size shown on long/short tools, "open in calculator" and its plan lines */
  planner?: { save: () => void; render: () => void; lot?: (entry: number, sl: number) => number | string | null; from?: (d: any) => void; draw?: (W: number, H: number) => void };
  /** multi-timeframe view (src/chart/mtf.ts) */
  mtf?: { drawOnMain: (W: number) => void; onMsg: (m: any) => void; replaySync: () => void; activeType: () => number | null; [k: string]: any };
  /** practice tab: trade simulator (learn.js) */
  sim?: { prefill: (t: any) => void; [k: string]: any };
  /** bar replay (learn.js) */
  replay?: { exit: () => void; [k: string]: any };
  /** news/calendar (extras.js NEWS) and headlines (news.js) */
  news?: { render: () => void; [k: string]: any };
  headlines?: { render: () => void; [k: string]: any };
  /** demo data source + chart cache + source switch (extras.js) */
  demo?: { requestChart: (req: any, handler?: (m: any) => void) => unknown; connect: () => void; [k: string]: any };
  cache?: { restore: () => void; save: () => void; [k: string]: any };
  setSource?: (src: string) => void;
} = {};
