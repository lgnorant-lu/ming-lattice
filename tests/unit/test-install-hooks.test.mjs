// tests/unit/test-install-hooks.test.mjs
// 单元测试: scripts/install-hooks.mjs（POSIX 补位 -Target 实现）
// 覆盖: 参数缺陷族 fail-closed / 非 git 仓拒绝 / --dry-run 零落盘 /
//   真跑产物面（kit+shim+tmpl+gitignore+hooksPath+元数据）/ gates.local 排除 /
//   幂等不覆盖 .hooksrc / 旧 hooksPath 防线+--force / --with-boundary 采纳面。
// ps1 -Target 路径由 cli-isolated WhatIf 套件+第二采纳者实证兜底。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const SCRIPT = path.join(REPO_ROOT, 'scripts/install-hooks.mjs');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'install-hooks-'));
const cli = (args) => spawnSync('node', [SCRIPT, ...args], { encoding: 'utf8' });
const git = (d, a) => {
  try { return execFileSync('git', a, { cwd: d, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return ''; }   // unset key / 非零退出 → 空串（断言侧区分）
};
const realRepo = () => {
  const d = tmp();
  git(d, ['init', '-q']);
  git(d, ['config', 'user.email', 't@t.t']);
  git(d, ['config', 'user.name', 't']);
  git(d, ['commit', '--allow-empty', '-qm', 'init']);
  return d;
};

const problems = [];
const check = (cond, msg) => { if (!cond) problems.push(msg); };
const dirs = [];
const track = d => (dirs.push(d), d);

export function run() {
  console.log('[TEST UNIT] install-hooks.mjs...');

  // ── 参数缺陷族 ──
  {
    for (const [a, m] of [
      [['--targt', '/tmp/x'], '未知旗标未拒'],
      [['--target'], '缺值未拒'],
      [['--target', '--force'], '吞值未拒'],
      [['/tmp/x', '--force'], '位置参数未拒'],
      [[], '缺 --target 未拒'],
    ]) {
      const r = cli(a);
      check(r.status !== 0 && /\[E\]/.test(r.stderr || ''), `${m}: ${a.join(' ')}`);
    }
    const d = track(tmp()); fs.mkdirSync(path.join(d, '.git'));
    const r = cli(['--target', d, '--target', d]);
    check(r.status !== 0 && /重复旗标/.test(r.stderr || ''), '重复 --target 未拒');
  }

  // ── 非 git 仓 fail-closed ──
  {
    const d = track(tmp());
    const r = cli(['--target', d, '--dry-run']);
    check(r.status !== 0 && /不是 git 仓根/.test(r.stderr || ''), '非 git 仓未拒');
  }

  // ── dry-run 零落盘 ──
  {
    const d = track(realRepo());
    const before = fs.readdirSync(d).sort();
    const r = cli(['--target', d, '--dry-run', '--with-boundary']);
    check(r.status === 0, `dry-run 应成功: ${r.stderr}`);
    check(JSON.stringify(fs.readdirSync(d).sort()) === JSON.stringify(before),
      `dry-run 落盘了文件: ${fs.readdirSync(d)}`);
    check(git(d, ['config', 'core.hooksPath']) === '', 'dry-run 写了 hooksPath');
  }

  // ── 真跑产物面 + gates.local 排除 ──
  {
    const d = track(realRepo());
    const r = cli(['--target', d]);
    check(r.status === 0, `真跑失败: ${r.stderr}`);
    check(fs.existsSync(path.join(d, 'scripts/hooks/engine.mjs')), 'engine.mjs 未铺');
    check(fs.existsSync(path.join(d, 'scripts/hooks/gates/secrets.mjs')), 'gates 未铺');
    check(!fs.existsSync(path.join(d, 'scripts/hooks/gates.local')), 'gates.local 泄漏进 kit');
    check(fs.existsSync(path.join(d, '.githooks/pre-commit')), 'shim 未铺');
    check(fs.existsSync(path.join(d, '.hooksrc')), '.hooksrc 未铺');
    check(/\.hooksrc\.local/.test(fs.readFileSync(path.join(d, '.gitignore'), 'utf8')), '.gitignore 未追加');
    check(git(d, ['config', 'core.hooksPath']) === '.githooks', 'hooksPath 未设');
    const stateFile = path.join(git(d, ['rev-parse', '--absolute-git-dir']), 'hook-engine-state.json');
    check(fs.existsSync(stateFile) && JSON.parse(fs.readFileSync(stateFile, 'utf8')).adoption?.sourceRepo,
      '采纳元数据未写');
    // engine list 溯源戳可读（trust 已存值）
    const l = spawnSync('node', ['scripts/hooks/engine.mjs', 'list'], { cwd: d, encoding: 'utf8' });
    check(l.status === 0 && /kit 来源/.test(l.stdout + l.stderr), 'engine list 溯源戳缺席');
  }

  // ── 幂等：.hooksrc 不覆盖 ──
  {
    const d = track(realRepo());
    cli(['--target', d]);
    fs.writeFileSync(path.join(d, '.hooksrc'), '# 采纳侧自裁\n');
    const r = cli(['--target', d]);
    check(r.status === 0 && /已存在/.test(r.stdout + r.stderr), '幂等重跑未提示跳过');
    check(fs.readFileSync(path.join(d, '.hooksrc'), 'utf8') === '# 采纳侧自裁\n',
      '.hooksrc 被覆盖（配置应归采纳侧）');
  }

  // ── 旧 hooksPath 防线 + --force ──
  {
    const d = track(realRepo());
    fs.mkdirSync(path.join(d, 'oldhooks'));
    fs.writeFileSync(path.join(d, 'oldhooks/pre-commit'), 'x');
    git(d, ['config', 'core.hooksPath', 'oldhooks']);
    const r1 = cli(['--target', d]);
    check(r1.status !== 0 && /既有 hooksPath/.test(r1.stderr + r1.stdout), '旧 hooksPath 未拦');
    check(git(d, ['config', 'core.hooksPath']) === 'oldhooks', '拦截仍改了 hooksPath');
    const r2 = cli(['--target', d, '--force']);
    check(r2.status === 0 && git(d, ['config', 'core.hooksPath']) === '.githooks',
      '--force 未放行切换');
  }

  // ── --with-boundary 采纳面 ──
  {
    const d = track(realRepo());
    const r = cli(['--target', d, '--with-boundary']);
    check(r.status === 0, `boundary 铺入失败: ${r.stderr}`);
    check(fs.existsSync(path.join(d, 'boundaries.yaml')), 'boundaries.yaml 未铺');
    check(fs.existsSync(path.join(d, 'boundary.consumers/README.md')), 'consumers 约定区未铺');
    check(fs.existsSync(path.join(d, 'scripts/hooks/gates.local/boundary-edge.mjs')), 'boundary-edge 未铺');
    check(fs.existsSync(path.join(d, 'scripts/lib/yaml-lite.ps1')), 'yaml 桥未铺');
    check(fs.existsSync(path.join(d, 'private/engineering/ming-boundary/scripts/extract-facts.mjs')), 'boundary 运行面未铺');
    // 幂等：契约模板不覆盖
    fs.writeFileSync(path.join(d, 'boundaries.yaml'), '# 采纳侧契约\n');
    cli(['--target', d, '--with-boundary']);
    check(fs.readFileSync(path.join(d, 'boundaries.yaml'), 'utf8') === '# 采纳侧契约\n',
      'boundaries.yaml 被覆盖（契约应归采纳侧）');
  }

  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  if (problems.length) {
    for (const p of problems) console.error(`  [FAIL] ${p}`);
    console.error(`  -> install-hooks.mjs ${problems.length} 断言失败`);
    return 1;
  }
  console.log('  -> install-hooks.mjs 断言全过（参数族/git前置/dry-run/产物面/gates.local排除/幂等/防线/force/boundary）');
  return 0;
}

if (process.argv[1] && process.argv[1].endsWith('test-install-hooks.test.mjs')) {
  process.exit(run());
}
