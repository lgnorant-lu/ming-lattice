// scripts/hooks/gates/large-file.mjs
// 大文件防御门（文件属性级——无 matchText，身份退化为 gate|file）
// 配置：gate.large-file.level；gate.large-file.maxMB（默认 50）

const DEFAULT_MAX_MB = 50;

export const gate = {
  id: 'large-file',
  configKeys: ['maxMB'],
  stages: ['pre-commit'],
  family: 'gate',
  defaultLevel: 'error',
  globs: ['*'],
  exclude: [],
  async run(ctx) {
    // 非法 maxMB 不得静默关闸：size > NaN 恒 false = 配置错=门关闭（fail-open），
    // 回落默认并出声（与 engine cadence 非法值告警同族处置）
    const rawMB = Number(ctx.gateConfig?.maxMB ?? DEFAULT_MAX_MB);
    const maxMB = Number.isFinite(rawMB) && rawMB > 0 ? rawMB : DEFAULT_MAX_MB;
    if (maxMB !== rawMB)
      console.warn(`[large-file] gate.large-file.maxMB 非法 "${ctx.gateConfig?.maxMB}"——按默认 ${DEFAULT_MAX_MB}MB 执行`);
    const findings = [];
    for (const p of ctx.files) {
      const meta = ctx.meta?.(p);
      if (!meta || meta.type !== 'blob') continue;
      if (meta.size > maxMB * 1024 * 1024) {
        findings.push({
          gate: 'large-file', file: p,
          message: `超大文件: ${p} (${(meta.size / 1024 / 1024).toFixed(2)} MB > ${maxMB}MB)——请入 .gitignore 或 Git LFS`,
        });
      }
    }
    return findings;
  },
};
