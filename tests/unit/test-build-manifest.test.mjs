import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildRouterManifest, validateRouterDefs } from '../../scripts/build-router-manifest.mjs';
import { Decide } from '../../scripts/route-core.mjs';

export function run() {
  const root = fs.mkdtempSync(path.join(process.env.SKILLS_TEST_TMPDIR || os.tmpdir(), 'ming-manifest-'));
  try {
    const names = [
      'testing-core-oracle', 'testing-workflow-spec', 'testing-workflow-characterize',
      'testing-property-mutation', 'testing-rust-idiom', 'testing-python-idiom',
      'testing-js-idiom', 'testing-go-idiom', 'testing-scenario-cli',
      'testing-scenario-scraper', 'testing-scenario-embed-ffi',
      'docs-core-paradigm', 'docs-presentation-idiom', 'obs-core-paradigm',
      'sec-core-paradigm', 'contract-core-paradigm', 'overlay-core-paradigm',
      'reverse-skill-router', 'ui-design-paradigms', 'ui-oracle-protocol', 'xfqtrace-kit'
    ];
    const registry = { private: names.map(name => ({ name, path: `private/${name}`, enabled: true, deploy: { test: true } })) };
    for (const item of registry.private) {
      fs.mkdirSync(path.join(root, item.path), { recursive: true });
      fs.writeFileSync(path.join(root, item.path, 'SKILL.md'), `---\nname: ${item.name}\ndescription: Synthetic manifest fixture\n---\n`);
    }
    const build = () => buildRouterManifest({ registry, repoRoot: root, generatedAt: '2026-01-01T00:00:00.000Z' });
    const manifest = build();
    assert.equal(manifest.version, '2.0.0');
    assert.deepEqual(build(), manifest);
    assert.ok(!fs.existsSync(path.join(root, 'config')));
    for (const name of names) assert.equal(manifest.availability[name], 'ready', name);
    for (const name of ['testing', 'reverse', 'ui', 'protocol', 'engineering']) {
      assert.ok(manifest.recipes[manifest.domains[name].defaultRecipe], name);
    }
    for (const recipe of Object.values(manifest.recipes)) {
      assert.ok(manifest.domains[recipe.domain]);
      for (const skill of recipe.skills) assert.ok(Object.hasOwn(manifest.availability, skill), skill);
    }
    // 作者期校验：defs/recipes 引用错名在构建时 fail-closed（消费侧只剩运行时降级）
    assert.doesNotThrow(() => validateRouterDefs());
    const badTriggerDefs = structuredClone(manifest.domains);
    badTriggerDefs.engineering.skillTriggers['ghost-skill'] = ['x'];
    assert.throws(() => validateRouterDefs(badTriggerDefs, manifest.recipes), /orphan_skill_trigger: engineering\/ghost-skill/);
    const badDomainRecipes = structuredClone(manifest.recipes);
    badDomainRecipes['bogus-recipe'] = { domain: 'nope', skills: [] };
    assert.throws(() => validateRouterDefs(manifest.domains, badDomainRecipes), /unknown_recipe_domain: bogus-recipe/);
    const badSkillRecipes = structuredClone(manifest.recipes);
    badSkillRecipes['bogus-recipe'] = { domain: 'testing', skills: ['ghost-skill'] };
    assert.throws(() => validateRouterDefs(manifest.domains, badSkillRecipes), /orphan_recipe_skill: bogus-recipe\/ghost-skill/);
    const js = registry.private.find(item => item.name === 'testing-js-idiom');
    js.enabled = false;
    assert.equal(build().availability[js.name], 'disabled');
    assert.notEqual(Decide(`使用 ${js.name}`, build()).action, 'dispatch');
    js.enabled = true;
    fs.rmSync(path.join(root, js.path, 'SKILL.md'));
    assert.equal(build().availability[js.name], 'missing');
    fs.writeFileSync(path.join(root, js.path, 'SKILL.md'), '---\nname: wrong-name\ndescription: Wrong identity\n---\n');
    assert.equal(build().availability[js.name], 'invalid');
    for (const description of ['""', "''", '|', '>']) {
      fs.writeFileSync(path.join(root, js.path, 'SKILL.md'), `---\nname: ${js.name}\ndescription: ${description}\n---\n`);
      assert.equal(build().availability[js.name], 'invalid', `empty description: ${description}`);
    }
    fs.writeFileSync(path.join(root, js.path, 'SKILL.md'), `---\nname: ${js.name}\ndescription: |\n  Valid block description.\n---\n`);
    assert.equal(build().availability[js.name], 'ready');
    assert.equal(build().availability['apk-reverse'], 'unregistered');
    assert.throws(() => buildRouterManifest({ repoRoot: root, registry: { private: [js, js] } }), /duplicate_skill/);
    assert.throws(() => buildRouterManifest({ repoRoot: root, registry: { private: [{ ...js, path: '../escape' }] } }), /invalid_skill_path/);
    buildRouterManifest({ registry, repoRoot: root, write: true, generatedAt: manifest.generatedAt });
    assert.deepEqual(
      fs.readFileSync(path.join(root, 'config/router-manifest.json')),
      fs.readFileSync(path.join(root, 'private/ming-skills-router/config/router-manifest.json'))
    );
    assert.ok(!fs.readdirSync(path.join(root, 'config')).some(name => name.endsWith('.tmp')));

    // schema 绑定：docs/schemas/router-manifest.schema.json 必须有消费者——
    // 真实提交件按声明 required 字段对账（无依赖最小断言，同仓契约套件同款）
    const repo = path.resolve(import.meta.dirname, '../..');
    const schema = JSON.parse(fs.readFileSync(path.join(repo, 'docs/schemas/router-manifest.schema.json'), 'utf8'));
    const real = JSON.parse(fs.readFileSync(path.join(repo, 'config/router-manifest.json'), 'utf8'));
    for (const k of schema.required) assert.ok(Object.hasOwn(real, k), `manifest 缺 required: ${k}`);
    const domReq = schema.properties.domains.additionalProperties.required;
    for (const [name, d] of Object.entries(real.domains))
      for (const k of domReq) assert.ok(Object.hasOwn(d, k), `domain ${name} 缺 ${k}`);
    const recReq = schema.properties.recipes.additionalProperties.required;
    for (const [name, r] of Object.entries(real.recipes))
      for (const k of recReq) assert.ok(Object.hasOwn(r, k), `recipe ${name} 缺 ${k}`);

    console.log('[PASS] manifest availability, invalid inputs, read-only build and isolated output');
  } finally {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  }
}

if (process.argv[1]?.endsWith('test-build-manifest.test.mjs')) run();
