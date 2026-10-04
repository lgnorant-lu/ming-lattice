#!/usr/bin/env node
// scaffold-domains.test.mjs — scaffold-domains 自测套（"立"动力学机械化的自洽验证）
// 每用例一个临时 target → node scaffold-domains.mjs --target <dir> … → 断言产物文件/内容/幂等/可审计性
// 用法: node scaffold-domains.test.mjs   退出码: 0=全过  1=有失败

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SCAFFOLD = path.join(SCRIPT_DIR, 'scaffold-domains.mjs');
const AUDIT = path.join(SCRIPT_DIR, 'audit-domains.mjs');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-fx-'));
const exists = (dir, rel) => fs.existsSync(path.join(dir, rel));
const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8');

function runScaffold(dir, extra = []) {
  const r = spawnSync('node', [SCAFFOLD, '--target', dir, ...extra], { encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}
function runAudit(dir) {
  const r = spawnSync('node', [AUDIT, dir, '--json'], { encoding: 'utf8' });
  const out = (r.stdout || '').trim();
  try { return { ...JSON.parse(out.slice(out.indexOf('{'))), status: r.status }; }
  catch { return { parseError: true, issues: [], status: r.status, stderr: r.stderr }; }
}
const count = (res, lv) => (res.issues || []).filter(i => i.level === lv).length;

const FULL_FILES = [
  'META.md', 'spec/README.md', 'spec/OPEN-FINDINGS.md', 'dev/CONTRACT.md',
  'plan/ORDERING.md', 'plan/PLAN.md', 'gov/GOVERNANCE.md', 'exp/EXPERIMENTS.md',
  'verify/VERIFY.md', 'ops/RUNBOOK.md', 'know/KNOWLEDGE.md',
  'namespaces.json', 'ming.yaml',
];

let pass = 0, fail = 0;
function check(name, problems) {
  if (problems.length) { console.log(`[FAIL] ${name} — ${problems.join('; ')}`); fail++; }
  else { console.log(`[PASS] ${name}`); pass++; }
}

// ── 1. minimal 档：meta+spec+findings，无 dev ──
{
  const d = tmp(), t = path.join(d, 'docs');
  const r = runScaffold(t, ['--tier', 'minimal']);
  const p = [];
  for (const f of ['META.md', 'spec/README.md', 'spec/OPEN-FINDINGS.md', 'namespaces.json', 'ming.yaml'])
    if (!exists(t, f)) p.push(`缺产物 ${f}`);
  if (exists(t, 'dev/CONTRACT.md')) p.push('minimal 不该出 dev/CONTRACT.md');
  if (exists(t, 'plan/PLAN.md')) p.push('minimal 不该出 plan/PLAN.md');
  if (r.status !== 0) p.push(`exit=${r.status}`);
  if (!read(t, 'ming.yaml').includes('tier: minimal')) p.push('ming.yaml 未记 tier: minimal');
  check('minimal 档产物面', p);
}

// ── 2. standard 档：+dev ──
{
  const t = path.join(tmp(), 'docs');
  runScaffold(t, ['--tier', 'standard']);
  const p = [];
  for (const f of ['META.md', 'spec/README.md', 'spec/OPEN-FINDINGS.md', 'dev/CONTRACT.md'])
    if (!exists(t, f)) p.push(`缺产物 ${f}`);
  if (exists(t, 'gov/GOVERNANCE.md')) p.push('standard 不该出 gov');
  const y = read(t, 'ming.yaml');
  for (const dom of ['meta', 'spec', 'dev']) if (!y.includes(`- ${dom}`)) p.push(`ming.yaml domains 缺 ${dom}`);
  if (y.includes('- findings')) p.push('findings 不应进 domains 声明（它是 spec 的档非域）');
  check('standard 档产物面+domains 声明', p);
}

// ── 3. full 档：九域+findings 全出，且立即过 audit ──
{
  const t = path.join(tmp(), 'docs');
  runScaffold(t, ['--tier', 'full', '--project', 'fxproj']);
  const p = [];
  for (const f of FULL_FILES) if (!exists(t, f)) p.push(`缺产物 ${f}`);
  const a = runAudit(t);
  if (a.parseError) p.push('audit JSON 解析失败');
  if (count(a, 'E') !== 0) p.push(`audit E=${count(a, 'E')}（生成物不自洽）`);
  if (count(a, 'W') !== 0) p.push(`audit W=${count(a, 'W')}`);
  if (!read(t, 'META.md').includes('fxproj')) p.push('{{project}} 未替换');
  check('full 档九域齐备+生成物即合规+project 替换', p);
}

// ── 4. 显式 --domains 覆盖 tier ──
{
  const t = path.join(tmp(), 'docs');
  runScaffold(t, ['--domains', 'meta,know', '--tier', 'full']);
  const p = [];
  if (!exists(t, 'META.md')) p.push('缺 META.md');
  if (!exists(t, 'know/KNOWLEDGE.md')) p.push('缺 know/KNOWLEDGE.md');
  if (exists(t, 'spec/README.md')) p.push('--domains 显式时不该出 spec');
  const y = read(t, 'ming.yaml');
  if (!y.includes('- know')) p.push('ming.yaml domains 缺 know');
  if (y.includes('- spec')) p.push('ming.yaml domains 不该有 spec');
  if (!y.includes('tier: custom')) p.push('显式域集≠任一档时应标 tier: custom（tier 按实发集反推，防错标）');
  check('--domains 显式覆盖 tier + 诚实标', p);
}

// ── 5. 幂等：二次运行 skip(exists)，手改不被吞 ──
{
  const t = path.join(tmp(), 'docs');
  runScaffold(t, ['--tier', 'minimal']);
  fs.appendFileSync(path.join(t, 'META.md'), '\n手改标记\n');
  const r2 = runScaffold(t, ['--tier', 'minimal']);
  const p = [];
  if (!r2.stdout.includes('skip(exists)')) p.push('二跑未报 skip(exists)');
  if (!read(t, 'META.md').includes('手改标记')) p.push('幂等失效：手改被覆写');
  check('幂等可重放', p);
}

// ── 6. --force 覆写 ──
{
  const t = path.join(tmp(), 'docs');
  runScaffold(t, ['--tier', 'minimal']);
  fs.appendFileSync(path.join(t, 'META.md'), '\n手改标记\n');
  runScaffold(t, ['--tier', 'minimal', '--force']);
  const p = [];
  if (read(t, 'META.md').includes('手改标记')) p.push('--force 未覆写');
  check('--force 覆写语义', p);
}

// ── 7. 未知域 unknown-skip 不炸，且不登记 ming.yaml（防声明未实例化自伤）──
{
  const t = path.join(tmp(), 'docs');
  const r = runScaffold(t, ['--domains', 'meta,bogus']);
  const p = [];
  if (!r.stdout.includes('unknown-skip')) p.push('未报 unknown-skip');
  if (r.status !== 0) p.push(`未知域致 exit=${r.status}`);
  if (!exists(t, 'META.md')) p.push('已知域被连坐');
  if (read(t, 'ming.yaml').includes('- bogus')) p.push('未知域被登记进 domains 声明——生成物自伤');
  check('未知域降级提示不中断且不登记', p);
}

// ── 8. 默认调用（无参）= standard 形态 ──
{
  const t = path.join(tmp(), 'docs');
  runScaffold(t);
  const p = [];
  if (!exists(t, 'dev/CONTRACT.md')) p.push('默认档应含 dev');
  if (!read(t, 'ming.yaml').includes('tier: standard')) p.push('默认 ming.yaml 应记 standard');
  check('默认档=standard 形态', p);
}

// ── 9. 生成物 dynamics 标注降低矩阵噪音（I 有界）──
{
  const t = path.join(tmp(), 'docs');
  runScaffold(t, ['--tier', 'full']);
  const a = runAudit(t);
  const matrixI = (a.issues || []).filter(i => i.msg.includes('矩阵空格')).length;
  const p = [];
  if (matrixI > 20) p.push(`矩阵空格 I=${matrixI} 超界（模板 dynamics 标注失效？）`);
  check('模板 dynamics 抑制矩阵噪音', p);
}

// ── 10. 参数解析缺陷族回归（同 scaffold-skill）：未知旗标/缺值/吞值/无效 tier/位置参数全拒且不落盘 ──
{
  const t = path.join(tmp(), 'docs');
  const p = [];
  const cases = [
    ['--tagret', t],                       // 未知旗标（拼错静默建默认 docs/ 的历史缺陷）
    ['--tier'],                            // 缺值
    ['--tier', '--force', '--target', t],  // 吞值：--force 被吃成 tier
    ['--tier', 'bogus', '--target', t],    // 无效 tier 静默回落默认域的历史缺陷
    ['straypos', '--target', t],           // 位置参数
    ['--domains', '', '--target', t],      // 空域表
  ];
  for (const c of cases) {
    const r = spawnSync('node', [SCAFFOLD, ...c], { encoding: 'utf8' });
    if (r.status === 0) p.push(`未拒: ${c.join(' ')}`);
  }
  if (exists(t, 'META.md') || exists(t, 'ming.yaml')) p.push('拒后仍落盘');
  check('参数缺陷族 fail-closed', p);
}

console.log(`\n${pass} passed, ${fail} failed, 10 total`);
process.exit(fail ? 1 : 0);
