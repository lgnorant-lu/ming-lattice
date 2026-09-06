import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const project = path.resolve(import.meta.dirname, '../..');

function tree(root) {
  return fs.readdirSync(root, { recursive: true }).sort().map(name => {
    const file = path.join(root, name);
    const stat = fs.lstatSync(file);
    const value = stat.isSymbolicLink() ? fs.readlinkSync(file)
      : stat.isDirectory() ? 'directory'
      : createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    return [name, value];
  });
}

export function run() {
  for (const scenario of ['dry-run', 'deploy', 'missing', 'duplicate-name', 'cross-section-duplicate', 'duplicate-key', 'unknown-client', 'disabled', 'name-mismatch', 'empty-description', 'update-dry-run', 'preserve-wrapper', 'unknown-wrapper', 'missing-wrapper-source', 'missing-special-source']) {
    const temp = fs.mkdtempSync(path.join(process.env.SKILLS_TEST_TMPDIR || os.tmpdir(), 'ming-cli-'));
    try {
      const root = path.join(temp, 'repo with spaces \u6d4b\u8bd5');
      const source = path.join(root, 'private/sample-skill');
      const target = path.join(root, 'client');
      fs.mkdirSync(path.join(source, 'references'), { recursive: true });
      fs.mkdirSync(target);
      fs.writeFileSync(path.join(source, 'SKILL.md'), '---\nname: sample-skill\ndescription: Isolated deployment fixture\n---\nSee [rules](references/rules.md).\n');
      fs.writeFileSync(path.join(source, 'references/rules.md'), 'fixture-rule\n');
      const entry = '  - name: sample-skill\n    path: private/sample-skill\n    enabled: true\n    deploy:\n      test: true\n';
      let body = `schemaVersion: "1.1"\ntargets:\n  test: "${target}"\nprivate:\n${entry}`;
      if (scenario === 'duplicate-name') body += entry;
      if (scenario === 'cross-section-duplicate') body += `vertical:\n  - name: sample-skill\n    path: private/sample-skill\n    repo: https://example.invalid/repo.git\n    pin: abc1234\n    enabled: true\n    deploy:\n      test: true\n`;
      if (scenario === 'duplicate-key') body = body.replace('    enabled: true', '    enabled: false\n    enabled: true');
      if (scenario === 'unknown-client') body = body.replace('      test: true', '      unknown: true');
      if (scenario === 'disabled') body = body.replace('    enabled: true', '    enabled: false');
      if (scenario === 'missing') {
        fs.rmSync(path.join(source, 'SKILL.md'));
        fs.writeFileSync(path.join(source, 'README.md'), 'Not a deployable skill');
      }
      if (scenario === 'name-mismatch') fs.writeFileSync(path.join(source, 'SKILL.md'), '---\nname: wrong\ndescription: Wrong identity fixture\n---\n');
      if (scenario === 'empty-description') fs.writeFileSync(path.join(source, 'SKILL.md'), '---\nname: sample-skill\ndescription: ""\n---\n');
      if (scenario === 'update-dry-run') {
        body += 'vertical:\n  - name: example\n    path: vertical/example\n    repo: https://example.invalid/repo.git\n    pin: abc1234\n    enabled: true\n    deploy: {}\n';
      }
      const registry = path.join(root, 'registry.yaml');
      fs.writeFileSync(registry, body);
      const invoke = (script, ...args) => spawnSync('pwsh', ['-NoProfile', '-File', path.join(project, 'scripts', script),
        '-RegistryPath', registry, '-RepoRoot', root, ...args], { cwd: root, encoding: 'utf8', timeout: 30000 });
      const before = tree(root);
      if (scenario === 'unknown-wrapper' || scenario === 'missing-wrapper-source' || scenario === 'missing-special-source') {
        const result = spawnSync('pwsh', ['-NoProfile', '-File', path.join(project, 'scripts/build-deployable.ps1'),
          '-RepoRoot', root, '-Module', scenario === 'unknown-wrapper' ? 'unknown-wrapper' : scenario === 'missing-special-source' ? 'rs-js-reverse' : 'hello-js-reverse'], { encoding: 'utf8', timeout: 30000 });
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /unknown_deployable_module|missing_deployable_source/);
        assert.deepEqual(tree(root), before);
      } else if (scenario === 'preserve-wrapper') {
        const upstream = path.join(root, 'vertical/hello-js-reverse-skill');
        const wrapper = path.join(root, 'deployable/hello-js-reverse');
        fs.mkdirSync(path.join(upstream, 'scripts'), { recursive: true });
        fs.mkdirSync(wrapper, { recursive: true });
        fs.writeFileSync(path.join(upstream, 'SKILL.md'), 'upstream-original');
        fs.writeFileSync(path.join(upstream, 'scripts/tool.js'), 'upstream-resource');
        fs.writeFileSync(path.join(wrapper, 'SKILL.md'), 'locally-reviewed-wrapper');
        const original = tree(upstream);
        for (let repeat = 0; repeat < 2; repeat++) {
          const result = spawnSync('pwsh', ['-NoProfile', '-File', path.join(project, 'scripts/build-deployable.ps1'),
            '-RepoRoot', root, '-Module', 'hello-js-reverse'], { encoding: 'utf8', timeout: 30000 });
          assert.equal(result.status, 0, result.stderr);
          assert.equal(fs.readFileSync(path.join(wrapper, 'SKILL.md'), 'utf8'), 'locally-reviewed-wrapper');
          assert.equal(fs.readFileSync(path.join(wrapper, 'scripts/tool.js'), 'utf8'), 'upstream-resource');
          assert.deepEqual(tree(upstream), original);
        }
      } else if (scenario === 'dry-run' || scenario === 'deploy') {
        const result = invoke('sync.ps1', ...(scenario === 'dry-run' ? ['-DryRun'] : []));
        assert.equal(result.status, 0, `${scenario}: ${result.stderr}`);
        assert.match(result.stdout, /\[sync\] 完成:/);
        if (scenario === 'dry-run') assert.deepEqual(tree(root), before);
        else {
          assert.equal(fs.readFileSync(path.join(target, 'sample-skill/references/rules.md'), 'utf8'), 'fixture-rule\n');
          assert.deepEqual(fs.readFileSync(path.join(target, 'sample-skill/SKILL.md')), fs.readFileSync(path.join(source, 'SKILL.md')));
          assert.equal(invoke('sync.ps1').status, 0);
          assert.equal(fs.readFileSync(path.join(target, 'sample-skill/references/rules.md'), 'utf8'), 'fixture-rule\n');
        }
      } else if (scenario === 'update-dry-run') {
        const result = invoke('update.ps1', '-DryRun', '-Force');
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /NOT_CHECKED/);
        assert.doesNotMatch(result.stdout, /\[OK\]/);
        assert.deepEqual(tree(root), before);
      } else {
        const lint = invoke('lint.ps1', '-Json');
        if (scenario !== 'disabled') {
          assert.notEqual(lint.status, 0, `${scenario}: invalid deployment passed lint`);
          assert.ok(lint.stdout.trim(), `${scenario}: ${lint.stderr}`);
          const issues = JSON.parse(lint.stdout);
          assert.ok(Array.isArray(issues));
          assert.ok(issues.some(issue => issue.level === 'E'));
        }
        const sync = invoke('sync.ps1', '-Module', 'sample-skill');
        assert.notEqual(sync.status, 0, `${scenario}: invalid deployment passed sync`);
        assert.deepEqual(tree(root), before, `${scenario}: invalid input changed files`);
      }
      console.log(`[PASS] CLI ${scenario}`);
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  }
  const route = spawnSync(process.execPath, [path.join(project, 'scripts/route-core.mjs'), '为 Rust 项目编写性质测试'], { encoding: 'utf8', timeout: 10000 });
  assert.equal(route.status, 0, route.stderr);
  const decision = JSON.parse(route.stdout);
  assert.equal(decision.domain, 'testing');
  assert.ok(decision.active_recipe.skills.includes('testing-property-mutation'));
}

if (process.argv[1]?.endsWith('test-cli-tools.test.mjs')) run();
