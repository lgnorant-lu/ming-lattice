// scripts/hooks/gates/commit-msg.mjs
// 提交信息规范门（套餐语义：主题格式 + trailer 禁令 + 主题 emoji/乱码）
// 配置：requireCommitMsg / trailerLevel / emojiLevel / mojibakeLevel（旧键组，门内自理子开关）
//   gate.commit-msg.level        整门调级
//   gate.commit-msg.types        type 白名单覆盖（CSV，缺省=本仓 12 型）
//   gate.commit-msg.pattern      主题正则整体覆盖；gate.commit-msg.patternHint 报错提示文案
//   gate.commit-msg.subjectMaxLen 主题长度上限（warn 级提示，0=不限制）
//   gate.commit-msg.extraTrailers 追加禁尾模式（CSV 正则，如 Signed-off-by|Change-Id）

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
    // 策略词表注入：gate.commit-msg.* 覆盖默认本仓规范（采纳项目只改配置不改代码）
    const gcfg = ctx.gateConfig ?? {};
    const policy = { ...legacy };
    if (gcfg.types) policy.types = String(gcfg.types).split(',').map(s => s.trim()).filter(Boolean);
    // types 覆盖但未给 pattern 时：从 types 合成主题正则（默认 pattern 的 type 列表是烧死的）
    if (policy.types && !gcfg.pattern) {
      policy.subjectPattern = new RegExp(`^(${policy.types.join('|')})(\\([a-z0-9-_/*.]+\\))?: .+`);
      policy.patternHint = policy.patternHint ?? `<type>(<scope>): <描述> — type∈{${policy.types.join('/')}}`;
    }
    if (gcfg.pattern) {
      try { policy.subjectPattern = new RegExp(gcfg.pattern); }
      catch { findings.push({ gate: 'commit-msg', file: '-', level: 'warn', message: `gate.commit-msg.pattern 非法正则已忽略: ${gcfg.pattern}` }); }
    }
    if (gcfg.patternHint) policy.patternHint = gcfg.patternHint;
    if (gcfg.subjectMaxLen) policy.subjectMaxLen = gcfg.subjectMaxLen;
    if (gcfg.extraTrailers) {
      policy.extraTrailers = String(gcfg.extraTrailers).split(',').map(s => s.trim()).filter(Boolean)
        .map(src => { try { return { re: new RegExp(src, 'im'), label: src }; } catch { return null; } })
        .filter(Boolean);
    }
    const subject = extractSubject(rawMsg);
    if (legacy.requireCommitMsg !== 'false') {
      const res = validateSubject(subject, policy);
      if (!res.ok) findings.push({ gate: 'commit-msg', file: '-', message: res.reason });
      for (const w of res.warnings ?? []) {
        findings.push({ gate: 'commit-msg', file: '-', level: 'warn', message: w });
      }
    }
    const trailerRes = validateTrailer(rawMsg, policy);
    if (!trailerRes.ok) findings.push({ gate: 'commit-msg', file: '-', message: trailerRes.reason });
    for (const w of trailerRes.warnings ?? []) {
      findings.push({ gate: 'commit-msg', file: '-', level: 'warn', message: w });
    }
    return findings;
  },
};
