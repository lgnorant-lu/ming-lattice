#!/usr/bin/env node
// scaffold-skill.mjs — 技能包脚手架（ming-skill-forge §1 解剖 + §5 接线）
// 用法: node scaffold-skill.mjs <name> --desc "..." [--under <layer>] [--paradigm] [--register [--note "..."]] [--dry-run]
// --register: 建包后经 scripts/registry-upsert.mjs 正典写器登记 private 区
//             （ming-* 名自动带 metaSystem: true；默认 note 取 --desc，--note 可覆写）。
//             无 --register 时仍按 §5 清单手工接线。
// SCAFFOLD_ROOT: 覆盖写入目标仓根（测试沙箱用；默认=本仓根）。工具面（upsert）恒用本仓 scripts/。
// 层白名单: private | private/engineering ——纳层准入门（新层别先入 registry layers 表/走 ming-l 域准入；
//         deployable 是包装层、vertical 是 vendored 源，均不接受新包）
// 契约: fail-closed——name/layer/desc/重名全部写前校验；写后自证失败自动回滚不留残骸；--dry-run 不落盘。

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkDir } from './check-skill.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const FORGE_DIR = path.resolve(SCRIPT_DIR, '..');
const TOOLS_ROOT = path.resolve(FORGE_DIR, '..', '..', '..');            // 本仓工具根（upsert 住所）
const REPO_ROOT = process.env.SCAFFOLD_ROOT
  ? path.resolve(process.env.SCAFFOLD_ROOT)                             // 写入目标仓根（沙箱注入面）
  : TOOLS_ROOT;
const UPSERT = path.join(TOOLS_ROOT, 'scripts', 'registry-upsert.mjs');
const TEMPLATE = path.join(FORGE_DIR, 'assets', 'skill.md.tmpl');
const REGISTRY = path.join(REPO_ROOT, 'registry.yaml');

// 层白名单 = registry 派生（事实源自维护，不写死）：基础根层 ∪ 已登记条目/候选的父目录。
// 新层别准入 = 先在 registry（条目或 candidates path）登记该路径，再 scaffold——登记表即纳层门。
function deriveLayers() {
  const layers = new Set(['private', 'private/engineering']);
  if (!fs.existsSync(REGISTRY)) return layers;
  const reg = fs.readFileSync(REGISTRY, 'utf8');
  for (const ln of reg.split('\n')) {
    if (/^\s*#/.test(ln)) continue; // 注释行的 path: 不得偷渡进层白名单
    const m = ln.match(/path:\s*(private\/[^\s#]+?)\s*(?:#.*)?$/);
    if (m) { const parent = m[1].replace(/\/[^/]+$/, ''); if (parent !== m[1]) layers.add(parent); }
  }
  return layers;
}
const LAYERS = deriveLayers();
const SCAN_ROOTS = [...LAYERS, 'deployable']; // 未注册游离包的重名扫描面 = 全部已知包层 + 包装层

const die = (msg) => { console.error(`[E] ${msg}`); process.exit(1); };
const usage = () => die('用法: node scaffold-skill.mjs <name> --desc "..." [--under <layer>] [--paradigm] [--dry-run]');
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------- 参数解析：旗标显式消费其值，剩余非旗标参数为位置参数（有且仅一个=name） ----------
const args = process.argv.slice(2);
const opts = {};
const positional = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--desc' || a === '--under' || a === '--note') {
    const v = args[i + 1];
    if (v === undefined || v.startsWith('--')) die(`旗标 ${a} 缺值（或把下一个旗标吞成了值）`);
    if (opts[a.slice(2)] !== undefined) die(`重复旗标: ${a}`);
    opts[a.slice(2)] = v;
    i++;
  } else if (a === '--paradigm' || a === '--dry-run' || a === '--register') {
    opts[a.slice(2)] = true;
  } else if (a.startsWith('--')) {
    die(`未知旗标: ${a}`);
  } else {
    positional.push(a);
  }
}
if (positional.length !== 1) usage();

const name = positional[0];
const desc = opts.desc;
const under = (opts.under || 'private').replace(/\\/g, '/').replace(/\/+$/, ''); // Windows 反斜杠/尾斜杠归一
const dryRun = !!opts['dry-run'];
const paradigm = !!opts.paradigm;
const register = !!opts.register;
const note = opts.note || desc;

// ---------- 写前校验（fail-fast，不落残骸） ----------
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || name.length < 3) {
  die(`name 非规范 kebab-case（小写段+单连字符，≥3 字符）: ${name}`);
}
// Windows 保留设备名（CON/PRN/AUX/NUL/COM1-9/LPT1-9）：kebab 过但 win32
// 建不出目录、POSIX 建出后 Windows 端 checkout 即废——跨平台毒名先拦
if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(name)) {
  die(`name=${name} 是 Windows 保留设备名（跨平台毒名，拒）`);
}
if (!LAYERS.has(under)) {
  die(`--under 不在层白名单（${[...LAYERS].sort().join(' | ')}）；新层别先在 registry 条目或 candidates path 登记该路径（纳层准入），再 scaffold`);
}
if (!fs.existsSync(TEMPLATE)) die(`模板缺失: ${TEMPLATE}`);
const destDir = path.resolve(REPO_ROOT, under, name);
if (!destDir.startsWith(REPO_ROOT + path.sep)) die(`目标路径逃逸仓库: ${destDir}`);
if (fs.existsSync(destDir)) die(`目录已存在，拒写: ${destDir}`);

