// scripts/check-test-coverage.mjs
// 可执行件测试登记检查——scripts/ 与 private/*/scripts/ 下每个可执行脚本
// 必须在测试语料（tests/ 目录全文）中被点名，或在 tests/coverage-exempt.txt
// 中登记豁免理由。目的：新脚本无测试网兜即 fail-closed，防缺口再生。
//
// 判据（保守近似，宁漏报不报假）：
//   - 脚本 basename（如 verify.mjs）出现在任一 tests/** 文本中 → covered
//   - 或脚本相对路径出现在语料中 → covered
//   - 或在豁免表登记（格式: <仓相对路径> — <理由>）→ exempt
//   - 豁免表条目必须指向真实存在的脚本（陈旧豁免=账实不符 fail）
// 用法: node scripts/check-test-coverage.mjs [--json]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXEMPT_FILE = path.join(ROOT, 'tests', 'coverage-exempt.txt');

const SCRIPT_DIRS = ['scripts', 'private'];
const SCRIPT_EXT = new Set(['.mjs', '.ps1', '.sh']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'test', 'tests', 'fixtures']);

function* walk(dir) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue;
      yield* walk(p);
    } else if (SCRIPT_EXT.has(path.extname(e.name).toLowerCase())
      && !/\.test\.[^.]+$/.test(e.name)) {
      yield p;
    }
  }
}

function collectCorpus() {
  const parts = [];
  const visit = (d) => {
    let ents;
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
        visit(p);
      } else if (/\.(mjs|ps1|json|txt|md|yaml|yml)$/i.test(e.name)
        && (d.includes('tests') || /\.test\.[^.]+$/.test(e.name))) {
        try { parts.push(fs.readFileSync(p, 'utf8')); } catch {}
      }
    }
  };
  // 语料面：tests/ 全量 + 仓内散居的 *.test.*（scaffold-domains.test.mjs 这类包内自测）
  visit(path.join(ROOT, 'tests'));
  visit(path.join(ROOT, 'private'));
  return parts.join('\n');
}

export function checkCoverage(root = ROOT) {
  const corpus = collectCorpus();
  const exemptRaw = fs.existsSync(EXEMPT_FILE)
    ? fs.readFileSync(EXEMPT_FILE, 'utf8') : '';
  const exempt = new Map();
  for (const line of exemptRaw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('—');
    const rel = (i >= 0 ? t.slice(0, i) : t).trim();
    exempt.set(rel.replace(/\\/g, '/'), i >= 0 ? t.slice(i + 1).trim() : '');
  }

  const scripts = [];
  for (const top of SCRIPT_DIRS) {
    const base = path.join(root, top);
    for (const p of walk(base)) {
      const rel = path.relative(root, p).replace(/\\/g, '/');
      if (rel === 'tests/coverage-exempt.txt') continue;
      scripts.push(rel);
    }
  }

  const uncovered = [], covered = [], missingExempt = [];
  for (const rel of scripts.sort()) {
    const base = path.basename(rel);
    // stem 匹配（≥6 字符，防 'diff' 这类泛词误覆盖）：
    // 消费方/gate 以 id 点名调度，stem 在语料出现即为被调度痕迹
    const stem = base.replace(/\.[^.]+$/, '');
    const inCorpus = corpus.includes(base) || corpus.includes(rel)
      || (stem.length >= 6 && corpus.includes(stem));
    if (exempt.has(rel)) { covered.push(rel); continue; }
    if (inCorpus) covered.push(rel);
    else uncovered.push(rel);
  }
  // 反向校验：豁免条目须指向真实脚本（防陈旧豁免账目漂移）
  for (const rel of exempt.keys()) {
    if (!scripts.includes(rel)) missingExempt.push(rel);
  }
  return { ok: uncovered.length === 0 && missingExempt.length === 0,
    uncovered, missingExempt, coveredCount: covered.length, total: scripts.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const json = process.argv.includes('--json');
  const r = checkCoverage();
  if (json) console.log(JSON.stringify(r, null, 1));
  else {
    console.log(`[test-coverage] 可执行件 ${r.total}，已登记/覆盖 ${r.coveredCount}`);
    for (const s of r.uncovered)
      console.error(`[uncovered] ${s} —— 未在任何测试语料点名，也未豁免`);
    for (const s of r.missingExempt)
      console.error(`[stale-exempt] ${s} —— 豁免表条目对应脚本不存在`);
    if (r.ok) console.log('[test-coverage] 全件已登记');
  }
  process.exit(r.ok ? 0 : 1);
}
