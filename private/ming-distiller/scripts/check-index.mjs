// check-index.mjs — distill/INDEX.yaml 契约校验器
// 仓库事实源对账：INDEX 条目 <-> distill/<project>/*.md 文件 <-> 条目 frontmatter
// 层级: E=断契约（悬空路径/漏登记/字段违约） W=漂移嫌疑 I=信息
// 用法: node check-index.mjs [--json] [--strict]   （零旗标 = 人读输出）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DISTILL_DIR = path.join(REPO_ROOT, 'distill');
const INDEX_PATH = path.join(DISTILL_DIR, 'INDEX.yaml');

// axis 闭集 = 模板声明值 ∪ Ming-L 九域名（真实条目已漂向域名词表——
// entry-template.md 声明集与 INDEX 用法同步更新 2026-09-20）
const AXES = new Set(['testing', 'docs', 'docs-presentation', 'obs', 'sec', 'contract', 'overlay', 'arch', 'reverse', 'ui', 'antibot', 'protocol', 'other',
  'meta', 'spec', 'dev', 'plan', 'gov', 'exp', 'verify', 'ops', 'know']);
const STATUSES = new Set(['active', 'superseded']);
const SCOPES = new Set(['project-only', 'general']);
const ID_RE = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/;

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

// ── INDEX.yaml 解析（固定形态：entries: list-of-map，标量/内联 list 值） ──
function parseIndex(text) {
  const entries = [];
  const m = text.match(/^entries:[ \t]*\r?\n([\s\S]*)$/m);
  if (!m) return null;
  for (const raw of m[1].split(/(?=^\s{2}- )/m)) {
    if (!/^\s{2}- /.test(raw)) continue;
    // 首字段与 `- ` 同行（`- id: x`）——破折号归一为空格后按普通 map 解析
    const chunk = raw.replace(/^(\s*)- /, '$1  ');
    const pick = k => {
      const f = chunk.match(new RegExp(`^\\s*${k}:\\s*(.+?)\\s*$`, 'm'));
      return f && f[1].replace(/^"(.*)"$/, '$1');
    };
    const pickList = k => {
      const f = chunk.match(new RegExp(`^\\s*${k}:\\s*\\[(.*?)\\]\\s*$`, 'm'));
      return f ? f[1].split(',').map(s => s.trim()).filter(Boolean) : null;
    };
    entries.push({
      id: pick('id'), project: pick('project'), path: pick('path'),
      axis: pickList('axis'), tags: pickList('tags'), summary: pick('summary'),
      revision: pick('revision'), updatedAt: pick('updatedAt'),
      status: pick('status'), scope: pick('scope'),
    });
  }
  return entries;
}

// ── 条目文件 frontmatter（事实源侧） ──
function parseFrontmatter(file) {
  const text = fs.readFileSync(file, 'utf8');
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return null;
  const pick = k => {
    const f = fm[1].match(new RegExp(`^${k}:\\s*(.+?)\\s*$`, 'm'));
    return f && f[1].replace(/^"(.*)"$/, '$1');
  };
  return { id: pick('id'), status: pick('status'), supersedes: pick('supersedes') };
}

// ── 主校验 ──
if (!fs.existsSync(INDEX_PATH)) { add('E', 'distill/INDEX.yaml 不存在'); }
else {
  const entries = parseIndex(fs.readFileSync(INDEX_PATH, 'utf8'));
  if (!entries) add('E', 'INDEX.yaml 无 entries: 块（解析失败）');
  else {
    const seen = new Set();
    const entryPaths = new Set();
    for (const e of entries) {
      const label = e.id || '(无 id 条目)';
      for (const k of ['id', 'project', 'path', 'summary', 'revision', 'updatedAt', 'status', 'scope']) {
        if (!e[k]) add('E', `${label}: 缺字段 ${k}`);
      }
      if (e.id && !ID_RE.test(e.id)) add('E', `${label}: id 形态违约（须 YYYY-MM-DD-kebab）`);
      if (e.id && seen.has(e.id)) add('E', `${label}: id 重复`);
      seen.add(e.id);
      if (e.axis) for (const a of e.axis) if (!AXES.has(a)) add('E', `${label}: axis 越出闭集: ${a}`);
      if (!e.axis) add('E', `${label}: 缺字段 axis`);
      if (e.status && !STATUSES.has(e.status)) add('E', `${label}: status 非法值: ${e.status}`);
      if (e.scope && !SCOPES.has(e.scope)) add('E', `${label}: scope 非法值: ${e.scope}`);
      if (e.updatedAt && !/^\d{4}-\d{2}-\d{2}$/.test(e.updatedAt)) add('E', `${label}: updatedAt 非日期形态`);
      if (e.revision && !/^\d+$/.test(e.revision)) add('E', `${label}: revision 非整数`);

      if (e.path) {
        entryPaths.add(e.path);
        const abs = path.join(REPO_ROOT, e.path);
        if (!fs.existsSync(abs)) { add('E', `${label}: path 悬空——${e.path} 不存在`); }
        else {
          const fm = parseFrontmatter(abs);
          if (!fm) add('W', `${label}: 条目文件无 frontmatter（事实源不可读）`);
          else {
            if (fm.id && e.id && fm.id !== e.id) add('E', `${label}: INDEX id 与文件 frontmatter id 不一致（${fm.id}）`);
            if (fm.status && e.status && fm.status !== e.status) add('W', `${label}: status 双写漂移（INDEX=${e.status} 文件=${fm.status}）`);
            if (fm.supersedes && !entries.some(x => x.id === fm.supersedes)) {
              add('E', `${label}: supersedes 指向不存在的条目 id: ${fm.supersedes}`);
            }
          }
        }
      }
      if (e.status === 'superseded') add('I', `${label}: 已废弃条目（supersedes 链上节点）`);
    }

    // 覆盖面对账：库内每个条目文件须有 INDEX 记录（_proposals 属 staging，豁免）
    for (const dir of fs.readdirSync(DISTILL_DIR, { withFileTypes: true })) {
      if (!dir.isDirectory() || dir.name === '_proposals') continue;
      const sub = path.join(DISTILL_DIR, dir.name);
      for (const f of fs.readdirSync(sub)) {
        if (!f.endsWith('.md')) continue;
        const rel = `distill/${dir.name}/${f}`;
        if (!entryPaths.has(rel)) add('E', `未登记条目文件: ${rel}——INDEX.yaml 无记录`);
      }
    }
  }
}

// ── 输出 ──
const counts = { E: 0, W: 0, I: 0 };
for (const i of issues) counts[i.level]++;
if (flags.has('--json')) {
  console.log(JSON.stringify({ issues, counts }, null, 2));
} else {
  for (const i of issues) console.log(`[${i.level}] ${i.msg}`);
  console.log(`distill-index: E=${counts.E} W=${counts.W} I=${counts.I}`);
}
if (counts.E > 0 || (flags.has('--strict') && counts.W > 0)) process.exit(1);
