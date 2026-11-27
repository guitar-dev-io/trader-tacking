// window.PT — a typed bridge for tests (tests/ui/run.js) and devtools ONLY: they read and drive app state
// through it (PT.S, PT.PAGES.open(), …). App code never reads PT; a module that must reach one evaluated LATER
// uses the registries (src/ui/registry.ts, src/pages/registry.ts) or src/chart/hooks.ts.
// Modules expose names with def(); a setter is given only where tests assign (drawings, FIB, dirty, BUILD).
type Getter = () => unknown;
type Setter = (v: unknown) => void;

export const PT: Record<string, any> = Object.create(null);

export function def(names: Record<string, [Getter, Setter?]>): void {
  for (const [k, [get, set]] of Object.entries(names)) {
    Object.defineProperty(PT, k, { get, set: set ?? (() => { throw new TypeError(`PT.${k} is read-only`); }), enumerable: true, configurable: true });
  }
}

declare global { interface Window { PT: typeof PT } }
window.PT = PT;
