#!/usr/bin/env node
// metrics（内置目录件, outputs=report）：事实面统计与降级度遥测
// stdin 无交互；argv: --facts F --root R --config JSON [--apply]
// 报告事实分布：kind/fidelity/extractor/scope 计数 + 降级文件清单；
// 契约在场（cfg.domains_from，缺省 <root>/boundaries.yaml）追加命名空间段：
// per-domain 文件/事实/边分桶 + 域间边矩阵（src→dst 依赖拓扑）。
import fs from 'node:fs';
import path from 'node:path';
import { parseJsonl, globMatch, domainOf, unitFile } from '../lib/facts.mjs';
import { loadYaml } from '../lib/yaml.mjs';

const argv = process.argv;
const take = (k) => argv[argv.indexOf(k) + 1];
const factsPath = take('--facts');
const root = path.resolve(take('--root'));
const cfg = JSON.parse(take('--config') || '{}');

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

// ---------- 命名空间段（契约在场才产）----------
// domains 有序首段锚定；契约坏由 evaluator 报——metrics 只做遥测不重复报错。
let contract = null;
const rulesPath = path.resolve(root, cfg.domains_from || 'boundaries.yaml');
if (fs.existsSync(rulesPath)) {
  try { contract = loadYaml(rulesPath); } catch { contract = null; }
}
if (contract?.domains?.length) {
  const doms = contract.domains;
  const domName = (u) => domainOf(u, doms) || '__other__';
  const exGlobs = (contract.exemptions || [])
    .map(e => (typeof e === 'string' ? e : e.glob || e.unit)).filter(Boolean);
  const isEx = (u) => exGlobs.some(g => globMatch(u, g));

  const ns = new Map(); // domain -> {files, facts, out, inb, degraded, exempted}
  const nsGet = (d) => {
    if (!ns.has(d)) ns.set(d, { files: 0, facts: 0, out: 0, inb: 0, degraded: 0, exempted: 0 });
    return ns.get(d);
  };
  const degrSet = new Set(degradedUnits);
  const edgeMatrix = new Map(); // 'src→dst' -> {total, kinds:Map}
  for (const f of facts) {
    const d = domName(unitFile(f.unit));
    const rec = nsGet(d);
    rec.facts++;
    if (f.kind === 'file') {
      rec.files++;
      if (degrSet.has(f.unit)) rec.degraded++;
      if (isEx(f.unit)) rec.exempted++;
    }
    const to = f.extra?.to;
    if (to !== undefined) {
      const dst = f.extra?.dead ? '__dead__'
        : f.extra?.external ? 'external' : domName(to);
      rec.out++;
      const key = `${d}→${dst}`;
      if (!edgeMatrix.has(key)) edgeMatrix.set(key, { total: 0, kinds: new Map() });
      const em = edgeMatrix.get(key);
      em.total++;
      em.kinds.set(f.kind, (em.kinds.get(f.kind) || 0) + 1);
    }
  }
  for (const f of facts) {
    const to = f.extra?.to;
    if (to === undefined) continue;
    nsGet(f.extra?.dead ? '__dead__' : f.extra?.external ? 'external' : domName(to)).inb++;
  }

  console.log(`\nnamespace（domains=${doms.length}，from ${cfg.domains_from || 'boundaries.yaml'}）`);
  console.log('  ' + 'domain'.padEnd(24) +
    'files'.padStart(9) + 'facts'.padStart(9) + 'edges→'.padStart(9) +
    '→edges'.padStart(9) + 'degr'.padStart(7) + 'exempt'.padStart(8));
  for (const [d, r] of [...ns.entries()].sort((a, b) => b[1].files - a[1].files)) {
    console.log('  ' + d.padEnd(24) +
      String(r.files).padStart(9) + String(r.facts).padStart(9) +
      String(r.out).padStart(9) + String(r.inb).padStart(9) +
      String(r.degraded).padStart(7) + String(r.exempted).padStart(8));
  }
  console.log('\nedge matrix（src→dst 边数 top 20）');
  for (const [k, em] of [...edgeMatrix.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 20)) {
    const kinds = [...em.kinds.entries()].sort((a, b) => b[1] - a[1])
      .map(([kk, cc]) => `${kk} ${cc}`).join(', ');
    console.log(`  ${k.padEnd(28)} ${String(em.total).padStart(7)}  (${kinds})`);
  }
}

if (degradedUnits.length) {
  const rate = (degradedUnits.length / Math.max(1, fileCount) * 100).toFixed(2);
  console.log(`\nregex-degraded 文件（${degradedUnits.length}, ${rate}%）:`);
  for (const u of degradedUnits.slice(0, 15)) console.log(`  ${u}`);
  if (degradedUnits.length > 15) console.log(`  ... +${degradedUnits.length - 15}`);
}
