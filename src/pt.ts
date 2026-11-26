// window.PT — the ONE deliberate bridge between the renderer modules and the outside:
//  • tests (tests/ui/run.js) and devtools read/drive app state through it (PT.S, PT.PAGES.open(), …)
//  • modules that must reach a module loaded LATER (evaluation order is the old script order) go through it
//    instead of an import, so imports never reorder evaluation — see docs/MIGRATION.md (Phase 2)
// Every module registers its top-level names with def(); let/var/function names get a setter too, so another
// module can replace them (e.g. mtf.js wraps loadChart) and every importer sees the new value (live bindings).
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
