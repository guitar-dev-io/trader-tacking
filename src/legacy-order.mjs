// The classic (non-module) renderer scripts, in load order. Single source of truth: the Vite legacy plugin
// concatenates exactly these into ONE classic <script> (see docs/MIGRATION.md for why), for the desktop app,
// the Android app and the web app alike. Add a new legacy file here — never as a <script> tag in index.html.
// New code should be an ES module under src/ instead (imported from src/main.ts).
export const LEGACY_SCRIPTS = [
  'vcg-inject.js', 'bridge.js', 'lib/lightweight-charts.standalone.production.js',
  'indicators.js', 'analysis.js', 'bounce.js', 'custom.js', 'lessons.js', 'lessons-guide.js', 'icons.js',
  'app-core.js', 'app-chart.js', 'app-analysis.js', 'app-bounce.js', 'app-data.js', 'app-overlay.js',
  'mm.js', 'mm-learn.js', 'app.js', 'text-tools.js', 'draw.js', 'planner.js', 'settings.js', 'extras.js',
  'learn.js', 'news.js', 'setup.js', 'positions.js', 'mtf.js', 'ui.js', 'mobile.js', 'pages.js', 'about.js',
  'journal.js', 'journal-page.js', 'dashboard.js', 'learn-center.js', 'news-page.js', 'claude-bridge.js',
];
// Only in the web/Android build (www/): after everything else.
export const WEB_ONLY_SCRIPTS = ['pwa.js'];
