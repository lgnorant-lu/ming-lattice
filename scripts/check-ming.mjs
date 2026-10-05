// scripts/check-ming.mjs
// ming 命名域双层契约校验——伞面 + 项目包两级 SoT 对账：
//
//   伞面  .ming/ming.yaml           : scope/manifestVersion/kinds 词表/projects 登记
//   项目  .ming/<p>/package.yaml    : 箱身份（name/kind/members/sources）
//   对账  : .ming/*/ 目录 ↔ projects 登记双向；项目包 name=ming-<dir>；
//           members glob↔registry private 双向 + metaSystem 规则
//   约定  : <project>/state/ 是本机态域——不是项目目录，不入登记
//
// 用法: node scripts/check-ming.mjs [--json]
// 退出码: 0=全过 / 1=存在 E 级（含 manifest 缺席/解析失败——均 fail-closed 为发现）

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.MING_CHECK_ROOT
  ? path.resolve(process.env.MING_CHECK_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const NAME_RE = /^ming-[a-z0-9][a-z0-9-]*$/;
const VERSION_RE = /^\d+\.\d+\.\d+$/;
const LOCAL_DIRS = new Set(['state']);    // 本机态域——不是项目包

// ── yaml-lite 解析（限本 manifest 形态：顶层标量 + 两级 map + `- item` 列表） ──
// fail-closed：遇未知深度/语法直接抛——宁拒解析不放行畸形
// 标量收尾：剥行尾注释（引号内 # 保护）→ 去外层引号 → trim
const scalar = (v) => {
  let s = v.trim();
  if (s.startsWith('"')) {
    const end = s.indexOf('"', 1);
    if (end < 0) throw new Error(`未闭合引号标量: ${s}`);
    return s.slice(1, end);
  }
  if (s.startsWith('#')) return '';                    // 键后整值即注释 → 空值（键下可能有子块）
  return s.replace(/\s+#.*$/, '').trim();
};

export function parseManifest(text) {
  const out = {};
  let curKey = null, curList = null, curMap = null;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || raw.trimStart().startsWith('#')) continue;
    const top = raw.match(/^([a-zA-Z]+):\s*(.*)$/);
    if (top) {
      curKey = top[1]; curList = null; curMap = null;
      const v = scalar(top[2]);
      if (v) { out[curKey] = v; curKey = null; }
      continue;
    }
    if (!curKey) throw new Error(`孤立行无归属顶层键: ${raw.trim()}`);
    const sub = raw.match(/^ {2}([a-zA-Z]+):\s*(.*)$/);
    if (sub) {
      curList = null;
      if (!curMap) { curMap = {}; out[curKey] = curMap; }
      const v = scalar(sub[2]);
      if (v) { curMap[sub[1]] = v; continue; }
      curMap[sub[1]] = [];
      curList = { parent: curMap, key: sub[1] };
      continue;
    }
    const li = raw.match(/^ {4}-\s+(.+)$/);
    if (li && curList) { curList.parent[curList.key].push(scalar(li[1])); continue; }
    const li2 = raw.match(/^ {2}-\s+(.+)$/);
    if (li2) {                       // 顶层键直下列表（members/projects/kinds 直挂）
      if (!Array.isArray(out[curKey])) out[curKey] = [];
      out[curKey].push(scalar(li2[1]));
      continue;
    }
    throw new Error(`不可解析行（深度/语法出契约）: ${raw.trim()}`);
  }
  return out;
}

// registry.yaml private 区行级解析（与 fetch.mjs 同源约定）
function parsePrivate(text) {
  const out = [];
  let section = null, cur = null;
  for (const raw of text.split(/\r?\n/)) {
    const sec = raw.match(/^([a-z_]+):\s*$/);
    if (sec) { section = sec[1]; cur = null; continue; }
    if (section !== 'private') continue;
    const entry = raw.match(/^ {2}- name:\s*(.+?)\s*$/);
    if (entry) { cur = { name: entry[1] }; out.push(cur); continue; }
    if (!cur) continue;
    const kv = raw.match(/^ {4}([a-zA-Z]+):\s*(.*?)\s*$/);
    if (kv) cur[kv[1]] = kv[2];
  }
  return out;
}

