// scripts/hooks/lib/integrity.mjs
// gates/ 目录完整性提示——透明性特性（非安全控制）：
//   切换分支会换掉 gate 代码本身，此处让"变化可见"。
//   存值仅在 install-hooks 或 `engine.mjs trust` 时更新（不自动背书）。
//   等级配置：integrityLevel=off|warn（默认 warn）

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { gitDir } from './files.mjs';
import { HOOK_STAGES, shimScript, shimEngineRef } from './shims.mjs';

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

function stateFilePath(root) {
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

/**
 * 采纳层健康检查：.githooks 薄 shim 与规范模板对账 + 引擎引用可达性
 * 返回 findings: [{file, message}]
 * 边界：.githooks 缺席 = 未采纳形态，不告警（hooksPath 未设门自身不会跑，
 *       那是 install/doctor 的自举域）；shim 无 engine.mjs 引用 = 外来 hook，尊重不碰
 */
export function checkAdoptionHealth(root) {
  const findings = [];
  const dir = path.join(root, '.githooks');
  if (!fs.existsSync(dir)) return findings;
  for (const stage of HOOK_STAGES) {
    const file = path.join(dir, stage);
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    const ref = shimEngineRef(text);
    if (!ref) continue;
    const rel = `.githooks/${stage}`;
    if (text !== shimScript(stage, ref)) {
      findings.push({ file: rel, message: 'shim 内容与规范模板漂移（手改或模板更新）——install/doctor 再生成' });
    }
    // 引擎引用可达性：相对式按 .githooks 目录解析，绝对式直接判
    const abs = ref.includes('$(')
      ? path.resolve(dir, ref.replace(/\$\(dirname\s+"\$0"\)\/?/, ''))
      : ref;
    if (!fs.existsSync(abs)) {
      findings.push({ file: rel, message: `shim 引擎引用不可达: ${ref}` });
    }
  }
  return findings;
}

// .hooksrc gate.<id>.* 键对账已装载门集——孤儿键（配置指向不存在的门）
export function orphanGateIds(cfgGates, gateIds) {
  return Object.keys(cfgGates ?? {}).filter(id => !gateIds.has(id));
}
