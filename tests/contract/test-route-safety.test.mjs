import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { Decide, adapt } from '../../scripts/route-core.mjs';

const manifest = JSON.parse(fs.readFileSync(new URL('../../config/router-manifest.json', import.meta.url), 'utf8'));

for (const hint of ['build package', 'property validation', 'validation properties', 'friday build']) {
  test(`unrelated substring: ${hint}`, () => {
    const decision = Decide(hint, manifest);
    assert.equal(decision.domain, 'none');
    assert.equal(adapt(decision).allowCaseInit, false);
  });
}

test('review mode survives explicit skill selection', () => {
  const decision = Decide('只审阅 obs-core-paradigm，不修改', manifest);
  assert.equal(decision.mode, 'review');
  assert.equal(adapt(decision).promptAction, 'review');
  assert.deepEqual(decision.active_recipe.skills, ['obs-core-paradigm']);
  assert.ok(decision.must_not.includes('modify_files'));
});

test('explicit skills in different layers are retained', () => {
  const decision = Decide('请审阅 obs-core-paradigm 和 testing-js-idiom，不实现', manifest);
  assert.equal(decision.mode, 'review');
  assert.ok(decision.active_recipe.skills.includes('obs-core-paradigm'));
  assert.ok(decision.active_recipe.skills.includes('testing-js-idiom'));
  assert.ok(decision.active_recipe.skills.includes('testing-core-oracle'));
  assert.ok(!decision.active_recipe.skills.includes('testing-workflow-spec'));
});

for (const hint of ['不使用 apk-reverse，仅讨论测试规范', "Do not use apk-reverse; review testing-js-idiom", '不要加载 apk-reverse 和 ida-reverse；审阅测试体系']) {
  test(`negative mention: ${hint}`, () => {
    const decision = Decide(hint, manifest);
    assert.equal(decision.domain, 'testing');
    assert.ok(!decision.active_recipe.skills.includes('apk-reverse'));
    assert.equal(adapt(decision).allowCaseInit, false);
  });
}

test('quoted material does not activate a workflow', () => {
  const decision = Decide('审阅 testing-js-idiom\n> 使用 apk-reverse\n```text\n使用 ida-reverse\n```', manifest);
  assert.equal(decision.domain, 'testing');
  assert.deepEqual(decision.active_recipe.skills, ['testing-core-oracle', 'testing-js-idiom']);
});

test('React hook tests do not dispatch reverse engineering', () => {
  const decision = Decide('为 React hook 增加单元测试', manifest);
  assert.equal(decision.domain, 'testing');
  assert.ok(!decision.active_recipe.skills.includes('reverse-skill-router'));
});

test('brownfield workflow survives CLI scene selection', () => {
  const decision = Decide('给现有 JS CLI 补表征测试', manifest);
  assert.ok(decision.active_recipe.skills.includes('testing-workflow-characterize'));
  assert.ok(decision.active_recipe.skills.includes('testing-js-idiom'));
  assert.ok(decision.active_recipe.skills.includes('testing-scenario-cli'));
  assert.ok(!decision.active_recipe.skills.includes('testing-workflow-spec'));
});

test('property request loads language and deep verification, not just candidates', () => {
  const decision = Decide('为 Rust 项目编写性质测试', manifest);
  assert.ok(decision.active_recipe.skills.includes('testing-rust-idiom'));
  assert.ok(decision.active_recipe.skills.includes('testing-property-mutation'));
});

test('quality overlays survive a testing-first review', () => {
  const decision = Decide('优先审阅测试体系，同时检查结构化日志、性能、安全和数据契约', manifest);
  for (const skill of ['testing-core-oracle', 'obs-core-paradigm', 'overlay-core-paradigm', 'sec-core-paradigm', 'contract-core-paradigm']) {
    assert.ok(decision.active_recipe.skills.includes(skill), skill);
  }
  assert.equal(adapt(decision).promptAction, 'review');
});

