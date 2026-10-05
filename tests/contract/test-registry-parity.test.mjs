// tests/contract/test-registry-parity.test.mjs
// 双解析器 parity 契约：pwsh 正典（lib/registry.ps1 经 read-registry.ps1 JSON 桥）
// vs mjs lite 正则视图——同一 registry.yaml 两个独立读法必须产出同一条目集。
// 顺带执行正典全部结构校验：read-registry.ps1 非零退出即抛（deploy 外键/路径/
// 重名/enabled 类型/schemaVersion 等不变量当场显影——提交路径上此前无执行点）。
// SPINE 终止式 B：互证 SoT 对——两侧都可能错，差集即漂移显影。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const REPO = path.resolve(import.meta.dirname, '../..');
const REGISTRY = path.join(REPO, 'registry.yaml');
const BRIDGE = path.join(REPO, 'scripts', 'read-registry.ps1');
const SECTIONS = ['base', 'vertical', 'deployable', 'private', 'candidates'];

// 正典视图：pwsh ConvertFrom-YamlLite + Read-SkillRegistry 全量结构校验后 JSON 化
function canonicalView() {
  const out = execFileSync('pwsh', ['-NoProfile', '-File', BRIDGE, '-RegistryPath', REGISTRY],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const reg = JSON.parse(out);
  const view = {};
  for (const sec of SECTIONS) {
    view[sec] = new Set((reg[sec] || []).map(e => [e.name ?? null, e.path ?? null, e.domain ?? null, e.family ?? null, e.source ?? null].join('|')));
  }
  return view;
}

// lite 视图：与 check-skill 同族的极简正则解析（独立实现互证，不复用其代码）
function liteView() {
  const text = fs.readFileSync(REGISTRY, 'utf8');
  const view = {};
  const unq = v => v == null ? null : v.replace(/^["']|["']$/g, '');
  for (const sec of SECTIONS) {
    const m = text.match(new RegExp(`^${sec}:\\s*$`, 'm'));
    view[sec] = new Set();
    if (!m) continue;
    const rest = text.slice(m.index + m[0].length);
    const nextTop = rest.search(/^\S/m);
    const block = nextTop < 0 ? rest : rest.slice(0, nextTop);
    for (const e of block.matchAll(/-\s*name:\s*(\S+)[\s\S]*?(?=\n\s*-\s*name:|$)/g)) {
      const b = e[0];
      const pick = k => unq((b.match(new RegExp(`^\\s*${k}:\\s*(\\S+)`, 'm')) || [null, null])[1]);
      view[sec].add([unq(e[1]), pick('path'), pick('domain'), pick('family'), pick('source')].join('|'));
    }
  }
  return view;
}

// deployable family/source 声明 vs 文件系统实态互证（声明面 = 测量面）：
//   family:mirror  → 目录内含 ≥1 符号链接/junction，且每条链接解析回 source 声明目录内
//   family:authored → 目录内零符号链接
//   缺 family 声明 → 违例（双族混杂面必须显式归属——deployable 不再是均质假设）
//   mirror 缺 source → 违例（边表在 registry，脚本不另立映射）
function familyCheck() {
  const text = fs.readFileSync(REGISTRY, 'utf8');
  const m = text.match(/^deployable:\s*$/m);
  if (!m) return { bad: [], warn: [] };
  const rest = text.slice(m.index + m[0].length);
  const nextTop = rest.search(/^\S/m);
  const block = nextTop < 0 ? rest : rest.slice(0, nextTop);
  const bad = [], warn = [];
  for (const e of block.matchAll(/-\s*name:\s*(\S+)[\s\S]*?(?=\n\s*-\s*name:|$)/g)) {
    const name = e[1];
    const fam = (e[0].match(/^\s*family:\s*(\S+)/m) || [])[1];
    const src = (e[0].match(/^\s*source:\s*(\S+)/m) || [])[1];
    const dir = path.join(REPO, 'deployable', name);
    let linkCount = 0;
    const topLinks = new Map();   // 顶层名 -> 解析后真实路径
    try {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        if (ent.isSymbolicLink())
          topLinks.set(ent.name, fs.realpathSync(path.join(dir, ent.name)));
      }
      linkCount = fs.readdirSync(dir, { withFileTypes: true, recursive: true })
        .filter(e => e.isSymbolicLink()).length;
    } catch { continue; } // 目录缺失交给 lint 面管
    const actual = linkCount > 0 ? 'mirror' : 'authored';
    if (fam !== actual) {
      bad.push(`${name}: 声明 family=${fam ?? '(缺)'} 但实测 ${actual}（${linkCount} links）`);
      continue;
    }
    if (fam !== 'mirror') continue;
    if (!src) { bad.push(`${name}: family=mirror 但缺 source 声明`); continue; }
    const srcAbs = path.resolve(REPO, src) + path.sep;
    for (const [ln, real] of topLinks) {
      if (!real.startsWith(srcAbs) && real !== srcAbs.slice(0, -1))
        bad.push(`${name}: 链接 ${ln} 解析到 ${real}——越出声明 source=${src}`);
    }
    // 完备性是观察面非违例——筛选镜像（只链子集, 跳过 README/tests 等噪音件）是合法形态
    try {
      for (const ent of fs.readdirSync(path.join(REPO, src), { withFileTypes: true })) {
        if (ent.name === 'SKILL.md' || ent.name === '.git') continue;
        if (!topLinks.has(ent.name))
          warn.push(`${name}: 源顶层 ${ent.name} 未链接（筛选镜像项, 有意则忽略）`);
      }
    } catch { bad.push(`${name}: source 目录 ${src} 不存在`); }
  }
  return { bad, warn };
}

// frontmatter 投影契约（双写器分权的可测面）：
//   patch-deployable 是 frontmatter 终态的唯一写器——部署件 description 必须
//   等于 registry deployable.<name>.desc 声明（声明缺席→不查 desc）；name 恒等目录名。
//   目录/SKILL.md 缺失交给 lint 面管（build 未跑过的克隆态不违例）。
function descCheck() {
  const text = fs.readFileSync(REGISTRY, 'utf8');
  const m = text.match(/^deployable:\s*$/m);
  if (!m) return { bad: [], checked: 0 };
  const rest = text.slice(m.index + m[0].length);
  const nextTop = rest.search(/^\S/m);
  const block = nextTop < 0 ? rest : rest.slice(0, nextTop);
  const bad = []; let checked = 0;
  const unq = v => v == null ? null : v.trim().replace(/^["']|["']$/g, '');
  for (const e of block.matchAll(/-\s*name:\s*(\S+)[\s\S]*?(?=\n\s*-\s*name:|$)/g)) {
    const name = e[1];
    const desc = unq((e[0].match(/^\s*desc:\s*(.+)$/m) || [])[1]);
    const f = path.join(REPO, 'deployable', name, 'SKILL.md');
    if (!fs.existsSync(f)) continue;
    const t = fs.readFileSync(f, 'utf8');
    const fm = (t.match(/(?<=^---\s*\n)[\s\S]*?(?=\n---)/) || [null])[0];
    if (!fm) { bad.push(`${name}: 部署件无 frontmatter`); continue; }
    const fmName = unq((fm.match(/^name:\s*(.+)$/m) || [])[1]);
    if (fmName !== name) bad.push(`${name}: frontmatter name=${fmName} ≠ 目录名`);
    if (desc != null) {
      const fmDesc = unq((fm.match(/^description:\s*(.+)$/m) || [])[1]);
      checked++;
      if (fmDesc !== desc) bad.push(`${name}: description ≠ registry desc（投影未跑或 desc 被旁改）`);
    }
  }
  return { bad, checked };
}

export function run() {
  console.log('[TEST CONTRACT] registry 双解析器 parity（pwsh 正典 ↔ mjs lite）...');
  let canon;
  try {
    canon = canonicalView();
  } catch (e) {
    if (e.code === 'ENOENT') {
      console.log('  [SKIP] pwsh 不在 PATH——parity 跳过（正典桥须 pwsh）');
      return;
    }
    throw new Error(`正典解析失败——read-registry.ps1 非零退出=结构校验违例显影: ${e.stderr || e.message}`);
  }
  const lite = liteView();
  for (const sec of SECTIONS) {
    const onlyCanon = [...canon[sec]].filter(x => !lite[sec].has(x));
    const onlyLite = [...lite[sec]].filter(x => !canon[sec].has(x));
    assert.deepEqual(onlyCanon, [], `${sec} 区：正典视图有而 lite 无——lite 解析漏读`);
    assert.deepEqual(onlyLite, [], `${sec} 区：lite 视图有而正典无——lite 解析误读`);
  }
  console.log(`  parity 一致：${SECTIONS.map(s => `${s}=${canon[s].size}`).join(' ')}`);

  // deployable family/source 声明 vs fs 实态（mirror=有链接且链回 source/authored=零链接）
  const { bad: famBad, warn: famWarn } = familyCheck();
  assert.deepEqual(famBad, [], `family/source 声明漂移:\n${famBad.join('\n')}`);
  for (const w of famWarn) console.log(`  [i] ${w}`);
  console.log('  family 标记与 fs 实态一致（24 deployable）');

  // frontmatter 投影终态：desc 声明件 description==registry desc + name==目录名
  const { bad: descBad, checked } = descCheck();
  assert.deepEqual(descBad, [], `frontmatter 投影漂移:\n${descBad.join('\n')}`);
  console.log(`  frontmatter 投影对账通过（desc 声明件 ${checked} 在场对账）`);
}
