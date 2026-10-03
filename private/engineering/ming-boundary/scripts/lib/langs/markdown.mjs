// langs/markdown.mjs — Markdown 语言前端（第六入场语言，块级语法档）
// 准入闸实证（提案 2026-10-03-markdown-lang-promotion 附录 C 四语料轮）：
//   消费方 = docClass 内核/docmeta 图层——治理文档结构事实（header 方言
//     载体定位、section 层级、fence 掩蔽面、refdef 登记表）；IV8 blockquote
//     方言摄取实证 254/254 判决对拍；docref/docrole/mention 三旧面已被
//     边界契约消费多年。
//   语法捕获 = 块级全可达——minus_metadata/atx+setext_heading/block_quote/
//     fenced_code_block/link_reference_definition；行内 link/code_span
//     kind invalid（上游双语法 bundle 只含块语法）——inline 文本仍走
//     adapters/markdown.mjs 文本层产 docref/mention，边界诚实。
//   零新依赖 = ast-grep 内置 Markdown grammar（无 tags.scm——kind 词表
//     手写按 sh.mjs 先例，上游 node-types.json 为可机读对账金源）。
//   降级戳 = regexFacts 行扫描同构（M6 parity：decl 集 ≡ AST decl 集；
//     fm-at-eof 系已知 AST 盲区 0.015%——parity 断言按件登记豁免）。
//
// 事实面（全 decl 族，file-local——块骨架即"文档的结构谱系"）：
//   md-fm      minus_metadata              → decl shape=frontmatter
//   md-h-atx   atx_heading                 → decl shape=section（depth=# 数）
//   md-h-set   setext_heading              → decl shape=section（depth=1|2）
//   md-bq      block_quote（仅首块）        → decl shape=blockquote-head
//              （IV8 头方言载体——晚期引用块不算头，prepare() 标首块 range）
//   md-fence   fenced_code_block           → decl shape=fence
//              （extra.info=围栏语言标记——结构掩蔽面+嵌入语言清单）
//   md-refdef  link_reference_definition   → decl shape=refdef（label 登记）
//
// 诚实缺席（文档化不实现）：
//   inline 行内产物（link/code_span）——上游 grammar 未 bundle，docref/
//     mention/docmeta 三旧面仍属 adapters/markdown.mjs 文本层；
//   refdef 目标不产 docref 边（定义点→目标的"面边"语义变更属独立裁决，
//     本件只登记定义点 decl）；
//   indented code_block（四空格缩进块）不产 fence decl——与 fenced 不同构；
//   lazy continuation 拼接行——AST block_quote 含惰性续行，regexFacts
//     行扫描按 `>` 行界近似（parity 固件避开该形态，漂移登记可谅）。
import fs from 'node:fs';
import path from 'node:path';
import { fact } from '../facts.mjs';

export const exts = new Set(['.md', '.markdown', '.mdx']);

// 块级 kind 词表（手写——上游 queries/ 无 tags.scm，按 sh.mjs 先例登记）
export const rules = `
id: md-fm
language: Markdown
rule:
  kind: minus_metadata
---
id: md-h-atx
language: Markdown
rule:
  kind: atx_heading
---
id: md-h-set
language: Markdown
rule:
  kind: setext_heading
---
id: md-bq
language: Markdown
rule:
  kind: block_quote
---
id: md-fence
language: Markdown
rule:
  kind: fenced_code_block
---
id: md-refdef
language: Markdown
rule:
  kind: link_reference_definition
`;

const MD_IDS = new Set(['md-fm', 'md-h-atx', 'md-h-set', 'md-bq',
  'md-fence', 'md-refdef']);
export const handles = (id) => MD_IDS.has(id);

// per-file 预处理：首个 block_quote = 头方言载体（判别律——晚期
// `> 描述`/`> 注` 引用块不算头；实证自 IV8 meta_check 对拍 254/254）
export function prepare(ms) {
  const bqs = ms.filter((m) => m.ruleId === 'md-bq')
    .sort((a, b) => a.range.start.line - b.range.start.line
      || a.range.start.column - b.range.start.column);
  return bqs.length
    ? { bqHead: `${bqs[0].range.start.line}:${bqs[0].range.start.column}` }
    : null;
}

