#!/usr/bin/env node
// extract-facts.mjs — 仓库事实提取器（ADR-0008 D1/D6 首参考实现）
// 分支覆盖：file（文件域）/ import-export（符号边）/ decl（声明）/ link（部署链接）
// 前端：ast-grep（syntactic）→ 缺前端时 fail-closed，--allow-degraded 才降 regex
// 输出：确定性 JSONL（file→line→kind→name 排序），stdout 或 --out
// 用法: node extract-facts.mjs [--root DIR] [--out FILE] [--allow-degraded]
//       [--extract-dirs d1,d2] [--no-content-scan] [--files f1,f2]
//       [--no-md-scan] [--no-ignore-scan]
// --files: 只抽给定仓相对路径子集（pre-commit staged 面用；逗号分隔，
//          文件名含逗号者不支持）。工作区缺席条目静默跳过（无边可抽）
// v1.1 适配器：md 扫描（docrole/docref/mention 二遍）与 git check-ignore
//   declare 边默认开启，--no-md-scan / --no-ignore-scan 单独关闭
// 内容扫描谓词：缺省=全部支持扩展名且未被忽略声明的文件（vendored/venv/
//   产物树只留 file/dir/declare 事实）；--extract-dirs 显式收窄优先；
//   gitignore oracle 仅在 --root 为 worktree 顶时激活（父仓声明不记子树账）

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fact, domainOf, toJsonl } from './lib/facts.mjs';
import { findAstGrep } from './lib/frontends.mjs';
import { mdFacts, MD_EXTRACTOR, MD_EXT } from './lib/adapters/markdown.mjs';
import { gitignoreFacts, GI_EXTRACTOR } from './lib/adapters/gitignore.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../../..');

const JS_EXT = new Set(['.mjs', '.js', '.cjs', '.jsx']);
const TS_EXT = new Set(['.ts', '.mts', '.cts']);
const TSX_EXT = new Set(['.tsx']);
const RUST_EXT = new Set(['.rs']);
const PS_EXT = new Set(['.ps1', '.psm1']);
// 内容扫描谓词（v1.1a 修正）：缺省 = 全部支持扩展名且未被 .gitignore 声明
// 忽略的文件——目录白名单硬编码是本仓私货（js逆向/ 项目资料/ crates/ 这类
// 真仓目录词表根本对不上，沉默跳过=抽取器退化成文件枚举器）。
// --extract-dirs 显式收窄优先；git 顶缺席（无 oracle）→ 全扫。
const IGNORE_DIRS = new Set([
  '.git', 'node_modules', 'distill', '.logs', 'runs', 'target',
  'artifacts', 'out', '.venv', '__pycache__', '.trash',
]);

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
`.trim();

// TS/TSX 复用同一规则集（tree-sitter-typescript 节点名与 js 同构）——只换 language 头
const AST_RULES_TS = AST_RULES.replace(/language: JavaScript/g, 'language: TypeScript');
const AST_RULES_TSX = AST_RULES.replace(/language: JavaScript/g, 'language: Tsx');

// Rust 语法级前端（ADR-0010 syntactic 档）：use/mod/fn/struct/enum/trait/type/macro_rules。
// 不碰宏展开/cfg/feature 语义——那些走外部 precise 证据源（scip/rust-analyzer 适配器）。
const AST_RULES_RUST = `
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

const DECL_RE = {
  'decl-function': /function\s*\*?\s*([\w$]+)/,
  'decl-generator': /function\s*\*?\s*([\w$]+)/,
  'decl-class': /class\s+([\w$]+)/,
  'decl-method': /^\s*(?:static\s+)?(?:async\s+)?(?:get\s+|set\s+)?[\*]?\s*([\w$]+)/,
  'decl-arrow': /^\s*(?:[\w$]+\s*[:,]|(?:const|let|var)\s+)?([\w$]+)\s*=/,
};

const REL_SPEC = /^\.{1,2}\//;
const TRY_SUFFIX = ['', '.mjs', '.js', '.cjs', '.d.ts', '.ts', '.mts', '.cts', '.tsx',
  '.json', '/index.mjs', '/index.js', '/index.ts'];

function die(msg, code = 2) {
  console.error(`[extract-facts] ${msg}`);
  process.exit(code);
}

