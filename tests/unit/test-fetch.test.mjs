// tests/unit/test-fetch.test.mjs
// CLI 契约测试: scripts/fetch.mjs（vertical 物化器）
// 覆盖: 退出码 0/1/2 语义、DryRun 零副作用、孤本/禁用/缺字段跳过、
//       pin 一致幂等、漂移只报不动、非 git 目录拒绝收养、--only 过滤与空集防御、
//       stale remote URL 对账。
// 全部经 FETCH_ROOT 指向临时 fixture 仓根隔离，git 操作仅本地 init/commit——零网络。

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SCRIPT = path.resolve(import.meta.dirname, '../../scripts/fetch.mjs');
const ZERO_SHA = '0'.repeat(40);

let tmpCount = 0;
function mkRoot() {
  const dir = fs.mkdtempSync(path.join(process.env.SKILLS_TEST_TMPDIR || os.tmpdir(), `fetch-${tmpCount++}-`));
  fs.mkdirSync(path.join(dir, 'vertical'), { recursive: true });
  return dir;
}

// registry.yaml fixture：字段 4 空格缩进，与 parseRegistry 行级约定一致
const entryBlock = (name, fields = '') =>
  `  - name: ${name}\n    path: vertical/${name}\n${fields}`;
const regWith = (...blocks) => `vertical:\n${blocks.join('')}`;

function fetchRun(root, args = []) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    env: { ...process.env, FETCH_ROOT: root },
    encoding: 'utf8',
    timeout: 60000,
  });
}

const git = (cwd, gargs) => execFileSync('git', gargs, { cwd, encoding: 'utf8' });
// 本地建仓提交一个真实文件（工作树非空），返回 HEAD SHA（零网络）
function mkGitRepo(dir, originUrl = 'https://github.com/x/y.git') {
  fs.mkdirSync(dir, { recursive: true });
  git(dir, ['init', '-q']);
  git(dir, ['remote', 'add', 'origin', originUrl]);
  fs.writeFileSync(path.join(dir, 'f.txt'), 'fixture');
  git(dir, ['add', 'f.txt']);
  git(dir, ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'fixture']);
  return git(dir, ['rev-parse', 'HEAD']).trim();
}

