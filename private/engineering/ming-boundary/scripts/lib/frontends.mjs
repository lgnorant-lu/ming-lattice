// lib/frontends.mjs — 抽取前端探测（跨端解析，无硬编码机器路径）
// ast-grep 解析三级：
//  1) AST_GREP_BIN 权威覆盖（设了就只试它——便于测试 fail-closed 与显式钉版）
//  2) 'ast-grep' 裸名 spawn——真实可执行在 PATH 即中（cargo/winget/scoop/
//     发行版包全是真 exe；npm .cmd shim 在 win32 上 spawnSync 跑不动
//     （CVE-2024-27980 后 .cmd 必须走 shell，而 --inline-rules 多行参数
//     过 cmd.exe 必碎，故不尝 shell 回退）
//  3) PATH 逐目录扫描：命中 ast-grep.exe/ast-grep 收为候选；只命中
//     ast-grep.cmd 时推导同前缀 npm 包内原生 exe——
//     全局布局 <prefix>/ast-grep.cmd + <prefix>/node_modules/@ast-grep/cli/ast-grep.exe
//     项目布局 <proj>/node_modules/.bin/ast-grep.cmd + ../@ast-grep/cli/ast-grep.exe
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function astGrepCandidates() {
  const out = ['ast-grep'];
  const isWin = process.platform === 'win32';
  const exts = isWin ? ['.exe', '.cmd', ''] : [''];
  for (const dir of (process.env.PATH || '').split(path.delimiter).filter(Boolean)) {
    for (const e of exts) {
      const p = path.join(dir, 'ast-grep' + e);
      if (!fs.existsSync(p)) continue;
      if (e === '.cmd') {
        for (const rel of [
          'node_modules/@ast-grep/cli/ast-grep.exe',
          '../@ast-grep/cli/ast-grep.exe']) {
          const exe = path.resolve(dir, rel);
          if (fs.existsSync(exe)) out.push(exe);
        }
      } else out.push(p);
    }
  }
  return [...new Set(out)];
}

// → {bin, ver} | null
export function findAstGrep() {
  const envBin = process.env.AST_GREP_BIN;
  const cands = envBin ? [envBin] : astGrepCandidates();
  for (const bin of cands) {
    const r = spawnSync(bin, ['--version'], { encoding: 'utf8' });
    if (!r.error && r.status === 0)
      return { bin, ver: r.stdout.trim().split(/\s+/).pop() };
  }
  return null;
}
