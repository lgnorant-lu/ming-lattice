// eval-recall.mjs — 召回评估 harness（ADR-0007 三层数据集）
// 用法：
//   node tests/evals/eval-recall.mjs              报告模式：打分层指标，不 gate
//   node tests/evals/eval-recall.mjs --gate       回归门：baseline pass→fail 即退出码 1
//   node tests/evals/eval-recall.mjs --update     人审后更新 baseline 快照（进 git diff 审阅）
// 语料：tests/evals/recall-corpus/*.jsonl，schema 见 ADR-0007 §5
// 标注铁律：expect 由人审填写，禁止用路由器输出自动回填。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Decide } from '../../scripts/route-core.mjs';

const dir = new URL('./recall-corpus/', import.meta.url);
const baselinePath = new URL('./recall-baseline.json', import.meta.url);
const manifest = JSON.parse(fs.readFileSync(new URL('../../config/router-manifest.json', import.meta.url), 'utf8'));

const cases = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl')).sort()
  .flatMap(f => fs.readFileSync(new URL(f, dir), 'utf8').split('\n')
    .filter(l => l.trim()).map(l => JSON.parse(l)));

function checkCase(c) {
  const d = Decide(c.query, manifest);
  const fails = [];
  if (c.expect.domain !== undefined && d.domain !== c.expect.domain)
    fails.push(`domain=${d.domain}≠${c.expect.domain}`);
  if (c.expect.action !== undefined && d.action !== c.expect.action)
    fails.push(`action=${d.action}≠${c.expect.action}`);
  for (const s of c.expect.skills || []) {
    if (!d.candidates.includes(s) && !d.active_recipe.skills.includes(s))
      fails.push(`miss:${s}`);
  }
  return { pass: fails.length === 0, fails, decision: { domain: d.domain, action: d.action } };
}

const results = cases.map(c => ({ id: c.id, tier: c.tier, lang: c.lang, ...checkCase(c) }));
const by = key => {
  const groups = {};
  for (const r of results) (groups[r[key]] ||= []).push(r);
  return Object.fromEntries(Object.entries(groups)
    .map(([k, v]) => [k, `${v.filter(r => r.pass).length}/${v.length}`]));
};

console.log(`\n=== recall-eval: ${results.length} cases ===`);
console.log('overall :', `${results.filter(r => r.pass).length}/${results.length}`);
console.log('by tier :', JSON.stringify(by('tier')));
console.log('by lang :', JSON.stringify(by('lang')));

const update = process.argv.includes('--update');
const gate = process.argv.includes('--gate');
const baseline = fs.existsSync(baselinePath)
  ? JSON.parse(fs.readFileSync(baselinePath, 'utf8')) : null;

if (update) {
  const snapshot = { generatedAt: new Date().toISOString(), results: Object.fromEntries(results.map(r => [r.id, r.pass])) };
  fs.writeFileSync(baselinePath, JSON.stringify(snapshot, null, 2) + '\n');
  console.log(`baseline updated: ${results.length} cases`);
} else if (baseline) {
  const regressions = results.filter(r => baseline.results[r.id] === true && !r.pass);
  const fixed = results.filter(r => baseline.results[r.id] === false && r.pass);
  const knownMiss = results.filter(r => baseline.results[r.id] === false && !r.pass);
  const added = results.filter(r => !(r.id in baseline.results));
  console.log(`vs baseline: regressions=${regressions.length} fixed=${fixed.length} known-miss=${knownMiss.length} new=${added.length}`);
  if (regressions.length) console.log('  REGRESSED:', regressions.map(r => r.id).join(', '));
  if (fixed.length) console.log('  FIXED    :', fixed.map(r => r.id).join(', '));
  if (knownMiss.length) console.log('  KNOWN-MISS:', knownMiss.map(r => r.id).join(', '));
  if (gate && regressions.length) process.exit(1);
} else if (gate) {
  console.log('[FAIL] no baseline — run with --update after human review');
  process.exit(1);
}
if (!gate && !update) {
  const misses = results.filter(r => !r.pass);
  if (misses.length) console.log('misses:', misses.map(r => `${r.id}(${r.fails.join(';')})`).join(', '));
}
