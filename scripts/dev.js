// `npm run dev`: Vite dev server for the renderer (instant reload on save) + Electron pointed at it.
const { spawn } = require('child_process');
(async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ configFile: require('path').join(__dirname, '..', 'vite.config.mjs'), mode: 'desktop' });
  await server.listen();
  const url = server.resolvedUrls?.local[0] ?? 'http://localhost:5173/';
  console.log('renderer dev server:', url);
  const electron = /** @type {string} */ (/** @type {unknown} */ (require('electron')));
  const p = spawn(electron, ['.'], { stdio: 'inherit', env: { ...process.env, VITE_DEV_SERVER_URL: url } });
  p.on('exit', async (/** @type {number | null} */ code) => { await server.close(); process.exit(code || 0); });
})();
