// scripts/hooks/gates/impact-test.mjs
// 提交前命令门禁（昂贵门——error 命中即被引擎跳过其余昂贵门）
// 配置：lintLevel（旧键）/ gate.impact-test.level
//   gate.impact-test.command=<完整命令行> —— 覆盖默认；采纳仓配自己的测试/检查命令
//   gate.impact-test.timeoutMs=<ms> —— 命令预算（默认 600000；超时杀子进程并报超时 finding，
//     防门命令挂死=commit 永卡）
//   默认命令：node tests/run.mjs --require-all；无 tests/run.mjs 且未配 command → available() 缺席
//   注意：command 是执行面（CI yaml run: 同级惯例）——review .hooksrc diff 时关注该键
//
// 本仓实例：.hooksrc 配 gate.impact-test.command=node scripts/verify.mjs --profile affected
//   ——影响面计划（scripts/plan.mjs）由 verify affected 编排，docs-only 提交免测放行

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const DEFAULT_COMMAND = 'node tests/run.mjs --require-all';
const DEFAULT_TIMEOUT_MS = 600_000;

export const gate = {
  id: 'impact-test',
  configKeys: ['command', 'timeoutMs'],
  stages: ['pre-commit'],
  family: 'gate',
  defaultLevel: 'error',
  expensive: true,
  needsAllFiles: true, // 命令门不吃 globs 短路——有暂存文件即跑
  globs: ['*'],
  exclude: [],
  available(ctx) {
    return !!ctx.gateConfig?.command || fs.existsSync(path.join(ctx.root, 'tests/run.mjs'));
  },
  async run(ctx) {
    const command = ctx.gateConfig?.command ?? DEFAULT_COMMAND;
    const timeout = parseInt(ctx.gateConfig?.timeoutMs ?? '', 10) || DEFAULT_TIMEOUT_MS;
    console.log(`[pre-commit] 执行提交前命令门禁: ${command}`);
    const r = spawnSync(command, { cwd: ctx.root, stdio: 'inherit', shell: true, timeout });
    if (r.error?.code === 'ETIMEDOUT' || r.signal) {
      return [{ gate: 'impact-test', file: '-',
        message: `提交前命令超时/被终止 (>${timeout}ms): ${command}——检查命令是否挂死` }];
    }
    if (r.status !== 0) {
      return [{ gate: 'impact-test', file: '-', message: `提交前命令失败 (${command})，禁止提交！` }];
    }
    return [];
  },
};