function parseArgs(argv) {
  const a = { root: REPO_ROOT, out: null, allowDegraded: false,
              extractDirs: null, contentScan: true, files: null,
              mdScan: true, ignoreScan: true };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    const take = () => argv[++i] ?? die(`${k} 缺参数`);
    if (k === '--root') a.root = path.resolve(take());
    else if (k === '--out') a.out = take();
    else if (k === '--allow-degraded') a.allowDegraded = true;
    else if (k === '--no-content-scan') a.contentScan = false;
    else if (k === '--no-md-scan') a.mdScan = false;
    else if (k === '--no-ignore-scan') a.ignoreScan = false;
    else if (k === '--extract-dirs') a.extractDirs = take().split(',').filter(Boolean);
    else if (k === '--files') a.files = take().split(',').filter(Boolean);
    else die(`未知旗标: ${k}`);
  }
  return a;
}

// ---------- 遍历：忽略集合 + junction 不穿透（实测语义，消费方 resolve 后自扫） ----------
function walk(dir, root, files, links, dirs) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return; }
  for (const e of ents) {
    const abs = path.join(dir, e.name);
    const rel = path.relative(root, abs).replace(/\\/g, '/');
    // junction/symlink：产 link 事实即停，不下钻（与 ast-grep 穿透语义一致）
    if (e.isSymbolicLink()) {
      let target = null, dead = false;
      try {
        const real = fs.realpathSync(abs);
        target = path.relative(root, real).replace(/\\/g, '/');
        if (target.startsWith('..')) target = abs; // 仓外目标记绝对路径
      } catch { dead = true; }
      links.push({ rel, to: dead ? null : target, dead });
      continue;
    }
    if (e.isDirectory()) {
      if (IGNORE_DIRS.has(e.name)) continue;
      dirs.push(rel); // v1.1: dir 事实（per-dir 覆盖断言主体，unit=rel+'/'）
      walk(abs, root, files, links, dirs);
    } else if (e.isFile()) {
      files.push({ rel, ext: path.extname(e.name).toLowerCase() });
    }
  }
}

// ---------- ast-grep 前端（探测实现收 lib/frontends.mjs——抽取器与测试共用） ----------

function runAstGrep(bin, filesAbs, rules) {
  // 分批喂文件（命令行长度上限）；--json=stream 一行一 match
  // 单文件韧性链：批级失败（ENOBUFS/ast-grep 内部错）→ 二分降级到单文件；
  // 单文件仍失败 → 收残余 stdout 后交回 regex 降级（degraded 集），
  // 不让一个坏文件 die 掉整仓抽取（实证：2.2MB 混淆单行文件
  // 能产 4.6MB 输出后仍 os error 87 退出）。
  const out = [];
  const degraded = new Set();
  const harvest = (stdout) => {
    for (const line of (stdout || '').split('\n')) {
      if (line.trim()) { try { out.push(JSON.parse(line)); } catch {} }
    }
  };
  const scan = (batch) => {
    let r;
    try {
      r = spawnSync(bin, ['scan', '--inline-rules', rules,
        '--json=stream', ...batch], { encoding: 'utf8', maxBuffer: 512 << 20 });
    } catch (e) {
      // spawnSync 本身也会抛（ERR_STRING_TOO_LONG：单文件输出超 512MB
      // 字符串上限——巨型混淆文件逐节点 dump 能到）——同归批降级链
      r = { error: e, status: null, stdout: '', stderr: String(e.message) };
    }
    const broken = r.error || r.status !== 0;
    if (broken && batch.length > 1) {           // 批级失败 → 二分降级到单文件
      for (const f of batch) scan([f]);
      return;
    }
    if (broken) {                               // 单文件失败 → 收残余产出后降 regex
      degraded.add(batch[0]);                   // （ENOBUFS/os-87/读失败同归一路）
      harvest(r.stdout);
      return;
    }
    harvest(r.stdout);
  };
  const CHUNK = 60;
  for (let i = 0; i < filesAbs.length; i += CHUNK) {
    scan(filesAbs.slice(i, i + CHUNK));
  }
  return { matches: out, degraded };
}

// ---------- 事实翻译 ----------
function specFromText(text) {
  const m = text.match(/from\s+['"]([^'"]+)['"]/) ||
            text.match(/import\(\s*['"]([^'"]+)['"]\s*\)/) || // import('x') 动态字面量
            text.match(/import\s+['"]([^'"]+)['"]/);         // import 'x' 副作用式
  return m ? m[1] : null;
}

