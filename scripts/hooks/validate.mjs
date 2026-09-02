// scripts/hooks/validate.mjs
// ming-skills 提交信息规范与 Emoji/乱码校验器 (纯 Node.js 实现, 零外部依赖)
// 
// 规则契约:
//   <type>(<scope>): <中文描述>
// type 白名单: feat/fix/chore/docs/style/refactor/test/perf/revert/collect/sync/merge
// scope: 允许小写字母/数字/连字符/下划线/斜杠/星号, 如 feat(testing-rust), fix(registry)
// Emoji 禁令: 依据 .hooksrc 配置 (默认 error 级拦截)

import fs from 'node:fs';
import path from 'node:path';

export const COMMIT_TYPES = [
  'feat', 'fix', 'chore', 'docs', 'style',
  'refactor', 'test', 'perf', 'revert', 'collect', 'sync', 'merge'
];

export const SUBJECT_PATTERN = /^(feat|fix|chore|docs|style|refactor|test|perf|revert|collect|sync|merge)(\([a-z0-9-_/*.]+\))?: .+/;

export const MERGE_SUBJECT_PATTERN = /^(Merge\b|Revert\b)/;

/**
 * 读取 .hooksrc 配置文件
 */
export function loadHookConfig(root = process.cwd()) {
  const configPath = path.join(root, '.hooksrc');
  const defaults = {
    emojiLevel: 'error',
    mojibakeLevel: 'error',
    secretLevel: 'error',
    lintLevel: 'error',
    requireCommitMsg: 'true'
  };
  if (!fs.existsSync(configPath)) return defaults;
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq > 0) {
        const key = trimmed.slice(0, eq).trim();
        const val = trimmed.slice(eq + 1).trim();
        defaults[key] = val;
      }
    }
  } catch (e) {
    // ignore
  }
  return defaults;
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
 * 校验提交主题
 */
export function validateSubject(subject, opts = {}) {
  const emojiLevel = opts.emojiLevel ?? 'error';
  const mojibakeLevel = opts.mojibakeLevel ?? 'error';
  const warnings = [];

  if (!subject || subject.length === 0) {
    return { ok: false, reason: '提交主题不能为空' };
  }

  // 1. Emoji 检查
  if (emojiLevel !== 'off' && hasEmoji(subject)) {
    const msg = '提交主题包含 Emoji 装饰符（ming-skills 规范严禁 Emoji，请使用 [禁止]/[警告]/[性能] 等文本标签）';
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
  if (!SUBJECT_PATTERN.test(subject)) {
    return {
      ok: false,
      reason: `提交格式不符合规范: "${subject}"\n期望格式: <type>(<scope>): <中文描述>\n示例: feat(testing-rust): 新增 Miri 内存与未定义行为检查规范`
    };
  }

  // 5. Type 白名单校验
  const type = subject.split(/[(:]/)[0];
  if (!COMMIT_TYPES.includes(type)) {
    return {
      ok: false,
      reason: `Type "${type}" 不在允许的白名单中: ${COMMIT_TYPES.join('/')}`
    };
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
    const res = validateSubject(subject, config);

    if (!res.ok) {
      console.error('\n==================== [ming-skills 提交门禁拦截] ====================');
      console.error(`[REJECT] ${res.reason}`);
      console.error('====================================================================\n');
      process.exit(1);
    }

    if (res.warnings && res.warnings.length > 0) {
      for (const w of res.warnings) {
        console.warn(`[WARN] ${w}`);
      }
    }
    process.exit(0);
  } catch (err) {
    console.error(`[commit-msg] 校验异常: ${err.message}`);
    process.exit(1);
  }
}
