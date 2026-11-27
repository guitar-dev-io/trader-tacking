// Compiles the TypeScript computation modules (src/core/*.ts) to gen/*.js with esbuild.
//  • shared modules (browser + Node): an IIFE that defines the same global the old .js file did (window.AN, …)
//    and also sets module.exports, so the legacy renderer scripts, Electron main and the unit tests use them unchanged
//  • Node-only modules: CommonJS
// Runs automatically before vite builds, npm test and npm start (see package.json / vite/app-plugin.mjs).
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
    // scripts injected into VCG WebTrader (src/vcg-inject.ts): CommonJS copy for the Node tests (main bundles its own)
    build({ ...common, entryPoints: [path.join(root, 'src/vcg-inject.ts')], outfile: path.join(out, 'vcg-inject.js'), format: 'cjs', platform: 'node',
      banner: { js: '// GENERATED from src/vcg-inject.ts by scripts/build-core.mjs — do not edit' } }),
    buildMain(common),
  ]);
  if (!quiet) console.log('gen/ built:', [...Object.keys(SHARED), ...NODE_ONLY, ...MAIN_ENTRIES.map((n) => 'main/' + n), 'main/price-tracker-mcp'].join(', '));
}

// Electron main process (src/main/*.ts) → gen/main/*.js, CommonJS, one bundled file per entry:
//  • main.js           — package.json "main"; finds the app files (dist-renderer, mt5/, assets/) two folders up
//  • preload.js        — sandboxed preload: must be a single file that only requires 'electron'
//  • trader-preload.js — preload of the hidden WebTrader window
//  • price-tracker-mcp.js — the Claude MCP server (standalone, no dependencies; run with ELECTRON_RUN_AS_NODE=1)
//  • logger, api, mt5, mt5-auto, journal-store, ea-update, notify — the same modules on their own, for the unit tests
export const MAIN_ENTRIES = ['main', 'preload', 'trader-preload', 'logger', 'api', 'mt5', 'mt5-auto', 'journal-store', 'ea-update', 'notify'];
async function buildMain(common) {
  const out = path.join(root, 'gen', 'main');
  fs.mkdirSync(out, { recursive: true });
  const node = { ...common, format: 'cjs', platform: 'node', target: 'node20', external: ['electron'] };
  await Promise.all([
    ...MAIN_ENTRIES.map((name) => build({ ...node, entryPoints: [path.join(root, 'src/main', name + '.ts')], outfile: path.join(out, name + '.js'),
      banner: { js: `// GENERATED from src/main/${name}.ts by scripts/build-core.mjs — do not edit` } })),
    build({ ...node, entryPoints: [path.join(root, 'src/mcp/price-tracker-mcp.ts')], outfile: path.join(out, 'price-tracker-mcp.js'),
      banner: { js: '#!/usr/bin/env node\n// GENERATED from src/mcp/price-tracker-mcp.ts by scripts/build-core.mjs — do not edit' } }),
  ]);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) buildCore().catch((e) => { console.error(e); process.exit(1); });
