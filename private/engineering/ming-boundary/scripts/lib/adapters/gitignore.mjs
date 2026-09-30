// lib/adapters/gitignore.mjs — 忽略声明适配器（v1.1 declare 边首源）
// 不重写 gitignore 匹配语义（! 反排、/**、父目录不穿透全是坑）——
// 调 `git check-ignore --stdin -v -z` 当 oracle：
//   命中行 "<source>\0<linenum>\0<pattern>\0<pathname>\0" → declare 边
//   （provenance 白送：哪条规则第几行认领了谁；! 前缀保留 → extra.negated）
// 所有权语义：--root 必须是 git worktree 顶才激活——子目录抽取时父仓的
//   .gitignore 声明属父仓契约面，不该记到被抽子树的账上（张冠李戴）。
// 非 git 顶 / git 不可用 → {facts:[], ignored:∅} 静默降级（extractor 记 NONE）
import { spawnSync } from 'node:child_process';
import { fact } from '../facts.mjs';

export const GI_EXTRACTOR = 'git-check-ignore@1';

// 返回 git worktree 顶（仓相对 posix 路径语义已规范化）或 null——
// 判定式：rev-parse --show-toplevel 必须恰等于 root 本身。
export function gitTopOf(root) {
  const r = spawnSync('git', ['-C', root, 'rev-parse', '--show-toplevel'],
    { encoding: 'utf8' });
  if (r.error || r.status !== 0) return null;
  const top = (r.stdout || '').trim().replace(/\\/g, '/');
  const norm = (p) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  return norm(top) === norm(root) ? top : null;
}

// 返回 { facts, ignored:Set<rel> }——ignored 供内容扫描谓词剪枝
// （vendored/venv/产物树不读内容，只留 file/declare 事实保隔离检测面）
export function gitignoreFacts(root, relPaths) {
  const empty = { facts: [], ignored: new Set() };
  if (!relPaths.length || !gitTopOf(root)) return empty;
  const r = spawnSync('git',
    ['-C', root, 'check-ignore', '--stdin', '-v', '-z'],
    { input: relPaths.join('\0') + '\0', encoding: 'utf8', maxBuffer: 256 << 20 });
  if (r.error || r.status > 1) return empty;
  const fld = (r.stdout || '').split('\0');
  if (fld.length && fld[fld.length - 1] === '') fld.pop(); // 收尾 \0 的空尾
  const facts = [];
  const ignored = new Set();
  for (let i = 0; i + 4 <= fld.length; i += 4) {
    const [src, linenumRaw, pattern, target] = fld.slice(i, i + 4);
    const linenum = /^\d+$/.test(linenumRaw) ? +linenumRaw : 0;
    if (!src || !target) continue;
    const tgt = target.replace(/\\/g, '/').trim();
    const srcRel = src.replace(/\\/g, '/');
    if (!pattern.startsWith('!')) ignored.add(tgt);
    facts.push(fact({
      unit: `${srcRel}#L${linenum || '?'}`, kind: 'declare', name: pattern,
      file: srcRel, line: linenum || undefined, fidelity: 'exact',
      scope: 'repo', extractor: GI_EXTRACTOR,
      extra: { to: tgt, source: 'gitignore',
        ...(pattern.startsWith('!') ? { negated: true } : {}) } }));
  }
  return { facts, ignored };
}
