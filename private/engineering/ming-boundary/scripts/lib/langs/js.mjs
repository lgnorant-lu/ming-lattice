// lib/langs/js.mjs — JS/TS 语法级前端描述符（内建档升格为描述符）
// 一族三 grammar：.js/.mjs/.cjs→JavaScript、.ts/.mts/.cts→TypeScript、
//   .jsx/.tsx→Tsx——astLangOf(ext) 给 metrics M1/分桶按 ext 路由语法名
//   （vite 语料实证：.jsx 走 JavaScript grammar 报 JSX ERROR，
//   Tsx 是 JSX 唯一承接位；Tsx 属 TS superset，承载安全）。
// 面：import/from-import → import 边；export-from → import+export 双发；
//   import() 动态字面量→import 边(dynamic)；computed→unresolved；
//   decl 五形（function/generator/class/method/arrow-var）。
// 解析语义：'.' 开头相对 spec → 盘文件试 TRY_SUFFIX；否则 external
//   （node_modules/builtin 不枚举不判死）；落空判 dead。
// 明确不做：tsconfig paths/exports map/条件 exports/webpack alias——
//   语义层留给 bundler/tsc 适配器（--facts-extra）。
import fs from 'node:fs';
import path from 'node:path';
import { fact } from '../facts.mjs';

export const exts = new Set(['.js', '.mjs', '.cjs', '.jsx',
  '.ts', '.mts', '.cts', '.tsx']);

// ext→ast-grep grammar 名（metrics M1 分桶 + extract-facts 桶路由用）
export const GRAMMAR_OF = { '.js': 'JavaScript', '.mjs': 'JavaScript',
  '.cjs': 'JavaScript', '.jsx': 'Tsx',
  '.ts': 'TypeScript', '.mts': 'TypeScript', '.cts': 'TypeScript',
  '.tsx': 'Tsx' };
export const astLangOf = (ext) => GRAMMAR_OF[ext] || 'JavaScript';

const AST_RULES = `
id: import-statement
language: JavaScript
rule:
  kind: import_statement
---
id: export-statement
language: JavaScript
rule:
  kind: export_statement
---
id: dynamic-import
language: JavaScript
rule:
  kind: call_expression
  has:
    field: function
    kind: import
---
id: decl-function
language: JavaScript
rule:
  kind: function_declaration
---
id: decl-generator
language: JavaScript
rule:
  kind: generator_function_declaration
---
id: decl-class
language: JavaScript
rule:
  kind: class_declaration
---
id: decl-method
language: JavaScript
rule:
  kind: method_definition
---
id: decl-arrow
language: JavaScript
rule:
  kind: variable_declarator
  has:
    kind: arrow_function
---
id: require-call
language: JavaScript
rule:
  kind: call_expression
  has:
    field: function
    kind: identifier
    regex: ^require$
`.trim();

// TS/TSX 复用同一规则集（tree-sitter-typescript 节点名与 js 同构）——只换 language 头
export const rules = AST_RULES;                       // canonical（M2 词表覆盖用）
export const rulesFor = (_refSpecs) => AST_RULES;
export const rulesForGrammar = (g) =>
  g === 'JavaScript' ? AST_RULES : AST_RULES.replace(/language: JavaScript/g, `language: ${g}`);

const DECL_RE = {
  'decl-function': /function\s*\*?\s*([\w$]+)/,
  'decl-generator': /function\s*\*?\s*([\w$]+)/,
  'decl-class': /class\s+([\w$]+)/,
  'decl-method': /^\s*(?:static\s+)?(?:async\s+)?(?:get\s+|set\s+)?[\*]?\s*(\[[^\]]+\]|[\w$]+)/,
  'decl-arrow': /^\s*(?:[\w$]+\s*[:,]|(?:const|let|var)\s+)?([\w$]+)\s*=/,
};
const JS_IDS = new Set(['import-statement', 'export-statement',
  'dynamic-import', 'require-call', ...Object.keys(DECL_RE)]);

// ---------- spec 解析与落地 ----------
// from 'x' / import('x') / import x=require('y')（TS）/ import 'x' 副作用式
export function specFromText(text) {
  const m = text.match(/from\s+['"]([^'"]+)['"]/) ||
            text.match(/import\(\s*['"]([^'"]+)['"]\s*\)/) ||
            text.match(/require\(\s*['"]([^'"]+)['"]/) ||  // require('x') CJS/TS import=
            text.match(/import\s+['"]([^'"]+)['"]/);
  return m ? m[1] : null;
}

const REL_SPEC = /^\.{1,2}\//;
// 供 extract-facts psLineFacts（.ps1 dot-source）复用——后缀序里 '' 直通
export const TRY_SUFFIX = ['', '.mjs', '.js', '.cjs', '.d.ts', '.ts', '.mts',
  '.cts', '.tsx', '.json', '/index.mjs', '/index.js', '/index.ts'];
export function resolveSpec(root, fromRel, spec) {
  if (!REL_SPEC.test(spec)) return { to: null, external: true };
  const base = path.posix.normalize(
    path.posix.join(path.posix.dirname(fromRel), spec));
  for (const suf of TRY_SUFFIX)
    if (fs.existsSync(path.join(root, base + suf)))
      return { to: base + suf, external: false };
  return { to: base, external: false, dead: true };
}

// ---------- per-file 预处理：export 声明/list 的 surface 名集 ----------
// （surface 要回填 decl——两遍折叠为 prepare 一遍收标记）
export function prepare(ms) {
  const surfaceMarks = new Set();
  for (const m of ms) {
    if (m.ruleId !== 'export-statement') continue;
    const reex = m.text.match(
      /^\s*export\s+(?:\{[^}]*\}|\*\s*(?:as\s+[\w$]+)?)\s*from\s*['"]/);
    if (reex) continue;                       // reexport 边由 handle 发
    const dm = m.text.match(
      /export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|class|const|let|var)\s+([\w$]+)/);
    if (dm) surfaceMarks.add(dm[1]);
    const lm = m.text.match(/export\s*\{([^}]*)\}/);
    if (lm) for (const part of lm[1].split(',')) {
      const nm = part.trim().split(/\s+as\s+/)[0].trim(); // decl 名（as 前）
      if (nm) surfaceMarks.add(nm);
    }
  }
  return { surfaceMarks };
}

