// scripts/hooks/gates/commit-msg.mjs
// 提交信息规范门（套餐语义：主题格式 + trailer 禁令 + 主题 emoji/乱码）
// 配置：requireCommitMsg / trailerLevel / emojiLevel / mojibakeLevel（旧键组，门内自理子开关）
//   gate.commit-msg.level 可整门调级；子检查细粒度开关留给后续（overcommit 式拆门待定）

import fs from 'node:fs';
import { extractSubject, validateSubject, validateTrailer, loadHookConfig } from '../validate.mjs';

export const gate = {
  id: 'commit-msg',
  stages: ['commit-msg'],
  family: 'gate',
  defaultLevel: 'error',
  globs: ['*'],
  exclude: [],
  async run(ctx) {
    const findings = [];
    let rawMsg = '';
    try { rawMsg = fs.readFileSync(ctx.msgPath, 'utf8'); }
    catch (e) {
      return [{ gate: 'commit-msg', file: '-', message: `无法读取提交信息文件: ${e.message}` }];
    }
    // 复用 validate.mjs 的函数级契约——与旧 CLI 路径零漂移
    const legacy = loadHookConfig(ctx.root);
    const subject = extractSubject(rawMsg);
    if (legacy.requireCommitMsg !== 'false') {
      const res = validateSubject(subject, legacy);
      if (!res.ok) findings.push({ gate: 'commit-msg', file: '-', message: res.reason });
      for (const w of res.warnings ?? []) {
        findings.push({ gate: 'commit-msg', file: '-', level: 'warn', message: w });
      }
    }
    const trailerRes = validateTrailer(rawMsg, legacy);
    if (!trailerRes.ok) findings.push({ gate: 'commit-msg', file: '-', message: trailerRes.reason });
    for (const w of trailerRes.warnings ?? []) {
      findings.push({ gate: 'commit-msg', file: '-', level: 'warn', message: w });
    }
    return findings;
  },
};
