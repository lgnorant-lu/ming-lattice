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
//   7. 标识分配律: 标号唯一性(E) / 悬空引用(W) / 命名空间格式(W)
// 退出码: 0=无E级  1=存在E级

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const target = path.resolve(args.find(a => !a.startsWith('--')) || 'docs');
const asJson = args.includes('--json');
const strict = args.includes('--strict');
const staged = args.includes('--staged');
const provDays = Number(args[args.indexOf('--proposed-days') + 1]) || 30;
const labelsArg = args.indexOf('--labels') >= 0 ? args[args.indexOf('--labels') + 1] : null;

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
const allDocs = [];           // {rel, fm, text} — 供登记表互锁等跨文件检查
const now = Date.now();

for (const f of mdFiles) {
  const rel = path.relative(target, f).replace(/\\/g, '/');
  const content = fs.readFileSync(f, 'utf8');
  const fm = parseFm(content);
  allDocs.push({ rel, fm, text: content });

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

// ---------- 7. 标识分配律 ----------
// 定义位: 标题 ID（### A5. / # L3 — / ## D5.）+ adr/NNNN-*.md 文件名 + 候审档字母区内编号项 + 粗体定义位
// 引用位: 正文独立标号 token（含反引号）；未定义 = 悬空
// 命名空间表外置（高度自定义化）：--labels <json> > <target>/namespaces.json > skill 内置默认
let nsList = null, nsSource = null;
const convNs = path.join(target, 'namespaces.json');
const nsFile = labelsArg || (fs.existsSync(convNs) ? convNs : null);
if (nsFile) {
  try { nsList = JSON.parse(fs.readFileSync(nsFile, 'utf8')).namespaces; nsSource = nsFile; }
  catch (e) { add('E', `命名空间登记表解析失败: ${nsFile} — ${e.message}`); }
}
if (!nsList) {
  nsList = JSON.parse(fs.readFileSync(path.join(SKILL_DIR, 'assets/namespaces.default.json'), 'utf8')).namespaces;
  nsSource = 'skill-default';
}
// role=id 的命名空间参与定义/引用扫描；role=value 仅为词表（错误码/版本号/算子 type，事实源各在自有 schema）
const idAlt = nsList.filter(n => n.role !== 'value').map(n => n.pattern.replace(/^\^|\$$/g, '')).join('|');
const LABEL_REF = new RegExp(`\\b(${idAlt})\\b`, 'g');
const BOLD_DEF = new RegExp(`\\*\\*(${idAlt})\\b`);
const LABEL_FORMATS = nsList.map(n => new RegExp(n.pattern));
const defined = new Map();    // id -> [file:line]
const refs = [];              // {id, rel, line}
const statusByFile = new Map(); // rel -> fm.status

for (const f of mdFiles) {
  const rel = path.relative(target, f).replace(/\\/g, '/');
  const content = fs.readFileSync(f, 'utf8');
  const lines = content.split(/\r?\n/);
  const fm = parseFm(content);
  statusByFile.set(rel, fm && fm.status);

  // ADR 文件名定义
  const adm = rel.match(/(?:^|\/)adr\/(\d{4})-[^/]+\.md$/);
  if (adm) {
    const id = `ADR-${adm[1]}`;
    if (!defined.has(id)) defined.set(id, []);
    defined.get(id).push(`${rel}:1`);
  }

  // 候审档字母区：## Q. 标题下的 "N. xxx" 列表项 = 定义 Q<N>
  let sectionLetter = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const secM = line.match(/^## ([A-Z])\.\s/);
    if (secM) sectionLetter = secM[1];
    if (/^## /.test(line) && !secM) sectionLetter = null;
    const itemM = sectionLetter && line.match(/^(\d+)\.\s/);
    if (itemM) {
      const id = `${sectionLetter}${itemM[1]}`;
      if (!defined.has(id)) defined.set(id, []);
      defined.get(id).push(`${rel}:${i + 1}`);
    }
    const headM = line.match(new RegExp(`^#{1,6}\\s+(${idAlt})\\s*[.．:：—\\- ]`));
    if (headM) {
      const id = headM[1];
      if (!defined.has(id)) defined.set(id, []);
      defined.get(id).push(`${rel}:${i + 1}`);
      continue; // 标题行是定义不是引用
    }
    for (const bm of line.matchAll(new RegExp(BOLD_DEF.source, 'g'))) {
      const id = bm[1];
      if (!defined.has(id)) defined.set(id, []);
      defined.get(id).push(`${rel}:${i + 1}`);
    }
    for (const rm of line.matchAll(LABEL_REF)) refs.push({ id: rm[1], rel, line: i + 1 });
  }
}
// 引用检查豁免：候审档（只增不隐）+ descriptive/frozen 史档——旧名是冻结史不是悬空
const refsLive = refs.filter(r =>
  !/findings/i.test(r.rel) && !['descriptive', 'frozen'].includes(statusByFile.get(r.rel)));

for (const [id, sites] of defined) {
  const files = [...new Set(sites.map(s => s.split(':')[0]))];
  if (files.length > 1) add('E', `标号撞名: ${id} 定义于多处（${sites.join(', ')}）——前缀=有界上下文，跨空间不撞名`);
}
for (const { id, rel, line } of refsLive) {
  if (!defined.has(id)) add('W', `悬空引用: ${id} 无定义位（${rel}:${line}）`);
}
for (const [id] of defined) {
  if (!LABEL_FORMATS.some(r => r.test(id))) add('W', `标号 ${id} 不匹配已登记命名空间格式（namespaces.json）`);
}
// 登记表双真相互锁: meta 域文档的"命名空间"表对照 namespaces.json（散文视图不得偏离机读源）
if (nsFile) {
  const jsonPrefixes = new Set(nsList.map(n => n.prefix));
  for (const { rel, fm, text } of allDocs) {
    if (!fm || fm.domain !== 'meta') continue;
    const tablePrefixes = new Set();
    let inNs = false;
    for (const line of text.split('\n')) {
      if (/^#{1,6}\s/.test(line)) inNs = /命名空间|namespace/i.test(line);
      else if (inNs && /^\|/.test(line)) {
        for (const m of (line.split('|')[1] || '').matchAll(/`([^`]+)`/g)) tablePrefixes.add(m[1].trim());
      }
    }
    if (!tablePrefixes.size) continue; // 无命名空间表的 meta 文档不参与互锁
    for (const p of tablePrefixes) if (!jsonPrefixes.has(p)) add('E', `登记漂移: meta 表前缀 ${p} 不在 namespaces.json（${rel}）`, rel);
    for (const p of jsonPrefixes) if (!tablePrefixes.has(p)) add('E', `登记漂移: namespaces.json 前缀 ${p} 未在 meta 表登记（${rel}）`, rel);
  }
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
  console.log(`命名空间表: ${nsSource}`);
  console.log(`域清单: ${[...domainDocs.keys()].join(', ') || '(无)'}`);
  for (const i of issues) console.log(`[${i.level}] ${i.file === target ? '' : i.file + ' '}${i.msg}`);
  const e = issues.filter(i => i.level === 'E').length;
  const w = issues.filter(i => i.level === 'W').length;
  const n = issues.filter(i => i.level === 'I').length;
  console.log(`\nE=${e} W=${w} I=${n}`);
}
process.exitCode = issues.some(i => i.level === 'E') ? 1 : 0;
