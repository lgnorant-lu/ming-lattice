// scripts/hooks/lib/declarative.mjs
// 声明式正则门解释器：.hooksrc 的 gate.<id>.* 键 → 可执行 gate 对象
//   覆盖"单模式+单消息"长尾检查（需分项标签/特殊上下文的仍走 gates/*.mjs 原生码门）
//   约定：pattern 按 gm 全文匹配，行锚定（^$）由作者负责
//
// 键面：
//   gate.<id>.level    off|warn|error|required（默认 warn）
//   gate.<id>.globs    逗号分隔包含 glob（默认 *）
//   gate.<id>.exclude  逗号分隔排除 glob
//   gate.<id>.pattern  正则体（不写 /.../ 斜杠）
//   gate.<id>.message  命中消息（默认 "命中声明式门禁 <id>"）
//   gate.<id>.once     true=逐文件单报（防刷屏）
//   gate.<id>.skipIf   逗号分隔 git 态 token（merge,rebase,ref:x,...）
//   gate.<id>.stages   逗号分隔阶段（默认 pre-commit）

import { matchAnyGlobs } from './matcher.mjs';

export function buildDeclarativeGates(cfg) {
  const gates = [];
  for (const [id, c] of Object.entries(cfg.gates)) {
    if (!c.pattern) continue; // 无 pattern 的 gate.* 条目只是等级/参数配置，不是声明门
    let re;
    try {
      re = new RegExp(c.pattern, 'gm');
    } catch (e) {
      // 配置错误也是诊断而非崩溃——以 error 级发现回报
      gates.push({
        id, family: 'gate', declarative: true, broken: true,
        stages: ['pre-commit'], defaultLevel: 'error',
        globs: ['*'], exclude: [],
        run: async () => [{ file: '.hooksrc', message: `声明式门 ${id} 的 pattern 非法: ${e.message}` }],
      });
      continue;
    }
    gates.push({
      id,
      family: 'gate',
      declarative: true,
      stages: (c.stages ?? 'pre-commit').split(',').map(s => s.trim()),
      defaultLevel: 'warn',
      globs: (c.globs ?? '*').split(',').map(s => s.trim()),
      exclude: (c.exclude ?? '').split(',').map(s => s.trim()).filter(Boolean),
      once: c.once === 'true',
      skipIf: (c.skipIf ?? '').split(',').map(s => s.trim()).filter(Boolean),
      message: c.message ?? `命中声明式门禁 ${id}`,
      async run(ctx) {
        const findings = [];
        for (const file of ctx.files) {
          const p = typeof file === 'string' ? file : file.path;
          if (!matchAnyGlobs(p, this.globs) || matchAnyGlobs(p, this.exclude)) continue;
          let content;
          try { content = ctx.read(p); } catch { continue; }
          let m; re.lastIndex = 0;
          let hitCount = 0;
          while ((m = re.exec(content))) {
            // 命中放大帽：pattern 过宽（如 `.`）时每字符一 finding 会爆量
            // ——封顶后继续扫描只记总数，末尾补一条截断说明。
            // 空匹配前进守卫必须压过帽——`x*` 类零宽命中越过帽后 lastIndex
            // 不再推进即成死循环。
            const empty = m[0] === '';
            if (hitCount >= 50) { hitCount++; if (empty) re.lastIndex += 1; continue; }
            hitCount++;
            findings.push({
              gate: id,
              file: p,
              line: content.slice(0, m.index).split('\n').length,
              matchText: m[0].slice(0, 200),
              message: this.message,
            });
            if (this.once) break;
            if (empty) re.lastIndex += 1; // 防空匹配死循环
          }
          if (hitCount > 50) {
            findings.push({
              gate: id,
              file: p,
              line: 0,
              message: `${this.message}（本文件命中 ${hitCount} 处，仅列前 50 条）`,
            });
          }
        }
        return findings;
      },
    });
  }
  return gates;
}
