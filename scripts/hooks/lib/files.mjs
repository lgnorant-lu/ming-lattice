// scripts/hooks/lib/files.mjs
// 文件源抽象：staged（索引保真）/ range（A..B diff）/ all（全跟踪文件）
// 契约：staged 源读 git 索引 blob 而非工作区——索引保真不变量（D1）的物化载体

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// git 子进程超时下限——index 锁/LFS/UNC 路径挂起不得让 hook 永久阻塞
// （调用方 opts 可覆盖；60s 远超正常仓 git 操作量级）
const GIT_TIMEOUT_MS = 60_000;

export function makeGit(root) {
  return (args, opts = {}) => execFileSync('git', args, {
    cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    timeout: GIT_TIMEOUT_MS, ...opts,
  });
}

export function repoRoot(cwd = process.cwd()) {
  return execFileSync('git', ['rev-parse', '--show-toplevel'],
    { cwd, encoding: 'utf8', timeout: GIT_TIMEOUT_MS }).trim();
}

export function gitDir(root) {
  return path.resolve(root, execFileSync('git', ['rev-parse', '--git-dir'],
    { cwd: root, encoding: 'utf8', timeout: GIT_TIMEOUT_MS }).trim());
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
 * 暂存区是否存在任何变更（含 D）——纯删除提交没有可扫 blob，
 * 但 needsAllFiles 命令门(impact-test)对其必须仍然执行；
 * 若只按 ACMR 清单早退，`git rm tests/...` 类提交零门禁放行。
 */
export function hasStagedChanges(root) {
  const git = makeGit(root);
  return git(['diff', '--cached', '--name-only', '-z']).length > 0;
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

// 索引 sha 表：文件名→blob sha。
// ":<path>" revspec 会解析 pathspec 魔法——(top)/(exclude)/! 前缀文件名
// 注入可致读错 blob 或 fatal 逃逸；sha 寻址无歧义，ls-files 一次建表。
// root→shaMap——包络=单进程单次 hook 调用（每 hook 独立 node 进程，索引稳定）；
// 进程内跨 staging 变更重跑 runStage（如长驻宿主直 import）不在支持面
const _shaMapCache = new Map();
function stagedShaMap(root) {
  const hit = _shaMapCache.get(root);
  if (hit) return hit;
  const git = makeGit(root);
  const out = git(['ls-files', '-s', '-z']);
  const map = new Map();
  for (const rec of out.split('\0').filter(Boolean)) {
    // 记录形: <mode> <sha> <stage>\t<name>（name 经 -z 原样，可含任意字节）
    const m = rec.match(/^\d+ ([0-9a-f]{40}) (\d+)\t([\s\S]*)$/);
    if (m && m[2] === '0' && !map.has(m[3])) map.set(m[3], m[1]);
  }
  _shaMapCache.set(root, map);
  return map;
}

/**
 * 批量对象元数据（ls-files 取 sha + cat-file --batch-check，输入序=输出序）
 */
export function batchMeta(root, staged) {
  const git = makeGit(root);
  const map = new Map();
  if (staged.length === 0) return map;
  try {
    const shas = stagedShaMap(root);
    const input = staged.map(p => shas.get(p) ?? '0'.repeat(40)).join('\n') + '\n';
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
 * 读 staged blob 内容（索引保真——不碰工作区；sha 寻址不受文件名魔法影响）
 */
export function readStaged(root, relPath) {
  const git = makeGit(root);
  const sha = stagedShaMap(root).get(relPath);
  if (!sha) throw new Error(`staged 无此文件: ${relPath}`);
  return git(['cat-file', 'blob', sha]);
}

// ls-files -s 全表一次建：符号链接/gitlink 路径集合（all/range 源剔除用）
function loadLinkPaths(git) {
  const out = git(['ls-files', '-s', '-z']);
  const set = new Set();
  for (const e of out.split('\0')) {
    if (/^(120000|160000) /.test(e)) set.add(e.slice(e.indexOf('\t') + 1));
  }
  return set;
}

/**
 * 统一文件源：返回 {list(), read(path)} 形态
 *   staged —— git 索引（pre-commit 主源）
 *   all    —— git ls-files 全跟踪文件，读工作区（run ci 用，提交态即工作区态）
 *   range  —— git diff A..B 清单，读工作区
 */
export function fileSource(root, spec = { source: 'staged' }) {
  const git = makeGit(root);
  // 符号链接(120000)/gitlink(160000)条目不是内容面——读工作区会穿透链接目标
  // （vendored 镜像字节刻意不入仓、发现亦不可修）；all/range 源统一剔除
  let linkPaths = null;
  const contentOnly = list => list.filter(p => !(linkPaths ??= loadLinkPaths(git)).has(p));
  if (spec.source === 'all') {
    const list = () => contentOnly(git(['ls-files']).split('\n').filter(Boolean));
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
    const list = () => contentOnly(git(['diff', '--name-only', `${a}..${b}`]).split('\n').filter(Boolean));
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
