// scripts/hooks/lib/files.mjs
// 文件源抽象：staged（索引保真）/ range（A..B diff）/ all（全跟踪文件）
// 契约：staged 源读 git 索引 blob 而非工作区——索引保真不变量（D1）的物化载体

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export function makeGit(root) {
  return (args, opts = {}) => execFileSync('git', args, {
    cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts,
  });
}

export function repoRoot(cwd = process.cwd()) {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' }).trim();
}

export function gitDir(root) {
  return path.resolve(root, execFileSync('git', ['rev-parse', '--git-dir'], { cwd: root, encoding: 'utf8' }).trim());
}

/**
 * staged 文件清单（ACMR —— 不含删除）
 */
export function listStaged(root) {
  const git = makeGit(root);
  const out = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']);
  return out.split('\0').filter(Boolean);
}

/**
 * 暂存区与工作区重叠文件（部分暂存感知）
 */
export function listUnstagedOverlap(root, staged) {
  const git = makeGit(root);
  let set = new Set();
  try {
    const out = git(['diff', '--name-only', '-z']);
    set = new Set(out.split('\0').filter(Boolean));
  } catch { /* ignore */ }
  return staged.filter(f => set.has(f));
}

/**
 * 批量对象元数据（单次 cat-file --batch-check，输入序=输出序）
 */
export function batchMeta(root, staged) {
  const git = makeGit(root);
  const map = new Map();
  if (staged.length === 0) return map;
  try {
    const input = staged.map(p => `:${p}`).join('\n') + '\n';
    const out = git(['cat-file', '--batch-check'], { input });
    const lines = out.trim().split('\n');
    for (let i = 0; i < lines.length && i < staged.length; i++) {
      const parts = lines[i].trim().split(' ');
      if (parts.length >= 3) map.set(staged[i], { type: parts[1], size: Number(parts[2]) });
    }
  } catch { /* 降级：逐文件查询由调用方负责 */ }
  return map;
}

/**
 * 读 staged blob 内容（索引保真——不碰工作区）
 */
export function readStaged(root, relPath) {
  const git = makeGit(root);
  return git(['show', `:${relPath}`]);
}

/**
 * 统一文件源：返回 {list(), read(path)} 形态
 *   staged —— git 索引（pre-commit 主源）
 *   all    —— git ls-files 全跟踪文件，读工作区（run ci 用，提交态即工作区态）
 *   range  —— git diff A..B 清单，读工作区
 */
export function fileSource(root, spec = { source: 'staged' }) {
  const git = makeGit(root);
  if (spec.source === 'all') {
    const list = () => git(['ls-files']).split('\n').filter(Boolean);
    return {
      source: 'all',
      list,
      read: p => fs.readFileSync(path.join(root, p), 'utf8'),
      meta: p => {
        try { const s = fs.statSync(path.join(root, p)); return { type: 'blob', size: s.size }; }
        catch { return { type: 'missing', size: 0 }; }
      },
    };
  }
  if (spec.source === 'range') {
    const [a, b] = (spec.range ?? 'HEAD~1..HEAD').split('..');
    const list = () => git(['diff', '--name-only', `${a}..${b}`]).split('\n').filter(Boolean);
    return {
      source: 'range',
      list,
      read: p => fs.readFileSync(path.join(root, p), 'utf8'),
      meta: p => {
        try { const s = fs.statSync(path.join(root, p)); return { type: 'blob', size: s.size }; }
        catch { return { type: 'missing', size: 0 }; }
      },
    };
  }
  // staged（默认）
  let cache = null;
  return {
    source: 'staged',
    list: () => (cache ??= listStaged(root)),
    read: p => readStaged(root, p),
    meta: null, // 批量元数据由引擎经 batchMeta 注入
  };
}
