// lib/adapters/gitignore.mjs — 忽略声明适配器（v1.1 declare 边首源）
// 不重写 gitignore 匹配语义（! 反排、/**、父目录不穿透全是坑）——
// 调 `git check-ignore --stdin -v -n` 当 oracle：
//   命中行 "<source>:<linenum>:<pattern>\t<pathname>" → declare 边
//   （provenance 白送：哪条规则第几行认领了谁；! 前缀保留 → extra.negated）
//   非匹配行 "::\t<pathname>" → 不产边（未认领池由 isolated 族经缺席检出）
// 非 git 仓 / git 不可用 → 静默空集（调用方在 extractorId 位记降级）
import { spawnSync } from 'node:child_process';
import { fact } from '../facts.mjs';

export const GI_EXTRACTOR = 'git-check-ignore@1';

export function gitAvailable(root) {
  const r = spawnSync('git', ['-C', root, 'rev-parse', '--is-inside-work-tree'],
    { encoding: 'utf8' });
  return !r.error && r.status === 0 && /true/.test(r.stdout);
}

export function gitignoreFacts(root, relPaths) {
  if (!relPaths.length || !gitAvailable(root)) return [];
  // -z -v 纯命中输出（不传 -n：非命中本不产边，其 bare-path 记录与命中
  // 终止符混用会给解析徒增歧义）。实测语法：每条命中 = 4 个 \0 分隔字段 +
  // \0 收尾——<source>\0<linenum>\0<pattern>\0<pathname>\0 …即每 4 字段一组。
  const r = spawnSync('git',
    ['-C', root, 'check-ignore', '--stdin', '-v', '-z'],
    { input: relPaths.join('\0') + '\0', encoding: 'utf8', maxBuffer: 256 << 20 });
  if (r.error || r.status > 1) return [];
  const fld = (r.stdout || '').split('\0');
  if (fld.length && fld[fld.length - 1] === '') fld.pop(); // 收尾 \0 的空尾
  const facts = [];
  for (let i = 0; i + 4 <= fld.length; i += 4) {
    const [src, linenumRaw, pattern, target] = fld.slice(i, i + 4);
    const linenum = /^\d+$/.test(linenumRaw) ? +linenumRaw : 0;
    if (!src || !target) continue;
    const srcRel = src.replace(/\\/g, '/');
    facts.push(fact({
      unit: `${srcRel}#L${linenum || '?'}`, kind: 'declare', name: pattern,
      file: srcRel, line: linenum || undefined, fidelity: 'exact',
      scope: 'repo', extractor: GI_EXTRACTOR,
      extra: { to: target.replace(/\\/g, '/').trim(), source: 'gitignore',
        ...(pattern.startsWith('!') ? { negated: true } : {}) } }));
  }
  return facts;
}
