// sh.mjs — Bash/sh 语言描述符（第三入场语言，v1.4）
// 准入闸实证：消费方=宿主仓脚本面审计——skills-collection 契约面 21 件
//   sh 族文件、IV8 契约面 scripts/*.sh 2 件；边面=source/. 引入与死链，
//   正是 hooks/脚本供应链审计需要的图面（user 2026-09-30 显式入场令）。
// 上游状态：tree-sitter-bash 无 queries/tags.scm（已证）→ decl 词表手写，
//   登记上游缺席；linguist Shell 覆盖 .sh/.bash/.zsh 等十余种——本描述符
//   保守收 .sh/.bash（其余形态待消费方再扩）。
//
// 边语义（手写——上游无对应物）：
//   `source x` / `. x` → import 边，mechanism=sh-source
//   解析顺序：相对当前文件目录；扩展探测 .sh→.bash→裸名
//   `x`/`./x`/`../x` 解析到仓内文件 → scope=module
//   绝对路径 / 以 ~ 开头 → scope=external（仓外主张不判死）
//   含 $VAR/`$( )`/反引号 动态片段 → scope=unresolved +
//     mechanism=sh-source-computed（不可静态判死——与 js dynamic-computed
//     同构，unresolved≠dead）
//   仓内相对形态解析落空 → scope=unresolved + extra.dead=true
//     （source 的目标是运行期硬依赖——死链语义与 import 同级）
//
// decl：function_definition（foo(){}/function foo{}）→ shape=fn；
//   declaration_command（export/readonly/declare/typeset NAME=…）→ const；
//   顶层 variable_assignment NAME=… → const（不嵌于 decl_cmd 才收，
//   export X= 防双发经 ast-grep not.inside 排除）。
//
// 诚实缺席（文档化不实现）：
//   `bash x.sh`/`sh x.sh` 子进程调用不产边（语义≠source 并入，误并入会
//   污染 import 集）——如需审计走 command 名单族另立 kind；
//   无扩展名的 .githooks/* 钩件不属 exts 触发面（walk 按扩展名分派）；
//   heredoc 内文/命令替换内嵌 source 不解析（嵌套词法面留给 precise）。
import fs from 'node:fs';
import path from 'node:path';
import { fact } from '../facts.mjs';

export const exts = new Set(['.sh', '.bash']);

export const rules = `
id: sh-source
language: Bash
rule:
  kind: command
  has:
    field: name
    regex: '^(source|\\.)$'
---
id: sh-fn
language: Bash
rule:
  kind: function_definition
---
id: sh-decl-cmd
language: Bash
rule:
  kind: declaration_command
---
id: sh-assign
language: Bash
rule:
  kind: variable_assignment
  not:
    inside:
      kind: declaration_command
`;

export function prepare() { return {}; }

const SH_IDS = new Set(['sh-source', 'sh-fn', 'sh-decl-cmd', 'sh-assign']);
export const handles = (id) => SH_IDS.has(id);

