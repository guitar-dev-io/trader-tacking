// Phase 2 analysis: who declares what at top level, who uses what from whom, who assigns other files' bindings.
import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';
import traverseMod from '@babel/traverse';
import { ORDER } from './order.mjs';
const traverse = traverseMod.default || traverseMod;

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
export const APP_FILES = ORDER;

export function parseFile(f) {
  const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const ast = parse(code, { sourceType: /^\s*import |^export /m.test(code) ? 'module' : 'script', errorRecovery: false, ranges: true });
  return { code, ast };
}

export function scan() {
  const files = {};
  for (const f of APP_FILES) {
    const { code, ast } = parseFile(f);
    const decl = new Map();         // name -> kind
    const free = new Map();         // name -> count of references (unbound in this file)
    const freeAssign = new Set();   // unbound names assigned in this file
    const winSet = new Set();       // window.X = ... (X)
    const winGet = new Set();
    traverse(ast, {
      Program(p) {
        for (const [n, b] of Object.entries(p.scope.bindings)) decl.set(n, b.kind);
      },
      ReferencedIdentifier(p) {
        const n = p.node.name;
        if (!p.scope.hasBinding(n, { noGlobals: true })) free.set(n, (free.get(n) || 0) + 1);
      },
      AssignmentExpression(p) {
        const l = p.node.left;
        if (l.type === 'Identifier' && !p.scope.hasBinding(l.name, { noGlobals: true })) { freeAssign.add(l.name); free.set(l.name, (free.get(l.name) || 0) + 1); }
        if (l.type === 'MemberExpression' && l.object.type === 'Identifier' && l.object.name === 'window' && !l.computed) winSet.add(l.property.name);
      },
      UpdateExpression(p) {
        const a = p.node.argument;
        if (a.type === 'Identifier' && !p.scope.hasBinding(a.name, { noGlobals: true })) freeAssign.add(a.name);
      },
      MemberExpression(p) {
        const n = p.node;
        if (n.object.type === 'Identifier' && n.object.name === 'window' && !n.computed && !(p.parent.type === 'AssignmentExpression' && p.parent.left === n)) winGet.add(n.property.name);
      },
    });
    files[f] = { decl, free, freeAssign, winSet, winGet, code };
  }
  // owner of every top-level name
  const owner = new Map();
  const dup = [];
  for (const f of APP_FILES) for (const n of files[f].decl.keys()) { if (owner.has(n)) dup.push([n, owner.get(n), f]); else owner.set(n, f); }
  return { files, owner, dup };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { files, owner, dup } = scan();
  const idx = (f) => APP_FILES.indexOf(f);
  const mutated = new Map(), forward = new Map(), implicit = new Map(), winOnly = new Map();
  for (const f of APP_FILES) {
    const F = files[f];
    for (const n of F.freeAssign) { const o = owner.get(n); if (o) (mutated.get(n) || mutated.set(n, new Set()).get(n)).add(f); else (implicit.get(n) || implicit.set(n, new Set()).get(n)).add(f); }
    for (const n of F.free.keys()) { const o = owner.get(n); if (o && idx(o) > idx(f)) (forward.get(n) || forward.set(n, new Set()).get(n)).add(f); }
    for (const n of F.winSet) if (!owner.has(n)) (winOnly.get(n) || winOnly.set(n, new Set()).get(n)).add(f);
  }
  const out = (m) => [...m].map(([n, s]) => `${n} <- ${[...s].join(',')}${owner.get(n) ? ' (owner ' + owner.get(n) + ')' : ''}`).join('\n');
  console.log('DUP', dup);
  console.log('\nMUTATED cross-file (' + mutated.size + ')\n' + out(mutated));
  console.log('\nFORWARD refs (' + forward.size + ')\n' + out(forward));
  console.log('\nIMPLICIT globals assigned (' + implicit.size + ')\n' + out(implicit));
  console.log('\nwindow.X set (not a top-level name) (' + winOnly.size + ')\n' + out(winOnly));
  const unknownFree = new Map();
  for (const f of APP_FILES) for (const n of files[f].free.keys()) if (!owner.has(n) && !(n in globalThis) ) (unknownFree.get(n) || unknownFree.set(n, new Set()).get(n)).add(f);
  console.log('\nfree names not declared by app files and not in Node globals (' + unknownFree.size + ')\n' + out(unknownFree));
}
