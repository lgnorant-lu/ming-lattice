// harvest-misses.mjs — B 层实战 miss 语料收割（ADR-0007）
// 用法:
//   node tests/evals/harvest-misses.mjs --hints <hint-log.jsonl>
// 输入: route CLI 的 opt-in 明文 hint 日志（--hint-log 或 MING_SKILLS_HINT_LOG 产出；
//       每行 {at,hint,domain,action,reason_codes}）。注意 route.decided 事件只存 hint_hash——
//       脱敏契约下事件流拿不出原文，明文收割走独立本地通道，需用户显式开启。
// 输出: tests/evals/recall-drafts/draft-<date>.jsonl（草稿池，eval 不读取）
//
// 过滤面（潜在假阴性信号）:
//   - domain=none / action=handoff         —— 完全未路由
//   - action=ask 且仅 lexical_fallback 支撑 —— 弱信号召回，值得人审
//
// goldset 铁律：草稿 expect 恒为空对象占位，禁止自动回填路由输出——
// 人审确认期望 outcome 后手动移入 recall-corpus/b-tier.jsonl。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const corpusDir = path.join(here, 'recall-corpus');
const draftsDir = path.join(here, 'recall-drafts');

const ai = process.argv.indexOf('--hints');
const hintsFile = ai >= 0
  ? path.resolve(process.argv[ai + 1])
  : process.env.MING_SKILLS_HINT_LOG && path.resolve(process.env.MING_SKILLS_HINT_LOG);

if (!hintsFile || !fs.existsSync(hintsFile)) {
  console.error('用法: node tests/evals/harvest-misses.mjs --hints <hint-log.jsonl>');
  console.error('      hint 日志由 route CLI --hint-log 或 MING_SKILLS_HINT_LOG 产出（opt-in 明文通道）');
  process.exit(2);
}

const events = fs.readFileSync(hintsFile, 'utf8').split('\n').filter(l => l.trim())
  .map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
  .filter(e => typeof e.hint === 'string' && e.hint.trim());

const suspicious = events.filter(e =>
  e.domain === 'none' || e.domain === null || e.action === 'handoff'
  || (e.action === 'ask' && (e.reason_codes || []).some(r => String(r).startsWith('lexical_fallback'))));

// 与既有语料 + 草稿池去重（归一化查询串）
const norm = q => q.toLowerCase().replace(/\s+/g, ' ').trim();
const known = new Set();
for (const f of [corpusDir, draftsDir]) {
  if (!fs.existsSync(f)) continue;
  for (const file of fs.readdirSync(f).filter(x => x.endsWith('.jsonl'))) {
    for (const l of fs.readFileSync(path.join(f, file), 'utf8').split('\n')) {
      if (!l.trim()) continue;
      try { known.add(norm(JSON.parse(l).query)); } catch { /* skip */ }
    }
  }
}

const fresh = [];
for (const e of suspicious) {
  const key = norm(e.hint);
  if (known.has(key)) continue;
  known.add(key); // 批内去重——同一查询重复 miss 只收一条
  fresh.push(e);
}
if (!fresh.length) {
  console.log(`harvest: ${events.length} events, ${suspicious.length} suspicious, 0 fresh (全部已在语料/草稿池)`);
  process.exit(0);
}

// B 层 id 顺延
let maxId = 0;
const bFile = path.join(corpusDir, 'b-tier.jsonl');
if (fs.existsSync(bFile)) {
  for (const l of fs.readFileSync(bFile, 'utf8').split('\n')) {
    const m = l.match(/"id"\s*:\s*"b-(\d+)"/);
    if (m) maxId = Math.max(maxId, +m[1]);
  }
}
for (const f of fs.existsSync(draftsDir) ? fs.readdirSync(draftsDir) : []) {
  for (const l of fs.readFileSync(path.join(draftsDir, f), 'utf8').split('\n')) {
    const m = l.match(/"id"\s*:\s*"b-(\d+)"/);
    if (m) maxId = Math.max(maxId, +m[1]);
  }
}

const zhRatio = s => (s.match(/[一-鿿]/g) || []).length / Math.max(s.length, 1);
const lang = s => zhRatio(s) > 0.3 ? 'zh' : /[一-鿿]/.test(s) ? 'mixed' : 'en';
const today = new Date().toISOString().slice(0, 10);

fs.mkdirSync(draftsDir, { recursive: true });
const out = path.join(draftsDir, `draft-${today}.jsonl`);
const lines = fresh.map((e, i) => JSON.stringify({
  id: `b-${String(maxId + i + 1).padStart(3, '0')}`,
  query: e.hint,
  expect: {},
  tier: 'B',
  provenance: 'real-miss',
  lang: lang(e.hint),
  observed: { domain: e.domain, action: e.action, confidence: e.confidence },
  note: 'DRAFT——人审填 expect 后移入 recall-corpus/b-tier.jsonl；若实为 OOS 则改 tier:C'
}));
fs.appendFileSync(out, lines.join('\n') + '\n', 'utf8');
console.log(`harvest: ${events.length} events, ${suspicious.length} suspicious, ${fresh.length} fresh → ${path.relative(process.cwd(), out)}`);
console.log('下一步: 逐条人审填 expect（domain/skills/action），确认后移入 b-tier.jsonl');
