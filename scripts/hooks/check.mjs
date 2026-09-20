// scripts/hooks/check.mjs
// 兼容入口：pre-commit 阶段委托 engine.mjs 调度
// （保留独立文件名以兼容既有 shim/测试/手工调用路径）

import { runStage } from './engine.mjs';

const code = await runStage('pre-commit');
process.exit(code);
