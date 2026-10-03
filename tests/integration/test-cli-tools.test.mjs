import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';

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

function spawnAsync(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = options.timeout ? setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error(`Command timed out after ${options.timeout}ms: ${cmd} ${args.join(' ')}`));
    }, options.timeout) : null;

    if (proc.stdout) proc.stdout.on('data', d => { stdout += d.toString('utf8'); });
    if (proc.stderr) proc.stderr.on('data', d => { stderr += d.toString('utf8'); });

    proc.on('error', err => {
      if (timer) clearTimeout(timer);
      reject(err);
    });

    proc.on('close', code => {
      if (timer) clearTimeout(timer);
      resolve({ status: code, stdout, stderr });
    });
  });
}

async function runScenario(scenario) {
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
    let remoteHead = '';
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
    if (scenario === 'update-writeback') {
      // 本机 git 仓当远端：fetch 路径真实走通但零网络
      const remote = path.join(temp, 'remote-src');
      fs.mkdirSync(remote);
      await spawnAsync('git', ['init', '-b', 'main', '-q'], { cwd: remote });
      await spawnAsync('git', ['-C', remote, 'config', 'user.email', 't@t']);
      await spawnAsync('git', ['-C', remote, 'config', 'user.name', 't']);
      fs.writeFileSync(path.join(remote, 'f.txt'), 'fixture\n');
      await spawnAsync('git', ['-C', remote, 'add', '-A']);
      await spawnAsync('git', ['-C', remote, 'commit', '-qm', 'init']);
      remoteHead = (await spawnAsync('git', ['-C', remote, 'rev-parse', '--short', 'HEAD'])).stdout.trim();
      fs.mkdirSync(path.join(root, 'vertical'), { recursive: true });
      await spawnAsync('git', ['clone', '-q', remote, path.join(root, 'vertical', 'foo')]);
      // 长名条目先于短名条目——前缀名 foo 的回写不得劫持 foo-extended 的块
      body += `vertical:\n  - name: foo-extended\n    path: vertical/foo-extended\n    repo: ${remote}\n    pin: abc1234\n    enabled: true\n    deploy: {}\n  - name: foo\n    path: vertical/foo\n    repo: ${remote}\n    pin: abc1234\n    enabled: true\n    deploy: {}\n`;
    }
    if (scenario === 'update-ttl-expiry') {
      // 过期缓存须走 fetch 而非命中——lastRemoteHead 与本地一致，仅日期陈旧，
      // 隔离 TTL 为唯一过期触发因子
      const remote = path.join(temp, 'remote-src');
      fs.mkdirSync(remote);
      await spawnAsync('git', ['init', '-b', 'main', '-q'], { cwd: remote });
      await spawnAsync('git', ['-C', remote, 'config', 'user.email', 't@t']);
      await spawnAsync('git', ['-C', remote, 'config', 'user.name', 't']);
      fs.writeFileSync(path.join(remote, 'f.txt'), 'fixture\n');
      await spawnAsync('git', ['-C', remote, 'add', '-A']);
      await spawnAsync('git', ['-C', remote, 'commit', '-qm', 'init']);
      remoteHead = (await spawnAsync('git', ['-C', remote, 'rev-parse', '--short', 'HEAD'])).stdout.trim();
      fs.mkdirSync(path.join(root, 'vertical'), { recursive: true });
      await spawnAsync('git', ['-C', remote, 'clone', '-q', '.', path.join(root, 'vertical', 'foo')]);
      body += `vertical:\n  - name: foo\n    path: vertical/foo\n    repo: ${remote}\n    pin: abc1234\n    enabled: true\n    deploy: {}\n    checkCache:\n      lastCheckedAt: 2020-01-01\n      lastRemoteHead: ${remoteHead}\n`;
    }
    const registry = path.join(root, 'registry.yaml');
    fs.writeFileSync(registry, body);
    const invoke = (script, ...args) => spawnAsync('pwsh', ['-NoProfile', '-File', path.join(project, 'scripts', script),
      '-RegistryPath', registry, '-RepoRoot', root, ...args], { cwd: root, timeout: 30000 });
    const before = tree(root);
    if (scenario === 'unknown-wrapper' || scenario === 'missing-wrapper-source' || scenario === 'missing-special-source') {
      const result = await spawnAsync('pwsh', ['-NoProfile', '-File', path.join(project, 'scripts/build-deployable.ps1'),
        '-RepoRoot', root, '-Module', scenario === 'unknown-wrapper' ? 'unknown-wrapper' : scenario === 'missing-special-source' ? 'rs-js-reverse' : 'hello-js-reverse'], { timeout: 30000 });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /unknown_deployable_module|missing_deployable_source/);
      assert.deepEqual(tree(root), before);
    } else if (scenario === 'preserve-wrapper') {
      const upstream = path.join(root, 'vertical/hello-js-reverse-skill');
      const wrapper = path.join(root, 'deployable/hello-js-reverse');
      fs.mkdirSync(path.join(upstream, 'scripts'), { recursive: true });
      fs.mkdirSync(path.join(upstream, '.git'), { recursive: true });
      fs.mkdirSync(wrapper, { recursive: true });
      fs.writeFileSync(path.join(upstream, 'SKILL.md'), 'upstream-original');
      fs.writeFileSync(path.join(upstream, 'scripts/tool.js'), 'upstream-resource');
      fs.writeFileSync(path.join(upstream, '.git/HEAD'), 'ref: refs/heads/main\n');
      fs.writeFileSync(path.join(wrapper, 'SKILL.md'), 'locally-reviewed-wrapper');
      const original = tree(upstream);
      for (let repeat = 0; repeat < 2; repeat++) {
        const result = await spawnAsync('pwsh', ['-NoProfile', '-File', path.join(project, 'scripts/build-deployable.ps1'),
          '-RepoRoot', root, '-Module', 'hello-js-reverse'], { timeout: 30000 });
        assert.equal(result.status, 0, result.stderr);
        assert.equal(fs.readFileSync(path.join(wrapper, 'SKILL.md'), 'utf8'), 'locally-reviewed-wrapper');
        assert.equal(fs.readFileSync(path.join(wrapper, 'scripts/tool.js'), 'utf8'), 'upstream-resource');
        assert.ok(fs.lstatSync(path.join(wrapper, 'scripts')).isSymbolicLink(), 'wrapper links upstream entries');
        assert.ok(!fs.existsSync(path.join(wrapper, '.git')), 'vendored .git must never reach deployable');
        assert.deepEqual(tree(upstream), original);
      }
    } else if (scenario === 'dry-run' || scenario === 'deploy') {
      const result = await invoke('sync.ps1', ...(scenario === 'dry-run' ? ['-DryRun'] : []));
      assert.equal(result.status, 0, `${scenario}: ${result.stderr}`);
      assert.match(result.stdout, /\[sync\] 完成:/);
      if (scenario === 'dry-run') assert.deepEqual(tree(root), before);
      else {
        assert.equal(fs.readFileSync(path.join(target, 'sample-skill/references/rules.md'), 'utf8'), 'fixture-rule\n');
        assert.deepEqual(fs.readFileSync(path.join(target, 'sample-skill/SKILL.md')), fs.readFileSync(path.join(source, 'SKILL.md')));
        const secondSync = await invoke('sync.ps1');
        assert.equal(secondSync.status, 0);
        assert.equal(fs.readFileSync(path.join(target, 'sample-skill/references/rules.md'), 'utf8'), 'fixture-rule\n');
      }
    } else if (scenario === 'update-dry-run') {
      const result = await invoke('update.ps1', '-DryRun', '-Force');
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /NOT_CHECKED/);
      assert.doesNotMatch(result.stdout, /\[OK\]/);
      assert.deepEqual(tree(root), before);
    } else if (scenario === 'update-writeback') {
      const result = await invoke('update.ps1', '-Force');
      assert.equal(result.status, 0, result.stderr);
      const text = fs.readFileSync(registry, 'utf8');
      // foo 自身块必须带 checkCache——前缀名(foo)回写不得劫持更早出现的长名(foo-extended)块
      const fooBlock = text.match(/ {2}- name: foo\n[\s\S]*?(?=\n {2}- name:|\n\S|$)/);
      const extBlock = text.match(/ {2}- name: foo-extended\n[\s\S]*?(?=\n {2}- name:|\n\S|$)/);
      assert.ok(extBlock && fooBlock, 'vertical entry blocks parseable');
      assert.match(extBlock[0], new RegExp(`lastRemoteHead: ${remoteHead}`), 'foo-extended keeps its own cache');
      assert.match(fooBlock[0], new RegExp(`lastRemoteHead: ${remoteHead}`), 'foo gets its own cache');
      // 二次运行: foo 有 .git 且 remote==local → cache 命中路径零网络
      const second = await invoke('update.ps1');
      assert.equal(second.status, 0, second.stderr);
      assert.match(second.stdout, /foo \[cache\]/);
    } else if (scenario === 'update-ttl-expiry') {
      // 不带 -Force：checkCache 日期陈旧 → 仍须走 fetch 并回写
      const result = await invoke('update.ps1');
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /\[OK\] foo \[fetch\]/, 'stale checkCache must bypass fast path');
      assert.doesNotMatch(result.stdout, /foo \[cache\]/);
      const text = fs.readFileSync(registry, 'utf8');
      const fooBlock = text.match(/ {2}- name: foo\n[\s\S]*?(?=\n {2}- name:|\n\S|$)/);
      assert.ok(fooBlock);
      assert.doesNotMatch(fooBlock[0], /lastCheckedAt: 2020-01-01/, 'stale checkCache must be rewritten');
      assert.match(fooBlock[0], new RegExp(`lastRemoteHead: ${remoteHead}`));
    } else if (scenario === 'build-whatif') {
      const upstream = path.join(root, 'vertical/hello-js-reverse-skill');
      fs.mkdirSync(path.join(upstream, 'scripts'), { recursive: true });
      fs.writeFileSync(path.join(upstream, 'SKILL.md'), 'upstream-skill');
      fs.writeFileSync(path.join(upstream, 'scripts/tool.js'), 'x');
      const beforeWhatIf = tree(root);
      const result = await spawnAsync('pwsh', ['-NoProfile', '-File', path.join(project, 'scripts/build-deployable.ps1'),
        '-RepoRoot', root, '-Module', 'hello-js-reverse', '-WhatIf'], { timeout: 30000 });
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(tree(root), beforeWhatIf, '-WhatIf must not create deployable/ or links');
    } else if (scenario === 'sync-void-junction') {
      // 虚空链接断言: dst 预置为指向不存在目标的 junction——穿透验证(Test-Path SKILL.md)
      // 必须看穿死链（先验其虚空），sync 检出"非本仓旧链"后删建治愈
      const dstLink = path.join(target, 'sample-skill');
      const dead = path.join(root, 'dead-target');
      fs.mkdirSync(dead, { recursive: true });
      fs.symlinkSync(dead, dstLink, 'junction');
      fs.rmSync(dead, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
      assert.equal(fs.existsSync(path.join(dstLink, 'SKILL.md')), false,
        'precondition: void junction must not resolve SKILL.md');
      const result = await invoke('sync.ps1');
      assert.equal(result.status, 0, result.stderr);
      assert.equal(fs.readFileSync(path.join(dstLink, 'SKILL.md'), 'utf8'),
        fs.readFileSync(path.join(source, 'SKILL.md'), 'utf8'),
        'void junction must be healed into a working deployment');
    } else if (scenario === 'install-hooks-whatif' || scenario === 'install-hooks-guard') {
      // 外仓脚手架：目标为独立 git 仓——隔离验证对外变异边界
      const foreign = path.join(root, 'foreign-repo');
      fs.mkdirSync(foreign, { recursive: true });
      await spawnAsync('git', ['init', '-q', foreign]);
      await spawnAsync('git', ['-C', foreign, 'config', 'user.email', 't@t']);
      await spawnAsync('git', ['-C', foreign, 'config', 'user.name', 't']);
      const installer = path.join(project, 'scripts/install-hooks.ps1');
      if (scenario === 'install-hooks-whatif') {
        const beforeForeign = tree(foreign);
        const result = await spawnAsync('pwsh', ['-NoProfile', '-File', installer, '-Target', foreign, '-WhatIf'], { timeout: 30000 });
        assert.equal(result.status, 0, result.stderr);
        assert.deepEqual(tree(foreign), beforeForeign, '-WhatIf must leave foreign repo untouched');
        const hp = await spawnAsync('git', ['-C', foreign, 'config', 'core.hooksPath']);
        assert.notEqual(hp.stdout.trim(), '.githooks', '-WhatIf must not set core.hooksPath');
      } else {
        // 既有 hooksPath → 拒绝（防顶换旧体系）； -Force → 放行但不删旧件
        fs.mkdirSync(path.join(foreign, 'legacy-hooks'));
        fs.writeFileSync(path.join(foreign, 'legacy-hooks/pre-commit'), '#!/bin/sh\nexit 0\n');
        await spawnAsync('git', ['-C', foreign, 'config', 'core.hooksPath', 'legacy-hooks']);
        const denied = await spawnAsync('pwsh', ['-NoProfile', '-File', installer, '-Target', foreign], { timeout: 30000 });
        assert.notEqual(denied.status, 0, 'foreign hooksPath must refuse without -Force');
        assert.match(denied.stderr + denied.stdout, /hooksPath/);
        const ok = await spawnAsync('pwsh', ['-NoProfile', '-File', installer, '-Target', foreign, '-Force'], { timeout: 60000 });
        assert.equal(ok.status, 0, ok.stderr);
        assert.ok(fs.existsSync(path.join(foreign, '.githooks')), 'shims deployed');
        assert.ok(fs.existsSync(path.join(foreign, 'scripts/hooks/engine.mjs')), 'engine deployed');
        assert.ok(!fs.existsSync(path.join(foreign, 'scripts/hooks/gates.local')), 'gates.local must never ship in kit');
        const hp = await spawnAsync('git', ['-C', foreign, 'config', 'core.hooksPath']);
        assert.equal(hp.stdout.trim(), '.githooks');
        const gitDir = (await spawnAsync('git', ['-C', foreign, 'rev-parse', '--absolute-git-dir'])).stdout.trim();
        const state = JSON.parse(fs.readFileSync(path.join(gitDir, 'hook-engine-state.json'), 'utf8'));
        assert.ok(state.adoption?.sourceRepo && state.adoption?.sourceRev, 'adoption metadata recorded');
        assert.match(fs.readFileSync(path.join(foreign, '.gitignore'), 'utf8'), /^\.hooksrc\.local$/m);
        assert.ok(fs.existsSync(path.join(foreign, 'legacy-hooks/pre-commit')), 'legacy hooks preserved, only repointed');
      }
    } else {
      const lint = await invoke('lint.ps1', '-Json');
      if (scenario !== 'disabled') {
        assert.notEqual(lint.status, 0, `${scenario}: invalid deployment passed lint`);
        assert.ok(lint.stdout.trim(), `${scenario}: ${lint.stderr}`);
        const issues = JSON.parse(lint.stdout);
        assert.ok(Array.isArray(issues));
        assert.ok(issues.some(issue => issue.level === 'E'));
      }
      const sync = await invoke('sync.ps1', '-Module', 'sample-skill');
      assert.notEqual(sync.status, 0, `${scenario}: invalid deployment passed sync`);
      assert.deepEqual(tree(root), before, `${scenario}: invalid input changed files`);
    }
    console.log(`[PASS] CLI ${scenario}`);
  } finally {
    // Windows 拆台竞态：spawn 子进程/AV 索引器延迟释锁 → EBUSY；
    // maxRetries+retryDelay 是 Node 对该场景的内建重试（五次 ×300ms 吸收瞬时锁）
    fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  }
}

export async function run() {
  const scenarios = [
    'dry-run', 'deploy', 'missing', 'duplicate-name',
    'cross-section-duplicate', 'duplicate-key', 'unknown-client',
    'disabled', 'name-mismatch', 'empty-description',
    'update-dry-run', 'update-writeback', 'update-ttl-expiry', 'preserve-wrapper', 'unknown-wrapper',
    'missing-wrapper-source', 'missing-special-source', 'build-whatif',
    'install-hooks-whatif', 'install-hooks-guard', 'sync-void-junction'
  ];

  // 有界并发池 (并发上限 4)
  const CONCURRENCY = 4;
  let index = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (index < scenarios.length) {
      const current = scenarios[index++];
      await runScenario(current);
    }
  });
  await Promise.all(workers);

  const route = await spawnAsync(process.execPath, [path.join(project, 'scripts/route-core.mjs'), '为 Rust 项目编写性质测试'], { timeout: 10000 });
  assert.equal(route.status, 0, route.stderr);
  const decision = JSON.parse(route.stdout);
  assert.equal(decision.domain, 'testing');
  assert.ok(decision.active_recipe.skills.includes('testing-property-mutation'));
}

if (process.argv[1]?.endsWith('test-cli-tools.test.mjs')) {
  run().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
