// tests/unit/test-build-manifest.test.mjs
// 单元测试: scripts/build-router-manifest.mjs
// 覆盖: Manifest 自动编译, 领域完整性, 11测试包登记, 负向表存在性, 配方引用有效性

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildRouterManifest } from '../../scripts/build-router-manifest.mjs';

const root = path.resolve(import.meta.dirname, '../..');

export function run() {
  console.log('[TEST UNIT] scripts/build-router-manifest.mjs...');

  const manifest = buildRouterManifest();

  // 1. 结构与版本校验
  assert.ok(manifest, 'manifest 不能为空');
  assert.equal(typeof manifest.version, 'string');
  assert.ok(manifest.domains, 'domains 必须存在');
  assert.ok(manifest.recipes, 'recipes 必须存在');

  // 2. 核心 5 个领域桶检查
  const requiredDomains = ['testing', 'reverse', 'ui', 'protocol', 'engineering'];
  for (const dom of requiredDomains) {
    assert.ok(manifest.domains[dom], `缺少必要领域桶: ${dom}`);
    const d = manifest.domains[dom];
    assert.ok(Array.isArray(d.skills) && d.skills.length > 0, `${dom}.skills 不能为空`);
    assert.ok(Array.isArray(d.triggers) && d.triggers.length > 0, `${dom}.triggers 不能为空`);
    assert.ok(Array.isArray(d.negatives), `${dom}.negatives 必须是数组`);
  }

  // 2.1 engineering 领域检查 4 个元规范包
  const expectedEngineeringSkills = [
    'docs-core-paradigm',
    'obs-core-paradigm',
    'sec-core-paradigm',
    'contract-core-paradigm'
  ];
  for (const s of expectedEngineeringSkills) {
    assert.ok(manifest.domains.engineering.skills.includes(s), `engineering 领域遗漏技能包: ${s}`);
  }

  // 3. testing 领域必须涵盖 11 个测试技能包
  const expectedTestingSkills = [
    'testing-core-oracle',
    'testing-workflow-spec',
    'testing-workflow-characterize',
    'testing-property-mutation',
    'testing-rust-idiom',
    'testing-python-idiom',
    'testing-js-idiom',
    'testing-go-idiom',
    'testing-scenario-cli',
    'testing-scenario-scraper',
    'testing-scenario-embed-ffi'
  ];

  for (const s of expectedTestingSkills) {
    assert.ok(manifest.domains.testing.skills.includes(s), `testing 领域遗漏技能包: ${s}`);
  }

  // 4. 配方有效性校验
  for (const [recName, rec] of Object.entries(manifest.recipes)) {
    assert.ok(manifest.domains[rec.domain], `配方 ${recName} 引用了未知领域: ${rec.domain}`);
    assert.ok(Array.isArray(rec.skills) && rec.skills.length > 0, `配方 ${recName}.skills 不能为空`);
  }

  // 5. 磁盘输出文件存在性
  const manifestOnDisk = path.join(root, 'config/router-manifest.json');
  assert.ok(fs.existsSync(manifestOnDisk), 'config/router-manifest.json 必须写入磁盘');

  console.log('  -> build-router-manifest.mjs 全部断言通过！');
}

if (process.argv[1] && process.argv[1].endsWith('test-build-manifest.test.mjs')) {
  run();
}
