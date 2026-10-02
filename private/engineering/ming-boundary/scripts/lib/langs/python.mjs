// lib/langs/python.mjs — Python 语法级前端描述符（ADR-0010 syntactic 档，
// 第二语言入场——IV8 521 py 文件零边实证为过闸消费方）
// 面：import/from-import → import 边；__init__.py from-import → 双发 export；
//     def/class/模块级赋值 → decl。
// 解析语义：import a.b → 包索引候选根序（文件目录→计算 sysroots）找
//   a/b.py|.pyi|.pyd|.so 或 a/b/__init__.py；sysroots 非猜词——由
//   __init__.py 链顶祖先的父目录 + 松散 py 目录实算（prepareRun 一次/run）。
//   from .x import y / from .. 相对层级锚文件包链；绝对导入无命中=外部
//   （stdlib/site-packages 不枚举，external 不判死）；相对导入无命中=dead。
// 明确不做：sys.path 动态注入/条件导入求值/__import__/importlib 动态边——
//   语义层留给 pyright/scip-python 适配器（--facts-extra）。
import fs from 'node:fs';
import path from 'node:path';
import { fact } from '../facts.mjs';
import { derived } from './python.derived.mjs';
import { namesRuleYaml } from './derive.mjs';

// linguist 全量 exts 含构建/打包边角（.gyp/.spec 等）——内容扫描只认模块件
export const exts = new Set(['.py', '.pyi', '.pyw']);

const SHAPE_OF = { function_definition: 'fn', class_definition: 'class',
  assignment: 'const' };
const DECL_KINDS = derived.declKinds;

const EDGE_RULES = `
id: py-import
language: Python
rule:
  kind: import_statement
---
id: py-from
language: Python
rule:
  kind: import_from_statement
`.trim();

// derived inside 链转 ast-grep 嵌套 inside 规则（inside 外层先 → 内层先包裹）
function insideRule(inside) {
  let yaml = '', indent = 2;
  for (let i = inside.length - 1; i >= 0; i--) {
    yaml += `${' '.repeat(indent)}inside:\n${' '.repeat(indent + 2)}kind: ${inside[i]}\n`;
    indent += 2;
  }
  return yaml;
}

// namesRuleYaml：上游 @name 字段链译回规则层（assignment 须 left:identifier
// ——derived.names 把 tags.scm 字段约束归位，handle 侧裸名过滤是纵深二道）
export const rules = EDGE_RULES + '\n---\n' + DECL_KINDS.map((d) =>
  `id: py-decl-${d.kind}\nlanguage: Python\nrule:\n  kind: ${d.kind}\n` +
  (d.inside ? insideRule(d.inside) : '') + namesRuleYaml(d.names))
  .join('\n---\n').trimEnd();
// M2 覆盖仪读 rulesFor——python 无 refSpecs 变体，直通 canonical
export const rulesFor = () => rules;

const PY_IDS = new Set(['py-import', 'py-from',
  ...DECL_KINDS.map((d) => `py-decl-${d.kind}`)]);

// ---------- import 文本解析 ----------
// `import a, b.c as x` → ['a','b.c']；`from <dots>mod import (a, b as c, *)`
// → {level, mod, names, star}
export function importSpecs(text) {
  const m = text.match(/^\s*import\s+(.+)$/s);
  if (!m) return [];
  return m[1].split(',').map((s) =>
    s.trim().replace(/\s+as\s+\w+\s*$/, '').trim()).filter(Boolean)
    .map((mod) => ({ level: 0, mod, names: [], star: false }));
}
export function fromSpec(text) {
  const m = text.match(/^\s*from\s+(\.*)([\w.]*)?\s+import\s+(.+)$/s);
  if (!m) return null;
  const level = m[1].length, mod = m[2] || '';
  const names = m[3].replace(/^\(/, '').replace(/\)\s*$/, '')
    .split(',').map((s) => s.trim().replace(/\s+as\s+\w+\s*$/, '').trim())
    .filter(Boolean);
  return { level, mod, names, star: names.includes('*') };
}

