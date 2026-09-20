// scripts/hooks/lib/config.mjs
// 门禁配置加载：.hooksrc INI 解析 + gate.*/chore.* 键归组 + .hooksrc.local 合并
// + 旧键别名映射（emojiLevel → gate.emoji.level 等）+ SKIP 环境变量语义
//
// 契约：
//   - INI 首个 '=' 切分，行内不支持注释（值内 '#' 保留——正则友好）
//   - 合并序：.hooksrc → .hooksrc.local（后者 gitignore，个人覆盖）
//   - 等级词表：off | warn | error | required（required 不吃 SKIP）

import fs from 'node:fs';
import path from 'node:path';

export const LEVELS = ['off', 'warn', 'error', 'required'];

// 旧键 → gate 归属映射（后兼容：旧 .hooksrc 零破坏迁移）
export const LEGACY_ALIASES = {
  emojiLevel: 'emoji',
  mojibakeLevel: 'mojibake',
  secretLevel: 'secrets',
  lintLevel: 'impact-test',
  trailerLevel: 'commit-msg', // trailer 是 commit-msg 门的子检查
};

function parseIniFile(filePath, into = {}) {
  if (!fs.existsSync(filePath)) return into;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq > 0) into[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return into;
}

/**
 * 加载合并后的原始键值（.hooksrc → .hooksrc.local）
 */
export function loadRawConfig(root) {
  const kv = {};
  parseIniFile(path.join(root, '.hooksrc'), kv);
  parseIniFile(path.join(root, '.hooksrc.local'), kv);
  return kv;
}

/**
 * 归组结构化配置
 * 返回 { flat, gates: {id:{key:val}}, chores: {id:{key:val}} }
 */
export function loadHookEngineConfig(root) {
  const flat = loadRawConfig(root);
  const gates = {};
  const chores = {};
  for (const [k, v] of Object.entries(flat)) {
    let m = k.match(/^gate\.([^.]+)\.(.+)$/);
    if (m) { (gates[m[1]] ??= {})[m[2]] = v; continue; }
    m = k.match(/^chore\.([^.]+)\.(.+)$/);
    if (m) { (chores[m[1]] ??= {})[m[2]] = v; }
  }
  return { flat, gates, chores };
}

/**
 * 解析某 gate 的有效等级：gate.<id>.level > 旧键别名 > defaultLevel
 * SKIP 环境变量：跳过非 required 门（返回 'off' 语义由调用方处理）
 */
export function resolveLevel(id, defaultLevel, cfg) {
  const direct = cfg.gates[id]?.level;
  if (direct && LEVELS.includes(direct)) return direct;
  for (const [legacyKey, gateId] of Object.entries(LEGACY_ALIASES)) {
    if (gateId === id && cfg.flat[legacyKey] !== undefined) {
      const v = cfg.flat[legacyKey];
      if (LEVELS.includes(v)) return v;
      // 兼容 requireCommitMsg=true 这类布尔语义键不在此处（commit-msg 门内部自理）
    }
  }
  return defaultLevel;
}

/**
 * SKIP=gate1,gate2 环境变量解析（pre-commit/overcommit 生态惯例名）
 * required 级门由引擎侧豁免——本函数只返回被点名集合
 */
export function parseSkipSet(env = process.env.SKIP) {
  if (!env) return new Set();
  return new Set(env.split(',').map(s => s.trim()).filter(Boolean));
}