function resolveSpec(root, fromRel, spec) {
  if (!REL_SPEC.test(spec)) return { to: null, external: true };
  const base = path.posix.normalize(
    path.posix.join(path.posix.dirname(fromRel), spec));
  for (const suf of TRY_SUFFIX) {
    if (fs.existsSync(path.join(root, base + suf)))
      return { to: base + suf, external: false };
  }
  return { to: base, external: false, dead: true };
}

// ---------- Rust 语法级辅助（ADR-0010 syntactic 档） ----------

const RUST_DECL_RE = {
  'rust-fn': /fn\s+([A-Za-z_]\w*)/,
  'rust-struct': /struct\s+([A-Za-z_]\w*)/,
  'rust-enum': /enum\s+([A-Za-z_]\w*)/,
  'rust-trait': /trait\s+([A-Za-z_]\w*)/,
  'rust-type': /type\s+([A-Za-z_]\w*)/,
  'rust-macro': /macro_rules!\s*([A-Za-z_]\w*)/,
};

// 裸 `pub` 前缀=发布面；`pub(crate)`/`pub(super)`/`pub(in …)` 限域=internal
function rustSurface(text) {
  return /^\s*pub\s+(?!\()/.test(text) ? 'public' : 'internal';
}

// use 路径原文：`[pub[..]] use <path>;`——列表取模块前缀、别名取原名、glob 取父模块
function rustUseSpec(text) {
  const m = text.match(/^\s*(?:pub(?:\s*\([^)]*\))?\s+)?use\s+(.+?)\s*;?\s*$/s);
  if (!m) return null;
  let p = m[1].trim();
  p = p.replace(/\s*::\s*\{[^}]*\}\s*$/, '');
  p = p.replace(/\s+as\s+[A-Za-z_]\w*\s*$/, '');
  p = p.replace(/\s*::\s*\*\s*$/, '');
  return p || null;
}

// crate 根判定：mod/lib/main/build.rs 之外，cargo 自动发现面里
// tests|benches|examples/<file>.rs 与 src/bin/<file>.rs 各自是独立 crate 根
// （tests/foo.rs 的 `mod common;` 找兄弟 tests/common/，不是 foo/common/）
function isRustCrateRoot(rel) {
  const stem = path.posix.basename(rel).replace(/\.rs$/, '');
  if (['mod', 'lib', 'main', 'build'].includes(stem)) return true;
  const parts = path.posix.dirname(rel).split('/');
  const last = parts[parts.length - 1];
  if (['tests', 'benches', 'examples'].includes(last)) return true;
  if (last === 'bin' && parts[parts.length - 2] === 'src') return true;
  return false;
}

