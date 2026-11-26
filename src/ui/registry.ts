// UI singletons that modules loaded EARLIER need to reach (Phase 4): the settings window, the setup guide,
// the mobile sheet, the panel layout. Each registers itself here when its module runs; callers read the field
// at call time. A leaf module, so importing it never changes evaluation order (replaces PT.SETUP & co.).
export interface SettingsApi { open: (section?: string) => Promise<void> | void; show: (k: string) => void; close: () => void; eaInfo: () => Promise<void> }
export interface SetupApi { open: (path?: string, step?: number) => void; close: (done?: boolean) => void; isOpen: () => boolean; [k: string]: any }
export const ui: {
  settings?: SettingsApi;
  setup?: SetupApi;
  msheet?: { open: (...a: any[]) => void; close: () => void; [k: string]: any };
  setUI?: (k: string, v: boolean) => void;
  srcPill?: { render: () => void; info: () => { cls: string; t: string; hint: string }; menu: () => void };
} = {};
