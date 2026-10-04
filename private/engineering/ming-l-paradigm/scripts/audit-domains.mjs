#!/usr/bin/env node
// audit-domains.mjs — Ming-L 域体检器（省+守动力学机械化）
// 用法: node audit-domains.mjs [target-dir] [--staged] [--strict] [--json] [--proposed-days N]
//        [--labels <namespaces.json>] [--emit-index <labels-index.json>] [--ming-schema <schema.json>]
// 检查面:
//   1. orphan 规则: docs 下每个 .md 须带 `domain:` frontmatter（口头规则禁令的机器投影，默认 W，--strict 升 E）
//   2. landed 指针: OPEN-FINDINGS 类文件的 [landed] 标注须指向存在文件
//   3. 域 x 动词矩阵: `dynamics:` 标注盘点（描述性本档执行集），未标注空格=I 级提示；
//      有意零在 ming.yaml `dynamics_zero:`（"<域> <动词>" 平铺条目）裁决；zero 与实态矛盾=W
//   3b. 词表补检: dynamics 值词表外=E（与 status/type/binding 同级）；status 缺席=I（ADR 豁免）；
//      文档域 ∉ ming.yaml domains=W（域实例化须先登记——O4 可插队不可隐身）
//   4. 双真相: `canonical:` 事实键跨文档重复声明 = E
//   5. frozen 不可变: `status: frozen` 文档改动拦截（--staged 模式接 git 暂存区）
//   6. proposed 超期: `status: proposed` + `since:` 超 --proposed-days = W（"省"动力学复审提醒）
//      6b. provisional 插队销账: `status: provisional` 超龄未回候审档 = W（序律 O4：可插队不可隐身）
//   7. 标识分配律: 标号唯一性(E) / 悬空引用(W) / 命名空间格式(W) / 登记表互锁(E)
//      7b. O1 倒挂检查: normative 引用 proposed 定义 = W（序律 O1 机器面）
//      7c. 未登记命名空间族启发式: ID 形 token 成族出现但未登记 = W（提示性，不自动登记）
//   8. ming.yaml 校验: tier/gates/domains 词表（词表事实源=ming-config.schema.json，--ming-schema 可覆盖）+ 声明域实例化提示
//      8b. 未知键 W（键集=schema properties，x_ 前缀私有扩展豁免）；结构锚点键: adr_dir/findings_pat/namespaces
//          ——棕场命名向下兼容（语义走 frontmatter 零载名，仅此三处文件名承重；先例 adr-tools/.adr-dir、log4brains adrFolder）
// 索引层: --emit-index 输出 labels-index.json（id→定义位/引用数/死定义 + 文档目录——派生视图非事实源）
// 退出码: 0=无E级  1=存在E级

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
// 显式旗标解析（与 scaffold-skill/scaffold-domains 同一缺陷族）：未知旗标拒、缺值/吞值拒、
// 位置参数至多一个——否则 --labels foo.json 会把值误食成 target 目录、--stict 拼错静默降门控
const VALUE_FLAGS = new Set(['--proposed-days', '--labels', '--emit-index', '--ming-schema']);
const BOOL_FLAGS = new Set(['--staged', '--strict', '--json']);
const dieArg = (msg) => { console.error(`[E] ${msg}`); process.exit(1); };
const opts = {};
const positional = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (VALUE_FLAGS.has(a)) {
    const v = args[i + 1];
    if (v === undefined || v.startsWith('--')) dieArg(`旗标 ${a} 缺值（或把下一个旗标吞成了值）`);
    if (opts[a] !== undefined) dieArg(`重复旗标: ${a}`);
    opts[a] = v; i++;
  } else if (BOOL_FLAGS.has(a)) opts[a] = true;
  else if (a.startsWith('--')) dieArg(`未知旗标: ${a}`);
  else positional.push(a);
}
if (positional.length > 1) dieArg(`位置参数至多一个（target-dir）: ${positional.join(' ')}`);
const target = path.resolve(positional[0] || 'docs');
const asJson = !!opts['--json'];
const strict = !!opts['--strict'];
const staged = !!opts['--staged'];
const provDays = opts['--proposed-days'] !== undefined ? Number(opts['--proposed-days']) : 30;
if (!Number.isFinite(provDays) || provDays <= 0) dieArg(`--proposed-days 须为正数: ${opts['--proposed-days']}`);
const labelsArg = opts['--labels'] || null;
const emitIdx = opts['--emit-index'] || null;
const mingSchemaArg = opts['--ming-schema'] || null;

