// tests/unit/test-eol-gate.test.mjs
// 单元测试: scripts/hooks/gates/eol.mjs
// 覆盖：钉制域钉缺席=error / eol=lf 域 staged CRLF=error / 无钉制裸 CRLF=warn /
//   -text 与 eol=crlf 策略放行 / NUL 嗅探跳过 / pinGlobs 配置覆盖 / fix 归一化工作区

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { gate } from '../../scripts/hooks/gates/eol.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'eol-gate-'));
const dirs = [];
const track = d => (dirs.push(d), d);
// stdin 必须留 'pipe'——hash-object --stdin / check-attr --stdin 靠它喂料
// （stdio[0]='ignore' 会静默吞成 EOF，造出"假空 blob"假测试面）
const git = (d, a, opts = {}) =>
  execFileSync('git', a, { cwd: d, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], ...opts }).trim();

const repo = (attrs) => {
  const d = track(tmp());
  git(d, ['init', '-q']);
  if (attrs !== null) fs.writeFileSync(path.join(d, '.gitattributes'), attrs);
  return d;
};

// plumbing 旁路造 staged blob——绕过 add 归一化（正是 eol=lf 域出现 CRLF 的唯一通道；
// 也规避宿主 autocrlf=input 让 git add 把 CRLF 测试料静默归一成 LF 的环境依赖）
const stageRaw = (d, p, content) => {
  const sha = git(d, ['hash-object', '-w', '--stdin'], { input: content });
  git(d, ['update-index', '--add', '--cacheinfo', `100644,${sha},${p}`]);
};

const stagedCtx = (d) => ({
  root: d,
  files: git(d, ['diff', '--cached', '--name-only', '--diff-filter=ACM']).split('\n').filter(Boolean),
  // cat-file blob 裸字节（kit files.mjs 同款）——git show 会做 textconv 转换失真
  read: (p) => git(d, ['cat-file', 'blob', `:${p}`]),
});

const problems = [];
const check = (cond, msg) => { if (!cond) problems.push(msg); };

