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
import { fact } from '../facts.mjs';
import { derived } from './rust.derived.mjs';

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
const DECL_KINDS = [...new Map(derived.declKinds
  .filter((d) => !EDGE_OWNED.has(d.kind))
  .map((d) => [d.kind, d])).values()];

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

export const rules = EDGE_RULES + '\n---\n' + DECL_KINDS.map((d) =>
  `id: rust-decl-${d.kind}\nlanguage: Rust\nrule:\n  kind: ${d.kind}`).join('\n---\n');

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
  static_item: /static\s+([A-Za-z_]\w*)/,
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

// use 路径原文：`[pub[..]] use <path>;`——列表取模块前缀、别名取原名、glob 取父模块
function useSpec(text) {
  const m = text.match(/^\s*(?:pub(?:\s*\([^)]*\))?\s+)?use\s+(.+?)\s*;?\s*$/s);
  if (!m) return null;
  let p = m[1].trim();
  p = p.replace(/\s*::\s*\{[^}]*\}\s*$/, '');
  p = p.replace(/\s+as\s+[A-Za-z_]\w*\s*$/, '');
  p = p.replace(/\s*::\s*\*\s*$/, '');
  return p || null;
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
  return { fileMods: mods, inline, cfg };
}

// 匹配分发。ctx={root,rel,line,extractor,out,prepared}；返回 true=已处理
export function handle(id, m, ctx) {
  const { root, rel, extractor, out, prepared } = ctx;
  const line = m.range.start.line + 1;
  const gated = (st) => prepared?.cfg?.has(st) || false;
  if (id === 'rust-use') {
    const spec = useSpec(m.text);
    const inls = (prepared?.inline || [])
      .filter((x) => x.range.byteOffset.start < m.range.byteOffset.start &&
                     m.range.byteOffset.end <= x.range.byteOffset.end)
      .sort((a, b) => a.range.byteOffset.start - b.range.byteOffset.start);
    const chain = inls
      .map((x) => (x.text.match(/mod\s+([A-Za-z_]\w*)/) || [])[1])
      .filter(Boolean);
    const r = spec
      ? resolveSpec(root, rel, spec, { fileMods: prepared?.fileMods, inline: chain })
      : { to: null, external: false, dead: true };
    const pub = /^\s*pub\s+(?!\()/.test(m.text);
    // use 住在 cfg 门内联 mod 里同样被门——传递标记
    const cfg = gated(m.range.byteOffset.start) ||
      inls.some((x) => gated(x.range.byteOffset.start));
    const base = { file: rel, line, name: spec || '(unparsed)',
      fidelity: 'syntactic',
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

export const handles = (id) => RUST_IDS.has(id);

// --allow-degraded/ast 单件失败时的 regex 兜底（fidelity 自带戳记，禁拟合宏语义）
export function regexFacts(root, rel, extractor) {
  const out = [];
  const text = fs.readFileSync(path.join(root, rel), 'utf8');
  // 降级档也收文件级 mod 声明名（内联深度不可知，super 按文件位算——已标戳）
  const fileMods = new Set(
    [...text.matchAll(/\bmod\s+([A-Za-z_]\w*)\s*[;{]/g)].map((m) => m[1]));
  const ctx = { fileMods };
  let li = 0, lineOff = 0;
  for (const l of text.split(/\r?\n/)) {
    li++;
    const at = lineOff;                    // 本行起点 byteOffset（cfg 回探用）
    lineOff += l.length + 1;               // \r\n 差一字节——仅用于回探可容差
    let m = l.match(/^\s*(pub(?:\s*\([^)]*\))?\s+)?use\s+([^;]+);/);
    if (m) {
      const spec = useSpec(l) || m[2].trim();
      const r = resolveSpec(root, rel, spec, ctx);
      const pub = !!(m[1] && !m[1].includes('('));
      const cfg = cfgGated(text, at + m.index);
      out.push(fact({ unit: rel, kind: 'import', name: spec, file: rel,
        line: li, fidelity: 'regex-degraded',
        scope: r.external ? 'external' : (r.dead ? 'unresolved' : 'module'),
        extractor,
        extra: { to: r.to, mechanism: pub ? 'rust-pub-use' : 'rust-use',
          ...(r.dead ? { dead: true } : {}),
          ...(r.external ? { external: true } : {}),
          ...(cfg ? { cfg: true } : {}) } }));
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
      || l.match(/^\s*(pub(?:\s*\([^)]*\))?\s+)?(struct|enum|union|trait|type|const|static)\s+([A-Za-z_]\w*)/)
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
