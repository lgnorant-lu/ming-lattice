// lib/langs/rust.mjs — Rust 语法级前端描述符（ADR-0010 syntactic 档）
// 面：use/mod x; → import 边、pub use → import+export 双发、
//     fn/struct/enum/trait/type/macro_rules! → decl。
// 解析语义：crate:: 锚本 crate src/ 最长前缀；self/super 按 modDir(孩子目录)；
//   tests|benches|examples|src/bin 直子文件=cargo crate 根；裸 ident 经文件级
//   mod 声明分流本地/外部；内联 mod {} 深度计入 super。
// 明确不做：宏展开 / cfg / feature 门 / 内联 mod 内再嵌套 mod 的 mod-decl——
//   这些是语义层，走外部 precise 证据源（scip/rust-analyzer → --facts-extra）。
import fs from 'node:fs';
import path from 'node:path';
import { fact } from '../facts.mjs';

export const exts = new Set(['.rs']);

export const rules = `
id: rust-use
language: Rust
rule:
  kind: use_declaration
---
id: rust-mod
language: Rust
rule:
  kind: mod_item
---
id: rust-fn
language: Rust
rule:
  kind: function_item
---
id: rust-struct
language: Rust
rule:
  kind: struct_item
---
id: rust-enum
language: Rust
rule:
  kind: enum_item
---
id: rust-trait
language: Rust
rule:
  kind: trait_item
---
id: rust-type
language: Rust
rule:
  kind: type_item
---
id: rust-macro
language: Rust
rule:
  kind: macro_definition
`.trim();

const RUST_DECL_RE = {
  'rust-fn': /fn\s+([A-Za-z_]\w*)/,
  'rust-struct': /struct\s+([A-Za-z_]\w*)/,
  'rust-enum': /enum\s+([A-Za-z_]\w*)/,
  'rust-trait': /trait\s+([A-Za-z_]\w*)/,
  'rust-type': /type\s+([A-Za-z_]\w*)/,
  'rust-macro': /macro_rules!\s*([A-Za-z_]\w*)/,
};

