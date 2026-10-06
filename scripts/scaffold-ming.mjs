#!/usr/bin/env node
// scaffold-ming.mjs — .ming/ 命名域领养脚手架（仓级"立"动力学单件）
// 用法: node scripts/scaffold-ming.mjs --target <repo> [--name <proj>] [--kind kit|pack|lattice] [--force] [--dry-run]
// 产物: .ming/ming.yaml 伞面(缺席建/在场则 projects 并入) + .ming/<proj>/package.yaml + .gitignore state 规则
// 契约: 目标须 git 仓根；幂等可重放；写后自证 checkMing(target) E 即回滚；
//       --dry-run 零落盘静态计划。kind=kit 为领养仓默认（无 ming-* 子包/单元账约定）。

import fs from 'node:fs';
import path from 'node:path';
import { checkMing } from './check-ming.mjs';

const die = (msg) => { console.error(`[E] ${msg}`); process.exit(1); };
const args = process.argv.slice(2);
const VALUE_FLAGS = new Set(['--target', '--name', '--kind']);
const opts = {};
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (VALUE_FLAGS.has(a)) {
    const v = args[i + 1];
    if (v === undefined || v.startsWith('--')) die(`旗标 ${a} 缺值`);
    if (opts[a] !== undefined) die(`重复旗标: ${a}`);
    opts[a] = v; i++;
  } else if (['--force', '--dry-run'].includes(a)) opts[a] = true;
  else die(a.startsWith('--') ? `未知旗标: ${a}` : `不接受位置参数: ${a}（仓径走 --target）`);
}
if (!opts['--target']) die('缺 --target <repo>');
const target = path.resolve(opts['--target']);
const kind = opts['--kind'] || 'kit';
const KINDS = new Set(['kit', 'pack', 'lattice']);
if (!KINDS.has(kind)) die(`--kind=${kind} 出封闭词表 {kit|pack|lattice}`);
const dryRun = !!opts['--dry-run'];

if (!fs.existsSync(path.join(target, '.git'))) die(`目标不是 git 仓根: ${target}`);

const proj = (opts['--name'] || path.basename(target)).toLowerCase();
if (!/^[a-z][a-z0-9-]*$/.test(proj)) die(`--name=${proj} 非 kebab 项目名（包名将派生 ming-${proj}）`);
// Windows 保留设备名：kebab 过但在 win32 建不出目录，POSIX 建了 Windows 拉不动
if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(proj)) die(`--name=${proj} 是 Windows 保留设备名（跨平台毒名）`);

// ── 模板 ──
const umbrellaTemplate = () => `# .ming/ming.yaml — ming 命名域伞面 SoT（跨仓约定复用）
manifestVersion: "1"
scope: ming
naming:
  prefix: "ming-"
kinds:
  - lattice
  - pack
  - kit
projects:
  - ${proj}
`;

const hasReg = fs.existsSync(path.join(target, 'registry.yaml'));
const packageTemplate = () => `# .ming/${proj}/package.yaml — 本仓箱身份 manifest（ming 命名域成员）
manifestVersion: "1"
name: ming-${proj}
version: "0.1.0"
kind: ${kind}
naming:
  prefix: "ming-"
packages:
  members:
${kind === 'kit' ? '' : `    - "private/ming-*"
${hasReg ? 'sources:\n  registry: registry.yaml\n' : ''}`}`;

// ── 计划（写前全量静态裁决；dry-run 同源打印） ──
const mingDir = path.join(target, '.ming');
const umbPath = path.join(mingDir, 'ming.yaml');
const pkgDir = path.join(mingDir, proj);
const pkgPath = path.join(pkgDir, 'package.yaml');
const giPath = path.join(target, '.gitignore');

const plan = [];   // {path, action: 'create'|'patch'|'skip', apply()=>backup}
const umbExists = fs.existsSync(umbPath);
if (!umbExists) {
  plan.push({ path: umbPath, action: 'create', next: umbrellaTemplate() });
} else {
  const cur = fs.readFileSync(umbPath, 'utf8');
  if (new RegExp(`^  - ${proj}\\s*$`, 'm').test(cur)) {
    plan.push({ path: umbPath, action: 'skip', note: `projects 已含 ${proj}` });
  } else if (/^projects:\s*$/m.test(cur)) {
    plan.push({ path: umbPath, action: 'patch',
      next: cur.replace(/^projects:\s*$/m, `projects:\n  - ${proj}`) });
  } else {
    die(`伞面在场但无 projects: 头——手工裁决: ${umbPath}`);
  }
}
const pkgExists = fs.existsSync(pkgPath);
if (pkgExists && !opts['--force']) {
  plan.push({ path: pkgPath, action: 'skip', note: 'package.yaml 在场（--force 覆写）' });
} else {
  plan.push({ path: pkgPath, action: pkgExists ? 'patch' : 'create', next: packageTemplate() });
}
const giCur = fs.existsSync(giPath) ? fs.readFileSync(giPath, 'utf8') : '';
const STATE_RULE = '.ming/*/state/';
if (giCur.includes(STATE_RULE)) {
  plan.push({ path: giPath, action: 'skip', note: 'state 规则已在' });
} else {
  plan.push({ path: giPath, action: fs.existsSync(giPath) ? 'patch' : 'create',
    next: giCur + (giCur && !giCur.endsWith('\n') ? '\n' : '') +
      `.ming/*/state/           # ming 命名域本机态域（部署账本等）——不入仓\n` });
}

if (dryRun) {
  console.log(`scaffold-ming [dry-run]: ${target}  proj=${proj} kind=${kind} name=ming-${proj}`);
  for (const p of plan) console.log(`  [${p.action}] ${path.relative(target, p.path).replace(/\\/g, '/')}${p.note ? '  — ' + p.note : ''}`);
  process.exit(0);
}

// ── 应用 + 回滚账本（自证 E → 全部还原） ──
const undo = [];
const apply = () => {
  for (const p of plan) {
    if (p.action === 'skip') { console.log(`  [skip] ${path.relative(target, p.path)} — ${p.note}`); continue; }
    fs.mkdirSync(path.dirname(p.path), { recursive: true });
    const prev = fs.existsSync(p.path) ? fs.readFileSync(p.path, 'utf8') : null;
    fs.writeFileSync(p.path, p.next);
    undo.push(() => prev === null ? fs.rmSync(p.path, { force: true }) : fs.writeFileSync(p.path, prev));
    console.log(`  [${p.action}] ${path.relative(target, p.path)}`);
  }
};
apply();

const r = checkMing(target);
const errs = r.issues.filter(i => i.level === 'E');
if (errs.length) {
  console.error(`[E] 自证失败 ${errs.length} 项——回滚:`);
  for (const e of errs) console.error(`    ${e.msg}`);
  for (let i = undo.length - 1; i >= 0; i--) undo[i]();
  try { fs.rmdirSync(pkgDir); } catch {}   // 仅当本步新建且已空——剪净回滚残壳
  process.exit(1);
}
console.log(`[scaffold-ming] ${proj} 领养落地（E=0）——校验: MING_CHECK_ROOT=${target} node check-ming.mjs`);
