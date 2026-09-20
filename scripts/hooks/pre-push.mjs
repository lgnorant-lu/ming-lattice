// scripts/hooks/pre-push.mjs
// ming-skills pre-push 解析件 + 兼容入口（委托 engine.mjs 调度）
// 解析 Git push 的 stdin 行 (<local ref> <local sha1> <remote ref> <remote sha1>)

import fs from 'node:fs';

const ZERO_SHA = '0000000000000000000000000000000000000000';

export function parsePushLines(input = '') {
  const lines = input.trim().split(/\r?\n/).filter(Boolean);
  const operations = [];
  for (const line of lines) {
    const parts = line.split(/\s+/);
    if (parts.length >= 4) {
      const [localRef, localSha, remoteRef, remoteSha] = parts;
      const isDelete = localSha === '(delete)' || localSha === ZERO_SHA || localRef === '(delete)';
      operations.push({
        localRef,
        localSha,
        remoteRef,
        remoteSha,
        isDelete,
        isNewBranch: remoteSha === ZERO_SHA
      });
    }
  }
  return operations;
}

const isDirect = process.argv[1]
  && /pre-push\.mjs$/.test(process.argv[1].replace(/\\/g, '/'));
if (isDirect) {
  let stdin = '';
  try { stdin = fs.readFileSync(0, 'utf8'); } catch { stdin = ''; }
  const { runStage } = await import('./engine.mjs');
  const code = await runStage('pre-push', { pushOps: parsePushLines(stdin) });
  process.exit(code);
}
