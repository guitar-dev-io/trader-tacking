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

// Mount a page's component off the startup path: on the first idle moment, or earlier when the page is
// first used (call the returned function before touching the page's DOM). Keeps time-to-chart unchanged.
export function lazyMount(mountFn: () => void): () => void {
  let done = false;
  const run = () => { if (!done) { done = true; mountFn(); } };
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(run, { timeout: 2000 });
  else setTimeout(run, 200);
  return run;
}
