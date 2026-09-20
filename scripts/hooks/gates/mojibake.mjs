// scripts/hooks/gates/mojibake.mjs
// 编码防污染门（GBK/ANSI 乱码拦截——CN 场景独有价值）
// 配置：gate.mojibake.level / mojibakeLevel（旧键）；gate.mojibake.exclude 追加排除

import { hasMojibake } from '../validate.mjs';

const TEXT_EXT = /\.(md|yaml|yml|json|ps1|js|mjs|ts|txt|toml|py|sh|bat)$/i;

export const gate = {
  id: 'mojibake',
  stages: ['pre-commit'],
  family: 'gate',
  defaultLevel: 'error',
  globs: ['*'],
  // 门禁源码自身含乱码特征字符表——排除自身目录
  exclude: ['scripts/hooks/**'],
  async run(ctx) {
    const findings = [];
    for (const p of ctx.files) {
      if (!TEXT_EXT.test(p)) continue;
      let content;
      try { content = ctx.read(p); } catch { continue; }
      if (hasMojibake(content)) {
        findings.push({
          gate: 'mojibake', file: p, matchText: 'mojibake-chars',
          message: `文件包含 GBK/ANSI 转义乱码: ${p}`,
        });
      }
    }
    return findings;
  },
};
