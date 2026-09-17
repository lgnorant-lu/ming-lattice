#!/usr/bin/env node
// audit-domains.mjs — Ming-L 域体检器（省+守动力学机械化）
// 用法: node audit-domains.mjs [target-dir] [--staged] [--strict] [--json] [--proposed-days N]
// 检查面:
//   1. orphan 规则: docs 下每个 .md 须带 `domain:` frontmatter（口头规则禁令的机器投影，默认 W，--strict 升 E）
//   2. landed 指针: OPEN-FINDINGS 类文件的 [landed] 标注须指向存在文件
//   3. 域 x 动词矩阵: `dynamics:` 标注盘点，未标注空格=I 级提示（"有意的零"须显式标注）
//   4. 双真相: `canonical:` 事实键跨文档重复声明 = E
//   5. frozen 不可变: `status: frozen` 文档改动拦截（--staged 模式接 git 暂存区）
//   6. proposed 超期: `status: proposed` + `since:` 超 --proposed-days = W（"省"动力学复审提醒）
// 退出码: 0=无E级  1=存在E级

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const args = process.argv.slice(2);
const target = path.resolve(args.find(a => !a.startsWith('--')) || 'docs');
const asJson = args.includes('--json');
const strict = args.includes('--strict');
const staged = args.includes('--staged');
const provDays = Number(args[args.indexOf('--proposed-days') + 1]) || 30;

const DOMAINS = new Set(['meta', 'spec', 'dev', 'plan', 'gov', 'exp', 'verify', 'ops', 'know', 'req']);
const STATUSES = new Set(['proposed', 'normative', 'descriptive', 'frozen']);
const TYPES = new Set(['constitutive', 'regulative']);
const VERBS = ['立', '用', '守', '省', '改', '增', '废'];

const issues = [];
const add = (level, msg, file) => issues.push({ level, msg, file: file || target });

if (!fs.existsSync(target)) {
  console.error(`目标目录不存在: ${target}`);
  process.exit(1);
}

// ---------- 收集 .md ----------
const mdFiles = [];
(function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === '.git' || ent.name.startsWith('.')) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (ent.name.endsWith('.md')) mdFiles.push(p);
  }
})(target);

// ---------- frontmatter 解析（YAML-lite，零依赖） ----------
function parseFm(content) {
  const m = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!m) return null;
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^(\w+)\s*:\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    if (v.startsWith('[') && v.endsWith(']')) {
      v = v.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    } else {
      v = v.replace(/^["']|["']$/g, '');
    }
    fm[kv[1]] = v;
  }
  return fm;
}

// ---------- 1/2/4/6 逐文件检查 ----------
const domainDocs = new Map(); // domain -> [files]
const canonical = new Map();  // key -> [files]
const frozenDocs = [];
const now = Date.now();

