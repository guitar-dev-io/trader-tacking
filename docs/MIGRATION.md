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
- Unit tests: 37/37 (34 old + 3 for the new TS helpers). UI suite: 104/104. `tsc` strict: clean.
- Screens look the same before and after. Every UI-suite screenshot was pixel-diffed; the only differences are the live clock, a random quiz question and a 14 px scroll offset.
- Startup is the same: about 480–510 ms to a drawn chart, both before and after (Electron, same machine).
- The Windows zip packages with `dist-renderer/` and `gen/`. The mac ignore regex was checked path by path.

## Left
- **Phase 2 (no globals):** turn the legacy files into ES modules one at a time.
  - Start with leaf modules (`indicators`, `icons`, `lessons*`) and give the shared state (`S`, `store`, `main`) a small store module.
  - Expose a `window.PT` bridge while classic and module code coexist.
  - When a file becomes a module, remove it from `src/legacy-order.mjs`.
- **Phase 3 (Svelte):** rewrite the journal, dashboard and learning center as Svelte 5 components mounted from `src/main.ts`. New features are written in Svelte.
- **Phase 4 (the rest + main process):** side panel, settings, guide and drawing tools; `main.js`/`mt5.js`/`api.js` move to TypeScript; delete the root wrappers and run strict TypeScript everywhere.
- **Before merging:** rebase on `feat/price-tracker-app`. Expect small conflicts in `index.html` (script tags → `src/legacy-order.mjs`), `main.js` (`loadFile`), `package.json` scripts and `scripts/build-www.js`. Any new legacy file there must be added to `src/legacy-order.mjs`.
