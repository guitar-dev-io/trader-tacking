// Page objects (Phase 3). Modules loaded EARLIER than a page (mobile.js, setup.js, extras.js, …) used to reach it
// through window.PT; now every page registers its small API here and callers read it at call time.
// The registry is a leaf module, so anyone can import it without changing evaluation order.
export interface PageApi {
  open: (...args: any[]) => void;
  close: () => void;
  isOpen: () => boolean;
  [extra: string]: any;
}
export const pages: { news?: PageApi; learn?: PageApi; dash?: PageApi; journal?: PageApi } = {};
