// scripts/hooks/gates.local/vendor-boundary.mjs
// vertical/ 物化区边界门——远端仅存索引的仓储不变量执行件。
// 仓专门（硬依赖本仓 registry.yaml 契约）——故驻 gates.local/ 而非随 kit 分发的 gates/。
//
// 不变量：staged ∩ vertical/ ⊆ { registry.vertical[].path | sourceGone=true }
//   白名单由 registry 的 sourceGone 字段派生（孤本=上游已下架、须本仓承载字节的例外），
//   不另建清单文件——想往 vertical/ 提交，先在 registry 声明孤本身份。
//
// 配置：gate.vendor-boundary.level（默认 error）

import fs from 'node:fs';
import path from 'node:path';
import { parseRegistryLite, sectionEntries } from '../../lib/registry-lite.mjs';

// 孤本白名单：vertical 段 sourceGone:true 条目的 path 集（共享 lite 解析，非另抄正则）
function orphanPaths(text) {
  const out = new Set();
  for (const e of sectionEntries(parseRegistryLite(text), 'vertical'))
    if (e.fields.sourceGone === 'true' && e.fields.path)
      out.add(e.fields.path.replace(/\\/g, '/').replace(/\/+$/, ''));
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
    // 普适硬规则（先于孤本白名单）：任何 vertical/**/.git 内件永不入仓——
    // 内层仓的 hooks/config 可含凭据，gitfile 则把物化目录偷渡成 submodule 指针。
    const dotGit = /(^|\/)\.git(\/|$)/;
    const findings = [];
    for (const p of ctx.files) {
      const norm = p.replace(/\\/g, '/');
      if (norm.startsWith('vertical/') && dotGit.test(norm)) {
        findings.push({ gate: 'vendor-boundary', file: p, message: '禁止提交 vertical/**/.git 内件（内层仓元数据不属本仓内容面）' });
      }
    }

    // registry 契约判定：文件不存在 = 门不适用（下游复用 kit 的仓无此契约，静默跳过）；
    // 存在但读不到 = fail-closed 显式 finding（如 staged 删除 registry 的极端场景）。
    const regPath = path.join(ctx.root, 'registry.yaml');
    let text = null;
    try { text = ctx.read?.('registry.yaml') ?? fs.readFileSync(regPath, 'utf8'); } catch { /* 下方分支裁决 */ }
    if (text == null) {
      if (!fs.existsSync(regPath)) return findings;
      findings.push({ gate: 'vendor-boundary', file: 'registry.yaml', message: 'registry.yaml 存在但不可读——孤本白名单无法对账（fail-closed）' });
      return findings;
    }

    const allowed = orphanPaths(text);
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