// glob 展开：契约仅支持单层 * 段（private/ming-*）；递归/**/含 .. 一律拒（fail-closed）
function expandGlob(root, pattern) {
  if (pattern.includes('..') || pattern.includes('**')) return { error: `非法 glob: ${pattern}` };
  const segs = pattern.split('/').filter(Boolean);
  let dirs = [root];
  for (const seg of segs) {
    const next = [];
    for (const d of dirs) {
      if (seg === '*' || seg.includes('*')) {
        const re = seg === '*' ? /^[^/]+$/ :
          new RegExp('^' + seg.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*') + '$');
        let ents = [];
        try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
        for (const e of ents) if (e.isDirectory() && re.test(e.name)) next.push(path.join(d, e.name));
      } else {
        const p = path.join(d, seg);
        if (fs.existsSync(p) && fs.statSync(p).isDirectory()) next.push(p);
      }
    }
    dirs = next;
  }
  return { dirs };
}

// 单项目包校验：schema + members↔registry + sources（伞面 kinds 词表注入）
function checkPackage(root, proj, pkgPath, kinds, regPrivate, issues) {
  const E = (m) => issues.push({ level: 'E', msg: `[${proj}] ${m}` });
  const W = (m) => issues.push({ level: 'W', msg: `[${proj}] ${m}` });
  if (!fs.existsSync(pkgPath)) { E(`package.yaml 缺席: .ming/${proj}/`); return; }

  let m;
  try { m = parseManifest(fs.readFileSync(pkgPath, 'utf8')); }
  catch (err) { E(`package.yaml 解析失败: ${err.message}`); return; }

  if (m.manifestVersion !== '1') E(`manifestVersion=${m.manifestVersion ?? '缺'}——只认 "1"`);
  if (!NAME_RE.test(m.name || '')) E(`name=${m.name ?? '缺'} 不符 ming-<kebab> 命名空间`);
  else if (m.name !== `ming-${proj}`) E(`name=${m.name} 与项目目录 ${proj} 不一致（约定 name=ming-<dir>）`);
  if (!VERSION_RE.test(m.version || '')) E(`version=${m.version ?? '缺'} 非 semver 三段`);
  if (!kinds.has(m.kind)) E(`kind=${m.kind ?? '缺'} 出伞面 kinds 词表 {${[...kinds].join('|')}}`);
  if (m.kind === 'lattice' && proj !== 'lattice') W(`kind=lattice 非 lattice 项目——主名漂移`);
  const prefix = m.naming?.prefix;
  if (prefix && m.name && !m.name.startsWith(prefix)) W(`name=${m.name} 不以 naming.prefix=${prefix} 起头`);

  // members glob → 目录
  const globs = m.packages?.members;
  if (!Array.isArray(globs) || !globs.length) W('packages.members 缺/空——pack 类成员约定未立');
  const memberDirs = [];
  for (const g of globs || []) {
    const r = expandGlob(root, g);
    if (r.error) { E(r.error); continue; }
    if (!r.dirs.length) E(`members glob 空命中: ${g}`);
    memberDirs.push(...r.dirs);
  }

  const regByName = new Map(regPrivate.map(e => [e.name, e]));
  for (const dir of memberDirs.sort()) {
    const base = path.basename(dir);
    if (!fs.existsSync(path.join(dir, 'SKILL.md'))) E(`成员包缺 SKILL.md: ${path.relative(root, dir).replace(/\\/g, '/')}`);
    const ent = regByName.get(base);
    if (!ent) { E(`成员目录未入 registry private: ${base}`); continue; }
    if (ent.metaSystem !== 'true') E(`ming-* 成员缺 metaSystem: true: ${base}`);
  }
  // 反向：registry 里 ming-* 私有条目必须落在任一项目 members 面内且目录存在
  const memberSet = new Set(memberDirs.map(d => path.resolve(d)));
  for (const e of regPrivate) {
    if (!NAME_RE.test(e.name)) continue;
    const dir = path.resolve(root, e.path || '');
    if (!memberSet.has(dir)) E(`registry ming-* 条目不在 members 面内或目录缺席: ${e.name} (${e.path})`);
  }

  for (const [k, rel] of Object.entries(m.sources || {})) {
    if (!fs.existsSync(path.join(root, rel))) E(`sources.${k} 指向不存在: ${rel}`);
  }
}

export function checkMing(root = ROOT) {
  const issues = [];
  const E = (m) => issues.push({ level: 'E', msg: m });
  const W = (m) => issues.push({ level: 'W', msg: m });

  // ── 伞面 ──
  const umbrellaPath = path.join(root, '.ming', 'ming.yaml');
  if (!fs.existsSync(umbrellaPath)) { E('.ming/ming.yaml 缺席——命名域伞面 SoT 未立'); return { issues }; }
  let umb;
  try { umb = parseManifest(fs.readFileSync(umbrellaPath, 'utf8')); }
  catch (err) { E(`伞面解析失败: ${err.message}`); return { issues }; }

  if (umb.manifestVersion !== '1') E(`伞面 manifestVersion=${umb.manifestVersion ?? '缺'}——只认 "1"`);
  if (umb.scope !== 'ming') E(`伞面 scope=${umb.scope ?? '缺'}——本仓命名域应为 ming`);
  const kinds = new Set(Array.isArray(umb.kinds) ? umb.kinds : []);
  if (!kinds.size) E('伞面 kinds 词表缺/空——kind 校验无源');
  const projects = Array.isArray(umb.projects) ? umb.projects : [];
  if (!projects.length) E('伞面 projects 登记缺/空');

  // ── 项目目录 ↔ 登记双向对账（state/ 本机态域除外） ──
  const mingDir = path.join(root, '.ming');
  let dirNames = [];
  try {
    dirNames = fs.readdirSync(mingDir, { withFileTypes: true })
      .filter(e => e.isDirectory() && !LOCAL_DIRS.has(e.name)).map(e => e.name);
  } catch {}
  const projSet = new Set(projects);
  for (const d of dirNames) if (!projSet.has(d)) W(`未登记项目目录: .ming/${d}/（知情登记可补，非项目则移走）`);
  for (const p of projects) if (!dirNames.includes(p)) E(`登记项目无目录: .ming/${p}/`);

  // ── registry 私有条目（成员对账共用） ──
  let regPrivate = [];
  const regPath = path.join(root, 'registry.yaml');
  if (fs.existsSync(regPath)) regPrivate = parsePrivate(fs.readFileSync(regPath, 'utf8'));
  else E('registry.yaml 缺席——单元账 SoT 未立');

  // ── 项目包校验 ──
  for (const proj of projects) {
    checkPackage(root, proj, path.join(mingDir, proj, 'package.yaml'), kinds, regPrivate, issues);
  }

  return { issues };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const json = process.argv.includes('--json');
  const r = checkMing();
  const eCount = r.issues.filter(i => i.level === 'E').length;
  if (json) console.log(JSON.stringify(r, null, 1));
  else {
    console.log(`[check-ming] E=${eCount} W=${r.issues.filter(i => i.level === 'W').length}`);
    for (const i of r.issues) console.log(`  [${i.level}] ${i.msg}`);
    if (!eCount) console.log('[check-ming] 命名域契约全过');
  }
  process.exit(eCount ? 1 : 0);
}
