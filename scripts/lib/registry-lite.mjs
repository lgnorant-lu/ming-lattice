// scripts/lib/registry-lite.mjs — registry.yaml 共享行级解析（mjs 侧唯一实现）
// 定位: pwsh 侧 registry.ps1 是全校验正典; 本件是 mjs 侧只读结构投影层——
//   之前 fetch/deploy-ledger/check-ming/check-skill-index/registry-upsert 五处
//   各写同一套行级正则（注释自称"同源约定"无机器约束, weight 事故即漂移产物）。
//   现收敛为单一实现; 消费方取 entries/fields/maps 各取所需。
// 条目模型: {section, name, lineStart, lineEnd, fields:{k:标量串}, maps:{k:{sub:标量串}}}
//   fields = 4 缩进 `key: scalar`（含 `key: {}` 空图记为 '{}'）；maps = `key:` 起 6 缩进子键
//   值均为未转型原始串（'true' 是字符串）——布尔/词表判断归消费方 fail-closed。

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT_OF_LIB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const ENTRY = /^ {2}- name:\s*(.+?)\s*$/;
const LIST_ITEM = /^ {2}- (?!\s)\s*(.+?)\s*$/;     // `- item` 非条目行（domains: 等）
const KV4 = /^ {4}([a-zA-Z][a-zA-Z0-9_]*):\s*(.*?)\s*$/;
const SUB6 = /^ {6}([a-zA-Z0-9_-]+):\s*(.*?)\s*$/;
const KV2 = /^ {2}([a-zA-Z][a-zA-Z0-9_]*):\s*(.*?)\s*$/;
const SECTION = /^([a-zA-Z][a-zA-Z0-9_]*):\s*$/;
const stripComment = v => {
  // 引号内 ` #` 不剥——找到首个未在引号内的 " #"
  let q = null;
  for (let i = 0; i + 1 < v.length; i++) {
    if (q) { if (v[i] === q) q = null; continue; }
    if (v[i] === '"' || v[i] === "'") q = v[i];
    else if (v[i] === '#' && /\s/.test(v[i - 1] ?? ' ')) return v.slice(0, i).trimEnd();
  }
  return v.trimEnd();
};
export const unquote = v => {
  v = stripComment(v);
  return v.length >= 2 && ((v[0] === '"' && v.at(-1) === '"') || (v[0] === "'" && v.at(-1) === "'"))
    ? v.slice(1, -1) : v;
};

/**
 * @returns {{lines:string[], sections:Map<string,[number,number]>, entries:object[],
 *            targets:Map<string,string>, topScalars:Map<string,Map<string,string>>,
 *            lists:Map<string,string[]>}}
 */
export function parseRegistryLite(text) {
  const lines = text.split(/\r?\n/);
  const sections = new Map();   // name -> [start, end)
  const entries = [];
  const targets = new Map();
  const topScalars = new Map(); // section -> Map(key -> scalar)  2 缩进 kv（targets/updatePolicy 型）
  const lists = new Map();      // section -> [item]              2 缩进 `- item` 非条目
  let section = null, cur = null, curMap = null;
  const openSection = (name, i) => {
    if (section) sections.get(section)[1] = i;
    section = name; cur = null; curMap = null;
    sections.set(name, [i, lines.length]);
  };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim() || raw.trimStart().startsWith('#')) continue;
    const sec = raw.match(SECTION);
    if (sec) { openSection(sec[1], i); continue; }
    if (!section) continue;

    if (section === 'targets') {
      const kv = raw.match(KV2);
      if (kv) targets.set(kv[1], unquote(kv[2]));
      continue;
    }
    const entry = raw.match(ENTRY);
    if (entry) {
      cur = { section, name: entry[1], lineStart: i, lineEnd: i, fields: {}, maps: {} };
      entries.push(cur); curMap = null; continue;
    }
    const item = raw.match(LIST_ITEM);
    if (item && !cur) {
      if (!lists.has(section)) lists.set(section, []);
      lists.get(section).push(unquote(item[1])); continue;
    }
    const kv2 = raw.match(KV2);
    if (kv2 && !cur) {
      if (!topScalars.has(section)) topScalars.set(section, new Map());
      topScalars.get(section).set(kv2[1], unquote(kv2[2])); continue;
    }
    if (!cur) continue;
    const kv4 = raw.match(KV4);
    if (kv4) {
      curMap = null;
      if (kv4[2] === '') curMap = kv4[1];                    // `key:` → 6 缩进子图开启
      else cur.fields[kv4[1]] = unquote(kv4[2]);             // `key: scalar` / `key: {}`
      continue;
    }
    const sub = raw.match(SUB6);
    if (sub && curMap) {
      (cur.maps[curMap] ??= {})[sub[1]] = unquote(sub[2]);
      continue;
    }
    // 缩进退回 = 子图/条目隐式结束（行区间在下一轮 ENTRY/SECTION 自然截断）
    curMap = null;
  }
  if (section) sections.get(section)[1] = lines.length;
  // 条目行区间: 到下一条目行或段尾
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const next = entries[i + 1];
    const secEnd = sections.get(e.section)[1];
    e.lineEnd = next && next.section === e.section ? next.lineStart : secEnd;
  }
  return { lines, sections, entries, targets, topScalars, lists };
}

/** 段内条目: parseRegistryLite(text).entries 的 section 过滤糖 */
export const sectionEntries = (reg, sec) => reg.entries.filter(e => e.section === sec);

/**
 * 正典桥: 经 scripts/read-registry.ps1 走 pwsh 全校验 parser 取 registry 全量。
 * 供需要"校验型解析"的件（sbom/sca/build-manifest）统一调用——错误面收敛：
 * ENOENT → pwsh 不在 PATH 的可读诊断；timeout 统一 120s（冷启动+AV 扫描实测 flake 上界）。
 */
export function loadRegistryCanonical(registryPath, { timeout = 120_000 } = {}) {
  const bridge = path.join(REPO_ROOT_OF_LIB, 'scripts', 'read-registry.ps1');
  try {
    return JSON.parse(execFileSync('pwsh', ['-NoProfile', '-File', bridge, '-RegistryPath', registryPath],
      { encoding: 'utf8', timeout, maxBuffer: 4 * 1024 * 1024 }).replace(/^\uFEFF/, ''));
  } catch (e) {
    if (e.code === 'ENOENT') {
      throw new Error(`pwsh 不在 PATH——registry 正典桥不可用（POSIX 侧装 powershell 7+，或用 parseRegistryLite 轻解析）: ${registryPath}`);
    }
    throw e;
  }
}
