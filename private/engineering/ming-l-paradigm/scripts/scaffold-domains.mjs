#!/usr/bin/env node
// scaffold-domains.mjs — Ming-L 域脚手架（"立"动力学机械化）
// 用法: node scaffold-domains.mjs --target <docs-dir> [--domains meta,spec,dev,findings] [--project NAME] [--force]
// 行为: 按 assets/templates/ 实例化域骨架 + namespaces.json 标号登记表；
//       默认不覆盖已存在文件（幂等可重放），--force 才覆写。
// 自证: 生成物应能立即过 audit-domains.mjs 体检（骨架即合规形态）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const target = path.resolve(arg('--target', 'docs'));
const project = arg('--project', path.basename(path.dirname(target)));
const force = args.includes('--force');
const domains = (arg('--domains', 'meta,spec,dev,findings')).split(',').map(s => s.trim());

const EMITS = {
  meta:     ['META.md', 'assets/templates/meta.md.tmpl'],
  spec:     ['spec/README.md', 'assets/templates/spec-readme.md.tmpl'],
  dev:      ['dev/CONTRACT.md', 'assets/templates/dev-contract.md.tmpl'],
  findings: ['spec/OPEN-FINDINGS.md', 'assets/templates/open-findings.md.tmpl'],
};

const results = [];
function emit(rel, fromAbs) {
  const dest = path.join(target, rel);
  if (fs.existsSync(dest) && !force) { results.push({ rel, action: 'skip(exists)' }); return; }
  const body = fs.readFileSync(fromAbs, 'utf8').replaceAll('{{project}}', project);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, body);
  results.push({ rel, action: fs.existsSync(dest) ? 'written' : 'written' });
}

for (const d of domains) {
  if (!EMITS[d]) { results.push({ rel: `(domain:${d})`, action: 'unknown-skip' }); continue; }
  const [rel, tmpl] = EMITS[d];
  emit(rel, path.join(SKILL_DIR, tmpl));
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

console.log(`scaffold-domains: ${target}  project=${project}`);
for (const r of results) console.log(`  ${r.action.padEnd(14)} ${r.rel}`);
console.log(`\n下一步: node audit-domains.mjs ${target} 验证生成物`);
