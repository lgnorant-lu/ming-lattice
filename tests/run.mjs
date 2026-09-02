// tests/run.mjs
// ming-skills 统一测试套件驱动器 (Master Test Runner)
// 依据 testing-core-oracle 契约运行单元测试与集成测试，汇总报告

import { execSync } from 'node:child_process';
import path from 'node:path';
import { run as runValidateUnit } from './unit/test-validate-hooks.test.mjs';
import { run as runBuildManifestUnit } from './unit/test-build-manifest.test.mjs';
import { run as runCliIntegration } from './integration/test-cli-tools.test.mjs';

const root = path.resolve(import.meta.dirname, '..');

async function main() {
  console.log('\n================================================================');
  console.log('       ming-skills 自动化测试金字塔与契约套件驱动器              ');
  console.log('================================================================\n');

  let passedSuites = 0;
  let totalSuites = 5;

  try {
    // 1. Hook 校验器单元测试
    runValidateUnit();
    passedSuites++;

    // 2. Manifest 编译器单元测试
    runBuildManifestUnit();
    passedSuites++;

    // 3. 跨 Harness 路由决策 8 黄金用例
    console.log('[TEST UNIT] 路由决策纯函数 8 条黄金用例回归...');
    execSync('node tests/test-route-decision.mjs', { cwd: root, stdio: 'inherit' });
    passedSuites++;

    // 4. PowerShell YAML-Lite 解析器单元测试
    console.log('[TEST UNIT] scripts/lib/yaml-lite.ps1 解析器测试...');
    execSync('pwsh -File tests/unit/test-yaml-lite.test.ps1', { cwd: root, stdio: 'inherit' });
    passedSuites++;

    // 5. 运维工具链端到端集成测试
    runCliIntegration();
    passedSuites++;

    console.log('\n================================================================');
    console.log(`  测试总结果: ${passedSuites}/${totalSuites} 套件全部通过！(100% GREEN)`);
    console.log('================================================================\n');
    process.exit(0);
  } catch (err) {
    console.error('\n================================================================');
    console.error(`  测试套件执行失败: ${err.message}`);
    console.error('================================================================\n');
    process.exit(1);
  }
}

main();
