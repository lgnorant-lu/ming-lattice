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

  // 7. secrets 多层规则 + commit-msg 策略注入（假 ctx 直跑门，无需 git）
  {
    const { gate: secrets } = await import('../../scripts/hooks/gates/secrets.mjs');
    const mkCtx = (fileMap, gateConfig = {}) => ({
      files: Object.keys(fileMap), gateConfig,
      read: p => fileMap[p],
    });
    // L1 签名层：新家族命中（gho_/github_pat_/sk-proj-/LTAI/AKID/xoxb/AIza/glpat-/JWT/PEM 扩展形态）
    const l1files = {
      'a.env': 'token=gho_' + 'A'.repeat(36) + '\n',
      'b.env': 'k=github_pat_' + 'B_'.repeat(20) + '\n',
      'c.env': 'key=sk-proj-' + 'xY9-_' .repeat(6) + '\n',
      'd.env': 'ak=LTAI' + 'cD3f'.repeat(4) + '\n',
      'e.env': 'sid=AKID' + 'q1W2'.repeat(5) + '\n',
      'f.env': 'slack=xoxb-' + '1234-'.repeat(5) + '\n',
      'g.env': 'gg=AIza' + 'Sy_9'.repeat(8) + 'Syx\n', // AIza+恰好35字符（真实 Google Key 长度）
      'h.env': 'gl=glpat-' + 'aB3_'.repeat(6) + '\n',
      'i.env': '-----BEGIN ' + 'OPENSSH PRIVATE KEY-----\n', // 拆开防本文件被 secrets 门自拦
      'j.env': 'jwt=eyJ' + 'a'.repeat(12) + '.eyJ' + 'b'.repeat(12) + '.' + 'c'.repeat(20) + '\n',
    };
    const l1 = await secrets.run(mkCtx(l1files));
    assert.equal(l1.length, 10, `L1 全家族应命中，实际 ${l1.length}: ${l1.map(f => f.message).join(';')}`);
    assert.ok(l1.every(f => f.level === undefined), 'L1 命中随门级（无强制级）');
    assert.ok(l1[0].message.includes('…'), '样本应打码');
    assert.ok(!l1.some(f => f.message.includes('gho_' + 'A'.repeat(36))), '输出不得含明文密钥');

    // L2 通用赋值层：高熵命中 warn，占位符/低熵抑制
    const l2files = {
      'k.env': 'api_key="' + 'Xk9mQ2wP7vN4rT8uY1zA' + '"\n',         // 高熵 → warn
      'l.env': 'api_key="your-api-key-here-example"\n',              // 占位符 → 抑
      'm.env': 'password="aaaaaaaaaaaaaaaaaaaaaaaaaaaa"\n',          // 低熵 → 抑
      'n.env': 'token = "short"\n',                                  // 太短 → 抑
    };
    const l2 = await secrets.run(mkCtx(l2files));
    assert.equal(l2.length, 1, `L2 仅高熵命中，实际 ${l2.length}`);
    assert.equal(l2[0].level, 'warn', 'L2 默认 warn 级');
    const l2off = await secrets.run(mkCtx(l2files, { genericLevel: 'off' }));
    assert.equal(l2off.length, 0, 'genericLevel=off 关闭 L2');

    // L3 编码配对：UTF-16LE 文件 + base64 夹带（可疑文件名才解）
    const utf16 = '\ufeffkey=ghp_' + 'D'.repeat(36); // BOM 形态
    const b64 = Buffer.from('token=ghp_' + 'E'.repeat(36), 'utf8').toString('base64');
    const l3files = {
      'u.env': utf16,
      'config.env': 'data=' + b64 + '\n',
      'notes.md': 'data=' + b64 + '\n', // 非可疑文件名 → 不解
    };
    const l3 = await secrets.run(mkCtx(l3files));
    assert.ok(l3.some(f => f.file === 'u.env' && f.message.includes('utf16')), 'UTF-16 转码应命中');
    assert.ok(l3.some(f => f.file === 'config.env' && f.message.includes('b64')), '可疑文件名 b64 应命中');
    assert.ok(!l3.some(f => f.file === 'notes.md' && f.message.includes('b64')), '非可疑文件名不解 b64');

    // L0 文件名层：私钥文件名命中（不读内容）；.example/.test 白名单豁免
    const l0 = await secrets.run(mkCtx({
      'certs/id_rsa': 'whatever',
      'deploy/server.pem': 'x',
      'conf/app.key': 'x',
      'conf/app.key.example': 'x',   // 白名单豁免
      'test/fixture.pem': 'x',       // fixture 白名单豁免
    }));
    assert.equal(l0.length, 3, `L0 文件名层命中数 ${l0.length}`);
    assert.ok(l0.every(f => f.matchText.startsWith('keyfile:')), 'L0 身份用文件名');

    // commit-msg 策略词表注入：types/subjectMaxLen/extraTrailers
    const { gate: cmsg } = await import('../../scripts/hooks/gates/commit-msg.mjs');
    const dir = tempRepo();
    try {
      const msg = path.join(dir, 'MSG');
      const runMsg = async (text, gateConfig = {}) => {
        fs.writeFileSync(msg, text);
        return cmsg.run({ msgPath: msg, root: dir, gateConfig });
      };
      // 默认白名单外 type → 拦；覆盖 types 后放行
      let r = await runMsg('wip(core): 进行中\n');
      assert.ok(r.some(f => !f.level), '默认白名单拒 wip');
      r = await runMsg('wip(core): 进行中\n', { types: 'wip,feat,fix' });
      assert.ok(!r.some(f => !f.level), 'types 覆盖应放行 wip');
      // subjectMaxLen → warn 级提示不拦
      r = await runMsg('feat: ' + '很'.repeat(80) + '\n', { subjectMaxLen: '50' });
      assert.ok(r.some(f => f.level === 'warn' && f.message.includes('超长')), '超长应 warn');
      // extraTrailers 追加禁尾
      r = await runMsg('feat: x\n\nSigned-off-by: bot <b@x>\n', { extraTrailers: '^Signed-off-by' });
      assert.ok(r.some(f => !f.level), 'extraTrailers 应拦截');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }

  // 8. chores 族：声明式构建 + post-merge 端到端（suggest-only 永不阻断）
  {
    const { buildChores } = await import('../../scripts/hooks/lib/chores.mjs');
    const cfg = { chores: {
      deps: { watch: 'package-lock.json,package.json', message: '依赖变更请 npm ci', stages: 'post-merge' },
      noMsg: { watch: '*.md' },                       // 缺 message → 略过
      multi: { watch: 'a/**', message: 'm', stages: 'post-merge,post-checkout' },
    }, gates: {}, flat: {} };
    const chores = buildChores(cfg);
    assert.equal(chores.length, 2, '缺 message 的 chore 应略过');
    const deps = chores.find(c => c.id === 'chore:deps');
    assert.deepEqual(deps.stages, ['post-merge']);
    assert.equal(deps.defaultLevel, 'warn', 'chore 恒 warn');
    const hit = await deps.run({ files: ['package-lock.json', 'x.md'] });
    assert.equal(hit.length, 1);
    assert.equal(hit[0].level, 'warn');
    assert.ok(hit[0].message.includes('npm ci'));
    assert.ok(hit[0].message.includes('package-lock.json'), '提醒应带触发文件');
    const miss = await deps.run({ files: ['x.md'] });
    assert.equal(miss.length, 0, 'watch 未命中不提醒');

    // e2e：真 merge → post-merge shim 路径（ORIG_HEAD 增量）
    const dir = tempRepo();
    try {
      execFileSync('git', ['config', 'user.email', 't@t'], { cwd: dir });
      execFileSync('git', ['config', 'user.name', 't'], { cwd: dir });
      execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: dir });
      fs.cpSync(path.join(root, 'scripts/hooks'), path.join(dir, 'scripts/hooks'), { recursive: true });
      fs.writeFileSync(path.join(dir, '.hooksrc'), [
        'chore.demo.watch=watched.txt',
        'chore.demo.message=演示提醒文案',
      ].join('\n'));
      const engine = path.join(dir, 'scripts/hooks/engine.mjs');

      // 主干提交 → 分支改 watched.txt → 合并回主干（ORIG_HEAD 指向 merge 前）
      fs.writeFileSync(path.join(dir, 'base.txt'), 'base\n');
      execFileSync('git', ['add', '.'], { cwd: dir });
      execFileSync('git', ['commit', '-qm', 'init'], { cwd: dir });
      execFileSync('git', ['checkout', '-qb', 'feat'], { cwd: dir });
      fs.writeFileSync(path.join(dir, 'watched.txt'), 'changed\n');
      execFileSync('git', ['add', '.'], { cwd: dir });
      execFileSync('git', ['commit', '-qm', 'feat'], { cwd: dir });
      execFileSync('git', ['checkout', '-q', 'master'], { cwd: dir });
      execFileSync('git', ['merge', '--no-ff', '-qm', 'merge feat', 'feat'], { cwd: dir });

      const r = spawnSync(process.execPath, [engine, 'post-merge'], { cwd: dir, encoding: 'utf8' });
      assert.equal(r.status, 0, `chore 永不阻断: ${r.stderr}`);
      assert.ok(r.stderr.includes('演示提醒文案'), `post-merge 应提醒 chore: ${r.stderr}`);
      assert.ok(r.stderr.includes('watched.txt'), '应列出触发文件');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }

  // 9. run fix 自愈：whitespace 门修工作区 + 报告清单
  {
    const wsMod = await import('../../scripts/hooks/gates/whitespace.mjs');
    const { fixContent } = wsMod;
    const dir = tempRepo();
    try {
      fs.cpSync(path.join(root, 'scripts/hooks'), path.join(dir, 'scripts/hooks'), { recursive: true });
      fs.writeFileSync(path.join(dir, '.hooksrc'), 'secretLevel=off\nmojibakeLevel=off\nemojiLevel=off\nlintLevel=off\n');
      const engine = path.join(dir, 'scripts/hooks/engine.mjs');

      // fixContent 纯函数契约
      const r0 = fixContent('a  \nb\t\nlast-no-newline');
      assert.equal(r0.content, 'a\nb\nlast-no-newline\n');
      assert.ok(r0.changed);
      assert.ok(!fixContent('clean\n').changed);
      assert.ok(!fixContent('').changed, '空文件不应被 fix 改写');

      // 暂存脏文件 → run fix --dry-run → 报告但不写盘
      fs.writeFileSync(path.join(dir, 'dirty.md'), 'line1   \nline2\t\nno-eof');
      execFileSync('git', ['add', 'dirty.md'], { cwd: dir });
      const dry = spawnSync(process.execPath, [engine, 'run', 'fix', '--dry-run'], { cwd: dir, encoding: 'utf8' });
      assert.equal(dry.status, 0, dry.stderr);
      assert.ok(dry.stdout.includes('将被修复'), 'dry-run 应预告修复清单');
      assert.equal(fs.readFileSync(path.join(dir, 'dirty.md'), 'utf8'), 'line1   \nline2\t\nno-eof',
        'dry-run 不得改写工作区');

      // run fix 真跑 → 工作区被修
      const r = spawnSync(process.execPath, [engine, 'run', 'fix'], { cwd: dir, encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
      assert.ok(r.stdout.includes('dirty.md'), 'fix 应报告修复清单');
      const after = fs.readFileSync(path.join(dir, 'dirty.md'), 'utf8');
      assert.equal(after, 'line1\nline2\nno-eof\n', '工作区内容应被修复');
      // fix 只写工作区不碰 index：staged blob 仍是脏的（可复验）
      const staged = execFileSync('git', ['show', ':dirty.md'], { cwd: dir, encoding: 'utf8' });
      assert.ok(staged.includes('line1   '), 'index 不被 fix 改动（re-stage 由用户确认）');

      // baseline --dry-run：预告冻结计数但不写 .hooks-baseline.json
      const bDry = spawnSync(process.execPath, [engine, 'baseline', '--dry-run'], { cwd: dir, encoding: 'utf8' });
      assert.equal(bDry.status, 0, bDry.stderr);
      assert.ok(bDry.stdout.includes('dry-run'), 'baseline --dry-run 应标 dry-run 前缀');
      assert.ok(!fs.existsSync(path.join(dir, '.hooks-baseline.json')), 'dry-run 不得写冻结档');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }

  console.log('  -> hook-engine: 9 组断言全部通过（归组/matcher/声明式/baseline/等级/端到端/多层密钥+策略/chores/fix）');
}
