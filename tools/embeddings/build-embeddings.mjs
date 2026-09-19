// build-embeddings.mjs — 离线嵌入 artifact 生成（ADR-0007 S4 层）
// 用法: node tools/embeddings/build-embeddings.mjs [--model <id>]
// 输入: config/router-manifest.json 的 skillDocs（name+description+triggers 三合文档）
// 输出: config/router-embeddings.json（~150KB，可提交；模型权重缓存于 tools/embeddings/.cache，永不进仓）
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { pipeline, env } from '@huggingface/transformers';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const manifestPath = path.join(root, 'config/router-manifest.json');
const outPath = path.join(root, 'config/router-embeddings.json');
const mi = process.argv.indexOf('--model');
const MODEL = mi >= 0 ? process.argv[mi + 1] : 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';

env.cacheDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '.cache');
env.allowLocalModels = true;
env.remoteHost = process.env.HF_ENDPOINT || 'https://hf-mirror.com'; // 默认国内镜像，HF_ENDPOINT 可覆盖回官方

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const docs = manifest.skillDocs;
if (!docs || typeof docs !== 'object') {
  console.error('[FAIL] manifest 缺 skillDocs —— 先跑 scripts/build-router-manifest.mjs');
  process.exit(1);
}

// 文档文本 = name + description + triggers（与 BM25F 三合文档同构，语义通道各自独立）
const docText = d => [d.name, d.description, ...(d.triggers || [])].join('\n');
const entries = Object.entries(docs).sort(([a], [b]) => a.localeCompare(b));
const manifestHash = crypto.createHash('sha256')
  .update(JSON.stringify(Object.fromEntries(entries))).digest('hex').slice(0, 16);

console.log(`model: ${MODEL}`);
console.log(`docs : ${entries.length} skills`);
const t0 = Date.now();
const extractor = await pipeline('feature-extraction', MODEL, { dtype: 'q8' });
console.log(`init : ${((Date.now() - t0) / 1000).toFixed(1)}s (冷启动，含模型下载/加载)`);

const vectors = {};
for (const [name, doc] of entries) {
  const out = await extractor(docText(doc), { pooling: 'mean', normalize: true });
  vectors[name] = Array.from(out.data, v => +v.toFixed(6)); // 384 维 × 6 位小数 ≈ 3KB/技能
}

const artifact = {
  version: '1.0.0',
  model: MODEL,
  dtype: 'q8',
  dims: vectors[entries[0][0]].length,
  manifestHash,
  generatedAt: new Date().toISOString(),
  vectors,
};
fs.writeFileSync(outPath, JSON.stringify(artifact));
const kb = (fs.statSync(outPath).size / 1024).toFixed(0);
console.log(`wrote: ${outPath} (${kb} KB, dims=${artifact.dims}, manifestHash=${manifestHash})`);
