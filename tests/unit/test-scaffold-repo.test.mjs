// tests/unit/test-scaffold-repo.test.mjs
// 单元测试: scripts/scaffold-repo.mjs（仓库采纳薄编排）
// 覆盖 CLI 契约：参数缺陷族 fail-closed / 非 git 仓拒绝 / --skip 组合语义 /
//   --dry-run 不落盘零 spawn / 计划输出完整性。
// 真执行路径（spawn scaffold-domains/install-hooks）不在单测面——dry-run 已覆盖编排正确性，
// 端到端由第二采纳者实证兜底（huanyus/blog-tui）。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const SCRIPT = path.join(REPO_ROOT, 'scripts/scaffold-repo.mjs');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-repo-'));
const cli = (args) => spawnSync('node', [SCRIPT, ...args], { encoding: 'utf8' });
// 伪 git 仓（只需 .git 目录在场过 fail-closed 前置）
const fakeRepo = () => { const d = tmp(); fs.mkdirSync(path.join(d, '.git')); return d; };

const problems = [];
const check = (cond, msg) => { if (!cond) problems.push(msg); };

export function run() {
  console.log('[TEST UNIT] scaffold-repo.mjs...');

  // ── 参数缺陷族：未知旗标/缺值/吞值/位置参数/双 skip 全拒 ──
  {
    const cases = [
      [['--targt', '/tmp/x'], '未知旗标未拒'],
      [['--target'], '缺值未拒'],
      [['--target', '--dry-run'], '吞值未拒'],
      [['/tmp/x', '--dry-run'], '位置参数未拒'],
      [[], '缺 --target 未拒'],
    ];
    for (const [a, m] of cases) {
      const r = cli(a);
      check(r.status !== 0 && /\[E\]/.test(r.stderr || ''), `${m}: ${a.join(' ')}`);
    }
    const r = cli(['--target', fakeRepo(), '--skip-domains', '--skip-hooks', '--skip-ming']);
    check(r.status !== 0 && /无事可做/.test(r.stderr || ''), '三 --skip 未拒');
  }

  // ── 非 git 仓 fail-closed ──
  {
    const d = tmp(); // 无 .git
    const r = cli(['--target', d, '--dry-run']);
    check(r.status !== 0 && /不是 git 仓根/.test(r.stderr || ''), '非 git 仓未拒');
  }

  // ── dry-run：计划全量打印 + 零落盘零 spawn ──
  {
    const d = fakeRepo();
    const r = cli(['--target', d, '--tier', 'standard', '--with-boundary', '--dry-run']);
    check(r.status === 0, `dry-run exit=${r.status} err=${r.stderr}`);
    check(/scaffold-domains/.test(r.stdout), 'dry-run 缺域骨架步');
    check(/install-hooks/.test(r.stdout) && /-WhatIf/.test(r.stdout), 'dry-run 缺 hooks 步或 -WhatIf');
    check(/scaffold-ming/.test(r.stdout), 'dry-run 缺命名域领养步');
    check(/-WithBoundary/.test(r.stdout), '--with-boundary 未透传');
    check(!fs.existsSync(path.join(d, 'docs')), 'dry-run 落了 docs/');
    check(!fs.existsSync(path.join(d, 'scripts')), 'dry-run 落了 scripts/');
  }

  // ── --skip 单边编排 + tier 缺省 ──
  {
    const d = fakeRepo();
    const r = cli(['--target', d, '--skip-hooks', '--dry-run']);
    check(r.status === 0 && /scaffold-domains/.test(r.stdout) && !/install-hooks/.test(r.stdout), '--skip-hooks 后仍编排 hooks');
    const r2 = cli(['--target', d, '--skip-domains', '--dry-run']);
    check(r2.status === 0 && /install-hooks/.test(r2.stdout) && !/scaffold-domains/.test(r2.stdout), '--skip-domains 后仍编排 domains');
    const r3 = cli(['--target', d, '--skip-ming', '--dry-run']);
    check(r3.status === 0 && !/scaffold-ming/.test(r3.stdout), '--skip-ming 后仍编排 ming');
  }

  // ── dry-run 域骨架步语义可读（note 含 docs/ 域骨架意图）──
  {
    const d = fakeRepo();
    const r = cli(['--target', d, '--dry-run']);
    check(r.status === 0 && /docs\/.*域骨架/.test(r.stdout), 'dry-run 域骨架 note 缺 docs/ 语义');
  }

  if (problems.length) {
    for (const p of problems) console.log(`  [FAIL] ${p}`);
    throw new Error(`${problems.length} 项断言失败`);
  }
  console.log('  -> scaffold-repo CLI 契约全绿（参数族/拒绝/dry-run/skip 编排）');
}