// crate:: 根=本文件所在 crate 的 src/ 目录；self::/super:: 相对目录；
// 裸 ident 首段：本文件 mod 声明过=本地模块（等价 self::），否则=外部 crate。
// ctx.fileMods=本文件 mod 声明名集；ctx.inline=包围 use 的内联 mod 名链（outer→inner），
// 内联深度会先压进位置再算 super——`mod tests { use super::super::x }` 的
// 第二个 super 才出到父模块。
function resolveRustSpec(root, fromRel, spec, ctx = {}) {
  const segs = spec.split('::').map((s) => s.trim()).filter(Boolean);
  if (!segs.length) return { to: null, external: false, dead: true };
  const dir = path.posix.dirname(fromRel);
  const stem = path.posix.basename(fromRel).replace(/\.rs$/, '');
  // modDir=本文件模块的孩子目录：crate 根文件=所在目录，具名文件 foo.rs=dir/foo
  const fileModDir = isRustCrateRoot(fromRel) ? dir : `${dir}/${stem}`;
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

// `mod foo;`：声明文件是 mod.rs/lib.rs/main.rs/build.rs 时子模块同级；
// 其余文件（a.rs）的子模块住 a/ 子目录（2018 版模块规则）
function resolveRustMod(root, fromRel, name) {
  const dir = path.posix.dirname(fromRel);
  const stem = path.posix.basename(fromRel).replace(/\.rs$/, '');
  const base = isRustCrateRoot(fromRel) ? dir : `${dir}/${stem}`;
  for (const cand of [`${base}/${name}.rs`, `${base}/${name}/mod.rs`])
    if (fs.existsSync(path.join(root, cand))) return { to: cand, external: false };
  return { to: `${base}/${name}.rs`, external: false, dead: true };
}

// --allow-degraded/ast 单件失败时的 regex 兜底（fidelity 自带戳记，禁拟合宏语义）
function rustRegexFacts(root, rel, extractorId) {
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
      const spec = rustUseSpec(l) || m[2].trim();
      const r = resolveRustSpec(root, rel, spec, ctx);
      const pub = !!(m[1] && !m[1].includes('('));
      out.push(fact({ unit: rel, kind: 'import', name: spec, file: rel,
        line: li, fidelity: 'regex-degraded',
        scope: r.external ? 'external' : (r.dead ? 'unresolved' : 'module'),
        extractor: extractorId,
        extra: { to: r.to, mechanism: pub ? 'rust-pub-use' : 'rust-use',
          ...(r.dead ? { dead: true } : {}),
          ...(r.external ? { external: true } : {}) } }));
      continue;
    }
    m = l.match(/^\s*(pub(?:\s*\([^)]*\))?\s+)?mod\s+([A-Za-z_]\w*)\s*;/);
    if (m) {
      const r = resolveRustMod(root, rel, m[2]);
      out.push(fact({ unit: rel, kind: 'import', name: m[2], file: rel,
        line: li, fidelity: 'regex-degraded',
        scope: r.dead ? 'unresolved' : 'module', extractor: extractorId,
        extra: { to: r.to, mechanism: 'mod-decl', ...(r.dead ? { dead: true } : {}) } }));
      out.push(fact({ unit: `${rel}#${m[2]}`, kind: 'decl', name: m[2],
        file: rel, line: li, fidelity: 'regex-degraded', scope: 'file-local',
        extractor: extractorId, extra: { shape: 'mod',
          surface: m[1] ? 'public' : 'internal' } }));
      continue;
    }
    m = l.match(/^\s*(pub(?:\s*\([^)]*\))?\s+)?(?:async\s+|unsafe\s+|extern\s+"[^"]+"\s+)*fn\s+([A-Za-z_]\w*)/)
      || l.match(/^\s*(pub(?:\s*\([^)]*\))?\s+)?(struct|enum|trait|type)\s+([A-Za-z_]\w*)/)
      || l.match(/^\s*macro_rules!\s*([A-Za-z_]\w*)/);
    if (m) {
      const nm = m[2] && !['struct','enum','trait','type'].includes(m[2]) ? m[2] : (m[3] || m[1]);
      const isFn = /fn\s/.test(l) || /macro_rules!/.test(l);
      const pubKw = l.match(/^\s*pub\s+(?!\()/);
      out.push(fact({ unit: `${rel}#${nm}`, kind: 'decl', name: nm,
        file: rel, line: li, fidelity: 'regex-degraded', scope: 'file-local',
        extractor: extractorId,
        extra: { shape: isFn ? (/macro_rules!/.test(l) ? 'macro' : 'function')
                            : (m[2] || 'type'),
          surface: pubKw ? 'public' : 'internal' } }));
    }
  }
  return out;
}

function psLineFacts(root, rel, text, extractorId) {
  const facts = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    let m = l.match(/^\s*(?:function|filter)\s+([A-Za-z][\w-]*)/i);
    if (m) {
      facts.push(fact({ unit: `${rel}#${m[1]}`, kind: 'decl', name: m[1],
        file: rel, line: i + 1, fidelity: 'regex-degraded', scope: 'file-local',
        extractor: extractorId, extra: { shape: 'function' } }));
      continue;
    }
    m = l.match(/^\s*\.\s+['"]([^'"]+)['"]/) || l.match(/^\s*\.\s+(\S+\.ps1)\b/);
    if (m) {
      const spec = m[1];
      const r = resolveSpec(root, rel, spec.replace(/\\/g, '/'));
      facts.push(fact({ unit: rel, kind: 'import', name: spec,
        file: rel, line: i + 1, fidelity: 'regex-degraded',
        scope: r.external ? 'external' : (r.dead ? 'unresolved' : 'module'),
        extractor: extractorId,
        extra: { to: r.to, mechanism: 'dot-source', ...(r.dead ? { dead: true } : {}) } }));
    }
  }
  return facts;
}

