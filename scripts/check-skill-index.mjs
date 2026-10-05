// check-skill-index.mjs — docs/SKILL-INDEX.md 契约校验器
// 事实源对账: registry.yaml 可索引项 <-> SKILL-INDEX 全文覆盖 + 计数声明 + 行归属
// 层级: E=断契约（登记项全文档零踪迹） W=漂移嫌疑（计数声明/无标记游离行） I=信息
// 用法: node scripts/check-skill-index.mjs [--json] [--strict]   （零旗标 = 人读输出）
//
// 契约口径（与 distill-index 同族）：
//   可索引集 = base.modules 键 ∪ vertical.name ∪ private.name
//   豁免     = deployable（包装层, 经 vertical 行间接索引）/ candidates（候审 staging）
//   覆盖判定 = 名字经归一化（小写 + _/空格→-）后在文档全文出现即可——
//             行内登记优先, 散文提及豁免（如下架项的决策记录）
//   行归属   = 表行首格是 ASCII 标识、不在登记表、且行内无否决/例外标记 → W
//   计数声明 = 标题内 "N 个/包/项/条" 或裸 （N）: ## 级对账 registry 层规模,
//             ### 级对账标题下 ASCII 首格表行数
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY_PATH = path.join(REPO_ROOT, 'registry.yaml');
const INDEX_PATH = path.join(REPO_ROOT, 'docs', 'SKILL-INDEX.md');

const issues = [];
const add = (level, msg) => issues.push({ level, msg });

// ── 参数解析（fail-closed，与全仓 CLI 同构） ──
const args = process.argv.slice(2);
const BOOL_FLAGS = new Set(['--json', '--strict']);
const flags = new Set();
for (const a of args) {
  if (!BOOL_FLAGS.has(a)) { console.error(`unknown flag: ${a}`); process.exit(2); }
  if (flags.has(a)) { console.error(`duplicate flag: ${a}`); process.exit(2); }
  flags.add(a);
}

