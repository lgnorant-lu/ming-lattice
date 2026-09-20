// scripts/hooks/gates/emoji.mjs
// Emoji 绝对禁令门（限自研文档/技能面——allowlist 作用域是现状语义的形式化）
// 配置：gate.emoji.level / emojiLevel（旧键）；gate.emoji.globs 覆盖作用域

import { hasEmoji } from '../validate.mjs';

const TEXT_EXT = /\.(md|yaml|yml|json|ps1|js|mjs|ts|txt|toml|py|sh|bat)$/i;

export const gate = {
  id: 'emoji',
  stages: ['pre-commit'],
  family: 'gate',
  defaultLevel: 'error',
  // 现状作用域：private/ 与 docs/ 与根 README（README 为 basename glob，会在 run 内再收紧到根目录）
  globs: ['private/**', 'docs/**', 'README.md'],
  exclude: [],
  async run(ctx) {
    const findings = [];
    for (const p of ctx.files) {
      if (!TEXT_EXT.test(p)) continue;
      // 根 README 精确语义：basename glob 会命中任意深度 README.md，收紧回旧行为 relPath==='README.md'
      if (p.endsWith('README.md') && p !== 'README.md'
          && !p.startsWith('private/') && !p.startsWith('docs/')) continue;
      let content;
      try { content = ctx.read(p); } catch { continue; }
      if (hasEmoji(content)) {
        findings.push({
          gate: 'emoji', file: p, matchText: 'emoji-chars',
          message: `自研文件包含 Emoji 符号: ${p} (请使用 [禁止]/[警告] 等文本标签)`,
        });
      }
    }
    return findings;
  },
};
