// scripts/route-observer.mjs
// 顶层兼容代理入口 -> 转发至 private/ming-skills-router/scripts/route-observer.mjs
// Stage-0 纯观测 hook：stdout 恒空、exit 恒 0。用法见真身文件头注释。

import { runObserverCli } from '../private/ming-skills-router/scripts/route-observer.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runObserverCli();
}
