// scripts/lib/tmp-reaper.mjs — 命名域临时产物收割原语（substrate orphan_reaper 形态）
// 不变量：
//   只碰白名单前缀（transit 命名域 + 遗留 mb-* 直译）——绝不删未知名
//   超龄才删（mtime 判定，对齐 systemd-tmpfiles age 语义）
//   时长预算硬顶——扫描本身不得失控（budgetMs 到点 truncated=true 退出）
//   transit/final 判别进规则表：cache 面（mb-node-types-*）给长龄档次
//   逐条错误收集不中断——单个锁定文件不拖垮整轮收割

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// kind 语义：transit=短命中转件；cache=可重建缓存（长龄档，非不清）
export const DEFAULT_RULES = [
  { prefixes: ['skc-'], maxAgeMs: 24 * 3600_000, kind: 'transit' },
  { prefixes: ['mb-facts-', 'mb-spec-', 'mb-fix-', 'mb-metrics-', 'ming-cli-'],
    maxAgeMs: 24 * 3600_000, kind: 'transit-legacy' },
  { prefixes: ['mb-node-types-'], maxAgeMs: 30 * 24 * 3600_000, kind: 'cache' },
];

// reapOnce({root, rules, budgetMs, apply, now}) →
//   {root, scanned, matched, reapable, deleted, keptYoung, errors[], truncated, elapsedMs, apply}
//   root 缺席 = noop（scanned=0，无 errors）——临时目录不存在不是故障
export function reapOnce({ root = os.tmpdir(), rules = DEFAULT_RULES,
                           budgetMs = 10_000, apply = false, now } = {}) {
  const t0 = Date.now();
  const ref = now ?? t0;
  const rep = { root, scanned: 0, matched: 0, reapable: 0, deleted: 0, keptYoung: 0,
                errors: [], truncated: false, elapsedMs: 0, apply };
  let ents;
  try { ents = fs.readdirSync(root, { withFileTypes: true }); }
  catch (e) {
    if (e.code !== 'ENOENT') rep.errors.push({ file: root, err: e.message });
    rep.elapsedMs = Date.now() - t0;
    return rep;
  }
  for (const e of ents) {
    if (Date.now() - t0 > budgetMs) { rep.truncated = true; break; }
    const rule = rules.find(r => r.prefixes.some(p => e.name.startsWith(p)));
    if (!rule) continue;
    rep.matched++;
    const fp = path.join(root, e.name);
    let st;
    try { st = fs.lstatSync(fp); }
    catch (err) { rep.errors.push({ file: e.name, err: err.message }); continue; }
    rep.scanned++;
    if (ref - st.mtimeMs < rule.maxAgeMs) { rep.keptYoung++; continue; }
    rep.reapable++;
    if (apply) {
      try {
        fs.rmSync(fp, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
        rep.deleted++;
      } catch (err) { rep.errors.push({ file: e.name, err: err.message }); }
    }
  }
  rep.elapsedMs = Date.now() - t0;
  return rep;
}
