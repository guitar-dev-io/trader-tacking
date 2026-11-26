// Copies the shared UI into www/ for the Android (Capacitor) app and plain-browser use.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), out = path.join(root, 'www');
const files = ['index.html', 'style.css', 'lessons-guide.css', 'mobile.css', 'vcg-inject.js', 'bridge.js', 'indicators.js', 'analysis.js', 'bounce.js', 'custom.js', 'lessons.js', 'lessons-guide.js', 'icons.js',
  'app-core.js', 'app-chart.js', 'app-analysis.js', 'app-bounce.js', 'app-data.js', 'app-overlay.js', 'app.js', 'draw.js', 'planner.js', 'settings.js', 'extras.js', 'learn.js', 'mtf.js', 'ui.js', 'mobile.js'];
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'lib'), { recursive: true });
const version = require(path.join(root, 'package.json')).version;
for (const f of files) {
  let s = fs.readFileSync(path.join(root, f), 'utf8');
  if (f === 'index.html') {
    s = s.replace('<script src="vcg-inject.js"></script>', '<script src="version.js"></script>\n<script src="capacitor.js"></script>\n<script src="vcg-inject.js"></script>')
      // no viewport-fit=cover: Capacitor then pads the WebView so nothing is drawn under the Android status/gesture bars
      .replace('<meta charset="UTF-8">', '<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">')
      // the app's local pages don't need a CSP here (and it must never block Capacitor's own bridge script)
      .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\n?/, '');
  }
  fs.writeFileSync(path.join(out, f), s);
}
for (const f of fs.readdirSync(path.join(root, 'lib'))) fs.copyFileSync(path.join(root, 'lib', f), path.join(out, 'lib', f));
fs.copyFileSync(path.join(root, 'build', 'icon.png'), path.join(out, 'icon.png'));
// @capacitor/core: provides Capacitor.registerPlugin() on top of the native bridge the Android WebView injects
fs.copyFileSync(require.resolve('@capacitor/core/dist/capacitor.js'), path.join(out, 'capacitor.js'));
fs.writeFileSync(path.join(out, 'version.js'), `window.APP_VERSION = '${version}';\n`);
console.log(`www/ built (v${version}, ${files.length} files)`);
