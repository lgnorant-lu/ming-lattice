// scripts/hooks/lib/baseline.mjs
// 违规基线冻结（detect-secrets .secrets.baseline 思想泛化）
//   身份 = sha1(gate|file|sha1(matchText)) —— 行号不入身份（行漂移不产生假新增）
//   无 matchText 的门（large-file 等文件属性门）退化为 sha1(gate|file)
//   同文件同内容多处命中坍缩为同一"违规族"（写明语义）
//   git mv 改名 → 旧条目失效为新增 → 重跑 baseline 再冻结
//   存 hash 不存明文——baseline 文件可入仓不泄密

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const BASELINE_VERSION = 1;

export function findingId(finding) {
  const h = createHash('sha1');
  h.update(`${finding.gate}|${finding.file}|`);
  if (finding.matchText !== undefined) {
    h.update(createHash('sha1').update(String(finding.matchText)).digest('hex'));
  }
  return h.digest('hex');
}

export function baselinePath(root, cfg) {
  const rel = cfg?.flat?.['baseline.path'] ?? '.hooks-baseline.json';
  return path.resolve(root, rel);
}

export function loadBaseline(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return new Set((data.findings ?? []).map(f => f.id));
  } catch {
    return null;
  }
}

/**
 * 过滤出新增违规（baseline 不存在时全部视为新增）
 */
export function freshFindings(findings, baselineSet) {
  if (!baselineSet) return findings.map(f => ({ ...f, id: findingId(f), fresh: true }));
  return findings
    .map(f => ({ ...f, id: findingId(f) }))
    .map(f => ({ ...f, fresh: !baselineSet.has(f.id) }));
}

/**
 * 写基线：快照当前全部命中（稳定排序，利于 diff/合并）
 */
export function writeBaseline(filePath, findings) {
  const rows = findings
    .map(f => ({ id: findingId(f), gate: f.gate, file: f.file, ...(f.line ? { line: f.line } : {}) }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const doc = {
    version: BASELINE_VERSION,
    note: '既有违规冻结档——引擎只对新违规报错。更新：node scripts/hooks/engine.mjs baseline',
    findings: rows,
  };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(doc, null, 2) + '\n');
  return rows.length;
}
