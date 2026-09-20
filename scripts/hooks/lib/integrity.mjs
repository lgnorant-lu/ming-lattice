// scripts/hooks/lib/integrity.mjs
// gates/ 目录完整性提示——透明性特性（非安全控制）：
//   切换分支会换掉 gate 代码本身，此处让"变化可见"。
//   存值仅在 install-hooks 或 `engine.mjs trust` 时更新（不自动背书）。
//   等级配置：integrityLevel=off|warn（默认 warn）

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { gitDir } from './files.mjs';

const STATE_FILE = 'hook-engine-state.json';

function hashDir(dir) {
  const h = createHash('sha1');
  if (!fs.existsSync(dir)) return h.digest('hex');
  const walk = d => fs.readdirSync(d, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  for (const f of walk(dir)) {
    h.update(path.relative(dir, f));
    h.update(fs.readFileSync(f));
  }
  return h.digest('hex');
}

export function stateFilePath(root) {
  return path.join(gitDir(root), STATE_FILE);
}

/**
 * 比对 gates 目录 hash。
 * 返回 'ok' | 'bootstrap'（首见自动建档） | 'changed'（待 trust 再确认）
 */
export function checkIntegrity(root, gatesDir) {
  const current = hashDir(gatesDir);
  const sf = stateFilePath(root);
  if (!fs.existsSync(sf)) {
    writeTrust(root, current);
    return 'bootstrap';
  }
  try {
    const saved = JSON.parse(fs.readFileSync(sf, 'utf8')).gatesHash;
    return saved === current ? 'ok' : 'changed';
  } catch {
    return 'changed';
  }
}

export function writeTrust(root, hash) {
  const sf = stateFilePath(root);
  const current = hash ?? hashDir(path.join(root, 'scripts/hooks/gates'));
  fs.writeFileSync(sf, JSON.stringify({ gatesHash: current, trustedAt: new Date().toISOString() }, null, 2));
}
