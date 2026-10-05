// tests/unit/test-bootstrap.test.mjs — bootstrap.mjs 契约
// 覆盖：dry-run 零副作用 / 死链接检测修复 / 相对目标语义 / 仓外绝对目标拒修 / hooksPath 自举 / 幂等
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BOOT = path.join(root, 'scripts/bootstrap.mjs');

function tempRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'boot-'));
  const g = a => execFileSync('git', a, { cwd: dir, encoding: 'utf8' });
  g(['init', '-q']); g(['config', 'user.email', 't@t.t']); g(['config', 'user.name', 't']);
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  fs.cpSync(BOOT, path.join(dir, 'scripts/bootstrap.mjs'));
  fs.mkdirSync(path.join(dir, '.githooks'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.githooks/pre-commit'), '#!/usr/bin/env sh\nexit 0\n');
  fs.writeFileSync(path.join(dir, 'init.md'), 'x\n');
  g(['add', '.']); g(['commit', '-qm', 'init']);
  return { dir, g };
}

export function run() {
  // 死链接 fixture：index 种 120000（blob=相对目标文本），工作区是同名文本文件——
  // 模拟 core.symlinks=false 的 Windows 克隆形态
  const { dir, g } = tempRepo();
  try {
    fs.mkdirSync(path.join(dir, 'vertical/pkg/references'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'vertical/pkg/references/r.md'), 'doc\n');
    fs.mkdirSync(path.join(dir, 'deployable/pkg'), { recursive: true });
    const linkText = '../../vertical/pkg/references';
    fs.writeFileSync(path.join(dir, 'deployable/pkg/references'), linkText);   // 死链接=文本文件
    const blob = g(['hash-object', '-w', 'deployable/pkg/references']).trim();
    g(['update-index', '--add', '--cacheinfo', `120000,${blob},deployable/pkg/references`]);

    // dry-run：报告但不改
    const dry = spawnSync(process.execPath, ['scripts/bootstrap.mjs', '--dry-run', '--skip-fetch'], { cwd: dir, encoding: 'utf8' });
    assert.equal(dry.status, 0, dry.stderr);
    assert.ok(dry.stdout.includes('死链接'), 'dry-run 应报死链接计数');
    assert.ok(!fs.lstatSync(path.join(dir, 'deployable/pkg/references')).isSymbolicLink(), 'dry-run 不得修链');

    // 真跑：死链接修成活链（junction/symlink），写相对目标语义
    const run = spawnSync(process.execPath, ['scripts/bootstrap.mjs', '--skip-fetch'], { cwd: dir, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const st = fs.lstatSync(path.join(dir, 'deployable/pkg/references'));
    assert.ok(st.isSymbolicLink(), '死链接应被修成符号链接/junction');
    assert.ok(fs.existsSync(path.join(dir, 'deployable/pkg/references/r.md')), '链接应可解析到目标内容');
    assert.equal(g(['config', '--get', 'core.hooksPath']).trim(), '.githooks', 'hooksPath 应自举');

    // 幂等：再跑无重复修复量
    const again = spawnSync(process.execPath, ['scripts/bootstrap.mjs', '--skip-fetch'], { cwd: dir, encoding: 'utf8' });
    assert.ok(!again.stdout.includes('1 修复'), '幂等再跑不应重复修');

    // 仓外绝对目标：拒绝跨仓串线（不报错、计 missing、不建链）
    fs.mkdirSync(path.join(dir, 'deployable/pkg2'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'deployable/pkg2/docs'), '/nonexistent-abs-target');
    const blob2 = g(['hash-object', '-w', 'deployable/pkg2/docs']).trim();
    g(['update-index', '--add', '--cacheinfo', `120000,${blob2},deployable/pkg2/docs`]);
    const cross = spawnSync(process.execPath, ['scripts/bootstrap.mjs', '--skip-fetch'], { cwd: dir, encoding: 'utf8' });
    assert.equal(cross.status, 0, cross.stderr);
    assert.ok(!fs.lstatSync(path.join(dir, 'deployable/pkg2/docs')).isSymbolicLink(), '仓外目标不得建链');

    console.log('  -> bootstrap.mjs 断言全过（dry-run/死链接修复/相对目标/跨仓拒修/hooksPath/幂等）');
    return 0;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && process.argv[1].endsWith('test-bootstrap.test.mjs')) {
  process.exit(run());
}
