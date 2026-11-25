// Copies the shared UI into www/ for the Android (Capacitor) app and plain-browser use.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), out = path.join(root, 'www');
const files = ['index.html', 'style.css', 'vcg-inject.js', 'bridge.js', 'indicators.js', 'analysis.js', 'custom.js', 'lessons.js', 'icons.js',
  'app.js', 'draw.js', 'planner.js', 'settings.js', 'extras.js', 'learn.js', 'mtf.js', 'ui.js'];
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'lib'), { recursive: true });
const version = require(path.join(root, 'package.json')).version;
for (const f of files) {
  let s = fs.readFileSync(path.join(root, f), 'utf8');
  if (f === 'index.html') {
    s = s.replace('<script src="vcg-inject.js"></script>', '<script src="version.js"></script>\n<script src="vcg-inject.js"></script>')
      .replace('<meta charset="UTF-8">', '<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">')
      // Android/web: allow https/wss to the data sources used by the bridge
      .replace("default-src 'self';", "default-src 'self' https: wss:; connect-src 'self' https: wss:;");
  }
  fs.writeFileSync(path.join(out, f), s);
}
for (const f of fs.readdirSync(path.join(root, 'lib'))) fs.copyFileSync(path.join(root, 'lib', f), path.join(out, 'lib', f));
fs.copyFileSync(path.join(root, 'build', 'icon.png'), path.join(out, 'icon.png'));
fs.writeFileSync(path.join(out, 'version.js'), `window.APP_VERSION = '${version}';\n`);
console.log(`www/ built (v${version}, ${files.length} files)`);
