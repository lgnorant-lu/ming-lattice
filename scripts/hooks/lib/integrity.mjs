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
  const current = hash ?? hashDir(path.join(root, 'scripts/hooks/gates'));
  writeState(root, { gatesHash: current, trustedAt: new Date().toISOString() });
}

// ---------- 通用状态读写（lastRun cadence 节流、采纳元数据等运行时被动记录） ----------

export function readState(root) {
  try { return JSON.parse(fs.readFileSync(stateFilePath(root), 'utf8')); }
  catch { return {}; }
}

export function writeState(root, patch) {
  const cur = readState(root);
  fs.writeFileSync(stateFilePath(root), JSON.stringify({ ...cur, ...patch }, null, 2));
}

/** cadence 节流：上次运行时刻（ms 时间戳；无记录=0=立即到期） */
export function lastRunAt(root, id) {
  const t = readState(root).lastRun?.[id];
  const ms = t ? Date.parse(t) : 0;
  return Number.isFinite(ms) ? ms : 0;
}

export function stampRun(root, id) {
  writeState(root, { lastRun: { ...(readState(root).lastRun ?? {}), [id]: new Date().toISOString() } });
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

// ---------- 键空间对账：.hooksrc*/.hooksrc.tmpl 中的 gate.X.Y / chore.X.Y vs 真实键空间 ----------
// 键空间三源：通用键（引擎消费：level/globs/exclude/cadence）+ 原生门 configKeys
// （模块即 SoT 自描述字段）+ 声明式键（pattern/message/once——id 非原生门时）。
// 对偶：孤儿键查"配置指向不存在的门"，本检查查"文档/配置指向不存在的键"——
// 顺带覆盖 .hooksrc 拼错键静默失效（gate.toc.dept=3 无声不生效）。
const UNIVERSAL_KEYS = new Set(['level', 'globs', 'exclude', 'cadence']);
const DECL_KEYS = new Set(['pattern', 'message', 'once', 'stages', 'skipIf']);
const CHORE_KEYS = new Set(['watch', 'message', 'once', 'stages']);
const KEY_MENTION_RE = /\b(gate|chore)\.([A-Za-z0-9-]+)\.([A-Za-z0-9]+)/g;

export function checkKeyspace(root, gates) {
  const nativeById = new Map(gates.map(g => [g.id, g]));
  const findings = [];
  for (const rel of ['.hooksrc', '.hooksrc.local', '.hooksrc.tmpl']) {
    const fp = path.join(root, rel);
    if (!fs.existsSync(fp)) continue;
    const seen = new Set();
    for (const m of fs.readFileSync(fp, 'utf8').matchAll(KEY_MENTION_RE)) {
      const [, ns, id, key] = m;
      const sig = `${ns}.${id}.${key}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      if (UNIVERSAL_KEYS.has(key)) continue;
      if (ns === 'chore') {
        if (!CHORE_KEYS.has(key)) {
          findings.push({ file: rel, message: `chore.${id}.${key} 不在键空间（chore: watch/message/once + 通用键）` });
        }
        continue;
      }
      const g = nativeById.get(id);
      const allowed = g ? new Set(g.configKeys ?? []) : DECL_KEYS;
      if (!allowed.has(key)) {
        const src = g ? `门 ${id} configKeys` : '声明式键空间';
        findings.push({ file: rel, message: `gate.${id}.${key} 不在键空间（${src}: ${[...allowed].join('/') || '仅通用键'}）` });
      }
    }
  }
  return findings;
}
