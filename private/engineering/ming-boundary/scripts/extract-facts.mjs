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
    const astFiles = [...jsFiles, ...tsFiles, ...tsxFiles];

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
        [[jsFiles, AST_RULES], [tsFiles, AST_RULES_TS], [tsxFiles, AST_RULES_TSX]]) {
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
          if (rels.has(f.rel)) facts.push(...jsRegexFacts(f));
        }
        console.error(`[extract-facts] ${degraded.size} 个 js/ts 文件 ast-grep 失败` +
          `降 regex（巨型混淆/边界输入面）: ${[...rels].slice(0, 5).join(', ')}`);
      }
    } else if (astFiles.length && a.allowDegraded) {
      for (const f of astFiles) facts.push(...jsRegexFacts(f));
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
