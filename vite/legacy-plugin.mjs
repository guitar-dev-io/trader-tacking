// Vite plugin: the non-module parts of the renderer build.
//  • third-party classic scripts that define their own global (src/legacy-order.mjs → VENDOR_SCRIPTS: the chart
//    library), emitted as content-hashed classic <script> tags before the app's ES modules
//  • web/Android: Capacitor core + version.js, the web <head>, manifest + service worker (PWA)
//  • static files the app loads by URL at run time (assets/, icon, chart-library licence)
// All app code is ES modules since Phase 2 (src/app.ts); see docs/MIGRATION.md.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { transform } from 'esbuild';
import { VENDOR_SCRIPTS, WEB_ONLY_SCRIPTS } from '../src/legacy-order.mjs';
import { buildCore } from '../scripts/build-core.mjs';

const MARKER = '<!-- legacy-scripts -->';
const DEV_URL = '/@pt-legacy/';

export default function legacyScripts({ root, web, version }) {
  const list = () => [...VENDOR_SCRIPTS, ...(web ? WEB_ONLY_SCRIPTS : [])];
  const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
  const flat = (f) => f.replace(/^lib\//, '').replace(/\.js$/, '');
  let emitted = [], outDir = '';

  // web/Android-only head changes (were done by the old scripts/build-www.js)
  const webHead = (html) => html
    .replace('<meta charset="UTF-8">', '<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">')
    .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\n?/, '')
    .replace('</head>', '<link rel="manifest" href="manifest.webmanifest">\n<meta name="theme-color" content="#0f1115">\n<link rel="apple-touch-icon" href="assets/icon-192.png">\n<meta name="apple-mobile-web-app-capable" content="yes">\n<meta name="apple-mobile-web-app-title" content="Price Tracker">\n</head>');

  return {
    name: 'pt-legacy-scripts',
    configResolved(cfg) { outDir = cfg.build.outDir; },
    async buildStart() {
      await buildCore({ quiet: true });                     // gen/ for Electron main + Node tests
      for (const f of list()) this.addWatchFile(path.join(root, f));
      emitted = list().map((f) => {
        const src = read(f), fileName = `_v/legacy/${flat(f)}-${crypto.createHash('sha256').update(src).digest('hex').slice(0, 8)}.js`;
        this.emitFile({ type: 'asset', fileName, source: src });
        return fileName;
      });
    },
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const dev = !!ctx.server;
        const tag = (src) => `<script src="${src}"></script>`;
        const files = dev ? list().map((f) => DEV_URL + f) : emitted.map((f) => './' + f);
        const tags = (web ? [tag(dev ? '/capacitor.js' : './capacitor.js'), tag(dev ? '/version.js' : './version.js')] : []).concat(files.map(tag));
        if (!html.includes(MARKER)) throw new Error('index.html is missing ' + MARKER);
        html = html.replace(MARKER, tags.join('\n'));
        return web ? webHead(html) : html;
      },
    },
    async configureServer(server) {
      const req = createRequire(import.meta.url);
      await buildCore({ quiet: true });
      const coreDir = path.join(root, 'src', 'core');
      server.watcher.add(coreDir);
      server.watcher.on('change', (f) => { if (path.resolve(f).startsWith(coreDir + path.sep)) buildCore({ quiet: true }).then(() => server.ws.send({ type: 'full-reload' }), (e) => server.config.logger.error(String(e))); });
      server.middlewares.use((rq, rs, next) => {
        const u = rq.url.split('?')[0];
        if (u.startsWith(DEV_URL)) { const f = u.slice(DEV_URL.length); if (list().includes(f)) { rs.setHeader('Content-Type', 'text/javascript'); return rs.end(read(f)); } }
        if (web && u === '/version.js') { rs.setHeader('Content-Type', 'text/javascript'); return rs.end(`window.APP_VERSION = '${version}';\n`); }
        if (web && u === '/capacitor.js') { rs.setHeader('Content-Type', 'text/javascript'); return rs.end(fs.readFileSync(req.resolve('@capacitor/core/dist/capacitor.js'))); }
        next();
      });
      const files = new Set(list().map((f) => path.join(root, f)));
      server.watcher.add([...files]);
      server.watcher.on('change', (f) => { if (files.has(path.resolve(f))) server.ws.send({ type: 'full-reload' }); });
    },
    closeBundle() {
      // static files the renderer loads at run time by relative URL
      fs.cpSync(path.join(root, 'assets'), path.join(outDir, 'assets'), { recursive: true });
      fs.mkdirSync(path.join(outDir, 'lib'), { recursive: true });
      fs.copyFileSync(path.join(root, 'lib', 'LICENSE-lightweight-charts'), path.join(outDir, 'lib', 'LICENSE-lightweight-charts'));
      fs.copyFileSync(path.join(root, 'build', 'icon.png'), path.join(outDir, 'icon.png'));
      if (!web) return;
      const req = createRequire(import.meta.url);
      fs.copyFileSync(req.resolve('@capacitor/core/dist/capacitor.js'), path.join(outDir, 'capacitor.js'));
      fs.writeFileSync(path.join(outDir, 'version.js'), `window.APP_VERSION = '${version}';\n`);   // loaded before the legacy scripts
      fs.writeFileSync(path.join(outDir, 'manifest.webmanifest'), JSON.stringify({
        name: 'Price Tracker — ราคา กราฟ และบทเรียน Price Action', short_name: 'Price Tracker', lang: 'th', start_url: './', scope: './',
        display: 'standalone', background_color: '#0f1115', theme_color: '#0f1115', description: 'กราฟ วิเคราะห์ จุดเด้ง เครื่องคำนวณ lot และบทเรียน — อ่านราคาอย่างเดียว ไม่ส่งคำสั่งซื้อขาย',
        icons: [{ src: 'assets/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'assets/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'assets/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }],
      }, null, 2));
      // PWA service worker: cache the whole app shell (every built file), version-stamped so a new deploy replaces it
      const walk = (d, p = '') => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name), p + e.name + '/') : [p + e.name]);
      const shell = ['./', ...walk(outDir).filter((f) => f !== 'sw.js')];
      fs.writeFileSync(path.join(outDir, 'sw.js'), `// generated by vite/legacy-plugin.mjs
const CACHE = 'pt-${version}-${Date.now().toString(36)}', SHELL = ${JSON.stringify(shell)};
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;          // market data, news: always network
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((r) => r || fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match('index.html'))));
});
`);
    },
  };
}
