import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Decide, adapt } from '../../scripts/route-core.mjs';

const manifest = JSON.parse(fs.readFileSync(new URL('../../config/router-manifest.json', import.meta.url), 'utf8'));
const fixtures = JSON.parse(fs.readFileSync(new URL('./route-effects.json', import.meta.url), 'utf8'));

function sameMembers(actual, expected) {
  assert.deepEqual([...new Set(actual)].sort(), [...new Set(expected)].sort());
}

export function run() {
  for (const fixture of fixtures) {
    assert.equal(fixture.kind, 'spec', `${fixture.id}: fixture must be an independent spec`);
    assert.ok(fixture.source, `${fixture.id}: fixture must record its oracle source`);
    const decision = Decide(fixture.hint, manifest);
    const adapted = adapt(decision);
    const expected = fixture.expected;

    assert.equal(decision.mode, expected.mode, fixture.id);
    assert.equal(decision.domain, expected.domain, fixture.id);
    assert.equal(decision.action, expected.action, fixture.id);
    assert.equal(decision.active_recipe.name, expected.recipe, fixture.id);
    assert.equal(adapted.promptAction, expected.promptAction, fixture.id);
    sameMembers(adapted.loadSkills, expected.loadSkills);
    for (const skill of expected.loadSkills) assert.ok(adapted.loadSkills.includes(skill), `${fixture.id}: ${skill}`);
    for (const skill of expected.loadSkillsExclude || []) assert.ok(!adapted.loadSkills.includes(skill), `${fixture.id}: excluded ${skill}`);
    for (const skill of expected.candidateIncludes || []) assert.ok(decision.candidates.includes(skill), `${fixture.id}: candidate ${skill}`);
    for (const operation of expected.mustNotIncludes || []) assert.ok(adapted.mustNot.includes(operation), `${fixture.id}: ${operation}`);
    assert.equal(adapted.allowCaseInit, expected.allowCaseInit, fixture.id);
  }
  console.log(`[PASS] route-effects: ${fixtures.length} independent behavior fixtures`);
}

if (process.argv[1]?.endsWith('test-route-effects.mjs')) run();
