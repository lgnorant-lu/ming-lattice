// scripts/gardener-trend.mjs
// gardener 趋势探针——telemetry 事件文件上"坏方向"指标序列的新高检测。
// 定位: informational 哨兵非门（默认 exit 0；--strict 时新高即 exit 1 可入 CI）。
// 判据: 序列取最近 --window 点，latest > max(previous) = 新高（味道在爬的最早信号）。
// 事件源解析序: --event-file > $MING_SKILLS_EVENT_FILE > 仓默认 .ming/lattice/state/operational-events.jsonl
// absence 语义: 无事件文件/序列空 = absence evidence（证明覆盖面而非漏扫），如实报告。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_EVENT_FILE = path.join(ROOT, '.ming', 'lattice', 'state', 'operational-events.jsonl');

// 坏方向序列表：value 升=味道在爬。info_count/linked_count 等良性指标不入表。
const SERIES = [
  { event: 'lint.checked', field: 'warn_count', label: 'lint.warn' },
  { event: 'lint.checked', field: 'error_count', label: 'lint.error' },
  { event: 'test.suite_finished', field: 'failed_suites', label: 'test.failed' },
  { event: 'test.suite_finished', field: 'skipped_suites', label: 'test.skipped' },
];

export function readEvents(file) {
  const events = [];
  let malformed = 0;
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return { events, malformed, missing: true }; }
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try { events.push(JSON.parse(line)); } catch { malformed++; }
  }
  return { events, malformed, missing: false };
}

export function extractSeries(events, eventName, field) {
  return events
    .filter(e => e?.event === eventName && Number.isInteger(e[field]))
    .map(e => ({ at: e.at ?? null, value: e[field] }));
}

export function analyzeSeries(points, window) {
  const tail = points.slice(-window);
  if (tail.length === 0) return { status: 'absence', points: 0 };
  if (tail.length === 1) return { status: 'baseline', latest: tail[0].value, points: 1 };
  const prev = tail.slice(0, -1);
  const prevMax = Math.max(...prev.map(p => p.value));
  const latest = tail[tail.length - 1].value;
  return {
    status: latest > prevMax ? 'new-high' : 'flat',
    latest, prevMax, points: tail.length,
  };
}

export function analyze(events, { window = 8 } = {}) {
  return SERIES.map(s => ({ ...s, ...analyzeSeries(extractSeries(events, s.event, s.field), window) }));
}

export function formatReport(results, { window }) {
  const lines = [`[gardener] window=${window} 坏方向序列新高检测:`];
  for (const r of results) {
    if (r.status === 'absence') lines.push(`  ${r.label}: absence（无数据点）`);
    else if (r.status === 'baseline') lines.push(`  ${r.label}: baseline=${r.latest}（首点，暂无趋势可判）`);
    else if (r.status === 'new-high') lines.push(`  ${r.label}: ${r.latest} > prev_max=${r.prevMax} → NEW HIGH ↑（n=${r.points}）`);
    else lines.push(`  ${r.label}: latest=${r.latest} prev_max=${r.prevMax} flat（n=${r.points}）`);
  }
  return lines.join('\n');
}

export function runCli(argv = process.argv.slice(2), env = process.env) {
  let eventFile = env.MING_SKILLS_EVENT_FILE || DEFAULT_EVENT_FILE;
  let window = 8;
  let strict = false;
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--event-file') eventFile = argv[++i];
    else if (a === '--window') window = Number(argv[++i]);
    else if (a === '--strict') strict = true;
    else if (a === '--json') json = true;
    else { console.error(`usage: node scripts/gardener-trend.mjs [--event-file <f>] [--window <n>] [--strict] [--json]`); return 2; }
  }
  if (!Number.isInteger(window) || window < 2) { console.error('--window 须为 ≥2 整数'); return 2; }

  const { events, malformed, missing } = readEvents(eventFile);
  const results = analyze(events, { window });
  const newHighs = results.filter(r => r.status === 'new-high');

  if (json) {
    console.log(JSON.stringify({ eventFile, window, events: events.length, malformed, missing, newHighs: newHighs.map(r => r.label), results }, null, 2));
  } else {
    if (missing) console.log(`[gardener] absence: 事件文件缺席 ${eventFile}（telemetry sink 未配置——零样本非零味道）`);
    else console.log(`[gardener] events=${events.length}${malformed ? ` malformed=${malformed}` : ''}`);
    console.log(formatReport(results, { window }));
    if (newHighs.length) console.log(`[gardener] 新高 ${newHighs.length} 项——建议跑 review-signal-audit 位错审计定位爬升源`);
  }
  return strict && newHighs.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli();
}
