// scripts/hooks/gates/impact-test.mjs
// 自动化测试影响面分流门（昂贵门——error 命中即被引擎跳过；包装 plan.mjs）
// 配置：lintLevel（旧键）/ gate.impact-test.level
//   无 tests/run.mjs 的采纳项目 → available() 返回 false 自动缺席（按需启用活例）

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createPlan } from '../plan.mjs';

export const gate = {
  id: 'impact-test',
  stages: ['pre-commit'],
  family: 'gate',
  defaultLevel: 'error',
  expensive: true,
  needsAllFiles: true, // 影响面规划需要完整暂存清单，不吃 globs 短路
  globs: ['*'],
  exclude: [],
  available(ctx) {
    return fs.existsSync(path.join(ctx.root, 'tests/run.mjs'));
  },
  async run(ctx) {
    const staged = ctx.files;
    let plan = null;
    try {
      plan = createPlan({ stage: 'pre-commit', files: staged });
    } catch {
      plan = null;
    }

    if (plan && plan.jobs.length === 0) {
      console.log(`[pre-commit] 影响面分析 (${plan.categories.join(', ')}): 无需执行运行期测试套件，极速放行！`);
      return [];
    }

    const testArgs = ['tests/run.mjs', '--require-all'];
    if (plan && !plan.fallback && plan.jobs.length > 0) {
      testArgs.push('--suites', plan.jobs.join(','));
      console.log(`[pre-commit] 受影响测试调度 (${plan.jobs.length} 个套件: ${plan.jobs.join(', ')})...`);
    } else {
      console.log(`[pre-commit] 运行自动化测试全量矩阵 (${plan?.fallback || 'full'})...`);
    }

    try {
      execFileSync(process.execPath, testArgs, { cwd: ctx.root, stdio: 'inherit' });
      return [];
    } catch {
      return [{ gate: 'impact-test', file: '-', message: '自动化测试套件校验失败，禁止提交！' }];
    }
  },
};