const MOD_EXTS = ['.py', '.pyi', '.pyd', '.so', '.pyw'];
// 大小写精确存在性：existsSync 在 Windows CI 文件系统上大小写不敏感，
// 而 CPython FileFinder 即使 CI FS 也逐段精确比对模块文件名——
// `from geos import Point`（类名）必须不能误中 geos/point.py
// （django grimp 差分实证：幽灵 geos.Point 子模块边）
const DIR_CACHE = new Map();   // absDir -> Set<entry> | null
function dirEntries(root, relDir) {
  const abs = path.join(root, relDir || '.');
  if (!DIR_CACHE.has(abs)) {
    let s = null;
    try { s = new Set(fs.readdirSync(abs)); } catch { /* 目录不存在 */ }
    DIR_CACHE.set(abs, s);
  }
  return DIR_CACHE.get(abs);
}
function statExact(root, rel) {
  const segs = rel.split('/');
  let d = '';
  for (const seg of segs) {
    const es = dirEntries(root, d);
    if (!es || !es.has(seg)) return null;
    d = d ? `${d}/${seg}` : seg;
  }
  try { return fs.statSync(path.join(root, rel)); }
  catch { return null; }
}
const exists = (root, rel) => statExact(root, rel)?.isFile() ?? false;
const dirExists = (root, rel) => statExact(root, rel)?.isDirectory() ?? false;

// 模块/包解析 → {to, pkgDir}。pkgDir=可探测子模块的目录（包 init 的目录
// 或 PEP420 命名空间目录）；纯模块文件 pkgDir=null
function modFile(root, base, dotted) {
  const p = dotted.split('.').filter(Boolean).join('/');
  const jb = base ? `${base}/` : '';
  for (const e of MOD_EXTS)
    if (exists(root, `${jb}${p}${e}`))
      return { to: `${jb}${p}${e}`, pkgDir: null };
  for (const e of ['.py', '.pyi'])
    if (exists(root, `${jb}${p}/__init__${e}`))
      return { to: `${jb}${p}/__init__${e}`, pkgDir: `${jb}${p}` };
  if (dirExists(root, `${jb}${p}`))   // PEP420 命名空间包（无 __init__）
    return { to: `${jb}${p}`, pkgDir: `${jb}${p}` };
  return null;
}

// ---------- 包索引（run 级，一次算定） ----------
// sysroot 实算规则：init 目录上溯到"不再含 __init__ 的祖先"，其父目录即
// 导入根（python/iv8_rs/__init__.py 且 python/ 无 init → python/ 是根）；
// 含 .py 但无 init 的目录登记为松散脚本根（同目录互导语义）。
// root 自身（''）总在序尾兜底。
function computeRoots(rels) {
  const initDirs = new Set(), pyDirs = new Set();
  for (const r of rels) {
    const d = path.posix.dirname(r);
    if (path.posix.basename(r).startsWith('__init__.py')) initDirs.add(d);
    if (/\.(py|pyi|pyw)$/.test(r)) pyDirs.add(d);
  }
  const roots = new Set(['']);
  for (const d of initDirs) {
    let t = d;
    while (t && t !== '.' && initDirs.has(path.posix.dirname(t)))
      t = path.posix.dirname(t);
    const p = path.posix.dirname(t);
    roots.add(p === '.' ? '' : p);
  }
  for (const d of pyDirs) if (!initDirs.has(d)) roots.add(d === '.' ? '' : d);
  // 浅根优先（更接近传统 sys.path 序），同深按字典序保确定性
  return { roots: [...roots].sort((x, y) =>
    x.split('/').length - y.split('/').length || x.localeCompare(y)),
    initDirs };
}

