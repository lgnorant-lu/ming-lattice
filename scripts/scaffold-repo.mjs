#!/usr/bin/env node
// scaffold-repo.mjs — 仓库采纳薄编排（"立"动力学的仓级单入口）
// 用法: node scripts/scaffold-repo.mjs --target <repo> [--tier minimal|standard|full] [--with-boundary] [--skip-domains] [--skip-hooks] [--dry-run]
// 形态: 顺序编排三件套——scaffold-domains（docs 域骨架）→ install-hooks -Target（门禁 kit）→ 自检收尾。
//       每步失败即停（fail-fast）；--dry-run 只打印计划不落盘。
// 依据: 采纳序已由 huanyus（Ming-L full + hooks kit 全拓扑）与 blog-tui（hooks kit）双实例实证——
//       本脚本只是把已验证的三步顺序机械固化，不新增语义。
// 契约: 目标须为 git 仓根；pwsh 7 是 hooks 移植面的钦定运行时（仓铁律）。

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCAFFOLD_DOMAINS = path.join(REPO_ROOT, 'private/engineering/ming-l-paradigm/scripts/scaffold-domains.mjs');
const INSTALL_HOOKS = path.join(REPO_ROOT, 'scripts/install-hooks.ps1');

const die = (msg) => { console.error(`[E] ${msg}`); process.exit(1); };
const args = process.argv.slice(2);
const VALUE_FLAGS = new Set(['--target', '--tier']);
const opts = {};
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (VALUE_FLAGS.has(a)) {
    const v = args[i + 1];
    if (v === undefined || v.startsWith('--')) die(`旗标 ${a} 缺值（或把下一个旗标吞成了值）`);
    if (opts[a] !== undefined) die(`重复旗标: ${a}`);
    opts[a] = v; i++;
  } else if (['--with-boundary', '--skip-domains', '--skip-hooks', '--dry-run'].includes(a)) opts[a] = true;
  else die(a.startsWith('--') ? `未知旗标: ${a}` : `不接受位置参数: ${a}（仓径走 --target）`);
}
if (!opts['--target']) die('缺 --target <repo>');
const target = path.resolve(opts['--target']);
const tier = opts['--tier'];
const dryRun = !!opts['--dry-run'];

if (!fs.existsSync(path.join(target, '.git'))) die(`目标不是 git 仓根: ${target}`);
if (!fs.existsSync(SCAFFOLD_DOMAINS)) die(`scaffold-domains 缺席: ${SCAFFOLD_DOMAINS}`);
if (!fs.existsSync(INSTALL_HOOKS)) die(`install-hooks 缺席: ${INSTALL_HOOKS}`);

const steps = [];
if (!opts['--skip-domains']) {
  const cmd = [process.execPath, SCAFFOLD_DOMAINS, '--target', path.join(target, 'docs'), '--project', path.basename(target)];
  if (tier) cmd.push('--tier', tier);
  if (dryRun) cmd.push('--dry-run');
  steps.push({ name: '域骨架 (scaffold-domains)', cmd,
    dryRunNote: '[dry-run] 将实例化 docs/ 域骨架+ming.yaml+namespaces.json（下方命令即可重现逐文件预览）' });
}
if (!opts['--skip-hooks']) {
  // pwsh 为钦定运行时；缺席自动回退 Node 实现（install-hooks.mjs 语义对齐 -Target）
  const hasPwsh = !spawnSync('pwsh', ['-NoProfile', '-Command', 'exit 0'], { stdio: 'ignore' }).error;
  const cmd = hasPwsh
    ? ['pwsh', '-NoProfile', '-File', INSTALL_HOOKS, '-Target', target]
    : [process.execPath, path.join(REPO_ROOT, 'scripts/install-hooks.mjs'), '--target', target];
  if (opts['--with-boundary']) cmd.push(hasPwsh ? '-WithBoundary' : '--with-boundary');
  if (dryRun) cmd.push(hasPwsh ? '-WhatIf' : '--dry-run');
  steps.push({ name: `门禁 kit (install-hooks -Target${hasPwsh ? '' : '·node 回退'})`, cmd });
}
if (!steps.length) die('--skip-domains + --skip-hooks = 无事可做');

// dry-run 契约=零 spawn 静态计划（快且零副作用）；逐文件级预览由各步自身
// 预览动词承担——打印的命令行含 --dry-run/-WhatIf，复制即得真实预览
if (dryRun) {
  console.log(`scaffold-repo [dry-run]: ${target}`);
  for (const s of steps) {
    if (s.dryRunNote) console.log(`  ${s.name}\n    ${s.dryRunNote}`);
    console.log(`  ${s.name} 命令行:\n    ${s.cmd.map(c => JSON.stringify(c)).join(' ')}`);
  }
  process.exit(0);
}

for (const s of steps) {
  console.log(`\n== ${s.name} ==`);
  const r = spawnSync(s.cmd[0], s.cmd.slice(1), { stdio: 'inherit' });
  if (r.status !== 0) die(`${s.name} 失败 (exit=${r.status})——已停，已完成的步骤不回滚（幂等可重跑）`);
}

// 自检收尾：hooks 侧三断言（engine 在场 / hooksPath 已配 / adoption 已记）——
// docs 侧自证已由 scaffold-domains 内建（audit E 即 exit 1，到不了这里）。
if (!opts['--skip-hooks']) {
  const p = [];
  if (!fs.existsSync(path.join(target, 'scripts/hooks/engine.mjs'))) p.push('scripts/hooks/engine.mjs 缺席');
  const hp = spawnSync('git', ['-C', target, 'config', 'core.hooksPath'], { encoding: 'utf8' });
  if ((hp.stdout || '').trim() !== '.githooks') p.push(`core.hooksPath=${(hp.stdout || '').trim() || '(unset)'}（期望 .githooks）`);
  if (!fs.existsSync(path.join(target, '.git/hook-engine-state.json'))) p.push('hook-engine-state.json 缺席（adoption 未记）');
  for (const m of p) console.log(`  [W] ${m}`);
  if (p.length) die(`自检未过（${p.length} 项）——见上 W 明细`);
}

console.log(`\nscaffold-repo: ${target} 采纳完成——下一步: 裁 .hooksrc / boundaries.yaml / ming.yaml domains`);