export const handles = (id) => JS_IDS.has(id);

export function handle(id, m, ctx) {
  const { root, rel, extractor, out, prepared } = ctx;
  const line = m.range.start.line + 1;
  const edgeFact = (spec, r, mechanism) => fact({ unit: rel, kind: 'import',
    name: spec, file: rel, line, fidelity: 'syntactic',
    scope: r.external ? 'external' : (r.dead ? 'unresolved' : 'module'),
    extractor,
    extra: { to: r.to, mechanism,
      ...(r.dead ? { dead: true } : {}),
      ...(r.external ? { external: true } : {}) } });
  if (id === 'import-statement') {
    const spec = specFromText(m.text);
    const r = spec ? resolveSpec(root, rel, spec)
                   : { to: null, external: false, dead: true };
    out.push(edgeFact(spec || '(unparsed)', r, 'static'));
    return true;
  }
  if (id === 'dynamic-import') {
    const spec = specFromText(m.text);
    if (spec) out.push(edgeFact(spec, resolveSpec(root, rel, spec), 'dynamic'));
    else out.push(fact({ unit: rel, kind: 'import',
      name: '(computed)', file: rel, line, fidelity: 'syntactic',
      scope: 'unresolved', extractor,
      extra: { mechanism: 'dynamic-computed' } }));
    return true;
  }
  if (id === 'require-call') {
    const spec = specFromText(m.text);
    if (spec) out.push(edgeFact(spec, resolveSpec(root, rel, spec), 'require-cjs'));
    // require(变量/表达式) 非字面量——不计边（动态边界归 precise 层）
    return true;
  }
  if (id === 'export-statement') {
    // reexport 判定必须头锚定：export_statement 节点文本含整个被导
    // 函数体——体内字符串里的 from 'x' 不许误判成 reexport
    const reex = m.text.match(
      /^\s*export\s+(?:\{[^}]*\}|\*\s*(?:as\s+[\w$]+)?)\s*from\s*['"]([^'"]+)['"]/);
    const spec = reex ? reex[1] : null;
    if (spec) {
      const r = resolveSpec(root, rel, spec);
      out.push(edgeFact(spec, r, 'reexport'));
      const e = out[out.length - 1];
      out.push({ ...e, kind: 'export',
        extra: { ...e.extra } });
    }
    return true;
  }
  const re = DECL_RE[id];
  if (re) {
    // 裸名取不出即非可命名 decl（python assignment 修同款）——
    // 不许 slice 兜底：节点文本截断必产畸形名触发 M4
    // （solid `x: () => void =` / vite `[Symbol.iterator]` 实证）
    const nm = (m.text.match(re) || [])[1] || null;
    if (!nm) return true;
    out.push(fact({ unit: `${rel}#${nm}`, kind: 'decl',
      name: nm, file: rel, line,
      fidelity: 'syntactic', scope: 'file-local', extractor,
      extra: { shape: id.replace('decl-', ''),
        surface: prepared?.surfaceMarks?.has(nm) ? 'public' : 'internal' } }));
    return true;
  }
  return false;
}

// --allow-degraded 降级档：行 regex（与 ENOBUFS 单文件爆管的韧性降级同一实现）
export function regexFacts(root, rel, extractor) {
  const out = [];
  const text = fs.readFileSync(path.join(root, rel), 'utf8');
  let li = 0;
  for (const l of text.split(/\r?\n/)) {
    li++;
    const im = l.match(/import\s+.*?from\s+['"]([^'"]+)['"]/) ||
               l.match(/import\s+['"]([^'"]+)['"]/) ||
               l.match(/\brequire\(\s*['"]([^'"]+)['"]\s*\)/);
    if (im) {
      const r = resolveSpec(root, rel, im[1]);
      out.push(fact({ unit: rel, kind: 'import', name: im[1],
        file: rel, line: li, fidelity: 'regex-degraded',
        scope: r.external ? 'external' : (r.dead ? 'unresolved' : 'module'),
        extractor,
        extra: { to: r.to, mechanism: 'static',
          ...(r.dead ? { dead: true } : {}),
          ...(r.external ? { external: true } : {}) } }));
    }
    const fm = l.match(/^\s*(export\s+)?(?:async\s+)?function\s*\*?\s*([\w$]+)/) ||
               l.match(/^\s*(export\s+)?(?:const|let|var)\s+([\w$]+)\s*=\s*(?:async\s*)?\(/);
    if (fm) out.push(fact({ unit: `${rel}#${fm[2]}`, kind: 'decl',
      name: fm[2], file: rel, line: li, fidelity: 'regex-degraded',
      scope: 'file-local', extractor,
      extra: { shape: 'function',
        surface: fm[1] ? 'public' : 'internal' } }));
  }
  return out;
}
