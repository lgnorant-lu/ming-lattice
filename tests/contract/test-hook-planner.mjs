import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createPlan, ALL_SUITE_NAMES, PLAN_ROOT, STAGED_DIFF_FILTER } from '../../scripts/plan.mjs';

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
    path.join(root, 'scripts/plan.mjs'),
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
    path.join(root, 'scripts/plan.mjs'),
    '--unknown-arg'
  ], { encoding: 'utf8' });
  assert.equal(invalidRes.status, 2);

  // 9b. ROOT 锚定回归——getStagedFiles 的 git cwd 必须是仓根。
  //   scripts/plan.mjs 曾以 '../..' 上溯到仓父目录（D:\dogepy），
  //   git diff 静默失败 → 空文件集 → 受影响调度全量失聪（静默兜底全量）。
  //   锚定：PLAN_ROOT 内须存在仓根标志件（registry.yaml + tests/run.mjs）。
  assert.ok(fs.existsSync(path.join(PLAN_ROOT, 'registry.yaml')),
    'PLAN_ROOT 应是仓根——registry.yaml 缺席说明上溯级数漂移');
  assert.ok(fs.existsSync(path.join(PLAN_ROOT, 'tests', 'run.mjs')),
    'PLAN_ROOT 应是仓根——tests/run.mjs 缺席说明上溯级数漂移');

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

  // 12. 套件总表漂移断言——ALL_SUITE_NAMES 必须镜像 run.mjs allSuites
  // （run.mjs 无 main 守护不可 import，源级正则抽取 { name, tier } 行）
  const runSrc = fs.readFileSync(path.join(root, 'tests/run.mjs'), 'utf8');
  const realSuites = [...runSrc.matchAll(/name:\s*'([a-z0-9-]+)',\s*tier:/g)].map(x => x[1]).sort();
  assert.deepEqual([...ALL_SUITE_NAMES].sort(), realSuites,
    'ALL_SUITE_NAMES drifted from run.mjs allSuites — sync scripts/plan.mjs');

  // 13. skills 子路径覆盖映射——包脚本改动必须带回其专属套件
  const distillerPlan = createPlan({ stage: 'pre-commit', files: ['private/ming-distiller/scripts/prop.mjs'] });
  for (const s of ['prop-cli', 'distill-index-unit', 'distill-index'])
    assert.ok(distillerPlan.jobs.includes(s), `ming-distiller change must schedule ${s}`);
  const boundaryPlan = createPlan({ stage: 'pre-commit', files: ['private/engineering/ming-boundary/scripts/extract-facts.mjs'] });
  assert.ok(boundaryPlan.jobs.includes('ming-boundary'));
  assert.ok(boundaryPlan.jobs.includes('boundary-live'));
  const forgePlan = createPlan({ stage: 'pre-commit', files: ['private/engineering/ming-skill-forge/scripts/check-skill.mjs'] });
  assert.ok(forgePlan.jobs.includes('check-skill-unit'), 'ming-skill-forge change must schedule check-skill-unit');
  assert.ok(forgePlan.jobs.includes('skill-conformance'));

  // 14. tests/ 约定映射——test-<suite>(.test)?.mjs 的同名套件必须被调度
  const propTestPlan = createPlan({ stage: 'pre-commit', files: ['tests/unit/test-prop-cli.test.mjs'] });
  assert.deepEqual(propTestPlan.jobs, ['prop-cli']);
  const checkSkillTestPlan = createPlan({ stage: 'pre-commit', files: ['tests/unit/test-check-skill.test.mjs'] });
  assert.ok(checkSkillTestPlan.jobs.includes('check-skill-unit'));

  // 15. 非 test-* 被消费件归位消费套件（夹具/语料/门配置——默认三件套是失聪面）
  assert.deepEqual(
    createPlan({ stage: 'pre-commit', files: ['tests/coverage-exempt.txt'] }).jobs,
    ['test-coverage']);
  assert.deepEqual(
    createPlan({ stage: 'pre-commit', files: ['tests/contract/route-decision-compatibility.json'] }).jobs,
    ['route-decision-compatibility']);
  assert.deepEqual(
    createPlan({ stage: 'pre-commit', files: ['tests/evals/recall-corpus/a-tier.jsonl'] }).jobs,
    ['recall-eval', 'skill-recall']);
  assert.deepEqual(
    createPlan({ stage: 'pre-commit', files: ['tests/evals/route-effects.json'] }).jobs,
    ['route-effects']);
  assert.deepEqual(
    createPlan({ stage: 'pre-commit', files: ['tests/fixtures/mb-golden/facts.golden.jsonl'] }).jobs,
    ['ming-boundary']);
  assert.deepEqual(
    createPlan({ stage: 'pre-commit', files: ['tests/fixtures/docclass-xlang/cases.json'] }).jobs,
    ['docclass']);

  // 16. --stage 词表 fail-closed（bogus stage 不得空计划放行）
  const badStage = spawnSync(process.execPath, [
    path.join(root, 'scripts/plan.mjs'), '--stage', 'bogus', '--files', 'x'
  ], { encoding: 'utf8' });
  assert.equal(badStage.status, 2, 'unknown --stage must exit 2');
  assert.match(badStage.stderr, /unknown stage/);

  // 17. STAGED_DIFF_FILTER 词表——typechange T 缺席会让 symlink 换脚本失明
  for (const flag of ['A', 'C', 'M', 'R', 'D', 'T']) {
    assert.ok(STAGED_DIFF_FILTER.includes(flag), `diff-filter missing ${flag}`);
  }

  console.log('  -> plan schema, fail-closed, monotonicity, categories, pre-push parsing, CLI contract, suite-table drift and sub-path mapping passed');
}

if (process.argv[1]?.endsWith('test-hook-planner.mjs')) run();