const issues = [];
const add = (level, msg, file) => issues.push({ level, msg, file: file || target });

// 词表事实源：ming-config.schema.json 的 enum 即合法词表（编辑器做结构校验，audit 消费枚举——一份事实源两个消费者）
// --ming-schema 覆盖包内默认路径：项目本地扩展 schema 可声明自定义域（=自定义域机制的免费通道）
const BUILTIN_VOCAB = {
  domains: ['meta', 'spec', 'dev', 'plan', 'gov', 'exp', 'verify', 'ops', 'know', 'req'],
  tier: ['minimal', 'standard', 'full', 'custom'],
  gates: ['off', 'soft', 'hard'],
};
let VOCAB = BUILTIN_VOCAB;
let KNOWN_KEYS = new Set(['ming_v', 'project', 'tier', 'gates', 'namespaces', 'template_v', 'domains', 'dynamics_zero', 'adr_dir', 'findings_pat']);
{
  const schemaPath = mingSchemaArg ? path.resolve(mingSchemaArg) : path.join(SKILL_DIR, 'assets/ming-config.schema.json');
  try {
    const props = JSON.parse(fs.readFileSync(schemaPath, 'utf8')).properties || {};
    VOCAB = {
      domains: props.domains?.enum || BUILTIN_VOCAB.domains,
      tier: props.tier?.enum || BUILTIN_VOCAB.tier,
      gates: props.gates?.enum || BUILTIN_VOCAB.gates,
    };
    if (Object.keys(props).length) KNOWN_KEYS = new Set(Object.keys(props)); // 键集事实源=schema properties（与词表同通道）
  } catch {
    add(mingSchemaArg ? 'E' : 'W', `ming-config schema 未加载（${schemaPath}），回退内置词表`);
  }
}
const DOMAINS = new Set(VOCAB.domains);
const STATUSES = new Set(['proposed', 'provisional', 'normative', 'descriptive', 'frozen']);
const TYPES = new Set(['constitutive', 'regulative']);
const VERBS = ['立', '用', '守', '省', '改', '增', '废'];

