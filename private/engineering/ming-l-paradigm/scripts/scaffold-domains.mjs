#!/usr/bin/env node
// scaffold-domains.mjs — Ming-L 域脚手架（"立"动力学机械化）
// 用法: node scaffold-domains.mjs --target <docs-dir> [--domains meta,spec,dev,findings,plan] [--tier minimal|standard|full] [--project NAME] [--force]
// 行为: 按 assets/templates/ 实例化域骨架 + namespaces.json/ming.yaml 播种；
//       默认不覆盖已存在文件（幂等可重放），--force 才覆写。
// 自证: 生成物应能立即过 audit-domains.mjs 体检（骨架即合规形态）。
// 采纳档预设: minimal=meta,spec,findings / standard=+dev / full=九域（ming.yaml 记录采纳声明）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const die = (msg) => { console.error(`[E] ${msg}`); process.exit(1); };
// 显式旗标解析（与 scaffold-skill 同一缺陷族）：未知旗标拒、缺值/吞值拒、位置参数拒
const VALUE_FLAGS = new Set(['--target', '--domains', '--tier', '--project']);
const opts = {};
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (VALUE_FLAGS.has(a)) {
    const v = args[i + 1];
    if (v === undefined || v.startsWith('--')) die(`旗标 ${a} 缺值（或把下一个旗标吞成了值）`);
    if (opts[a] !== undefined) die(`重复旗标: ${a}`);
    opts[a] = v; i++;
  } else if (a === '--force') opts[a] = true;
  else die(a.startsWith('--') ? `未知旗标: ${a}` : `不接受位置参数: ${a}（目录走 --target）`);
}
const target = path.resolve(opts['--target'] || 'docs');
const project = opts['--project'] || path.basename(path.dirname(target));
const force = !!opts['--force'];
const tier = opts['--tier'] || null;
const TIER_DOMAINS = {
  minimal:  ['meta', 'spec', 'findings'],
  standard: ['meta', 'spec', 'dev', 'findings'],
  full:     ['meta', 'spec', 'dev', 'plan', 'gov', 'exp', 'verify', 'ops', 'know', 'findings'],
};
if (tier && !TIER_DOMAINS[tier]) die(`--tier 无效: ${tier}（${Object.keys(TIER_DOMAINS).join('|')}）`);
const domains = opts['--domains'] !== undefined
  ? opts['--domains'].split(',').map(s => s.trim()).filter(Boolean)
  : (TIER_DOMAINS[tier] || ['meta', 'spec', 'dev', 'findings']);
if (!domains.length) die('--domains 解析后为空');

const EMITS = {
  meta:     ['META.md', 'assets/templates/meta.md.tmpl'],
  spec:     ['spec/README.md', 'assets/templates/spec-readme.md.tmpl'],
  dev:      ['dev/CONTRACT.md', 'assets/templates/dev-contract.md.tmpl'],
  plan:     [['plan/ORDERING.md', 'assets/templates/ordering.md.tmpl'], ['plan/PLAN.md', 'assets/templates/plan.md.tmpl']],
  gov:      ['gov/GOVERNANCE.md', 'assets/templates/gov.md.tmpl'],
  exp:      ['exp/EXPERIMENTS.md', 'assets/templates/exp.md.tmpl'],
  verify:   ['verify/VERIFY.md', 'assets/templates/verify.md.tmpl'],
  ops:      ['ops/RUNBOOK.md', 'assets/templates/ops.md.tmpl'],
  know:     ['know/KNOWLEDGE.md', 'assets/templates/know.md.tmpl'],
  findings: ['spec/OPEN-FINDINGS.md', 'assets/templates/open-findings.md.tmpl'],
};

const results = [];
function emit(rel, fromAbs) {
  const dest = path.join(target, rel);
  if (fs.existsSync(dest) && !force) { results.push({ rel, action: 'skip(exists)' }); return; }
  const body = fs.readFileSync(fromAbs, 'utf8').replaceAll('{{project}}', project);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, body);
  results.push({ rel, action: 'written' });
}

for (const d of domains) {
  if (!EMITS[d]) { results.push({ rel: `(domain:${d})`, action: 'unknown-skip' }); continue; }
  for (const [rel, tmpl] of Array.isArray(EMITS[d][0]) ? EMITS[d] : [EMITS[d]]) {
    emit(rel, path.join(SKILL_DIR, tmpl));
  }
}

// 标号登记表——项目私有副本（可裁剪/扩展），audit-domains 优先消费
const nsDest = path.join(target, 'namespaces.json');
if (!fs.existsSync(nsDest) || force) {
  fs.mkdirSync(target, { recursive: true });
  fs.copyFileSync(path.join(SKILL_DIR, 'assets/namespaces.default.json'), nsDest);
  results.push({ rel: 'namespaces.json', action: 'written' });
} else {
  results.push({ rel: 'namespaces.json', action: 'skip(exists)' });
}

// ming.yaml——项目形态声明（配置层）：tier/domains/gates/namespaces 指针
const cfgDest = path.join(target, 'ming.yaml');
if (!fs.existsSync(cfgDest) || force) {
  const body = fs.readFileSync(path.join(SKILL_DIR, 'assets/templates/ming.yaml.tmpl'), 'utf8')
    .replaceAll('{{project}}', project)
    .replaceAll('{{tier}}', tier || 'standard')
    .replaceAll('{{domain_lines}}', domains.filter(d => d !== 'findings').map(d => `  - ${d}`).join('\n') || '  - meta');
  fs.writeFileSync(cfgDest, body);
  results.push({ rel: 'ming.yaml', action: 'written' });
} else {
  results.push({ rel: 'ming.yaml', action: 'skip(exists)' });
}

console.log(`scaffold-domains: ${target}  project=${project}  tier=${tier || '(custom)'}`);
for (const r of results) console.log(`  ${r.action.padEnd(14)} ${r.rel}`);
console.log(`\n下一步: node audit-domains.mjs ${target} 验证生成物`);
