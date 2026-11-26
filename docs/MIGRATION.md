# Framework migration (Svelte 5 + Vite + TypeScript)

Branch: `feat/framework-migration`. The plan has 5 phases: 0 Vite, 1 TypeScript core, 2 no globals, 3 Svelte pages,
4 the rest + main process. Every phase must keep the UI identical and all tests green.

## Done

### Phase 0: Vite builds the renderer
- **What builds what:** `vite.config.mjs` builds `index.html` into two outputs.
  - `vite build --mode desktop` → `dist-renderer/`. Electron loads this, with the CSP kept.
  - `vite build --mode web` → `www/`. This is for Android/Capacitor and the installable web app (manifest, `sw.js`, `capacitor.js`, `version.js`).
  - Both use `base: './'`, and both build steps run through the same plugin.
- **Script order:** the old `<script>` list in `index.html` and the file list in `scripts/build-www.js` are replaced by one ordered list, `src/legacy-order.mjs`.
  - `vite/legacy-plugin.mjs` emits every legacy file as its own content-hashed **classic** script, in that order.
  - It also copies `assets/`, the chart-library licence and the icon.
  - New code is an ES module loaded from `src/main.ts`.
- **Why classic scripts and not `import`:**
  - The ~40 legacy files share one global lexical scope (`S`, `main`, `store`, `toast`, …). ES modules each get their own scope, so importing them would break every cross-file reference. Fixing that needs a codemod over hundreds of shared bindings in files the app branch is still editing.
  - Concatenating them into one script was tried and rejected, because it is not equivalent to separate scripts. `typeof CACHE !== 'undefined'` in `app-data.js` runs before `extras.js` declares `const CACHE`. As separate scripts it is false; in one script it throws a temporal-dead-zone error, and the app did not boot.
  - Separate scripts keep the old behaviour exactly.
  - The plugin still parses all the files together at build time. A duplicate top-level name across two files now fails the build. Before, it only crashed one file at runtime (this happened twice).
- **Electron:** `main.js` loads `dist-renderer/index.html`, or `VITE_DEV_SERVER_URL` when you run `npm run dev`.
- **Packaging:** the electron-packager ignore list and the electron-builder `files` list now include `dist-renderer/` and `gen/` and exclude `src/`, `vite/` and the config files.
- **CI:**
  - `npm run typecheck` runs in the test job, and all builds go through Vite.
  - On this branch the **site publish and the GitHub Release are skipped**, because a pre-release from here would become the newest download on the public page. Builds are available as workflow artifacts.

### Phase 1: TypeScript for the pure computation code
- **Converted modules:** `src/core/analysis.ts`, `bounce.ts`, `mm.ts`, `journal.ts`, `ea-version.ts` (the EA update decision, compile-log parsing), `mt5-protocol.ts` (EA message types, `parseEAMessage`, `isReadOnlyCommand`) and `types.ts`.
  - They have real types (`Candle`, `Pivot`, `Swing`, `Zone`, `Signal`, `BounceZone`, `Deal`, `Trade`, `Metrics`, `Plan`, …).
  - `tsconfig.json` is `strict`.
- **Build:** `scripts/build-core.mjs` compiles them with esbuild to `gen/*.js`, which is gitignored and built automatically by Vite builds, `npm test` and `npm start`.
  - Shared modules become an IIFE that sets the same global as before (`AN`, `BOUNCE`, `MM`, `JOURNAL`) and `module.exports`.
  - Node-only modules become CommonJS.
- **Compatibility:** the root `analysis.js`, `bounce.js`, `mm.js` and `journal.js` are now one-line Node wrappers (`require('./gen/…')`), so `main.js`, `journal-store.js` and the unit tests did not change. The renderer loads `gen/*.js` directly. `ea-update.js` uses `gen/ea-version.js`.


### Phase 2: no shared globals (ES modules)
- **What changed:** every app file at the repo root is an ES module now, and `src/app.ts` imports them in the old `<script>` order.
  - The only classic script left is the vendor chart library (`src/legacy-order.mjs` → `VENDOR_SCRIPTS`).
  - Vite bundles the app into one module chunk.
- **Rule that keeps behaviour identical:** a module only `import`s from modules **earlier** in that order. ES modules evaluate their imports first, so an import of a later file would reorder evaluation. Two cases go through **`window.PT`** instead (`src/pt.ts`):
  - a name from a **later** module (late-bound, read at call time), e.g. `PT.MTF`, `PT.DASH`, `PT.LEARN`, `PT.setUI`;
  - an **assignment** to another module's binding, e.g. `PT.setTool = wrapper` in mobile.js, `PT.loadChart = …` in mtf.js.
- **How PT works:** every module registers its top-level names with `def()`. Getters are live; `let`/`var`/`function` names also get a setter that writes the owner's binding, so every importer sees the new value.
- **`window.PT` is also the one bridge for the outside.** The UI tests call `PT.SETUP.open()`, `PT.S.source`, `PT.main.priceLines()`, and devtools can use it the same way.
  - The tests' renderer code was rewritten by `scripts/codemod/tests-to-pt.mjs`.
  - A UI test asserts that `window` gains only `PT`, `vcg`, `LightweightCharts` and `Capacitor`.