// run 状态仓：prepareRun 由抽取器在匹配循环前调一次；regexFacts 降级路径
// 走懒计算（fs 遍历补 py 清单——降级档不读上游 walk 结果）
const RUN = new Map();
export function prepareRun({ root, files }) {
  const rels = files.map((f) => (typeof f === 'string' ? f : f.rel));
  const { roots, initDirs } = computeRoots(rels);
  RUN.set(root, { roots, initDirs });
  return roots;
}
function collectPyRels(root, dir = '', out = []) {
  for (const e of fs.readdirSync(path.join(root, dir || '.'), { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'node_modules') continue;
    const rel = dir ? `${dir}/${e.name}` : e.name;
    if (e.isDirectory()) collectPyRels(root, rel, out);
    else if (/\.(py|pyi|pyw)$/.test(e.name)) out.push(rel);
  }
  return out;
}
// 文件目录前置仅非包成员成立：包内目录无 __init__ 不进 sys.path——
// `import typing` 于 flask/blueprints.py 不得误中兄弟 typing.py
// （M6 双路对账实证 13 条 regex-only 假边；AST 路本无前置，此为
// 松散脚本 sys.path[0] 语义向 AST 路对齐后的唯一偏差源）
function rootsFor(root, fromRel) {
  const run = RUN.get(root) ||
    { ...computeRoots(collectPyRels(root)) };
  const dir = path.posix.dirname(fromRel);
  const first = dir === '.' ? '' : dir;
  if (run.initDirs?.has(dir)) return run.roots;
  return [first, ...run.roots.filter((r) => r !== first)];
}

function resolvePy(root, fromRel, spec, roots) {
  const dir = path.posix.dirname(fromRel);
  if (spec.level > 0) {
    // 相对：level 个点 = 从文件目录上溯 level-1 层包
    let base = dir === '.' ? '' : dir;
    for (let i = 1; i < spec.level; i++) base = path.posix.dirname(base);
    if (base === '.') base = '';
    if (!spec.mod) {
      // from . import x：包目录必须在（init 或命名空间目录均可），
      // 名字是否兄弟模块由调用方逐名探测
      if (!base && !fs.existsSync(root)) /* root 总在，防呆（. 走原生检查——
        readdir 条目不包含 '.' 自身，statExact 会误判根不存在） */
        return { external: false, dead: true, to: null };
      if (base && !dirExists(root, base))
        return { to: null, external: false, dead: true, base };
      const init = ['.py', '.pyi'].find((e) => exists(root, `${base ? base + '/' : ''}__init__${e}`));
      return { to: init ? `${base ? base + '/' : ''}__init__${init}` : (base || '.'),
               pkgDir: base || '.', external: false, base };
    }
    const hit = modFile(root, base, spec.mod);
    return hit ? { ...hit, external: false, base }
               : { to: `${base ? base + '/' : ''}${spec.mod.replace(/\./g, '/')}`,
                   external: false, dead: true, base };
  }
  for (const b of roots || rootsFor(root, fromRel)) {
    const hit = modFile(root, b, spec.mod);
    // self-hit 二分：自文件命中让位下一候选根（松散目录 flask.py
    //   自遮蔽 `from flask import Flask`——inner2 实证）；自包命中
    //   （from django.conf import x 在 conf/__init__.py）包边 vacuous
    //   但 pkgDir 仍须保留给子模块探测——conf→global_settings 是真边
    if (hit && hit.to === fromRel && hit.pkgDir)
      return { ...hit, external: false, base: b };
    if (hit && hit.to !== fromRel)
      return { ...hit, external: false, base: b };
  }
  return { to: null, external: true };   // stdlib/site-packages——不判死
}

const PY_DECL_NAME = { function_definition: /(?:async\s+)?def\s+([A-Za-z_]\w*)/,
  class_definition: /class\s+([A-Za-z_]\w*)/,
  // 裸名赋值或裸名注解-only（x: int 即 AnnAssign，.pyi 里就是声明主体）；
  // obj.attr=/x[i]=/解包 LHS 不命中（typeshed os/__init__.pyi 266 处实证）
  assignment: /^\s*([A-Za-z_]\w*)\s*(?::[^=\n]*)?(?:=(?![=>])|\s*$)/ };

export function prepare(_ms) { return {}; }

export function handle(id, m, ctx) {
  const { root, rel, extractor, out } = ctx;
  const line = m.range.start.line + 1;
  const inInit = path.posix.basename(rel).startsWith('__init__.py');
  if (id === 'py-import') {
    for (const spec of importSpecs(m.text)) {
      const r = resolvePy(root, rel, spec, rootsFor(root, rel));
      // 自环 vacuous：__init__.py 内 from . import 把包自身归到
      //   to==rel——grimp 差分口径不产自环，边界谓词下自依赖无信息
      if (r.to !== rel)
        out.push(edge(rel, line, spec.mod, r, 'py-import', extractor));
    }
    return true;
  }
  if (id === 'py-from') {
    const spec = fromSpec(m.text);
    if (!spec) {
      out.push(fact({ unit: rel, kind: 'import', name: '(unparsed)',
        file: rel, line, fidelity: 'syntactic', scope: 'unresolved',
        extractor, extra: { dead: true, mechanism: 'py-from' } }));
      return true;
    }
    const r = resolvePy(root, rel, spec, rootsFor(root, rel));
    const mech = spec.star ? 'py-star' : 'py-from';
    const specName = '.'.repeat(spec.level) + spec.mod;
    // 模块/包边总是发（from m import n 对 m 的依赖独立成立）；
    // 名字探测仅当目标是包（pkgDir 非空）时逐名试 <pkgDir>/<name>.py
    // 自环抑制同 py-import（from . import 在 __init__.py 归自身）
    const selfEdge = r.to === rel;
    if (!selfEdge) {
      out.push(edge(rel, line, specName || '.', r, mech, extractor));
      if (inInit) out.push({ ...out[out.length - 1], kind: 'export',
        extra: { ...out[out.length - 1].extra, mechanism: 'py-reexport' } });
    }
    if (!spec.star && r.pkgDir) {
      for (const nm of spec.names) {
        const sub = modFile(root, r.pkgDir === '.' ? '' : r.pkgDir, nm);
        if (!sub) continue;
        const subName = '.'.repeat(spec.level) +
          [spec.mod, nm].filter(Boolean).join('.');
        out.push(edge(rel, line, subName,
          { to: sub.to, external: false }, 'py-from-submodule', extractor));
        // __init__ 里 from . import x 的 re-export 挂子模块边（旧实现 twin
        // 在 to==rel 的自环包边上，等于没标——grimp 差分实证修正语义锚点）
        if (inInit && sub.to !== rel)
          out.push({ ...out[out.length - 1], kind: 'export',
            extra: { ...out[out.length - 1].extra, mechanism: 'py-reexport' } });
      }
    }
    return true;
  }
  const declKind = id.startsWith('py-decl-') ? id.slice(8) : null;
  if (declKind) {
    const nm = (m.text.match(PY_DECL_NAME[declKind] || /\b/) || [])[1] || null;
    // upstream tags.scm 对 assignment 本限 left:(identifier)——derived 丢字段约束；
    // 裸名不命中 = obj.attr=/x[i]=/(a,b)= 属性/下标/解包赋值，非 decl（regex 路同构）
    if (!nm) return true;
    out.push(fact({ unit: `${rel}#${nm}`, kind: 'decl',
      name: nm, file: rel, line,
      fidelity: 'syntactic', scope: 'file-local', extractor,
      extra: { shape: SHAPE_OF[declKind] || declKind,
        surface: nm.startsWith('_') ? 'internal' : 'public' } }));
    return true;
  }
  return false;
}

export const handles = (id) => PY_IDS.has(id);

function edge(rel, line, name, r, mechanism, extractor) {
  return fact({ unit: rel, kind: 'import', name, file: rel, line,
    fidelity: 'syntactic',
    scope: r.external ? 'external' : (r.dead ? 'unresolved' : 'module'),
    extractor,
    extra: { to: r.to, mechanism,
      ...(r.dead ? { dead: true } : {}),
      ...(r.external ? { external: true } : {}) } });
}

// --allow-degraded 降级档：行 regex（相对导入锚目录、绝对导入走包索引）
export function regexFacts(root, rel, extractor) {
  const out = [];
  const text = fs.readFileSync(path.join(root, rel), 'utf8');
  const inInit = path.posix.basename(rel).startsWith('__init__.py');
  const roots = rootsFor(root, rel);   // prepareRun 未跑时懒建索引
  let depth = 0, tq = null;            // tq=三引号串态（'"""'|"'''"）
  const lines = text.split(/\r?\n/);
  for (let li0 = 0; li0 < lines.length; li0++) {
    const l = lines[li0], li = li0 + 1;
    // 单遍掩蔽：三引号跨行态 + 单双引号行内态 + 行外 # 注释截断——
    // 串内文本不得参与匹配/深度计数（docstring 样例 `from flask import`
    // 产假边、串内括号污染深度闸）；注释必须并进同一遍——后剥会让
    // 注释里的撇号（it's）被当成引号吃掉闭合括号（checks.py:765 实证：
    // `(FIXME:` 注释开括号 + 下行注释撇号吞 `)` → depth 永久+1）
    let vis = '', i = 0;
    while (i < l.length) {
      if (tq) {
        const j = l.indexOf(tq, i);
        if (j < 0) { i = l.length; break; }
        i = j + 3; tq = null;
        continue;
      }
      const tri = l.startsWith('"""', i) ? '"""'
        : l.startsWith("'''", i) ? "'''" : null;
      if (tri) { tq = tri; i += 3; continue; }
      const c = l[i];
      if (c === '#') break;                  // 串外 # 到行尾全是注释
      if (c === '"' || c === "'") {
        let j = i + 1;                       // 行内串：跳配到对引号
        while (j < l.length && l[j] !== c)
          j += l[j] === '\\' ? 2 : 1;        // \ 转义吞下一字符
        i = j < l.length ? j + 1 : l.length;
        continue;
      }
      vis += c; i++;
    }
    // 括号深度闸：签名/字面量多行展开里的 `name: Type,` 续行非 decl
    // （AST 路不受影响——参数注解是 typed_parameter 非 assignment 节点；
    // 粗糙计数是降级档固有代价，fidelity 戳如实标 regex-degraded）
    const d0 = depth;
    for (const ch of vis)
      if ('([{'.includes(ch)) depth++; else if (')]}'.includes(ch)) depth--;
    if (d0 > 0) continue;
    const code = vis;
    let m = code.match(/^\s*import\s+(.+?)\s*$/);
    if (m) {
      for (const mod of m[1].split(',').map((s) =>
        s.trim().replace(/\s+as\s+\w+\s*$/, '').trim()).filter(Boolean)) {
        const r = resolvePy(root, rel, { level: 0, mod }, roots);
        if (r.to !== rel)                       // 自环抑制与 AST 路同构
          out.push({ ...edge(rel, li, mod, r, 'py-import', extractor),
            fidelity: 'regex-degraded' });
      }
      continue;
    }
    m = code.match(/^\s*from\s+(\.*)([\w.]*)\s+import\s+(.+?)\s*$/);
    if (m) {
      // 跨行括号 from-import：并入后续行名字直到 ) 闭合——
      // django `from django.db import (\n models,\n)` 41 条
      // ast-only 实证；续行剥注释+括号计数同步 depth
      let namesTxt = m[3];
      while (namesTxt.includes('(') && !namesTxt.includes(')') &&
             li0 + 1 < lines.length) {
        const nxt = lines[++li0].replace(/\s+#.*$/, '');
        for (const ch of nxt)
          if ('([{'.includes(ch)) depth++;
          else if (')]}'.includes(ch)) depth--;
        namesTxt += ' ' + nxt;
      }
      const spec = { level: m[1].length, mod: m[2] || '',
        names: namesTxt.replace(/^\(|\)\s*$/g, '')
          .split(',').map((s) => s.trim().replace(/\s+as\s+\w+\s*$/, ''))
          .filter(Boolean) };
      spec.star = spec.names.includes('*');
      // `from __future__ import` 是编译器指令非模块依赖——tree-sitter 归
      //   future_import_statement 节点，AST 路天然不匹配；regex 须同义跳过
      //   （typeshed 差分实证：stdlib/__future__.pyi 在库内可解析，
      //   regex 曾产 112 条幽灵边）
      if (spec.mod === '__future__') continue;
      const r = resolvePy(root, rel, spec, roots);
      const f = edge(rel, li, '.'.repeat(spec.level) + spec.mod || '.', r,
        spec.star ? 'py-star' : 'py-from', extractor);
      const selfEdge = r.to === rel;           // 自环抑制与 AST 路同构
      if (!selfEdge) {
        out.push({ ...f, fidelity: 'regex-degraded' });
        if (inInit) out.push({ ...f, kind: 'export', fidelity: 'regex-degraded',
          extra: { ...f.extra, mechanism: 'py-reexport' } });
      }
      if (!spec.star && r.pkgDir) {
        for (const nm of spec.names) {
          const sub = modFile(root, r.pkgDir === '.' ? '' : r.pkgDir, nm);
          if (sub) {
            out.push({ ...edge(rel, li,
              '.'.repeat(spec.level) + [spec.mod, nm].filter(Boolean).join('.'),
              { to: sub.to, external: false }, 'py-from-submodule', extractor),
              fidelity: 'regex-degraded' });
            if (inInit && sub.to !== rel)
              out.push({ ...out[out.length - 1], kind: 'export',
                extra: { ...out[out.length - 1].extra,
                  mechanism: 'py-reexport' } });
          }
        }
      }
      continue;
    }
    m = code.match(/^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/)
      || code.match(/^\s*class\s+([A-Za-z_]\w*)/)
      || code.match(/^([A-Za-z_]\w*)\s*(?::[^=]*)?(?:=(?!=)|\s*$)/);
    if (m) {
      const nm = m[1];
      const shape = /^\s*(?:async\s+)?def/.test(code) ? 'fn'
        : /^\s*class/.test(code) ? 'class' : 'const';
      out.push(fact({ unit: `${rel}#${nm}`, kind: 'decl', name: nm,
        file: rel, line: li, fidelity: 'regex-degraded', scope: 'file-local',
        extractor, extra: { shape,
          surface: nm.startsWith('_') ? 'internal' : 'public' } }));
    }
  }
  return out;
}
