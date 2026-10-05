// scripts/check-ming.mjs
// 箱身份契约校验——.ming/ming.yaml 是包身份 SoT，本脚本断言其形态合法且
// 与 registry.yaml/文件系统三方对账一致：
//
//   校验面：
//     schema  : manifestVersion/name(命名空间)/version/kind(封闭词表) 硬校验
//     members : packages.members glob 解析非空；每成员目录有 SKILL.md；
//               成员目录 ↔ registry private 条目(name+metaSystem:true) 双向对账
//     sources : SoT 指针文件存在
//
// 用法: node scripts/check-ming.mjs [--json] [--root <dir>]
// 退出码: 0=全过 / 1=存在 E 级（含 manifest 缺席/解析失败——均 fail-closed 为发现）

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.MING_CHECK_ROOT
  ? path.resolve(process.env.MING_CHECK_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(ROOT, '.ming', 'ming.yaml');
const REGISTRY = path.join(ROOT, 'registry.yaml');

const KIND_VOCAB = new Set(['lattice', 'pack', 'kit']);
const NAME_RE = /^ming-[a-z0-9][a-z0-9-]*$/;
const VERSION_RE = /^\d+\.\d+\.\d+$/;

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
    if (li2) {                       // 顶层键直下列表（members: 无中间 map 的情形）
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
      if (seg === '*') {
        let ents = [];
        try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
        for (const e of ents) if (e.isDirectory()) next.push(path.join(d, e.name));
      } else if (seg.includes('*')) {
        const re = new RegExp('^' + seg.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*') + '$');
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

export function checkMing(root = ROOT) {
  const issues = [];
  const E = (m) => issues.push({ level: 'E', msg: m });
  const W = (m) => issues.push({ level: 'W', msg: m });

  const manifestPath = path.join(root, '.ming', 'ming.yaml');
  if (!fs.existsSync(manifestPath)) { E('.ming/ming.yaml 缺席——箱身份 SoT 未立'); return { issues }; }

  let m;
  try { m = parseManifest(fs.readFileSync(manifestPath, 'utf8')); }
  catch (err) { E(`manifest 解析失败: ${err.message}`); return { issues }; }

  // ── schema 硬校验 ──
  if (m.manifestVersion !== '1') E(`manifestVersion=${m.manifestVersion ?? '缺'}——本版契约只认 "1"（未知主版本 fail-closed）`);
  if (!NAME_RE.test(m.name || '')) E(`name=${m.name ?? '缺'} 不符命名空间契约 ming-<kebab>`);
  if (!VERSION_RE.test(m.version || '')) E(`version=${m.version ?? '缺'} 非 semver 三段`);
  if (!KIND_VOCAB.has(m.kind)) E(`kind=${m.kind ?? '缺'} 出封闭词表 {lattice|pack|kit}`);
  const prefix = m.naming?.prefix;
  if (prefix && m.name && !m.name.startsWith(prefix)) W(`name=${m.name} 不以 naming.prefix=${prefix} 起头——命名空间自相矛盾`);
  if (m.kind === 'lattice' && m.name !== 'ming-lattice') W(`kind=lattice 主箱名非 ming-lattice——主名漂移`);

  // ── members 解析与对账 ──
  const globs = m.packages?.members;
  if (!Array.isArray(globs) || !globs.length) E('packages.members 缺/空——成员约定未立');
  const memberDirs = [];
  for (const g of globs || []) {
    const r = expandGlob(root, g);
    if (r.error) { E(r.error); continue; }
    if (!r.dirs.length) E(`members glob 空命中: ${g}（声明的成员空间不得是空集）`);
    memberDirs.push(...r.dirs);
  }

  let regPrivate = [];
  const regPath = path.join(root, 'registry.yaml');
  if (fs.existsSync(regPath)) regPrivate = parsePrivate(fs.readFileSync(regPath, 'utf8'));
  else E('registry.yaml 缺席——sources.registry 指针落空');
  const regByName = new Map(regPrivate.map(e => [e.name, e]));

  for (const dir of memberDirs.sort()) {
    const base = path.basename(dir);
    if (!fs.existsSync(path.join(dir, 'SKILL.md'))) E(`成员包缺 SKILL.md: ${path.relative(root, dir).replace(/\\/g, '/')}`);
    const ent = regByName.get(base);
    if (!ent) { E(`成员目录未入 registry private: ${base}`); continue; }
    if (ent.metaSystem !== 'true') E(`ming-* 成员缺 metaSystem: true（registry 既定规则）: ${base}`);
  }
  // 反向：registry 里 ming-* 私有条目必须落在 members glob 面内且目录存在
  const memberSet = new Set(memberDirs.map(d => path.resolve(d)));
  for (const e of regPrivate) {
    if (!NAME_RE.test(e.name)) continue;
    const dir = path.resolve(root, e.path || '');
    if (!memberSet.has(dir)) E(`registry ming-* 条目不在 members 面内或目录缺席: ${e.name} (${e.path})`);
  }

  // ── sources 指针 ──
  for (const [k, rel] of Object.entries(m.sources || {})) {
    if (!fs.existsSync(path.join(root, rel))) E(`sources.${k} 指向不存在: ${rel}`);
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
    if (!eCount) console.log('[check-ming] 箱身份契约全过');
  }
  process.exit(eCount ? 1 : 0);
}