// ATX 题文剥离：`## Title ##` → 'Title'（closing sequence 可省）
const atxTitle = (text) =>
  text.replace(/^#{1,6}\s+/, '').replace(/\s+#+\s*$/, '').trim();
const ATX_DEPTH = (text) => (text.match(/^#+/) ?? ['#'])[0].length;

function declShape(out, ctx, m, name, shape, extra = {}) {
  out.push(fact({ unit: ctx.rel, kind: 'decl', name,
    file: ctx.rel, line: m.range.start.line + 1,
    fidelity: 'syntactic', scope: 'file-local', extractor: ctx.extractor,
    extra: { shape, ...extra } }));
}

export function handle(id, m, ctx) {
  if (!handles(id)) return false;
  const text = m.text ?? '';
  switch (id) {
    case 'md-fm':
      declShape(ctx.out, ctx, m, 'frontmatter', 'frontmatter',
        { endLine: m.range.end.line + 1 });
      return true;
    case 'md-h-atx':
      // heading 节点 text 可能含惰性续行（`## T\n>`）——名归一取首行
      declShape(ctx.out, ctx, m, atxTitle(text.split('\n')[0] ?? text), 'section',
        { depth: ATX_DEPTH(text), dialect: 'atx' });
      return true;
    case 'md-h-set': {
      const [title = '', underline = ''] = text.split('\n');
      declShape(ctx.out, ctx, m, title.trim(), 'section',
        { depth: underline.trimStart().startsWith('=') ? 1 : 2,
          dialect: 'setext' });
      return true;
    }
    case 'md-bq': {
      const key = `${m.range.start.line}:${m.range.start.column}`;
      if (ctx.prepared?.bqHead !== key) return true; // 非首块不产 decl
      declShape(ctx.out, ctx, m, 'blockquote-head', 'blockquote-head');
      return true;
    }
    case 'md-fence': {
      const first = (text.split('\n')[0] ?? '').trim();
      const info = (first.match(/^(```|~~~)\s*(\S*)/) ?? [])[2] ?? '';
      declShape(ctx.out, ctx, m, info || 'fence', 'fence',
        { info: info || undefined, endLine: m.range.end.line + 1 });
      return true;
    }
    case 'md-refdef': {
      const label = (text.match(/^\s{0,3}\[([^\]]+)\]/) ?? [])[1] ?? '';
      declShape(ctx.out, ctx, m, label.trim(), 'refdef');
      return true;
    }
    default:
      return false;
  }
}

// ── regexFacts：行扫描同构兜底（M6 parity 义务） ──
// 与 handle 同 decl 面；AST 盲区（fm-at-eof 等）经固件豁免登记，漂移可谅。
// 语料实测对拍出的 tree-sitter-md 语义差（须与 AST 面同判）：
//   · 闭合 fence = 行尾同字符记号串（记号数≥开启）——`text ```` 尾记号亦闭合
//     （t1 探针实证）；带 info 的行不算（记号不在行尾）
//   · `>` 引用内的 fence/heading/refdef AST 仍产 decl——结构扫前剥 `>` 前缀
//   · 引用内 fence 只能由 `>` 行闭合；裸行终结引用块、裸 ``` 另开顶层 fence
//     （t7 探针实证——双态配对：topOpen/qOpen）
//   · `<!--` 起头行开 html 注释块至 `-->`——块内 heading/refdef/setext 全掩蔽
//   · 单 `-`/`--` 下划线是合法 setext（t4/t5 实证），但标题行是注释块时否
export function regexFacts(root, rel, extractor) {
  const abs = path.join(root, rel);
  let text;
  // utf8 严格解码——GBK/非 UTF-8 文件 sg 侧同败（语料契约=utf8），
  // 替代符兜底会把 `#` 标题面误报成 decl（Restore-JS mojibake 实证）
  try {
    text = new TextDecoder('utf8', { fatal: true })
      .decode(fs.readFileSync(abs));
  } catch { return []; }
  const out = [];
  const lines = text.replace(/^﻿/, '').split(/\r?\n/); // BOM 剥离——AST 亦然
  // Phase A：预 fence 表（原始行面配对——只为 list 栈跳过 fence 字面区；
  // fence 内 `- x`/``` 教学行不污染容器栈）。
  //   配对律：闭合=行尾记号；缩进 opener 被 dedent（ind<oi 非空非 `>`）线
  //   夭折——list 容器随 dedent 死，其内 fence 不获闭合（vector-forge 实证：
  //   `  ```bash` item-fence 死於 col0 `#` 行，次 `  ``` ` 开新 top-fence）；
  //   `>` opener 需 `>` 续行，否则同夭折。
  const prelim = [];
  {
    let o = -1, oi = 0, oq = false;
    const MARK = /^\s{0,3}(?:>[ \t]?)*(`{3,}|~{3,})/;
    const CLOSE = /^\s{0,3}(?:>[ \t]?)*(`{3,}|~{3,})\s*$/;
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const ind = (raw.match(/^[ \t]*/) ?? [''])[0].length;
      if (o >= 0) {
        const kill = raw.trim() !== '' && (oq
          ? !/^\s{0,3}>/.test(raw)
          : ind < oi);
        if (!kill && CLOSE.test(raw)) { prelim.push([o, i]); o = -1; continue; }
        if (!kill) continue; // fence 内容行（含空行）
        o = -1; // 夭折——本行落回正常判别
      }
      const m = raw.match(MARK);
      if (!m) continue;
      o = i; oi = m[0].length - m[1].length; oq = /^\s{0,3}>/.test(raw);
    }
    if (o >= 0) prelim.push([o, lines.length - 1]);
  }
  const inPrelim = (i) => prelim.some(([a, b]) => i > a && i < b);
  // Phase B：list 容器内容列剥离（栈式——嵌套项相对缩进）→ `>` 剥离。
  // `- ## T`/`    ```js` 在容器内 AST 仍产 decl——结构扫须见容器内文。
  // 逐行记录容器标签（fence 配对按上下文判别——list/q 剥离行不是顶层线）
  const stack = [];
  const base = new Array(lines.length);
  const quoted = new Array(lines.length).fill(false);
  const listish = new Array(lines.length).fill(false); // 经 list 剥离
  const indents = new Array(lines.length).fill(0);     // 原始行首缩进
  const floors = new Array(lines.length).fill(0);      // list 剥离用内容列
  const slines = new Array(lines.length);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    indents[i] = (raw.match(/^[ \t]*/) ?? [''])[0].length;
    if (inPrelim(i)) { base[i] = raw; continue; }
    if (raw.trim()) {
      while (stack.length && indents[i] < stack.at(-1)) stack.pop();
    }
    const lm = raw.match(/^(\s*)([-*+]|\d{1,9}[.)])([ \t]+|$)/);
    const ind = indents[i];
    if (lm && ind >= (stack.at(-1) ?? 0)) {
      const gap = lm[3] ?? '';
      const contentCol = ind + lm[2].length + (gap.length > 4 ? 1 : gap.length);
      stack.push(contentCol);
      base[i] = raw.slice(contentCol);
      listish[i] = true; floors[i] = contentCol;
    } else if (stack.length && ind >= stack.at(-1)) {
      base[i] = raw.slice(stack.at(-1));
      listish[i] = true; floors[i] = stack.at(-1);
    } else {
      base[i] = raw;
    }
  }
  for (let i = 0; i < lines.length; i++) {
    const b = base[i] ?? lines[i];
    quoted[i] = /^\s{0,3}>/.test(b);
    slines[i] = b.replace(/^\s{0,3}(>\s?)+/, '');
  }
  const decl = (name, shape, line, extra = {}) =>
    out.push(fact({ unit: rel, kind: 'decl', name, file: rel, line,
      fidelity: 'regex-degraded', scope: 'file-local', extractor,
      extra: { shape, ...extra } }));
  // minus_metadata：行 0 起 `---` 对（行扫描主权面——AST 盲区
  // fm-at-eof/尾空格定界在本面恒可达；fm 只属顶层，用原始行面）
  let fmCloseIdx = -1; // 0-idx 闭合 `---` 行号（缺席=-1）
  if (/^---[ \t]*$/.test(lines[0] ?? '')) {
    for (let i = 1; i < lines.length; i++) {
      if (/^---[ \t]*$/.test(lines[i])) {
        fmCloseIdx = i;
        decl('frontmatter', 'frontmatter', 1, { endLine: i + 2 });
        break;
      }
    }
  }
  const inFm = (i) => i <= fmCloseIdx;
  // html_block 掩蔽（tree-sitter-md 全谱实证——t17-t26、t30-t42 探针族）：
  //   <!-- → --> ； <![CDATA[ → ]]> ； <? → ?> ；
  //   <!LETTER → col0 裸 `>` 线（含该行），否则 EOF（行中/缩进 `>` 不终止）；
  //   </?script|pre|style|textarea → 配名 </tag ；
  //   </?块级tag / 任意tag → 空行终止；任意tag 不可打断段落（type-7）
  // 块内一切结构行掩蔽（`#`/`>`/refdef/fence 记号全字面）
  const HTML_BLOCK_TAGS = new Set(('address article aside base basefont ' +
    'blockquote body caption center col colgroup dd details dialog dir ' +
    'div dl dt fieldset figcaption figure footer form frame frameset ' +
    'h1 h2 h3 h4 h5 h6 head header hr html iframe legend li link main ' +
    'menu menuitem nav noframes ol optgroup option p param section ' +
    'source summary table tbody td tfoot th thead title tr track ul')
    .split(' '));
  const htmlMasked = new Array(lines.length).fill(false);
  {
    let mode = null; // {until:'blank'|'re'|'eof', re?, para?}
    let para = false;
    for (let i = 0; i < lines.length; i++) {
      if (mode) {
        // 激活态先掩蔽+判终止——prelim 区间内的空行/终止线仍须生效
        // （`<After>` 块终结空行正落在 prelim 误配 fence 内之实证）
        htmlMasked[i] = true;
        if (mode.until === 'blank') { if (!slines[i].trim()) mode = null; }
        else if (mode.until === 're' && mode.re.test(slines[i])) mode = null;
        // 'qgt'：type-4 由 col0 裸 `>` 线终止（含该行——t34-t39 实证
        // 行中/缩进 `>` 均不终止，否则 EOF）
        else if (mode.until === 'qgt' && lines[i].startsWith('>')) mode = null;
        continue;
      }
      if (inFm(i) || inPrelim(i)) { para = false; continue; }
      const s = slines[i];
      if (!s.trim()) { para = false; continue; }
      let m;
      const open = (() => {
        if (/^\s{0,3}<!--/.test(s)) return { until: 're', re: /-->/ };
        if (/^\s{0,3}<!\[CDATA\[/i.test(s)) return { until: 're', re: /\]\]>/ };
        if (/^\s{0,3}<![A-Za-z]/.test(s)) return { until: 'qgt' };
        if (/^\s{0,3}<\?/.test(s)) return { until: 're', re: /\?>/ };
        if ((m = s.match(/^\s{0,3}<(script|pre|style|textarea)(?=[\s>/])/i)))
          return { until: 're', re: new RegExp(`</${m[1]}`, 'i') };
        if (/^\s{0,3}<\/?[A-Za-z][\w-]*(?=[\s/>]|$)/.test(s)) {
          const tag = (s.match(/^\s{0,3}<\/?([A-Za-z][\w-]*)/) ?? [])[1]
            ?.toLowerCase();
          if (HTML_BLOCK_TAGS.has(tag)) return { until: 'blank' };
          if (!para) return { until: 'blank' }; // type-7：仅块起点可开
        }
        return null;
      })();
      if (open) {
        htmlMasked[i] = true; para = false;
        // 're' 同行已闭合则不带状态续行；'eof'/'blank' 恒带状态
        if (open.until !== 're' || !open.re.test(s)) mode = open;
        continue;
      }
      // 非块起始行 = 段落文本（type-7 判别用）；块起始行重置 para
      const blockStart = /^\s{0,3}(#{1,6}\s|>|```|~~~|=+\s*$|-+\s*$|[-*+]\s|\d+[.)]\s|\*\s*\*\s*\*|---+\s*$)/;
      para = !blockStart.test(s);
    }
  }
  // fence 区间表：单态机 + 容器上下文。配对律：闭合=同上下文的行尾同字符
  // 记号串（记号数≥开启）；上下文外行对 q/list 态=出容器→孤 fence decl
  // （AST 亦产 opener 单点 decl）；top 态永不夭折（fence 内一切字面）。
  //   top : 非 `>` 且原始缩进≤3 的行尾记号
  //   q   : 带 `>` 且同 listish 层级的行尾记号
  //   list: 非 `>` 且缩进≥floor 的行尾记号（marker/裸缩进行出容器→孤）
  // html 块内一切字面——掩蔽行不可开闭（`<Before>\n```markdown` 实证：
  // type-7 吞 opener，余 ` ``` ` 行在块外才开 fence）
  const fenceRanges = [];
  {
    let open = null; // {i, ch, n, ctx, floor, qInList}
    const OPEN_RE = /^\s{0,3}(`{3,}|~{3,})/;
    const CLOSE_RE = /(`{3,}|~{3,})\s*$/;
    const inCtx = (i) => {
      if (!lines[i].trim()) return true; // 空行=fence 合法内容，不出容器
      if (open.ctx === 'top') return true;
      if (open.ctx === 'q') return quoted[i] && listish[i] === open.qInList;
      return indents[i] >= open.floor; // list：缩进内全字面（含 `>` 行）
    };
    const closeOK = (i) => {
      const m = slines[i].match(CLOSE_RE);
      if (!m || m[1][0] !== open.ch || m[1].length < open.n) return false;
      if (open.ctx === 'top') return !quoted[i] && indents[i] <= 3;
      if (open.ctx === 'q') return quoted[i];
      return !quoted[i]; // list
    };
    for (let i = 0; i < lines.length; i++) {
      if (htmlMasked[i]) continue; // html 块内行全字面
      if (open) {
        if (!inCtx(i)) {
          fenceRanges.push([open.i, open.i]); // 孤 opener
          open = null;
        } else {
          if (closeOK(i)) { fenceRanges.push([open.i, i]); open = null; }
          continue;
        }
      }
      const m = slines[i].match(OPEN_RE);
      if (!m) continue;
      open = { i, ch: m[1][0], n: m[1].length,
        ctx: quoted[i] ? 'q' : listish[i] ? 'list' : 'top',
        floor: floors[i], qInList: listish[i] };
    }
    // 未闭合收尾：top→EOF；q/list→孤 opener decl。
    // 例外：opener 是末行且无尾换行→语法件不成节点（t51 实证），零 decl
    if (open && !(open.i === lines.length - 1 && !text.endsWith('\n')))
      fenceRanges.push(
        open.ctx === 'top' ? [open.i, lines.length - 1] : [open.i, open.i]);
  }
  const inFence = (i) => fenceRanges.some(([a, b]) => i > a && i < b);
  const isFenceToggle = (i) => fenceRanges.some(([a, b]) => i === a || i === b);
  // endLine 与 AST range.end 同约定：排他（指向节点后行首——node.text 含
  // 尾换行），regex 闭合行 i（0-idx）→ endLine=i+2 对齐
  for (const [a, b] of fenceRanges) {
    const info = (slines[a].match(/^\s{0,3}(?:```|~~~)\s*(\S*)/) ?? [])[1] ?? '';
    decl(info || 'fence', 'fence', a + 1,
      { info: info || undefined, endLine: b + 2 });
  }
  // 行内 code_span 不设跨块掩蔽——t11/t12 探针实证：`x `a\n\n# H\nb` c`
  // 与 `- `a\n\n# H\nb` c` 中 `# H` 均为真 heading——tree-sitter 块级
  // 重解析不受行内 span 约束，孤 `` ` `` 一律字面（xxe 实测 `#` 行
  // 皆住 fence/html_block 内非 span 内）
  const masked = (i) => inFm(i) || inFence(i) || isFenceToggle(i)
    || htmlMasked[i];
  // block_quote 首块：fm 之外、掩蔽之外的第一个 `>` 行（eff 面——
  // list 内 `- > x` 引用 AST 亦产 block_quote decl）
  for (let i = fmCloseIdx + 1; i < lines.length; i++) {
    if (masked(i)) continue;
    if (quoted[i]) {
      decl('blockquote-head', 'blockquote-head', i + 1); break;
    }
  }
  // headings + refdef（剥离面扫——AST 容器内节点同样产 decl）
  for (let i = 0; i < lines.length; i++) {
    if (masked(i)) continue;
    const l = slines[i];
    const h = l.match(/^\s{0,3}(#{1,6})(?:\s+|$)/);
    if (h) {
      // 名归一=atxTitle 同构：`^#{1,6}\s+` 锚定剥离行 pos0——顶层缩进
      // heading 记号保留在名内（`   ## X`→`## X`，组19 实证）；容器
      // （list/quote）内 `##` 在剥离行 pos0 故仍剥。闭合 # 尾剥、首尾 trim
      decl(l.replace(/^#{1,6}\s+/, '').replace(/\s+#+\s*$/, '').trim(),
        'section', i + 1, { depth: h[1].length, dialect: 'atx' });
      continue;
    }
    // setext：前一行是文本行的 `===`/`---` 下划线（单 `-`/`--` 亦合法）。
    // 裸 `-` 行会被 marker 剥离吃成空串——下划线判别回落原始行（组19实证：
    // `Single\n-` AST 判 setext 非空 bullet）
    const ul = slines[i].trim() ? slines[i] : lines[i];
    if (/^\s{0,3}(=+|-+)\s*$/.test(ul) && i > 0) {
      const prev = slines[i - 1];
      // 前行属 list 容器（marker/续行皆 listish）→ `---` 是 thematic_break
      // 非 setext——t40/t41 实证（listish 判定覆盖 marker 与裸缩进续行）
      const blocked = masked(i - 1) || listish[i - 1]
        || /^\s{0,3}(>|#|```|~~~|\[[^\]]*\]:|[-*+](?:\s|$)|\d+[.)](?:\s|$))/
          .test(prev)
        || !prev.trim();
      if (!blocked) {
        // setext_heading 节点=整个段落——名/行号取段首行（mcp-for-security
        // 徽章三连行+`---` 实证：AST 名=首行非末行）。回溯连续段落行：
        // 非空非掩蔽同容器且非块起始
        let t = i - 1;
        const BS = /^\s{0,3}(>|#|```|~~~|\[[^\]]*\]:|[-*+](?:\s|$)|\d+[.)](?:\s|$)|=+\s*$|-+\s*$)/;
        while (t > 0 && !masked(t - 1) && slines[t - 1].trim()
          && listish[t - 1] === listish[i - 1]
          && quoted[t - 1] === quoted[i - 1]
          && !BS.test(slines[t - 1])) t--;
        decl(slines[t].trim(), 'section', t + 1,
          { depth: ul.trim().startsWith('=') ? 1 : 2, dialect: 'setext' });
        continue;
      }
    }
    // refdef：`[label]: dest [title]`——dest 须非空白（可 <> 包裹），title
    // 仅 `'..'/".."/(..)' 三种合法包法；dest 后接裸词即整行非 refdef
    // （trailofbits `- [Trait]: Both high/low` 实证——AST 判为段落文本）
    const d = l.match(
      /^\s{0,3}\[([^\]]+)\]:\s*(?:<[^>\n]*>|\S+)(?:\s+("[^"\n]*"|'[^'\n]*'|\([^\)\n]*\)))?\s*$/);
    if (d) decl(d[1].trim(), 'refdef', i + 1);
  }
  return out;
}
