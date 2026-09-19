// eval-embeddings.mjs — S4 嵌入层召回基线评估（ADR-0007，离线，不入运行时）
// 用法: node tools/embeddings/eval-embeddings.mjs [--k 5] [--model <id>]
// 度量: candidates recall@k —— 期望技能是否进嵌入 top-k；与词法层逐例对比
// 立场: 本脚本只产出证据（嵌入召回率/分数分布），不改路由行为
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline, env } from '@huggingface/transformers';
import { Decide } from '../../scripts/route-core.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'config/router-manifest.json'), 'utf8'));
const artifact = JSON.parse(fs.readFileSync(path.join(root, 'config/router-embeddings.json'), 'utf8'));

const mi = process.argv.indexOf('--model');
const MODEL = mi >= 0 ? process.argv[mi + 1] : artifact.model;
const ki = process.argv.indexOf('--k');
const K = ki >= 0 ? +process.argv[ki + 1] : 5;

env.cacheDir = path.join(here, '.cache');
env.allowLocalModels = true;
env.remoteHost = process.env.HF_ENDPOINT || 'https://hf-mirror.com';

const corpusDir = path.join(root, 'tests/evals/recall-corpus');
const cases = fs.readdirSync(corpusDir).filter(f => f.endsWith('.jsonl')).sort()
  .flatMap(f => fs.readFileSync(path.join(corpusDir, f), 'utf8').split('\n')
    .filter(l => l.trim()).map(l => JSON.parse(l)));

const cosine = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
const names = Object.keys(artifact.vectors);
const mat = names.map(n => artifact.vectors[n]);

const extractor = await pipeline('feature-extraction', MODEL, { dtype: 'q8' });
const embed = async t => Array.from((await extractor(t, { pooling: 'mean', normalize: true })).data);

console.log(`\n=== embedding recall@${K}: ${cases.length} cases (model=${MODEL.split('/').pop()}) ===`);
const rows = [];
for (const c of cases) {
  const qv = await embed(c.query);
  const ranked = names.map((n, i) => ({ skill: n, cos: cosine(qv, mat[i]) }))
    .sort((x, y) => y.cos - x.cos);
  const top = ranked.slice(0, K);
  const wants = [...(c.expect.skills || []), ...(c.expect.anySkills || [])];
  const d = Decide(c.query, manifest); // 词法层+关键词现状做对照
  const kwHit = !wants.length || wants.some(s => d.candidates.includes(s) || d.active_recipe.skills?.includes(s));
  const embHit = !wants.length || wants.some(s => top.some(t => t.skill === s));
  rows.push({ id: c.id, tier: c.tier, lang: c.lang, wants, top: top[0], embHit, kwHit, inTop: top.map(t => t.skill) });
}

const by = key => {
  const g = {};
  for (const r of rows) (g[r[key]] ||= []).push(r);
  return Object.fromEntries(Object.entries(g).map(([k, v]) => [k, {
    emb: `${v.filter(r => r.embHit).length}/${v.length}`,
    kw: `${v.filter(r => r.kwHit).length}/${v.length}`,
    either: `${v.filter(r => r.embHit || r.kwHit).length}/${v.length}`,
  }]));
};
console.log('emb-recall :', `${rows.filter(r => r.embHit).length}/${rows.length}`);
console.log('kw -recall :', `${rows.filter(r => r.kwHit).length}/${rows.length}`);
console.log('either     :', `${rows.filter(r => r.embHit || r.kwHit).length}/${rows.length}`);
console.log('by tier    :', JSON.stringify(by('tier'), null, 0));
console.log('by lang    :', JSON.stringify(by('lang'), null, 0));

const embOnly = rows.filter(r => r.embHit && !r.kwHit);
const kwOnly = rows.filter(r => !r.embHit && r.kwHit);
console.log(`\nemb-only 命中（嵌入补回的漏）: ${embOnly.map(r => r.id).join(', ') || '无'}`);
console.log(`kw-only  命中（词法强嵌入弱）: ${kwOnly.map(r => r.id).join(', ') || '无'}`);
console.log('\ntop1 分数分布（OOS 可分性证据）:');
for (const t of ['A', 'B', 'C']) {
  const ts = rows.filter(r => r.tier === t).map(r => r.top.cos).sort((a, b) => b - a);
  if (ts.length) console.log(`  ${t}: max=${ts[0].toFixed(3)} med=${ts[Math.floor(ts.length / 2)].toFixed(3)} min=${ts[ts.length - 1].toFixed(3)}`);
}
const detail = process.argv.includes('--detail');
if (detail) for (const r of rows.filter(r => !r.embHit && r.wants.length))
  console.log(`  MISS ${r.id}: want=${r.wants.join('/')} got-top=${r.top.skill}@${r.top.cos.toFixed(3)} top5=${r.inTop.join(',')}`);