const RUST_IDS = new Set(['rust-use', 'rust-mod', ...Object.keys(RUST_DECL_RE)]);

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
  let base = null, i = 0;
  if (segs[0] === 'crate') {
    const parts = dir.split('/');
    const srcAt = parts.lastIndexOf('src');
    if (srcAt < 0) return { to: null, external: false, dead: true };
    base = parts.slice(0, srcAt + 1).join('/'); i = 1;
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
  const selfFile = [`${base}.rs`, `${base}/mod.rs`, `${base}/lib.rs`,
    `${base}/main.rs`];
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

// per-file 预处理：文件级 mod 声明名集 + 内联 mod 匹配（内联深度给 use 用）
export function prepare(ms) {
  const mods = new Set(ms.filter((x) => x.ruleId === 'rust-mod')
    .map((x) => (x.text.match(/mod\s+([A-Za-z_]\w*)/) || [])[1])
    .filter(Boolean));
  const inline = ms.filter((x) => x.ruleId === 'rust-mod' && /\{/.test(x.text));
  return { fileMods: mods, inline };
}

// 匹配分发。ctx={root,rel,line,extractor,out,prepared}；返回 true=已处理
export function handle(id, m, ctx) {
  const { root, rel, extractor, out, prepared } = ctx;
  const line = m.range.start.line + 1;
  if (id === 'rust-use') {
    const spec = useSpec(m.text);
    const chain = (prepared?.inline || [])
      .filter((x) => x.range.byteOffset.start < m.range.byteOffset.start &&
                     m.range.byteOffset.end <= x.range.byteOffset.end)
      .sort((a, b) => a.range.byteOffset.start - b.range.byteOffset.start)
      .map((x) => (x.text.match(/mod\s+([A-Za-z_]\w*)/) || [])[1])
      .filter(Boolean);
    const r = spec
      ? resolveSpec(root, rel, spec, { fileMods: prepared?.fileMods, inline: chain })
      : { to: null, external: false, dead: true };
    const pub = /^\s*pub\s+(?!\()/.test(m.text);
    const base = { file: rel, line, name: spec || '(unparsed)',
      fidelity: 'syntactic',
      scope: r.external ? 'external' : (r.dead ? 'unresolved' : 'module'),
      extractor };
    out.push(fact({ ...base, unit: rel, kind: 'import',
      extra: { to: r.to, mechanism: pub ? 'rust-pub-use' : 'rust-use',
        ...(r.dead ? { dead: true } : {}),
        ...(r.external ? { external: true } : {}) } }));
    if (pub) out.push(fact({ ...base, unit: rel, kind: 'export',
      extra: { to: r.to, mechanism: 'rust-pub-use',
        ...(r.dead ? { dead: true } : {}),
        ...(r.external ? { external: true } : {}) } }));
    return true;
  }
  if (id === 'rust-mod') {
    const nm = (m.text.match(/mod\s+([A-Za-z_]\w*)/) || [])[1] || '?';
    out.push(fact({ unit: `${rel}#${nm}`, kind: 'decl', name: nm,
      file: rel, line, fidelity: 'syntactic', scope: 'file-local',
      extractor, extra: { shape: 'mod', surface: surface(m.text) } }));
    // mod foo {…} 内联模块不产依赖边；mod foo; 产文件级边
    if (!/\{/.test(m.text)) {
      const r = resolveMod(root, rel, nm);
      out.push(fact({ unit: rel, kind: 'import', name: nm,
        file: rel, line, fidelity: 'syntactic',
        scope: r.dead ? 'unresolved' : 'module', extractor,
        extra: { to: r.to, mechanism: 'mod-decl',
          ...(r.dead ? { dead: true } : {}) } }));
    }
    return true;
  }
  if (RUST_DECL_RE[id]) {
    const nm = (m.text.match(RUST_DECL_RE[id]) || [])[1] || null;
    out.push(fact({ unit: `${rel}#${nm || '?'}`, kind: 'decl',
      name: nm || m.text.slice(0, 40), file: rel, line,
      fidelity: 'syntactic', scope: 'file-local', extractor,
      extra: { shape: id.replace('rust-', ''), surface: surface(m.text) } }));
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
  let li = 0;
  for (const l of text.split(/\r?\n/)) {
    li++;
    let m = l.match(/^\s*(pub(?:\s*\([^)]*\))?\s+)?use\s+([^;]+);/);
    if (m) {
      const spec = useSpec(l) || m[2].trim();
      const r = resolveSpec(root, rel, spec, ctx);
      const pub = !!(m[1] && !m[1].includes('('));
      out.push(fact({ unit: rel, kind: 'import', name: spec, file: rel,
        line: li, fidelity: 'regex-degraded',
        scope: r.external ? 'external' : (r.dead ? 'unresolved' : 'module'),
        extractor,
        extra: { to: r.to, mechanism: pub ? 'rust-pub-use' : 'rust-use',
          ...(r.dead ? { dead: true } : {}),
          ...(r.external ? { external: true } : {}) } }));
      continue;
    }
    m = l.match(/^\s*(pub(?:\s*\([^)]*\))?\s+)?mod\s+([A-Za-z_]\w*)\s*;/);
    if (m) {
      const r = resolveMod(root, rel, m[2]);
      out.push(fact({ unit: rel, kind: 'import', name: m[2], file: rel,
        line: li, fidelity: 'regex-degraded',
        scope: r.dead ? 'unresolved' : 'module', extractor,
        extra: { to: r.to, mechanism: 'mod-decl', ...(r.dead ? { dead: true } : {}) } }));
      out.push(fact({ unit: `${rel}#${m[2]}`, kind: 'decl', name: m[2],
        file: rel, line: li, fidelity: 'regex-degraded', scope: 'file-local',
        extractor, extra: { shape: 'mod',
          surface: m[1] ? 'public' : 'internal' } }));
      continue;
    }
    m = l.match(/^\s*(pub(?:\s*\([^)]*\))?\s+)?(?:async\s+|unsafe\s+|extern\s+"[^"]+"\s+)*fn\s+([A-Za-z_]\w*)/)
      || l.match(/^\s*(pub(?:\s*\([^)]*\))?\s+)?(struct|enum|trait|type)\s+([A-Za-z_]\w*)/)
      || l.match(/^\s*macro_rules!\s*([A-Za-z_]\w*)/);
    if (m) {
      const nm = m[2] && !['struct','enum','trait','type'].includes(m[2])
        ? m[2] : (m[3] || m[1]);
      const isFn = /fn\s/.test(l) || /macro_rules!/.test(l);
      const pubKw = l.match(/^\s*pub\s+(?!\()/);
      out.push(fact({ unit: `${rel}#${nm}`, kind: 'decl', name: nm,
        file: rel, line: li, fidelity: 'regex-degraded', scope: 'file-local',
        extractor,
        extra: { shape: isFn ? (/macro_rules!/.test(l) ? 'macro' : 'function')
                            : (m[2] || 'type'),
          surface: pubKw ? 'public' : 'internal' } }));
    }
  }
  return out;
}
