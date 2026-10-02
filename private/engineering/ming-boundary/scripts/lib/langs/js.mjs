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
import { derived } from './js.derived.mjs';
import { namesRuleYaml } from './derive.mjs';

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
id: decl-method
language: JavaScript
rule:
  kind: method_definition
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

// ---------- 上游 derived 词表驱动的 decl 规则 ----------
// tags.scm 已把名链译进规则层（namesRuleYaml）；两类本地补位：
//   VALUE_FN_OF —— 上游对 var/pair/assign 的 decl 限函数值形态
//     （value/right:[arrow|fn-expr]），names 只译名链不译值形，手写补位；
//   HAND_DECL_KINDS —— method_definition 上游限 name:property_identifier，
//     计算名 [Symbol.iterator] 会漏（vite 实证），保留手写规则承接，
//     该 kind 不生成防同节点双发。
const DECL_KINDS = derived.declKinds;
const VALUE_FN_OF = { variable_declarator: 'value', pair: 'value',
  assignment_expression: 'right' };
const HAND_DECL_KINDS = new Set(['method_definition']);
const SHAPE_OF = { function_declaration: 'function',
  function_expression: 'function', generator_function: 'generator',
  generator_function_declaration: 'generator', class: 'class',
  class_declaration: 'class', variable_declarator: 'arrow',
  method_definition: 'method',
  pair: 'pair', assignment_expression: 'assign-fn',
  export_statement: 'const' };

const declIdOf = (d) =>
  `js-decl-${d.kind}${d.inside ? '__' + d.inside.join('_') : ''}`;

// derived inside 链转 ast-grep 嵌套 inside 规则（同 python.mjs 约定）
function insideRule(inside) {
  let yaml = '', indent = 2;
  for (let i = inside.length - 1; i >= 0; i--) {
    yaml += `${' '.repeat(indent)}inside:\n${' '.repeat(indent + 2)}kind: ${inside[i]}\n`;
    indent += 2;
  }
  return yaml;
}
// namesRuleYaml '  ' 缩进块 → all: 列表项 '    - ' 形态——`- ` 占两列后
// 子键须比 has: 位更深，即后续行整体再缩 4（col6 对齐 has=has 值变 null）
const asAllItem = (block) => block.trimEnd().split('\n')
  .map((l, i) => (i ? '    ' + l : '    - ' + l.slice(2))).join('\n');
const valueFnItem = (field) => `    - has:\n        field: ${field}\n` +
  `        any:\n          - kind: arrow_function\n` +
  `          - kind: function_expression`;

const DECL_RULES = DECL_KINDS
  // '_' 通配宿主（upstream (_) 捕获）非合法 ast-grep kind 规则——
  //   词表留 derived 供 M2 覆盖仪，规则面剔除
  .filter((d) => d.kind !== '_' && !HAND_DECL_KINDS.has(d.kind))
  .map((d) => {
    const head = `id: ${declIdOf(d)}\nlanguage: JavaScript\nrule:\n` +
      `  kind: ${d.kind}\n` + (d.inside ? insideRule(d.inside) : '');
    if (VALUE_FN_OF[d.kind])
      return head + '  all:\n' +
        (d.names?.length ? asAllItem(namesRuleYaml(d.names)) + '\n' : '') +
        valueFnItem(VALUE_FN_OF[d.kind]);
    return head + namesRuleYaml(d.names);
  }).join('\n---\n');

// TS/TSX 复用同一规则集（tree-sitter-typescript 节点名与 js 同构）——只换 language 头
export const rules = AST_RULES + '\n---\n' + DECL_RULES;   // canonical（M2 词表覆盖用）
export const rulesFor = (_refSpecs) => rules;
export const rulesForGrammar = (g) =>
  g === 'JavaScript' ? rules
    : rules.replace(/language: JavaScript/g, `language: ${g}`);

const DECL_METHOD_RE =
  /^\s*(?:static\s+)?(?:async\s+)?(?:get\s+|set\s+)?[\*]?\s*(\[[^\]]+\]|[\w$]+)/;
// 生成规则 kind → 名抽取 regex（规则层 has/any 已保证名位存在，此处取字面）
const DECL_RE_OF = {
  function_declaration: /function\s*\*?\s*([\w$]+)/,
  function_expression: /function\s*\*?\s*([\w$]+)/,
  generator_function: /function\s*\*?\s*([\w$]+)/,
  generator_function_declaration: /function\s*\*?\s*([\w$]+)/,
  class: /class\s+([\w$]+)/,
  class_declaration: /class\s+([\w$]+)/,
  variable_declarator: /^\s*([\w$]+)\s*=/,
  pair: /^\s*([\w$]+)\s*:/,
  assignment_expression: /^\s*(?:[\w$]+\s*\.\s*)*([\w$]+)\s*=(?!=)/,
  export_statement: /export\s+(?:default\s+)?([\w$]+)\s*=(?!=)/,
};
const JS_IDS = new Set(['import-statement', 'export-statement',
  'dynamic-import', 'require-call', 'decl-method',
  ...DECL_KINDS.filter((d) => d.kind !== '_' && !HAND_DECL_KINDS.has(d.kind))
    .map(declIdOf)]);

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
  // decl 位：decl-method 手写承接 + js-decl-<kind>[__inside] 生成件
  const kind = id === 'decl-method' ? 'method_definition'
    : id.startsWith('js-decl-') ? id.slice(8).split('__')[0] : null;
  const re = kind === 'method_definition' ? DECL_METHOD_RE
    : kind ? DECL_RE_OF[kind] : null;
  if (re) {
    // 裸名取不出即非可命名 decl（python assignment 修同款）——
    // 不许 slice 兜底：节点文本截断必产畸形名触发 M4
    // （solid `x: () => void =` / vite `[Symbol.iterator]` 实证）
    const nm = (m.text.match(re) || [])[1] || null;
    if (!nm) return true;
    out.push(fact({ unit: `${rel}#${nm}`, kind: 'decl',
      name: nm, file: rel, line,
      fidelity: 'syntactic', scope: 'file-local', extractor,
      extra: { shape: SHAPE_OF[kind] || kind,
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
