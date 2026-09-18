#!/usr/bin/env node
// scaffold-skill.mjs — 技能包脚手架（ming-skill-forge §1 解剖 + §5 接线）
// 用法: node scaffold-skill.mjs <name> --desc "..." [--under <parent-dir>] [--paradigm] [--dry-run]
// 行为: 生成 SKILL.md 骨架（assets/skill.md.tmpl 注入 name/description）→ checkDir 自证 → 打印三处接线清单
// 契约: fail-closed（目标目录已存在即拒写）；--desc 必填（description 是 L0 强制面）；--dry-run 不落盘。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkDir } from './check-skill.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const FORGE_DIR = path.resolve(SCRIPT_DIR, '..');
const REPO_ROOT = path.resolve(FORGE_DIR, '..', '..', '..');
const TEMPLATE = path.join(FORGE_DIR, 'assets', 'skill.md.tmpl');

const args = process.argv.slice(2);
const name = args.find(a => !a.startsWith('--'));
const flag = (f) => args.includes(f);
const opt = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const desc = opt('--desc');
const under = opt('--under') || 'private';
const dryRun = flag('--dry-run');
const paradigm = flag('--paradigm');

function die(msg) { console.error(`[E] ${msg}`); process.exit(1); }

if (!name || !desc) {
  console.error('用法: node scaffold-skill.mjs <name> --desc "..." [--under <parent-dir>] [--paradigm] [--dry-run]');
  process.exit(1);
}
if (!/^[a-z0-9-]+$/.test(name)) die(`name 非 kebab-case: ${name}`);
if (!fs.existsSync(TEMPLATE)) die(`模板缺失: ${TEMPLATE}`);

const destDir = path.resolve(REPO_ROOT, under, name);
if (fs.existsSync(destDir)) die(`目录已存在，拒写: ${destDir}`);

const skillMd = fs.readFileSync(TEMPLATE, 'utf8')
  .replaceAll('{{name}}', name)
  .replaceAll('{{description}}', desc);

const files = { 'SKILL.md': skillMd };
if (paradigm) {
  files['references/sources.md'] =
    `# sources — ${name}\n\n` +
    '<!-- 文献索引：每条带来源 + pin/commit + 置信度分级（官方/论文 > 一手逆向 > 社区共识）；\n' +
    '     明确不纳入的反例同样记录。-->\n';
}

if (dryRun) {
  for (const rel of Object.keys(files)) console.log(`[dry-run] 将写 ${path.join(destDir, rel)} (${files[rel].length} 字符)`);
  process.exit(0);
}

for (const [rel, content] of Object.entries(files)) {
  const abs = path.join(destDir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
  console.log(`[written] ${path.relative(REPO_ROOT, abs)}`);
}

// 自证：生成物须过检（未接线前豁免 registry/router 检查）
const issues = checkDir(destDir, { skipRouter: true, skipRegistry: true });
for (const i of issues) console.log(`[${i.level}] ${i.msg}`);
const eCount = issues.filter(i => i.level === 'E').length;
console.log(`\n自证: E=${eCount} W=${issues.filter(i => i.level === 'W').length} I=${issues.filter(i => i.level === 'I').length}`);
if (eCount) { console.error('[E] 生成物未过检——模板与门控漂移，需修 forge'); process.exit(1); }

console.log(`\n接线清单（forge §5 三处不可少）：`);
console.log(`  1. registry.yaml private 区加条目: name=${name} path=${under}/${name} enabled/note/deploy.claude`);
console.log(`  2. scripts/build-router-manifest.mjs DOMAIN_DEFS: 域 skills 列表 + skillTriggers 关键词 → node 重建 + --check`);
console.log(`  3. ${under === 'private/engineering' ? 'private/engineering/README.md 资产图 + Compose 公式' : '对应目录 README 资产图'}`);
console.log(`  4. node check-skill.mjs ${path.relative(REPO_ROOT, destDir)} ——接线后复检应为 E=0`);