for (const f of mdFiles) {
  const rel = path.relative(target, f).replace(/\\/g, '/');
  const content = fs.readFileSync(f, 'utf8');
  const fm = parseFm(content);

  // 1. orphan
  if (!fm || !fm.domain) {
    add(strict ? 'E' : 'W', `orphan 文档：无 domain: 归属（规则无家可归）`, rel);
  } else {
    if (!DOMAINS.has(fm.domain)) {
      add('W', `未登记域: ${fm.domain}（新域须过准入判据：新 concern 集或新 stakeholder 视角）`, rel);
    }
    if (!domainDocs.has(fm.domain)) domainDocs.set(fm.domain, []);
    domainDocs.get(fm.domain).push({ file: rel, fm });
  }

  if (fm) {
    // 词表校验（机查词表写错 = E，不降级）
    if (fm.status && !STATUSES.has(fm.status)) add('E', `status 词表外: ${fm.status}（合法: ${[...STATUSES].join('/')})`, rel);
    if (fm.type && !TYPES.has(fm.type)) add('E', `type 词表外: ${fm.type}（合法: constitutive/regulative）`, rel);
    if (fm.binding !== undefined && !/^[0-4]$/.test(String(fm.binding))) add('E', `binding 越界: ${fm.binding}（合法: 0-4）`, rel);

    // 4. canonical 双真相
    for (const key of fm.canonical || []) {
      if (!canonical.has(key)) canonical.set(key, []);
      canonical.get(key).push(rel);
    }

    // 5. frozen 登记
    if (fm.status === 'frozen') frozenDocs.push(rel);

    // 6. proposed 超期
    if (fm.status === 'proposed' && fm.since) {
      const age = (now - Date.parse(fm.since)) / 86400000;
      if (age > provDays) add('W', `proposed 挂账 ${Math.floor(age)} 天超 ${provDays} 天——"省"动力学提醒复审`, rel);
    }
    if (fm.status === 'proposed' && !fm.since) {
      add('I', `proposed 无 since: 日期，无法计龄`, rel);
    }
  }

  // 2. landed 指针（OPEN-FINDINGS 类文件；反引号内字面量不算标注）
  for (const m of content.matchAll(/(?<!`)\[landed\][^\n]*/g)) {
    const seg = content.slice(m.index, m.index + 300);
    const pathM = seg.match(/`([^`]+?\.md(?:#[^`]*)?)`/);
    if (!pathM) { add('W', `[landed] 无指向文件（标注格式: [landed] \`path/file.md#anchor\`）`, rel); continue; }
    const targetPath = pathM[1].split('#')[0];
    const resolved = path.resolve(target, targetPath);
    const resolvedRoot = path.resolve(target, '..', targetPath);
    if (!fs.existsSync(resolved) && !fs.existsSync(resolvedRoot)) {
      add('E', `[landed] 指向不存在: ${targetPath}`, rel);
    }
  }
}

for (const [key, files] of canonical) {
  if (files.length > 1) add('E', `双真相: canonical 键 "${key}" 被 ${files.length} 处声明（${files.join(', ')}）`);
}

// ---------- 3. 域 x 动词矩阵 ----------
const matrix = {};
for (const [dom, docs] of domainDocs) {
  matrix[dom] = new Set();
  for (const { fm } of docs) for (const v of fm.dynamics || []) matrix[dom].add(v);
}
const allDomains = [...DOMAINS].filter(d => domainDocs.has(d));
for (const d of allDomains) {
  for (const v of VERBS) {
    if (!matrix[d].has(v)) add('I', `矩阵空格: ${d} x ${v} 未标注（有意零请在域文档 dynamics: 显式标注或注明豁免）`);
  }
}

// ---------- 5. staged 模式下 frozen 拦截 ----------
if (staged) {
  let changed = [];
  try {
    changed = execSync('git diff --cached --name-only', { cwd: target, encoding: 'utf8' })
      .split('\n').map(s => s.trim()).filter(Boolean);
  } catch { add('I', '非 git 仓库或无暂存区——frozen 拦截跳过'); }
  const frozenSet = new Set(frozenDocs);
  for (const c of changed) {
    const rel = path.relative(target, path.resolve(target, c)).replace(/\\/g, '/');
    if (frozenSet.has(rel) || frozenSet.has(c)) add('E', `frozen 文档被修改: ${rel}（Know 域只增不隐——新版=新文件）`, rel);
  }
}
for (const f of frozenDocs) add('I', `frozen 登记: ${f}`);

// ---------- 输出 ----------
if (asJson) {
  console.log(JSON.stringify({ issues, domains: [...domainDocs.keys()], frozen: frozenDocs }, null, 2));
} else {
  console.log(`audit-domains: ${target}  (${mdFiles.length} docs, ${domainDocs.size} domains)`);
  console.log(`域清单: ${[...domainDocs.keys()].join(', ') || '(无)'}`);
  for (const i of issues) console.log(`[${i.level}] ${i.file === target ? '' : i.file + ' '}${i.msg}`);
  const e = issues.filter(i => i.level === 'E').length;
  const w = issues.filter(i => i.level === 'W').length;
  const n = issues.filter(i => i.level === 'I').length;
  console.log(`\nE=${e} W=${w} I=${n}`);
}
process.exitCode = issues.some(i => i.level === 'E') ? 1 : 0;
