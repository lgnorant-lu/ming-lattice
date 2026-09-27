// 基线 Decide() 在任意 jsonl 语料上的判定 dump —— 与 replay.py 输出对齐便于对照
// 用法: node baseline-decide.mjs <corpus.jsonl> [out.jsonl]
import fs from 'node:fs';
import { Decide } from '../../scripts/route-core.mjs';

const [corpus, out] = process.argv.slice(2);
const manifest = JSON.parse(fs.readFileSync(new URL('../../config/router-manifest.json', import.meta.url), 'utf8'));
const lines = fs.readFileSync(corpus, 'utf8').split('\n').filter(Boolean);

const rows = lines.map(l => {
  const c = JSON.parse(l);
  const d = Decide(c.query, manifest);
  const exp = c.expect || {};
  const oos = exp.domain === 'none' || exp.action === 'handoff';
  const cands = [...(d.candidates || []), ...(d.active_recipe?.skills || [])];
  const want = [...(exp.skills || []), ...(exp.anySkills || [])];
  return {
    id: c.id, oos,
    domain: d.domain, action: d.action, confidence: d.confidence,
    cands, want,
    hit_any: want.length ? want.some(s => cands.includes(s)) : null,
    hit_all: exp.skills?.length ? exp.skills.every(s => cands.includes(s)) : null,
    abstain_ok: oos ? (!cands.length || d.action === 'handoff') : null,
  };
});

for (const r of rows) console.log(JSON.stringify(r));
if (out) fs.writeFileSync(out, rows.map(r => JSON.stringify(r)).join('\n') + '\n');
