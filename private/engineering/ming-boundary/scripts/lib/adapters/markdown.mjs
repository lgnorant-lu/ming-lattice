// lib/adapters/markdown.mjs — 文档适配器（v1.1 协议层落地件）
// 产出三类事实：
//   1) file 事实的 extra.docrole —— 文档角色（facet，非独立 kind——分面纪律）
//   2) kind:docref 边 —— markdown [x](target) 链接（死链标 extra.dead）
//   3) mention 候选 —— code-span/heading 中的 `name(` 符号提及；
//      真正的 mention 边由 extract-facts 二遍过符号表解析后产出
// docrole 兜底链（容忍分层：定义式优先，启发式降级，默认 doc 兜底）：
//   frontmatter `docrole:` > 文件名 > 目录语义 > H1 关键词 > 'doc'
import path from 'node:path';
import { fact, baseName } from '../facts.mjs';

export const MD_EXTRACTOR = 'markdown@1';
export const MD_EXT = new Set(['.md', '.markdown', '.mdx']);

const ROLE_FILE = [
  [/^readme(\.|$)/i, 'readme'],
  [/^license|^copying|^notice/i, 'legal'],
  [/^changelog|^history/i, 'changelog'],
  [/^contributing/i, 'guide'],
  [/^todo/i, 'todo'],
  [/^adr[-_]?\d+/i, 'adr'],
  [/^claude\.md$|^agents\.md$/i, 'guide'],
];
const ROLE_PATH = [
  [/(^|\/)adr(s)?\//i, 'adr'],
  [/(^|\/)spec(ification)?s?\//i, 'spec'],
  [/(^|\/)api\//i, 'api'],
  [/(^|\/)guides?\//i, 'guide'],
  [/(^|\/)tutorials?\//i, 'guide'],
  [/(^|\/)audit(s)?\//i, 'audit'],
];
const ROLE_H1 = [
  [/接口|\bapi\b/i, 'api'],
  [/决策|\badr\b/i, 'adr'],
  [/规范|规约|standard|convention/i, 'spec'],
  [/待办|todo|backlog/i, 'todo'],
  [/架构|architecture|design/i, 'arch'],
];

// frontmatter 首块 ---\n ... --- 内 docrole: x
function fmRole(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const r = m[1].match(/^docrole:\s*([\w-]+)\s*$/m);
  return r ? r[1].toLowerCase() : null;
}

export function docRoleOf(rel, text) {
  const fm = fmRole(text);
  if (fm) return fm;
  const base = baseName(rel);
  for (const [re, role] of ROLE_FILE) if (re.test(base)) return role;
  for (const [re, role] of ROLE_PATH) if (re.test(rel + '/')) return role;
  const h1 = text.match(/^#\s+(.+)$/m);
  if (h1) for (const [re, role] of ROLE_H1) if (re.test(h1[1])) return role;
  return 'doc';
}

// docref 目标归一化：剥锚点、剥 <>、滤 scheme/mailto/纯锚；
// 相对 doc 目录解析为仓相对路径；目录目标保留尾斜杠
function docTarget(fromRel, raw) {
  let t = raw.trim();
  if (/^<(.+)>$/.test(t)) t = t.slice(1, -1).trim();
  if (!t || /^[a-z][a-z0-9+.-]*:/i.test(t) || t.startsWith('#')) return null;
  t = t.split('#')[0];
  if (!t) return null;
  t = t.replace(/\\/g, '/');
  if (t.startsWith('/')) return t.slice(1);
  return path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), t));
}

// 返回 {facts, docrole, mentionCands:[{name,line}]}——mention 候选由主流程二遍解析
export function mdFacts(root, rel, text, fileExists) {
  const facts = [];
  const cands = [];
  const docrole = docRoleOf(rel, text);
  const lines = text.split(/\r?\n/);
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*(```|~~~)/.test(l)) { inFence = !inFence; continue; }
    // 围栏代码块内不产 docref——CommonMark 语义块内容是字面文本；
    // [b(0x14)]() / [native code](注) 这类 JS/伪码语法撞形是实证噪音源
    if (inFence) continue;
    // docref 前先剥行内 code-span——`[x](y)` 在反引号里是语法示例不是引用
    // （mention 候选不从剥壳行取：code-span 恰是 mention 的信号源）
    const bare = l.replace(/`[^`\n]*`/g, '');
    // docref: [t](target)
    for (const m of bare.matchAll(/\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const to = docTarget(rel, m[2]);
      if (to === null) continue;
      const dead = !fileExists(to);
      facts.push(fact({ unit: rel, kind: 'docref', name: to,
        file: rel, line: i + 1, fidelity: 'regex-degraded',
        scope: dead ? 'unresolved' : 'repo', extractor: MD_EXTRACTOR,
        extra: { to, ...(dead ? { dead: true } : {}) } }));
    }
    // mention 候选：code-span `name(` 与 heading 内 name(（含连字符——ps1 Verb-Noun 命名）
    for (const m of l.matchAll(/`([A-Za-z_$][\w$-]*)\s*\(/g))
      cands.push({ name: m[1], line: i + 1 });
    const h = l.match(/^#{1,6}\s+/);
    if (h) for (const m of l.slice(h[0].length).matchAll(/\b([A-Za-z_$][\w$-]*)\s*\(/g))
      cands.push({ name: m[1], line: i + 1 });
  }
  return { facts, docrole, mentionCands: cands };
}
