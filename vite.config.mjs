// Renderer build. Two targets from the same index.html:
//   vite build --mode desktop  → dist-renderer/  (Electron, keeps the CSP)
//   vite build --mode web      → www/            (Android/Capacitor + installable web app/PWA)
// `npm run dev` serves the desktop target with Vite's dev server and starts Electron against it.
import { defineConfig } from 'vite';
import { createRequire } from 'node:module';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import appPlugin from './vite/app-plugin.mjs';

const pkg = createRequire(import.meta.url)('./package.json');

export default defineConfig(({ mode }) => {
  const web = mode === 'web';
  return {
    root: '.',
    base: './',                       // file:// (Electron), https://localhost (Capacitor) and a sub-path on GitHub Pages
    publicDir: false,                 // static files are copied by vite/app-plugin.mjs (assets/, icon, lib licence)
    clearScreen: false,
    plugins: [svelte(), appPlugin({ root: process.cwd(), web, version: pkg.version })],
    define: { __APP_VERSION__: JSON.stringify(pkg.version), __WEB__: JSON.stringify(web) },
    server: { port: 5173, strictPort: true },
    build: {
      outDir: web ? 'www' : 'dist-renderer',
      emptyOutDir: true,
      assetsDir: '_v',                // keep Vite's hashed files apart from the app's own assets/ folder
      target: 'chrome120',
      modulePreload: false,
      rollupOptions: { input: 'index.html' },
    },
  };
});
