// scripts/hooks/gates/vendor-boundary.mjs
// vertical/ 物化区边界门——远端仅存索引的仓储不变量执行件。
//
// 不变量：staged ∩ vertical/ ⊆ { registry.vertical[].path | sourceGone=true }
//   白名单由 registry 的 sourceGone 字段派生（孤本=上游已下架、须本仓承载字节的例外），
//   不另建清单文件——想往 vertical/ 提交，先在 registry 声明孤本身份。
//
// 配置：gate.vendor-boundary.level（默认 error）

import fs from 'node:fs';
import path from 'node:path';

// registry.yaml 行级解析（yaml-lite 子集，与 check-skill-index 同源约定）
function orphanPaths(text) {
  const out = new Set();
  let section = null, cur = null;
  for (const raw of text.split(/\r?\n/)) {
    const sec = raw.match(/^([a-z_]+):\s*$/);
    if (sec) { section = sec[1]; cur = null; continue; }
    if (section !== 'vertical') continue;
    const entry = raw.match(/^ {2}- name:\s*(.+?)\s*$/);
    if (entry) { cur = {}; continue; }
    if (!cur) continue;
    const kv = raw.match(/^ {4}(path|sourceGone):\s*(.*?)\s*$/);
    if (kv) {
      cur[kv[1]] = kv[2];
      if (cur.path && cur.sourceGone === 'true') out.add(cur.path.replace(/\\/g, '/').replace(/\/+$/, ''));
    }
  }
  return out;
}

export const gate = {
  id: 'vendor-boundary',
  configKeys: [],
  stages: ['pre-commit'],
  family: 'gate',
  defaultLevel: 'error',
  globs: ['vertical/**'],
  exclude: [],
  async run(ctx) {
    const regPath = path.join(ctx.root, 'registry.yaml');
    const text = ctx.read ? (ctx.read('registry.yaml') ?? fs.readFileSync(regPath, 'utf8')) : fs.readFileSync(regPath, 'utf8');
    const allowed = orphanPaths(text);
    const findings = [];
    for (const p of ctx.files) {
      const norm = p.replace(/\\/g, '/');
      if (!norm.startsWith('vertical/')) continue;
      if ([...allowed].some(a => norm.startsWith(a + '/'))) continue;
      findings.push({
        gate: 'vendor-boundary', file: p,
        message: 'vertical/ 为物化区（远端仅存索引，勿提交字节）——可物化: node scripts/fetch.mjs；确为上游已下架孤本请先在 registry 标 sourceGone: true',
      });
    }
    return findings;
  },
};
