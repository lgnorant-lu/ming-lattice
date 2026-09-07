import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Decide, adapt } from '../../scripts/route-core.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'config/router-manifest.json'), 'utf8'));
const schema = JSON.parse(fs.readFileSync(path.join(root, 'docs/schemas/route-decision.schema.json'), 'utf8'));
const fixtures = JSON.parse(fs.readFileSync(new URL('./route-decision-compatibility.json', import.meta.url), 'utf8'));

function materialize(base, fixture) {
  const decision = structuredClone(base);
  Object.assign(decision, fixture.patch || {}, fixture.replace || {});
  if (fixture.mustNotAppend) decision.must_not.push(...fixture.mustNotAppend);
  for (const field of fixture.omit || []) delete decision[field];
  return decision;
}

export function run() {
  console.log('[TEST CONTRACT] RouteDecision producer-consumer compatibility matrix...');
  const base = Decide('为 Rust 项目编写性质测试', manifest);
  for (const field of schema.required) assert.ok(Object.hasOwn(base, field), `base decision missing ${field}`);

  for (const fixture of fixtures) {
    assert.equal(fixture.kind, 'spec', `${fixture.id}: fixture must be a spec`);
    assert.ok(fixture.source, `${fixture.id}: fixture must record its oracle source`);
    const adapted = adapt(materialize(base, fixture));
    const expected = fixture.expected;

    assert.equal(adapted.promptAction, expected.promptAction, fixture.id);
    assert.deepEqual(adapted.loadSkills, expected.loadSkills, fixture.id);
    assert.equal(adapted.allowCaseInit, false, `${fixture.id}: adapter must never grant case init`);
    if (expected.accepted) {
      assert.deepEqual(adapted.injectedCandidates, base.candidates, `${fixture.id}: additive fields changed candidates`);
    } else {
      assert.deepEqual(adapted.injectedCandidates, [], `${fixture.id}: rejected control input must not inject candidates`);
    }
    for (const value of expected.mustNotIncludes || []) assert.ok(adapted.mustNot.includes(value), `${fixture.id}: missing ${value}`);
  }

  // CLI invocation contract test for benchmark flags
  const benchScript = path.join(root, 'tests/benchmarks/route-performance.mjs');
  const invalidRun = spawnSync(process.execPath, [benchScript, '--invalid-flag'], { cwd: root, encoding: 'utf8', timeout: 10000 });
  assert.equal(invalidRun.status, 2, 'invalid CLI flag must exit with code 2');
  assert.match(invalidRun.stderr, /usage:/);

  console.log(`  -> ${fixtures.length} version, additive-field, fail-closed fixtures and benchmark CLI contract passed`);
}

if (process.argv[1]?.endsWith('test-route-decision-compatibility.mjs')) run();
