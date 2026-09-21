// test-hook-engine.test.mjs — 门禁引擎专项不变量（distill/_proposals/2026-09-20-git-hooks-gate-engine）
// 覆盖：INI 归组+别名 / matcher 语义 / 声明式门 / baseline 冻结 / SKIP/等级 / git 态 skipIf / 退出码契约
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { loadHookEngineConfig, resolveLevel, parseSkipSet, parseCadence } from '../../scripts/hooks/lib/config.mjs';
import { globToRegExp, matchAnyGlobs } from '../../scripts/hooks/lib/matcher.mjs';
import { buildDeclarativeGates } from '../../scripts/hooks/lib/declarative.mjs';
import { findingId, writeBaseline, loadBaseline, freshFindings } from '../../scripts/hooks/lib/baseline.mjs';
import { shouldSkip } from '../../scripts/hooks/lib/git-state.mjs';
import { checkAdoptionHealth, orphanGateIds, readState, writeTrust, lastRunAt, stampRun } from '../../scripts/hooks/lib/integrity.mjs';
import { HOOK_STAGES, REPO_ENGINE_REF, shimScript, shimEngineRef } from '../../scripts/hooks/lib/shims.mjs';

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
      'gate.demo.level2=off   # 行内注释',           // 空白+#→剥离（blog-tui 风格缺陷回测）
      'gate.demo.anchor=#[a-z]+ 尾注释 # 剥',        // 值首 # 紧跟=保留；尾" #"仍剥
      'gate.demo.hex=#[0-9a-f]{6}',                  // # 紧跟=无前置空白→保留
    ].join('\n'));
    fs.writeFileSync(path.join(dir, '.hooksrc.local'), 'gate.demo.level=error\n');
    const cfg = loadHookEngineConfig(dir);
    assert.equal(cfg.flat.emojiLevel, 'error');
    assert.equal(cfg.gates.demo.pattern, 'TODO');
    assert.deepEqual(cfg.gates.demo.globs.split(','), ['*.md', '*.txt']);
    assert.equal(cfg.chores.deps.watch, 'package-lock.json');
    assert.equal(cfg.gates.demo.level2, 'off', '行内注释剥离');
    assert.equal(cfg.gates.demo.anchor, '#[a-z]+ 尾注释', '值内紧贴#保留+尾注释剥');
    assert.equal(cfg.gates.demo.hex, '#[0-9a-f]{6}', '正则#保留');
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

  // 10. 采纳层自检（shim 模板对账 / 引用可达 / 孤儿配置键）
  {
    // 模板与仓内真实 .githooks 锁定一致（约定回环）
    for (const stage of HOOK_STAGES) {
      const p = path.join(root, '.githooks', stage);
      if (!fs.existsSync(p)) continue;
      const text = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
      assert.equal(text, shimScript(stage, REPO_ENGINE_REF), `.githooks/${stage} 与规范模板不一致`);
      assert.equal(shimEngineRef(text), REPO_ENGINE_REF);
    }
    assert.equal(shimEngineRef('#!/bin/sh\nexit 0\n'), null, '非本引擎 shim 不提取');
    // 本仓当前健康态应零 finding
    assert.deepEqual(checkAdoptionHealth(root), [], '本仓 shim 应健康');

    // 合成仓：漂移 shim + 断链引用 + 外来 hook 尊重
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ming-adopt-'));
    try {
      const gdir = path.join(dir, '.githooks');
      const eng = path.join(dir, 'scripts/hooks');
      fs.mkdirSync(gdir, { recursive: true });
      fs.mkdirSync(eng, { recursive: true });
      fs.writeFileSync(path.join(eng, 'engine.mjs'), '// stub\n');
      fs.writeFileSync(path.join(gdir, 'pre-commit'), shimScript('pre-commit').replace('pre-commit\n', 'pre-push\n'));
      fs.writeFileSync(path.join(gdir, 'post-merge'), shimScript('post-merge', '/nonexistent/store/engine.mjs'));
      fs.writeFileSync(path.join(gdir, 'commit-msg'), '#!/bin/sh\nexec some-other-tool "$1"\n');
      const findings = checkAdoptionHealth(dir);
      assert.equal(findings.length, 2, `应抓 2 项漂移，实际 ${JSON.stringify(findings)}`);
      assert.ok(findings.some(f => f.file === '.githooks/pre-commit' && f.message.includes('漂移')));
      assert.ok(findings.some(f => f.file === '.githooks/post-merge' && f.message.includes('不可达')));
      assert.ok(!findings.some(f => f.file === '.githooks/commit-msg'), '外来 hook 不被告警');
      // 修正后恢复零 finding
      fs.writeFileSync(path.join(gdir, 'pre-commit'), shimScript('pre-commit'));
      fs.writeFileSync(path.join(gdir, 'post-merge'), shimScript('post-merge', path.join(eng, 'engine.mjs').replace(/\\/g, '/')));
      assert.deepEqual(checkAdoptionHealth(dir), [], '修复后应零 finding');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }

    // 孤儿配置键：.hooksrc 指向未装载的门
    assert.deepEqual(orphanGateIds({ secrets: { level: 'warn' }, ghost: { level: 'error' } }, new Set(['secrets'])), ['ghost']);
    assert.deepEqual(orphanGateIds({}, new Set(['x'])), []);
    assert.deepEqual(orphanGateIds(undefined, new Set()), []);
  }

  // 11. [glob] 分节解析：editorconfig 序（后写赢）+ local 节接主文件节 + 畸形节诊断 + resolveGateConfigFor
  {
    const { resolveGateConfigFor } = await import('../../scripts/hooks/lib/config.mjs');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ming-sec-'));
    try {
      fs.writeFileSync(path.join(dir, '.hooksrc'), [
        'gate.toc.level=warn',
        'gate.toc.depth=3',
        '[docs/adr/**]',
        'gate.toc.depth=2',
        'gate.toc.minHeadings=2',
        '[docs/**]',
        'gate.toc.mode=insert',
        '[bad/**]',
        'plain.key=x',
        'gate.ghost.level=warn',
      ].join('\n'));
      fs.writeFileSync(path.join(dir, '.hooksrc.local'), '[docs/adr/**]\ngate.toc.depth=4\n');
      const cfg = loadHookEngineConfig(dir);
      assert.equal(cfg.sections.length, 4, '主文件 3 节 + local 1 节');
      assert.equal(cfg.sections[3].glob, 'docs/adr/**', 'local 节接在主文件节之后');
      // 命中序：全局 depth=3 → [docs/**] 命中不涉 depth → [docs/adr/**](main) depth=2 → [docs/adr/**](local) depth=4
      const adr = resolveGateConfigFor(cfg, 'toc', 'docs/adr/x.md');
      assert.equal(adr.depth, '4', '后写节覆盖先写节（local 赢）');
      assert.equal(adr.minHeadings, '2', '节内其他键一并合并');
      assert.equal(adr.mode, 'insert', '[docs/**] 也命中 adr 路径');
      // 非命中文件只吃全局 + 命中节
      const plain = resolveGateConfigFor(cfg, 'toc', 'docs/guide.md');
      assert.equal(plain.depth, '3', '非 adr 文件不回退到 adr 节');
      assert.equal(plain.mode, 'insert');
      // 其他门的键不受 toc 节影响
      assert.equal(resolveGateConfigFor(cfg, 'emoji', 'docs/adr/x.md').depth, undefined);
      // 畸形节诊断：[bad/**] 的 plain.key 非法 + 空节不算 gate 键
      assert.ok(cfg.sectionWarnings.some(w => w.includes('bad/**') && w.includes('plain.key')), '非 gate.* 键被告警');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }

  // 12. toc 门：节检测/形状校验/漂移/手写跳过/insert/slug/分节 off
  {
    const { gate: tocGate, parseDoc, generateItems, slugGithub } = await import('../../scripts/hooks/gates/toc.mjs');
    const titles = new Set(['目录', 'Table of Contents']);
    // 解析面：目录标题不入 headings，节体吃到 --- 为止，H1 不收录
    const d = parseDoc('# T\n\n## 目录\n1. [A](#a)\n\n---\n\n## Alpha\nx\n### Beta\n', titles);
    assert.equal(d.toc.headIdx, 2);
    assert.deepEqual(d.toc.body, ['1. [A](#a)', '', '---']);
    assert.deepEqual(d.headings.map(h => h.text), ['Alpha', 'Beta'], '目录自身不入列');
    assert.equal(d.h1Idx, 0);
    // github slug：标点剥除 + CJK 保留
    assert.equal(slugGithub('Beta: Two!'), 'beta-two');
    assert.equal(slugGithub('C++ Guide / ref'), 'c-guide-ref');
    assert.equal(slugGithub('中文 标题'), '中文-标题');
    // 编号=收集序（tocgen 跳号怪癖：depth=2 时 H3 占位）
    const d2 = parseDoc('# T\n## A\n### B\n## C\n', titles);
    assert.deepEqual(generateItems(d2.headings, 2, slugGithub), ['1. [A](#a)', '3. [C](#c)'], 'H3 占位跳号');
    assert.deepEqual(generateItems(d2.headings, 3, slugGithub), ['1. [A](#a)', '  2. [B](#b)', '3. [C](#c)']);

    const mkCtx = (files, read, extra = {}) => ({ files, read, gateConfig: {}, ...extra });
    // 新鲜节 → 零 finding
    const fresh = '# T\n\n## 目录\n1. [A](#a)\n  2. [B](#b)\n\n---\n\n## A\n### B\n';
    assert.deepEqual(await tocGate.run(mkCtx(['a.md'], () => fresh)), [], '新鲜节零 finding');
    // 过期节 → toc-drift
    const stale = '# T\n\n## 目录\n1. [Old](#old)\n\n---\n\n## A\n### B\n';
    const f1 = await tocGate.run(mkCtx(['a.md'], () => stale));
    assert.equal(f1.length, 1);
    assert.equal(f1[0].matchText, 'toc-drift');
    // 手写内容混入节体 → warn 跳过不漂移
    const manual = '# T\n\n## 目录\n1. [A](#a)\n\n手写说明文字\n\n---\n\n## A\n### B\n';
    const f2 = await tocGate.run(mkCtx(['a.md'], () => manual));
    assert.equal(f2.length, 1);
    assert.equal(f2[0].matchText, 'toc-shape', '散文节体报形状告警');
    // 无壳文档：section 模式静默；insert 模式达标报 toc-missing
    const shell = '# T\n## A\n### B\n## C\n';
    assert.deepEqual(await tocGate.run(mkCtx(['a.md'], () => shell)), [], '默认不强制插壳');
    const f3 = await tocGate.run(mkCtx(['a.md'], () => shell, { gateConfig: { mode: 'insert' } }));
    assert.equal(f3.length, 1);
    assert.equal(f3[0].matchText, 'toc-missing');
    // minHeadings 不达标不报
    const f4 = await tocGate.run(mkCtx(['a.md'], () => '# T\n## A\n', { gateConfig: { mode: 'insert', minHeadings: '3' } }));
    assert.equal(f4.length, 0);
    // 分节 off：gateConfigFor 返回 level=off → 跳过
    const f5 = await tocGate.run({ files: ['a.md'], read: () => stale, gateConfig: {}, gateConfigFor: () => ({ level: 'off' }) });
    assert.equal(f5.length, 0, '节内 level=off 逐文件关闭');
    // fix：重写过期节 + dryRun 不写盘 + 手写节不碰
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ming-toc-'));
    try {
      fs.writeFileSync(path.join(dir, 'a.md'), stale);
      fs.writeFileSync(path.join(dir, 'm.md'), manual);
      const fx = await tocGate.fix({ root: dir, files: ['a.md', 'm.md'], gateConfig: {}, dryRun: true });
      assert.deepEqual(fx, ['a.md'], 'dry-run 只报将修');
      assert.equal(fs.readFileSync(path.join(dir, 'a.md'), 'utf8'), stale, 'dry-run 不写盘');
      const fx2 = await tocGate.fix({ root: dir, files: ['a.md', 'm.md'], gateConfig: {}, dryRun: false });
      assert.deepEqual(fx2, ['a.md'], '手写节不修复');
      const after = fs.readFileSync(path.join(dir, 'a.md'), 'utf8');
      assert.ok(after.includes('1. [A](#a)\n  2. [B](#b)\n\n---'), '节体被重写为生成形');
      assert.deepEqual(await tocGate.run(mkCtx(['a.md'], () => after)), [], '修复后零 finding（幂等）');
      // insert 修复：H1 后插壳
      fs.writeFileSync(path.join(dir, 'n.md'), '# T\n\n## A\n### B\n## C\n');
      const fx3 = await tocGate.fix({ root: dir, files: ['n.md'], gateConfig: { mode: 'insert' }, dryRun: false });
      assert.deepEqual(fx3, ['n.md']);
      const n = fs.readFileSync(path.join(dir, 'n.md'), 'utf8');
      assert.ok(n.includes('## 目录\n1. [A](#a)'), 'H1 后插入目录节');
      assert.ok(n.indexOf('## 目录') < n.indexOf('## A'), '目录在正文标题前');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }

  // 13. 解耦面：command 键参数化 + emoji 精确文件名根语义（仓专默认值→配置的边界回测）
  {
    const { gate: itGate } = await import('../../scripts/hooks/gates/impact-test.mjs');
    // available：command 已配即启用（无需 tests/run.mjs）；未配且无文件 → 缺席
    assert.equal(itGate.available({ root: '/nonexistent-x', gateConfig: { command: 'anything' } }), true, 'command 已配即启用');
    assert.equal(itGate.available({ root: '/nonexistent-x', gateConfig: {} }), false, '未配且无 tests/run.mjs 缺席');
    // command 执行语义：非零退出 → finding
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ming-cmd-'));
    try {
      fs.writeFileSync(path.join(dir, 'ok.mjs'), 'process.exit(0)\n');
      fs.writeFileSync(path.join(dir, 'bad.mjs'), 'process.exit(1)\n');
      const node = process.execPath;
      assert.deepEqual(await itGate.run({ root: dir, files: ['x.md'], gateConfig: { command: `"${node}" ok.mjs` } }), [], '零退出零 finding');
      const bad = await itGate.run({ root: dir, files: ['x.md'], gateConfig: { command: `"${node}" bad.mjs` } });
      assert.equal(bad.length, 1);
      assert.ok(bad[0].message.includes('bad.mjs'), 'finding 应含失败命令');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }

    const { gate: emojiGate } = await import('../../scripts/hooks/gates/emoji.mjs');
    // 精确文件名只认根：docs/** 覆盖下的 README 查，vendor 深层 README 不查
    const ectx = { files: ['README.md', 'docs/x/README.md', 'vendor/y/README.md', 'docs/a.md'], read: () => 'x \u{1F600}', gateConfig: { globs: 'docs/**,README.md' } };
    const ef = await emojiGate.run(ectx);
    assert.deepEqual(ef.map(f => f.file).sort(), ['README.md', 'docs/a.md', 'docs/x/README.md'], 'literal 根语义+slash glob 覆盖');
    // 默认全域（['*']）：所有文本文件在域
    const ectx2 = { files: ['vendor/y/README.md'], read: () => 'x \u{1F600}', gateConfig: {} };
    assert.equal((await emojiGate.run(ectx2)).length, 1, '默认 globs=* 仓中性全域');
  }

  // 14. 周期维度：parseCadence + state 合并语义 + review-after 门 + cadence 节流 e2e
  {
    // 解析：单位齐全 + 非法拒绝
    assert.equal(parseCadence('7d'), 7 * 86400e3);
    assert.equal(parseCadence('24h'), 24 * 3600e3);
    assert.equal(parseCadence('30m'), 30 * 60e3);
    assert.equal(parseCadence('10s'), 10e3);
    assert.equal(parseCadence('7'), null, '缺单位拒绝');
    assert.equal(parseCadence('abc'), null);
    assert.equal(parseCadence(''), null);

    // state 读写 + writeTrust 合并保留 lastRun（load-bearing：trust 不抹节流戳）
    const sdir = tempRepo();
    try {
      assert.equal(lastRunAt(sdir, 'review-after'), 0, '无记录=立即到期');
      stampRun(sdir, 'review-after');
      assert.ok(lastRunAt(sdir, 'review-after') > 0, '盖戳后可读');
      writeTrust(sdir, 'hash-abc');
      const st = readState(sdir);
      assert.equal(st.gatesHash, 'hash-abc');
      assert.ok(st.lastRun['review-after'], 'trust 写入保留 lastRun');
    } finally { fs.rmSync(sdir, { recursive: true, force: true }); }

    // review-after 门：到期 warn / 未到期静默 / globs 空 off / globs 域外不扫
    const { gate: raGate } = await import('../../scripts/hooks/gates/review-after.mjs');
    const rdir = tempRepo();
    try {
      fs.mkdirSync(path.join(rdir, 'distill/_proposals'), { recursive: true });
      fs.writeFileSync(path.join(rdir, 'distill/_proposals/expired.md'), 'reviewAfter: 2000-01-01\n');
      fs.writeFileSync(path.join(rdir, 'distill/_proposals/future.md'), 'reviewAfter: 2999-01-01\n');
      fs.writeFileSync(path.join(rdir, 'distill/_proposals/nodate.md'), '普通候审档\n');
      fs.mkdirSync(path.join(rdir, 'elsewhere'), { recursive: true });
      fs.writeFileSync(path.join(rdir, 'elsewhere/old.md'), 'reviewAfter: 1999-12-31\n');
      execFileSync('git', ['add', '.'], { cwd: rdir });
      const raCtx = { root: rdir, gateConfig: { globs: 'distill/_proposals/*.md' } };
      const rf = await raGate.run(raCtx);
      assert.equal(rf.length, 1, `仅 expired 命中，实际: ${rf.map(f => f.file).join(',')}`);
      assert.equal(rf[0].file, 'distill/_proposals/expired.md');
      assert.ok(rf[0].message.includes('2000-01-01'));
      assert.deepEqual(await raGate.run({ root: rdir, gateConfig: { globs: '' } }), [], 'globs 空=off-until-configured');
      assert.deepEqual(await raGate.run({ root: rdir, gateConfig: {} }), [], '未配 globs=off');
    } finally { fs.rmSync(rdir, { recursive: true, force: true }); }

    // e2e：cadence 节流——首跑告警盖戳→次跑跳过→改旧戳再跑复报
    const edir = tempRepo();
    try {
      fs.cpSync(path.join(root, 'scripts/hooks'), path.join(edir, 'scripts/hooks'), { recursive: true });
      fs.writeFileSync(path.join(edir, '.hooksrc'), [
        'lintLevel=off', 'secretLevel=off', 'mojibakeLevel=off', 'emojiLevel=off',
        'gate.impact-test.level=off', 'gate.pre-push-verify.level=off',
        'gate.review-after.globs=proposals/*.md', 'gate.review-after.cadence=2s',
      ].join('\n'));
      fs.mkdirSync(path.join(edir, 'proposals'), { recursive: true });
      fs.writeFileSync(path.join(edir, 'proposals/x.md'), 'reviewAfter: 2000-01-01\n');
      execFileSync('git', ['add', '.'], { cwd: edir });
      const engine = path.join(edir, 'scripts/hooks/engine.mjs');
      const runCheck = () => spawnSync(process.execPath, [engine, 'run', 'check'], { cwd: edir, encoding: 'utf8' });
      let r = runCheck();
      assert.ok((r.stdout + r.stderr).includes('2000-01-01'), `首跑应告警: ${r.stdout}${r.stderr}`);
      const sf = path.join(edir, '.git/hook-engine-state.json');
      assert.ok(JSON.parse(fs.readFileSync(sf, 'utf8')).lastRun['review-after'], '首跑盖戳');
      r = runCheck();
      assert.ok((r.stdout + r.stderr).includes('cadence 未到跳过: review-after'), '节流期内跳过');
      assert.ok(!(r.stdout + r.stderr).includes('2000-01-01'), '节流期内不复报');
      // 改旧戳→立即到期复跑
      const st = JSON.parse(fs.readFileSync(sf, 'utf8'));
      st.lastRun['review-after'] = '2000-01-01T00:00:00.000Z';
      fs.writeFileSync(sf, JSON.stringify(st));
      r = runCheck();
      assert.ok((r.stdout + r.stderr).includes('2000-01-01'), '戳过期后复报');
    } finally { fs.rmSync(edir, { recursive: true, force: true }); }
  }

  // 15. 键空间对账：checkKeyspace（tmpl↔configKeys + .hooksrc 拼错键捕获）
  {
    const { checkKeyspace } = await import('../../scripts/hooks/lib/integrity.mjs');
    const fakeGates = [
      { id: 'toc', configKeys: ['depth', 'titles', 'mode'] },
      { id: 'empty-gate' }, // 无 configKeys = 仅通用键
    ];
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ming-keys-'));
    try {
      // 合法面：原生 configKeys + 通用键 + 声明式键（未知 id）+ chore 键 → 零 findings
      fs.writeFileSync(path.join(dir, '.hooksrc'), [
        'gate.toc.depth=2', 'gate.toc.level=warn', 'gate.toc.cadence=7d',
        'gate.empty-gate.level=off',
        'gate.my-decl.pattern=TODO', 'gate.my-decl.once=true', 'gate.my-decl.message=x',
        'chore.deps.watch=package-lock.json', 'chore.deps.message=同步',
      ].join('\n'));
      assert.deepEqual(checkKeyspace(dir, fakeGates), [], '合法键面零告警');

      // 违例面：原生门错键 + 通用键外键 + 声明式非法键 + chore 非法键 + 拼错键
      fs.writeFileSync(path.join(dir, '.hooksrc.local'), [
        'gate.toc.dept=2',           // 拼错（depth→dept）——静默失效的真实缺口
        'gate.empty-gate.depth=2',   // 无 configKeys 的门吃私键
        'gate.my-decl.weight=1',     // 声明式门不认识 weight
        'chore.deps.depth=3',        // chore 不认识 depth
      ].join('\n'));
      const kf = checkKeyspace(dir, fakeGates);
      assert.equal(kf.length, 4, `4 条违例，实际: ${kf.map(f => f.message).join(';')}`);
      assert.ok(kf.every(f => f.file === '.hooksrc.local'), '归属文件正确');
      assert.ok(kf[0].message.includes('toc.dept') && kf[0].message.includes('configKeys'), '原生错键指向 configKeys');
      assert.ok(kf[3].message.includes('chore'), 'chore 错键提示 chore 键空间');

      // tmpl 同法对账 + 未知 id 当声明式处理
      fs.writeFileSync(path.join(dir, '.hooksrc.tmpl'), '# gate.toc.mode=insert\ngate.toc.mood=x\n');
      const tf = checkKeyspace(dir, fakeGates);
      assert.equal(tf.length, 5, 'tmpl 违例并入');
      assert.ok(tf.some(f => f.file === '.hooksrc.tmpl' && f.message.includes('toc.mood')), 'tmpl 错键捕获');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }

    // meta：出厂十门均带 configKeys 自描述字段（模块即 SoT）
    for (const f of fs.readdirSync(path.join(root, 'scripts/hooks/gates')).filter(x => x.endsWith('.mjs'))) {
      const { gate } = await import(`../../scripts/hooks/gates/${f}`);
      assert.ok(Array.isArray(gate.configKeys), `${f} 应导出 configKeys 数组`);
    }
    // 本仓三文件实跑零违例（防止配置面与实现对账漂移）
    const natives = [];
    for (const f of fs.readdirSync(path.join(root, 'scripts/hooks/gates')).filter(x => x.endsWith('.mjs'))) {
      natives.push((await import(`../../scripts/hooks/gates/${f}`)).gate);
    }
    assert.deepEqual(checkKeyspace(root, natives), [], '本仓配置面与键空间对账零漂移');
  }

  // 16. post-checkout stage：shim flag 闸控 + range 文件源 + flag=0 兜底 + 零 SHA 退化
  {
    // shim 模板：flag=1 闸控在 shim 内（文件级检出不启 node）+ exit 0 非阻断 + 三参透传
    assert.ok(HOOK_STAGES.includes('post-checkout'), 'HOOK_STAGES 含 post-checkout');
    const pcShim = shimScript('post-checkout');
    assert.ok(pcShim.includes('[ "$3" = "1" ]'), 'shim 内 flag 闸控');
    assert.ok(pcShim.includes('"$1" "$2" "$3"'), '三参透传引擎');
    assert.ok(pcShim.endsWith('exit 0\n'), '非阻断 exit 0');
    assert.equal(shimEngineRef(pcShim), REPO_ENGINE_REF, '引擎引用可提取');
    // 本仓 .githooks/post-checkout 与规范模板一致
    const ourShim = fs.readFileSync(path.join(root, '.githooks/post-checkout'), 'utf8').replace(/\r\n/g, '\n');
    assert.equal(ourShim, pcShim, '仓内 shim 与规范模板一致');

    // e2e：range 文件源 + flag 兜底 + 零 SHA 退化 'all'
    const cdir = tempRepo();
    try {
      fs.cpSync(path.join(root, 'scripts/hooks'), path.join(cdir, 'scripts/hooks'), { recursive: true });
      fs.writeFileSync(path.join(cdir, '.hooksrc'), [
        'lintLevel=off', 'secretLevel=off', 'mojibakeLevel=off', 'emojiLevel=off',
        'gate.impact-test.level=off', 'gate.pre-push-verify.level=off', 'gate.review-after.level=off',
        'chore.sub.watch=deps/lock.json', 'chore.sub.stages=post-checkout', 'chore.sub.message=指针变更',
      ].join('\n'));
      const g = (...a) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: cdir, encoding: 'utf8' }).trim();
      fs.mkdirSync(path.join(cdir, 'deps'), { recursive: true });
      fs.writeFileSync(path.join(cdir, 'deps/lock.json'), '{"v":1}\n');
      g('add', '.'); g('commit', '-qm', 'a');
      const shaA = g('rev-parse', 'HEAD');
      fs.writeFileSync(path.join(cdir, 'deps/lock.json'), '{"v":2}\n');
      g('add', '.'); g('commit', '-qm', 'b');
      const shaB = g('rev-parse', 'HEAD');
      const engine = path.join(cdir, 'scripts/hooks/engine.mjs');
      const co = (...args) => spawnSync(process.execPath, [engine, 'post-checkout', ...args], { cwd: cdir, encoding: 'utf8' });

      let r = co(shaA, shaB, '1');
      assert.equal(r.status, 0);
      assert.ok((r.stdout + r.stderr).includes('deps/lock.json'), `range 增量应命中 chore: ${r.stdout}${r.stderr}`);

      r = co(shaA, shaB, '0');
      assert.equal(r.status, 0);
      assert.ok(!(r.stdout + r.stderr).includes('deps/lock.json'), 'flag=0 文件级检出兜底跳过');

      // 零 SHA（clone 形态）→ 'all' 源退化，仍命中
      r = co('0'.repeat(40), shaB);
      assert.equal(r.status, 0);
      assert.ok((r.stdout + r.stderr).includes('deps/lock.json'), '零 SHA 退化 all 源仍命中');
    } finally { fs.rmSync(cdir, { recursive: true, force: true }); }
  }

  // 17. 采纳元数据：state.adoption 记录 + engine list 落后对账
  {
    const adir = tempRepo();
    try {
      fs.cpSync(path.join(root, 'scripts/hooks'), path.join(adir, 'scripts/hooks'), { recursive: true });
      fs.writeFileSync(path.join(adir, '.hooksrc'), 'lintLevel=off\nsecretLevel=off\nmojibakeLevel=off\nemojiLevel=off\ngate.impact-test.level=off\n');
      fs.writeFileSync(path.join(adir, 'x.txt'), 'x\n');
      execFileSync('git', ['add', '.'], { cwd: adir });
      const engine = path.join(adir, 'scripts/hooks/engine.mjs');
      const sf = path.join(adir, '.git/hook-engine-state.json');

      // 无 adoption 记录 → 静默（自托管仓非采纳形态）
      let r = spawnSync(process.execPath, [engine, 'list'], { cwd: adir, encoding: 'utf8' });
      assert.ok(!(r.stdout + r.stderr).includes('kit 来源'), '无 adoption 不打印');

      // 记录源仓=本仓 HEAD → "已最新"（源仓可达对账）
      const ourHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
      fs.writeFileSync(sf, JSON.stringify({ adoption: { sourceRepo: root, sourceRev: ourHead, adoptedAt: '2026-09-21T00:00:00.000Z' } }));
      r = spawnSync(process.execPath, [engine, 'list'], { cwd: adir, encoding: 'utf8' });
      assert.ok((r.stdout + r.stderr).includes('kit 来源'), 'adoption 头部打印');
      assert.ok((r.stdout + r.stderr).includes('已最新'), `同源同版应报已最新: ${r.stdout}`);

      // 记录旧版本 → 落后 N（HEAD~1 必落后 1+ 提交）
      const oldRev = execFileSync('git', ['rev-parse', 'HEAD~1'], { cwd: root, encoding: 'utf8' }).trim();
      fs.writeFileSync(sf, JSON.stringify({ adoption: { sourceRepo: root, sourceRev: oldRev, adoptedAt: '2026-09-21T00:00:00.000Z' } }));
      r = spawnSync(process.execPath, [engine, 'list'], { cwd: adir, encoding: 'utf8' });
      assert.ok(/落后 \d+ 提交/.test(r.stdout + r.stderr), `旧版应报落后: ${r.stdout}`);

      // 源仓不可达 → 只报记录值不崩
      fs.writeFileSync(sf, JSON.stringify({ adoption: { sourceRepo: '/nonexistent-repo-xyz', sourceRev: 'abc', adoptedAt: '2026-09-21T00:00:00.000Z' } }));
      r = spawnSync(process.execPath, [engine, 'list'], { cwd: adir, encoding: 'utf8' });
      assert.equal(r.status, 0, '源仓不可达不崩');
      assert.ok((r.stdout + r.stderr).includes('kit 来源'), '记录值仍打印');
    } finally { fs.rmSync(adir, { recursive: true, force: true }); }
  }

  // 18. 消融审计修复回测：chore: 前缀归一化（level/cadence/gateConfigFor）+ decl 键面完整
  {
    const { checkKeyspace } = await import('../../scripts/hooks/lib/integrity.mjs');
    const { resolveGateConfigFor } = await import('../../scripts/hooks/lib/config.mjs');
    // resolveLevel：chore.deps.level=off 生效（修复前死键——id 'chore:deps' 查 cfg.gates 落空）
    const lc = { gates: {}, chores: { deps: { level: 'off' } }, flat: {}, sections: [] };
    assert.equal(resolveLevel('chore:deps', 'warn', lc), 'off', 'chore.level 归一化生效');
    assert.equal(resolveLevel('chore:other', 'warn', lc), 'warn', '未配走默认');
    // resolveGateConfigFor：chore 桶 + chore.X 节键
    const sc = { gates: {}, chores: { deps: { cadence: '7d', watch: 'x' } },
      sections: [{ glob: 'docs/**', entries: { 'chore.deps.cadence': '1d' } }] };
    assert.equal(resolveGateConfigFor(sc, 'chore:deps', 'docs/a.md').cadence, '1d', '节内 chore 键覆盖');
    assert.equal(resolveGateConfigFor(sc, 'chore:deps', 'src/a.md').cadence, '7d', '节外全局值');

    // checkKeyspace：decl stages/skipIf 合法（修复前误报）；chore.stages 合法
    const kdir = fs.mkdtempSync(path.join(os.tmpdir(), 'ming-keys2-'));
    try {
      fs.writeFileSync(path.join(kdir, '.hooksrc'),
        'gate.d.stages=post-merge\ngate.d.skipIf=merge\nchore.c.stages=post-checkout\n');
      assert.deepEqual(checkKeyspace(kdir, []), [], 'decl stages/skipIf + chore.stages 合法不误报');
    } finally { fs.rmSync(kdir, { recursive: true, force: true }); }

    // e2e：chore cadence 真实生效 + chore.level=off 关闭 + SKIP 裸 id
    const edir = tempRepo();
    try {
      fs.cpSync(path.join(root, 'scripts/hooks'), path.join(edir, 'scripts/hooks'), { recursive: true });
      fs.writeFileSync(path.join(edir, '.hooksrc'), [
        'lintLevel=off', 'secretLevel=off', 'mojibakeLevel=off', 'emojiLevel=off',
        'gate.impact-test.level=off', 'gate.review-after.level=off',
        'chore.c.watch=t.txt', 'chore.c.stages=pre-commit', 'chore.c.cadence=2s', 'chore.c.message=提醒件',
      ].join('\n'));
      fs.writeFileSync(path.join(edir, 't.txt'), 'x\n');
      execFileSync('git', ['add', '.'], { cwd: edir });
      const engine = path.join(edir, 'scripts/hooks/engine.mjs');
      const pc = (env = {}) => spawnSync(process.execPath, [engine, 'pre-commit'], { cwd: edir, encoding: 'utf8', env: { ...process.env, ...env } });

      let r = pc();
      assert.ok((r.stdout + r.stderr).includes('提醒件'), `chore 首跑应提醒: ${r.stdout}${r.stderr}`);
      const sf = path.join(edir, '.git/hook-engine-state.json');
      assert.ok(JSON.parse(fs.readFileSync(sf, 'utf8')).lastRun['chore:c'], 'chore 盖戳键=bare 前缀 id');

      r = pc();
      assert.ok((r.stdout + r.stderr).includes('cadence 未到跳过: chore:c'), 'chore cadence 节流生效（修复前死键）');

      // SKIP 裸 id（不带 chore: 前缀）也豁免
      const st = JSON.parse(fs.readFileSync(sf, 'utf8')); st.lastRun = {}; fs.writeFileSync(sf, JSON.stringify(st));
      r = pc({ SKIP: 'c' });
      assert.ok((r.stdout + r.stderr).includes('SKIP 豁免: chore:c'), 'SKIP 裸 id 豁免 chore');

      // chore.level=off 关闭（修复前死键——warn 恒提醒）
      fs.writeFileSync(path.join(edir, '.hooksrc'),
        fs.readFileSync(path.join(edir, '.hooksrc'), 'utf8') + '\nchore.c.level=off\n');
      r = pc();
      assert.ok(!(r.stdout + r.stderr).includes('提醒件'), 'chore.level=off 应静默');
    } finally { fs.rmSync(edir, { recursive: true, force: true }); }
  }

  // 19. link-rot 门：URL 提取/探测分类（localhost 注入——禁真网络）+ run() 接线 + cadence e2e
  {
    const { extractLinks, checkLink, scanLinks, gate: linkRot } = await import('../../scripts/hooks/gates/link-rot.mjs');
    const http = await import('node:http');

    // —— lib-core：提取（oracle=语法边界）——
    const links = extractLinks([
      'see [doc](https://a.com/m).',      // md 链接 + ). 尾
      'bare https://b.io/y, https://b.io/y', // 逗号尾 + 重复出现
      'mailto:c@d.com #anchor ./rel',      // 非 http(s) 全跳
      'http://c.org/x',                    // http 也算
    ].join('\n'));
    assert.deepEqual(links.map(l => l.url),
      ['https://a.com/m', 'https://b.io/y', 'https://b.io/y', 'http://c.org/x'], '提取+尾标点剥离');
    assert.equal(links[0].line, 1, '行号携带');
    // scanLinks：glob 域过滤 + ignore 子串 + 去重保首见位置
    const sdir = fs.mkdtempSync(path.join(os.tmpdir(), 'ming-scan-'));
    try {
      fs.mkdirSync(path.join(sdir, 'docs'), { recursive: true });
      fs.mkdirSync(path.join(sdir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(sdir, 'docs/a.md'), 'https://u1.dev/a\nhttps://u1.dev/a\nhttp://skip.me/x\n');
      fs.writeFileSync(path.join(sdir, 'src/b.js'), 'https://u2.dev/b\n');
      const seen = scanLinks(sdir, ['docs/a.md', 'src/b.js'], ['docs/**'], ['skip.me']);
      assert.deepEqual([...seen.keys()], ['https://u1.dev/a'], 'glob 域+ignore+去重');
      assert.equal(seen.get('https://u1.dev/a').line, 1, '首见行号');
    } finally { fs.rmSync(sdir, { recursive: true, force: true }); }

    // —— localhost server 注入（oracle=HTTP 状态语义，确定性无真网络）——
    const server = http.createServer((req, res) => {
      if (req.url === '/hang') return; // 永不响应——客户端超时路径（无 sleep）
      if (req.url === '/redir') { res.writeHead(302, { location: '/ok' }); return res.end(); }
      if (req.url === '/head405' && req.method === 'HEAD') { res.writeHead(405); return res.end(); }
      const code = { '/ok': 200, '/head405': 200, '/dead': 404, '/gone': 410, '/err': 500, '/auth': 403 }[req.url] ?? 404;
      res.writeHead(code); res.end();
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    try {
      const base = `http://127.0.0.1:${port}`;
      assert.equal(await checkLink(`${base}/ok`, 3000), 'ok');
      assert.equal(await checkLink(`${base}/redir`, 3000), 'ok', '跟随重定向');
      assert.equal(await checkLink(`${base}/dead`, 3000), 'dead');
      assert.equal(await checkLink(`${base}/gone`, 3000), 'dead');
      assert.equal(await checkLink(`${base}/err`, 3000), 'unreachable');
      assert.equal(await checkLink(`${base}/auth`, 3000), 'ok', '403=可达非rot');
      assert.equal(await checkLink(`${base}/head405`, 3000), 'ok', 'HEAD 405 回退 GET');
      assert.equal(await checkLink(`${base}/hang`, 200), 'timeout', '短超时+挂起=timeout');
      assert.equal(await checkLink('http://127.0.0.1:1/x', 3000), 'error', '拒连=error');

      // —— run() 接线（tempRepo + 真实门对象）——
      const rdir = tempRepo();
      try {
        fs.mkdirSync(path.join(rdir, 'docs'), { recursive: true });
        fs.writeFileSync(path.join(rdir, 'docs/x.md'), `${base}/dead\n${base}/ok\n`);
        execFileSync('git', ['add', '.'], { cwd: rdir });
        let f = await linkRot.run({ root: rdir, gateConfig: { globs: 'docs/**' } });
        assert.equal(f.length, 1, '仅死链报出');
        assert.ok(f[0].message.includes('死链') && f[0].file === 'docs/x.md', 'file+死链语义');
        f = await linkRot.run({ root: rdir, gateConfig: { globs: 'docs/**', ignore: '127.0.0.1' } });
        assert.equal(f.length, 0, 'ignore 子串全滤');
        f = await linkRot.run({ root: rdir, gateConfig: { globs: 'docs/**', maxUrls: '1' } });
        assert.ok(f.some(x => x.message.includes('截断')), 'maxUrls 截断提示');
        f = await linkRot.run({ root: rdir, gateConfig: {} });
        assert.equal(f.length, 0, 'off-until-configured');
      } finally { fs.rmSync(rdir, { recursive: true, force: true }); }

      // 全军覆没 → 单条疑似离线（拒连端口）
      const ndir = tempRepo();
      try {
        fs.writeFileSync(path.join(ndir, 'x.md'), 'http://127.0.0.1:1/a\nhttp://127.0.0.1:1/b\n');
        execFileSync('git', ['add', '.'], { cwd: ndir });
        const f = await linkRot.run({ root: ndir, gateConfig: { globs: '**/*.md' } });
        assert.equal(f.length, 1, '合并单条不刷屏');
        assert.ok(f[0].message.includes('疑似离线'), '离线语义');
      } finally { fs.rmSync(ndir, { recursive: true, force: true }); }

      // —— e2e：engine post-merge + cadence 节流 ——
      const edir = tempRepo();
      try {
        fs.cpSync(path.join(root, 'scripts/hooks'), path.join(edir, 'scripts/hooks'), { recursive: true });
        fs.mkdirSync(path.join(edir, 'docs'), { recursive: true });
        fs.writeFileSync(path.join(edir, 'docs/x.md'), `${base}/dead\n`);
        fs.writeFileSync(path.join(edir, '.hooksrc'), [
          'lintLevel=off', 'secretLevel=off', 'mojibakeLevel=off', 'emojiLevel=off',
          'gate.impact-test.level=off', 'gate.review-after.level=off',
          `gate.link-rot.globs=docs/**`, 'gate.link-rot.cadence=2s', 'gate.link-rot.timeoutMs=3000',
        ].join('\n'));
        execFileSync('git', ['add', '.'], { cwd: edir });
        const engine = path.join(edir, 'scripts/hooks/engine.mjs');
        // post-checkout 无参直跑：退化 'all' 源（post-merge 无 ORIG_HEAD 会容错静默 return 0）
        const pm = () => spawnSync(process.execPath, [engine, 'post-checkout'], { cwd: edir, encoding: 'utf8' });
        let r = pm();
        assert.ok((r.stdout + r.stderr).includes('link-rot') && (r.stdout + r.stderr).includes('死链'),
          `post-checkout 首跑死链告警: ${r.stdout}${r.stderr}`);
        r = pm();
        assert.ok((r.stdout + r.stderr).includes('cadence 未到跳过: link-rot'), 'cadence 节流生效');
      } finally { fs.rmSync(edir, { recursive: true, force: true }); }
    } finally {
      server.closeAllConnections?.();
      server.close();
    }
  }

  // 20. commit-msg spec 模型化：解析器归一 + commitMsgPolicy 装配 + 仓中性默认
  {
    const { loadHookConfig, commitMsgPolicy, validateTrailer, validateSubject, COMMIT_TYPES, BANNED_TRAILER_PATTERNS } =
      await import('../../scripts/hooks/validate.mjs');

    // —— 解析器归一（validate.mjs 委托 parseIniFile——blog-tui 降级缺陷回测）——
    const cdir = fs.mkdtempSync(path.join(os.tmpdir(), 'ming-vcfg-'));
    try {
      fs.writeFileSync(path.join(cdir, '.hooksrc'), 'trailerLevel=error   # 行内注释\nemojiLevel=error\n');
      fs.writeFileSync(path.join(cdir, '.hooksrc.local'), 'emojiLevel=warn\n');
      const lc = loadHookConfig(cdir);
      assert.equal(lc.trailerLevel, 'error', '行内注释剥离（老解析器污染回测）');
      assert.equal(lc.emojiLevel, 'warn', 'local 合并');
    } finally { fs.rmSync(cdir, { recursive: true, force: true }); }

    // —— commitMsgPolicy 装配 ——
    const p1 = commitMsgPolicy({}, { types: 'feat,fix,collect' });
    assert.deepEqual(p1.types, ['feat', 'fix', 'collect'], 'types 覆盖');
    assert.ok(p1.subjectPattern.test('collect: x'), 'types→pattern 合成');
    assert.ok(!p1.subjectPattern.test('chore: x'), '合成正则只吃覆盖词表');
    const p2 = commitMsgPolicy({}, { bannedTrailers: '^Foo\\b,^Bar\\s*:', extraTrailers: '^Signed' });
    assert.equal(p2.bannedTrailers.length, 2, 'bannedTrailers 替换两值');
    assert.equal(p2.extraTrailers.length, 1, 'extraTrailers 追加');
    const p3 = commitMsgPolicy({}, { pattern: '([' });
    assert.equal(p3.patternInvalid, '([', '非法正则标记');

    // —— 仓中性默认（kit 不再烧本仓政策）——
    assert.equal(COMMIT_TYPES.length, 11, '默认词表=Conventional 11');
    assert.ok(!COMMIT_TYPES.includes('collect'), '仓专 collect 出默认');
    assert.equal(BANNED_TRAILER_PATTERNS.length, 0, '默认禁尾空');
    assert.equal(validateTrailer('x\n\nCo-Authored-By: a@b', {}).ok, true, '空禁尾下标准 trailer 放行');
    const emo = validateSubject('feat: add 😀 thing', {});
    assert.equal(emo.ok, true, 'emoji 默认 warn 不阻断');
    assert.equal(emo.warnings.length, 1, 'emoji warn 仍提示');
    assert.equal(validateSubject('wip: x', {}).ok, false, 'wip 不在 Conventional 词表');

    // —— e2e：引擎 commit-msg 双仓对比 ——
    const e1 = tempRepo(); // 本仓形态：12 型 + AI 署名禁令
    const e2 = tempRepo(); // 未配置采纳者：仓中性
    try {
      for (const [d, cfg] of [
        [e1, ['lintLevel=off', 'secretLevel=off', 'gate.commit-msg.types=feat,fix,collect',
          'gate.commit-msg.bannedTrailers=^Co-Authored-By\\s*:'].join('\n')],
        [e2, 'lintLevel=off\nsecretLevel=off\n'],
      ]) {
        fs.cpSync(path.join(root, 'scripts/hooks'), path.join(d, 'scripts/hooks'), { recursive: true });
        fs.writeFileSync(path.join(d, '.hooksrc'), cfg);
      }
      const eng = d => path.join(d, 'scripts/hooks/engine.mjs');
      const cm = (d, msg) => {
        fs.writeFileSync(path.join(d, 'msg.txt'), msg);
        return spawnSync(process.execPath, [eng(d), 'commit-msg', 'msg.txt'], { cwd: d, encoding: 'utf8' });
      };
      assert.equal(cm(e1, 'collect: vendored repo').status, 0, '配置仓 collect 放行');
      assert.equal(cm(e2, 'collect: vendored repo').status, 1, '未配置仓 collect 拦截（仓中性）');
      const b1 = cm(e1, 'fix: x\n\nCo-Authored-By: a@b.c');
      assert.equal(b1.status, 1, '配置仓署名禁令拦截');
      const b2 = cm(e2, 'fix: x\n\nCo-Authored-By: a@b.c');
      assert.equal(b2.status, 0, '未配置仓标准 trailer 放行（政策不烧死）');
    } finally {
      fs.rmSync(e1, { recursive: true, force: true });
      fs.rmSync(e2, { recursive: true, force: true });
    }
  }

  console.log('  -> hook-engine: 20 组断言全部通过（归组/matcher/声明式/baseline/等级/端到端/多层密钥+策略/chores/fix/采纳自检/分节解析/toc门/解耦面/周期维度/键空间对账/post-checkout/采纳元数据/消融修复/link-rot/commit-spec模型化）');
}
