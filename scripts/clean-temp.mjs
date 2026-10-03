#!/usr/bin/env node
// scripts/clean-temp.mjs — 命名域临时产物收割 CLI（tmp-reaper.mjs 前端）
// 用法: node scripts/clean-temp.mjs [--apply] [--root <dir>] [--age <ms|30m|24h|7d>]
//        [--budget <ms>] [--json] [--quiet]
// 默认 dry-run：列出将清理项不真删；--apply 才动手（mutation-safety 预览先行）。
// env: SKC_REAP_OFF=1 整体跳过（kill-switch）；SKC_TMP_ROOT 覆写默认 root。
// 内嵌调用先例：run-boundary 启动期 --apply --quiet --budget 2000。
// 退出码：0 正常（含 dry-run/截断报告）；1=apply 模式存在删除错误。

import os from 'node:os';
import { reapOnce, DEFAULT_RULES } from './lib/tmp-reaper.mjs';

function parseAge(s) {
  const m = String(s).match(/^(\d+(?:\.\d+)?)(ms|s|m|h|d)?$/);
  if (!m) return null;
  const mul = { ms: 1, s: 1e3, m: 60e3, h: 3600e3, d: 86400e3 }[m[2] ?? 'ms'];
  return m[1] * mul;
}

const a = { apply: false, root: null, age: null, budget: 10_000, json: false, quiet: false };
for (let i = 2; i < process.argv.length; i++) {
  const k = process.argv[i];
  const take = () => process.argv[++i] ?? die(`${k} 缺参数`, 2);
  if (k === '--apply') a.apply = true;
  else if (k === '--root') a.root = take();
  else if (k === '--age') { a.age = parseAge(take()); if (a.age == null) die('--age 解析失败', 2); }
  else if (k === '--budget') { a.budget = parseAge(take()); if (a.budget == null) die('--budget 解析失败', 2); }
  else if (k === '--json') a.json = true;
  else if (k === '--quiet') a.quiet = true;
  else die(`未知参数: ${k}`, 2);
}
function die(msg, code = 2) { console.error(`[clean-temp] ${msg}`); process.exit(code); }

if (process.env.SKC_REAP_OFF === '1') {
  if (!a.quiet) console.log('[clean-temp] SKC_REAP_OFF=1 —— 收割已禁用，跳过');
  process.exit(0);
}

const root = a.root ?? process.env.SKC_TMP_ROOT ?? os.tmpdir();
const rules = a.age != null
  ? DEFAULT_RULES.map(r => r.kind === 'cache' ? r : { ...r, maxAgeMs: a.age })
  : DEFAULT_RULES;

const rep = reapOnce({ root, rules, budgetMs: a.budget, apply: a.apply });

if (a.json) { console.log(JSON.stringify(rep, null, 2)); }
else if (!a.quiet) {
  const mode = a.apply ? 'apply' : 'dry-run';
  console.log(`[clean-temp] ${mode} root=${root} budget=${a.budget}ms`);
  console.log(`  matched=${rep.matched} reapable=${rep.reapable} deleted=${rep.deleted} ` +
    `keptYoung=${rep.keptYoung} errors=${rep.errors.length}` +
    `${rep.truncated ? ' [truncated: 预算耗尽]' : ''} (${rep.elapsedMs}ms)`);
  for (const e of rep.errors.slice(0, 10)) console.log(`  ERR ${e.file}: ${e.err}`);
  if (!a.apply && rep.reapable > 0)
    console.log('  dry-run——加 --apply 才真删');
}
process.exit(a.apply && rep.errors.length ? 1 : 0);
