// scripts/hooks/gates/pre-push-verify.mjs
// 推送前全量命令门（昂贵门；删除分支操作自动跳过）
// 配置：gate.pre-push-verify.level
//   gate.pre-push-verify.command=<完整命令行> —— 覆盖默认；采纳仓配自己的推送前命令
//   默认命令：node scripts/verify.mjs --profile full；无 scripts/verify.mjs 且未配 command → 缺席
//   注意：command 是执行面（CI yaml run: 同级惯例）——review .hooksrc diff 时关注该键

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const DEFAULT_COMMAND = 'node scripts/verify.mjs --profile full';

export const gate = {
  id: 'pre-push-verify',
  stages: ['pre-push'],
  family: 'gate',
  defaultLevel: 'error',
  expensive: true,
  globs: ['*'],
  exclude: [],
  available(ctx) {
    return !!ctx.gateConfig?.command || fs.existsSync(path.join(ctx.root, 'scripts/verify.mjs'));
  },
  async run(ctx) {
    // 全删除操作豁免（pre-push stdin 解析已由引擎注入 ctx.pushOps）
    if (ctx.pushOps && ctx.pushOps.length > 0 && ctx.pushOps.every(op => op.isDelete)) {
      console.log('[pre-push] 检测到仅推送分支删除操作，跳过代码质量门禁。');
      return [];
    }
    const command = ctx.gateConfig?.command ?? DEFAULT_COMMAND;
    console.log(`[pre-push] 正在执行推送前质量门禁: ${command}`);
    const result = spawnSync(command, { cwd: ctx.root, stdio: 'inherit', shell: true });
    if (result.status !== 0) {
      return [{ gate: 'pre-push-verify', file: '-', message: `推送前命令未通过 (${command})，禁止推送` }];
    }
    return [];
  },
};
