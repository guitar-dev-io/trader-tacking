// Phase 2 step: the redraw flag `dirty` (owned by app-overlay.js, written by ~14 modules through PT) → view.dirty (src/state.ts).
import fs from 'node:fs';
import path from 'node:path';
import MagicString from 'magic-string';
import traverseMod from '@babel/traverse';
import { parseFile, ROOT } from './scan.mjs';
import { ORDER } from './order.mjs';
const traverse = traverseMod.default || traverseMod;
for (const f of ORDER) {
  const { code, ast } = parseFile(f);
  const ms = new MagicString(code); let n = 0;
  traverse(ast, {
    Identifier(p) {
      if (p.node.name !== 'dirty') return;
      const b = p.scope.getBinding('dirty');
      if (!b || !(b.scope.path.isProgram())) return;                       // a local `dirty` elsewhere: leave it
      if (p.parentPath.isImportSpecifier() || (p.parentPath.isVariableDeclarator() && p.parent.id === p.node)) return;
      if (p.parentPath.isObjectProperty() && p.parent.key === p.node && !p.parent.shorthand) return;
      if (p.parentPath.isExportSpecifier()) return;
      if (p.parentPath.isMemberExpression() && p.parent.property === p.node && !p.parent.computed) return;
      ms.overwrite(p.node.start, p.node.end, 'view.dirty'); n++;
    },
    MemberExpression(p) {
      const m = p.node;
      if (!m.computed && m.object.type === 'Identifier' && m.object.name === 'PT' && m.property.name === 'dirty') { ms.overwrite(m.start, m.end, 'view.dirty'); n++; }
    },
  });
  if (!n) continue;
  let s = ms.toString();
  s = s.replace(/^let dirty = true;\n/m, '');
  s = s.replace(/dirty: \[\(\) => (view\.)?dirty, \(v\) => \{ (view\.)?dirty = v; \}\], /, '');
  s = s.replace(/import \{([^}]*)\} from '\.\/app-overlay\.js';/, (all, list) => {
    const names = list.split(',').map((x) => x.trim()).filter((x) => x && x !== 'dirty');
    return names.length ? `import { ${names.join(', ')} } from './app-overlay.js';` : '';
  });
  s = s.replace(/^export \{([^}]*)\};$/m, (all, list) => `export { ${list.split(',').map((x) => x.trim()).filter((x) => x && x !== 'dirty').join(', ')} };`);
  s = s.replace("import { PT, def } from './src/pt.ts';", "import { PT, def } from './src/pt.ts';\nimport { view } from './src/state.ts';");
  s = s.replace(/\n\n+import /g, '\nimport ');
  fs.writeFileSync(path.join(ROOT, f), s);
  console.log(f, n);
}
