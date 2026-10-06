#!/usr/bin/env node
// scripts/bootstrap.mjs — 开箱自举编排（克隆体 → 可工作箱）
// 用法:
//   node scripts/bootstrap.mjs [--dry-run] [--skip-fetch]
// 步骤:
//   1. git submodule update --init      base/ 子模块引导（无 submodule 容忍跳过）
//   2. node scripts/fetch.mjs           vertical 物化（--skip-fetch 离线跳过；网络失败 warn 不致命）
//   3. deployable 死链接修复            120000 索引条目 vs 工作区实体——Windows 无
//                                     symlink 支持的克隆上链接是含路径的文本文件；
//                                     修复走 Node 链接阶梯（junction 免提权），
//                                     目标未物化则 warn 提示先 fetch
//   4. 自举 hooks                       core.hooksPath=.githooks + POSIX chmod
// 全步骤幂等；dry-run 走同探测路径只报告不写盘。
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const skipFetch = args.includes('--skip-fetch');
const isWin = process.platform === 'win32';

// git 调用有界化：status 本地操作 60s；submodule update 触网 300s + 防凭证提示挂死
const git = (g, { timeout = 60_000 } = {}) => execFileSync('git', g,
  { cwd: REPO_ROOT, encoding: 'utf8', timeout, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
const report = [];
const step = (name, ok, note = '') => { report.push({ name, ok, note }); console.log(`[bootstrap] ${ok === 'warn' ? '[WARN]' : ok ? '[OK]' : '[SKIP]'} ${name}${note ? ' — ' + note : ''}`); };

// ---------- 1. submodule 引导 ----------
{
  const subs = git(['submodule', 'status']).trim();
  if (!subs) step('submodule', false, '无 submodule 条目');
  else {
    const pending = subs.split('\n').filter(l => l.startsWith('-')).length;
    if (!pending) step('submodule', true, '已全部引导');
    else if (dryRun) step('submodule', 'warn', `${pending} 个待 init（dry-run）`);
    else {
      try { git(['submodule', 'update', '--init'], { timeout: 300_000 }); step('submodule', true, `init ${pending} 个`); }
      catch (e) { step('submodule', 'warn', `init 失败: ${e.message.split('\n')[0]}`); }
    }
  }
}

// ---------- 2. vertical 物化 ----------
if (skipFetch) step('fetch', false, '--skip-fetch');
else if (dryRun) {
  const plan = spawnSync(process.execPath, ['scripts/fetch.mjs', '--dry-run'], { cwd: REPO_ROOT, encoding: 'utf8' });
  step('fetch', plan.status === 0, 'dry-run 计划见上方 fetch 输出');
} else {
  const r = spawnSync(process.execPath, ['scripts/fetch.mjs'], { cwd: REPO_ROOT, stdio: 'inherit' });
  step('fetch', r.status === 0, r.status === 0 ? '' : '网络/源故障（可稍后重跑）');
}

// ---------- 3. deployable 死链接修复 ----------
{
  const entries = git(['ls-files', '-s', '-z']).split('\0').filter(Boolean)
    .filter(e => e.startsWith('120000 '))
    .map(e => e.slice(e.indexOf('\t') + 1));
  let dead = 0, fixed = 0, missing = 0;
  for (const rel of entries) {
    const abs = path.join(REPO_ROOT, rel);
    let st;
    try { st = fs.lstatSync(abs); } catch { continue; }
    if (st.isSymbolicLink()) continue;                    // POSIX 正常链接
    // 死链接：工作区是含目标路径的文本文件
    const target = fs.readFileSync(abs, 'utf8').trim();
    // 相对目标从链接所在目录解析（symlink 标准语义），不是仓根
    const resolved = path.isAbsolute(target) ? target : path.resolve(path.dirname(abs), target);
    dead++;
    if (dryRun) continue;
    // 仓外绝对目标=可移植性缺陷（别仓路径烙进 blob）——拒绝跨仓串线，只警告
    if (path.isAbsolute(target) && !resolved.startsWith(REPO_ROOT + path.sep)) { missing++; continue; }
    if (!fs.existsSync(resolved)) { missing++; continue; }
    try {
      fs.rmSync(abs, { force: true, recursive: false });
      // 写相对目标——绝对路径烙机器布局进链接，换机/换路径克隆即断
      const relTarget = path.relative(path.dirname(abs), resolved);
      fs.symlinkSync(relTarget, abs, fs.statSync(resolved).isDirectory() && isWin ? 'junction' : undefined);
      fixed++;
    } catch {
      // 文件级链接在无权限 Windows 上连 junction 也不行——复制兜底（链接语义降级为快照）
      try {
        const src = fs.statSync(resolved);
        if (src.isDirectory()) fs.cpSync(resolved, abs, { recursive: true });
        else fs.copyFileSync(resolved, abs);
        fixed++;
      } catch { missing++; }
    }
  }
  step('deployable 链接', dead === 0,
    dryRun ? `${dead} 条死链接待修` : `${fixed} 修复${missing ? `，${missing} 目标未物化（先 fetch）` : ''}`);
}

// ---------- 4. hooks 自举 ----------
{
  let hp = '';
  try { hp = git(['config', '--get', 'core.hooksPath']).trim(); } catch { /* 未配置 */ }
  if (hp === '.githooks') step('hooksPath', true, '已配置');
  else if (dryRun) step('hooksPath', 'warn', '待配置（dry-run）');
  else {
    git(['config', 'core.hooksPath', '.githooks']);
    if (!isWin) { for (const f of fs.readdirSync(path.join(REPO_ROOT, '.githooks'))) fs.chmodSync(path.join(REPO_ROOT, '.githooks', f), 0o755); }
    step('hooksPath', true, 'core.hooksPath=.githooks');
  }
}

console.log('[bootstrap] ────────────────────────────');
const warns = report.filter(r => r.ok === 'warn').length;
console.log(`[bootstrap] ${dryRun ? '(dry-run) ' : ''}完成: ${report.filter(r => r.ok === true).length} 步就绪, ${warns} 项注意`);
console.log('[bootstrap] 后续: pwsh scripts/sync.ps1 -DryRun 预览部署到客户端');
process.exit(0);