// ming.yaml（配置层）读取：<target>/ming.yaml > <target>/../ming.yaml；YAML-lite（键值+缩进列表）
let mingCfg = null, mingCfgPath = null;
for (const cand of [path.join(target, 'ming.yaml'), path.join(path.dirname(target), 'ming.yaml')]) {
  if (fs.existsSync(cand)) { mingCfgPath = cand; break; }
}
if (mingCfgPath) {
  try {
    mingCfg = {};
    let listKey = null;
    for (const line of fs.readFileSync(mingCfgPath, 'utf8').split(/\r?\n/)) {
      const clean = line.replace(/\s+#.*$/, ''); // 剥行内注释（YAML-lite：值不含 " #"）
      if (/^\s*#/.test(line) || !clean.trim()) continue;
      const lm = clean.match(/^\s+-\s+(.+)$/);
      if (lm && listKey) { mingCfg[listKey].push(lm[1].trim().replace(/^["']|["']$/g, '')); continue; }
      const kv = clean.match(/^(\w+)\s*:\s*(.*)$/);
      if (kv) {
        const v = kv[2].trim().replace(/^["']|["']$/g, '');
        if (v) { mingCfg[kv[1]] = v; listKey = null; } else { mingCfg[kv[1]] = []; listKey = kv[1]; }
      }
    }
  } catch (e) { add('E', `ming.yaml 解析失败: ${mingCfgPath} — ${e.message}`); }
}
// YAML-lite 兼容：行内 `key: []`/`key: [a, b]` 解析为字符串，列表型键归一化为数组
if (mingCfg) {
  for (const k of ['domains', 'dynamics_zero']) {
    if (typeof mingCfg[k] !== 'string') continue;
    const s = mingCfg[k].trim();
    mingCfg[k] = s.startsWith('[')
      ? s.slice(1, -1).split(',').map(x => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
      : [s];
  }
}

// 结构锚点（棕场向下兼容）：语义走 frontmatter 零载名，仅 adr 目录/候审档特征/命名空间表三处文件名承重
// 项目声明进 ming.yaml 平铺键（YAML-lite 无嵌套 map）；先例: adr-tools .adr-dir / adrs.toml adr_dir / log4brains adrFolder
const escRe = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const anchorStr = (key, dflt) => {
  const v = mingCfg?.[key]; // mingCfg=null（无 ming.yaml）须得 undefined——null!==undefined 会误落非法分支
  if (v === undefined) return dflt;
  if (typeof v !== 'string' || !v.trim()) { add('W', `ming.yaml ${key} 为空/非法（回退默认 ${dflt}）`); return dflt; }
  return v.trim();
};
const adrDir = anchorStr('adr_dir', 'adr');           // ADR 目录（相对 target，支持嵌套如 arch/decisions）
const findingsPat = anchorStr('findings_pat', 'findings'); // 候审档路径特征（子串匹配，有意宽松——豁免语义）
const ADR_RE = new RegExp(`(?:^|/)${escRe(adrDir)}/(?:ADR-)?(\\d{4})-[^/]+\\.md$`); // ADR-0001-x.md 与裸 0001-x.md 双棕场命名兼容
const FINDINGS_RE = new RegExp(escRe(findingsPat), 'i');

if (!fs.existsSync(target)) {
  console.error(`目标目录不存在: ${target}`);
  process.exit(1);
}

// ---------- 收集 .md ----------
const mdFiles = [];
(function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === '.git' || ent.name.startsWith('.')) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (ent.name.endsWith('.md')) mdFiles.push(p);
  }
})(target);

// ---------- frontmatter 解析（YAML-lite，零依赖） ----------
function parseFm(content) {
  const m = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!m) return null;
  const fm = {};
  for (const raw of m[1].split(/\r?\n/)) {
    const line = raw.trim();  // 捕获组末行带 \r — $ 不匹配行终止符，须先剥
    const kv = line.match(/^(\w+)\s*:\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    if (v.startsWith('[') && v.endsWith(']')) {
      v = v.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    } else {
      v = v.replace(/^["']|["']$/g, '');
    }
    fm[kv[1]] = v;
  }
  return fm;
}

// ---------- 1/2/4/6 逐文件检查 ----------
const domainDocs = new Map(); // domain -> [files]
const canonical = new Map();  // key -> [files]
const frozenDocs = [];
const allDocs = [];           // {rel, fm, text} — 供登记表互锁等跨文件检查
const now = Date.now();

for (const f of mdFiles) {
  const rel = path.relative(target, f).replace(/\\/g, '/');
  const content = fs.readFileSync(f, 'utf8');
  const fm = parseFm(content);
  allDocs.push({ rel, fm, text: content });

  // 1. orphan
  if (!fm || !fm.domain) {
    add(strict ? 'E' : 'W', `orphan 文档：无 domain: 归属（规则无家可归）`, rel);
  } else {
    if (!DOMAINS.has(fm.domain)) {
      add('W', `未登记域: ${fm.domain}（新域须过准入判据：新 concern 集或新 stakeholder 视角）`, rel);
    }
    if (!domainDocs.has(fm.domain)) domainDocs.set(fm.domain, []);
    domainDocs.get(fm.domain).push({ file: rel, fm });
  }

  if (fm) {
    // 词表校验（机查词表写错 = E，不降级）
    if (fm.status && !STATUSES.has(fm.status)) add('E', `status 词表外: ${fm.status}（合法: ${[...STATUSES].join('/')})`, rel);
    if (fm.type && !TYPES.has(fm.type)) add('E', `type 词表外: ${fm.type}（合法: constitutive/regulative）`, rel);
    if (fm.binding !== undefined && !/^[0-4]$/.test(String(fm.binding))) add('E', `binding 越界: ${fm.binding}（合法: 0-4）`, rel);
    for (const v of [].concat(fm.dynamics || []))
      if (!VERBS.includes(v)) add('E', `dynamics 词表外: ${v}（合法: ${VERBS.join('/')})`, rel);

    // 模态缺席提示：规则承载文档应显式标 status——缺省不定性（normative 被静默降格比不报更坏）；
    // ADR 豁免：生命周期走正文 Status（Proposed/Accepted/Superseded），不进模态词表
    if (fm.domain && !fm.status && !ADR_RE.test(rel))
      add('I', `status 未声明（模态机不可见——spec-fuzz 无法判定断言权威；ADR 豁免）`, rel);

    // 域登记反向检查：文档域合法但不在 ming.yaml domains = 域被事实实例化而无立法痕迹（O4：可插队不可隐身）
    if (fm.domain && DOMAINS.has(fm.domain) && mingCfg && Array.isArray(mingCfg.domains) && !mingCfg.domains.includes(fm.domain))
      add('W', `文档域 ${fm.domain} 未在 ming.yaml domains 登记（域实例化须先登记）`, rel);

    // 4. canonical 双真相（[].concat 归一——标量写法 for-of 会按字符遍历造假碰撞）
    for (const key of [].concat(fm.canonical || [])) {
      if (!canonical.has(key)) canonical.set(key, []);
      canonical.get(key).push(rel);
    }

    // 5. frozen 登记
    if (fm.status === 'frozen') frozenDocs.push(rel);

    // 6. proposed 超期
    if (fm.status === 'proposed' && fm.since) {
      const age = (now - Date.parse(fm.since)) / 86400000;
      if (age > provDays) add('W', `proposed 挂账 ${Math.floor(age)} 天超 ${provDays} 天——"省"动力学提醒复审`, rel);
    }
    if (fm.status === 'proposed' && !fm.since) {
      add('I', `proposed 无 since: 日期，无法计龄`, rel);
    }

    // 6b. provisional 插队销账（序律 O4：可插队不可隐身——超龄未回候审档补裁决 = W）
    if (fm.status === 'provisional') {
      if (fm.since) {
        const age = (now - Date.parse(fm.since)) / 86400000;
        if (age > provDays) add('W', `provisional 插队 ${Math.floor(age)} 天超 ${provDays} 天未销账——须回候审档补裁决`, rel);
      } else {
        add('I', `provisional 无 since: 日期，无法计龄`, rel);
      }
    }
  }

  // 2. landed 指针（OPEN-FINDINGS 类文件；反引号内字面量不算标注）
  for (const m of content.matchAll(/(?<!`)\[landed\][^\n]*/g)) {
    const seg = content.slice(m.index, m.index + 300);
    const pathM = seg.match(/`([^`]+?\.md(?:#[^`]*)?)`/);
    if (!pathM) { add('W', `[landed] 无指向文件（标注格式: [landed] \`path/file.md#anchor\`）`, rel); continue; }
    const targetPath = pathM[1].split('#')[0];
    const resolved = path.resolve(target, targetPath);
    const resolvedRoot = path.resolve(target, '..', targetPath);
    if (!fs.existsSync(resolved) && !fs.existsSync(resolvedRoot)) {
      add('E', `[landed] 指向不存在: ${targetPath}`, rel);
    }
  }
}

for (const [key, files] of canonical) {
  if (files.length > 1) add('E', `双真相: canonical 键 "${key}" 被 ${files.length} 处声明（${files.join(', ')}）`);
}

// ---------- 7. 标识分配律 ----------
// 定义位: 标题 ID（### A5. / # L3 — / ## D5.）+ adr/NNNN-*.md 文件名 + 候审档字母区内编号项 + 粗体定义位
// 引用位: 正文独立标号 token（含反引号）；未定义 = 悬空
// 命名空间表外置（高度自定义化）消费链: --labels > ming.yaml namespaces > <target>/namespaces.json > skill 内置默认
// 路径相对 ming.yaml 所在目录解析（mkdocs docs_dir 先例）——自洽兼容两种放置：docs/ming.yaml 写 "namespaces.json"，根 ming.yaml 写 "docs/namespaces.json"
let nsList = null, nsSource = null;
let nsFile = labelsArg || null;
const nsDeclared = mingCfg && mingCfg.namespaces !== undefined;
if (!nsFile && nsDeclared) {
  const decl = path.resolve(path.dirname(mingCfgPath), String(mingCfg.namespaces));
  if (fs.existsSync(decl)) nsFile = decl;
  else add('E', `ming.yaml namespaces 指向不存在: ${mingCfg.namespaces}（相对 ${path.dirname(mingCfgPath)}）`);
}
if (!nsFile && !nsDeclared) {
  const convNs = path.join(target, 'namespaces.json');
  if (fs.existsSync(convNs)) nsFile = convNs;
}
if (nsFile) {
  try { nsList = JSON.parse(fs.readFileSync(nsFile, 'utf8')).namespaces; nsSource = nsFile; }
  catch (e) { add('E', `命名空间登记表解析失败: ${nsFile} — ${e.message}`); }
}
if (!nsList) {
  nsList = JSON.parse(fs.readFileSync(path.join(SKILL_DIR, 'assets/namespaces.default.json'), 'utf8')).namespaces;
  nsSource = 'skill-default';
}
// role=id 的命名空间参与定义/引用扫描；role=value 仅为词表（错误码/版本号/算子 type，事实源各在自有 schema）
const idAlt = nsList.filter(n => n.role !== 'value').map(n => n.pattern.replace(/^\^|\$$/g, '')).join('|');
const LABEL_REF = new RegExp(`\\b(${idAlt})\\b`, 'g');
const BOLD_DEF = new RegExp(`\\*\\*(${idAlt})\\b`);
const LABEL_FORMATS = nsList.map(n => new RegExp(n.pattern));
const defined = new Map();    // id -> [file:line]
const refs = [];              // {id, rel, line}
const statusByFile = new Map(); // rel -> fm.status

for (const f of mdFiles) {
  const rel = path.relative(target, f).replace(/\\/g, '/');
  const content = fs.readFileSync(f, 'utf8');
  const lines = content.split(/\r?\n/);
  const fm = parseFm(content);
  statusByFile.set(rel, fm && fm.status);

  // ADR 文件名定义（adr_dir 锚点可配——棕场 decisions/ 等命名向下兼容）
  const adm = rel.match(ADR_RE);
  if (adm) {
    const id = `ADR-${adm[1]}`;
    if (!defined.has(id)) defined.set(id, []);
    defined.get(id).push(`${rel}:1`);
  }

  // 候审档字母区：## Q. 标题下的 "N. xxx" 列表项 = 定义 Q<N>
  let sectionLetter = null;
  let inFence = false; // 代码围栏内不扫标号——mermaid 节点 ID/代码示例非行文引用
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const secM = line.match(/^## ([A-Z])\.\s/);
    if (secM) sectionLetter = secM[1];
    if (/^## /.test(line) && !secM) sectionLetter = null;
    const itemM = sectionLetter && line.match(/^(\d+)\.\s/);
    if (itemM) {
      const id = `${sectionLetter}${itemM[1]}`;
      if (!defined.has(id)) defined.set(id, []);
      defined.get(id).push(`${rel}:${i + 1}`);
    }
    const headM = line.match(new RegExp(`^#{1,6}\\s+(${idAlt})\\s*[.．:：—\\- ]`));
    if (headM) {
      const id = headM[1];
      if (!defined.has(id)) defined.set(id, []);
      defined.get(id).push(`${rel}:${i + 1}`);
      continue; // 标题行是定义不是引用
    }
    for (const bm of line.matchAll(new RegExp(BOLD_DEF.source, 'g'))) {
      const id = bm[1];
      if (!defined.has(id)) defined.set(id, []);
      defined.get(id).push(`${rel}:${i + 1}`);
    }
    for (const rm of line.matchAll(LABEL_REF)) refs.push({ id: rm[1], rel, line: i + 1 });
  }
}
// 引用检查豁免：候审档（只增不隐；findings_pat 锚点可配）+ descriptive/frozen 史档——旧名是冻结史不是悬空
const refsLive = refs.filter(r =>
  !FINDINGS_RE.test(r.rel) && !['descriptive', 'frozen'].includes(statusByFile.get(r.rel)));

for (const [id, sites] of defined) {
  const files = [...new Set(sites.map(s => s.split(':')[0]))];
  if (files.length > 1) add('E', `标号撞名: ${id} 定义于多处（${sites.join(', ')}）——前缀=有界上下文，跨空间不撞名`);
}
for (const { id, rel, line } of refsLive) {
  if (!defined.has(id)) add('W', `悬空引用: ${id} 无定义位（${rel}:${line}）`);
}
for (const [id] of defined) {
  if (!LABEL_FORMATS.some(r => r.test(id))) add('W', `标号 ${id} 不匹配已登记命名空间格式（namespaces.json）`);
}
// 登记表双真相互锁: meta 域文档的"命名空间"表对照 namespaces.json（散文视图不得偏离机读源）
if (nsFile) {
  const jsonPrefixes = new Set(nsList.map(n => n.prefix));
  for (const { rel, fm, text } of allDocs) {
    if (!fm || fm.domain !== 'meta') continue;
    const tablePrefixes = new Set();
    let inNs = false;
    for (const line of text.split('\n')) {
      if (/^#{1,6}\s/.test(line)) inNs = /命名空间|namespace/i.test(line);
      else if (inNs && /^\|/.test(line)) {
        for (const m of (line.split('|')[1] || '').matchAll(/`([^`]+)`/g)) tablePrefixes.add(m[1].trim());
      }
    }
    if (!tablePrefixes.size) continue; // 无命名空间表的 meta 文档不参与互锁
    for (const p of tablePrefixes) if (!jsonPrefixes.has(p)) add('E', `登记漂移: meta 表前缀 ${p} 不在 namespaces.json（${rel}）`, rel);
    for (const p of jsonPrefixes) if (!tablePrefixes.has(p)) add('E', `登记漂移: namespaces.json 前缀 ${p} 未在 meta 表登记（${rel}）`, rel);
  }
}
// O1 倒挂检查: normative 文档引用 proposed 文档定义的标号 = W（被依赖者位阶不得低于引用方）
{
  const defStatus = new Map(); // id -> status of first defining file
  for (const [id, sites] of defined) {
    const f = sites[0].split(':')[0];
    defStatus.set(id, statusByFile.get(f));
  }
  for (const { id, rel, line } of refsLive) {
    if (statusByFile.get(rel) === 'normative' && (defStatus.get(id) === 'proposed' || defStatus.get(id) === 'provisional')) {
      add('W', `倒挂引用: normative 文档引用 ${defStatus.get(id)} 定义的 ${id}（${rel}:${line}）——序律 O1`, rel);
    }
  }
}
// 未登记命名空间族启发式: ID 形 token 不匹配任何登记格式且成族出现 = W（提示性，不自动登记——登记是裁决行为）
{
  const STOP = new Set(['ISO','UTF','SHA','MD','RGB','HSL','IP','TCP','UDP','HTTP','HTTPS','SQL','PNG','JPG','JPEG','GIF','BMP','PDF','ZIP','GPU','CPU','API','URL','URI','JSON','YAML','XML','HTML','CSS','CLI','GUI','IDE','SDK','VM','CI','CD','IoU','AR','GT','WS','DTD','MAE','ONNX','UI','TDD','BDD','MDT','DNA','RGB','SARIF','OPA','ADR']);
  const fam = new Map(); // prefix -> {tokens:Set, files:Set, count}
  for (const { rel, text } of allDocs) {
    if (FINDINGS_RE.test(rel) || ['descriptive','frozen'].includes(statusByFile.get(rel))) continue;
    for (const m of text.matchAll(/\b([A-Z]{2,})\d+\b/g)) {
      const [tok, pre] = [m[0], m[1]];
      if (STOP.has(pre) || LABEL_FORMATS.some(r => r.test(tok))) continue;
      if (!fam.has(pre)) fam.set(pre, { tokens: new Set(), files: new Set(), count: 0 });
      const f = fam.get(pre); f.tokens.add(tok); f.files.add(rel); f.count++;
    }
  }
  for (const [pre, f] of fam) {
    // 族须 ≥2 个不同成员 token——单 token 重复出现是术语不是族（ARM64×8/BM25×4 类误报来源）
    if (f.tokens.size >= 2) add('W', `疑似未登记命名空间族: ${pre}<N>（${[...f.tokens].slice(0,5).join(', ')}${f.tokens.size>5?'…':''} 共 ${f.count} 处 @ ${[...f.files].slice(0,3).join(', ')}）——登记或停用，裁决在人`);
  }
}
// ming.yaml 校验（配置层）：词表 + 声明域实例化
if (mingCfg) {
  if (mingCfg.tier && !VOCAB.tier.includes(mingCfg.tier)) add('W', `ming.yaml tier 词表外: ${mingCfg.tier}（合法: ${VOCAB.tier.join('/')}）`);
  if (mingCfg.gates && !VOCAB.gates.includes(mingCfg.gates)) add('W', `ming.yaml gates 词表外: ${mingCfg.gates}（合法: ${VOCAB.gates.join('/')}）`);
  for (const d of mingCfg.domains || []) {
    if (!DOMAINS.has(d)) add('W', `ming.yaml 声明未知域: ${d}`);
    else if (!domainDocs.has(d)) add('I', `ming.yaml 声明域 ${d} 未实例化（有意零请在 ming.yaml 移除或补文档）`);
  }
  // 未知键检查：拼错的已知键会被静默忽略=配置漂移隐身（adrs.toml unrecognized-keys warning 先例）；
  // 键集事实源=schema properties；x_ 前缀 = 项目私有扩展通道（HTTP X- 头惯例），豁免
  for (const k of Object.keys(mingCfg)) {
    if (!KNOWN_KEYS.has(k) && !k.startsWith('x_')) add('W', `ming.yaml 未知键: ${k}（拼写漂移隐身——若有意请用 x_ 前缀私有扩展位）`);
  }
}

// ---------- 3. 域 x 动词矩阵 ----------
// dynamics 语义 = 描述性"本档实际执行集"（非域级覆盖声明）；矩阵 = 域内各档执行集并集（观测）
const matrix = {};
for (const [dom, docs] of domainDocs) {
  matrix[dom] = new Set();
  for (const { fm } of docs) for (const v of fm.dynamics || []) matrix[dom].add(v);
}
// 有意零裁决位：ming.yaml `dynamics_zero:` 平铺列表 "<域> <动词>"——配置层裁决（YAML-lite 只支持列表不嵌套 map）
const zeroCells = new Set();
for (const ent of [].concat(mingCfg?.dynamics_zero || [])) {
  const [zd, zv] = String(ent).trim().split(/\s+/);
  if (!zd || !zv || !DOMAINS.has(zd) || !VERBS.includes(zv)) {
    add('W', `dynamics_zero 条目非法: "${ent}"（格式 "<域> <动词>"，域/动词须在词表内）`);
    continue;
  }
  zeroCells.add(`${zd}:${zv}`);
}
const allDomains = [...DOMAINS].filter(d => domainDocs.has(d));
for (const d of allDomains) {
  for (const v of VERBS) {
    if (matrix[d].has(v)) {
      if (zeroCells.has(`${d}:${v}`)) add('W', `dynamics_zero 矛盾: ${d} x ${v} 已有文档执行却仍声明为零（声明与实态漂移）`);
    } else if (!zeroCells.has(`${d}:${v}`)) {
      add('I', `矩阵空格: ${d} x ${v} 未标注（有意零请在 ming.yaml dynamics_zero 声明）`);
    }
  }
}

// ---------- 5. staged 模式下 frozen 拦截 ----------
if (staged) {
  let changed = [];
  try {
    changed = execSync('git diff --cached --name-only', { cwd: target, encoding: 'utf8' })
      .split('\n').map(s => s.trim()).filter(Boolean);
  } catch { add('I', '非 git 仓库或无暂存区——frozen 拦截跳过'); }
  const frozenSet = new Set(frozenDocs);
  for (const c of changed) {
    const rel = path.relative(target, path.resolve(target, c)).replace(/\\/g, '/');
    if (frozenSet.has(rel) || frozenSet.has(c)) add('E', `frozen 文档被修改: ${rel}（Know 域只增不隐——新版=新文件）`, rel);
  }
}
for (const f of frozenDocs) add('I', `frozen 登记: ${f}`);

// ---------- 索引层: --emit-index 生成 labels-index.json（派生视图非事实源） ----------
if (emitIdx) {
  const refCount = {};
  for (const r of refs) refCount[r.id] = (refCount[r.id] || 0) + 1;
  const index = {
    generated: new Date().toISOString(),
    namespaces_source: nsSource,
    ids: Object.fromEntries([...defined].map(([id, sites]) => [
      id, { defined: sites, refs: refCount[id] || 0, dead: !(refCount[id] > 0) },
    ])),
    docs: Object.fromEntries(allDocs.map(d => [d.rel, { domain: d.fm?.domain || null, status: d.fm?.status || null }])),
  };
  fs.writeFileSync(path.resolve(emitIdx), JSON.stringify(index, null, 2));
  console.log(`labels-index: ${emitIdx} (${defined.size} ids)`);
}

// ---------- 输出 ----------
// gates 轴（ming.yaml 声明）：off=纯报告永不 fail / soft=E 才 fail / hard=E+W 都 fail（fail-on-warn 先例）
// 只改退出语义不改检查分级——--strict 管单查升档，gates 管全局出口
const gates = (mingCfg && mingCfg.gates) || 'soft';
if (asJson) {
  console.log(JSON.stringify({ issues, domains: [...domainDocs.keys()], frozen: frozenDocs, gates }, null, 2));
} else {
  console.log(`audit-domains: ${target}  (${mdFiles.length} docs, ${domainDocs.size} domains)`);
  console.log(`命名空间表: ${nsSource}`);
  console.log(`门控: ${gates}${mingCfgPath ? ` (${mingCfgPath})` : ' (默认 soft)'}`);
  console.log(`域清单: ${[...domainDocs.keys()].join(', ') || '(无)'}`);
  for (const i of issues) console.log(`[${i.level}] ${i.file === target ? '' : i.file + ' '}${i.msg}`);
  const e = issues.filter(i => i.level === 'E').length;
  const w = issues.filter(i => i.level === 'W').length;
  const n = issues.filter(i => i.level === 'I').length;
  console.log(`\nE=${e} W=${w} I=${n}`);
}
process.exitCode = gates === 'off' ? 0
  : (issues.some(i => i.level === 'E') || (gates === 'hard' && issues.some(i => i.level === 'W'))) ? 1 : 0;