if (!desc) usage();
if (/[\r\n]/.test(desc)) die('--desc 必须单行（换行会破坏 frontmatter plain scalar）');
if (desc !== desc.trim()) die('--desc 首尾空白');
if (/^[!&*?|>%@`"',#[\]{}]|^-\s|^:\s/.test(desc)) die('--desc 以 YAML 指示字符开头——会破坏 plain scalar');
if (/:\s|\s#/.test(desc)) die('--desc 含 ": " 或 " #"——会破坏 YAML plain scalar');
if (desc.length < 20) die(`--desc 过短(${desc.length} 字符)——L0 触发面不足`);
if (desc.length > 400) console.error(`[W] desc ${desc.length} 字符超 400 预算——check-skill 将告警`);
if (register && /[\r\n"]/.test(note)) die('--note 必须单行且不含双引号（会破 YAML 双引号标量）');

// ---------- 重名扫描：层目录 + registry 名（含 candidates 区分毕业/冲突） ----------
for (const root of SCAN_ROOTS) {
  if (fs.existsSync(path.join(REPO_ROOT, root, name))) die(`重名碰撞: ${root}/${name} 已存在`);
}
let candGraduation = false;
if (fs.existsSync(REGISTRY)) {
  const reg = fs.readFileSync(REGISTRY, 'utf8').split('\n').filter(l => !/^\s*#/.test(l)).join('\n'); // 注释行不参与名碰撞
  const candM = reg.match(/^candidates:\s*\n([\s\S]*)$/m); // candidates 是末区
  const active = candM ? reg.slice(0, candM.index) : reg;
  if (new RegExp(`name:\\s*${escRe(name)}\\b`).test(active)) die(`重名碰撞: registry.yaml 已有 ${name} 条目`);
  candGraduation = !!(candM && new RegExp(`name:\\s*${escRe(name)}\\b`).test(candM[1]));
}
if (candGraduation) console.log(`[I] "${name}" 在 candidates 候审区——建包即毕业，接线后清候选条目`);

// ---------- 生成 ----------
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

// ---------- registry 条目文本（dry-run 预览与接线清单展示用；真写走 upsert 正典） ----------
const regEntry =
  `  - name: ${name}\n` +
  (name.startsWith('ming-') ? `    metaSystem: true\n` : '') +
  `    path: ${under}/${name}\n` +
  `    enabled: true\n` +
  `    note: "${note}"\n` +
  `    deploy:\n` +
  `      ccswitch: true\n`;

if (dryRun) {
  for (const rel of Object.keys(files)) console.log(`[dry-run] 将写 ${path.join(destDir, rel)} (${files[rel].length} 字符)`);
  if (register) console.log(`[dry-run] 将向 registry.yaml private 区追加:\n${regEntry}`);
  process.exit(0);
}

for (const [rel, content] of Object.entries(files)) {
  const abs = path.join(destDir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
  console.log(`[written] ${path.relative(REPO_ROOT, abs)}`);
}

// ---------- 自证 + 失败回滚（不留残骸） ----------
const issues = checkDir(destDir, { skipRouter: true, skipRegistry: true });
for (const i of issues) console.log(`[${i.level}] ${i.msg}`);
const eCount = issues.filter(i => i.level === 'E').length;
console.log(`\n自证: E=${eCount} W=${issues.filter(i => i.level === 'W').length} I=${issues.filter(i => i.level === 'I').length}`);
if (eCount) {
  fs.rmSync(destDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  die(`生成物未过检（E=${eCount}）——已回滚 ${path.relative(REPO_ROOT, destDir)}`);
}

// ---------- --register: 委托 registry-upsert 正典写器登记 ----------
// 不自写插位——正典带段尾横幅回退/重名/词表校验；第二写器复刻插位逻辑必漂移
// （曾咬过：插在 candidates 横幅注释后→lite 解析器漏读）。
if (register) {
  const uargs = [UPSERT, 'add', '--section', 'private', '--name', name,
    '--path', `${under}/${name}`, '--note', note, '--deploy', 'ccswitch'];
  if (name.startsWith('ming-')) uargs.push('--metaSystem');
  const r = spawnSync(process.execPath, uargs, {
    encoding: 'utf8', timeout: 60_000,
    env: { ...process.env, REG_UPSERT_ROOT: REPO_ROOT },
  });
  if (r.error) die(`registry 登记失败（upsert 启动错）: ${r.error.message}`);
  if (r.status !== 0) {
    die(`registry 登记失败（包已生成但未登记——按接线清单手工补登）:\n${(r.stderr || r.stdout || '').trim()}`);
  }
  process.stdout.write(r.stdout);
}

// ---------- 纳层评估（准入门控记录） ----------
console.log(`\n纳层评估（准入记录）:`);
console.log(`  name=${name}  kebab✓ 跨层与 registry 无碰撞✓${paradigm ? '  paradigm 惯例自声明✓' : ''}`);
console.log(`  layer=${under}（白名单内）`);
console.log(`  desc=${desc.length} 字符（≤400 预算内）`);
if (name.startsWith('ming-')) {
  console.log(`  [注意] ming- 前缀=元系统保留——registry 条目须加 metaSystem: true，否则 check-skill E 级`);
}

console.log(`\n接线清单（forge §5 三处不可少）：`);
console.log(register
  ? `  1. registry.yaml private 区条目已自动登记（--register）✓`
  : `  1. registry.yaml private 区加条目: name=${name} path=${under}/${name} enabled/note/deploy.ccswitch${name.startsWith('ming-') ? '/metaSystem' : ''}（或用 --register 自动登记）`);
console.log(`  2. scripts/build-router-manifest.mjs DOMAIN_DEFS: 域 skills 列表 + skillTriggers 关键词 → node 重建 + --check`);
console.log(`  3. ${under === 'private/engineering' ? 'private/engineering/README.md 资产图 + Compose 公式' : '对应目录 README 资产图'}`);
console.log(`  4. node check-skill.mjs ${path.relative(REPO_ROOT, destDir)} ——接线后复检应为 E=0`);
