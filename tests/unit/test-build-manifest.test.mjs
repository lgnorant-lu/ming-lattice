import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildRouterManifest } from '../../scripts/build-router-manifest.mjs';
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
    console.log('[PASS] manifest availability, invalid inputs, read-only build and isolated output');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

if (process.argv[1]?.endsWith('test-build-manifest.test.mjs')) run();