// ---------- 边解析 ----------
const DYNAMIC = /[$`]|~\//;

// 返回 {to, scope, dead, mech}
function resolveSource(root, relDir, arg) {
  if (/^~|^\/|^[A-Za-z]:[\\/]/.test(arg))
    return { to: arg, scope: 'external', dead: false, mech: 'sh-source' };
  if (DYNAMIC.test(arg))
    return { to: null, scope: 'unresolved', dead: false, mech: 'sh-source-computed' };
  const base = path.posix.normalize(path.posix.join(relDir, arg));
  for (const cand of [base, base + '.sh', base + '.bash']) {
    if (fs.existsSync(path.join(root, cand)))
      return { to: cand, scope: 'module', dead: false, mech: 'sh-source' };
  }
  return { to: base, scope: 'unresolved', dead: true, mech: 'sh-source' };
}

function pushSource({ root, rel, extractor, out }, rawArg, line, fidelity) {
  const arg = rawArg.trim().replace(/^["']|["']$/g, '');
  const r = resolveSource(root, path.posix.dirname(rel), arg);
  out.push(fact({ unit: rel, kind: 'import', name: arg, file: rel, line,
    fidelity, scope: r.scope, extractor,
    extra: { to: r.to, mechanism: r.mech,
      ...(r.dead ? { dead: true } : {}),
      ...(r.scope === 'external' ? { external: true } : {}) } }));
  return true;
}

// command 文本解析：name 词 + 首个参数词（引号串整取）
function cmdParts(text) {
  const m = /^\s*([^\s]+)\s*(.*)$/s.exec(text);
  if (!m) return null;
  const rest = m[2].trim();
  let arg = '';
  const q = /^(['"])(.*?)\1/.exec(rest);
  if (q) arg = q[0];
  else { const w = /^[^\s;|>&<]+/.exec(rest); if (w) arg = w[0]; }
  return { name: m[1], arg };
}

function decl(out, rel, line, extractor, fidelity, name, shape, surface) {
  out.push(fact({ unit: `${rel}#${name}`, kind: 'decl', name, file: rel,
    line, fidelity, scope: 'file-local', extractor,
    extra: { shape, surface } }));
}

export function handle(id, m, ctx) {
  const line = m.range.start.line + 1;
  if (id === 'sh-source') {
    const p = cmdParts(m.text);
    if (!p || !p.arg) return true; // 无参 source——不构成边
    return pushSource({ ...ctx }, p.arg, line, 'syntactic');
  }
  if (id === 'sh-fn') {
    const name = (/(?:function\s+)?([A-Za-z_][\w.-]*)\s*\(\s*\)/.exec(m.text) || [])[1] || '?';
    decl(ctx.out, ctx.rel, line, ctx.extractor, 'syntactic', name, 'fn', 'public');
    return true;
  }
  // sh-decl-cmd / sh-assign：export|readonly|declare|typeset|local NAME= 或裸 NAME=
  const name = (/\b(?:export|readonly|declare|typeset|local)?\s*([A-Za-z_]\w*)=/.exec(m.text) || [])[1];
  if (!name) return true;
  decl(ctx.out, ctx.rel, line, ctx.extractor, 'syntactic', name, 'const',
    /^\s*export\b/.test(m.text) ? 'public' : 'internal');
  return true;
}

// ---------- regex 降级路径（同构：同 mechanism/scope/dead 语义） ----------
const RX_SOURCE = /^\s*(?:source|\.)\s+((['"])[^'"]*\2|\S+)/gm;
const RX_FN = /^\s*(?:function\s+)?([A-Za-z_][\w.-]*)\s*\(\s*\)/gm;
const RX_DECL = /^\s*(export|readonly|declare|typeset)\s+([A-Za-z_]\w*)=/gm;
const RX_ASSIGN = /^([A-Za-z_]\w*)=/gm;

export function regexFacts(root, rel, extractor) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return [];
  const text = fs.readFileSync(p, 'utf8');
  const out = [];
  const ctx = { root, rel, extractor, out };
  const lineOf = (idx) => text.slice(0, idx).split('\n').length;
  for (const m of text.matchAll(RX_SOURCE))
    pushSource(ctx, m[1], lineOf(m.index), 'regex-degraded');
  for (const m of text.matchAll(RX_FN))
    decl(out, rel, lineOf(m.index), extractor, 'regex-degraded', m[1], 'fn', 'public');
  for (const re of [RX_DECL, RX_ASSIGN]) {
    for (const m of text.matchAll(re)) {
      const name = m[2] ?? m[1];
      if (out.some((f) => f.kind === 'decl' && f.name === name)) continue;
      decl(out, rel, lineOf(m.index), extractor, 'regex-degraded', name,
        'const', re === RX_DECL && m[1] === 'export' ? 'public' : 'internal');
    }
  }
  return out;
}
