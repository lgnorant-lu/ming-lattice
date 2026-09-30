#!/usr/bin/env node
// metrics（内置目录件, outputs=report）：事实面统计与降级度遥测
// stdin 无交互；argv: --facts F --root R --config JSON [--apply]
// 报告事实分布：kind/fidelity/extractor/scope 计数 + 降级文件清单
import fs from 'node:fs';
import { parseJsonl } from '../lib/facts.mjs';

const argv = process.argv;
const take = (k) => argv[argv.indexOf(k) + 1];
const factsPath = take('--facts');

const facts = parseJsonl(fs.readFileSync(factsPath, 'utf8'));
const by = (key) => {
  const m = new Map();
  for (const f of facts) {
    const v = typeof key === 'function' ? key(f) : f[key];
    m.set(v, (m.get(v) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
const table = (title, rows, n = 20) =>
  `\n${title}\n` + rows.slice(0, n).map(([k, c]) => `  ${String(k).padEnd(24)} ${c}`).join('\n');

// 真降级=代码文件 fallback（line-regex）；markdown 通道本来就是 regex 语义，不算降级
const degraded = facts.filter(f => f.fidelity === 'regex-degraded' && f.extractor === 'line-regex@1');
const degradedUnits = [...new Set(degraded.map(f => f.unit.split('#')[0]))];
const fileCount = facts.filter(f => f.kind === 'file').length;

console.log(`facts=${facts.length} files=${fileCount}` +
  ` degraded_files=${degradedUnits.length}`);
console.log(table('kind', by('kind')));
console.log(table('fidelity', by('fidelity')));
console.log(table('extractor', by('extractor')));
console.log(table('scope', by('scope')));
if (degradedUnits.length) {
  const rate = (degradedUnits.length / Math.max(1, fileCount) * 100).toFixed(2);
  console.log(`\nregex-degraded 文件（${degradedUnits.length}, ${rate}%）:`);
  for (const u of degradedUnits.slice(0, 15)) console.log(`  ${u}`);
  if (degradedUnits.length > 15) console.log(`  ... +${degradedUnits.length - 15}`);
}