- **Moved into real modules:**
  - `AN`/`BOUNCE`/`MM`/`JOURNAL` are imported straight from `src/core/*.ts` (`src/legacy/core.ts`).
  - The VCG page scripts are an ES module (`src/vcg-inject.mjs`). It is compiled to `gen/vcg-inject.js` for Electron main and the Node tests; the root `vcg-inject.js` is a 2-line wrapper.
  - `ICON`, `IND`, `CUSTOM`, `LESSONS*` and `MM_LEARN` are real exports (they were `window.X`).
  - `toast()` is `src/ui/toast.ts`.
  - The redraw flag is `view.dirty` in `src/state.ts`.
- **Guard:** `npm run typecheck` also runs `scripts/codemod/check-free.mjs`, which fails if an app module uses a name that is not its own, imported, `PT`, or a browser/vendor global. This is the Phase 2 version of the old "duplicate global" crash.
- **How it was done:** codemods with Babel scope analysis, `scripts/codemod/to-modules.mjs` and `tests-to-pt.mjs`. They ran once on classic scripts and will not run again on modules. They are kept to show exactly what was mechanical.
- **Measured:**
  - unit 41/41, UI 106/106 (105 + the globals check), `tsc` strict + stray-global guard clean;
  - screenshots match Phase 1 except time-dependent content and the v2.16.0 settings toggles from the rebase;
  - **startup got faster**: about 270 ms vs about 450 ms to a drawn chart (one bundled module instead of ~40 scripts).

## Phase 2 — what is still interim (hand-off)
- **Late-bound names through PT inside the app:** about 55 names, used about 280 times; run `grep -o "PT\.[A-Za-z_$]*" *.js`. The most used are `setUI`, `MTF`, `LEARN`, `DASH`, `yOf`, `NEWSPAGE`, `__mobileBack` and `drawings`. They exist because files call "forward" into modules loaded later.
  - In Phase 3/4, untangle them by moving each shared piece into a small module that both sides import: app state from `app-core.js` → `src/state.ts`; overlay helpers (`yOf`, `xIdx`, `el`, `ltxt`) → `src/ui/overlay.ts`; page objects registered in `src/pages.ts`.
  - When a name no longer needs PT, `def()` can stay; it is only for tests and devtools.
- **App modules are still `.js`:** the root `*.js` modules are not type-checked yet; only `src/**/*.ts` is. Convert them as you rewrite pages (Phase 3) or move them (Phase 4).
- **`app-core.js` is the state module for now:** it holds `S`, `store`, `TC`/`THEME`, `settings cache` and friends. Splitting it into `src/state.ts` and `src/ui/theme.ts` is part of untangling the late-bound names.
- **`def()` lines are long and generated.** They are fine to delete per module once nothing outside uses that name.

## Rebasing app-branch changes onto this branch (important)
- Every renderer file on `feat/price-tracker-app` is a classic script; here it is a module. A change there can no longer be cherry-picked as is.
- To port a change:
  1. Apply the edit by hand to the same function here.
  2. For any NEW cross-file name, `import` it if its owner is earlier in `src/app.ts`; otherwise use `PT.name`.
  3. A NEW file gets `import { PT, def } from './src/pt.ts'` and a line in `src/app.ts` (plus `scripts/codemod/order.mjs`).
- `npm run typecheck` tells you if you missed a name.
- Better: freeze renderer feature work on the app branch, or merge this branch soon.

## How to run
| | |
|---|---|
| `npm run dev` | Vite dev server + Electron (reload on save; `src/core` changes rebuild `gen/`) |
| `npm start` | build the renderer, then Electron |
| `npm run build:renderer` / `npm run build:www` | desktop / web+Android renderer |
| `npm run build:core` | TypeScript core → `gen/` |
| `npm run typecheck` | `tsc` (strict) over `src/**/*.ts` |
| `npm test` | unit tests (builds `gen/` first) |
| `npm run test:ui` | builds both renderers, then the Electron UI suite |
| `npm run build:mac` / `npm run build:win` | packages (build the renderer first automatically) |

## Verified
- (Phase 1) Unit tests: 37/37 (34 old + 3 for the new TS helpers). UI suite: 104/104. `tsc` strict: clean.
- Screens look the same before and after. Every UI-suite screenshot was pixel-diffed; the only differences are the live clock, a random quiz question and a 14 px scroll offset.
- Startup is the same: about 480–510 ms to a drawn chart, both before and after (Electron, same machine).
- The Windows zip packages with `dist-renderer/` and `gen/`. The mac ignore regex was checked path by path.

## Left
- **Phase 2:** done (see above); interim items are listed under "Phase 2 — what is still interim".
- **Phase 3 (Svelte):** rewrite the journal, dashboard and learning center as Svelte 5 components mounted from `src/main.ts`. New features are written in Svelte.
- **Phase 4 (the rest + main process):** side panel, settings, guide and drawing tools; `main.js`/`mt5.js`/`api.js` move to TypeScript; delete the root wrappers and run strict TypeScript everywhere.
- **Before merging:** rebased on `feat/price-tracker-app` 171d074 (v2.16.0). Later app-branch renderer edits must be ported by hand (see above).
