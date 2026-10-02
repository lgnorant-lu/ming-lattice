// lib/langs/rust.mjs — Rust 语法级前端描述符（ADR-0010 syntactic 档）
// 面：use/mod x; → import 边、pub use → import+export 双发、
//     fn/struct/enum/trait/type/macro_rules! → decl。
// 解析语义：crate:: 锚本 crate src/ 最长前缀；self/super 按 modDir(孩子目录)；
//   tests|benches|examples|src/bin 直子文件=cargo crate 根；裸 ident 经文件级
//   mod 声明分流本地/外部；内联 mod {} 深度计入 super。
// 明确不做：宏展开 / cfg 求值 / feature 门 / include! / #[path] / extern crate/
//   内联 mod 内再嵌套 mod 的 mod-decl——这些是语义层，走外部 precise 证据源
//   （scip/rust-analyzer → --facts-extra）。cfg 属性不求值但会标记 extra.cfg，
//   让消费方能区分"真死链"与"条件缺席"。
import fs from 'node:fs';
import path from 'node:path';
import { fact, globMatch } from '../facts.mjs';
import { derived } from './rust.derived.mjs';
import { namesRuleYaml } from './derive.mjs';

export const exts = new Set(['.rs']);

// ---------- 分层：上游词表（derived）+ 本地 overlay ----------
// decl 节点种清单由 sync-langs.mjs 从 tree-sitter tags.scm 派生（覆盖自动跟
// 上游演进——union_item/declaration_list method 即上游补给的新捕获）。
// 本地 overlay 三件事：上游粗 shape→本组件 shape 词；边规则手写（use/mod）；
// 名称抽取 regex 兜底表（降级路径用）。
const SHAPE_OF = {
  enum_item: 'enum', struct_item: 'struct', type_item: 'type',
  union_item: 'union', trait_item: 'trait', mod_item: 'mod',
  macro_definition: 'macro', function_item: 'fn',
};
// mod_item 的 decl 由 rust-mod 边规则合并产出（边+声明一体），不进 decl 规则
const EDGE_OWNED = new Set(['mod_item']);
// function_item 双捕获（top-level fn + declaration_list method）按 kind 去重
// DECL_OVERLAY：上游 tags.scm 未收 const_item/static_item（M2 语法覆盖实证
// 的上游词表盲区）——decl 位本地补齐；降级 regex 路早已产之，overlay 是
// ast/regex 双路同构职责（不进 derived.mjs——那是生成件，重跑 sync 会抹掉）
const DECL_OVERLAY = ['const_item', 'static_item'];
const DECL_KINDS = [...new Map([
  ...derived.declKinds.filter((d) => !EDGE_OWNED.has(d.kind)),
  ...DECL_OVERLAY.map((k) => ({ kind: k, shape: k.replace(/_item$/, '') })),
].map((d) => [d.kind, d])).values()];

const EDGE_RULES = `
id: rust-use
language: Rust
rule:
  kind: use_declaration
---
id: rust-mod
language: Rust
rule:
  kind: mod_item
`.trim();

// namesRuleYaml：上游 @name 字段链译回规则层（derived.names）——
// struct/trait 等 name:identifier 约束下沉到 match 时，不再靠 handle 复核
export const rules = EDGE_RULES + '\n---\n' + DECL_KINDS.map((d) =>
  `id: rust-decl-${d.kind}\nlanguage: Rust\nrule:\n  kind: ${d.kind}\n` +
  namesRuleYaml(d.names)).join('\n---\n').trimEnd();

