// scripts/hooks/lib/config.mjs
// 门禁配置加载：.hooksrc INI 解析 + gate.*/chore.* 键归组 + .hooksrc.local 合并
// + [glob] 分节覆盖（editorconfig 语义：后写节覆盖先写节，local 节接主文件节之后）
// + 旧键别名映射（emojiLevel → gate.emoji.level 等）+ SKIP 环境变量语义
//
// 契约：
//   - INI 首个 '=' 切分，行内不支持注释（值内 '#' 保留——正则友好）
//   - 合并序：.hooksrc → .hooksrc.local（后者 gitignore，个人覆盖）
//   - 分节：[glob] 节头开启覆盖域，节内仅 gate.*/chore.* 键；glob 相对仓根
//   - 等级词表：off | warn | error | required（required 不吃 SKIP）

import fs from 'node:fs';
import path from 'node:path';
import { matchAnyGlobs } from './matcher.mjs';

export const LEVELS = ['off', 'warn', 'error', 'required'];

// 旧键 → gate 归属映射（后兼容：旧 .hooksrc 零破坏迁移）
export const LEGACY_ALIASES = {
  emojiLevel: 'emoji',
  mojibakeLevel: 'mojibake',
  secretLevel: 'secrets',
  lintLevel: 'impact-test',
  trailerLevel: 'commit-msg', // trailer 是 commit-msg 门的子检查
};

function parseIniFile(filePath, into = {}, sections = []) {
  if (!fs.existsSync(filePath)) return { into, sections };
  let current = null;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const sm = t.match(/^\[(.+)\]$/);
    if (sm) {
      current = { glob: sm[1].trim(), entries: {} };
      sections.push(current);
      continue;
    }
    const eq = t.indexOf('=');
    if (eq > 0) (current ? current.entries : into)[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return { into, sections };
}

/**
 * 加载合并后的原始键值（.hooksrc → .hooksrc.local，仅全局段）
 */
export function loadRawConfig(root) {
  const kv = {};
  parseIniFile(path.join(root, '.hooksrc'), kv);
  parseIniFile(path.join(root, '.hooksrc.local'), kv);
  return kv;
}

/**
 * 归组结构化配置
 * 返回 { flat, gates, chores, sections, sectionWarnings }
 *   sections: [{glob, entries:{key:val}}]——主文件节在前，local 节接后（后写赢语义）
 *   sectionWarnings: 畸形节诊断（非 gate.X/chore.X 键、零有效键节）
 */
export function loadHookEngineConfig(root) {
  const flat = {};
  const sections = [];
  parseIniFile(path.join(root, '.hooksrc'), flat, sections);
  parseIniFile(path.join(root, '.hooksrc.local'), flat, sections);
  const gates = {};
  const chores = {};
  for (const [k, v] of Object.entries(flat)) {
    let m = k.match(/^gate\.([^.]+)\.(.+)$/);
    if (m) { (gates[m[1]] ??= {})[m[2]] = v; continue; }
    m = k.match(/^chore\.([^.]+)\.(.+)$/);
    if (m) { (chores[m[1]] ??= {})[m[2]] = v; }
  }
  const sectionWarnings = [];
  for (const sec of sections) {
    const bad = Object.keys(sec.entries).filter(k => !/^(gate|chore)\.[^.]+\..+/.test(k));
    for (const k of bad) sectionWarnings.push(`[${sec.glob}] 含非 gate.*/chore.* 键: ${k}`);
    if (Object.keys(sec.entries).length - bad.length === 0)
      sectionWarnings.push(`[${sec.glob}] 畸形节：无 gate.*/chore.* 键`);
  }
  return { flat, gates, chores, sections, sectionWarnings };
}

/**
 * 按文件解析某门的有效配置：全局 cfg.gates[id] → 按序 merge 命中 [glob] 节
 * （editorconfig 序：后写节覆盖先写节；local 节天然排在主文件节之后）
 */
export function resolveGateConfigFor(cfg, gateId, file) {
  // chore 门 id 带 'chore:' 前缀——归一化到 cfg.chores[bare] + chore.X 节键
  const isChore = gateId.startsWith('chore:');
  const bare = isChore ? gateId.slice(6) : gateId;
  const out = { ...((isChore ? cfg.chores : cfg.gates)[bare] ?? {}) };
  const prefix = isChore ? 'chore' : 'gate';
  for (const sec of cfg.sections ?? []) {
    if (!matchAnyGlobs(file, [sec.glob])) continue;
    for (const [k, v] of Object.entries(sec.entries)) {
      const m = k.match(/^([a-z]+)\.([^.]+)\.(.+)$/);
      if (m && m[1] === prefix && m[2] === bare) out[m[3]] = v;
    }
  }
  return out;
}

/**
 * 解析某 gate 的有效等级：gate.<id>.level > 旧键别名 > defaultLevel
 * SKIP 环境变量：跳过非 required 门（返回 'off' 语义由调用方处理）
 */
export function resolveLevel(id, defaultLevel, cfg) {
  // chore 门 id 带 'chore:' 前缀——配置在 cfg.chores[bare]
  const isChore = id.startsWith('chore:');
  const bare = isChore ? id.slice(6) : id;
  const direct = (isChore ? cfg.chores : cfg.gates)[bare]?.level;
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

/**
 * cadence 节流值解析：<n>d|h|m|s → 毫秒；非法 → null
 * （周期维度最小形态：搭 stage 便车的 TTL 闸，不引入调度器）
 */
export function parseCadence(v) {
  const m = String(v ?? '').trim().match(/^(\d+)\s*([dhms])$/);
  if (!m) return null;
  return parseInt(m[1], 10) * { d: 86400e3, h: 3600e3, m: 60e3, s: 1e3 }[m[2]];
}
