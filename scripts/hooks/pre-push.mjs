// scripts/hooks/pre-push.mjs
// ming-skills pre-push hook runner
// 解析 Git push 的 stdin 行 (<local ref> <local sha1> <remote ref> <remote sha1>)
// 过滤删除分支操作，对有效推送执行全量本地质量门禁 (verify.mjs --profile full)

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '../..');
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

export function runPrePush(rawInput = '') {
  const operations = parsePushLines(rawInput);
  if (operations.length > 0 && operations.every(op => op.isDelete)) {
    console.log('[pre-push] 检测到仅推送分支删除操作，跳过代码质量门禁。');
    return true;
  }

  console.log(`[pre-push] 正在执行推送前全量本地质量门禁 (scripts/verify.mjs --profile full)...`);
  const result = spawnSync(process.execPath, [path.join(ROOT, 'scripts/verify.mjs'), '--profile', 'full'], {
    cwd: ROOT,
    stdio: 'inherit'
  });

  return result.status === 0;
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/hooks/pre-push.mjs')) {
  let stdin = '';
  try {
    stdin = fs.readFileSync(0, 'utf8');
  } catch {
    stdin = '';
  }
  const ok = runPrePush(stdin);
  process.exit(ok ? 0 : 1);
}
