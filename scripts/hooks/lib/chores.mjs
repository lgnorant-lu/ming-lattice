// scripts/hooks/lib/chores.mjs
// 声明式杂务构建器——chore.<id>.* 键 → 非阻断提醒门
//
// 语义（提案 D8/审计修正）：
//   suggest-only 默认——只打印提醒，永不执行命令、永不阻断（exit 恒 0 由引擎保证）；
//   命令执行面（chore.X.run）v1 不实现——审计裁：.hooksrc 是仓内跟踪文件，
//   自动执行会把配置变成代码注入面（需 exec=true + ack-hash 双确认才有意义，缓议）
//
// 键位：
//   chore.<id>.watch=<globs CSV>   监看的文件 glob（命中变更即提醒）
//   chore.<id>.message=<文案>      提醒内容
//   chore.<id>.stages=<CSV>        挂载阶段（默认 post-merge）
//   chore.<id>.once=true           可选：命中多文件只报一次（默认即 true——chore 本就逐条提醒）

import { matchAnyGlobs } from './matcher.mjs';

export function buildChores(cfg) {
  const chores = [];
  for (const [id, g] of Object.entries(cfg.chores ?? {})) {
    if (!g.watch || !g.message) continue; // 缺 watch/message 的 chore 无意义，静默略过
    const globs = String(g.watch).split(',').map(s => s.trim()).filter(Boolean);
    if (!globs.length) continue;
    const stages = (g.stages ? String(g.stages) : 'post-merge')
      .split(',').map(s => s.trim()).filter(Boolean);
    chores.push({
      id: `chore:${id}`,
      stages,
      family: 'chore',
      declarative: true,
      chore: true,
      defaultLevel: 'warn', // chore 恒 warn——配置等级只控制 off/开，不产生阻断
      globs,
      exclude: g.exclude ? String(g.exclude).split(',').map(s => s.trim()).filter(Boolean) : [],
      async run(ctx) {
        const hit = ctx.files.filter(f => matchAnyGlobs(f, globs));
        if (!hit.length) return [];
        return [{
          gate: `chore:${id}`, file: hit[0],
          level: 'warn',
          matchText: hit.join(','),
          message: `${g.message}（触发文件: ${hit.slice(0, 3).join(', ')}${hit.length > 3 ? ` 等${hit.length}项` : ''}）`,
        }];
      },
    });
  }
  return chores;
}
