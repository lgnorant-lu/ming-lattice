// tests/integration/test-cli-tools.test.mjs
// 集成测试: 验证自研脚本工具链 (lint.ps1, sync.ps1, update.ps1, route-core.mjs)
// 覆盖: DryRun 演练机制, 退出码规范, 完整性 0 ERROR 闭环

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');

export function run(hasPwsh = true) {
  console.log('[TEST INTEGRATION] 运维工具链端到端集成测试...');

  if (hasPwsh) {
    // 1. lint.ps1 必须 0 ERROR 通过
    console.log('  -> 正在测试 pwsh scripts/lint.ps1...');
    const lintOut = execSync('pwsh -File scripts/lint.ps1', { cwd: root, encoding: 'utf8' });
    assert.ok(lintOut.includes('ERROR=0'), 'lint.ps1 必须输出 ERROR=0');

    // 2. sync.ps1 -DryRun 演练模式
    console.log('  -> 正在测试 pwsh scripts/sync.ps1 -DryRun...');
    const syncOut = execSync('pwsh -File scripts/sync.ps1 -DryRun', { cwd: root, encoding: 'utf8' });
    assert.ok(syncOut.includes('演练'), 'sync.ps1 -DryRun 必须进入演练模式');
    assert.ok(syncOut.includes('[sync] 完成:'), 'sync.ps1 必须输出完成统计');

    // 3. update.ps1 -DryRun 模式
    console.log('  -> 正在测试 pwsh scripts/update.ps1 -DryRun -Name hello-js...');
    const updateOut = execSync('pwsh -File scripts/update.ps1 -DryRun -Name hello-js', { cwd: root, encoding: 'utf8' });
    assert.ok(updateOut.includes('DryRun 演练模式'), 'update.ps1 -DryRun 必须进入演练模式');
  } else {
    console.log('  -> [SKIP] 非 pwsh 环境，跳过 PowerShell 脚本调用测试');
  }

  // 4. route-core.mjs CLI 接口
  console.log('  -> 正在测试 node scripts/route-core.mjs CLI 输出...');
  const routeOut = execSync('node scripts/route-core.mjs "为 Rust 项目编写单元测试与性质测试"', { cwd: root, encoding: 'utf8' });
  const decision = JSON.parse(routeOut);
  assert.equal(decision.domain, 'testing');
  assert.ok(Array.isArray(decision.candidates) && decision.candidates.length > 0);
  assert.equal(decision.side_effects, 'none');

  console.log('  -> 运维工具链全部端到端集成测试通过！');
}

if (process.argv[1] && process.argv[1].endsWith('test-cli-tools.test.mjs')) {
  run();
}
