// scripts/hooks/lib/git-state.mjs
// git 运行态检测——skipIf 条件的求值底座（lefthook skip 语义的收窄版：只支持枚举态）
//   支持 token：merge | rebase | cherry-pick | ref:<branch> | staged-empty
//   明确不支持任意命令条件（run: 是注入面，不引入）

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { gitDir } from './files.mjs';

export function detectGitState(root, staged = null) {
  const gd = gitDir(root);
  const state = {
    merge: fs.existsSync(path.join(gd, 'MERGE_HEAD')),
    rebase: fs.existsSync(path.join(gd, 'REBASE_HEAD'))
      || fs.existsSync(path.join(gd, 'rebase-merge'))
      || fs.existsSync(path.join(gd, 'rebase-apply')),
    cherryPick: fs.existsSync(path.join(gd, 'CHERRY_PICK_HEAD')),
    branch: null,
    stagedEmpty: staged ? staged.length === 0 : null,
  };
  try {
    state.branch = execFileSync('git', ['symbolic-ref', '--short', 'HEAD'], { cwd: root, encoding: 'utf8', timeout: 60_000 }).trim();
  } catch { /* detached HEAD */ }
  return state;
}

/**
 * skipIf token 求值：任一命中即应跳过
 */
export function shouldSkip(tokens, state) {
  for (const t of tokens) {
    if (t === 'merge' && state.merge) return true;
    if (t === 'rebase' && state.rebase) return true;
    if (t === 'cherry-pick' && state.cherryPick) return true;
    if (t.startsWith('ref:') && state.branch === t.slice(4)) return true;
    if (t === 'staged-empty' && state.stagedEmpty === true) return true;
  }
  return false;
}
