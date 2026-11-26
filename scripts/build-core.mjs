// Compiles the TypeScript computation modules (src/core/*.ts) to gen/*.js with esbuild.
//  • shared modules (browser + Node): an IIFE that defines the same global the old .js file did (window.AN, …)
//    and also sets module.exports, so the legacy renderer scripts, Electron main and the unit tests use them unchanged
//  • Node-only modules: CommonJS
// Runs automatically before vite builds, npm test and npm start (see package.json / vite/legacy-plugin.mjs).
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SHARED = { analysis: 'AN', bounce: 'BOUNCE', mm: 'MM', journal: 'JOURNAL' };
export const NODE_ONLY = ['ea-version', 'mt5-protocol'];

export async function buildCore({ quiet = false } = {}) {
  const out = path.join(root, 'gen');
  fs.mkdirSync(out, { recursive: true });
  const common = { bundle: true, target: 'es2022', logLevel: 'error', legalComments: 'none', charset: 'utf8' };
  await Promise.all([
    ...Object.entries(SHARED).map(([name, globalName]) => build({
      ...common, entryPoints: [path.join(root, 'src/core', name + '.ts')], outfile: path.join(out, name + '.js'),
      format: 'iife', globalName, platform: 'neutral',
      banner: { js: `// GENERATED from src/core/${name}.ts by scripts/build-core.mjs — do not edit` },
      // plain object (not an esbuild namespace with getters) + CommonJS export for Node
      footer: { js: `${globalName} = Object.assign({}, ${globalName});\nif (typeof module !== 'undefined' && module.exports) module.exports = ${globalName};` },
    })),
    ...NODE_ONLY.map((name) => build({
      ...common, entryPoints: [path.join(root, 'src/core', name + '.ts')], outfile: path.join(out, name + '.js'),
      format: 'cjs', platform: 'node',
      banner: { js: `// GENERATED from src/core/${name}.ts by scripts/build-core.mjs — do not edit` },
    })),
    // scripts injected into VCG WebTrader: ES module for the renderer (src/vcg-inject.mjs), CommonJS for Electron main + tests
    build({ ...common, entryPoints: [path.join(root, 'src/vcg-inject.mjs')], outfile: path.join(out, 'vcg-inject.js'), format: 'cjs', platform: 'node',
      banner: { js: '// GENERATED from src/vcg-inject.mjs by scripts/build-core.mjs — do not edit' } }),
  ]);
  if (!quiet) console.log('gen/ built:', [...Object.keys(SHARED), ...NODE_ONLY].join(', '));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) buildCore().catch((e) => { console.error(e); process.exit(1); });
