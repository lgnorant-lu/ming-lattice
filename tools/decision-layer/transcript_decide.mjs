// transcript_decide.mjs — 批量 Decide runner：stdin JSON 数组 hints → stdout JSONL decisions
// 用法：node transcript_decide.mjs <hints.json>   （transcript_replay.py decide 阶段调用）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Decide } from '../../scripts/route-core.mjs';

const hintsFile = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(
  path.resolve(fileURLToPath(import.meta.url), '../../../config/router-manifest.json'), 'utf8'));
const hints = JSON.parse(fs.readFileSync(hintsFile, 'utf8'));
const out = hints.map((h, i) => {
  try {
    return JSON.stringify({ i, decision: Decide(h, manifest) });
  } catch (e) {
    return JSON.stringify({ i, error: String(e) });
  }
});
process.stdout.write(out.join('\n') + '\n');