export function run() {
  console.log('[TEST UNIT] fetch.mjs CLI 契约...');
  const roots = [];
  const root = () => { const r = mkRoot(); roots.push(r); return r; };
  try {
    // ── 1. 全新仓根 DryRun：全条目入 [计划]，磁盘零物化，exit 0 ──
    {
      const r = root();
      fs.writeFileSync(path.join(r, 'registry.yaml'), regWith(
        entryBlock('alpha', '    repo: https://github.com/a/a.git\n    pin: ' + ZERO_SHA + '\n    enabled: true\n'),
        entryBlock('beta', '    repo: https://github.com/b/b.git\n    pin: ' + ZERO_SHA + '\n'),
      ));
      const p = fetchRun(r, ['--dry-run']);
      assert.equal(p.status, 0, `dry-run exit: ${p.stderr}`);
      assert.match(p.stdout, /物化完成 2: .*alpha.*\[计划\]/s, '两条目应入计划');
      assert.equal(fs.readdirSync(path.join(r, 'vertical')).length, 0, 'DryRun 不得创建任何目录');
    }

    // ── 2. 三类跳过桶：sourceGone / enabled:false / 缺 repo·pin ──
    {
      const r = root();
      fs.writeFileSync(path.join(r, 'registry.yaml'), regWith(
        entryBlock('gone-one', '    sourceGone: true\n'),
        entryBlock('off-one', '    repo: https://github.com/o/o.git\n    pin: ' + ZERO_SHA + '\n    enabled: false\n'),
        entryBlock('norepo', '    enabled: true\n'),
      ));
      const p = fetchRun(r, ['--dry-run']);
      assert.equal(p.status, 0, `skip 桶不应计坏: ${p.stdout}`);
      assert.match(p.stdout, /孤本跳过\(sourceGone\) 1: gone-one/);
      assert.match(p.stdout, /禁用跳过\(enabled\) 1: off-one/);
      assert.match(p.stdout, /缺 repo\/pin 跳过 1: norepo/);
    }

    // ── 3. pin 一致幂等：本地 HEAD==pin → 已就绪，exit 0 ──
    {
      const r = root();
      const dir = path.join(r, 'vertical', 'pinned');
      const sha = mkGitRepo(dir);
      fs.writeFileSync(path.join(r, 'registry.yaml'), regWith(
        entryBlock('pinned', `    repo: https://github.com/x/y.git\n    pin: ${sha}\n`),
      ));
      const p = fetchRun(r, ['--dry-run']);
      assert.equal(p.status, 0);
      assert.match(p.stdout, /已就绪\(pin一致\) 1: pinned/);
      assert.ok(!/物化完成/.test(p.stdout), '已就绪条目不得入计划');
    }

    // ── 4. 漂移只报不动：HEAD≠pin → exit 1，目录 HEAD 不变 ──
    {
      const r = root();
      const dir = path.join(r, 'vertical', 'drifty');
      mkGitRepo(dir);
      fs.writeFileSync(path.join(r, 'registry.yaml'), regWith(
        entryBlock('drifty', `    repo: https://github.com/x/y.git\n    pin: ${ZERO_SHA}\n`),
      ));
      const p = fetchRun(r, ['--dry-run']);
      assert.equal(p.status, 1, '漂移应 exit 1');
      assert.match(p.stdout, /漂移\(需 --reconcile\) 1: drifty/);
    }

    // ── 5. 非 git 目录拒绝收养：报人工 + exit 1 + 不建 .git ──
    {
      const r = root();
      const dir = path.join(r, 'vertical', 'stray');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'loose.txt'), 'x');
      fs.writeFileSync(path.join(r, 'registry.yaml'), regWith(
        entryBlock('stray', `    repo: https://github.com/s/s.git\n    pin: ${ZERO_SHA}\n`),
      ));
      const p = fetchRun(r);   // 非 dry-run——验证真实路径也不收养
      assert.equal(p.status, 1);
      assert.match(p.stdout, /非仓库目录\(需人工\) 1: stray/);
      assert.ok(!fs.existsSync(path.join(dir, '.git')), '不得在游离目录内 git init');
      assert.ok(fs.existsSync(path.join(dir, 'loose.txt')), '不得动目录内容');
    }

    // ── 6. --only 契约：未知名警告 + 全未知 exit 2 + 子集过滤 ──
    {
      const r = root();
      fs.writeFileSync(path.join(r, 'registry.yaml'), regWith(
        entryBlock('one', `    repo: https://github.com/1/1.git\n    pin: ${ZERO_SHA}\n`),
        entryBlock('two', `    repo: https://github.com/2/2.git\n    pin: ${ZERO_SHA}\n`),
      ));
      const bad = fetchRun(r, ['--only', 'nonexistent']);
      assert.equal(bad.status, 2, '全未知 --only 应 exit 2');
      assert.match(bad.stderr, /未匹配条目: nonexistent/);

      const sub = fetchRun(r, ['--dry-run', '--only', 'one,bad-name']);
      assert.equal(sub.status, 0);
      assert.match(sub.stderr, /未匹配条目: bad-name/, '部分未知应 stderr 警告');
      assert.match(sub.stdout, /物化完成 1: one \[计划\]/, '只物化指定子集');
      assert.ok(!sub.stdout.includes('two'), '未点名条目不出现');
    }

    // ── 7. 参数面 fail-closed：未知 flag / 缺值 → exit 2 ──
    {
      const r = root();
      fs.writeFileSync(path.join(r, 'registry.yaml'), regWith(entryBlock('x', `    repo: https://github.com/x/x.git\n    pin: ${ZERO_SHA}\n`)));
      assert.equal(fetchRun(r, ['--bogus']).status, 2, '未知 flag exit 2');
      assert.equal(fetchRun(r, ['--only']).status, 2, '--only 缺值 exit 2');
    }

    // ── 8. 空工作树修复：.git 在字节缺席 → 真跑从本地对象重建（零网络）──
    {
      const r = root();
      const dir = path.join(r, 'vertical', 'wiped');
      fs.mkdirSync(dir, { recursive: true });
      git(dir, ['init', '-q']);
      git(dir, ['remote', 'add', 'origin', 'https://github.com/unreachable/x.git']);
      fs.writeFileSync(path.join(dir, 'payload.txt'), 'bytes');
      git(dir, ['add', 'payload.txt']);
      git(dir, ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'f']);
      const sha = git(dir, ['rev-parse', 'HEAD']).trim();
      fs.rmSync(path.join(dir, 'payload.txt'));   // 模拟父仓改史 reset --hard 清工作树
      fs.writeFileSync(path.join(r, 'registry.yaml'), regWith(
        entryBlock('wiped', `    repo: https://github.com/unreachable/x.git\n    pin: ${sha}\n`),
      ));
      const dry = fetchRun(r, ['--dry-run']);
      assert.match(dry.stdout, /重建工作树/, '空工作树不得报"已就绪"');
      const p = fetchRun(r);   // 真跑——repairOnly 跳过 fetch，本地对象重建
      assert.equal(p.status, 0, `重建应成功: ${p.stdout}${p.stderr}`);
      assert.match(p.stdout, /wiped \[重建\]/);
      assert.equal(fs.readFileSync(path.join(dir, 'payload.txt'), 'utf8'), 'bytes', '字节应复原');
    }

    // ── 8b. pin 一致但工作树有改动 → 漂移桶（不自动毁本地改动）；--reconcile 才对齐 ──
    {
      const r = root();
      const dir = path.join(r, 'vertical', 'dirty');
      const sha = mkGitRepo(dir);
      fs.writeFileSync(path.join(dir, 'f.txt'), 'local edit');   // 本地修改未提交
      fs.writeFileSync(path.join(r, 'registry.yaml'), regWith(
        entryBlock('dirty', `    repo: https://github.com/x/y.git\n    pin: ${sha}\n`),
      ));
      const p = fetchRun(r, ['--dry-run']);
      assert.equal(p.status, 1, '脏工作树属漂移 exit 1');
      assert.match(p.stdout, /dirty \(pin一致但工作树有改动/);
      assert.equal(fs.readFileSync(path.join(dir, 'f.txt'), 'utf8'), 'local edit', '不得动本地改动');
      const rc = fetchRun(r, ['--reconcile']);
      assert.equal(rc.status, 0, `--reconcile 应对齐: ${rc.stdout}${rc.stderr}`);
      assert.equal(fs.readFileSync(path.join(dir, 'f.txt'), 'utf8'), 'fixture', 'reconcile 后应复原');
    }

    // ── 9. stale remote 对账：真跑修正 URL（本地元数据操作，零网络）──
    {
      const r = root();
      const dir = path.join(r, 'vertical', 'moved');
      const sha = mkGitRepo(dir, 'https://github.com/old-owner/y.git');
      fs.writeFileSync(path.join(r, 'registry.yaml'), regWith(
        entryBlock('moved', `    repo: https://github.com/new-owner/y.git\n    pin: ${sha}\n`),
      ));
      const dry = fetchRun(r, ['--dry-run']);
      assert.equal(dry.status, 0);
      assert.match(dry.stdout, /remote 已对齐 1: moved \[计划: /);
      assert.equal(git(dir, ['remote', 'get-url', 'origin']).trim(), 'https://github.com/old-owner/y.git', 'DryRun 不改 remote');

      const real = fetchRun(r);
      assert.equal(real.status, 0, `at-pin 条目真跑零网络: ${real.stderr}`);
      assert.equal(git(dir, ['remote', 'get-url', 'origin']).trim(), 'https://github.com/new-owner/y.git', '真跑应对齐 remote');
      assert.match(real.stdout, /remote 已对齐 1: moved/);
      assert.match(real.stdout, /已就绪\(pin一致\) 1: moved/);
    }
  } finally {
    for (const r of roots) fs.rmSync(r, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  }
  console.log('[PASS] fetch.mjs CLI 契约全绿');
}
