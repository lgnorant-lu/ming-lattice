// scripts/hooks/gates/whitespace.mjs
// 行尾空白 + EOF 换行卫生门（可自愈——run fix 工作区重写后由用户 re-stage）
// 配置：gate.whitespace.level（默认 warn——可修问题不硬拦）；gate.whitespace.globs 覆盖域
//
// fix 语义诚实边界：修的是工作区内容而非暂存 blob——若文件存在未暂存改动，
// re-stage 会连带新改动（lint-staged stage_fixed 的等价语义，但我们不碰 index，
// 不冒 stash 数据丢失前科的险）

import fs from 'node:fs';
import path from 'node:path';

const TEXT_EXT = /\.(md|yaml|yml|json|ps1|js|mjs|ts|txt|toml|py|sh|bat|c|h|cpp|rs|go|java|xml|html|css|ini|cfg|conf)$/i;
// \r? 兜底 CRLF：eol=crlf 仓的行尾是 "foo \r"——空格在 \r 前不归 $，
// 无 \r? 的 /[ \t]+$/ 对 CRLF 文件既检不出也修不掉
const TRAILING_WS = /[ \t]+\r?$/;

export function fixContent(text) {
  if (!text) return { changed: false, content: text };
  const lines = text.split('\n');
  const hadEofNl = text.endsWith('\n');
  const fixed = lines.map(l => l.replace(/[ \t]+(\r?)$/, '$1'));
  let out = fixed.join('\n');
  if (!out.endsWith('\n')) out += '\n';
  return { changed: out !== text || !hadEofNl, content: out };
}

export const gate = {
  id: 'whitespace',
  configKeys: [],
  stages: ['pre-commit'],
  family: 'gate',
  defaultLevel: 'error',
  fixable: true,
  globs: ['*'],
  exclude: [], // 仓专排除走 gate.whitespace.exclude 配置（如 vertical/**）——默认值须仓中性
  async run(ctx) {
    const findings = [];
    for (const p of ctx.files) {
      if (!TEXT_EXT.test(p)) continue;
      let content;
      try { content = ctx.read(p); } catch { continue; }
      const hasTrail = content.split('\n').some(l => TRAILING_WS.test(l));
      const noEofNl = content.length > 0 && !content.endsWith('\n');
      if (!hasTrail && !noEofNl) continue;
      findings.push({
        gate: 'whitespace', file: p,
        matchText: hasTrail ? 'trailing-ws' : 'missing-eof-nl',
        message: `${p}: ${[hasTrail && '行尾空白', noEofNl && '缺 EOF 换行'].filter(Boolean).join(' + ')}（可 run fix 自愈）`,
      });
    }
    return findings;
  },
  // 工作区修复（run fix 专用；ctx.read 走工作区源）
  async fix(ctx) {
    const fixed = [];
    for (const p of ctx.files) {
      if (!TEXT_EXT.test(p)) continue;
      const abs = path.join(ctx.root, p);
      let content;
      try { content = fs.readFileSync(abs, 'utf8'); } catch { continue; }
      const { changed, content: out } = fixContent(content);
      if (!changed) continue;
      if (!ctx.dryRun) fs.writeFileSync(abs, out);
      fixed.push(p);
    }
    return fixed;
  },
};
