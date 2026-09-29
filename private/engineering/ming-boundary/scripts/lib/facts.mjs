// lib/facts.mjs — 事实记录构造/分类/序列化（ADR-0008 D2；v1.1 扩 SubjectSet glob）
// 纯函数零 IO。事实 schema v1:
// {v, unit, kind, name, file, line?, fidelity, scope, extractor, extra?}
// unit = 语义身份键（file 或 file#symbol——内容锚，不用行号）

export const FACT_SCHEMA_V = 1;

export function fact(f) {
  const out = {
    v: FACT_SCHEMA_V,
    unit: f.unit,
    kind: f.kind,
    name: f.name,
    file: f.file,
    fidelity: f.fidelity,
    scope: f.scope,
    extractor: f.extractor,
  };
  if (f.line != null) out.line = f.line;
  if (f.extra && Object.keys(f.extra).length) out.extra = f.extra;
  return out;
}

// 域分类：按 boundaries.yaml domains 有序表，首段锚定。
// domainRules: [{name, match}] —— match 为 '|' 分隔的首段 glob
// （private/x/scripts 归 private，不撞中段关键词——切片二教训）。
export function domainOf(rel, domainRules) {
  const norm = rel.replace(/\\/g, '/');
  for (const d of domainRules) {
    for (const pat of d.match.split('|')) {
      if (firstSegMatch(norm, pat.trim())) return d.name;
    }
  }
  return null;
}

// 首段锚定 glob：** 吃任意，* 吃单段内字符。
// 'private/**' 命中 private/ 下全部；'scripts/*' 只命中一层。
function firstSegMatch(rel, pat) {
  if (pat.endsWith('/**')) {
    const head = pat.slice(0, -3);
    return rel === head || rel.startsWith(head + '/');
  }
  if (!pat.includes('/')) return segGlob(rel.split('/')[0], pat);
  // 带斜杠的精确前缀（如 .logs/** 已走上一分支；此处兜底多段单星）
  const ps = pat.split('/'), rs = rel.split('/');
  if (rs.length < ps.length) return false;
  return ps.every((p, i) => segGlob(rs[i], p));
}

function segGlob(seg, pat) {
  const re = new RegExp('^' + pat.split('*').map(escRe).join('[^/]*') + '$');
  return re.test(seg);
}
const escRe = (s) => s.replace(/[.+^${}()|[\]\\]/g, '\\$&');

// 段级全 glob：** 跨段（含零段，gitignore 语义）、* 段内、? 单字符；全串锚定。
// 用于规则 SubjectSet 选择集（units_in/exempt 等）。非首段锚定——与 domainOf 相别。
// 实现要点：占位符两段替换——若先把 ** 翻成 .*，其中的 * 会被下一轮
// *→[^/]* 再次吃掉（经典互吃 bug），故先翻成控制字符再翻回。
const _globReCache = new Map();
const STAR_STAR_SLASH = '\u0000';
const STAR_STAR = '\u0001';
export function globMatch(rel, pat) {
  let re = _globReCache.get(pat);
  if (!re) {
    const body = pat
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*\//g, STAR_STAR_SLASH)
      .replace(/\*\*/g, STAR_STAR)
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '[^/]')
      .replace(/\u0000/g, '(?:[^/]+/)*')
      .replace(/\u0001/g, '.*');
    re = new RegExp('^' + body + '$');
    _globReCache.set(pat, re);
  }
  return re.test(rel);
}
export const baseName = (rel) => rel.replace(/\\/g, '/').split('/').pop();
// unit 身份键的文件部（file#symbol → file）；dir 单元尾斜杠原样保留
export const unitFile = (unit) => String(unit).split('#')[0];

// 确定性序列化：file → line → kind → name → unit 全排序
export function sortFacts(facts) {
  return [...facts].sort((a, b) =>
    str(a.file, b.file) || num(a.line, b.line) ||
    str(a.kind, b.kind) || str(a.name, b.name) || str(a.unit, b.unit));
}
// 码点比较（不用 localeCompare——ICU 差异会破坏 byte-identical 契约）
const str = (a, b) => {
  const x = String(a ?? ''), y = String(b ?? '');
  return x < y ? -1 : x > y ? 1 : 0;
};
const num = (a, b) => (a ?? 0) - (b ?? 0);

export function toJsonl(facts) {
  return sortFacts(facts).map((f) => JSON.stringify(f)).join('\n') + '\n';
}

export function parseJsonl(text) {
  return text.split('\n').filter((l) => l.trim()).map((l, i) => {
    try { return JSON.parse(l); }
    catch { throw new Error(`facts 第 ${i + 1} 行 JSON 损坏`); }
  });
}
