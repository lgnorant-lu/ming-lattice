// scripts/hooks/validate.mjs
// ming-skills 提交信息规范与 Emoji/乱码校验器 (纯 Node.js 实现, 零外部依赖)
// 
// 规则契约:
//   <type>(<scope>): <subject>
// type 白名单: Conventional 11 型（仓专型走 gate.commit-msg.types 覆盖）
// scope: 允许小写字母/数字/连字符/下划线/斜杠/星号, 如 feat(cli), fix(registry)
// Emoji/乱码: 依据 .hooksrc 配置（emoji 默认 warn——风格政策非阻断默认）

import fs from 'node:fs';
import path from 'node:path';
import { parseIniFile } from './lib/config.mjs';

// 仓中性词表：Conventional Commits 主流 11 型（仓专型走 gate.commit-msg.types 配置）
export const COMMIT_TYPES = [
  'build', 'chore', 'ci', 'docs', 'feat', 'fix',
  'perf', 'refactor', 'revert', 'style', 'test'
];

export const SUBJECT_PATTERN = /^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(\([a-z0-9-_/*.]+\))?: .+/;

export const MERGE_SUBJECT_PATTERN = /^(Merge\b|Revert\b)/;

/**
 * 读取 .hooksrc 配置文件（委托 lib/config.mjs 统一解析器——
 * 行内注释剥离/分节跳过语义与引擎路径一致；.hooksrc.local 同样合并）
 */
export function loadHookConfig(root = process.cwd()) {
  const defaults = {
    emojiLevel: 'warn',
    mojibakeLevel: 'error',
    secretLevel: 'error',
    lintLevel: 'error',
    trailerLevel: 'error',
    requireCommitMsg: 'true'
  };
  const kv = {};
  parseIniFile(path.join(root, '.hooksrc'), kv);
  parseIniFile(path.join(root, '.hooksrc.local'), kv);
  return { ...defaults, ...kv };
}

/**
 * 提取提交主题 (第一行)
 */
export function extractSubject(message) {
  if (typeof message !== 'string') return '';
  return message.split(/\r?\n/)[0].trim();
}

/**
 * 检测是否包含 Emoji
 * 覆盖: \p{Emoji}, \p{RI}, 变体选择符, 肤色修饰, ZWJ 序列, keycap
 */
export function hasEmoji(text) {
  if (typeof text !== 'string' || text.length === 0) return false;
  const re = new RegExp(
    "\\p{RI}{2}|(?![#*\\d](?!\\uFE0F?\\u20E3))\\p{Emoji}(?:\\p{EMod}|[\\u{E0020}-\\u{E007E}]+\\u{E007F}|\\uFE0F?\\u20E3)?(?:\\u200D\\p{Emoji}(?:\\p{EMod}|[\\u{E0020}-\\u{E007E}]+\\u{E007F}|\\uFE0F?\\u20E3)?)*",
    "gu"
  );
  return re.test(text);
}

/**
 * 检测是否包含 GBK/ANSI 乱码特征字符
 */
export function hasMojibake(text) {
  if (typeof text !== 'string' || text.length === 0) return false;
  const mojibakeRegex = /[\u9357\u922b\u95ab\u95ae\u93b9\u93c4\u6d93\u9359\u9367\u9369\u9368\u942d\u93c9\u93c0\u9474\u93cd]/;
  return mojibakeRegex.test(text);
}

/**
 * 禁止出现在提交信息中的署名/trailer 字段
 * 仓中性默认空——禁尾是仓级政策（如 AI 署名禁令），经 gate.commit-msg.bannedTrailers
 * （整体替换）/ extraTrailers（追加）配置注入；值=CSV 正则（regex 内不可含逗号，
 * 多条用 | 交替或分列多值）
 */
export const BANNED_TRAILER_PATTERNS = [];

/**
 * commit-msg 策略装配（spec 模型物化——gate 与 CLI 两路共用装配点，单点防漂移）
 * legacy: loadHookConfig 平铺键（emojiLevel/trailerLevel/requireCommitMsg 等旧键组）
 * gcfg:   gate.commit-msg.* 裸键对象（引擎路径传 cfg.gates['commit-msg']；
 *         CLI 路径由调用方从平铺键提取 'gate.commit-msg.' 前缀子集）
 */
export function commitMsgPolicy(legacy = {}, gcfg = {}) {
  const policy = { ...legacy };
  if (gcfg.types) policy.types = String(gcfg.types).split(',').map(s => s.trim()).filter(Boolean);
  // types 覆盖但未给 pattern 时：从 types 合成主题正则（默认 pattern 的 type 列表是烧死的）
  if (policy.types && !gcfg.pattern) {
    policy.subjectPattern = new RegExp(`^(${policy.types.join('|')})(\\([a-z0-9-_/*.]+\\))?: .+`);
    policy.patternHint = policy.patternHint ?? `<type>(<scope>): <subject> — type∈{${policy.types.join('/')}}`;
  }
  if (gcfg.pattern) {
    try { policy.subjectPattern = new RegExp(gcfg.pattern); }
    catch { policy.patternInvalid = gcfg.pattern; }
  }
  if (gcfg.patternHint) policy.patternHint = gcfg.patternHint;
  if (gcfg.subjectMaxLen) policy.subjectMaxLen = gcfg.subjectMaxLen;
  const csvRegex = src => String(src).split(',').map(s => s.trim()).filter(Boolean)
    .map(s => { try { return { re: new RegExp(s, 'im'), label: s }; } catch { return null; } })
    .filter(Boolean);
  if (gcfg.bannedTrailers) policy.bannedTrailers = csvRegex(gcfg.bannedTrailers);
  if (gcfg.extraTrailers) policy.extraTrailers = csvRegex(gcfg.extraTrailers);
  return policy;
}

/**
 * 校验提交信息全文不含被禁 trailer 字段
 */
export function validateTrailer(message, opts = {}) {
  const trailerLevel = opts.trailerLevel ?? 'error';
  const warnings = [];
  if (trailerLevel === 'off' || typeof message !== 'string' || message.length === 0) {
    return { ok: true, reason: '', warnings };
  }
  const patterns = [...(opts.bannedTrailers ?? BANNED_TRAILER_PATTERNS), ...(opts.extraTrailers ?? [])];
  for (const { re, label } of patterns) {
    if (re.test(message)) {
      const msg = `提交信息包含被禁 trailer 字段 "${label}"`;
      if (trailerLevel === 'error') {
        return { ok: false, reason: msg, warnings };
      }
      warnings.push(msg);
    }
  }
  return { ok: true, reason: '', warnings };
}

/**
 * 校验提交主题
 */
export function validateSubject(subject, opts = {}) {
  const emojiLevel = opts.emojiLevel ?? 'warn';
  const mojibakeLevel = opts.mojibakeLevel ?? 'error';
  // 策略词表可经 opts 覆盖（引擎门从 gate.commit-msg.* 注入；缺省=仓中性规范）
  const types = opts.types ?? COMMIT_TYPES;
  const subjectPattern = opts.subjectPattern ?? SUBJECT_PATTERN;
  const subjectMaxLen = Number(opts.subjectMaxLen ?? 0);
  const patternHint = opts.patternHint ?? '<type>(<scope>): <subject>';
  const warnings = [];

  if (!subject || subject.length === 0) {
    return { ok: false, reason: '提交主题不能为空' };
  }

  // 1. Emoji 检查
  if (emojiLevel !== 'off' && hasEmoji(subject)) {
    const msg = '提交主题包含 Emoji 装饰符（规范建议以 [禁止]/[警告] 等文本标签替代）';
    if (emojiLevel === 'error') {
      return { ok: false, reason: msg };
    }
    warnings.push(msg);
  }

  // 2. 编码乱码检查
  if (mojibakeLevel !== 'off' && hasMojibake(subject)) {
    const msg = '提交主题包含 ANSI/GBK 转义乱码字符，请检查终端编码环境（须为 UTF-8）';
    if (mojibakeLevel === 'error') {
      return { ok: false, reason: msg };
    }
    warnings.push(msg);
  }

  // 3. 合并提交直接放行
  if (MERGE_SUBJECT_PATTERN.test(subject)) {
    return { ok: true, reason: '', warnings };
  }

  // 4. 正则格式检查
  if (!subjectPattern.test(subject)) {
    return {
      ok: false,
      reason: `提交格式不符合规范: "${subject}"\n期望格式: ${patternHint}\n示例: feat(cli): add --watch flag`
    };
  }

  // 5. Type 白名单校验
  const type = subject.split(/[(:]/)[0];
  if (!types.includes(type)) {
    return {
      ok: false,
      reason: `Type "${type}" 不在允许的白名单中: ${types.join('/')}`
    };
  }

  // 6. 主题长度上限（overcommit TextWidth 同款；0=不限制）
  if (subjectMaxLen > 0 && subject.length > subjectMaxLen) {
    const msg = `提交主题超长 (${subject.length} > ${subjectMaxLen} 字符)，请精简`;
    warnings.push(msg);
  }

  return { ok: true, reason: '', warnings };
}

// CLI 入口执行 (commit-msg hook 调用)
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([a-zA-Z]:)/, '$1'))) {
  const msgFile = process.argv[2];
  if (!msgFile) {
    console.error('[commit-msg] 错误: 未提供 commit message 文件路径');
    process.exit(1);
  }

  try {
    const rawMsg = fs.readFileSync(msgFile, 'utf8');
    const subject = extractSubject(rawMsg);
    const config = loadHookConfig();
    // 提取 gate.commit-msg.* 前缀子集为裸键对象——与引擎路径共用 commitMsgPolicy 装配
    const gcfg = {};
    for (const [k, v] of Object.entries(config)) {
      if (k.startsWith('gate.commit-msg.')) gcfg[k.slice('gate.commit-msg.'.length)] = v;
    }
    const policy = commitMsgPolicy(config, gcfg);
    const res = validateSubject(subject, policy);

    if (!res.ok) {
      console.error('\n==================== [ming-skills 提交门禁拦截] ====================');
      console.error(`[REJECT] ${res.reason}`);
      console.error('====================================================================\n');
      process.exit(1);
    }

    const trailerRes = validateTrailer(rawMsg, policy);
    if (!trailerRes.ok) {
      console.error('\n==================== [ming-skills 提交门禁拦截] ====================');
      console.error(`[REJECT] ${trailerRes.reason}`);
      console.error('====================================================================\n');
      process.exit(1);
    }

    const allWarnings = [...(res.warnings || []), ...(trailerRes.warnings || [])];
    for (const w of allWarnings) {
      console.warn(`[WARN] ${w}`);
    }
    process.exit(0);
  } catch (err) {
    console.error(`[commit-msg] 校验异常: ${err.message}`);
    process.exit(1);
  }
}
