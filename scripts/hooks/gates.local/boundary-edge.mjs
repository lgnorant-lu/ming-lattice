// scripts/hooks/gates.local/boundary-edge.mjs
// 结构边界增量门——staged 新边 × boundaries.yaml 契约 × 已声明消费方。
// 仓专门（硬依赖本仓 boundaries.yaml + ming-boundary 组件）——故驻 gates.local/。
//
// 管线（v1.1b 起收敛到编排者）：staged 文件集 →
//   run-boundary --phase staged --staged-units <files> --allow-degraded --json
//   （内部：extract-facts --files 子集抽取 → evaluator --staged + staged 相位
//     已声明消费方 fan-out → findings 归并+fidelity 注记）→ 违规映射 gate findings。
// 证据分级（fidelity×family 交叉表，v1.1）：
//   staged 面只评 ∃/unit-local 族（forbidden/allowed/attrs/builtin-dead）——
//   covered/isolated/parity/required 全称量化由编排者内部跳过（否定安全律）。
//   regex-degraded 证据的违规 = warn（行级正则过匹配可能冤——降级封 warn）；
//   syntactic/exact 证据 = 规则 severity（默认 error）；severity=note 降为 warn。
// D1 注记：抽取读工作区而非索引 blob——部分暂存分歧由引擎全局警告覆盖
//   （与 impact-test 测试门同先例：测试套件亦基于工作树执行）。
// 缺席语义：boundaries.yaml 不存在 → 静默跳过（下游复用 kit 的仓无此契约）；
//   编排失败（exit 2/3）→ error finding（契约坏了不能装没看见）。
//
// 配置：gate.boundary-edge.level（默认 error）

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RUN_BOUNDARY = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../private/engineering/ming-boundary/scripts/run-boundary.mjs');

export const gate = {
  id: 'boundary-edge',
  configKeys: [],
  stages: ['pre-commit'],
  family: 'gate',
  defaultLevel: 'error',
  // 边事实来源面：自有代码扩展名 + md 文档（docref 死链 staged 安全）+ 链接着陆面
  globs: ['*.mjs', '*.js', '*.cjs', '*.jsx', '*.ts', '*.tsx', '*.mts', '*.cts',
    '*.ps1', '*.psm1', '*.md', '*.markdown', '*.mdx', 'deployable/**', '.gitignore'],
  exclude: [],
  async run(ctx) {
    const rulesPath = path.join(ctx.root, 'boundaries.yaml');
    if (!fs.existsSync(rulesPath)) return []; // 无契约仓——不适用即跳过
    if (!ctx.files.length) return [];

    const r = spawnSync(process.execPath, [RUN_BOUNDARY,
      '--root', ctx.root, '--rules', rulesPath,
      '--phase', 'staged', '--staged-units', ctx.files.join(','),
      '--allow-degraded', '--json'],
      { encoding: 'utf8', maxBuffer: 64 << 20 });
    if (r.error || (r.status !== 0 && r.status !== 1))
      return [{ gate: 'boundary-edge', file: '-',
        message: `边界编排执行失败: ${(r.stderr || r.error?.message || `exit ${r.status}`).slice(0, 200)}` }];

    let payload;
    try { payload = JSON.parse(r.stdout); }
    catch { return [{ gate: 'boundary-edge', file: '-', message: 'run-boundary 输出非 JSON' }]; }

    const out = [];
    // 编排层错误（CONFIG/消费方 crash/缺 staged 面）= error finding，不装没看见
    for (const e of payload.errors || [])
      out.push({ gate: 'boundary-edge', file: '-', message: `编排错误: ${String(e).slice(0, 200)}` });
    for (const w of payload.warnings || [])
      out.push({ gate: 'boundary-edge', file: '-', level: 'warn',
        message: `编排警告: ${String(w).slice(0, 160)}` });

    for (const v of payload.findings || []) {
      const degraded = v.fidelity === 'regex-degraded';
      // fidelity×family 交叉表：降级证据封顶 warn；规则 severity 贯穿（note→warn）；
      // 消费方 finding 无 fidelity 注记时按规则 severity 原级（未知不升不降）
      const level = degraded || v.severity === 'warn' || v.severity === 'note'
        ? 'warn' : 'error';
      out.push({
        gate: 'boundary-edge',
        file: v.file || v.unit || '-',
        line: v.line,
        level,
        message: `${v.via && v.via !== 'check' ? `[${v.via}] ` : ''}${v.rule}: ` +
          `${v.src ? v.src + '→' + (v.dst ?? '') + ' ' : ''}` +
          `${v.observed ?? v.name ?? ''}` +
          (v.fix ? `；修: ${v.fix}` : '') +
          (degraded ? '（regex-degraded 证据，人工复核）' : ''),
      });
    }
    return out;
  },
};