// 归一化: 小写 + _→-（空格保留——并入 '-' 会吞掉表行边界使 lookbehind 恒失败）
const norm = s => s.toLowerCase().replace(/_/g, '-').replace(/\s+/g, ' ');
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ── registry.yaml 解析（行级层扫描，yaml-lite 子集） ──
function parseRegistry(text) {
  const out = { baseModules: [], vertical: [], private: [], deployable: [], candidates: [] };
  const paths = new Map(); // name -> path（导引对账用）
  let section = null, inModules = false, lastName = null;
  for (const raw of text.split(/\r?\n/)) {
    const sec = raw.match(/^([a-z_]+):\s*$/);
    if (sec) { section = sec[1]; inModules = false; lastName = null; continue; }
    if (!section) continue;
    if (section === 'base' && /^ {4}modules:\s*$/.test(raw)) { inModules = true; continue; }
    const entry = raw.match(/^ {2}- name:\s*(.+?)\s*$/);
    if (entry) { inModules = false; lastName = entry[1]; if (section in out && Array.isArray(out[section])) out[section].push(entry[1]); continue; }
    const p = raw.match(/^ {4}path:\s*(.+?)\s*$/);
    if (p && lastName) { paths.set(lastName, p[1]); continue; }
    if (inModules) {
      const mod = raw.match(/^ {6}([a-zA-Z0-9_-]+):\s*\[/);
      if (mod) out.baseModules.push(mod[1]);
      else if (raw.trim() && !raw.startsWith('      ')) inModules = false;
    }
  }
  return { ...out, paths };
}

// ── SKILL-INDEX.md 解析：表行 + 标题计数声明 ──
function parseIndexDoc(text) {
  const lines = text.split(/\r?\n/);
  const rows = [];     // { cell, line, lineText, hasAsciiId }
  const heads = [];    // { level, text, claims, rowCount }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const h = line.match(/^(#{2,3})\s+(.*)$/);
    if (h) {
      const claims = [];
      const t = h[2];
      for (const m of t.matchAll(/(\d+)\s*(?:个|包|项|条|款)/g)) claims.push(+m[1]);
      for (const m of t.matchAll(/[（(]\s*(\d+)\s*[）)]/g)) claims.push(+m[1]);
      heads.push({ level: h[1].length, text: t, claims, rowCount: 0 });
      continue;
    }
    if (!/^\|.*\|/.test(line)) continue;
    // 表头行：下一行是分隔行
    const next = lines[i + 1] || '';
    if (/^\|[\s:|-]+\|?\s*$/.test(next)) continue;
    if (/^\|[\s:|-]+\|?\s*$/.test(line)) continue; // 分隔行本身
    const cell = (line.match(/^\|\s*([^|]+)/) || [, ''])[1].trim().replace(/\*\*|`/g, '');
    const isItem = /[a-zA-Z0-9]/.test(cell) && !/\.md\s*$/.test(cell);
    rows.push({ cell, line: i + 1, lineText: line, isItem });
    if (isItem && heads.length) heads[heads.length - 1].rowCount++;
  }
  return { rows, heads };
}

// ── 否决/例外标记（非登记行的合法存在理由） ──
const REJECT_RE = /不采|备选|排除|观望|查无此|gone|已下架|用户(项目|自有)|宣传页|教程/;

// ── 导引文档对账（W 级）：包登记后导引树须同步，漂移是复发面 ──
// 口径：registry private 条目按 path 分层——
//   private/<name>            → 须现身 CATALOG.md 顶层 private/ 树
//   private/engineering/<name> → 须现身 engineering/README.md 资产树 + CATALOG.md
//   private/engineering/<group>/<name> → 嵌套组（testing/ 等）经组目录行
//     间接索引，豁免对账
const GUIDE_DOCS = [
  { key: 'engineering-readme', path: path.join(REPO_ROOT, 'private', 'engineering', 'README.md') },
  { key: 'catalog', path: path.join(REPO_ROOT, 'private', 'CATALOG.md') },
];
function checkGuides(reg) {
  const docs = {};
  for (const g of GUIDE_DOCS) {
    const raw = fs.existsSync(g.path) ? fs.readFileSync(g.path, 'utf8') : null;
    docs[g.key] = raw ? { norm: norm(raw), raw } : null;
    if (!docs[g.key]) add('W', `导引文档缺席: ${g.path}（对账降级为不可校验）`);
  }
  const seen = (text, n) =>
    new RegExp(`(?<![a-z0-9-])${esc(norm(n))}(?![a-z0-9-])`).test(text);
  for (const n of reg.private) {
    const p = reg.paths.get(n) || '';
    const segs = p.split('/');
    const isEngDirect = segs.length === 3 && segs[0] === 'private' && segs[1] === 'engineering';
    const isPrivateTop = segs.length === 2 && segs[0] === 'private';
    if (isEngDirect && docs['engineering-readme'] && !seen(docs['engineering-readme'].norm, n))
      add('W', `${n}: engineering/README.md 资产树零踪迹（包登记未同步导引）`);
    if ((isEngDirect || isPrivateTop) && docs['catalog'] && !seen(docs['catalog'].norm, n))
      add('W', `${n}: private/CATALOG.md 目录树零踪迹（包登记未同步导引）`);
  }

  // 反向: 导引树列了非注册包（stale 行=已移除包残留或未登记走私）
  // 口径: `── slug/` 树行；豁免=含 * 的通配组行 / 无连字符的组目录名（engineering、testing）
  //       / 行内带否决标记（REJECT_RE）；判定集=private 登记路径叶子名 ∪ candidates
  const regLeaf = new Set(reg.private.map(n => {
    const segs = (reg.paths.get(n) || '').split('/');
    return norm(segs[segs.length - 1] || n);
  }));
  for (const c of reg.candidates) regLeaf.add(norm(c));
  for (const g of GUIDE_DOCS) {
    const d = docs[g.key];
    if (!d) continue;
    let ln = 0;
    for (const line of d.raw.split(/\r?\n/)) {
      ln++;
      const m = line.match(/[├└]──\s*([a-z0-9][a-z0-9_*-]*)\//);
      if (!m) continue;
      const slug = m[1];
      if (slug.includes('*') || !slug.includes('-')) continue;
      if (REJECT_RE.test(line)) continue;
      if (!regLeaf.has(norm(slug)))
        add('W', `导引 stale 行 L${ln} "${slug}/"（${g.key}）: 不在 private 登记表且无否决标记`);
    }
  }
}

// ── 主校验 ──
if (!fs.existsSync(REGISTRY_PATH)) { add('E', 'registry.yaml 不存在'); }
else if (!fs.existsSync(INDEX_PATH)) { add('E', 'docs/SKILL-INDEX.md 不存在'); }
else {
  const reg = parseRegistry(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  // 解析退化底线：行级迷你解析器对缩进形态敏感——核心层零条目≈解析漂移而非真实为空
  // （缺此项时格式变化会让 indexable 收缩，校验"成功地空跑"=静默失门）
  for (const [k, arr] of [['base.modules', reg.baseModules], ['vertical', reg.vertical],
                          ['private', reg.private], ['deployable', reg.deployable]]) {
    if (arr.length === 0)
      add('E', `registry 解析退化: ${k} 零条目（疑似行级解析与 registry 形态漂移）`);
  }
  const docText = fs.readFileSync(INDEX_PATH, 'utf8');
  const docNorm = norm(docText);
  const { rows, heads } = parseIndexDoc(docText);

  // E: 可索引项全文档零踪迹
  const indexable = [
    ...reg.baseModules.map(n => ({ n, layer: 'base.modules' })),
    ...reg.vertical.map(n => ({ n, layer: 'vertical' })),
    ...reg.private.map(n => ({ n, layer: 'private' })),
  ];
  const regNorm = new Set(indexable.map(x => norm(x.n)));
  for (const { n, layer } of indexable) {
    const re = new RegExp(`(?<![a-z0-9-])${esc(norm(n))}(?![a-z0-9-])`);
    if (!re.test(docNorm)) add('E', `${layer}/${n}: SKILL-INDEX 全文档零踪迹（未登记）`);
  }

  // W: 非登记 ASCII 行无豁免标记（疑似已移除项残留）
  // 首格可为合并单元格 "a / b / c"——按 / 拆分逐名判定
  const regAll = new Set([...regNorm, ...reg.deployable.map(norm), ...reg.candidates.map(norm)]);
  for (const r of rows) {
    if (!r.isItem) continue;
    const names = r.cell.split('/').map(s => s.replace(/[（(].*$/, '').trim()).filter(Boolean);
    if (names.length && names.every(n => regAll.has(norm(n)))) continue;
    if (!REJECT_RE.test(r.lineText)) {
      add('W', `L${r.line} 游离行 "${r.cell}": 不在登记表且无否决/例外标记`);
    }
  }

  // W: 计数声明对账
  const layerSize = { '基座': reg.baseModules.length, '垂直': reg.vertical.length, '私有': reg.private.length };
  for (const h of heads) {
    if (!h.claims.length) continue;
    const key = Object.keys(layerSize).find(k => h.text.includes(k));
    const actual = (h.level === 2 && key) ? layerSize[key] : h.rowCount;
    for (const c of h.claims) {
      if (c !== actual) add('W', `标题计数漂移 "${h.text}": 声明 ${c}, 实际 ${actual}（${h.level === 2 ? 'registry 层规模' : '节内表行'}）`);
    }
  }

  checkGuides(reg);
}

// ── 输出 ──
const counts = { E: 0, W: 0, I: 0 };
for (const i of issues) counts[i.level]++;
if (flags.has('--json')) {
  console.log(JSON.stringify({ issues, counts }, null, 2));
} else {
  for (const i of issues) console.log(`[${i.level}] ${i.msg}`);
  console.log(`skill-index: E=${counts.E} W=${counts.W} I=${counts.I}`);
}
if (counts.E > 0 || (flags.has('--strict') && counts.W > 0)) process.exit(1);
