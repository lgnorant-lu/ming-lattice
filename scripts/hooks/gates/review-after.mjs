// scripts/hooks/gates/review-after.mjs
// 候审档到期提醒门（周期维度首消费方——日期到期触发，与文件变更无关）
// 配置：gate.review-after.level（默认 error——69a7aca 升格后；域为空默认不扫，
//      配置 globs 即表态接受阻塞提醒；要软提醒可显式配 level=warn）
//   gate.review-after.globs=<globs CSV>   扫描域（默认空——off-until-configured，仓专域走配置）
//   gate.review-after.cadence=<dur>       引擎级 TTL（如 7d）——state.json lastRun 节流
// 契约：扫 globs 命中的工作区文件，提取 `reviewAfter: YYYY-MM-DD`，到期（<=今天）即 warn。
//   文件源=git ls-files（needsAllFiles：时间驱动检查不依赖阶段文件清单——候审档未变更也要报）

import fs from 'node:fs';
import path from 'node:path';
import { matchAnyGlobs } from '../lib/matcher.mjs';
import { fileSource } from '../lib/files.mjs';

const REVIEW_RE = /^reviewAfter\s*:\s*"?(\d{4}-\d{2}-\d{2})"?/m;

export const gate = {
  id: 'review-after',
  configKeys: [],
  stages: ['pre-commit', 'post-merge', 'post-checkout'],
  family: 'gate',
  defaultLevel: 'error',
  needsAllFiles: true,
  globs: ['*'],
  exclude: [],
  async run(ctx) {
    const scan = (ctx.gateConfig?.globs ?? '').split(',').map(s => s.trim()).filter(Boolean);
    if (!scan.length) return [];
    let all;
    try { all = fileSource(ctx.root, { source: 'all' }).list(); }
    catch { return []; }
    const today = new Date().toISOString().slice(0, 10);
    const findings = [];
    for (const p of all.filter(f => matchAnyGlobs(f, scan))) {
      let text;
      try { text = fs.readFileSync(path.join(ctx.root, p), 'utf8'); } catch { continue; }
      const m = text.match(REVIEW_RE);
      if (!m) continue;
      if (m[1] <= today) {
        findings.push({
          gate: 'review-after', file: p,
          matchText: `reviewAfter:${m[1]}`,
          message: `${p}: reviewAfter ${m[1]} 已到期——复审该候审档（晋升/延期/废弃）`,
        });
      }
    }
    return findings;
  },
};
