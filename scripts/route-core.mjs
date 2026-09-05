// scripts/route-core.mjs
// 顶层兼容代理入口 -> 转发至 private/ming-skills-router/scripts/route-core.mjs
// 确保自包含架构下根目录 CLI 与测试金字塔完全透明兼容

export * from '../private/ming-skills-router/scripts/route-core.mjs';
import { route } from '../private/ming-skills-router/scripts/route-core.mjs';
import path from 'node:path';

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([a-zA-Z]:)/, '$1'))) {
  const hintArg = process.argv.slice(2).join(' ');
  const decision = route(hintArg);
  console.log(JSON.stringify(decision, null, 2));
}