function main() {
  const a = parseArgs(process.argv);
  const root = a.root;
  if (!fs.existsSync(root)) die(`--root 不存在: ${root}`);

  const files = [], links = [], dirs = [];
  if (a.files) {
    // 显式文件集模式：逐项 lstat——符号链接产 link 事实，常规文件入内容抽面
    for (const rel0 of a.files) {
      const rel = rel0.replace(/\\/g, '/');
      const abs = path.join(root, rel);
      let st;
      try { st = fs.lstatSync(abs); } catch { continue; }
      if (st.isSymbolicLink()) {
        let target = null, dead = false;
        try {
          const real = fs.realpathSync(abs);
          target = path.relative(root, real).replace(/\\/g, '/');
          if (target.startsWith('..')) target = abs;
        } catch { dead = true; }
        links.push({ rel, to: dead ? null : target, dead });
      } else if (st.isFile()) {
        files.push({ rel, ext: path.extname(rel).toLowerCase() });
      }
    }
  } else {
    walk(root, root, files, links, dirs);
  }
  // 登记在册的 submodule 内路径会让 check-ignore fatal 128——
  // 从 .gitmodules 取登记前缀剔除；普通嵌套仓（vertical 物化含 .git）
  // 照喂不误——父仓忽略规则对它们照常答。
  const subPrefixes = (() => {
    try {
      const gm = fs.readFileSync(path.join(root, '.gitmodules'), 'utf8');
      return [...gm.matchAll(/^\s*path\s*=\s*(\S+)\s*$/gm)]
        .map((m) => m[1].replace(/\\/g, '/') + '/');
    } catch { return []; }
  })();
  const inSub = (rel) => subPrefixes.some((s) => rel.startsWith(s));

  const facts = [];
  const sg = findAstGrep();
  const astId = sg ? `ast-grep@${sg.ver}` : null;
  const regId = 'line-regex@1';
  const fileExists = (rel) => { try { return fs.existsSync(path.join(root, rel)); } catch { return false; } };
  const mentionCands = []; // [{docRel, name, line}] —— decl 符号表齐了再二遍解析

  // declare 边（v1.1）：git check-ignore oracle——先于内容扫描跑，
  // 返回的 ignored 集兼任"内容扫描剪枝面"（被忽略树只留 file/dir/declare
  // 事实，不读内容——vendored/venv/产物树的死链与符号属上游账面噪音）
  let ignored = new Set();
  if (a.ignoreScan) {
    const gi = gitignoreFacts(root,
      files.map((f) => f.rel).filter((r) => !inSub(r)));
    facts.push(...gi.facts);
    ignored = gi.ignored;
  }
  // 内容扫描谓词：--extract-dirs 显式收窄优先；缺省=非忽略声明件全扫；
  // submodule 内文件同样不读内容——那是另一个仓的治理面（file/dir 事实照产）
  const inScope = (f) => a.extractDirs
    ? a.extractDirs.includes(f.rel.split('/')[0])
    : !ignored.has(f.rel) && !inSub(f.rel);

  for (const { rel, ext } of files) {
    let extra;
    if (a.mdScan && MD_EXT.has(ext) && inScope({ rel, ext })) {
      let text = null;
      try { text = fs.readFileSync(path.join(root, rel), 'utf8'); } catch {}
      if (text != null) {
        const md = mdFacts(root, rel, text, fileExists);
        extra = { docrole: md.docrole };
        facts.push(...md.facts);
        for (const c of md.mentionCands) mentionCands.push({ docRel: rel, ...c });
      }
    }
    facts.push(fact({ unit: rel, kind: 'file', name: rel, file: rel,
      fidelity: 'exact', scope: 'repo', extractor: 'walk@1',
      ...(extra ? { extra } : {}) }));
  }
  for (const d of dirs) {
    facts.push(fact({ unit: `${d}/`, kind: 'dir', name: d.split('/').pop(),
      file: d, fidelity: 'exact', scope: 'repo', extractor: 'walk@1' }));
  }
  for (const l of links) {
    facts.push(fact({ unit: l.rel, kind: 'link', name: l.rel, file: l.rel,
      fidelity: 'exact', scope: l.dead ? 'unresolved' : 'repo',
      extractor: 'walk@1',
      extra: { to: l.to, ...(l.dead ? { dead: true } : {}) } }));
  }
  if (a.contentScan) {
    // ast-grep 按语言分桶——JavaScript/TypeScript/Tsx 各跑各的规则集（rules 同构仅 language 换头）
    const jsFiles = files.filter((f) => JS_EXT.has(f.ext) && inScope(f));
    const tsFiles = files.filter((f) => TS_EXT.has(f.ext) && inScope(f));
    const tsxFiles = files.filter((f) => TSX_EXT.has(f.ext) && inScope(f));
    const psFiles = files.filter((f) => PS_EXT.has(f.ext) && inScope(f));
    const rsFiles = files.filter((f) => RUST_EXT.has(f.ext) && inScope(f));
    const astFiles = [...jsFiles, ...tsFiles, ...tsxFiles, ...rsFiles];

    // js 单文件 regex 降级路径（ast-grep 缺席的 --allow-degraded 面，
    // 与 ENOBUFS 单文件爆管的韧性降级共用同一实现）
    const jsRegexFacts = (f) => {
      const out = [];
      const text = fs.readFileSync(path.join(root, f.rel), 'utf8');
      let li = 0;
      for (const l of text.split(/\r?\n/)) {
        li++;
        const im = l.match(/import\s+.*?from\s+['"]([^'"]+)['"]/) ||
                   l.match(/import\s+['"]([^'"]+)['"]/);
        if (im) {
          const r = resolveSpec(root, f.rel, im[1]);
          out.push(fact({ unit: f.rel, kind: 'import', name: im[1],
            file: f.rel, line: li, fidelity: 'regex-degraded',
            scope: r.external ? 'external' : (r.dead ? 'unresolved' : 'module'),
            extractor: regId,
            extra: { to: r.to, mechanism: 'static',
              ...(r.dead ? { dead: true } : {}),
              ...(r.external ? { external: true } : {}) } }));
        }
        const fm = l.match(/^\s*(export\s+)?(?:async\s+)?function\s*\*?\s*([\w$]+)/) ||
                   l.match(/^\s*(export\s+)?(?:const|let|var)\s+([\w$]+)\s*=\s*(?:async\s*)?\(/);
        if (fm) out.push(fact({ unit: `${f.rel}#${fm[2]}`, kind: 'decl',
          name: fm[2], file: f.rel, line: li, fidelity: 'regex-degraded',
          scope: 'file-local', extractor: regId,
          extra: { shape: 'function',
            surface: fm[1] ? 'public' : 'internal' } }));
      }
      return out;
    };

    if (astFiles.length && !sg && !a.allowDegraded) {
      die(`ast-grep 前端缺失而 js/ts 文件 ${astFiles.length} 个待抽——` +
        `fail-closed 拒降级（ADR-0008 D2）；确需降级传 --allow-degraded`, 3);
    } else if (astFiles.length && sg) {
      const matches = [];
      const degraded = new Set();
      for (const [bucket, rules] of
        [[jsFiles, AST_RULES], [tsFiles, AST_RULES_TS], [tsxFiles, AST_RULES_TSX],
         [rsFiles, AST_RULES_RUST]]) {
        if (!bucket.length) continue;
        const r = runAstGrep(sg.bin, bucket.map((f) => path.join(root, f.rel)), rules);
        matches.push(...r.matches);
        for (const d of r.degraded) degraded.add(d);
      }
      const byFile = new Map();
      for (const m of matches) {
        const rel = path.relative(root, m.file).replace(/\\/g, '/');
        const list = byFile.get(rel) || [];
        list.push(m); byFile.set(rel, list);
      }
      for (const [rel, ms] of byFile) {
        // 两遍：先收 export-stmt 的 surface 标记，再发 decl（surface 要回填）
        const surfaceMarks = new Set();
        for (const m of ms) {
          const line = m.range.start.line + 1;
          const id = m.ruleId;
          if (id === 'export-statement') {
            // reexport 判定必须头锚定：export_statement 节点文本含整个被导
            // 函数体——体内字符串里的 from 'x' 不许误判成 reexport
            const reex = m.text.match(
              /^\s*export\s+(?:\{[^}]*\}|\*\s*(?:as\s+[\w$]+)?)\s*from\s*['"]([^'"]+)['"]/);
            const spec = reex ? reex[1] : null; // export {…}|\* from 'x' → reexport
            if (spec) {
              const r = resolveSpec(root, rel, spec);
              const base = { file: rel, line, name: spec,
                fidelity: 'syntactic',
                scope: r.external ? 'external' : (r.dead ? 'unresolved' : 'module'),
                extractor: astId };
              // v1 依赖边（via:import 相容）+ v1.1 面边（via:export 专属）
              facts.push(fact({ ...base, unit: rel, kind: 'import',
                extra: { to: r.to, mechanism: 'reexport',
                  ...(r.dead ? { dead: true } : {}),
                  ...(r.external ? { external: true } : {}) } }));
              facts.push(fact({ ...base, unit: rel, kind: 'export',
                extra: { to: r.to, mechanism: 'reexport',
                  ...(r.dead ? { dead: true } : {}),
                  ...(r.external ? { external: true } : {}) } }));
            } else {
              // export decl/list —— 非边；仅登记模块面标记
              const dm = m.text.match(/export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|class|const|let|var)\s+([\w$]+)/);
              if (dm) surfaceMarks.add(dm[1]);
              const lm = m.text.match(/export\s*\{([^}]*)\}/);
              if (lm) for (const part of lm[1].split(',')) {
                const nm = part.trim().split(/\s+as\s+/)[0].trim(); // decl 名（as 前）
                if (nm) surfaceMarks.add(nm);
              }
            }
          }
        }
        // Rust 上下文：文件级 mod 声明名集 + 内联 mod range（super 深度扣除用）
        const rsMods = new Set(ms.filter((x) => x.ruleId === 'rust-mod')
          .map((x) => (x.text.match(/mod\s+([A-Za-z_]\w*)/) || [])[1])
          .filter(Boolean));
        const rsInline = ms.filter((x) => x.ruleId === 'rust-mod' && /\{/.test(x.text));
        for (const m of ms) {
          const line = m.range.start.line + 1;
          const id = m.ruleId;
          if (id === 'import-statement') {
            const spec = specFromText(m.text);
            const r = spec ? resolveSpec(root, rel, spec)
                           : { to: null, external: false, dead: true };
            facts.push(fact({ unit: rel, kind: 'import',
              name: spec || '(unparsed)', file: rel, line,
              fidelity: 'syntactic',
              scope: r.external ? 'external' : (r.dead ? 'unresolved' : 'module'),
              extractor: astId,
              extra: { to: r.to, mechanism: 'static',
                ...(r.dead ? { dead: true } : {}),
                ...(r.external ? { external: true } : {}) } }));
          } else if (id === 'dynamic-import') {
            const spec = specFromText(m.text);
            if (spec) {
              const r = resolveSpec(root, rel, spec);
              facts.push(fact({ unit: rel, kind: 'import', name: spec,
                file: rel, line, fidelity: 'syntactic',
                scope: r.external ? 'external' : (r.dead ? 'unresolved' : 'module'),
                extractor: astId,
                extra: { to: r.to, mechanism: 'dynamic',
                  ...(r.dead ? { dead: true } : {}),
                  ...(r.external ? { external: true } : {}) } }));
            } else {
              facts.push(fact({ unit: rel, kind: 'import',
                name: '(computed)', file: rel, line, fidelity: 'syntactic',
                scope: 'unresolved', extractor: astId,
                extra: { mechanism: 'dynamic-computed' } }));
            }
          } else if (id === 'rust-use') {
            const spec = rustUseSpec(m.text);
            const inline = rsInline
              .filter((x) => x.range.byteOffset.start < m.range.byteOffset.start &&
                             m.range.byteOffset.end <= x.range.byteOffset.end)
              .sort((a, b) => a.range.byteOffset.start - b.range.byteOffset.start)
              .map((x) => (x.text.match(/mod\s+([A-Za-z_]\w*)/) || [])[1])
              .filter(Boolean);
            const r = spec ? resolveRustSpec(root, rel, spec, { fileMods: rsMods, inline })
                           : { to: null, external: false, dead: true };
            const pub = /^\s*pub\s+(?!\()/.test(m.text);
            const base = { file: rel, line, name: spec || '(unparsed)',
              fidelity: 'syntactic',
              scope: r.external ? 'external' : (r.dead ? 'unresolved' : 'module'),
              extractor: astId };
            // use 恒产 import 边；pub use 再产 export 边（re-export 面）
            facts.push(fact({ ...base, unit: rel, kind: 'import',
              extra: { to: r.to, mechanism: pub ? 'rust-pub-use' : 'rust-use',
                ...(r.dead ? { dead: true } : {}),
                ...(r.external ? { external: true } : {}) } }));
            if (pub) facts.push(fact({ ...base, unit: rel, kind: 'export',
              extra: { to: r.to, mechanism: 'rust-pub-use',
                ...(r.dead ? { dead: true } : {}),
                ...(r.external ? { external: true } : {}) } }));
          } else if (id === 'rust-mod') {
            const nm = (m.text.match(/mod\s+([A-Za-z_]\w*)/) || [])[1] || '?';
            facts.push(fact({ unit: `${rel}#${nm}`, kind: 'decl', name: nm,
              file: rel, line, fidelity: 'syntactic', scope: 'file-local',
              extractor: astId,
              extra: { shape: 'mod', surface: rustSurface(m.text) } }));
            // mod foo {…} 内联模块不产依赖边；mod foo; 产文件级边
            if (!/\{/.test(m.text)) {
              const r = resolveRustMod(root, rel, nm);
              facts.push(fact({ unit: rel, kind: 'import', name: nm,
                file: rel, line, fidelity: 'syntactic',
                scope: r.dead ? 'unresolved' : 'module', extractor: astId,
                extra: { to: r.to, mechanism: 'mod-decl',
                  ...(r.dead ? { dead: true } : {}) } }));
            }
          } else if (RUST_DECL_RE[id]) {
            const nm = (m.text.match(RUST_DECL_RE[id]) || [])[1] || null;
            facts.push(fact({ unit: `${rel}#${nm || '?'}`, kind: 'decl',
              name: nm || m.text.slice(0, 40), file: rel, line,
              fidelity: 'syntactic', scope: 'file-local', extractor: astId,
              extra: { shape: id.replace('rust-', ''),
                surface: rustSurface(m.text) } }));
          } else if (DECL_RE[id]) {
            const re = DECL_RE[id];
            const nm = re ? (m.text.match(re) || [])[1] : null;
            facts.push(fact({ unit: `${rel}#${nm || '?'}`, kind: 'decl',
              name: nm || m.text.slice(0, 40), file: rel, line,
              fidelity: 'syntactic', scope: 'file-local', extractor: astId,
              extra: { shape: id.replace('decl-', ''),
                surface: nm && surfaceMarks.has(nm) ? 'public' : 'internal' } }));
          }
        }
      }
      // 单文件 ast-grep 失败 → regex 降级兜底（fidelity 已自带降级戳记，
      // 消费方按 fidelity×family 矩阵自行降权——不靠静默吞）
      if (degraded.size) {
        const rels = new Set([...degraded].map((p) =>
          path.relative(root, p).replace(/\\/g, '/')));
        for (const f of astFiles) {
          if (rels.has(f.rel))
            facts.push(...(RUST_EXT.has(f.ext)
              ? rustRegexFacts(root, f.rel, regId) : jsRegexFacts(f)));
        }
        console.error(`[extract-facts] ${degraded.size} 个 js/ts 文件 ast-grep 失败` +
          `降 regex（巨型混淆/边界输入面）: ${[...rels].slice(0, 5).join(', ')}`);
      }
    } else if (astFiles.length && a.allowDegraded) {
      for (const f of astFiles)
        facts.push(...(RUST_EXT.has(f.ext)
          ? rustRegexFacts(root, f.rel, regId) : jsRegexFacts(f)));
    }
    for (const f of psFiles) {
      const text = fs.readFileSync(path.join(root, f.rel), 'utf8');
      facts.push(...psLineFacts(root, f.rel, text, regId));
    }
  }

  // mention 二遍：code-span/heading 候选名查 decl 符号表
  // 唯一命中 → to=<file#sym>（scope:module）；多名 → 歧义（scope:unresolved+extra.candidates）
  // 零命中 → 不产边（普通反引号词不是 mention）
  if (mentionCands.length) {
    const sym = new Map();
    for (const f of facts) {
      if (f.kind !== 'decl') continue;
      const s = sym.get(f.name) || new Set();
      s.add(f.unit); sym.set(f.name, s);
    }
    for (const c of mentionCands) {
      const hit = sym.get(c.name);
      if (!hit) continue;
      if (hit.size === 1) {
        facts.push(fact({ unit: c.docRel, kind: 'mention', name: c.name,
          file: c.docRel, line: c.line, fidelity: 'regex-degraded',
          scope: 'module', extractor: MD_EXTRACTOR,
          extra: { to: [...hit][0], symbol: c.name } }));
      } else {
        facts.push(fact({ unit: c.docRel, kind: 'mention', name: c.name,
          file: c.docRel, line: c.line, fidelity: 'regex-degraded',
          scope: 'unresolved', extractor: MD_EXTRACTOR,
          extra: { symbol: c.name, ambiguous: true,
            candidates: [...hit].sort().slice(0, 8) } }));
      }
    }
  }

  const out = toJsonl(facts);
  if (a.out) fs.writeFileSync(a.out, out);
  else process.stdout.write(out);
  console.error(`[extract-facts] files=${files.length} links=${links.length} ` +
    `facts=${facts.length} front-end=${astId || 'NONE(degraded-off)'}`);
}

main();