// ref 生产器规格驱动（v1.4）：契约自带 producers.ref 条款经 --emit-spec
// 注入——每条 spec 生成一条 call_expression 规则（has+field+regex 粗滤
// callee，handle 侧按 spec.callee 精确复核）。for_expand 条款存在时追加
// for_expression 规则——`for v in ["A","B"]` 字面量数组可静态展开，
// 包围 register(v,…) 的循环变量由此解析（语法层不模拟求值，仅展开
// 字面量迭代域）。
// spec = {callee, mechanism, role, name_args:[…], symbol_arg?, for_expand?}
export function rulesFor(refSpecs) {
  if (!refSpecs?.length) return rules;
  const parts = [rules];
  refSpecs.forEach((s, i) => {
    // 粗滤 regex 作用在 function 字段全文（`ops::dispatch_x`）——spec.callee
    // 的 `^` 锚剥掉换 `(?:^|::)` 前缀容忍；精确复核仍在 handle 按最终段做
    let re = String(s.callee);
    if (re.startsWith('^')) re = '(?:^|::)' + re.slice(1);
    const pre = re.replace(/'/g, "''");
    parts.push(`---\nid: rust-ref-${i}\nlanguage: Rust\nrule:\n` +
      `  kind: call_expression\n  has:\n    field: function\n    regex: '${pre}'`);
  });
  if (refSpecs.some((s) => s.for_expand != null))
    parts.push(`---\nid: rust-for\nlanguage: Rust\nrule:\n  kind: for_expression`);
  return parts.join('\n');
}

// kind → 名称抽取 regex（降级路径与 ast 路径共用 shape 词表）
const DECL_NAME_RE = {
  function_item: /fn\s+([A-Za-z_]\w*)/,
  struct_item: /struct\s+([A-Za-z_]\w*)/,
  enum_item: /enum\s+([A-Za-z_]\w*)/,
  union_item: /union\s+([A-Za-z_]\w*)/,
  trait_item: /trait\s+([A-Za-z_]\w*)/,
  type_item: /type\s+([A-Za-z_]\w*)/,
  macro_definition: /macro_rules!\s*([A-Za-z_]\w*)/,
  const_item: /const\s+([A-Za-z_]\w*)/,
  static_item: /static\s+(?:mut\s+)?([A-Za-z_]\w*)/,
};
const DECL_SHAPE = Object.fromEntries(DECL_KINDS.map((d) =>
  [d.kind, SHAPE_OF[d.kind] || d.shape]));

const RUST_IDS = new Set(['rust-use', 'rust-mod',
  ...DECL_KINDS.map((d) => `rust-decl-${d.kind}`)]);

// crate 根判定：mod/lib/main/build.rs 之外，cargo 自动发现面里
// tests|benches|examples/<file>.rs 与 src/bin/<file>.rs 各自是独立 crate 根
// （tests/foo.rs 的 `mod common;` 找兄弟 tests/common/，不是 foo/common/）
function isCrateRoot(rel) {
  const stem = path.posix.basename(rel).replace(/\.rs$/, '');
  if (['mod', 'lib', 'main', 'build'].includes(stem)) return true;
  const parts = path.posix.dirname(rel).split('/');
  const last = parts[parts.length - 1];
  if (['tests', 'benches', 'examples'].includes(last)) return true;
  if (last === 'bin' && parts[parts.length - 2] === 'src') return true;
  return false;
}

// 裸 `pub` 前缀=发布面；`pub(crate)`/`pub(super)`/`pub(in …)` 限域=internal
function surface(text) {
  return /^\s*pub\s+(?!\()/.test(text) ? 'public' : 'internal';
}

// use 路径原文：`[pub[..]] use <path>;`——保留原文（组由 useLeaves 展开）
function useSpec(text) {
  const m = text.match(/^\s*(?:pub(?:\s*\([^)]*\))?\s+)?use\s+(.+?)\s*;?\s*$/s);
  return m ? m[1].trim() : null;
}

// use 树展开：`a::{b, c::{d}}` → ['a::b','a::c::d']。
// `{x,y}` 无前缀组、`*` glob、`self`、`as 别名`（解析看源路径不看别名）。
// 单路径无花括号 → 原样一叶。嵌套组递归。
function splitTopCommas(s) {
  let depth = 0; const parts = []; let cur = '';
  for (const c of s) {
    if (c === '{') depth++;
    else if (c === '}') depth--;
    if (c === ',' && depth === 0) { parts.push(cur); cur = ''; }
    else cur += c;
  }
  parts.push(cur);
  return parts;
}

function expandUseTree(s) {
  s = s.trim();
  if (!s) return [];
  // 外层组 `{cfg::{..}, hir_def::{..}}` 无前缀——先剥壳按项分发，
  // 不得把首项的 `::{` 误认作整句前缀（ra hir/lib.rs 实证形态）
  if (s.startsWith('{') && s.endsWith('}')) {
    return splitTopCommas(s.slice(1, -1))
      .flatMap((p) => expandUseTree(p));
  }
  // 首个顶层 `::` + 可空白 + `{`（注释已剥）
  let idx = -1, braceAt = -1, depth = 0;
  for (let i = 0; i + 1 < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}') depth--;
    else if (depth === 0 && s[i] === ':' && s[i + 1] === ':') {
      let j = i + 2;
      while (j < s.length && /\s/.test(s[j])) j++;
      if (s[j] === '{') { idx = i; braceAt = j; break; }
    }
  }
  if (idx < 0) {
    // 无前缀顶层组（`use {crate::x, std::y}`）或纯叶：顶层逗号分割递归
    const parts = splitTopCommas(s);
    if (parts.length > 1) {
      return parts.flatMap((p) => expandUseTree(p));
    }
    return [s].filter(Boolean);
  }
  const prefix = s.slice(0, idx).trim();
  const inner = s.slice(braceAt + 1);
  const close = inner.lastIndexOf('}');
  const body = close >= 0 ? inner.slice(0, close) : inner;
  const out = [];
  for (const it of splitTopCommas(body)) {
    for (const leaf of expandUseTree(it)) {
      // `self[ as x]` 叶 = 导入父模块本体
      if (/^self(\s+as\s+\w+)?$/.test(leaf.trim())) {
        if (prefix) out.push(prefix);
        continue;
      }
      out.push(prefix ? `${prefix}::${leaf}` : leaf);
    }
  }
  return out;
}

