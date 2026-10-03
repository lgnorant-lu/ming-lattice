// lib/proposal-schema.mjs — _proposals 提案 schema 唯一事实源
// 消费方: check-index.mjs（格式门+report）与 prop.mjs（new/check/report/register）
// ——词表/解析/门函数只在此定义一次，防"手抄第二字段表"漂移。
import fs from 'node:fs';
import path from 'node:path';

// 生命周期词表与门契约：references/proposals.md §2
export const PROP_STATUSES = new Set(['pending', 'landed', 'rejected']);
export const PROP_TYPES = new Set(['promotion', 'field-feedback', 'package-iteration', 'new-package', 'policy-decision']);
export const PROP_AGING_DAYS = 30;   // pending 复审阈值（§3 aging）
export const DATE_SLUG_RE = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// ── frontmatter 抽取（字段+span 主权；值=标量单行，行内注释剥离） ──
export function frontmatterBody(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return m ? m[1] : null;
}
export function pickScalar(body, key) {
  const f = body.match(new RegExp(`^${key}:\\s*(.+?)\\s*$`, 'm'));
  return f && f[1].replace(/^"(.*)"$/, '$1').replace(/\s+#.*$/, '');
}
export function pickList(body, key) {
  const f = body.match(new RegExp(`^${key}:\\s*\\[(.*?)\\]\\s*$`, 'm'));
  return f ? f[1].split(',').map(s => s.trim()).filter(Boolean) : null;
}
// distill 条目+提案共用的 8 键投影（check-index 原 pick 集，语义不变）
export function parseFmText(text) {
  const body = frontmatterBody(text);
  if (body === null) return null;
  return { id: pickScalar(body, 'id'), status: pickScalar(body, 'status'),
    supersedes: pickScalar(body, 'supersedes'), revision: pickScalar(body, 'revision'),
    updatedAt: pickScalar(body, 'updatedAt'), type: pickScalar(body, 'type'),
    reviewAfter: pickScalar(body, 'reviewAfter'), openedAt: pickScalar(body, 'openedAt') };
}
export function parseFmFile(file) {
  return parseFmText(fs.readFileSync(file, 'utf8'));
}

// ── 提案格式门（_proposals 单文件判定，check-index §proposals 同源） ──
// label=人读标签（如 `_proposals/<f>`） stem=文件名去 .md today=YYYY-MM-DD
export function gateProposal(label, stem, fm, today) {
  const issues = [];
  if (!fm) {
    issues.push({ level: 'E', msg: `${label}: 无 frontmatter（提案须有 id/target/type/status 字段块）` });
    return issues;
  }
  if (fm.id && fm.id !== stem)
    issues.push({ level: 'E', msg: `${label}: frontmatter id 与文件名不一致（${fm.id}）` });
  if (!fm.status)
    issues.push({ level: 'E', msg: `${label}: 缺 status 字段` });
  else if (!PROP_STATUSES.has(fm.status))
    issues.push({ level: 'E', msg: `${label}: status 越出闭集: ${fm.status}（pending|landed|rejected）` });
  if (fm.type && !PROP_TYPES.has(fm.type))
    issues.push({ level: 'E', msg: `${label}: type 越出闭集: ${fm.type}` });
  // pending 老化提醒（reviewAfter 日期形态才可比；P30D 类时长形态跳过）
  if (fm.status === 'pending' && fm.reviewAfter && /^\d{4}-\d{2}-\d{2}$/.test(fm.reviewAfter) && fm.reviewAfter < today)
    issues.push({ level: 'W', msg: `${label}: pending 已过 reviewAfter=${fm.reviewAfter}——候审超期应复审（存续/撤回/升格）` });
  return issues;
}

// ── 候审队列浮出（report/register 共用数据源） ──
// 返回 {rows, pending}——pending 在前按距 reviewAfter 天数升序，landed/rejected 殿后。
export function queueRows(propDir, todayMs = Date.parse(new Date().toISOString().slice(0, 10))) {
  const rows = [];
  if (!fs.existsSync(propDir)) return { rows, pending: 0 };
  for (const f of fs.readdirSync(propDir)) {
    if (!f.endsWith('.md')) continue;
    const fm = parseFmFile(path.join(propDir, f)) || {};
    const days = (fm.reviewAfter && /^\d{4}-\d{2}-\d{2}$/.test(fm.reviewAfter))
      ? Math.round((Date.parse(fm.reviewAfter) - todayMs) / 86400000) : null;
    rows.push({ id: fm.id || f.replace(/\.md$/, ''), status: fm.status || '?',
      openedAt: fm.openedAt || '-', reviewAfter: fm.reviewAfter || '-', days });
  }
  rows.sort((a, b) => {
    const pa = a.status === 'pending' ? 0 : 1;
    const pb = b.status === 'pending' ? 0 : 1;
    if (pa !== pb) return pa - pb;
    if (a.days === null && b.days === null) return a.id.localeCompare(b.id);
    if (a.days === null) return 1;
    if (b.days === null) return -1;
    return a.days - b.days;
  });
  return { rows, pending: rows.filter(r => r.status === 'pending').length };
}
