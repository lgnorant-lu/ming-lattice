// test-hook-engine.test.mjs — 门禁引擎专项不变量（distill/_proposals/2026-09-20-git-hooks-gate-engine）
// 覆盖：INI 归组+别名 / matcher 语义 / 声明式门 / baseline 冻结 / SKIP/等级 / git 态 skipIf / 退出码契约
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { loadHookEngineConfig, resolveLevel, parseSkipSet } from '../../scripts/hooks/lib/config.mjs';
import { globToRegExp, matchAnyGlobs } from '../../scripts/hooks/lib/matcher.mjs';
import { buildDeclarativeGates } from '../../scripts/hooks/lib/declarative.mjs';
import { findingId, writeBaseline, loadBaseline, freshFindings } from '../../scripts/hooks/lib/baseline.mjs';
import { shouldSkip } from '../../scripts/hooks/lib/git-state.mjs';

const root = path.resolve(import.meta.dirname, '../..');

function tempRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ming-engine-'));
  execFileSync('git', ['init', '-q', dir]);
  return dir;
}

export async function run() {
  // 1. INI 归组 + .hooksrc.local 覆盖合并
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ming-cfg-'));
    fs.writeFileSync(path.join(dir, '.hooksrc'), [
      'emojiLevel=error',
      'gate.demo.level=warn',
      'gate.demo.pattern=TODO',
      'gate.demo.globs=*.md,*.txt',
      'chore.deps.watch=package-lock.json',
    ].join('\n'));
    fs.writeFileSync(path.join(dir, '.hooksrc.local'), 'gate.demo.level=error\n');
    const cfg = loadHookEngineConfig(dir);
    assert.equal(cfg.flat.emojiLevel, 'error');
    assert.equal(cfg.gates.demo.pattern, 'TODO');
    assert.deepEqual(cfg.gates.demo.globs.split(','), ['*.md', '*.txt']);
    assert.equal(cfg.chores.deps.watch, 'package-lock.json');
    assert.equal(resolveLevel('demo', 'warn', cfg), 'error', 'local 覆盖应生效');
    assert.equal(resolveLevel('emoji', 'warn', cfg), 'error', '旧键 emojiLevel 应别名到 gate.emoji');
    assert.equal(resolveLevel('secrets', 'error', cfg), 'error', '默认级兜底');
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // 2. matcher 语义（lint-staged 兼容面）
  {
    assert.ok(matchAnyGlobs('a/b/x.js', ['*.js']), '无斜杠=basename 命中');
    assert.ok(matchAnyGlobs('x.js', ['**/x.js']), '**/ 前缀命中顶层');
    assert.ok(matchAnyGlobs('a/b/x.js', ['**/x.js']), '**/ 命中深层');
    assert.ok(!matchAnyGlobs('ax.js', ['**/x.js']), '**/ 不得吞 basename 首字符');
    assert.ok(matchAnyGlobs('docs/a/b.md', ['docs/**']), '** 句尾跨段');
    assert.ok(!matchAnyGlobs('docs/sub/x.md', ['docs/*.md']), '单星不跨段');
    assert.ok(matchAnyGlobs('a/xy.js', ['a/x?.js']), '? 恰好一字符');
    assert.ok(!matchAnyGlobs('a/xyz.js', ['a/x?.js']), '? 不多字符');
    assert.ok(!matchAnyGlobs('a/x.js', ['a/x?.js']), '? 不少字符');
  }

  // 3. 声明式门：构建 + 假 ctx 运行（无需 git）+ once 语义 + 非法 pattern 转诊断
  {
    const cfg = { gates: {
      todo: { pattern: 'TODO\\w*', globs: '*.md', level: 'warn' },
      onceGate: { pattern: '[ \\t]+$', globs: '*', once: 'true' },
      broken: { pattern: '([', level: 'error' },
    }, chores: {}, flat: {} };
    const gates = buildDeclarativeGates(cfg);
    assert.equal(gates.length, 3);
    const todo = gates.find(g => g.id === 'todo');
    const ctx = { files: ['a.md', 'b.js'], read: p => p === 'a.md' ? 'x\nTODO_demo here\n' : 'TODO but js' };
    const found = await todo.run.call(todo, ctx);
    assert.equal(found.length, 1, 'globs 过滤后只有 a.md 命中');
    assert.equal(found[0].file, 'a.md');
    assert.equal(found[0].line, 2);
    const once = gates.find(g => g.id === 'onceGate');
    const found2 = await once.run.call(once, { files: ['c.txt'], read: () => 'a \nb \nc \n' });
    assert.equal(found2.length, 1, 'once=true 逐文件单报');
    const broken = gates.find(g => g.id === 'broken');
    assert.equal(broken.broken, true, '非法 pattern 转 error 级诊断门');
  }

  // 4. baseline：身份去行号（行漂移不产生假新增）+ 冻结/新增判别
  {
    const a = findingId({ gate: 'g', file: 'f.md', matchText: 'TODO' });
    const b = findingId({ gate: 'g', file: 'f.md', matchText: 'TODO', line: 99 });
    assert.equal(a, b, '行号不参与身份');
    const c = findingId({ gate: 'g', file: 'f.md', matchText: 'FIXME' });
    assert.notEqual(a, c, '不同命中文本不同身份');
    const d = findingId({ gate: 'large-file', file: 'big.bin' });
    assert.ok(d, '无 matchText 门退化为 gate|file');

    const dir = tempRepo();
    try {
      const bp = path.join(dir, '.hooks-baseline.json');
      writeBaseline(bp, [{ gate: 'g', file: 'f.md', matchText: 'TODO', line: 2 }]);
      const set = loadBaseline(bp);
      const marked = freshFindings([
        { gate: 'g', file: 'f.md', matchText: 'TODO', line: 50 }, // 同违规挪行 → 仍冻结
        { gate: 'g', file: 'f.md', matchText: 'FIXME' },          // 新违规
      ], set);
      assert.equal(marked[0].fresh, false, '挪行旧违规应冻结');
      assert.equal(marked[1].fresh, true, '新违规应报出');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }

  // 5. SKIP/等级契约 + git 态 skipIf
  {
    assert.deepEqual([...parseSkipSet('secrets, emoji ')], ['secrets', 'emoji']);
    assert.equal(parseSkipSet('').size, 0);
    const state = { merge: true, rebase: false, cherryPick: false, branch: 'main', stagedEmpty: false };
    assert.ok(shouldSkip(['merge'], state));
    assert.ok(shouldSkip(['ref:main'], state));
    assert.ok(!shouldSkip(['ref:dev'], state));
    assert.ok(!shouldSkip(['rebase'], state));
  }

  // 6. 端到端：temp repo 走 engine.mjs 真进程——声明式门拦截 + exit 契约 + SKIP 放行
  {
    const dir = tempRepo();
    try {
      // 引擎整套拷贝（index-scanning 同款搬运法）
      fs.cpSync(path.join(root, 'scripts/hooks'), path.join(dir, 'scripts/hooks'), { recursive: true });
      fs.writeFileSync(path.join(dir, '.hooksrc'), [
        'lintLevel=off', 'secretLevel=off', 'mojibakeLevel=off', 'emojiLevel=off',
        'gate.demo.level=error', 'gate.demo.globs=*.md', 'gate.demo.pattern=BADWORD', 'gate.demo.message=演示拦截',
      ].join('\n'));
      const engine = path.join(dir, 'scripts/hooks/engine.mjs');

      // 干净暂存 → 放行
      fs.writeFileSync(path.join(dir, 'ok.md'), 'fine\n');
      execFileSync('git', ['add', 'ok.md'], { cwd: dir });
      let r = spawnSync(process.execPath, [engine, 'pre-commit'], { cwd: dir, encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);

      // 违例暂存 → 拦截 exit=1
      fs.writeFileSync(path.join(dir, 'bad.md'), 'has BADWORD\n');
      execFileSync('git', ['add', 'bad.md'], { cwd: dir });
      r = spawnSync(process.execPath, [engine, 'pre-commit'], { cwd: dir, encoding: 'utf8' });
      assert.equal(r.status, 1, 'error 级命中应拦截');
      assert.ok(r.stderr.includes('bad.md'), '输出应含文件名');

      // SKIP 豁免 → 放行
      r = spawnSync(process.execPath, [engine, 'pre-commit'], { cwd: dir, encoding: 'utf8', env: { ...process.env, SKIP: 'demo' } });
      assert.equal(r.status, 0, 'SKIP 应豁免');

      // required 级不吃 SKIP
      fs.writeFileSync(path.join(dir, '.hooksrc'), [
        'lintLevel=off', 'secretLevel=off', 'mojibakeLevel=off', 'emojiLevel=off',
        'gate.demo.level=required', 'gate.demo.globs=*.md', 'gate.demo.pattern=BADWORD',
      ].join('\n'));
      r = spawnSync(process.execPath, [engine, 'pre-commit'], { cwd: dir, encoding: 'utf8', env: { ...process.env, SKIP: 'demo' } });
      assert.equal(r.status, 1, 'required 级应无视 SKIP');

      // 未知命令 → exit=2（引擎故障契约）
      r = spawnSync(process.execPath, [engine, 'nonsense'], { cwd: dir, encoding: 'utf8' });
      assert.equal(r.status, 2, '未知命令应 exit 2');

      // baseline 冻结后同违规放行
      r = spawnSync(process.execPath, [engine, 'baseline'], { cwd: dir, encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
      assert.ok(fs.existsSync(path.join(dir, '.hooks-baseline.json')));
      r = spawnSync(process.execPath, [engine, 'pre-commit'], { cwd: dir, encoding: 'utf8' });
      assert.equal(r.status, 0, 'baseline 冻结后既有违规应放行');
      // 新增违规仍拦
      fs.writeFileSync(path.join(dir, 'bad2.md'), 'BADWORD again\n');
      execFileSync('git', ['add', 'bad2.md'], { cwd: dir });
      r = spawnSync(process.execPath, [engine, 'pre-commit'], { cwd: dir, encoding: 'utf8' });
      assert.equal(r.status, 1, 'baseline 只冻旧账，新增仍拦');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }

  console.log('  -> hook-engine: 6 组断言全部通过（归组/matcher/声明式/baseline/等级/端到端契约）');
}
