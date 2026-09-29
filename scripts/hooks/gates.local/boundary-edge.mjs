// scripts/hooks/gates.local/boundary-edge.mjs
// 结构边界增量门（ming-boundary 二期 D4 接线）——staged 新边 × boundaries.yaml 契约。
// 仓专门（硬依赖本仓 boundaries.yaml + ming-boundary 组件）——故驻 gates.local/。
//
// 管线：staged 文件集 → extract-facts --files（ast-grep syntactic，缺失时
//   --allow-degraded 降 regex）→ check-boundaries --facts - --json（契约评估）
//   → 违规映射 findings。
// 证据分级（fidelity×family 交叉表，v1.1）：
//   staged 面只评 ∃/unit-local 族（forbidden/allowed/attrs/builtin-dead）——
//   covered/isolated/parity/required 全称量化由 checker 内部跳过（否定安全律）。
//   regex-degraded 证据的违规 = warn（行级正则过匹配可能冤——降级封 warn）；
//   syntactic/exact 证据 = 规则 severity（默认 error）；severity=note 降为 warn。
// D1 注记：抽取读工作区而非索引 blob——部分暂存分歧由引擎全局警告覆盖
//   （与 impact-test 测试门同先例：测试套件亦基于工作树执行）。
// 缺席语义：boundaries.yaml 不存在 → 静默跳过（下游复用 kit 的仓无此契约）；
//   存在但评估失败（exit 2/3）→ error finding（契约坏了不能装没看见）。
//
// 配置：gate.boundary-edge.level（默认 error）

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const MB_SCRIPTS = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../private/engineering/ming-boundary/scripts');
const EXTRACT = path.join(MB_SCRIPTS, 'extract-facts.mjs');
const CHECK = path.join(MB_SCRIPTS, 'check-boundaries.mjs');

export const gate = {
  id: 'boundary-edge',
  configKeys: [],
  stages: ['pre-commit'],
  family: 'gate',
  defaultLevel: 'error',
  // 边事实来源面：自有代码扩展名 + md 文档（docref 死链 staged 安全）+ 链接着陆面
  globs: ['*.mjs', '*.js', '*.cjs', '*.jsx', '*.ps1', '*.psm1',
    '*.md', '*.markdown', '*.mdx', 'deployable/**', '.gitignore'],
  exclude: [],
  async run(ctx) {
    const rulesPath = path.join(ctx.root, 'boundaries.yaml');
    if (!fs.existsSync(rulesPath)) return []; // 无契约仓——不适用即跳过
    if (!ctx.files.length) return [];

    // ① 抽取 staged 文件集的事实（工作区读；缺席项 extractor 自行跳过）
    const ex = spawnSync(process.execPath, [EXTRACT,
      '--root', ctx.root, '--files', ctx.files.join(','), '--allow-degraded'],
      { encoding: 'utf8', maxBuffer: 64 << 20 });
    if (ex.error || ex.status !== 0)
      return [{ gate: 'boundary-edge', file: '-',
        message: `边界事实抽取失败: ${(ex.stderr || ex.error?.message || `exit ${ex.status}`).slice(0, 200)}` }];

    // ② 契约评估（stdin 喂 facts；--staged 增量模式只评边级规则——
    //    required 全称量化在子集事实面下无意义，checker 内部跳过）
    const ck = spawnSync(process.execPath, [CHECK,
      '--facts', '-', '--rules', rulesPath, '--json',
      '--staged', ctx.files.join(',')],
      { input: ex.stdout, encoding: 'utf8', maxBuffer: 64 << 20 });
    if (ck.error || (ck.status !== 0 && ck.status !== 1))
      return [{ gate: 'boundary-edge', file: '-',
        message: `边界契约评估失败: ${(ck.stderr || ck.error?.message || `exit ${ck.status}`).slice(0, 200)}` }];

    let payload;
    try { payload = JSON.parse(ck.stdout); }
    catch { return [{ gate: 'boundary-edge', file: '-', message: 'check-boundaries 输出非 JSON' }]; }
    if (!payload.violations?.length) return [];

    // ③ 证据分级：违规的 file:line:kind 回查 fact fidelity
    const fidelity = new Map();
    for (const line of ex.stdout.split('\n')) {
      if (!line.trim()) continue;
      let f;
      try { f = JSON.parse(line); } catch { continue; }
      fidelity.set(`${f.file}|${f.line}|${f.kind}`, f.fidelity);
    }
    return payload.violations.map((v) => {
      const fid = fidelity.get(`${v.file}|${v.line}|${v.kind}`);
      const degraded = fid === 'regex-degraded';
      // fidelity×family 交叉表：降级证据封顶 warn；规则 severity 贯穿（note→warn）
      const level = degraded || v.severity === 'warn' || v.severity === 'note'
        ? 'warn' : 'error';
      return {
        gate: 'boundary-edge',
        file: v.file,
        line: v.line,
        level,
        message: `${v.rule}: ${v.src ? v.src + '→' + (v.dst ?? '') + ' ' : ''}` +
          `${v.observed ?? v.name ?? ''}` +
          (v.fix ? `；修: ${v.fix}` : '') +
          (degraded ? '（regex-degraded 证据，人工复核）' : ''),
      };
    });
  },
};
