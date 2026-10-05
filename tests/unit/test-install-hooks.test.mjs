// tests/unit/test-install-hooks.test.mjs
// 单元测试: scripts/install-hooks.mjs（POSIX 补位 -Target 实现）
// 覆盖: 参数缺陷族 fail-closed / 非 git 仓拒绝 / --dry-run 零落盘 /
//   真跑产物面（kit+shim+tmpl+gitignore+hooksPath+元数据）/ gates.local 排除 /
//   幂等不覆盖 .hooksrc / 旧 hooksPath 防线+--force / --with-boundary 采纳面。
// ps1 -Target 路径由 cli-isolated WhatIf 套件+第二采纳者实证兜底。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const SCRIPT = path.join(REPO_ROOT, 'scripts/install-hooks.mjs');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'install-hooks-'));
const cli = (args) => spawnSync('node', [SCRIPT, ...args], { encoding: 'utf8' });
const git = (d, a) => {
  try { return execFileSync('git', a, { cwd: d, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return ''; }   // unset key / 非零退出 → 空串（断言侧区分）
};
const realRepo = () => {
  const d = tmp();
  git(d, ['init', '-q']);
  git(d, ['config', 'user.email', 't@t.t']);
  git(d, ['config', 'user.name', 't']);
  git(d, ['commit', '--allow-empty', '-qm', 'init']);
  return d;
};

const problems = [];
const check = (cond, msg) => { if (!cond) problems.push(msg); };
const dirs = [];
const track = d => (dirs.push(d), d);
const cpDir = (s, t) => {
  fs.mkdirSync(t, { recursive: true });
  for (const e of fs.readdirSync(s, { withFileTypes: true }))
    e.isDirectory() ? cpDir(path.join(s, e.name), path.join(t, e.name))
                    : fs.copyFileSync(path.join(s, e.name), path.join(t, e.name));
};

export function run() {
  console.log('[TEST UNIT] install-hooks.mjs...');

  // ── 参数缺陷族 ──
  {
    for (const [a, m] of [
      [['--targt', '/tmp/x'], '未知旗标未拒'],
      [['--target'], '缺值未拒'],
      [['--target', '--force'], '吞值未拒'],
      [['/tmp/x', '--force'], '位置参数未拒'],
      [[], '缺 --target 未拒'],
    ]) {
      const r = cli(a);
      check(r.status !== 0 && /\[E\]/.test(r.stderr || ''), `${m}: ${a.join(' ')}`);
    }
    const d = track(tmp()); fs.mkdirSync(path.join(d, '.git'));
    const r = cli(['--target', d, '--target', d]);
    check(r.status !== 0 && /重复旗标/.test(r.stderr || ''), '重复 --target 未拒');
  }

  // ── 非 git 仓 fail-closed ──
  {
    const d = track(tmp());
    const r = cli(['--target', d, '--dry-run']);
    check(r.status !== 0 && /不是 git 仓根/.test(r.stderr || ''), '非 git 仓未拒');
  }

  // ── dry-run 零落盘 ──
  {
    const d = track(realRepo());
    const before = fs.readdirSync(d).sort();
    const r = cli(['--target', d, '--dry-run', '--with-boundary']);
    check(r.status === 0, `dry-run 应成功: ${r.stderr}`);
    check(JSON.stringify(fs.readdirSync(d).sort()) === JSON.stringify(before),
      `dry-run 落盘了文件: ${fs.readdirSync(d)}`);
    check(git(d, ['config', 'core.hooksPath']) === '', 'dry-run 写了 hooksPath');
  }

  // ── 真跑产物面 + gates.local 排除 ──
  {
    const d = track(realRepo());
    const r = cli(['--target', d]);
    check(r.status === 0, `真跑失败: ${r.stderr}`);
    check(fs.existsSync(path.join(d, 'scripts/hooks/engine.mjs')), 'engine.mjs 未铺');
    check(fs.existsSync(path.join(d, 'scripts/hooks/gates/secrets.mjs')), 'gates 未铺');
    check(!fs.existsSync(path.join(d, 'scripts/hooks/gates.local')), 'gates.local 泄漏进 kit');
    check(fs.existsSync(path.join(d, '.githooks/pre-commit')), 'shim 未铺');
    check(fs.existsSync(path.join(d, '.hooksrc')), '.hooksrc 未铺');
    check(/\.hooksrc\.local/.test(fs.readFileSync(path.join(d, '.gitignore'), 'utf8')), '.gitignore 未追加');
    check(git(d, ['config', 'core.hooksPath']) === '.githooks', 'hooksPath 未设');
    const stateFile = path.join(git(d, ['rev-parse', '--absolute-git-dir']), 'hook-engine-state.json');
    check(fs.existsSync(stateFile) && JSON.parse(fs.readFileSync(stateFile, 'utf8')).adoption?.sourceRepo,
      '采纳元数据未写');
    // engine list 溯源戳可读（trust 已存值）
    const l = spawnSync('node', ['scripts/hooks/engine.mjs', 'list'], { cwd: d, encoding: 'utf8' });
    check(l.status === 0 && /kit 来源/.test(l.stdout + l.stderr), 'engine list 溯源戳缺席');
  }

  // ── 幂等：.hooksrc 不覆盖 ──
  {
    const d = track(realRepo());
    cli(['--target', d]);
    fs.writeFileSync(path.join(d, '.hooksrc'), '# 采纳侧自裁\n');
    const r = cli(['--target', d]);
    check(r.status === 0 && /已存在/.test(r.stdout + r.stderr), '幂等重跑未提示跳过');
    check(fs.readFileSync(path.join(d, '.hooksrc'), 'utf8') === '# 采纳侧自裁\n',
      '.hooksrc 被覆盖（配置应归采纳侧）');
  }

  // ── 旧 hooksPath 防线 + --force ──
  {
    const d = track(realRepo());
    fs.mkdirSync(path.join(d, 'oldhooks'));
    fs.writeFileSync(path.join(d, 'oldhooks/pre-commit'), 'x');
    git(d, ['config', 'core.hooksPath', 'oldhooks']);
    const r1 = cli(['--target', d]);
    check(r1.status !== 0 && /既有 hooksPath/.test(r1.stderr + r1.stdout), '旧 hooksPath 未拦');
    check(git(d, ['config', 'core.hooksPath']) === 'oldhooks', '拦截仍改了 hooksPath');
    const r2 = cli(['--target', d, '--force']);
    check(r2.status === 0 && git(d, ['config', 'core.hooksPath']) === '.githooks',
      '--force 未放行切换');
  }

  // ── --with-boundary 采纳面 ──
  {
    const d = track(realRepo());
    const r = cli(['--target', d, '--with-boundary']);
    check(r.status === 0, `boundary 铺入失败: ${r.stderr}`);
    check(fs.existsSync(path.join(d, 'boundaries.yaml')), 'boundaries.yaml 未铺');
    check(fs.existsSync(path.join(d, 'boundary.consumers/README.md')), 'consumers 约定区未铺');
    check(fs.existsSync(path.join(d, 'scripts/hooks/gates.local/boundary-edge.mjs')), 'boundary-edge 未铺');
    check(fs.existsSync(path.join(d, 'scripts/lib/yaml-lite.ps1')), 'yaml 桥未铺');
    check(fs.existsSync(path.join(d, 'private/engineering/ming-boundary/scripts/extract-facts.mjs')), 'boundary 运行面未铺');
    // 幂等：契约模板不覆盖
    fs.writeFileSync(path.join(d, 'boundaries.yaml'), '# 采纳侧契约\n');
    cli(['--target', d, '--with-boundary']);
    check(fs.readFileSync(path.join(d, 'boundaries.yaml'), 'utf8') === '# 采纳侧契约\n',
      'boundaries.yaml 被覆盖（契约应归采纳侧）');
  }

  // ── CRLF 传染防线：源工作区 shim 是 CRLF 时，目标仓须落 LF + .gitattributes 钉 ──
  // （install-hooks.mjs 按脚本位置自推导 REPO_ROOT——造 fixture 源仓注入 CRLF 源）
  {
    const src = track(tmp());
    fs.mkdirSync(path.join(src, 'scripts'), { recursive: true });
    fs.mkdirSync(path.join(src, '.githooks'), { recursive: true });
    fs.copyFileSync(SCRIPT, path.join(src, 'scripts/install-hooks.mjs'));
    cpDir(path.join(REPO_ROOT, 'scripts/hooks'), path.join(src, 'scripts/hooks'));
    fs.copyFileSync(path.join(REPO_ROOT, '.hooksrc.tmpl'), path.join(src, '.hooksrc.tmpl'));
    // 污染源 shim：autocrlf 机上 checkout 出的 CRLF 字节
    fs.writeFileSync(path.join(src, '.githooks/pre-commit'), '#!/usr/bin/env sh\r\nexec node x\r\n');

    const d = track(realRepo());
    const r = spawnSync('node', [path.join(src, 'scripts/install-hooks.mjs'), '--target', d], { encoding: 'utf8' });
    check(r.status === 0, `CRLF 源安装失败: ${r.stderr}`);
    const shim = fs.readFileSync(path.join(d, '.githooks/pre-commit'), 'utf8');
    check(!shim.includes('\r'), 'CRLF shim 传染进目标仓（LF 归一化失效）');
    check(/\.githooks\/\*\s+text\s+eol=lf/.test(fs.readFileSync(path.join(d, '.gitattributes'), 'utf8')),
      '.gitattributes eol=lf 钉未铺');
    // 幂等：钉行不重复追加
    spawnSync('node', [path.join(src, 'scripts/install-hooks.mjs'), '--target', d], { encoding: 'utf8' });
    const attr = fs.readFileSync(path.join(d, '.gitattributes'), 'utf8');
    check((attr.match(/\.githooks\/\*/g) || []).length === 1, '.gitattributes 钉重复追加');
  }

  // ── --check 只读漂移报告 ──
  {
    const d = track(realRepo());
    cli(['--target', d]);
    // clean: 刚铺完的采纳仓应报无漂移（adoption rev=源 HEAD 一致）
    let r = cli(['--target', d, '--check']);
    check(r.status === 0 && /无漂移/.test(r.stdout), `clean 应报无漂移: ${r.stdout}${r.stderr}`);

    // 漂移族：删 .hooksrc / 删 shim / 删 kit 件——全部如实列出，仍 exit 0
    fs.rmSync(path.join(d, '.hooksrc'));
    fs.rmSync(path.join(d, '.githooks/post-checkout'), { force: true });
    fs.rmSync(path.join(d, 'scripts/hooks/gates/secrets.mjs'));
    r = cli(['--target', d, '--check']);
    check(r.status === 0, `漂移应仍 exit 0（信息性）: ${r.status}`);
    check(/缺席.*hooksrc/.test(r.stdout), `.hooksrc 缺席未报: ${r.stdout}`);
    check(/shim 缺席.*post-checkout/.test(r.stdout), `shim 缺席未报: ${r.stdout}`);
    check(/kit 件缺席.*secrets/.test(r.stdout), `kit 件缺席未报: ${r.stdout}`);

    // 键集差：上游新键 + 采纳侧私键双向报告
    fs.writeFileSync(path.join(d, '.hooksrc'), 'localOnlyKey=true\n');
    r = cli(['--target', d, '--check']);
    check(/upstream 新键/.test(r.stdout), `tmpl 键缺席未报: ${r.stdout}`);
    check(/采纳侧键.*localOnlyKey/.test(r.stdout), `采纳侧私键未报: ${r.stdout}`);

    // shim 字节差
    fs.writeFileSync(path.join(d, '.githooks/pre-commit'), '# 改动\n');
    r = cli(['--target', d, '--check']);
    check(/shim 字节差.*pre-commit/.test(r.stdout), `shim 字节差未报: ${r.stdout}`);

    // 只读：--check 不产生任何新文件（排除 .git 内既有状态件）
    const snap = dir => {
      const out = [];
      const walk = (p, rel = '') => { for (const e of fs.readdirSync(p, { withFileTypes: true })) {
        const f = path.join(p, e.name), r2 = path.join(rel, e.name);
        if (r2.startsWith('.git')) continue;
        e.isDirectory() ? walk(f, r2) : out.push(r2);
      } };
      walk(dir); return out.sort();
    };
    const before = snap(d);
    cli(['--target', d, '--check']);
    check(JSON.stringify(snap(d)) === JSON.stringify(before), '--check 落了新文件（只读承诺违例）');
  }

  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  if (problems.length) {
    for (const p of problems) console.error(`  [FAIL] ${p}`);
    console.error(`  -> install-hooks.mjs ${problems.length} 断言失败`);
    return 1;
  }
  console.log('  -> install-hooks.mjs 断言全过（参数族/git前置/dry-run/产物面/gates.local排除/幂等/防线/force/boundary）');
  return 0;
}

if (process.argv[1] && process.argv[1].endsWith('test-install-hooks.test.mjs')) {
  process.exit(run());
}
