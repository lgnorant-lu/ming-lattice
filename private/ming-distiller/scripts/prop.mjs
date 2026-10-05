#!/usr/bin/env node
// prop.mjs — _proposals 提案队列结构化原语（L1 脚手架）
// 动词:
//   new <slug> --type <t> --target <path> [--opened-at <d>] [--review-after <d|PnD>] [--dry-run]
//   check [--strict]        提案格式门（与 check-index 共享 lib 门函数——同一事实源）
//   report                  候审浮出（pending 在前按到期升序）
//   register [--dry-run]    生成 QUEUE.yaml 队列投影（生成物禁手编；幂等——无变化即 noop）
// 旗标: --json 机读输出 | --dry-run 预览不落盘 | --strict W 提升 E
// 变更档: check/report=L0 读动词；new/register=L1（dry-run 预览+幂等+写时 fail-closed 门）
// 词表/解析/门源: scripts/lib/proposal-schema.mjs（与 check-index.mjs 共享）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROP_TYPES, SLUG_RE, ID_SCHEMES,
  gateProposal, queueRows, parseFmText,
  loadDocclassConfig, proposalGateCfg } from './lib/proposal-schema.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DISTILL_DIR = process.env.MING_DISTILL_DIR || path.join(REPO_ROOT, 'distill');
const PROP_DIR = path.join(DISTILL_DIR, '_proposals');
const TODAY = new Date().toISOString().slice(0, 10);

// docclass.yaml（L4）：states 子集/agingDays/idScheme 由配置声明；解析失败分档——
// check 以 E 级 issue 计入、写动词（new/register）fail-closed、report 只 warn。
const { cfg: propCfg, errors: cfgErrs } = proposalGateCfg(loadDocclassConfig(DISTILL_DIR));

