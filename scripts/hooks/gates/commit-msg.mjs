// scripts/hooks/gates/commit-msg.mjs
// 提交信息规范门（套餐语义：主题格式 + trailer 禁令 + 主题 emoji/乱码）
// 配置：requireCommitMsg / trailerLevel / emojiLevel / mojibakeLevel（旧键组，门内自理子开关）
//   gate.commit-msg.level        整门调级
//   gate.commit-msg.types        type 白名单覆盖（CSV，缺省=Conventional 11 型）
//   gate.commit-msg.pattern      主题正则整体覆盖；gate.commit-msg.patternHint 报错提示文案
//   gate.commit-msg.subjectMaxLen 主题长度上限（warn 级提示，0=不限制）
//   gate.commit-msg.bannedTrailers 禁尾表整体替换（CSV 正则，regex 内不可含逗号）
//   gate.commit-msg.extraTrailers  追加禁尾模式（CSV 正则，如 Signed-off-by|Change-Id）

import fs from 'node:fs';
import { extractSubject, validateSubject, validateTrailer, loadHookConfig, commitMsgPolicy } from '../validate.mjs';

export const gate = {
  id: 'commit-msg',
  configKeys: ['types', 'subjectMaxLen', 'bannedTrailers', 'extraTrailers', 'pattern', 'patternHint'],
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
    // 复用 validate.mjs 的策略装配点——与旧 CLI 路径共用 commitMsgPolicy 零漂移
    const legacy = loadHookConfig(ctx.root);
    const gcfg = ctx.gateConfig ?? {};
    const policy = commitMsgPolicy(legacy, gcfg);
    if (policy.patternInvalid) {
      findings.push({ gate: 'commit-msg', file: '-', level: 'warn', message: `gate.commit-msg.pattern 非法正则已忽略: ${policy.patternInvalid}` });
      delete policy.patternInvalid;
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
    // STANDARDS §1.3/1.4 文档规范的 warn 级浮现——不阻断，违例可见；
    // merge/revert 豁免（外来形态），type 词表外（chore/sync 上游件）豁免
    if (!/^Merge |^Revert /i.test(subject)) {
      if (!/[一-鿿]/.test(subject)) {
        findings.push({ gate: 'commit-msg', file: '-', level: 'warn',
          message: 'subject 应以中文描述（STANDARDS §1.3 文档规范）' });
      }
      const type = (subject.match(/^(\w+)[:(]/) || [])[1];
      const body = rawMsg.slice(rawMsg.indexOf('\n') + 1).trim();
      if (['feat', 'fix', 'refactor', 'docs'].includes(type)
          && (!body || !/实施内容[:：]/.test(body) || !/本提交不授权[:：]/.test(body) || !/已执行审阅[:：]/.test(body))) {
        findings.push({ gate: 'commit-msg', file: '-', level: 'warn',
          message: `${type} 类非琐碎提交正文应含三段式标记（实施内容:/本提交不授权:/已执行审阅:——STANDARDS §1.4 文档规范）` });
      }
    }
    return findings;
  },
};
