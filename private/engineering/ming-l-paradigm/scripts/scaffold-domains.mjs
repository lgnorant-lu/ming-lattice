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
const arg = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const target = path.resolve(arg('--target', 'docs'));
const project = arg('--project', path.basename(path.dirname(target)));
const force = args.includes('--force');
const tier = arg('--tier', null);
const TIER_DOMAINS = {
  minimal:  ['meta', 'spec', 'findings'],
  standard: ['meta', 'spec', 'dev', 'findings'],
  full:     ['meta', 'spec', 'dev', 'plan', 'gov', 'exp', 'verify', 'ops', 'know', 'findings'],
};
const domains = args.includes('--domains')
  ? arg('--domains').split(',').map(s => s.trim())
  : (TIER_DOMAINS[tier] || ['meta', 'spec', 'dev', 'findings']);

const EMITS = {
  meta:     ['META.md', 'assets/templates/meta.md.tmpl'],
  spec:     ['spec/README.md', 'assets/templates/spec-readme.md.tmpl'],
  dev:      ['dev/CONTRACT.md', 'assets/templates/dev-contract.md.tmpl'],
  plan:     [['plan/ORDERING.md', 'assets/templates/ordering.md.tmpl'], ['plan/PLAN.md', 'assets/templates/plan.md.tmpl']],
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