// use 树里注释合法（`use a::{ //note\n b }`、ra hir/lib.rs 实证）——
// 展开前剥掉，否则注释里的 {}/,/:: 扰乱叶级切分
function stripComments(s) {
  return s.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

// use 语句 → 叶路径数组（每叶一条 import 边；外部不可解析段原样保留——
// `use a::{b,c}` 不再是单 blob 名，叶级 to 各自解析）
function useLeaves(text) {
  const spec = useSpec(stripComments(text));
  if (!spec) return [];
  const out = [];
  for (const leaf of expandUseTree(spec)) {
    const p = leaf
      .replace(/^#\[[^\]]*\]\s*/, '')       // 组内 #[cfg] 叶属性
      .replace(/\s+as\s+[A-Za-z_]\w*\s*$/, '')
      .replace(/\s*::\s*\*\s*$/, '') // glob: 导入目标是模块本体
      .replace(/^:+/, '')           // 2015 绝对路径前导（`use ::std`≡`std`）
      .replace(/:+\s*$/, '')        // ::* 剥后尾冒号残留（`std::{::*}`→std）
      .trim();
    if (p) out.push(p);
  }
  return out;
}

// crate:: 根=本文件所在 crate 的 src/ 目录；self::/super:: 相对模块位置；
// 裸 ident 首段：本文件 mod 声明过=本地模块，否则=外部 crate。
// ctx.fileMods=文件级 mod 声明名集；ctx.inline=包围 use 的内联 mod 名链
// （outer→inner）——内联深度先压进位置再算 super：`mod tests {
// use super::super::x }` 的第二个 super 才出到父模块。
function resolveSpec(root, fromRel, spec, ctx = {}) {
  const segs = spec.split('::').map((s) => s.trim()).filter(Boolean);
  if (!segs.length) return { to: null, external: false, dead: true };
  const dir = path.posix.dirname(fromRel);
  const stem = path.posix.basename(fromRel).replace(/\.rs$/, '');
  // fileModDir=本文件模块的孩子目录：crate 根文件=所在目录，具名文件 foo.rs=dir/foo
  const fileModDir = isCrateRoot(fromRel) ? dir : `${dir}/${stem}`;
  let base = null, i = 0, ownFile = null;
  if (segs[0] === 'crate') {
    const parts = dir.split('/');
    const srcAt = parts.lastIndexOf('src');
    if (srcAt >= 0) {
      base = parts.slice(0, srcAt + 1).join('/'); i = 1;
    } else if (isCrateRoot(fromRel)) {
      // 非 src/ 布局的 crate 根（tests|benches|examples|src/bin/<file>.rs）：
      // crate:: 根=该文件自己的模块命名空间
      base = fileModDir; i = 1;
      ownFile = fromRel;
    } else {
      return { to: null, external: false, dead: true };
    }
  } else if (segs[0] === 'self' || segs[0] === 'super') {
    let d = fileModDir + (ctx.inline?.length ? '/' + ctx.inline.join('/') : '');
    while (i < segs.length && (segs[i] === 'self' || segs[i] === 'super')) {
      if (segs[i] === 'super') d = path.posix.dirname(d);
      i++;
    }
    base = d;
  } else if (ctx.fileMods?.has(segs[0])) {
    // 文件级 `mod x;`/`mod x {}` 声明——其命名空间在文件模块层（不进内联链）
    base = fileModDir;
  } else {
    return { to: null, external: true };
  }
  const rest = segs.slice(i);
  if (!rest.length) return { to: base, external: false };
  // 最长模块前缀：use a::b::C 先试 a/b.rs|a/b/mod.rs（C 作成员），退到 a/b/c.rs
  for (let k = rest.length; k >= 1; k--) {
    const cand = base + '/' + rest.slice(0, k).join('/');
    if (fs.existsSync(path.join(root, cand + '.rs')))
      return { to: cand + '.rs', external: false };
    if (fs.existsSync(path.join(root, cand + '/mod.rs')))
      return { to: cand + '/mod.rs', external: false };
  }
  // k=0：rest 全部是模块文件内的成员项——super::Elem=父模块文件本身、
  // crate::Config=crate 根 lib.rs/main.rs。多段路径须证据：模块文件确实内联
  // 声明了 `mod <rest[0]>`，否则标 dead（crate::gone::X 的 gone 未声明=真死链）
  const selfFile = [...(ownFile ? [ownFile] : []),
    `${base}.rs`, `${base}/mod.rs`, `${base}/lib.rs`, `${base}/main.rs`];
  for (const cand of selfFile) {
    const ap = path.join(root, cand);
    if (!fs.existsSync(ap)) continue;
    if (rest.length === 1) return { to: cand, external: false };
    const body = fs.readFileSync(ap, 'utf8');
    if (new RegExp(`\\bmod\\s+${rest[0]}\\b`).test(body))
      return { to: cand, external: false };
  }
  return { to: base + '/' + rest.join('/'), external: false, dead: true };
}

// `mod foo;` 目标文件：crate 根文件=同级兄弟；具名文件 foo.rs=foo/ 子目录
function resolveMod(root, fromRel, name) {
  const dir = path.posix.dirname(fromRel);
  const stem = path.posix.basename(fromRel).replace(/\.rs$/, '');
  const base = isCrateRoot(fromRel) ? dir : `${dir}/${stem}`;
  for (const cand of [`${base}/${name}.rs`, `${base}/${name}/mod.rs`])
    if (fs.existsSync(path.join(root, cand))) return { to: cand, external: false };
  return { to: `${base}/${name}.rs`, external: false, dead: true };
}

// cfg 门检测：mod_item/use_declaration/function_item 等不含兄弟 #[cfg] 属性
// ——从匹配的 byteOffset 向前回看：跳空白、`//` 行注释、`/* */` 块注释后若
// 收在 `]` 且配对 `#[` 的内文以 cfg 开头 → 条件编译项（可叠多个属性，逐层剥）
function cfgGated(text, start) {
  let j = start;
  for (let hops = 0; hops < 8; hops++) {
    while (j > 0 && /\s/.test(text[j - 1])) j--;
    // 跳行注释：上一非空白非 `]` 时，看该行是否整行 //
    if (j > 0 && text[j - 1] === '/' && text[j - 2] === '*') {
      const open = text.lastIndexOf('/*', j - 2);
      if (open >= 0) { j = open; continue; }
    }
    if (j > 0 && text[j - 1] !== ']') {
      const ls = text.lastIndexOf('\n', j - 1) + 1;
      if (/^\s*\/\//.test(text.slice(ls, j))) { j = ls; continue; }
      return false;
    }
    if (j <= 0) return false;
    // text[j-1]===']' —— 向前配对找 `#[`
    let depth = 0, k = j - 1;
    while (k >= 0) {
      if (text[k] === ']') depth++;
      else if (text[k] === '[') { depth--; if (!depth) break; }
      k--;
    }
    if (k < 1 || text[k - 1] !== '#') return false;
    if (/^cfg\b/.test(text.slice(k + 1, j - 1).trim())) return true;
    j = k - 1;
  }
  return false;
}

// per-file 预处理：文件级 mod 声明名集 + 内联 mod 匹配（内联深度给 use 用）
// + cfg 门集（被 #[cfg] 修饰的匹配起点 byteOffset 集合）
// + for 循环字面量域（rust-for 规则在时——`for v in ["A","B"]` 的迭代变量
//   → 字面量集 + byteRange，ref 生产器的循环变量静态展开面）
export function prepare(ms) {
  const mods = new Set(ms.filter((x) => x.ruleId === 'rust-mod')
    .map((x) => (x.text.match(/mod\s+([A-Za-z_]\w*)/) || [])[1])
    .filter(Boolean));
  const inline = ms.filter((x) => x.ruleId === 'rust-mod' && /\{/.test(x.text));
  let cfg = null;
  if (ms.length) {
    const text = fs.readFileSync(ms[0].file, 'utf8');
    cfg = new Set();
    for (const m of ms)
      if (cfgGated(text, m.range.byteOffset.start))
        cfg.add(m.range.byteOffset.start);
  }
  // for 循环字面量域：两种可静态展开形态——
  //   for v in ["a","b"]            → {vars:{v:0} 单变量, items: 字面量表}
  //   for (m, op) in [(lit, e),…]   → 元组解构：vars:{m:0, op:1}，
  //                                   items 按位置取字面量列
  // 非字面量迭代域（param table/iter 链等）不收——留给 UNRESOLVED 盲区语义
  const forLoops = [];
  for (const m of ms) {
    if (m.ruleId !== 'rust-for') continue;
    const fm = m.text.match(
      /for\s+(\([^)]*\)|[A-Za-z_]\w*)\s+in\s+&?(?:mut\s+)?\[/);
    if (!fm) continue;
    const open = m.text.indexOf('[', fm.index + fm[0].length - 1);
    const seg = m.text.slice(open + 1, m.text.lastIndexOf(']'));
    const pat = fm[1].trim();
    const vars = pat.startsWith('(')
      ? Object.fromEntries(pat.slice(1, -1).split(',')
          .map((v, i) => [v.trim(), i]).filter(([v]) => /^[A-Za-z_]\w*$/.test(v)))
      : { [pat]: 0 };
    const items = splitTop(seg).map((item) => {
      const t = item.trim();
      if (!pat.startsWith('(')) {
        const lit = t.match(/^"([^"]*)"|^'([^']*)'/);
        return lit ? (lit[1] ?? lit[2]) : null;
      }
      if (!t.startsWith('(')) return null;
      const elems = splitTop(t.slice(1, t.lastIndexOf(')')));
      return elems.map((e) => {
        const lit = e.trim().match(/^"([^"]*)"|^'([^']*)'/);
        return lit ? (lit[1] ?? lit[2]) : null;
      });
    });
    if (items.length)
      forLoops.push({ vars, items,
        start: m.range.byteOffset.start, end: m.range.byteOffset.end });
  }
  return { fileMods: mods, inline, cfg, forLoops };
}

// 顶层逗号切分（括号/字符串感知）——callArgs 与 for 数组项共用
function splitTop(inner) {
  const out = [];
  let depth = 0, cur = '', q = null;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (q) {
      cur += ch;
      if (ch === '\\') { cur += inner[++i] || ''; continue; }
      if (ch === q) q = null;
      continue;
    }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// call_expression 顶层参数切分（括号/字符串感知——嵌套调用与闭包不误切）
function callArgs(text) {
  const open = text.indexOf('(');
  const close = text.lastIndexOf(')');
  if (open < 0 || close <= open) return [];
  const args = [];
  let depth = 0, cur = '', q = null;
  const inner = text.slice(open + 1, close);
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (q) {
      cur += ch;
      if (ch === '\\') { cur += inner[++i] || ''; continue; } // 吃掉转义对
      if (ch === q) q = null;
      continue;
    }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) { args.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  if (cur.trim()) args.push(cur.trim());
  return args;
}
const STR_LIT = /^"([^"]*)"|^'([^']*)'/;
const IDENT = /^[A-Za-z_]\w*$/;

// 匹配分发。ctx={root,rel,line,extractor,out,prepared}；返回 true=已处理
export function handle(id, m, ctx) {
  const { root, rel, extractor, out, prepared } = ctx;
  const line = m.range.start.line + 1;
  const gated = (st) => prepared?.cfg?.has(st) || false;
  if (id === 'rust-use') {
    const inls = (prepared?.inline || [])
      .filter((x) => x.range.byteOffset.start < m.range.byteOffset.start &&
                     m.range.byteOffset.end <= x.range.byteOffset.end)
      .sort((a, b) => a.range.byteOffset.start - b.range.byteOffset.start);
    const chain = inls
      .map((x) => (x.text.match(/mod\s+([A-Za-z_]\w*)/) || [])[1])
      .filter(Boolean);
    const pub = /^\s*pub\s+(?!\()/.test(m.text);
    // use 住在 cfg 门内联 mod 里同样被门——传递标记
    const cfg = gated(m.range.byteOffset.start) ||
      inls.some((x) => gated(x.range.byteOffset.start));
    const leaves = useLeaves(m.text);
    if (!leaves.length) {
      out.push(fact({ file: rel, line, name: '(unparsed)',
        fidelity: 'syntactic', scope: 'unresolved', extractor,
        unit: rel, kind: 'import',
        extra: { to: null, mechanism: pub ? 'rust-pub-use' : 'rust-use',
          dead: true, ...(cfg ? { cfg: true } : {}) } }));
      if (pub) out.push(fact({ file: rel, line, name: '(unparsed)',
        fidelity: 'syntactic', scope: 'unresolved', extractor,
        unit: rel, kind: 'export',
        extra: { to: null, mechanism: 'rust-pub-use', dead: true,
          ...(cfg ? { cfg: true } : {}) } }));
      return true;
    }
    for (const leaf of leaves) {
      const r = resolveSpec(root, rel, leaf,
        { fileMods: prepared?.fileMods, inline: chain });
      const base = { file: rel, line, name: leaf, fidelity: 'syntactic',
        scope: r.external ? 'external' : (r.dead ? 'unresolved' : 'module'),
        extractor };
      out.push(fact({ ...base, unit: rel, kind: 'import',
        extra: { to: r.to, mechanism: pub ? 'rust-pub-use' : 'rust-use',
          ...(r.dead ? { dead: true } : {}),
          ...(r.external ? { external: true } : {}),
          ...(cfg ? { cfg: true } : {}) } }));
      if (pub) out.push(fact({ ...base, unit: rel, kind: 'export',
        extra: { to: r.to, mechanism: 'rust-pub-use',
          ...(r.dead ? { dead: true } : {}),
          ...(r.external ? { external: true } : {}),
          ...(cfg ? { cfg: true } : {}) } }));
    }
    return true;
  }
  if (id === 'rust-mod') {
    const nm = (m.text.match(/mod\s+([A-Za-z_]\w*)/) || [])[1] || '?';
    const cfg = gated(m.range.byteOffset.start);
    out.push(fact({ unit: `${rel}#${nm}`, kind: 'decl', name: nm,
      file: rel, line, fidelity: 'syntactic', scope: 'file-local',
      extractor, extra: { shape: 'mod', surface: surface(m.text),
        ...(cfg ? { cfg: true } : {}) } }));
    // mod foo {…} 内联模块不产依赖边；mod foo; 产文件级边
    if (!/\{/.test(m.text)) {
      const r = resolveMod(root, rel, nm);
      out.push(fact({ unit: rel, kind: 'import', name: nm,
        file: rel, line, fidelity: 'syntactic',
        scope: r.dead ? 'unresolved' : 'module', extractor,
        extra: { to: r.to, mechanism: 'mod-decl',
          ...(r.dead ? { dead: true } : {}),
          ...(cfg ? { cfg: true } : {}) } }));
    }
    return true;
  }
  // rust-for：prepare 已消费（循环域表），自身不产事实
  if (id === 'rust-for') return true;
  // rust-ref-N：契约 producer 规格驱动的符号位边（ops-register/ops-dispatch
  // 这类机制形状由采纳仓 boundaries.yaml 自带，本文件不内嵌词表）
  if (id.startsWith('rust-ref-')) {
    const spec = ctx.ref?.[Number(id.slice(9))];
    if (!spec) return true;
    if (spec.units_in && ![].concat(spec.units_in)
      .some((p) => globMatch(rel, p))) return true;
    const calleeM = m.text.match(/^\s*([A-Za-z_]\w*(?:::[A-Za-z_]\w*)*)\s*\(/);
    const callee = calleeM ? calleeM[1].split('::').pop() : null;
    if (!callee || !new RegExp(spec.callee).test(callee)) return true;
    const args = callArgs(m.text);
    // name_args 各位取字面量；for_expand 位遇 ident 时查包围 for 循环
    // 字面量域展开（无命中循环/非字面量参数 → name 置 'UNRESOLVED' 段，
    // scope unresolved——parity 集收进名字即被 undeclared 侧翻出，或契约
    // 以 'UNRESOLVED.*' 豁免词显式登记盲区；不静默吞）
    const expandSet = new Set([].concat(spec.for_expand ?? []));
    const expand = (ai) => {
      const t = args[ai] || '';
      const lit = t.match(STR_LIT);
      if (lit) return [lit[1] ?? lit[2]];
      if (expandSet.has(ai) && IDENT.test(t)) {
        const loop = (prepared?.forLoops || [])
          .find((l) => l.vars?.[t] != null &&
            l.start < m.range.byteOffset.start &&
            m.range.byteOffset.end <= l.end);
        if (loop) {
          const pos = loop.vars[t];
          const vals = loop.items
            .map((it) => Array.isArray(it) ? it[pos] : it)
            .filter((v) => v != null);
          if (vals.length) return vals;
        }
      }
      // 常量表解析：限定/裸 ident（ops::CTOR_MEMBER 取尾段）经契约
      // const_files 建表命中即取字面量值——值从源码实读不拟合
      const q = t.match(/^[A-Za-z_]\w*(?:::[A-Za-z_]\w*)*$/);
      if (q && spec._consts?.has(q[0].split('::').pop()))
        return [spec._consts.get(q[0].split('::').pop())];
      return [null];
    };
    const domains = spec.name_args.map((ai) => expand(ai));
    // symbol_arg 候选位数组：首个 IDENT 胜出（register_stub 的
    // 4 参形态 (i,m,reason,op) 里 arg2 是字面量原因串——skip 到 arg3）
    const sym = (() => {
      for (const ai of [].concat(spec.symbol_arg ?? []))
        if (IDENT.test(args[ai] || '')) return args[ai];
      return null;
    })();
    const combos = [[]];
    for (const dom of domains) {
      const next = [];
      for (const c of combos) for (const v of dom) next.push([...c, v]);
      combos.length = 0; combos.push(...next);
    }
    for (const combo of combos) {
      const resolved = combo.every((v) => v != null);
      const name = combo.map((v) => v ?? 'UNRESOLVED').join('.');
      out.push(fact({ unit: sym ? `${rel}#${sym}` : rel, kind: 'ref',
        name, file: rel, line, fidelity: 'syntactic',
        scope: resolved ? 'module' : 'unresolved', extractor,
        extra: { mechanism: spec.mechanism, role: spec.role,
          ...(sym ? { symbol: sym } : {}),
          ...(gated(m.range.byteOffset.start) ? { cfg: true } : {}) } }));
    }
    return true;
  }
  const declKind = id.startsWith('rust-decl-') ? id.slice(10) : null;
  if (declKind && DECL_NAME_RE[declKind]) {
    const nm = (m.text.match(DECL_NAME_RE[declKind]) || [])[1] || null;
    out.push(fact({ unit: `${rel}#${nm || '?'}`, kind: 'decl',
      name: nm || m.text.slice(0, 40), file: rel, line,
      fidelity: 'syntactic', scope: 'file-local', extractor,
      extra: { shape: DECL_SHAPE[declKind] || declKind,
        surface: surface(m.text),
        ...(gated(m.range.byteOffset.start) ? { cfg: true } : {}) } }));
    return true;
  }
  return false;
}

export const handles = (id) =>
  RUST_IDS.has(id) || id === 'rust-for' || id.startsWith('rust-ref-');

// --allow-degraded/ast 单件失败时的 regex 兜底（fidelity 自带戳记，禁拟合宏语义）
// refSpecs 在场时同消费契约 producer 规格产 ref 边——regex 档只认字面量
// 参数；ident/非字面量一律 UNRESOLVED 段（for 展开是 ast 专属能力，
// 降级层不模拟），超大巨件（>AST_MAX 被 ast-grep 静默跳过）靠此保住
// dispatch/register 字面量面
export function regexFacts(root, rel, extractor, refSpecs) {
  const out = [];
  const text = fs.readFileSync(path.join(root, rel), 'utf8');
  // 降级档也收文件级 mod 声明名（内联深度不可知，super 按文件位算——已标戳）
  const fileMods = new Set(
    [...text.matchAll(/\bmod\s+([A-Za-z_]\w*)\s*[;{]/g)].map((m) => m[1]));
  const ctx = { fileMods };
  const refSpecsOk = (refSpecs || []).filter((s) =>
    !s.units_in || [].concat(s.units_in).some((p) => globMatch(rel, p)));
  const CALL_RE = /([A-Za-z_]\w*(?:::[A-Za-z_]\w*)*)\s*\(/g;
  let li = 0, lineOff = 0;
  for (const l of text.split(/\r?\n/)) {
    li++;
    const at = lineOff;                    // 本行起点 byteOffset（cfg 回探用）
    lineOff += l.length + 1;               // \r\n 差一字节——仅用于回探可容差
    // ref 生产（regex 档）：行内 callee 调用字面量参数抽取；
    // ident/嵌套参数 → UNRESOLVED（不调 for 展开——ast 专属）
    if (refSpecsOk.length)
      for (const cm of l.matchAll(CALL_RE)) {
        const callee = cm[1].split('::').pop();
        for (const spec of refSpecsOk) {
          if (!new RegExp(spec.callee).test(callee)) continue;
          const argText = l.slice(cm.index + cm[0].length);
          const args = callArgs(callee + '(' + argText);
          const domains = spec.name_args.map((ai) => {
            const t = args[ai] || '';
            const lit = t.match(STR_LIT);
            if (lit) return [lit[1] ?? lit[2]];
            // 常量表同 AST 路径（for 展开仍是 ast 专属不模拟）
            const q = t.match(/^[A-Za-z_]\w*(?:::[A-Za-z_]\w*)*$/);
            if (q && spec._consts?.has(q[0].split('::').pop()))
              return [spec._consts.get(q[0].split('::').pop())];
            return [null];
          });
          const combos = [[]];
          for (const dom of domains) {
            const nx = [];
            for (const c of combos) for (const v of dom) nx.push([...c, v]);
            combos.length = 0; combos.push(...nx);
          }
          const sym = (() => {
            for (const ai of [].concat(spec.symbol_arg ?? []))
              if (IDENT.test(args[ai] || '')) return args[ai];
            return null;
          })();
          for (const combo of combos) {
            const resolved = combo.every((v) => v != null);
            out.push(fact({ unit: sym ? `${rel}#${sym}` : rel,
              kind: 'ref', file: rel, line: li,
              name: combo.map((v) => v ?? 'UNRESOLVED').join('.'),
              fidelity: 'regex-degraded',
              scope: resolved ? 'module' : 'unresolved', extractor,
              extra: { mechanism: spec.mechanism, role: spec.role,
                ...(sym ? { symbol: sym } : {}),
                ...(cfgGated(text, at + cm.index) ? { cfg: true } : {}) } }));
          }
        }
      }
    let m = l.match(/^\s*(pub(?:\s*\([^)]*\))?\s+)?use\s+([^;]+);/);
    if (m) {
      const pub = !!(m[1] && !m[1].includes('('));
      const cfg = cfgGated(text, at + m.index);
      const leaves = useLeaves(l);
      for (const leaf of leaves.length ? leaves : [m[2].trim()]) {
        const r = resolveSpec(root, rel, leaf, ctx);
        out.push(fact({ unit: rel, kind: 'import', name: leaf, file: rel,
          line: li, fidelity: 'regex-degraded',
          scope: r.external ? 'external' : (r.dead ? 'unresolved' : 'module'),
          extractor,
          extra: { to: r.to, mechanism: pub ? 'rust-pub-use' : 'rust-use',
            ...(r.dead ? { dead: true } : {}),
            ...(r.external ? { external: true } : {}),
            ...(cfg ? { cfg: true } : {}) } }));
      }
      continue;
    }
    m = l.match(/^\s*(pub(?:\s*\([^)]*\))?\s+)?mod\s+([A-Za-z_]\w*)\s*;/);
    if (m) {
      const r = resolveMod(root, rel, m[2]);
      const cfg = cfgGated(text, at + m.index);
      out.push(fact({ unit: rel, kind: 'import', name: m[2], file: rel,
        line: li, fidelity: 'regex-degraded',
        scope: r.dead ? 'unresolved' : 'module', extractor,
        extra: { to: r.to, mechanism: 'mod-decl',
          ...(r.dead ? { dead: true } : {}),
          ...(cfg ? { cfg: true } : {}) } }));
      out.push(fact({ unit: `${rel}#${m[2]}`, kind: 'decl', name: m[2],
        file: rel, line: li, fidelity: 'regex-degraded', scope: 'file-local',
        extractor, extra: { shape: 'mod',
          surface: m[1] ? 'public' : 'internal',
          ...(cfg ? { cfg: true } : {}) } }));
      continue;
    }
    m = l.match(/^\s*(pub(?:\s*\([^)]*\))?\s+)?(?:async\s+|unsafe\s+|extern\s+"[^"]+"\s+)*fn\s+([A-Za-z_]\w*)/)
      || l.match(/^\s*(pub(?:\s*\([^)]*\))?\s+)?(struct|enum|union|trait|type|const|static)\s+(?:mut\s+)?([A-Za-z_]\w*)/)
      || l.match(/^\s*macro_rules!\s*([A-Za-z_]\w*)/);
    if (m) {
      const nm = m[2] && !/^(struct|enum|union|trait|type|const|static)$/.test(m[2])
        ? m[2] : (m[3] || m[1]);
      const isFn = /fn\s/.test(l) || /macro_rules!/.test(l);
      const pubKw = l.match(/^\s*pub\s+(?!\()/);
      out.push(fact({ unit: `${rel}#${nm}`, kind: 'decl', name: nm,
        file: rel, line: li, fidelity: 'regex-degraded', scope: 'file-local',
        extractor,
        extra: { shape: isFn ? (/macro_rules!/.test(l) ? 'macro' : 'fn')
                            : (m[2] || 'type'),
          surface: pubKw ? 'public' : 'internal',
          ...(cfgGated(text, at + m.index) ? { cfg: true } : {}) } }));
    }
  }
  return out;
}
