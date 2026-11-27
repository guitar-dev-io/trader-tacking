# Framework migration (Svelte 5 + Vite + TypeScript)

Branch: `feat/framework-migration`. **Status: complete** (Phases 0–6). The plan: 0 Vite, 1 TypeScript core, 2 no
globals, 3 Svelte pages, 4 the rest + main process, 5 chart/drawing + remaining UI, 6 close-out (every renderer module
strict TypeScript, no classic scripts, no in-app `PT`). Every phase kept the UI identical and all tests green.

## Architecture (final)
| Where | What |
|---|---|
| `index.html` → `src/main.ts` → `src/app.ts` | the only entry: `app.ts` imports the app modules in evaluation order |
| `src/app/*.ts` | the former root renderer scripts (app-core, app-data, app-analysis, app-bounce, app, ui, mobile, pages, planner, positions, learn, news, extras, icons, lessons, lessons-guide, mm-learn, claude-bridge) — strict TS, imperative DOM |
| `src/chart/*.ts` | chart core (lightweight-charts from npm), indicators, custom scripts, drawing tools, text tools, MTF, hooks, drawings store |
| `src/ui/**` | Svelte 5 components + their `*-view.ts` stores: side tabs, settings, setup guide, connect screen, about, overlay helpers, toast, net, `registry.ts` |
| `src/pages/**` | full pages (dashboard, journal, learn, news) + `pages/registry.ts` |
| `src/state.ts` | shared state `S`, `store`, theme |
| `src/core/*.ts` | pure computation (analysis, bounce, mm, journal, …) → `gen/` for main + Node tests; `src/legacy/core.ts` re-exports them to the renderer |
| `src/main/*.ts`, `src/mcp/*.ts` | Electron main, preloads, API, MT5, MCP server → `gen/main/*.js` (esbuild, CJS) |
| `src/pt.ts` | `window.PT`: tests/devtools bridge **only** |
| `vite/app-plugin.mjs` | web-only classic scripts (capacitor.js, version.js), web head, PWA manifest + service worker, static copy, `buildCore` |

**Cross-module rule:** a module imports only modules earlier in `src/app.ts`. To call a module evaluated later, use a
leaf registry (`src/ui/registry.ts` → `ui.mtf`, `ui.bounce`, `ui.notify`, `ui.update`, `ui.planner`, `ui.demo`, …;
`src/pages/registry.ts`) or `src/chart/hooks.ts` (`emitChart('load' | 'loaded')`, quote hooks). Never `PT` in app code.

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

