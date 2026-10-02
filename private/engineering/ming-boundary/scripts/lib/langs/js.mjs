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

// '.'/'..' 无尾斜杠也是目录 spec（require('.')→./index.* 实证差分），
//   正则须允许行尾
const REL_SPEC = /^\.{1,2}(?:\/|$)/;
// 供 extract-facts psLineFacts（.ps1 dot-source）复用——后缀序里 '' 直通
export const TRY_SUFFIX = ['', '.mjs', '.js', '.cjs', '.d.ts', '.ts', '.mts',
  '.cts', '.tsx', '.json', '/index.mjs', '/index.js', '/index.ts'];
// TS ESM 重写 spec：源码 `import './a.js'` 磁盘实体是 a.ts
//   （Node16/NodeNext + bundler 解析约定；.mjs→.mts/.cjs→.cts/.jsx→.tsx）。
//   只在直查落空后启用——编译产物并存时优先真身。
const TS_REWRITE = { '.js': ['.ts', '.tsx', '.d.ts'], '.jsx': ['.tsx'],
  '.mjs': ['.mts', '.d.ts'], '.cjs': ['.cts', '.d.ts'] };
function firstFile(root, base, suffixes) {
  for (const suf of suffixes) {
    const p = path.join(root, base + suf);
    // existsSync 对目录也真——'' 后缀会抢在 /index.* 前把 dir 当模块
    // （depcruise 差分实证：express `require('.')` 产 ->. 假边）。
    // Node 语义 dir→dir/index.*——所有命中位强制 isFile
    if (fs.existsSync(p) && fs.statSync(p).isFile())
      // 后缀拼接后再归一：'.'+'/index.js' → 'index.js'，
      //   消前导 './' 与 './/' 双斜杠（depcruise 对账名义等位）
      return path.posix.normalize(base + suf);
  }
  return null;
}
export function resolveSpec(root, fromRel, spec) {
  // bundler query/hash 后缀剥除（'./w.js?worker&url'/'./a.css#x'——
  //   vite/webpack/rollup 通用约定，文件系统路径本不含 ?#；
  //   depcruise 差分实证 vite worker-url fixture 丢此边）
  spec = spec.split(/[?#]/, 1)[0];
  if (!REL_SPEC.test(spec)) return { to: null, external: true };
  const base = path.posix.normalize(
    path.posix.join(path.posix.dirname(fromRel), spec));
  const direct = firstFile(root, base, TRY_SUFFIX);
  if (direct) return { to: direct, external: false };
  const ext = path.posix.extname(base);
  const tsAlts = TS_REWRITE[ext];
  if (tsAlts) {
    const rewritten = firstFile(root, base.slice(0, -ext.length), tsAlts);
    if (rewritten) return { to: rewritten, external: false };
  }
  return { to: path.posix.normalize(base), external: false, dead: true };
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
  // 自指 vacuous 抑制（python.mjs 同闸，django xregexp.js babel 产物
  // `require('./xregexp')` 自指实证）——自依赖零信息，grimp/depcruise
  // 均不产自环边；emit 统一收口四类边发射
  const emit = (spec, r, mechanism) => {
    if (r.to === rel) return null;
    out.push(edgeFact(spec, r, mechanism));
    return out[out.length - 1];
  };
  if (id === 'import-statement') {
    const spec = specFromText(m.text);
    const r = spec ? resolveSpec(root, rel, spec)
                   : { to: null, external: false, dead: true };
    emit(spec || '(unparsed)', r, 'static');
    return true;
  }
  if (id === 'dynamic-import') {
    const spec = specFromText(m.text);
    if (spec) emit(spec, resolveSpec(root, rel, spec), 'dynamic');
    else out.push(fact({ unit: rel, kind: 'import',
      name: '(computed)', file: rel, line, fidelity: 'syntactic',
      scope: 'unresolved', extractor,
      extra: { mechanism: 'dynamic-computed' } }));
    return true;
  }
  if (id === 'require-call') {
    const spec = specFromText(m.text);
    if (spec) emit(spec, resolveSpec(root, rel, spec), 'require-cjs');
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
      const e = emit(spec, r, 'reexport');
      if (e) out.push({ ...e, kind: 'export',
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
  // 两遍法（rust 同款纪律）：vis=注释/字符串/模板掏空——只做关键字定位；
  // spec 文本回 l 同位重解析（spec 本身就是串字面量，掩蔽会吞掉它）。
  // 漏判方向单向——vis 里见不到的关键字绝不产边
  let bc = 0;
  const maskLine = (l) => {
    const arr = l.split('');
    for (let ci = 0; ci < arr.length; ci++) {
      const c = arr[ci], n = arr[ci + 1];
      if (bc) {
        if (c === '*' && n === '/') { arr[ci] = arr[ci + 1] = ' '; bc--; ci++; }
        else { arr[ci] = ' '; }
        continue;
      }
      if (c === '/' && n === '/') { for (let j = ci; j < arr.length; j++) arr[j] = ' '; break; }
      if (c === '/' && n === '*') { arr[ci] = arr[ci + 1] = ' '; bc++; ci++; continue; }
      if (c === '"' || c === "'" || c === '`') {
        const q = c; arr[ci] = ' ';
        let j = ci + 1;
        // 模板串 ${} 内可嵌代码——近似整段掩（import/require 以顶层形态为主）
        while (j < arr.length && arr[j] !== q) {
          if (arr[j] === '\\') { arr[j] = arr[j + 1] = ' '; j += 2; }
          else { arr[j] = ' '; j++; }
        }
        if (j < arr.length) { arr[j] = ' '; ci = j; } else ci = arr.length;
      }
    }
    return arr.join('');
  };
  const emit = (spec, r, mechanism, li2) => {
    if (r.to === rel) return;    // 自环抑制与 AST 路同构
    out.push(fact({ unit: rel, kind: 'import', name: spec,
      file: rel, line: li2, fidelity: 'regex-degraded',
      scope: r.external ? 'external' : (r.dead ? 'unresolved' : 'module'),
      extractor,
      extra: { to: r.to, mechanism,
        ...(r.dead ? { dead: true } : {}),
        ...(r.external ? { external: true } : {}) } }));
  };
  const netBraces = (v) => {
    let d = 0;
    for (const c of v) {
      if (c === '{' || c === '(' || c === '[') d++;
      else if (c === '}' || c === ')' || c === ']') d--;
    }
    return d;
  };
  // `from` 须在组外顶层（`import {from}` 叶名不命中）；返回 vis 上位置
  const topFrom = (v) => {
    let d = 0;
    for (const fm of v.matchAll(/\bfrom\b|[{}]/g)) {
      if (fm[0] === '{') d++;
      else if (fm[0] === '}') d--;
      else if (d === 0) return fm.index;
    }
    return -1;
  };
  const lines = text.split(/\r?\n/);
  let li = 0, depth = 0;
  for (let idx = 0; idx < lines.length; idx++) {
    const l = lines[idx];
    li++;
    const vis = maskLine(l);
    let cursor = 0, d2 = depth, kwCut = vis.length;
    for (const km of vis.matchAll(/\b(import|require|export)\b/g)) {
      for (; cursor < km.index; cursor++) {
        const c = vis[cursor];
        if (c === '{' || c === '(' || c === '[') d2++;
        else if (c === '}' || c === ')' || c === ']') d2--;
      }
      const prev = vis[km.index - 1];
      if (prev && /[\w$.]/.test(prev)) continue;   // obj.require/x.import 非调用
      let restV = vis.slice(km.index), restR = l.slice(km.index);
      // import( 是动态导入——任意深度合法；静态 import/export 才是顶层语义
      const isDynImport = km[1] === 'import' && /^import\s*\(/.test(restV);
      const isImportExport = km[1] !== 'require' && !isDynImport;
      // ESM 顶层语义：函数/块内静态 import|export 是语法错误面——AST 不产边
      if (isImportExport && (d2 > 0 || /\S/.test(vis.slice(0, km.index))))
        continue;
      // 多行 import/export 组（ASI 无分号）：仅真组形态（import {|*,
      // import x, {|export {——`export const x = {` 对象字面量不算）才续行；
      // kwCut 截断——组自身的 {} 不算块深度（续行括号净零不入账）
      if (isImportExport &&
          /^(?:import|export)\s*(?:type\s+)?[\w$]*\s*,?\s*\{/.test(restV)) {
        if (km.index < kwCut) kwCut = km.index;
        while (netBraces(restV) > 0 && idx + 1 < lines.length) {
          const l2 = lines[++idx];
          li++;
          restV += '\n' + maskLine(l2);
          restR += '\n' + l2;
        }
      }
      let m;
      if (km[1] === 'import') {
        if (isDynImport) {
          if ((m = restR.match(/^import\s*\(\s*(['"])([^'"]+)\1\)/)))
            emit(m[2], resolveSpec(root, rel, m[2]), 'dynamic', li);
          else
            out.push(fact({ unit: rel, kind: 'import', name: '(computed)',
              file: rel, line: li, fidelity: 'regex-degraded',
              scope: 'unresolved', extractor,
              extra: { mechanism: 'dynamic-computed' } }));
          continue;
        }
        const fp = topFrom(restV);
        if (fp >= 0) {
          if ((m = restR.slice(fp).match(/^from\s*['"]([^'"]+)['"]/)))
            emit(m[1], resolveSpec(root, rel, m[1]), 'static', li);
        } else if ((m = restR.match(/^import\s+['"]([^'"]+)['"]/))) {
          emit(m[1], resolveSpec(root, rel, m[1]), 'static', li);   // 副作用导入
        }
        continue;
      }
      if (km[1] === 'require') {
        if ((m = restR.match(/^require\(\s*['"]([^'"]+)['"]\s*\)/)))
          emit(m[1], resolveSpec(root, rel, m[1]), 'require-cjs', li);
        continue;
      }
      // export {a} from 'x' / export * as ns from 'x'——与 AST reexport 同形态；
      // `export type` AST 侧 reex 正则不收（type-only 运行期擦除）同判跳过
      if (/^export\s+type\b/.test(restV)) continue;
      const fp = topFrom(restV);
      if (fp >= 0 && (m = restR.slice(fp).match(/^from\s*['"]([^'"]+)['"]/))) {
        const spec = m[1];
        const r = resolveSpec(root, rel, spec);
        emit(spec, r, 'reexport', li);
        if (r.to !== rel)   // reexport twin（emit 内自环已闸）
          out.push({ ...out[out.length - 1], kind: 'export',
            extra: { ...out[out.length - 1].extra } });
      }
    }
    depth += netBraces(vis.slice(0, kwCut));
    const fm = vis.match(/^\s*(export\s+)?(?:async\s+)?function\s*\*?\s*([\w$]+)/) ||
               vis.match(/^\s*(export\s+)?(?:const|let|var)\s+([\w$]+)\s*=\s*(?:async\s*)?\(/);
    if (fm) out.push(fact({ unit: `${rel}#${fm[2]}`, kind: 'decl',
      name: fm[2], file: rel, line: li, fidelity: 'regex-degraded',
      scope: 'file-local', extractor,
      extra: { shape: 'function',
        surface: fm[1] ? 'public' : 'internal' } }));
  }
  return out;
}
