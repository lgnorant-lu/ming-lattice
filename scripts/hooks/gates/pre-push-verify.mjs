// scripts/hooks/gates/pre-push-verify.mjs
// 推送前全量质量门（昂贵门；删除分支操作自动跳过）
// 无 scripts/verify.mjs 的采纳项目自动缺席

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const gate = {
  id: 'pre-push-verify',
  stages: ['pre-push'],
  family: 'gate',
  defaultLevel: 'error',
  expensive: true,
  globs: ['*'],
  exclude: [],
  available(ctx) {
    return fs.existsSync(path.join(ctx.root, 'scripts/verify.mjs'));
  },
  async run(ctx) {
    // 全删除操作豁免（pre-push stdin 解析已由引擎注入 ctx.pushOps）
    if (ctx.pushOps && ctx.pushOps.length > 0 && ctx.pushOps.every(op => op.isDelete)) {
      console.log('[pre-push] 检测到仅推送分支删除操作，跳过代码质量门禁。');
      return [];
    }
    console.log('[pre-push] 正在执行推送前全量本地质量门禁 (scripts/verify.mjs --profile full)...');
    const result = spawnSync(process.execPath, [path.join(ctx.root, 'scripts/verify.mjs'), '--profile', 'full'], {
      cwd: ctx.root, stdio: 'inherit',
    });
    if (result.status !== 0) {
      return [{ gate: 'pre-push-verify', file: '-', message: 'verify.mjs --profile full 未通过，禁止推送' }];
    }
    return [];
  },
};