export async function run() {
  console.log('[TEST UNIT] eol gate...');

  // 1. 钉制域钉缺席：.githooks/* 无 eol=lf → error
  {
    const d = repo('x text\n');
    fs.mkdirSync(path.join(d, '.githooks'));
    fs.writeFileSync(path.join(d, '.githooks/pre-commit'), '#!/usr/bin/env sh\nexit 0\n');
    git(d, ['add', '.gitattributes', '.githooks/pre-commit']);
    const f = await gate.run(stagedCtx(d));
    check(f.some(x => x.file === '.githooks/pre-commit' && x.level !== 'warn'),
      `钉制域钉缺席未拦: ${JSON.stringify(f)}`);
    check(!f.some(x => x.file === '.gitattributes'), 'attrs 文件被误报');
  }

  // 2. eol=lf 域 staged blob 含 CRLF（plumbing 旁路）→ error
  {
    const d = repo('* text=auto eol=lf\n.githooks/* text eol=lf\n');
    fs.writeFileSync(path.join(d, 'a.txt'), 'x\r\ny\r\n');
    git(d, ['add', '.gitattributes', 'a.txt']);   // porcelain 归一化 → blob LF
    stageRaw(d, 'b.txt', 'x\r\ny\r\n');           // 旁路 → blob CRLF
    const f = await gate.run(stagedCtx(d));
    check(!f.some(x => x.file === 'a.txt'), `归一化后的 LF blob 被误报: ${JSON.stringify(f)}`);
    check(f.some(x => x.file === 'b.txt' && x.level !== 'warn' && /renormalize/.test(x.message)),
      `eol=lf 域 CRLF blob 未拦: ${JSON.stringify(f)}`);
  }

  // 3. 无钉制裸 CRLF 似文本 → warn；显式 -text / eol=crlf → 放行
  //    （全走 plumbing：autocrlf 机上 git add 会先把 doc.md 归一成 LF 遮蔽被测面）
  {
    const d = repo('raw.bin -text\n*.bat text eol=crlf\n');
    git(d, ['add', '.gitattributes']);
    stageRaw(d, 'doc.md', 'a\r\nb\r\n');
    stageRaw(d, 'raw.bin', 'bin\r\ndata\r\n');
    stageRaw(d, 'run.bat', '@echo x\r\n');
    const f = await gate.run(stagedCtx(d));
    const doc = f.find(x => x.file === 'doc.md');
    check(doc && doc.level === 'warn', `无钉制裸 CRLF 未 warn: ${JSON.stringify(f)}`);
    check(!f.some(x => x.file === 'raw.bin'), '-text 策略文件被误报');
    check(!f.some(x => x.file === 'run.bat'), 'eol=crlf 策略文件被误报');
  }

  // 4. NUL 嗅探：似二进制内容不入"似文本"判定
  {
    const d = repo(null);
    stageRaw(d, 'weird.dat', 'x\0y\r\nz\r\n');
    const f = await gate.run(stagedCtx(d));
    check(!f.some(x => x.file === 'weird.dat'), `NUL 文件被误报: ${JSON.stringify(f)}`);
  }

  // 5. pinGlobs 配置覆盖：收窄钉制域后 .githooks 不再受限
  {
    const d = repo(null);
    fs.mkdirSync(path.join(d, '.githooks'));
    fs.writeFileSync(path.join(d, '.githooks/pre-push'), '#!/bin/sh\nexit 0\n');
    git(d, ['add', '.githooks/pre-push']);
    const ctx = { ...stagedCtx(d), gateConfig: { pinGlobs: 'hooks/**' } };
    const f = await gate.run(ctx);
    check(!f.some(x => x.file === '.githooks/pre-push' && x.level !== 'warn'),
      `pinGlobs 收窄后仍拦 .githooks: ${JSON.stringify(f)}`);
  }

  // 6. fix：归一化工作区字节 CRLF→LF（dry-run 不落盘）
  {
    const d = repo(null);
    const f1 = path.join(d, 'a.md');
    fs.writeFileSync(f1, 'l1\r\nl2\r\n');
    fs.writeFileSync(path.join(d, 'b.md'), 'clean\n');
    const fx = { root: d, files: ['a.md', 'b.md', 'ghost.md'], dryRun: true };
    const fixed = await gate.fix(fx);
    check(fixed.join(',') === 'a.md', `fix 清单错位: ${fixed}`);
    check(fs.readFileSync(f1, 'utf8') === 'l1\r\nl2\r\n', 'dry-run 改写了工作区');
    await gate.fix({ ...fx, dryRun: false });
    check(fs.readFileSync(f1, 'utf8') === 'l1\nl2\n', 'fix 未归一化工作区');
  }

  // 6b. fix 声明域豁免：eol=crlf/-text 文件不被剥 CRLF（fix 收全域非仅发现集）
  {
    const d = repo('*.bat text eol=crlf\n*.bin -text\n');
    const b1 = path.join(d, 'run.bat');
    const b2 = path.join(d, 'raw.bin');
    fs.writeFileSync(b1, '@echo off\r\ngoto :eof\r\n');
    fs.writeFileSync(b2, 'data\r\nmore\r\n');  // -text 但内容无 NUL——嗅探放它走，靠声明豁免
    const fx = { root: d, files: ['run.bat', 'raw.bin'], dryRun: false };
    const fixed = await gate.fix(fx);
    check(fixed.length === 0, `fix 剥了声明域: ${fixed}`);
    check(fs.readFileSync(b1, 'utf8') === '@echo off\r\ngoto :eof\r\n',
      'eol=crlf 声明文件被改写');
    check(fs.readFileSync(b2, 'utf8') === 'data\r\nmore\r\n',
      '-text 声明文件被改写');
  }

  // 7. 源仓自检：skills-collection 自身的 .gitattributes 覆盖钉制域
  {
    const ga = fs.readFileSync(path.join(REPO_ROOT, '.gitattributes'), 'utf8');
    check(/^\*\s+text=auto\s+eol=lf\s*$/m.test(ga), '源仓 .gitattributes 缺 text=auto 基线');
    check(/^\.githooks\/\*\s+text\s+eol=lf\s*$/m.test(ga), '源仓 .gitattributes 缺 shim 钉');
    check(fs.existsSync(path.join(REPO_ROOT, '.editorconfig')), '源仓 .editorconfig 缺席');
  }

  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  if (problems.length) {
    for (const p of problems) console.error(`  [FAIL] ${p}`);
    console.error(`  -> eol 门 ${problems.length} 断言失败`);
    return 1;
  }
  console.log('  -> eol 门断言全过（钉制域/声明违例/裸CRLF/策略放行/NUL嗅探/pinGlobs/fix）');
  return 0;
}

if (process.argv[1] && process.argv[1].endsWith('test-eol-gate.test.mjs')) {
  run().then(c => process.exit(c));
}
