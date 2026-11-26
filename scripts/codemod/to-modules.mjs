// Phase 2 codemod (run once): legacy classic renderer scripts → ES modules.
//  • a name declared at top level in an EARLIER file           → import { name } from './owner.js'
//  • a name declared in a LATER file, or assigned from outside → PT.name (registry with live getters/setters, src/pt.ts)
//  • window.X for app names                                     → PT.X   (window.X = X; lines are dropped)
//  • every file registers its top-level names with def() so tests/devtools reach them as window.PT.*
// Evaluation order stays exactly the old <script> order: imports only ever point to earlier files.
import fs from 'node:fs';
import path from 'node:path';
import MagicString from 'magic-string';
import traverseMod from '@babel/traverse';
import { parseFile, ROOT } from './scan.mjs';
const traverse = traverseMod.default || traverseMod;

import { ORDER } from './order.mjs';
export { ORDER };
const CORE = { AN: 1, BOUNCE: 1, MM: 1, JOURNAL: 1 };           // src/legacy/core.ts
const WIN = new Set(['IND', 'CUSTOM', 'LESSONS', 'LESSON_CATS', 'LESSON_CAT_OF', 'LESSONS_EXTRA', 'ICON', 'MM_LEARN', 'onChartLoaded', 'setUI', 'MSHEET', '__mobileBack']);

const top = new Map(), owner = new Map();
for (const f of ORDER) {
  const { ast } = parseFile(f);
  let b = {};
  traverse(ast, { Program(p) { b = p.scope.bindings; p.stop(); } });
  top.set(f, b);
  for (const n of Object.keys(b)) { if (owner.has(n)) throw new Error(`duplicate ${n}: ${owner.get(n)} / ${f}`); owner.set(n, f); }
}
const idx = (f) => ORDER.indexOf(f);
const needs = new Map(ORDER.map((f) => [f, new Map()]));     // file -> (owner -> Set(names))
const exportsOf = new Map(ORDER.map((f) => [f, new Set()]));
const problems = [];

for (const f of ORDER) {
  const { code, ast } = parseFile(f);
  const ms = new MagicString(code);
  const bindings = top.get(f);
  const imp = needs.get(f);
  const add = (o, n) => { (imp.get(o) || imp.set(o, new Set()).get(o)).add(n); };
  const done = new Set();
  const rewrite = (p, expr) => {
    const n = p.node; if (done.has(n.start)) return; done.add(n.start);
    const par = p.parent;
    if (par && par.type === 'ObjectProperty' && par.shorthand && par.value === n) ms.overwrite(n.start, n.end, `${n.name}: ${expr}`);
    else ms.overwrite(n.start, n.end, expr);
  };
  traverse(ast, {
    Identifier(p) {
      const n = p.node.name;
      if (!(p.isReferencedIdentifier() || (p.parentPath.isAssignmentExpression() && p.parent.left === p.node) || (p.parentPath.isUpdateExpression()))) return;
      if (p.scope.hasBinding(n, { noGlobals: true })) return;
      const assigned = (p.parentPath.isAssignmentExpression() && p.parent.left === p.node) || p.parentPath.isUpdateExpression();
      if (p.parentPath.isObjectProperty() && p.parent.key === p.node && !p.parent.shorthand && !p.parent.computed) return;
      if (n === 'VCGI') { add('src/vcg-inject.mjs', 'default as VCGI'); return; }
      if (CORE[n]) { if (assigned) problems.push(`${f}: assigns ${n}`); add('src/legacy/core.ts', n); return; }
      if (WIN.has(n)) { rewrite(p, 'PT.' + n); return; }
      const o = owner.get(n);
      if (!o || o === f) return;
      if (assigned || idx(o) > idx(f)) { rewrite(p, 'PT.' + n); return; }
      add(o, n); exportsOf.get(o).add(n);
    },
    MemberExpression(p) {
      const m = p.node;
      if (m.computed || m.object.type !== 'Identifier' || m.object.name !== 'window' || m.property.type !== 'Identifier') return;
      if (p.scope.hasBinding('window', { noGlobals: true })) return;
      const n = m.property.name;
      if (!(owner.has(n) || WIN.has(n) || CORE[n])) return;
      const isLhs = p.parentPath.isAssignmentExpression() && p.parent.left === m;
      if (isLhs && owner.get(n) === f && p.parent.right.type === 'Identifier' && p.parent.right.name === n && p.parentPath.parentPath.isExpressionStatement()) {
        const st = p.parentPath.parentPath.node; ms.remove(st.start, st.end); return;   // window.X = X;  → registered by def()
      }
      if (isLhs && owner.has(n) && ['const', 'module'].includes(top.get(owner.get(n))[n].kind)) problems.push(`${f}:${m.loc.start.line} assigns window.${n} (owned by ${owner.get(n)})`);
      ms.overwrite(m.start, m.end, 'PT.' + n);
    },
  });
  fs.writeFileSync(path.join(ROOT, f + '.__ms'), ms.toString());
}

// headers + def() + exports
for (const f of ORDER) {
  let body = fs.readFileSync(path.join(ROOT, f + '.__ms'), 'utf8'); fs.unlinkSync(path.join(ROOT, f + '.__ms'));
  body = body.replace(/^\/\* global [^*]*\*\/\n/m, '');
  const lines = ["import { PT, def } from './src/pt.ts';"];
  for (const [o, ns] of [...needs.get(f)].sort((a, b) => idx(a[0]) - idx(b[0]))) {
    const from = o.startsWith('src/') ? './' + o : './' + o;
    const named = [...ns].filter((x) => !x.startsWith('default as ')).sort();
    const dflt = [...ns].find((x) => x.startsWith('default as '));
    const parts = [];
    if (dflt) parts.push(dflt.slice('default as '.length));
    if (named.length) parts.push(`{ ${named.join(', ')} }`);
    lines.push(`import ${parts.join(', ')} from '${from}';`);
  }
  const b = top.get(f);
  const reg = Object.entries(b).map(([n, x]) => (x.kind === 'const' || x.kind === 'module' || x.path.isClassDeclaration())
    ? `${n}: [() => ${n}]` : `${n}: [() => ${n}, (v) => { ${n} = v; }]`);
  if (reg.length) lines.push(`def({ ${reg.join(', ')} });`);
  const ex = [...exportsOf.get(f)].sort();
  const out = lines.join('\n') + '\n' + body.replace(/\s*$/, '\n') + (ex.length ? `export { ${ex.join(', ')} };\n` : '');
  fs.writeFileSync(path.join(ROOT, f), out);
}
if (problems.length) { console.error('PROBLEMS:\n' + problems.join('\n')); process.exitCode = 1; }
else console.log('converted', ORDER.length, 'files');
