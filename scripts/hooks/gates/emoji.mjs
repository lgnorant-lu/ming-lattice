// scripts/hooks/gates/emoji.mjs
// Emoji 绝对禁令门（限自研文档/技能面——allowlist 作用域是现状语义的形式化）
// 配置：gate.emoji.level / emojiLevel（旧键）；gate.emoji.globs 覆盖作用域

import { hasEmoji } from '../validate.mjs';
import { matchAnyGlobs } from '../lib/matcher.mjs';

const TEXT_EXT = /\.(md|yaml|yml|json|ps1|js|mjs|ts|txt|toml|py|sh|bat)$/i;
const DEFAULT_GLOBS = ['*'];

// 作用域语义：含斜杠 glob 与通配 basename 照 matcher 原义；**精确文件名项**
// （无斜杠无通配，如 README.md/AGENTS.md）只认仓根——深层同名文件仅在
// 含斜杠 glob 覆盖下才查（写 README.md 的意图是根文件而非任意深度）
function inScope(p, globs) {
  const slash = [], wild = [];
  const literals = new Set();
  for (const g of globs) {
    if (g.includes('/')) slash.push(g);
    else if (/[*?]/.test(g)) wild.push(g);
    else literals.add(g);
  }
  return literals.has(p) || matchAnyGlobs(p, slash) || matchAnyGlobs(p, wild);
}

export const gate = {
  id: 'emoji',
  configKeys: [],
  stages: ['pre-commit'],
  family: 'gate',
  defaultLevel: 'warn', // 风格政策非阻断默认——需强制的仓经 emojiLevel=error / gate.emoji.level 升级
  // 默认全域（staged 源只扫增量提交）；仓专作用域走 gate.emoji.globs 配置
  globs: DEFAULT_GLOBS,
  exclude: [],
  async run(ctx) {
    const cfgGlobs = ctx.gateConfig?.globs?.split(',').map(s => s.trim()).filter(Boolean);
    const effGlobs = cfgGlobs ?? DEFAULT_GLOBS;
    const findings = [];
    for (const p of ctx.files) {
      if (!TEXT_EXT.test(p)) continue;
      if (!inScope(p, effGlobs)) continue;
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