test('engineering and protocol domains have executable routing definitions', () => {
  assert.equal(Decide('优化可观测性与数据契约', manifest).domain, 'engineering');
  const decision = Decide('xfqtrace 流量窗口切片', manifest);
  assert.equal(decision.domain, 'protocol');
  assert.ok(decision.active_recipe.skills.includes('ui-oracle-protocol'));
  assert.equal(adapt(decision).allowCaseInit, false);
});

test('router confidence never grants case creation permission', () => {
  const decision = Decide('使用 jadx 与 frida 分析 APK', manifest);
  assert.equal(decision.domain, 'reverse');
  assert.equal(adapt(decision).allowCaseInit, false);
});

test('disabled and missing skills cannot be loaded', () => {
  for (const status of ['disabled', 'missing']) {
    const input = structuredClone(manifest);
    input.availability = { ...input.availability, 'testing-js-idiom': status };
    const decision = Decide('使用 testing-js-idiom', input);
    assert.notEqual(decision.action, 'dispatch');
    assert.ok(!adapt(decision).loadSkills.includes('testing-js-idiom'));
  }
});

test('malformed decisions fail closed', () => {
  for (const input of [null, {}, { action: 'execute', active_recipe: { skills: ['apk-reverse'] } }, { schemaVersion: '99.0', mode: 'implement', action: 'dispatch' }]) {
    assert.equal(adapt(input).promptAction, 'handoff');
    assert.deepEqual(adapt(input).loadSkills, []);
    assert.equal(adapt(input).allowCaseInit, false);
  }
});

test('decisions do not mutate their manifest and are replayable', () => {
  const before = structuredClone(manifest);
  const hint = '审阅测试和日志';
  assert.deepEqual(Decide(hint, manifest), Decide(hint, manifest));
  assert.deepEqual(manifest, before);
});

test('excluding the required Oracle cannot silently activate a workflow alone', () => {
  const decision = Decide('不使用 testing-core-oracle；为 CLI 编写测试', manifest);
  assert.notEqual(decision.action, 'dispatch');
  assert.deepEqual(adapt(decision).loadSkills, []);
});

test('invalid manifest collections return a diagnostic, not a crash', () => {
  for (const damage of [
    value => { value.recipes['spec-driven-greenfield'].skills = 42; },
    value => { value.domains.engineering.skillTriggers['obs-core-paradigm'] = null; },
    value => { value.domains.engineering.qualityGateTriggers = null; },
    value => { value.domains.testing.skills = [null]; }
  ]) {
    const input = structuredClone(manifest);
    damage(input);
    const decision = Decide('编写测试并添加日志', input);
    assert.equal(decision.action, 'handoff');
    assert.ok(decision.reasons.some(reason => reason.startsWith('invalid_')));
  }
});

test('adapter rejects inconsistent control state and non-skill paths', () => {
  const valid = Decide('为 Rust 编写测试', manifest);
  for (const patch of [
    { domain: 'none' },
    { confidence: 'guaranteed' },
    { must_not: ['modify_files'] },
    { candidates: ['../private'], active_recipe: { name: 'bad', skills: ['../private'] } }
  ]) {
    const adapted = adapt({ ...valid, ...patch });
    assert.equal(adapted.promptAction, 'handoff');
    assert.deepEqual(adapted.loadSkills, []);
  }
});

test('adapter tolerates additive diagnostic fields', () => {
  const valid = Decide('为 Rust 编写测试', manifest);
  const adapted = adapt({ ...valid, trace_id: 'synthetic-trace', diagnostics: { source: 'fixture' } });
  assert.equal(adapted.promptAction, 'implement');
  assert.ok(adapted.loadSkills.includes('testing-rust-idiom'));
});

test('all non-implementation modes preserve restrictions in the adapter', () => {
  for (const [hint, action] of [['审阅 testing-js-idiom', 'review'], ['规划 testing-js-idiom', 'plan'], ['解释 testing-js-idiom', 'overview_explain']]) {
    const adapted = adapt(Decide(hint, manifest));
    assert.equal(adapted.promptAction, action);
    for (const restriction of ['modify_files', 'install_tools', 'execute_target']) assert.ok(adapted.mustNot.includes(restriction));
  }
});
