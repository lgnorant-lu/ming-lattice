import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createPlan, ALL_SUITE_NAMES } from '../../scripts/hooks/plan.mjs';

const root = path.resolve(import.meta.dirname, '../..');

export async function run() {
  console.log('[TEST CONTRACT] hook planner affected impact and monotonicity contract...');

  // 1. 纯空变更
  const emptyPlan = createPlan({ stage: 'pre-commit', files: [] });
  assert.equal(emptyPlan.jobs.length, 0);
  assert.equal(emptyPlan.categories.length, 0);
  assert.equal(emptyPlan.fallback, null);

  // 2. 纯文档变更 -> 0 个测试作业
  const docsPlan = createPlan({ stage: 'pre-commit', files: ['docs/GIT_HOOKS.md', 'README.md'] });
  assert.deepEqual(docsPlan.categories, ['docs']);
  assert.deepEqual(docsPlan.jobs, []);
  assert.equal(docsPlan.fallback, null);

  // 3. 全局关键配置触发 fail-closed 升级全量
  for (const globalFile of ['registry.yaml', '.hooksrc', 'scripts/hooks/validate.mjs', 'tests/run.mjs', 'config/router-manifest.json']) {
    const globalPlan = createPlan({ stage: 'pre-commit', files: ['docs/README.md', globalFile] });
    assert.equal(globalPlan.fallback, 'global_upgrade_fail_closed', `file ${globalFile} must trigger global upgrade`);
    assert.deepEqual(globalPlan.jobs, ALL_SUITE_NAMES);
  }

  // 4. 未知路径触发 fail-closed 升级全量
  const unknownPlan = createPlan({ stage: 'pre-commit', files: ['some/random/unclassified/path.xyz'] });
  assert.equal(unknownPlan.fallback, 'unknown_path_fail_closed');
  assert.deepEqual(unknownPlan.jobs, ALL_SUITE_NAMES);

  // 5. 路由单域变更
  const routerPlan = createPlan({ stage: 'pre-commit', files: ['scripts/route-core.mjs'] });
  assert.deepEqual(routerPlan.categories, ['router']);
  assert.ok(routerPlan.jobs.includes('route-golden'));
  assert.ok(routerPlan.jobs.includes('manifest-unit'));
  assert.ok(!routerPlan.jobs.includes('cli-isolated'));

  // 5.1 技能 Markdown 单独变更 -> 技能分类 (不作为纯 docs 旁路)
  const skillMdPlan = createPlan({ stage: 'pre-commit', files: ['private/example/SKILL.md'] });
  assert.deepEqual(skillMdPlan.categories, ['skills']);
  assert.deepEqual(skillMdPlan.jobs, ['lint-contract', 'manifest-freshness', 'manifest-unit']);
  assert.equal(skillMdPlan.fallback, null);

  // 6. 多分类并集
  const multiPlan = createPlan({
    stage: 'pre-commit',
    files: ['scripts/route-core.mjs', 'scripts/sync.ps1']
  });
  assert.deepEqual(multiPlan.categories, ['cli', 'router']);
  assert.ok(multiPlan.jobs.includes('route-golden'));
  assert.ok(multiPlan.jobs.includes('cli-isolated'));

  // 7. 单调性验证: A 包含的任务必须是 (A + new_file) 的子集
  const setA = new Set(routerPlan.jobs);
  for (const job of setA) {
    assert.ok(multiPlan.jobs.includes(job), `monotonicity broken: job ${job} in setA missing in multiPlan`);
  }

  // 8. 复杂路径（空格、Unicode、相对路径斜杠规范化）
  const unicodePlan = createPlan({
    stage: 'pre-commit',
    files: ['docs/测试 文档.md', 'scripts\\route-pipeline.mjs']
  });
  assert.ok(unicodePlan.categories.includes('docs'));
  assert.ok(unicodePlan.categories.includes('router'));

  // 9. 命令行 CLI 契约 (--json, --explain, --files)
  const cliRes = spawnSync(process.execPath, [
    path.join(root, 'scripts/hooks/plan.mjs'),
    '--stage', 'pre-commit',
    '--files', 'docs/README.md,scripts/sync.ps1',
    '--json'
  ], { encoding: 'utf8' });
  assert.equal(cliRes.status, 0);
  const cliJson = JSON.parse(cliRes.stdout);
  assert.equal(cliJson.stage, 'pre-commit');
  assert.deepEqual(cliJson.categories, ['cli', 'docs']);
  assert.ok(cliJson.jobs.includes('cli-isolated'));

  // 非法参数退出码 2
  const invalidRes = spawnSync(process.execPath, [
    path.join(root, 'scripts/hooks/plan.mjs'),
    '--unknown-arg'
  ], { encoding: 'utf8' });
  assert.equal(invalidRes.status, 2);

  // 10. pre-push stdin ref 范围解析契约 (多 ref, 新分支, 删除分支)
  const { parsePushLines } = await import('../../scripts/hooks/pre-push.mjs');
  const samplePushInput = `
refs/heads/main 1111111111111111111111111111111111111111 refs/heads/main 2222222222222222222222222222222222222222
refs/heads/feat 3333333333333333333333333333333333333333 refs/heads/feat 0000000000000000000000000000000000000000
(delete) 0000000000000000000000000000000000000000 refs/heads/old-branch 4444444444444444444444444444444444444444
`;
  const ops = parsePushLines(samplePushInput);
  assert.equal(ops.length, 3);
  assert.equal(ops[0].isDelete, false);
  assert.equal(ops[0].isNewBranch, false);
  assert.equal(ops[1].isDelete, false);
  assert.equal(ops[1].isNewBranch, true);
  assert.equal(ops[2].isDelete, true);

  // 11. 测试运行器 CLI 契约 (tests/run.mjs 非法参数、非法 profile、空 suite 校验)
  const runnerScript = path.join(root, 'tests/run.mjs');
  
  // 非法 profile
  const badProfileRes = spawnSync(process.execPath, [runnerScript, '--profile', 'nonsense', '--suites', 'hook-validation'], { encoding: 'utf8' });
  assert.equal(badProfileRes.status, 2, 'invalid --profile must exit with code 2');
  assert.match(badProfileRes.stderr, /unknown profile: nonsense/);

  // 缺失 --suites 参数值
  const missingSuitesValRes = spawnSync(process.execPath, [runnerScript, '--profile', 'quick', '--suites'], { encoding: 'utf8' });
  assert.equal(missingSuitesValRes.status, 2, 'missing --suites value must exit with code 2');
  assert.match(missingSuitesValRes.stderr, /missing required value for --suites/);

  // 未知 suite 名称
  const unknownSuiteRes = spawnSync(process.execPath, [runnerScript, '--suites', 'nonexistent-suite-xyz'], { encoding: 'utf8' });
  assert.equal(unknownSuiteRes.status, 2, 'unknown suite must exit with code 2');
  assert.match(unknownSuiteRes.stderr, /unknown suite: nonexistent-suite-xyz/);

  console.log('  -> plan schema, fail-closed, monotonicity, categories, pre-push parsing and CLI contract passed');
}

if (process.argv[1]?.endsWith('test-hook-planner.mjs')) run();
