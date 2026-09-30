#!/usr/bin/env node
// diff（内置目录件, outputs=report, phases=[ci,manual]）：事实面差分
// config.baseline=基线 facts.jsonl（仓根相对）——缺省即报错(fail-closed)
// argv: --facts F --root R --config JSON [--apply]
import fs from 'node:fs';
import path from 'node:path';
import { parseJsonl } from '../lib/facts.mjs';

const argv = process.argv;
const take = (k) => argv[argv.indexOf(k) + 1];
const root = path.resolve(take('--root'));
const cfg = JSON.parse(take('--config') || '{}');
const die = (m) => { console.error(`[diff] ${m}`); process.exit(2); };
if (!cfg.baseline) die('需要 config.baseline=<facts.jsonl>');
const basePath = path.resolve(root, cfg.baseline);
if (!basePath.startsWith(root + path.sep)) die(`baseline 越出仓根: ${cfg.baseline}`);
if (!fs.existsSync(basePath)) die(`baseline 不存在: ${cfg.baseline}`);

const sig = (f) => `${f.kind}|${f.unit}|${f.name || ''}|${f.extra?.to || ''}`;
const cur = new Map(), base = new Map();
for (const f of parseJsonl(fs.readFileSync(take('--facts'), 'utf8'))) cur.set(sig(f), f);
for (const f of parseJsonl(fs.readFileSync(basePath, 'utf8'))) base.set(sig(f), f);

const added = [], removed = [];
for (const [s, f] of cur) if (!base.has(s)) added.push(f);
for (const [s, f] of base) if (!cur.has(s)) removed.push(f);
const byKind = (arr) => {
  const m = new Map();
  for (const f of arr) m.set(f.kind, (m.get(f.kind) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, c]) => `${k}:${c}`).join(' ');
};
const show = (arr, n = 20) => arr.slice(0, n)
  .map(f => `    ${f.kind} ${f.unit}${f.extra?.to ? ' -> ' + f.extra.to : ''}`).join('\n');

console.log(`baseline=${cfg.baseline}  cur=${cur.size} base=${base.size}`);
console.log(`+added ${added.length}  [${byKind(added)}]`);
if (added.length) console.log(show(added));
console.log(`-removed ${removed.length}  [${byKind(removed)}]`);
if (removed.length) console.log(show(removed));
const pubDelta = added.filter(f => f.kind === 'decl' && f.extra?.surface === 'public');
if (pubDelta.length) {
  console.log(`\n公共面新增 decl（surface=public）: ${pubDelta.length}`);
  for (const f of pubDelta.slice(0, 15)) console.log(`    ${f.unit} :: ${f.name}`);
}