// ── 参数解析 ──
const args = process.argv.slice(2);
const verb = args[0];
if (!verb || !['new', 'check', 'report', 'register'].includes(verb)) {
  console.error('用法: prop new <slug> --type <t> --target <p> [--opened-at <d>] [--review-after <d|PnD>] [--dry-run]');
  console.error('      prop check|report|register [--json] [--strict] [--dry-run]');
  process.exit(2);
}
const rest = args.slice(1);
const flags = new Set(); const opts = {};
const BOOL = new Set(['--json', '--strict', '--dry-run']);
const VAL = new Set(['--type', '--target', '--opened-at', '--review-after']);
for (let i = 0; i < rest.length; i++) {
  const a = rest[i];
  if (BOOL.has(a)) { if (flags.has(a)) { console.error(`duplicate flag: ${a}`); process.exit(2); } flags.add(a); continue; }
  if (VAL.has(a)) { const v = rest[++i]; if (v === undefined || v.startsWith('--')) { console.error(`${a} 需要值`); process.exit(2); } opts[a.slice(2)] = v; continue; }
  if (a.startsWith('--')) { console.error(`unknown flag: ${a}`); process.exit(2); }
  if (opts._pos) { console.error(`多余位置参数: ${a}`); process.exit(2); }
  opts._pos = a;
}
const jsonOut = o => console.log(JSON.stringify(o, null, 2));
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ── prop new ──
if (verb === 'new') {
  const slug = opts._pos;
  if (!slug || !SLUG_RE.test(slug)) { console.error(`slug 须为 kebab 形态（小写字母数字连字符）: ${slug ?? '(缺)'}`); process.exit(2); }
  if (!opts.type) { console.error('缺 --type（词表: ' + [...PROP_TYPES].join('|') + '）'); process.exit(2); }
  if (!PROP_TYPES.has(opts.type)) { console.error(`type 越出闭集: ${opts.type}（${[...PROP_TYPES].join('|')}）`); process.exit(2); }
  if (!opts.target) { console.error('缺 --target（提案指向的包/文档路径）'); process.exit(2); }
  if (cfgErrs.length) { for (const e of cfgErrs) console.error(`[config] ${e}`); process.exit(2); }
  if (!ID_SCHEMES.has(propCfg.idScheme)) {
    console.error(`docclass.yaml 声明 idScheme=${propCfg.idScheme}——未实现（已建: ${[...ID_SCHEMES].join('|')}），fail-closed`); process.exit(2);
  }
  if (!propCfg.states.has('pending')) {
    console.error('docclass.yaml states 子集缺 pending——new 无法生成合法初态，fail-closed'); process.exit(2);
  }
  const openedAt = opts['opened-at'] ?? TODAY;
  // 日期语义校验用回环比对：本版 Node 连 T 形也滚动解析
  // （2026-02-30T00:00:00Z→3-02）——解析成功不等于日期真实，须 iso 回写同源
  const validDate = s => {
    if (!DATE_RE.test(s)) return false;
    const t = Date.parse(`${s}T00:00:00Z`);
    return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s;
  };
  if (!validDate(openedAt)) {
    console.error(`--opened-at 非合法日期: ${openedAt}`); process.exit(2);
  }
  let reviewAfter = opts['review-after'];
  if (!reviewAfter) reviewAfter = `P${propCfg.agingDays}D`;
  const durM = reviewAfter.match(/^P(\d+)D$/);
  if (durM) reviewAfter = new Date(Date.parse(`${openedAt}T00:00:00Z`) + Number(durM[1]) * 86400000).toISOString().slice(0, 10);
  if (!validDate(reviewAfter)) {
    console.error(`--review-after 非 <合法YYYY-MM-DD|PnD>: ${opts['review-after']}`); process.exit(2);
  }

  const id = `${openedAt}-${slug}`;   // 文件名即 id——日期段绑定开启日非生成日
  const file = path.join(PROP_DIR, `${id}.md`);
  const content = `---
id: ${id}
target: ${opts.target}
type: ${opts.type}
status: pending
openedAt: ${openedAt}
reviewAfter: ${reviewAfter}
---

# <标题>

## 0. 动机与证据锚点

- <每条目须挂可复查锚点：文件/命令/输出>

## 1. 提案条目

### P1 <待填>

## 2. 不采纳项（消融）

| 方案 | 否决理由 |
|---|---|

## 3. 升格判据（判据台账）

| # | 判据 | 状态 | 兑现锚 |
|---|---|---|---|

## 修订记录

| r | date | 形态变化 | 评审来源 |
|---|---|---|---|
| r1 | ${TODAY} | 初稿 | — |
`;
  // 写时校验（local staging 无 commit 门可达——L3 硬门前置到此处）
  const issues = gateProposal(`_proposals/${id}.md`, id, parseFmText(content), TODAY, propCfg)
    .filter(i => i.level === 'E');
  if (issues.length) {
    console.error(`写时门拦截——生成物自身违例（实现缺陷）:`);
    for (const i of issues) console.error(`  [E] ${i.msg}`);
    process.exit(1);
  }
  const rel = path.relative(REPO_ROOT, file).replace(/\\/g, '/');
  if (flags.has('--dry-run')) {
    if (flags.has('--json')) jsonOut({ dryRun: true, path: rel, exists: fs.existsSync(file), content });
    else { console.log(`[dry-run] 将写入 ${rel}:`); console.log(content); if (fs.existsSync(file)) console.log('注意: 文件已存在——实写将幂等拒写'); }
    process.exit(0);
  }
  if (fs.existsSync(file)) {
    console.error(`已存在: ${rel}——同 slug 幂等拒写（改名或改日期）`);
    process.exit(1);
  }
  fs.mkdirSync(PROP_DIR, { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
  if (flags.has('--json')) jsonOut({ created: rel, id, status: 'pending' });
  else console.log(`created: ${rel}`);
  process.exit(0);
}

// ── prop check ──
if (verb === 'check') {
  const issues = [];
  for (const e of cfgErrs) issues.push({ level: 'E', msg: e });
  if (fs.existsSync(PROP_DIR)) {
    for (const f of fs.readdirSync(PROP_DIR)) {
      if (!f.endsWith('.md')) continue;
      const label = `_proposals/${f}`;
      const text = fs.existsSync(path.join(PROP_DIR, f)) ? fs.readFileSync(path.join(PROP_DIR, f), 'utf8') : '';
      for (const i of gateProposal(label, f.replace(/\.md$/, ''), parseFmText(text), TODAY, propCfg)) issues.push(i);
    }
  }
  const counts = { E: 0, W: 0 };
  for (const i of issues) counts[i.level]++;
  if (flags.has('--json')) jsonOut({ issues, counts });
  else {
    if (!fs.existsSync(PROP_DIR)) console.log('prop-check: _proposals 缺席——0 件');
    for (const i of issues) console.log(`[${i.level}] ${i.msg}`);
    console.log(`prop-check: E=${counts.E} W=${counts.W}`);
  }
  if (counts.E > 0 || (flags.has('--strict') && counts.W > 0)) process.exit(1);
  process.exit(0);
}

// ── prop report ──
if (verb === 'report') {
  for (const e of cfgErrs) console.error(`[config-W] ${e}`);
  const { rows, pending } = queueRows(PROP_DIR);
  if (flags.has('--json')) { jsonOut({ queue: rows, pending }); process.exit(0); }
  console.log('proposal queue (report, non-gate):');
  for (const r of rows) {
    const d = r.days === null ? '-' : (r.days < 0 ? `${r.days}d overdue` : `${r.days}d`);
    console.log(`  ${r.id} | ${r.status} | opened=${r.openedAt} | reviewAfter=${r.reviewAfter} | ${d}`);
  }
  console.log(`queue: total=${rows.length} pending=${pending}`);
  process.exit(0);
}

// ── prop register —— 生成 _proposals/QUEUE.yaml 队列投影（生成物禁手编） ──
// 本仓 staging 为 gitignored 本地内容区，无手编登记册——QUEUE.yaml 是
// scan 结果的规范化投影，供 hooks/外部工具免解析消费；幂等：无变化即 noop。
if (verb === 'register') {
  if (cfgErrs.length) { for (const e of cfgErrs) console.error(`[config] ${e}`); process.exit(2); }
  const { rows, pending } = queueRows(PROP_DIR);
  const lines = [
    'schemaVersion: "1.0"',
    'generated: prop-register          # 生成投影——禁手编（手改将被覆写）',
    `queue:`,
  ];
  // 标量安全阀：frontmatter 值是不可信输入——含 ':'/'#'/空白的裸写会静默腐蚀
  // 投影（': ' 变键值嵌套、'#' 变注释截断）。安全形态裸写保字节兼容，
  // 越界形态走 JSON.stringify（YAML 双引号标量是 JSON 超集）。
  const yamlScalar = v => /^[A-Za-z0-9._-]+$/.test(v) ? v : JSON.stringify(v);
  for (const r of rows) {
    lines.push(`  - id: ${yamlScalar(r.id)}`);
    lines.push(`    status: ${yamlScalar(r.status)}`);
    lines.push(`    openedAt: ${yamlScalar(r.openedAt)}`);
    lines.push(`    reviewAfter: ${yamlScalar(r.reviewAfter)}`);
  }
  lines.push(`pending: ${pending}`);
  lines.push(`total: ${rows.length}`);
  const out = lines.join('\n') + '\n';
  const qfile = path.join(PROP_DIR, 'QUEUE.yaml');
  const rel = path.relative(REPO_ROOT, qfile).replace(/\\/g, '/');
  const prev = fs.existsSync(qfile) ? fs.readFileSync(qfile, 'utf8') : null;
  const changed = prev !== out;
  if (flags.has('--dry-run')) {
    if (flags.has('--json')) jsonOut({ dryRun: true, path: rel, changed, entries: rows.length, pending, content: out });
    else {
      console.log(`[dry-run] ${rel}: ${changed ? '将写入' : '无变化（幂等 noop）'} — ${rows.length} 条目 / ${pending} pending`);
      if (changed) console.log(out);
    }
    process.exit(0);
  }
  if (!changed) {
    if (flags.has('--json')) jsonOut({ noop: true, path: rel, entries: rows.length, pending });
    else console.log(`queue 无变化——幂等 noop: ${rel}`);
    process.exit(0);
  }
  fs.mkdirSync(PROP_DIR, { recursive: true });
  fs.writeFileSync(qfile, out, 'utf8');
  if (flags.has('--json')) jsonOut({ registered: rel, entries: rows.length, pending });
  else console.log(`registered: ${rel} — ${rows.length} 条目 / ${pending} pending`);
  process.exit(0);
}
