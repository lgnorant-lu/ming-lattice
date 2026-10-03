// lib/docmeta.mjs — 文档头元数据抽取（docClass HeaderParser port 的参考实现）
// 产出三面（spec 无关的原始抽取；类契约消费方自选方言与必填词表）:
//   frontmatter {fields, fieldMap, yamlFidelity, span} | null
//   blockquote  {fields, fieldMap, span} | null   —— 首个 block_quote 节点
//   relations   [{dialect, field, raw, line}]      —— 字段值内 *.md 记号
// 抽取律（IV8 meta_check 254/254 判决级对拍 + 10 万件语料实证）:
//   L1 fm 探测 regex 主权——AST minus_metadata 三类盲区: EOF 无换行闭合/
//      尾空格定界符/空 fm（`---\n---`）；本件以行扫描等效覆盖
//   L2 blockquote 头 = 文档首个 block_quote 节点（非全块扫；描述性引用
//      无 name: 形态自然不成字段）
//   L3 字段名 = 行界 [^:：]+，首字符非数字——`> 2026-08-12 03:53 落盘`
//      这类时间戳行的 ASCII `:` 不把 `2026-08-12 03` 变字段名
//   L4 全角 `：` 仅 ≤12 字符短名——CJK 标注方言子规则（`创建：`/`判据：`），
//      长句首段不误判字段
//   L5 悬挂标点续行：前字段值尾 ∈ [+,，、；、（] 或下行首 ∈ `（` → 并入前值；
//      其余非字段 `> ` 行跳过（非胶合——meta_check 对拍实证：全量胶合会
//      把 `Status: accepted` 与下接标注行粘成非法值）
//   L6 relation = 字段值内 `*.md` 记号采集（code-span/裸写同收；解址与
//      死链判定归消费方——docmeta 只产 raw 引用）
//   L7 yaml 值解析 best-effort——yaml-lite 全值解析失败降 key-only 分面，
//      不 fail-closed（零缩进列表/| 块标量/jinja 值属合法方言残余）
import { parseYamlLite } from './yaml.mjs';

const FM_OPEN = /^---[ \t]*$/;
const FM_CLOSE = /^---[ \t]*$/;
const BQ_LINE = /^\s{0,3}>\s?(.*)$/;
const FENCE = /^\s*(```|~~~)/;
// L3/L4: name 行界非冒号、首字符非数字；ASCII `:` 任意长度名，全角 `：` ≤12 字符
const FIELD_ASCII = /^([^\d][^:：\n]*?)\s*:\s*(.*)$/;
const FIELD_CJK = /^([^\d\s][^:：\n]{0,11})：\s*(.*)$/;
const HANG_TAIL = /[+,，、；、（]\s*$/;
const MD_REF = /[\w.:/-]+\.md(?:#[\w-]+)?/g;

// 单字段行判定 → {name, value} | null
function fieldLine(c) {
  const a = c.match(FIELD_ASCII);
  if (a) return { name: a[1].trim(), value: a[2].trim() };
  const k = c.match(FIELD_CJK);
  if (k) return { name: k[1].trim(), value: k[2].trim() };
  return null;
}

// 续行判定（L5）：并入前字段返回 true；否则 false
function joinable(prevValue, content) {
  return HANG_TAIL.test(prevValue) || content.trimStart().startsWith('（');
}

export function extractDocmeta(text) {
  const lines = text.split(/\r?\n/);
  let fm = null, bq = null;
  const relations = [];
  let i = 0, inFence = false;

  // ── 面一：yaml-frontmatter（L1——文件第 0 行起；行扫描等价 regex 语义，
  //         EOF 无换行闭合/尾空格定界/空 fm 全收） ──
  if (lines[0] !== undefined && FM_OPEN.test(lines[0])) {
    const body = [];
    let end = -1;
    for (let j = 1; j < lines.length; j++) {
      if (FM_CLOSE.test(lines[j])) { end = j; break; }
      body.push(lines[j]);
    }
    // 无闭合 `---` 且到 EOF——视作 fm 缺席（非半头；L1 盲区仅 EOF 无换行闭合符本身）
    if (end > 0) {
      const fields = [], fieldMap = {};
      for (const [k, l] of body.entries()) {
        if (/^\s/.test(l) || l === '') continue;   // 缩进行=父键值域（块标量/列表），非顶层键
        const f = fieldLine(l);
        if (f) { fields.push({ ...f, line: k + 2 }); fieldMap[f.name] ??= f.value; }
      }
      let yamlFidelity = 'full';
      try { parseYamlLite(body.join('\n') + '\n'); } catch { yamlFidelity = 'key-only'; }
      fm = { fields, fieldMap, yamlFidelity, span: { start: 1, end: end + 1 } };
      i = end + 1;
    }
  }

  // ── 面二：blockquote 头（L2——首个 block_quote 节点；fence 掩蔽） ──
  for (; i < lines.length; i++) {
    const l = lines[i];
    if (FENCE.test(l)) { inFence = !inFence; continue; }
    if (inFence) continue;
    if (!BQ_LINE.test(l)) continue;
    // 首个 `>` 行块：连扫同前缀行
    const fields = [], fieldMap = {};
    const start = i + 1;
    let last = null;
    for (; i < lines.length; i++) {
      const m = lines[i].match(BQ_LINE);
      if (!m) { i--; break; }
      const c = m[1];
      const f = fieldLine(c);
      if (f) { last = { ...f, line: i + 1 }; fields.push(last); }
      else if (last && joinable(last.value, c)) last.value += ' ' + c.trim();   // L5
      // 其余 `> ` 行：非字段非续行——跳过
    }
    for (const f of fields) fieldMap[f.name] ??= f.value;   // 续行终值后 first-wins 投影
    bq = { fields, fieldMap, span: { start, end: i + 1 } };
    break;
  }

  // ── 面三：relation 记号（L6——两方言同收） ──
  for (const [dialect, surf] of [['yaml-frontmatter', fm], ['blockquote', bq]]) {
    if (!surf) continue;
    for (const f of surf.fields)
      for (const m of f.value.matchAll(MD_REF))
        relations.push({ dialect, field: f.name, raw: m[0], line: f.line });
  }

  return { frontmatter: fm, blockquote: bq, relations };
}
