#!/usr/bin/env node
// extract-facts.mjs — 仓库事实提取器（ADR-0008 D1/D6 首参考实现）
// 分支覆盖：file（文件域）/ import-export（符号边）/ decl（声明）/ link（部署链接）
// 前端：ast-grep（syntactic）→ 缺前端时 fail-closed，--allow-degraded 才降 regex
// 输出：确定性 JSONL（file→line→kind→name 排序），stdout 或 --out
// 用法: node extract-facts.mjs [--root DIR] [--out FILE] [--allow-degraded]
//       [--extract-dirs d1,d2] [--no-content-scan]

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fact, domainOf, toJsonl } from './lib/facts.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../../..');

const JS_EXT = new Set(['.mjs', '.js', '.cjs', '.jsx']);
const PS_EXT = new Set(['.ps1', '.psm1']);
// 内容抽取白名单域：自有代码面；vendored/base/deployable 只产 file/link 事实
const CONTENT_DIRS = ['scripts', 'private', 'tests', 'tools', 'config', 'src'];
const IGNORE_DIRS = new Set([
  '.git', 'node_modules', 'distill', '.logs', 'runs', 'target',
  'artifacts', 'out', '.venv', '__pycache__',
]);

const AST_RULES = `
id: import-statement
language: JavaScript
rule:
  kind: import_statement
---
id: reexport-statement
language: JavaScript
rule:
  kind: export_statement
  has:
    kind: string
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

const DECL_RE = {
  'decl-function': /function\s*\*?\s*([\w$]+)/,
  'decl-generator': /function\s*\*?\s*([\w$]+)/,
  'decl-class': /class\s+([\w$]+)/,
  'decl-method': /^\s*(?:static\s+)?(?:async\s+)?(?:get\s+|set\s+)?[\*]?\s*([\w$]+)/,
  'decl-arrow': /^\s*(?:[\w$]+\s*[:,]|(?:const|let|var)\s+)?([\w$]+)\s*=/,
};

const REL_SPEC = /^\.{1,2}\//;
const TRY_SUFFIX = ['', '.mjs', '.js', '.cjs', '.ts', '.json', '/index.mjs', '/index.js'];

function die(msg, code = 2) {
  console.error(`[extract-facts] ${msg}`);
  process.exit(code);
}

function parseArgs(argv) {
  const a = { root: REPO_ROOT, out: null, allowDegraded: false,
              extractDirs: CONTENT_DIRS, contentScan: true };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    const take = () => argv[++i] ?? die(`${k} 缺参数`);
    if (k === '--root') a.root = path.resolve(take());
    else if (k === '--out') a.out = take();
    else if (k === '--allow-degraded') a.allowDegraded = true;
    else if (k === '--no-content-scan') a.contentScan = false;
    else if (k === '--extract-dirs') a.extractDirs = take().split(',').filter(Boolean);
    else die(`未知旗标: ${k}`);
  }
  return a;
}

// ---------- 遍历：忽略集合 + junction 不穿透（实测语义，消费方 resolve 后自扫） ----------
function walk(dir, root, files, links) {
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
      walk(abs, root, files, links);
    } else if (e.isFile()) {
      files.push({ rel, ext: path.extname(e.name).toLowerCase() });
    }
  }
}

// ---------- ast-grep 前端 ----------
function findAstGrep() {
  // AST_GREP_BIN 为权威覆盖：设了就只试它（失败即无前端——便于测试 fail-closed）
  const envBin = process.env.AST_GREP_BIN;
  const cands = envBin ? [envBin] : [
    'ast-grep',
    'D:/Caches/npm-global/node_modules/@ast-grep/cli/ast-grep.exe',
  ];
  for (const bin of cands) {
    const r = spawnSync(bin, ['--version'], { encoding: 'utf8' });
    if (!r.error && r.status === 0) return { bin, ver: r.stdout.trim().split(/\s+/).pop() };
  }
  return null;
}

function runAstGrep(bin, filesAbs) {
  // 分批喂文件（命令行长度上限）；--json=stream 一行一 match
  const out = [];
  const CHUNK = 60;
  for (let i = 0; i < filesAbs.length; i += CHUNK) {
    const batch = filesAbs.slice(i, i + CHUNK);
    const r = spawnSync(bin, ['scan', '--inline-rules', AST_RULES,
      '--json=stream', ...batch], { encoding: 'utf8', maxBuffer: 256 << 20 });
    if (r.error) die(`ast-grep 调用失败: ${r.error.message}`, 3);
    if (r.status !== 0) die(`ast-grep 非零退出 ${r.status}: ${(r.stderr || '').slice(0, 400)}`, 3);
    for (const line of (r.stdout || '').split('\n')) {
      if (line.trim()) out.push(JSON.parse(line));
    }
  }
  return out;
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

  const files = [], links = [];
  walk(root, root, files, links);

  const facts = [];
  const sg = findAstGrep();
  const astId = sg ? `ast-grep@${sg.ver}` : null;
  const regId = 'line-regex@1';

  for (const { rel } of files) {
    facts.push(fact({ unit: rel, kind: 'file', name: rel, file: rel,
      fidelity: 'exact', scope: 'repo', extractor: 'walk@1' }));
  }
  for (const l of links) {
    facts.push(fact({ unit: l.rel, kind: 'link', name: l.rel, file: l.rel,
      fidelity: 'exact', scope: l.dead ? 'unresolved' : 'repo',
      extractor: 'walk@1',
      extra: { to: l.to, ...(l.dead ? { dead: true } : {}) } }));
  }

  if (a.contentScan) {
    const jsFiles = files.filter((f) =>
      JS_EXT.has(f.ext) && a.extractDirs.includes(f.rel.split('/')[0]));
    const psFiles = files.filter((f) =>
      PS_EXT.has(f.ext) && a.extractDirs.includes(f.rel.split('/')[0]));

    if (jsFiles.length && !sg) {
      if (!a.allowDegraded)
        die(`ast-grep 前端缺失而 js 文件 ${jsFiles.length} 个待抽——` +
          `fail-closed 拒降级（ADR-0008 D2）；确需降级传 --allow-degraded`, 3);
    } else if (jsFiles.length && sg) {
      const matches = runAstGrep(sg.bin, jsFiles.map((f) => path.join(root, f.rel)));
      const byFile = new Map();
      for (const m of matches) {
        const rel = path.relative(root, m.file).replace(/\\/g, '/');
        const list = byFile.get(rel) || [];
        list.push(m); byFile.set(rel, list);
      }
      for (const [rel, ms] of byFile) {
        for (const m of ms) {
          const line = m.range.start.line + 1;
          const id = m.ruleId;
          if (id === 'import-statement' || id === 'reexport-statement') {
            const spec = specFromText(m.text);
            const r = spec ? resolveSpec(root, rel, spec)
                           : { to: null, external: false, dead: true };
            facts.push(fact({ unit: rel, kind: 'import',
              name: spec || '(unparsed)', file: rel, line,
              fidelity: 'syntactic',
              scope: r.external ? 'external' : (r.dead ? 'unresolved' : 'module'),
              extractor: astId,
              extra: { to: r.to,
                mechanism: id === 'reexport-statement' ? 'reexport' : 'static',
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
          } else {
            const re = DECL_RE[id];
            const nm = re ? (m.text.match(re) || [])[1] : null;
            facts.push(fact({ unit: `${rel}#${nm || '?'}`, kind: 'decl',
              name: nm || m.text.slice(0, 40), file: rel, line,
              fidelity: 'syntactic', scope: 'file-local', extractor: astId,
              extra: { shape: id.replace('decl-', '') } }));
          }
        }
      }
    } else if (jsFiles.length && a.allowDegraded) {
      for (const f of jsFiles) {
        const text = fs.readFileSync(path.join(root, f.rel), 'utf8');
        let li = 0;
        for (const l of text.split(/\r?\n/)) {
          li++;
          const im = l.match(/import\s+.*?from\s+['"]([^'"]+)['"]/) ||
                     l.match(/import\s+['"]([^'"]+)['"]/);
          if (im) {
            const r = resolveSpec(root, f.rel, im[1]);
            facts.push(fact({ unit: f.rel, kind: 'import', name: im[1],
              file: f.rel, line: li, fidelity: 'regex-degraded',
              scope: r.external ? 'external' : (r.dead ? 'unresolved' : 'module'),
              extractor: regId,
              extra: { to: r.to, mechanism: 'static',
                ...(r.dead ? { dead: true } : {}),
                ...(r.external ? { external: true } : {}) } }));
          }
          const fm = l.match(/^\s*(?:export\s+)?(?:async\s+)?function\s*\*?\s*([\w$]+)/) ||
                     l.match(/^\s*(?:export\s+)?(?:const|let|var)\s+([\w$]+)\s*=\s*(?:async\s*)?\(/);
          if (fm) facts.push(fact({ unit: `${f.rel}#${fm[1]}`, kind: 'decl',
            name: fm[1], file: f.rel, line: li, fidelity: 'regex-degraded',
            scope: 'file-local', extractor: regId, extra: { shape: 'function' } }));
        }
      }
    }
    for (const f of psFiles) {
      const text = fs.readFileSync(path.join(root, f.rel), 'utf8');
      facts.push(...psLineFacts(root, f.rel, text, regId));
    }
  }

  const out = toJsonl(facts);
  if (a.out) fs.writeFileSync(a.out, out);
  else process.stdout.write(out);
  console.error(`[extract-facts] files=${files.length} links=${links.length} ` +
    `facts=${facts.length} front-end=${astId || 'NONE(degraded-off)'}`);
}

main();