### Phase 3: Svelte 5 pages + central state
- **Svelte 5** (`svelte`, `@sveltejs/vite-plugin-svelte`, `svelte-check`) is wired into Vite; `npm run typecheck` runs `tsc` + `svelte-check --fail-on-warnings` + the stray-global guard.
- **Central state** lives in `src/state.ts`: `S`, `store`, `THEME`/`TC`/`CHART_THEME`, `AN_DEFAULT`, `PREF_DEFAULT`, `connStatus`/`mainCfg`, the redraw flag (`view.dirty`), plus Svelte stores (`theme`, `conn`, `tick`). `app-core.js` re-exports them for the legacy modules.
- **Four pages are Svelte components** under `src/pages/` (each `index.ts` = the page's small API + lazy mount):
  - `news/` (หน้าข่าว + ปฏิทิน + teaser in the ราคา tab) — replaced `news-page.js`;
  - `learn/` (ศูนย์การเรียนรู้) — replaced `learn-center.js` + `learn-center.css`;
  - `journal/` (ผลการเทรด) — replaced `journal-page.js` + `journal.css`;
  - `dashboard/` (แดชบอร์ด, widgets as components, lightweight-charts via a wrapper) — replaced `dashboard.js` + `dashboard.css`.
- **Pages registry** (`src/pages/registry.ts`): earlier modules (mobile, setup, extras…) call `pages.learn/news/dash/journal` at call time instead of `PT.LEARN/NEWSPAGE/DASH/JOURNALPAGE`. Pages mount on the first idle moment or first use, so time-to-chart is unchanged. `def()` still exposes `PT.DASH`/`PT.LEARN` for the UI tests.
- **User data kept:** every `store` key is identical before/after (checked with `git grep` on 83b7ed9 vs Phase 3: `dash.layout`, `dash.note.*`, `lc.*`, `jr.*`, `np.calAll`, `pageTabs`, …).
- **Measured** (Phase 2 commit 83b7ed9 vs Phase 3, same machine):
  - unit 41/41, UI 106/106, `tsc` + `svelte-check` 0 errors 0 warnings, guard clean;
  - pixel diff of journal (dark/light/calendar/mobile/empty), dashboard (dark/light/edit/mobile), learn (home/reader/reader-light/mobile list/mobile reader), news page: 10 identical; differences only in the clock (news), a 12 px scroll offset (journal-calendar, content identical) and the live demo candles shifting with time (dashboard dark/light, edit: sub-threshold);
  - page load median 196–213 ms (Phase 2) vs 203–217 ms (Phase 3), 3 interleaved runs of 5 — same within noise.

### Phase 4c: main process + Android bridge → TypeScript (checklist items 7 and 8)
- **Main process** lives in `src/main/*.ts` (`main`, `mt5`, `mt5-auto`, `api`, `journal-store`, `logger`, `notify`, `ea-update`, `preload`, `trader-preload`); `scripts/build-core.mjs` bundles each one with esbuild to `gen/main/<name>.js` (CJS, node20, `electron` external). `package.json` `"main"` is `gen/main/main.js`.
- **Typed IPC:** `src/main/ipc.ts` holds `InvokeMap` (invoke/handle), `SendMap` (renderer → main) and `PushMap` (main → renderer). `preload.ts` and `main.ts` both use it, so a channel name or payload typo is a compile error. `VcgDesktopApi` (exported from `preload.ts`) is the type of the desktop `window.vcg`. Settings and status shapes are in `src/main/types.ts`; the EA wire protocol (`EAMessage`, `WireBar`, `Hello`) is in `src/core/mt5-protocol.ts`.
- **MCP server:** `src/mcp/price-tracker-mcp.ts` → `gen/main/price-tracker-mcp.js` (one file, no dependencies, shebang). Main copies it to `userData/claude/` when the user connects Claude Desktop, so `ELECTRON_RUN_AS_NODE=1 <app> script.js` still works. The `claude/` folder is gone.
- **Root wrappers removed** (`analysis.js`, `bounce.js`, `mm.js`, `journal.js`, `ea-update.js`, `vcg-inject.js`); unit tests `require('../../gen/...')`. `src/vcg-inject.mjs` → `src/vcg-inject.ts`.
- **Android bridge:** `bridge.js` → `src/platform/bridge.ts`, with a `VcgWebPlugin` interface for the native plugin and `declare global` for `window.Capacitor`/`vcg`/`APP_VERSION`. `build:www` output is unchanged.
- **Gotchas:**
  - Compiled main runs from `gen/main/`, so `main.ts` uses `ROOT = path.join(__dirname, '..', '..')` for app files (`dist-renderer/`, `mt5/`, `assets/`). Use `__dirname` only for siblings in `gen/main/` (preload, MCP script).
  - The sandboxed preload must stay a single file that requires only `electron` (esbuild bundles `ipc.ts` types away).
  - **Interim:** `build:core` also copies `gen/main/preload.js` to a gitignored root `preload.js`, because `tests/ui/run.js` loads `ROOT/preload.js`. Once `run.js` points at `gen/main/preload.js`, delete the copy step in `build-core.mjs` and the `.gitignore`/packaging lines.
  - `notify.js` (webhook/Telegram sender) was main-only, so it moved to `src/main/notify.ts`.
  - Behaviour fix: the network probe called `net.fetch(url, { partition })`, which has no such option; it now uses `session.fromPartition('persist:vcg').fetch`.
  - Packaging: `src/`, `claude/` and the root `preload.js` copy are excluded (mac ignore regex + electron-builder `files`); `gen/` is included.
- **Verified:** `npm run typecheck` clean, unit 41/41, UI 106/106, headless `electron .` boots and `/api/status` answers on 127.0.0.1:8787, MCP `tools/list` over stdio lists 17 tools.

### Phase 4a: renderer UI → Svelte (checklist items 1–3, 5, 6) — finished in Phase 5–6
- **Done:**
  - **Settings window** → `src/ui/settings/Settings.svelte` (+ `index.ts`: titlebar gear/theme buttons, ⌘, , MT5/EA toasts). Same ids/classes and the same `set-settings` payload. Network pill/banner/toasts → `src/ui/net.ts` (`netState` store).
  - **Setup guide** → `src/ui/setup/Setup.svelte`; step bodies are HTML snippets in `src/ui/setup/content.ts` (rendered with `{@html}`, buttons via `data-act`). Source pill + menu → `src/ui/setup/source-pill.ts`. `isWin`/`osKeys` → `src/ui/os.ts`.
  - **About box** → `src/ui/about/About.svelte` (settings renders it; the mobile More page mounts it) + `support.ts` (channels). `pwa.js` → `src/ui/pwa.ts`.
  - **UI registry** `src/ui/registry.ts` (leaf module): `ui.settings`, `ui.setup`, `ui.srcPill`, `ui.setUI`, `ui.msheet` replace `PT.openSettings/SETUP/SRC_UI/setUI/MSHEET` for modules loaded earlier. `PT.openSettings`, `PT.SETUP`, `PT.MSHEET` stay only for the UI tests.
  - Deleted: `settings.js`, `setup.js`, `about.js`, `pwa.js`.
- **Gotchas:**
  - Svelte updates the DOM in a microtask; tests (and old callers) expect synchronous DOM after a click/open → components call `flushSync()` after navigation (`Setup.go/pick/back`, `Settings.show`).
  - `Icon.svelte` has `bare` (plain `<svg>` like `ICON.svg`) for places that never had the `span.ic` wrapper; the settings markup's `<i data-icon>` matches `span.ic` visually, so it uses the default.
  - A UI test toggled a checkbox with `.checked = false` only; with `bind:checked` it now also dispatches `change` (same meaning).
  - Fixed on the way: the EA "update now"/"MetaEditor" buttons were only wired when `vcg.onMt5Auto` was missing (if/else slip from v2.16.0 — also present on feat/price-tracker-app).
  - `mobile.png` in the UI run is racy (dashboard close vs screenshot, from Phase 3); diffs there are not regressions.
- **Left in 4a:**
  - Item 1 (side tabs → Svelte): ราคา (watchlist/alerts/tools in `app-data.js`, `positions.js`), วิเคราะห์ (`app-analysis.js`, `app-bounce.js` UI), ฝึก (`learn.js` SIM/REPLAY/QUIZ), คำนวณ (`planner.js`), Log.
  - Item 3 rest: mobile shell (`mobile.js`), `ui.js` (panel toggles, rail, Esc), `news.js` list logic → `.ts`/Svelte.
  - Item 5: ~165 `PT.x` uses left in app code (top: `MTF` 17, `yOf` 11, `__mobileBack` 9, `el` 8, `drawings` 8, `xIdx`/`pushHistory`/`ltxt` 6) — mostly chart/drawing (item 4) plus `SIM/REPLAY/NEWS/DEMO/CACHE/setSource`.
  - Item 6: the remaining root `.js` app modules are not type-checked yet.

### Phase 4b: side tabs → Svelte (checklist items 1, 3, 5) — finished in Phase 5–6
- **Done (each a Svelte component in `src/ui/tabs/`, mounted into the existing tab container so the page pop-out in `pages.js` still moves it):**
  - **Log tab** → `LogTab.svelte` + `log.ts` (log buffer, error badge). `app.js` only calls `logTab.init()` / `logTab.opened()`.
  - **คำนวณ** → `Planner.svelte` (+ `planner-view.ts` tick). `planner.js` keeps the maths (`computePlan`, `plannerLot`, …) and the chart plan; `renderPlanner()` now just re-renders.
  - **วิเคราะห์** → `Analysis.svelte` (structure / signal card / back-test, one component mounted 3×, `part` prop) and `Bounce.svelte` (จุดเด้ง zone cards, stats, liquidity). `app-analysis.js` / `app-bounce.js` keep running the analysis and the chart drawing.
  - **ราคา → ออเดอร์ของฉัน (MT5)** → `Positions.svelte` (+ `positions-view.ts`). `positions.js` keeps the EA data, deal history and chart lines.
  - **News list** (news page `#newsfeed`) → `NewsFeed.svelte` (+ `news-view.ts`). `news.js` keeps the RSS fetch/merge/relevance and the badge.
  - UI registry gained `ui.planner` (save/render) and `ui.sim` (trade simulator) — the bounce panel no longer uses `PT.savePlan/renderPlanner/SIM`.
  - UI tests load `gen/main/preload.js` (the interim root `preload.js` copy is gone); new check that the EA "update now"/"MetaEditor" buttons call IPC.
- **Pattern used:** the `.js` module keeps state + logic and pushes a snapshot (or bumps a `tick` store) then `flushSync()`; the component only renders and calls back. Same ids/classes as before (tests unchanged), same store keys.
- **Gotchas:** Svelte trims whitespace at `{#if}`/`{#each}` edges — write separators as `{' · '}`. `PT.*` names removed with a module's old renderer were also removed from its `def()`.
- **Left in 4b (not started):**
  - ฝึก tab UI in `learn.js` (SIM order form/positions/stats, REPLAY controls, QUIZ, lesson pack) — the biggest remaining tab.
  - ราคา tab parts still in `app-data.js` (watchlist table, alerts section, connection & tools section, latest-news teaser in `src/pages/news/index.ts`).
  - Mobile shell (`mobile.js`: bottom nav, sheets, More page; replace `window.__mobileBack` with a module), `ui.js` (panel toggles, rail, Esc, folds).
  - PT uses in app `.js`: 143 left (was ~165). Chart/drawing names (`MTF` 17, `yOf` 11, `el` 8, `drawings` 7, `xIdx`/`pushHistory`/`ltxt` 6, `setTool`, `inkColor`, `xOfT`, `renderLayers`, `FIB`) belong to item 4; the rest are `REPLAY`/`NEWS`/`DEMO`/`CACHE`/`setSource`/`onChartLoaded`/`__mobileBack`/`plannerLot`/`plannerFrom`/`onQuotesMsg`.

### Phase 4d: practice tab, market tab, back handling, non-chart PT names — finished in Phase 5–6
- **Done:**
  - **ฝึก tab** → `Sim.svelte` (paper trading), `Quiz.svelte` (replay exercises), `LessonPack.svelte` (+ `practice-view.ts`). `learn.js` keeps the simulator, replay and quiz logic and pushes snapshots (`showSim/showQuiz/showLesson`); per tick `tickSim()` only patches numbers (UI test "panel not rebuilt per tick" still passes). Position/order rows are unkeyed on purpose: ids are `Date.now()` and two orders in one ms collide.
  - **ราคา tab** → `Watchlist.svelte` (rows mounted into `#wl tbody`, bid cell flashes via an action) and `Alerts.svelte` (into `#alerts`), + `market-view.ts`. `app-data.js` keeps symbols/quotes/alerts; `updateRow(q)` is now `quoteWatchlist(q)`.
  - **Back handling** → `src/ui/back.ts` (`onBack(h)` stack, `back()`), used by mobile.js, ui.js (Android back) and the journal/news/learn pages. `PT.__mobileBack` remains only as a test getter.
  - **No PT inside the app for** REPLAY, NEWS (except draw.js), HEADLINES, DEMO, CACHE, setSource: they register in `src/ui/registry.ts` (`ui.replay/news/headlines/demo/cache/setSource`). Paper trading listens through `onQuotes(fn)` (app-data.js quote hooks) instead of wrapping `onQuotesMsg`.
  - New UI screenshot `practice.png`. Pixel diff vs 66e254e: practice, panel-dark, connect-desktop, positions-panel differ only in the clock/session countdown; android-connect, mobile, icons-mobile-more(-light), theme-light-mobile(-market) identical.
- **Left (not done in 4d):**
  - Replay control bar (`#replaybar` in learn.js) is still imperative HTML.
  - "การเชื่อมต่อ & เครื่องมือ" section stays static markup in index.html with handlers in app-data.js (no dynamic content except `#api-info`); connect screen `renderConnect()` in app-data.js is still an HTML string.
  - `mobile.js` shell (bottom nav, sheets, More page) and `ui.js` are still `.js` (behaviour unchanged; only the back chain moved).
  - PT names still used by chart code (Phase 4e): `onQuotesMsg` setter (mtf), `onChartLoaded`, `plannerLot`, `plannerFrom`, `NEWS` in draw.js.
  - Gotcha for shared worktrees: `git commit` takes everything already staged — 4d once swept 4e's staged `git rm mtf.js` into its commit (fixed in ec73eb8). Commit with `git commit <paths>` or check `git diff --cached --stat` first.

### Phase 4e: chart core + drawing tools → TypeScript (checklist item 4 + chart part of 5) — finished in Phase 5–6
- **Done (strict `.ts` under `src/chart/`, `src/ui/overlay.ts`):**
  - `indicators.ts` (`IndicatorDef`, `Point`, `IND`) and `custom.ts` (`CustomResult`, `TA`, `run`) — root `indicators.js` / `custom.js` removed.
  - `src/ui/overlay.ts` — SVG overlay + coordinate helpers (`svg`, `yOf`, `xIdx`, `xOf`, `lToX`, `timeToLogical`, `logicalToTime`, `el`, `txt`, `ltxt`, `label`, `resetLabels`). `app-bounce.js` imports them (no more `PT.yOf/xIdx/el/ltxt`).
  - `analysis-overlay.ts` — `drawAnalysis`, `positionBox`. `app-overlay.js` is now a 3-line re-export shim (importers: `draw.js`, `planner.js`, `extras.js`, `learn.js`).
  - `chart.ts` — chart, main series, indicators, legend, script editor (`Ind`, `Script` types). `app-chart.js` is a re-export shim (many importers).
  - `mtf.ts` — multi-timeframe view; root `mtf.js` removed. Uses `onQuotes()` (4d's quote hook) instead of wrapping `onQuotesMsg`; still wraps `loadChart` through `PT.loadChart` (no load hook yet).
    - **Fix found while typing:** the HTF bar array was named `view` and shadowed the redraw flag, so `view.dirty = true` in MTF never asked the main overlay to redraw. Renamed to `bars`.
  - `text-tools.ts` — text/callout/labels/context menu/notes; root `text-tools.js` removed.
  - `types.ts` — `Drawing` (all tool kinds, text style, callout `off`, fib `reverse`, `label`, `by`, id `number | string` because the journal places `'jr-…'` markers), `DPoint`, `ToolKind`, `LegacyDrawing`.
  - `hooks.ts` — typed late-bound calls from modules loaded BEFORE `draw.js` into it (`setTool`, `pushHistory`, `renderLayers`, `xOfT`, `inkColor`, `uid`, `handles`, `posLevels`, `pointAt`, `mousePos`, `hitTest`, `applyChartCfg`, `redraw`). `draw.js` registers them with one `Object.assign(chartHooks, …)` at its end.
- **Left for item 4 — `draw.js` (≈630 lines) → `src/chart/draw.ts`:**
  - Its `PT.*` uses: `PT.drawings =` (3×, setter of app-core's `let drawings` → add `setDrawings()` in app-core or move drawings into `src/chart/drawings.ts`), `PT.FIB/FIBX/FIB_REVERSE =` (settings menu → setters in app-core), `PT.UP/DOWN =` (chart colours), `PT.TZ =` (timezone select), `PT.onChartLoaded =` (app-data hook), and late modules `PT.NEWS.draw`, `PT.MTF.drawOnMain`, `PT.SIM.draw`, `PT.drawPlanner`, `PT.plannerLot`, `PT.plannerFrom` (use `ui` registry entries or `chartHooks` registered by those modules).
  - Then the shims can go: `app-chart.js` / `app-overlay.js` importers switch to `src/chart/chart.ts` / `src/ui/overlay.ts` + `src/chart/analysis-overlay.ts`, and `src/legacy/modules.d.ts` loses the `app-chart` / `draw` entries.
  - The `def()` entries in `draw.js` that tests use: `drawings`, `redraw`, `undo`, `redo`, `setTool`, `xOfT`, `hitTest`, `saveDrawings`, `FIB` — keep those (tests/devtools), drop the rest.
- **Verified each step:** typecheck clean, unit 41/41, UI 107/107 (run in a separate clean worktree while 4d had uncommitted edits), pixel-diff against 66e254e: only live clock/price, the random demo price path and random paper-trade toasts differ; drawings, labels, callouts, panels identical.

### Phase 5: chart + drawing tools typed, remaining UI → Svelte
- `draw.js` → `src/chart/draw.ts` (strict); the `app-chart.js` / `app-overlay.js` / `draw.js` re-export shims are gone, importers use `src/chart/*` and `src/ui/overlay.ts`.
- Svelte: connect screen (`src/ui/connect`), Bar Replay bar (`ReplayBar.svelte`), ราคา tab tools section (`Tools.svelte`).
- Fix: `emitChart('load')` had ended up outside `loadChart`.

### Phase 6: close-out (checklist items 5, 6 and 9)
- The 18 root renderer `.js` files moved to `src/app/*.ts` and are strict TypeScript (no `@ts-nocheck`, ~1570 errors fixed). Globals `vcg` / `APP_VERSION` are declared once in `src/globals.d.ts`; typed DOM helpers `qs`/`qsa`/`mk`/`tgt` and the `El` type live in `app-core.ts`.
- **Bug fixed on the way:** in `claude-bridge` a local `function view()` shadowed the imported `view` redraw flag, so the Claude/API `draw`, `clear` and `plan` commands never marked the chart dirty (it only redrew on the next unrelated repaint). Renamed to `viewInfo`.
- lightweight-charts 5.3.0 (same version as the old vendored build) comes from npm and is bundled; `lib/` keeps only its licence. `src/legacy-order.mjs`, `src/legacy/modules.d.ts` and `scripts/codemod/` (one-shot codemods + `check-free.mjs`) are deleted; `vite/legacy-plugin.mjs` became `vite/app-plugin.mjs`.
- App code no longer reads `window.PT`; the last late-bound calls go through `src/ui/registry.ts`. `def()` stays only for names the UI suite/devtools use.
- `npm run typecheck` = `tsc` (src, strict) + `tsc -p tsconfig.tools.json` (scripts/, vite/, configs: strict `checkJs`) + `svelte-check --fail-on-warnings`. `build-core` writes `gen/**/*.d.ts` stubs typed as their TS sources.
- Packaging: `gen/**/*.d.ts` excluded from electron-builder; the mac ignore regex already covers `src`, `vite`, `scripts`, `tsconfig*.json`.

## Rebasing app-branch changes onto this branch (important)
- Every renderer file on `feat/price-tracker-app` is a classic script; here it is a module. A change there can no longer be cherry-picked as is.
- To port a change:
  1. Apply the edit by hand to the same function here.
  2. Root files moved: `foo.js` on the app branch is `src/app/foo.ts` here (chart/draw code is in `src/chart/`, many UI parts are Svelte components in `src/ui/tabs/`).
  3. For any NEW cross-file name, `import` it if its owner is earlier in `src/app.ts`; otherwise register it in `src/ui/registry.ts`. Never `PT` in app code.
  4. A NEW file goes into `src/` and gets a line in `src/app.ts`. It must pass strict `tsc`.
- `npm run typecheck` tells you if you missed a name.
- Better: freeze renderer feature work on the app branch, or merge this branch soon.

## How to run
| | |
|---|---|
| `npm run dev` | Vite dev server + Electron (reload on save; `src/core` changes rebuild `gen/`) |
| `npm start` | build the renderer, then Electron |
| `npm run build:renderer` / `npm run build:www` | desktop / web+Android renderer |
| `npm run build:core` | TypeScript core → `gen/` |
| `npm run typecheck` | `tsc` strict (src + tooling via `tsconfig.tools.json`) + `svelte-check` |
| `npm test` | unit tests (builds `gen/` first) |
| `npm run test:ui` | builds both renderers, then the Electron UI suite |
| `npm run build:mac` / `npm run build:win` | packages (build the renderer first automatically) |

## Verified
- (Phase 1) Unit tests: 37/37 (34 old + 3 for the new TS helpers). UI suite: 104/104. `tsc` strict: clean.
- Screens look the same before and after. Every UI-suite screenshot was pixel-diffed; the only differences are the live clock, a random quiz question and a 14 px scroll offset.
- Startup is the same: about 480–510 ms to a drawn chart, both before and after (Electron, same machine).
- The Windows zip packages with `dist-renderer/` and `gen/`. The mac ignore regex was checked path by path.
- **Final (Phase 6, HEAD vs 9ee5475):** typecheck 0 errors/0 warnings; unit 41/41; UI 110/110 (base 107/107).
  - Pixel-diff of all 47 UI-suite screenshots: 22 identical; the rest differ only in the live session clock/countdown ("เปิดใน 1ชม 37น"), the dashboard's clock and one randomly chosen quiz question.
  - Startup (9 loads, median, xvfb): window load 235 → 232 ms, chart drawn 255–261 → 242–253 ms — not worse.
  - Headless `electron .` boots with no renderer errors; `/api/status` answers; MCP server `initialize` + `tools/list` (17 tools) work.
  - `npm run build:www` builds; `dist-renderer` and `www` load one module bundle (+ capacitor.js/version.js on web).

## Left (follow-ups, not blocking)
- **lightweight-charts objects are typed `any`** (`LwChart`/`LwSeries` in `src/chart/chart.ts`): the library's branded `Time`/`Logical`/`BarPrice` types need ~40 call-site casts. Everything else is typed.
- **Tests stay JavaScript** (`tests/unit/*.test.js` run by `node --test`, `tests/ui/run.js` by Electron). Checked with `checkJs` they report fixture objects that are partial on purpose (~300 strict / ~50 non-strict errors), so they are not in `typecheck`.
- **Imperative modules still render with strings/DOM** (`src/app/mobile.ts` shell, `pages.ts`, parts of `app.ts`, `learn.ts`); they are typed but not Svelte. Converting them is optional.
- `El` (app-core) is deliberately loose (`HTMLElement & { [k: string]: any }`) so DOM code needs no casts.
- `tests/ui/mobile-shots.js` (not part of `test:ui`) still uses `PT.setSource/renderConnect`, which no longer exist.
- **Before merging:** this branch is based on `feat/price-tracker-app` 171d074 (v2.16.0). Renderer edits made there since must be ported by hand (see "Rebasing" above).
