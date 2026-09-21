// scripts/hooks/gates/toc.mjs
// 目录生成节对账门（fixable——节检测 → 形状校验 → 漂移 finding → fix 重写）
//
// 机制定位（GOVERNANCE-SPINE §生成节）：手主文件内的机属孤岛，内容 = 文档标题集的纯函数。
// 节边界契约（tocgen 惯例）：`## 目录` 起，到下个 `#{1,6}` 标题或行内 `---` 止（`---` 被消耗）。
// 形状契约：节体非空行必须全部是 `n. [text](#anchor)` 项或 `---`——混入散文视为手写内容，
//   warn 跳过不覆盖（所有权声明在标题，误标只导致节被重生成=自愈，无删除性风险）。
//
// 配置（全部支持 [glob] 分节逐文件覆盖）：
//   gate.toc.level        off|warn|error（默认 warn）
//   gate.toc.globs        域=硬边界（默认 *.md 全 md；分节只能域内调参不能拉域外文件进来）
//   gate.toc.exclude      额外排除（节内同键按"后写赢"整体替换，非累加——统一语义）
//   gate.toc.depth        收录最大标题级（默认 3；编号=全收集序，>depth 项占位跳号——tocgen 怪癖保留）
//   gate.toc.titles       目录节标题精确集（默认 目录,Table of Contents）
//   gate.toc.mode         section(默认，只刷已有壳) | insert(无壳文档 ≥minHeadings 时补插)
//   gate.toc.minHeadings  insert 模式门槛（默认 3）
//   gate.toc.slug         github(默认，锚精等 GitHub 渲染) | compat(tocgen 旧算法——对接存量语料)

import fs from 'node:fs';
import path from 'node:path';
import { matchAnyGlobs } from '../lib/matcher.mjs';

