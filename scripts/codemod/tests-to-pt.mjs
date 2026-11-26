// Phase 2 codemod (run once): code the UI tests run inside the renderer (js(`…`) / executeJavaScript(`…`)) used the
// old shared globals (S, PAGES, store, main, …). Those are module-scoped now; prefix them with PT. (window.PT).
import fs from 'node:fs';
import path from 'node:path';
import MagicString from 'magic-string';
import { parse } from '@babel/parser';
import traverseMod from '@babel/traverse';
import { parseFile, ROOT } from './scan.mjs';
const traverse = traverseMod.default || traverseMod;

const ORDER = (await import('./order.mjs')).ORDER;
const APP = new Set(['AN', 'BOUNCE', 'MM', 'JOURNAL', 'IND', 'CUSTOM', 'LESSONS', 'LESSON_CATS', 'LESSON_CAT_OF', 'LESSONS_EXTRA', 'ICON', 'MM_LEARN', 'onChartLoaded', 'setUI', 'MSHEET', '__mobileBack']);
for (const f of ORDER) { const { ast } = parseFile(f); traverse(ast, { Program(p) { Object.keys(p.scope.bindings).forEach((n) => APP.add(n)); p.stop(); } }); }

function fixCode(src, offset, ms, file, line) {
  // src: renderer code (raw template text with ${…} replaced by same-length identifiers)
  let ast;
  try { ast = parse(src, { sourceType: 'script', allowAwaitOutsideFunction: true, allowReturnOutsideFunction: true }); }
  catch (e) { console.error(`${file}:${line} cannot parse renderer code: ${e.message}\n  ${src.slice(0, 160)}`); return 0; }
  let n = 0;
  traverse(ast, {
    Identifier(p) {
      const id = p.node.name;
      if (!APP.has(id) || p.scope.hasBinding(id, { noGlobals: true })) return;
      const lhs = (p.parentPath.isAssignmentExpression() && p.parent.left === p.node) || p.parentPath.isUpdateExpression();
      if (!p.isReferencedIdentifier() && !lhs) return;
      if (p.parentPath.isObjectProperty() && p.parent.key === p.node && !p.parent.shorthand) return;
      const par = p.parent;
      const rep = par.type === 'ObjectProperty' && par.shorthand && par.value === p.node ? `${id}: PT.${id}` : `PT.${id}`;
      ms.overwrite(offset + p.node.start, offset + p.node.end, rep); n++;
    },
  });
  return n;
}

for (const file of ['tests/ui/run.js', 'tests/ui/mobile-shots.js']) {
  const code = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const ast = parse(code, { sourceType: 'script', allowAwaitOutsideFunction: true });
  const ms = new MagicString(code);
  let total = 0;
  traverse(ast, {
    CallExpression(p) {
      const c = p.node.callee;
      const name = c.type === 'Identifier' ? c.name : c.type === 'MemberExpression' && !c.computed ? c.property.name : '';
      if (name !== 'js' && name !== 'executeJavaScript') return;
      const a = p.node.arguments[0]; if (!a) return;
      const line = a.loc.start.line;
      if (a.type === 'StringLiteral') {
        const raw = code.slice(a.start + 1, a.end - 1);
        total += fixCode(raw, a.start + 1, ms, file, line);
      } else if (a.type === 'TemplateLiteral') {
        // join raw quasis, placeholders → identifiers of the same length as `${…}` so offsets map 1:1
        let src = '';
        a.quasis.forEach((q, i) => {
          src += code.slice(q.start, q.end);
          const e = a.expressions[i];
          if (e) { const len = (a.quasis[i + 1].start) - q.end; src += ('_' + 'P'.repeat(Math.max(0, len - 1))).slice(0, len); }
        });
        total += fixCode(src, a.quasis[0].start, ms, file, line);
      }
    },
  });
  fs.writeFileSync(path.join(ROOT, file), ms.toString());
  console.log(file, 'rewrote', total, 'references');
}