const ITEM_RE = /^\s*\d+\.\s+\[.*\]\(#.*\)\s*$/;
const HEADING_RE = /^(#{1,6})[ \t]+(.*?)[ \t]*$/;
const FENCE_RE = /^\s*```/;
const HR_RE = /^\s*---\s*$/;

// GitHub 渲染锚算法：小写 → 剥内联标签 → 剥非标点字符集外符号 → 空白折叠为 -
export function slugGithub(text) {
  return text.toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{N}\p{M}_\- ]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
}

// tocgen 兼容锚（旧语料对齐用）：小写 + 空格→- + '/' 剥除
export function slugCompat(text) {
  return text.toLowerCase().replace(/ /g, '-').replace(/\//g, '');
}

/**
 * 解析 markdown 文档 → {lines, headings, toc, dupToc, h1Idx}
 *   headings: 收集的标题 [{level,text,line}]（level>=2，目录标题自身不入列）
 *   toc:      首个目录节 {headIdx,title,body,endIdx}；body=节内原行（含尾部 --- 行）
 *   dupToc:   存在第二个目录标题（只管理首个，多余的告警不收集）
 *   h1Idx:    首个 H1 行号（insert 模式锚点）
 */
export function parseDoc(text, titles) {
  const lines = text.split('\n');
  const headings = [];
  let toc = null;
  let dupToc = false;
  let h1Idx = -1;
  let inFm = false;
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (i === 0 && HR_RE.test(l)) { inFm = true; continue; }
    if (inFm) { if (HR_RE.test(l)) inFm = false; continue; }
    if (FENCE_RE.test(l)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const m = l.match(HEADING_RE);
    if (!m) continue;
    const level = m[1].length;
    const htext = m[2].replace(/[ \t]+#+$/, '');
    if (titles.has(htext)) {
      if (toc) { dupToc = true; continue; }
      let end = i + 1;
      const body = [];
      while (end < lines.length) {
        const bl = lines[end];
        if (HEADING_RE.test(bl)) break;
        body.push(bl);
        end++;
        if (HR_RE.test(bl)) break;
      }
      toc = { headIdx: i, title: htext, body, endIdx: end };
      continue;
    }
    if (level === 1) { if (h1Idx < 0) h1Idx = i; continue; }
    headings.push({ level, text: htext, line: i });
  }
  return { lines, headings, toc, dupToc, h1Idx };
}

/** 生成目录项（编号=收集序 i+1，>depth 项占位跳号——tocgen 怪癖保留） */
export function generateItems(headings, depth, slugger) {
  const out = [];
  for (let i = 0; i < headings.length; i++) {
    const h = headings[i];
    if (h.level > depth) continue;
    out.push(`${'  '.repeat(h.level - 2)}${i + 1}. [${h.text}](#${slugger(h.text)})`);
  }
  return out;
}

/** 节体形状校验：非空行只允许目录项或 ---（混入散文=手写内容，不覆盖） */
export function shapeOk(body) {
  return body.every(l => !l.trim() || ITEM_RE.test(l) || HR_RE.test(l));
}

const currentItems = body => body.filter(l => ITEM_RE.test(l));

function gateParams(ctx, p) {
  const cfg = ctx.gateConfigFor ? ctx.gateConfigFor(p) : (ctx.gateConfig ?? {});
  return {
    off: cfg.level === 'off',
    excluded: cfg.exclude ? matchAnyGlobs(p, cfg.exclude.split(',').map(s => s.trim()).filter(Boolean)) : false,
    titles: new Set((cfg.titles ?? '目录,Table of Contents').split(',').map(s => s.trim()).filter(Boolean)),
    depth: parseInt(cfg.depth ?? '3', 10) || 3,
    mode: cfg.mode ?? 'section',
    minHeadings: parseInt(cfg.minHeadings ?? '3', 10) || 3,
    slugger: (cfg.slug ?? 'github') === 'compat' ? slugCompat : slugGithub,
  };
}

export const gate = {
  id: 'toc',
  stages: ['pre-commit'],
  family: 'gate',
  defaultLevel: 'warn',
  fixable: true,
  globs: ['*.md'],
  exclude: [], // 仓专排除走 gate.toc.exclude 配置（如 vertical/**,base/**）——默认值须仓中性
  async run(ctx) {
    const findings = [];
    for (const p of ctx.files) {
      const cfg = gateParams(ctx, p);
      if (cfg.off || cfg.excluded) continue;
      let text;
      try { text = ctx.read(p); } catch { continue; }
      const doc = parseDoc(text, cfg.titles);
      if (doc.dupToc) {
        findings.push({ gate: 'toc', file: p, matchText: 'toc-duplicate', message: `${p}: 存在多个目录节——仅管理首个，其余请手工处理` });
      }
      if (doc.toc) {
        if (!shapeOk(doc.toc.body)) {
          findings.push({ gate: 'toc', file: p, line: doc.toc.headIdx + 1, matchText: 'toc-shape', message: `${p}: "## ${doc.toc.title}" 节含非生成形内容——视为手写，跳过不覆盖` });
          continue;
        }
        const items = generateItems(doc.headings, cfg.depth, cfg.slugger);
        const cur = currentItems(doc.toc.body);
        if (JSON.stringify(cur) !== JSON.stringify(items)) {
          findings.push({ gate: 'toc', file: p, line: doc.toc.headIdx + 1, matchText: 'toc-drift', message: `${p}: "## ${doc.toc.title}" 过期（现 ${cur.length} 项 → 应 ${items.length} 项；可 run fix 自愈）` });
        }
      } else if (cfg.mode === 'insert' && doc.headings.length >= cfg.minHeadings) {
        findings.push({ gate: 'toc', file: p, matchText: 'toc-missing', message: `${p}: ${doc.headings.length} 个标题无目录节（可 run fix 插入）` });
      }
    }
    return findings;
  },
  // 工作区修复（run fix 专用；ctx.read 走工作区源）——重写节体或 H1 后插壳
  async fix(ctx) {
    const fixed = [];
    for (const p of ctx.files) {
      const cfg = gateParams(ctx, p);
      if (cfg.off || cfg.excluded) continue;
      const abs = path.join(ctx.root, p);
      let text;
      try { text = fs.readFileSync(abs, 'utf8'); } catch { continue; }
      const doc = parseDoc(text, cfg.titles);
      const items = generateItems(doc.headings, cfg.depth, cfg.slugger);
      if (!items.length) continue;
      let out = null;
      if (doc.toc) {
        if (!shapeOk(doc.toc.body)) continue;                       // 手写节不碰
        if (JSON.stringify(currentItems(doc.toc.body)) === JSON.stringify(items)) continue;
        const before = doc.lines.slice(0, doc.toc.headIdx + 1);     // 含 `## 目录` 行（verbatim）
        const after = doc.lines.slice(doc.toc.endIdx);
        while (after.length && !after[0].trim()) after.shift();     // 吞旧分隔空行，统一补一行
        out = [...before, ...items, '', '---', '', ...after].join('\n');
      } else if (cfg.mode === 'insert' && doc.h1Idx >= 0 && doc.headings.length >= cfg.minHeadings) {
        const rest = doc.lines.slice(doc.h1Idx + 1);
        const sep = rest.length && rest[0].trim() ? [''] : [];
        out = [...doc.lines.slice(0, doc.h1Idx + 1), '', '## 目录', ...items, '', '---', ...sep, ...rest].join('\n');
      }
      if (out === null || out === text) continue;
      if (!out.endsWith('\n')) out += '\n';
      if (!ctx.dryRun) fs.writeFileSync(abs, out);
      fixed.push(p);
    }
    return fixed;
  },
};
