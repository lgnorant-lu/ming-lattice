// tests/unit/test-ming-boundary.test.mjs
// 单元测试: private/engineering/ming-boundary/scripts/{extract-facts,check-boundaries}.mjs
// 覆盖: 事实 schema 形状 / domainOf 首段锚定回归 / 排序确定性(byte-identical) /
//       声明形态族谱(function/async/arrow/method/getset) / 动态 import 字面量+计算式 /
//       dead import scope 分类 / junction link 事实+不穿透 / fail-closed 退出码 /
//       契约评估 forbidden/allowed/required/内建 dead / schema 校验拒未知键
// fixture 全在 os.tmpdir 下临时生成，不触仓库真源。

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fact, domainOf, sortFacts, toJsonl, parseJsonl, globMatch }
  from '../../private/engineering/ming-boundary/scripts/lib/facts.mjs';
import { findAstGrep }
  from '../../private/engineering/ming-boundary/scripts/lib/frontends.mjs';

const PKG = path.resolve(import.meta.dirname, '../../private/engineering/ming-boundary');
const EXTRACT = path.join(PKG, 'scripts/extract-facts.mjs');
const CHECK = path.join(PKG, 'scripts/check-boundaries.mjs');
// 前端在位性与抽取器共享同一 oracle——不各自硬编码（机器路径曾藏在两处）
const hasSg = !!findAstGrep();

let tmpRoot;
function wfile(rel, text) {
  const p = path.join(tmpRoot, 'repo', rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text, 'utf8');
  return p;
}
const runNode = (args, env = {}) =>
  spawnSync(process.execPath, args, { encoding: 'utf8', env: { ...process.env, ...env } });

export async function run() {
  console.log('[TEST UNIT] ming-boundary...');
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mb-root-'));
  try {
    const R = path.join(tmpRoot, 'repo');
    fs.mkdirSync(R, { recursive: true });

    // ---------- 组 1: facts.mjs 纯函数层 ----------
    // 1a. fact() 必填键齐 + line/extra 缺省不落键
    const f1 = fact({ unit: 'a.mjs', kind: 'file', name: 'a.mjs', file: 'a.mjs',
      fidelity: 'exact', scope: 'repo', extractor: 't@1' });
    assert.equal(f1.v, 1);
    assert.ok(!('line' in f1) && !('extra' in f1), '可选键缺省不应落位');

    // 1b. domainOf 首段锚定回归（切片二教训：private/x/scripts 归 private）
    const doms = [
      { name: 'private', match: 'private/**' },
      { name: 'scripts', match: 'scripts/**' },
      { name: 'multi', match: 'a/**|b/**' },
    ];
    assert.equal(domainOf('private/x/scripts/y.mjs', doms), 'private');
    assert.equal(domainOf('scripts/x.mjs', doms), 'scripts');
    assert.equal(domainOf('b/c.mjs', doms), 'multi');
    assert.equal(domainOf('nowhere/x.mjs', doms), null);

    // 1c. 排序确定性：乱序输入 → 同一输出；toJsonl/parseJsonl 往返
    const mk = (file, line, kind, name) =>
      fact({ unit: `${file}#${name}`, kind, name, file, line,
        fidelity: 'syntactic', scope: 'module', extractor: 't@1' });
    const shuffled = [mk('b.mjs', 2, 'decl', 'f'), mk('a.mjs', 9, 'import', './x'),
      mk('a.mjs', 3, 'decl', 'g'), mk('a.mjs', 3, 'decl', 'a')];
    const s1 = toJsonl(shuffled), s2 = toJsonl([...shuffled].reverse());
    assert.equal(s1, s2, '乱序输入应产 byte-identical JSONL');
    const back = parseJsonl(s1);
    assert.equal(back.length, 4);
    assert.deepEqual(back.map((x) => x.name), ['a', 'g', './x', 'f'], '排序键序 file→line→kind→name');
    assert.throws(() => parseJsonl('{"a":1}\n{bad json}\n'), /第 2 行/, '坏行应带行号报错');

    // 1d. globMatch 段级语义（v1.1 SubjectSet 选择集）
    assert.ok(globMatch('docs/a/b.md', '**/*.md'), '**/ 应跨段且含零段');
    assert.ok(globMatch('x.md', '**/*.md'), '**/ 零段也命中');
    assert.ok(globMatch('a/b/c.mjs', 'a/**'), 'a/** 吃多层');
    assert.ok(!globMatch('a', 'a/**'), 'a/** 不吃 a 本身');
    assert.ok(!globMatch('a/b/x.mjs', '*.mjs'), '单星不跨段');
    assert.ok(globMatch('x.tmp', '*.tmp'));
    assert.ok(!globMatch('a/b.tmp/c', '**/*.tmp'), '*.tmp 只匹后缀');

    // ---------- 组 2: fixture 仓 ----------
    wfile('src/b.mjs', 'export default function b() {}\nexport const K = () => 1;\n');
    wfile('src/a.mjs', [
      'import { K } from \'./b.mjs\';',
      'import \'./gone.mjs\';',
      'const lazy = await import(\'./b.mjs\');',
      'const dyn = await import(dir + name);',
      'export async function top() {}',
      'const arr = async () => 1;',
      'class C { static m() {} get g() { return 1 } }',
      'function* gen() {}',
    ].join('\n'));
    wfile('vendored/v1/lib.mjs', 'export function vv() {}\n');
    wfile('scripts/tool.ps1', 'function Invoke-Thing { }\n. .\\lib\\helper.ps1\n');
    wfile('docs/note.md', '# md\n');
    // v1.1 文档面：README/docref/mention/docrole 载体
    wfile('README.md', '# Fixture Repo\n\nSee [notes](docs/note.md) and [api](docs/api.md).\n');
    wfile('docs/api.md', [
      '---', 'docrole: api', '---',
      '# API Reference',
      'Entry point is `top()` — see [impl](../src/a.mjs).',
      'Syntax sample: `[x](y)` is meta, not a ref.',
      'Dead: [gone](nope/missing.md).',
      'Ambiguous name: `dup()` here.',
      '```',
      'var x = arr[0]; call[m[b(0x1)]()](fake/link.md); [code](in-fence.md)',
      '```',
      '~~~text',
      'also fenced: [tilde](tilde-fence.md)',
      '~~~',
    ].join('\n'));
    wfile('src/c.mjs', 'export function dup() {}\n');
    wfile('src/dup2.mjs', 'export function dup() {}\n'); // dup 双定义 → mention 歧义
    wfile('src/re.mjs', "export { K } from './b.mjs';\nfunction hidden() {}\n");
    // junction（Windows 免特权；失败则后续 link 断言跳过）
    let junctionOk = false;
    try {
      fs.mkdirSync(path.join(R, 'deployable/d1'), { recursive: true });
      fs.symlinkSync(path.join(R, 'src'), path.join(R, 'deployable/d1/x'), 'junction');
      junctionOk = true;
    } catch { /* 平台不支持则降级 */ }

    // ---------- 组 3: extract-facts 正向（ast-grep 缺失机器只验 walk/link/ps 面） ----------
    const out = path.join(tmpRoot, 'facts.jsonl');
    const r1 = runNode([EXTRACT, '--root', R, '--out', out]);
    assert.ok(r1.status === 0 || r1.status === 3, `extract 退出码应 0/3: ${r1.stderr}`);
    if (r1.status === 3) assert.ok(r1.stderr.includes('fail-closed'), 'exit3 应带 fail-closed 字样');
    assert.equal(r1.status === 0, hasSg, '前端在位性应与退出码一致');
    const facts = r1.status === 0 ? parseJsonl(fs.readFileSync(out, 'utf8')) : [];
    const at = (file, kind, name) => facts.filter((x) =>
      x.file === file && x.kind === kind && (name === undefined || x.name === name));

    if (r1.status === 0) {
    // file 事实覆盖全文件（vendored 也有 file 事实——file 分支与内容抽取白名单正交）
    assert.ok(at('vendored/v1/lib.mjs', 'file').length === 1);
    // import 边四分：静态命中 / 死链 / 动态字面量 / 计算式
    const imp = at('src/a.mjs', 'import');
    const byName = Object.fromEntries(imp.map((x) => [x.name, x]));
    assert.equal(byName['./b.mjs']?.extra?.to, 'src/b.mjs', '静态相对边应解析');
    assert.ok(byName['./b.mjs']?.scope === 'module', '活边 scope=module');
    assert.ok(byName['./gone.mjs']?.extra?.dead, '断链应标 dead');
    assert.equal(byName['./gone.mjs']?.scope, 'unresolved');
    assert.ok(byName['(computed)']?.extra?.mechanism === 'dynamic-computed',
      '计算式 import 应标 dynamic-computed 而非丢失');
    // 动态字面量('./b.mjs' 第二次出现为 dynamic 机制)
    assert.ok(imp.some((x) => x.name === './b.mjs' && x.extra?.mechanism === 'dynamic'),
      '动态字面量应有 mechanism=dynamic');
    // 声明族谱: function/async/arrow/method(含 get)/generator/class
    const decls = at('src/a.mjs', 'decl');
    const shapes = new Set(decls.map((d) => d.extra?.shape));
    for (const s of ['function', 'arrow', 'method', 'class', 'generator'])
      assert.ok(shapes.has(s), `缺声明形态 ${s}: ${[...shapes]}`);
    assert.ok(decls.some((d) => d.name === 'm'), 'class 方法 m 应入图');
    // v1.1a 谓词变更：无 git 上下文时 vendored 无从识别——缺省全扫产 decl；
    // vendored 边界靠 declare 边（.gitignore/豁免）表达，不再靠目录名私货
    assert.ok(at('vendored/v1/lib.mjs', 'decl').length > 0,
      '非 git 根全扫——vendored 也应产 decl 事实');
    // --extract-dirs 显式收窄仍生效（staged/聚焦面用）
    const rNarrow = runNode([EXTRACT, '--root', R, '--extract-dirs', 'src',
      '--allow-degraded', '--out', path.join(tmpRoot, 'f-narrow.jsonl')]);
    assert.equal(rNarrow.status, 0, `--extract-dirs 应过: ${rNarrow.stderr}`);
    const nf = parseJsonl(fs.readFileSync(path.join(tmpRoot, 'f-narrow.jsonl'), 'utf8'));
    assert.ok(!nf.some((x) => x.kind === 'decl' && x.file.startsWith('vendored/')),
      '--extract-dirs src 时 vendored 不应产 decl');
    assert.ok(nf.some((x) => x.kind === 'decl' && x.file.startsWith('src/')),
      '--extract-dirs src 时 src 应产 decl');
    // ps1 降级线: function decl + dot-source import
    const psDecl = at('scripts/tool.ps1', 'decl');
    assert.ok(psDecl.some((d) => d.name === 'Invoke-Thing' && d.fidelity === 'regex-degraded'),
      'ps1 function 应以 regex-degraded 入图');
    assert.ok(at('scripts/tool.ps1', 'import').some((x) => x.extra?.mechanism === 'dot-source'),
      'ps1 dot-source 应产 import 边');
    // junction: link 事实且不穿透（deployable/d1/x 下无文件事实）
    if (junctionOk) {
      const lk = at('deployable/d1/x', 'link');
      assert.equal(lk.length, 1);
      assert.equal(lk[0].extra?.to, 'src', 'junction 目标应解析为 src');
      assert.equal(facts.filter((x) => x.file.startsWith('deployable/d1/x/')).length, 0,
        'junction 不应被穿透');
    }
    // schema 必备键全量断言
    for (const x of facts)
      for (const k of ['v', 'unit', 'kind', 'name', 'file', 'fidelity', 'scope', 'extractor'])
        assert.ok(k in x, `事实缺键 ${k}`);

    // ---------- 组 8: v1.1 抽取面（dir/docrole/docref/mention/export/surface/declare） ----------
    // 8a. dir 事实：walk 产目录单元（unit 尾斜杠）
    assert.ok(facts.some((x) => x.kind === 'dir' && x.unit === 'docs/'), 'docs/ 应产 dir 事实');
    // 8b. docrole：README→readme（文件名兜底链）；frontmatter 覆盖最高优先
    const readmeF = at('README.md', 'file')[0];
    assert.equal(readmeF.extra?.docrole, 'readme', 'README.md 应分面 readme');
    assert.equal(at('docs/api.md', 'file')[0].extra?.docrole, 'api', 'frontmatter docrole 应胜出');
    assert.equal(at('docs/note.md', 'file')[0].extra?.docrole, 'doc', '无信号兜底 doc');
    // 8c. docref 边：活链解析 + 死链标记；code-span 内 [x](y) 不算边
    const dr = at('docs/api.md', 'docref');
    const drNames = dr.map((x) => x.extra?.to);
    assert.ok(drNames.includes('src/a.mjs'), '[impl](../src/a.mjs) 应解析成边');
    assert.ok(dr.some((x) => x.extra?.dead && x.extra?.to === 'docs/nope/missing.md'),
      '死链应标 dead');
    assert.ok(!drNames.some((t) => t === 'y' || /\(y\)|docs\/y$/.test(t || '')),
      'code-span 内 [x](y) 不应产边');
    // 围栏块（``` 与 ~~~）内容是字面文本——JS 撞形语法与伪链都不产 docref
    assert.ok(!drNames.some((t) => /in-fence|tilde-fence|fake\/link|0x1/.test(t || '')),
      `围栏块内不应产 docref: ${JSON.stringify(drNames)}`);
    // 8d. mention 边：唯一命中 → 解析到 decl；双定义 → 歧义 unresolved
    const men = at('docs/api.md', 'mention');
    const mTop = men.find((x) => x.name === 'top');
    assert.ok(mTop && mTop.extra?.to === 'src/a.mjs#top' && mTop.scope === 'module',
      `top() 应唯一解析: ${JSON.stringify(mTop)}`);
    const mDup = men.find((x) => x.name === 'dup');
    assert.ok(mDup && mDup.scope === 'unresolved' && mDup.extra?.ambiguous,
      'dup() 双定义应产歧义 mention');
    assert.ok(!men.some((x) => x.name === 'x'), '`x` 无 decl 不产 mention');
    // 8e. export 边：reexport 产 import+export 双边（v1 相容 + v1.1 面边）
    const exp = at('src/re.mjs', 'export');
    assert.equal(exp.length, 1, 'reexport 应产 1 条 export 边');
    assert.equal(exp[0].extra?.to, 'src/b.mjs');
    assert.ok(at('src/re.mjs', 'import').length === 1, 'reexport 仍产 import 边（v1 相容）');
    // 8f. decl surface：export 声明标 public，未导出标 internal
    const dTop = facts.find((x) => x.unit === 'src/a.mjs#top');
    assert.equal(dTop?.extra?.surface, 'public', 'export async function 应标 public');
    const dArr = facts.find((x) => x.unit === 'src/a.mjs#arr');
    assert.equal(dArr?.extra?.surface, 'internal', '未导出 arrow 应标 internal');
    const dHid = facts.find((x) => x.unit === 'src/re.mjs#hidden');
    assert.equal(dHid?.extra?.surface, 'internal');
    const dK = facts.find((x) => x.unit === 'src/b.mjs#K');
    assert.equal(dK?.extra?.surface, 'public', 'export const K 应标 public');
    const dB = facts.find((x) => x.unit === 'src/b.mjs#b');
    assert.equal(dB?.extra?.surface, 'public', 'export default function b 应标 public');

    // ---------- 组 4: byte-identical 复跑 ----------
    const out2 = path.join(tmpRoot, 'facts2.jsonl');
    runNode([EXTRACT, '--root', R, '--out', out2]);
    assert.equal(fs.readFileSync(out, 'utf8'), fs.readFileSync(out2, 'utf8'),
      '同输入两跑应 byte-identical');
    }

    // ---------- 组 5: fail-closed / 退出码契约 ----------
    const dead = runNode([EXTRACT, '--root', R, '--allow-degraded'],
      { AST_GREP_BIN: 'D:/nonexistent/sg.exe' });
    assert.equal(dead.status, 0, 'allow-degraded 应放行');
    const noFront = runNode([EXTRACT, '--root', R], { AST_GREP_BIN: 'D:/nonexistent/sg.exe' });
    assert.equal(noFront.status, 3, '前端缺失且无 allow-degraded 应 fail-closed exit 3');
    assert.ok(noFront.stderr.includes('fail-closed'));
    assert.equal(runNode([EXTRACT, '--root', R, '--bogus']).status, 2, '未知旗标 exit 2');
    assert.equal(runNode([EXTRACT, '--root', path.join(tmpRoot, 'nope')]).status, 2,
      'root 不存在 exit 2');

    // ---------- 组 6: check-boundaries ----------
    const rulesFile = path.join(tmpRoot, 'rules.json');
    fs.writeFileSync(rulesFile, JSON.stringify({
      version: 1,
      domains: [
        { name: 'own', match: 'src/**|scripts/**' },
        { name: 'vendored', match: 'vendored/**' },
        { name: 'deployed', match: 'deployable/**' },
      ],
      rules: {
        forbidden: [{ label: 'no-backdep', from: ['vendored'], to: ['own'], via: ['import'] }],
        allowed: [{ label: 'dep-scope', from: ['deployed'], to: ['own', 'vendored'], via: ['link'] }],
        required: [{ label: 'dep-has-link', units_in: 'deployable/*', needs: 'link', to_in: ['own', 'vendored'] }],
      },
    }));
    const chk = (factsFile, extra = []) =>
      runNode([CHECK, '--facts', factsFile, '--rules', rulesFile, ...extra]);

    // 6a. 干净事实集 → exit 0（手造合法边；fixture facts 含刻意 dead import 不适用此处）
    const goodFacts = path.join(tmpRoot, 'good.jsonl');
    fs.writeFileSync(goodFacts, toJsonl([
      fact({ unit: 'src/a.mjs', kind: 'import', name: './b.mjs', file: 'src/a.mjs',
        line: 1, fidelity: 'syntactic', scope: 'module', extractor: 't@1',
        extra: { to: 'src/b.mjs' } }),
      fact({ unit: 'deployable/d1/x', kind: 'link', name: 'x', file: 'deployable/d1/x',
        fidelity: 'exact', scope: 'repo', extractor: 'walk@1', extra: { to: 'src' } }),
    ]));
    const clean = chk(goodFacts);
    assert.equal(clean.status, 0, `合法面应 0: ${clean.stdout}${clean.stderr}`);
    assert.ok(clean.stdout.includes('violations=0'));

    // 6b. forbidden 命中 → exit 1
    const badFacts = path.join(tmpRoot, 'bad.jsonl');
    fs.writeFileSync(badFacts, toJsonl([
      fact({ unit: 'vendored/v1/x', kind: 'import', name: '../src/a.mjs',
        file: 'vendored/v1/lib.mjs', line: 1, fidelity: 'syntactic', scope: 'module',
        extractor: 't@1', extra: { to: 'src/a.mjs' } }),
    ]));
    const c1 = chk(badFacts);
    assert.equal(c1.status, 1);
    assert.ok(c1.stdout.includes('forbidden:no-backdep'), '应报 forbidden 违规');

    // 6c. 内建 dead-link（无需规则声明）
    const deadLink = path.join(tmpRoot, 'dead.jsonl');
    fs.writeFileSync(deadLink, toJsonl([
      fact({ unit: 'deployable/d2/x', kind: 'link', name: 'x', file: 'deployable/d2/x',
        fidelity: 'exact', scope: 'unresolved', extractor: 'walk@1',
        extra: { to: null, dead: true } }),
    ]));
    const c2 = chk(deadLink);
    assert.equal(c2.status, 1);
    assert.ok(c2.stdout.includes('no-dead-links'));

    // 6d. required: deployable/d9 无链接 → 违规
    const reqMiss = path.join(tmpRoot, 'req.jsonl');
    fs.writeFileSync(reqMiss, toJsonl([
      fact({ unit: 'deployable/d9/SKILL.md', kind: 'file', name: 'SKILL.md',
        file: 'deployable/d9/SKILL.md', fidelity: 'exact', scope: 'repo', extractor: 'walk@1' }),
    ]));
    const c3 = chk(reqMiss);
    assert.equal(c3.status, 1);
    assert.ok(c3.stdout.includes('required:dep-has-link'));

    // 6e. schema 校验 fail-closed：未知键 exit 3
    const badRules = path.join(tmpRoot, 'badrules.json');
    fs.writeFileSync(badRules, JSON.stringify({ version: 1, domains: [{ name: 'x', match: 'x/**' }], rules: {}, wat: 1 }));
    const c4 = runNode([CHECK, '--facts', out, '--rules', badRules]);
    assert.equal(c4.status, 3, '未知顶层键应 exit 3');

    // 6f. --json 输出形状
    const cj = chk(badFacts, ['--json']);
    const parsed = JSON.parse(cj.stdout);
    assert.equal(parsed.count, parsed.violations.length);
    assert.equal(parsed.violations[0].rule, 'forbidden:no-backdep');

    // 6g. --staged 增量模式：required 全称量化跳过（子集事实面下必然误报）
    const c5 = chk(reqMiss, ['--staged', 'deployable/d9/SKILL.md']);
    assert.equal(c5.status, 0, `staged 模式 required 应跳过: ${c5.stdout}`);

    // ---------- 组 7: --files 子集 + boundary-edge 门 ----------
    // 7a. --files 只抽给定路径；缺席条目静默跳过
    if (r1.status === 0) {
      const sub = runNode([EXTRACT, '--root', R,
        '--files', 'src/a.mjs,docs/note.md,ghost/missing.mjs']);
      assert.equal(sub.status, 0, `--files 应成功: ${sub.stderr}`);
      const sf = parseJsonl(sub.stdout);
      const seen = new Set(sf.map((x) => x.file));
      assert.ok(seen.has('src/a.mjs') && seen.has('docs/note.md'), '给定文件应有事实');
      assert.ok(!seen.has('src/b.mjs'), '未列文件不应产事实');
      assert.ok(![...seen].some((f) => f.startsWith('ghost/')), '缺席条目应跳过');
      if (junctionOk) {
        const sl = runNode([EXTRACT, '--root', R, '--files', 'deployable/d1/x']);
        const lf = parseJsonl(sl.stdout).filter((x) => x.kind === 'link');
        assert.equal(lf.length, 1, '--files 符号链接项应产 link 事实');
        assert.equal(lf[0].extra?.to, 'src');
      }
    }

    // 7b. boundary-edge 门端到端（fixture 仓 + 真实组件管线）
    const { gate } = await import('../../scripts/hooks/gates.local/boundary-edge.mjs');
    const rulesYaml = path.join(R, 'boundaries.yaml');
    fs.writeFileSync(rulesYaml, [
      'version: 1',
      'domains:',
      '  - name: own',
      '    match: src/**|scripts/**',
      '  - name: vendored',
      '    match: vendored/**',
      '  - name: deployed',
      '    match: deployable/**',
      'rules:',
      '  forbidden:',
      '    - label: own-never-imports-vendored',
      '      via: import',
      '      from: own',
      '      to: vendored',
      '',
    ].join('\n'));
    wfile('src/evil.mjs', "import '../vendored/v1/lib.mjs';\n");

    if (r1.status === 0) {
      // syntactic 证据 → error 级违规
      const fErr = await gate.run({ root: R, files: ['src/evil.mjs'] });
      assert.equal(fErr.length, 1, `forbidden 边应产生 1 条违规: ${JSON.stringify(fErr)}`);
      assert.equal(fErr[0].level, 'error');
      assert.ok(fErr[0].message.includes('own-never-imports-vendored'));
      // 干净文件 → 零违规
      const fOk = await gate.run({ root: R, files: ['src/b.mjs'] });
      assert.equal(fOk.length, 0, '合法文件应零违规');
      // regex-degraded 证据 → 降级 warn（前端被禁用模拟）
      const sgBin = process.env.AST_GREP_BIN;
      process.env.AST_GREP_BIN = 'D:/nonexistent/sg.exe';
      try {
        const fWarn = await gate.run({ root: R, files: ['src/evil.mjs'] });
        assert.equal(fWarn.length, 1, 'degraded 下违规仍应检出');
        assert.equal(fWarn[0].level, 'warn', 'regex-degraded 证据应降级 warn');
      } finally {
        if (sgBin === undefined) delete process.env.AST_GREP_BIN;
        else process.env.AST_GREP_BIN = sgBin;
      }
    }
    // 无契约仓 → 静默跳过（门不适用）
    const R2 = path.join(tmpRoot, 'repo2');
    fs.mkdirSync(R2, { recursive: true });
    assert.deepEqual(await gate.run({ root: R2, files: ['x.mjs'] }), [],
      '无 boundaries.yaml 的仓应跳过');

    // ---------- 组 9: evaluator v1.1 新族 + 词表/元数据/豁免/staged 安全表 ----------
    const FF = (u, kind, file, extra) =>
      fact({ unit: u, kind, name: u.split('/').pop().replace(/\/$/, ''),
        file, fidelity: 'exact', scope: 'repo', extractor: 't@1',
        ...(extra ? { extra } : {}) });
    const EDGE = (u, kind, file, to, extra2) =>
      fact({ unit: u, kind, name: to, file, fidelity: 'exact', scope: 'repo',
        extractor: 't@1', extra: { to, ...(extra2 || {}) } });
    const rulesV11 = path.join(tmpRoot, 'rules-v11.json');
    fs.writeFileSync(rulesV11, JSON.stringify({
      version: 1,
      domains: [{ name: 'docs', match: 'docs/**' }, { name: 'src', match: 'src/**' }],
      manifest: {
        node_kinds: ['file', 'dir', 'decl'],
        edge_kinds: ['import', 'link', 'docref', 'mention', 'declare', 'export'],
        families: ['forbidden', 'allowed', 'required', 'covered', 'isolated', 'parity', 'attrs'],
      },
      exemptions: [{ glob: 'ok.tmp', why: '白名单样例文件' }],
      rules: {
        covered: [{ name: 'md-docref-covered', units_in: 'docs/**/*.md',
                    of_kind: 'file', needs: ['docref'] }],
        isolated: [{ name: 'scratch-clean', units_in: 'scratch/**',
                     of_kind: 'file', via: ['import', 'docref'] }],
        parity: [{ name: 'declared-mds', declared: ['docs/a.md', 'docs/b.md'],
                   observed_units_in: 'docs/**/*.md', observed_kind: 'file' }],
        attrs: [{ name: 'no-tmp', units_in: '**', of_kind: 'file',
                  name_not_match: ['*.tmp'], severity: 'warn' }],
      },
    }));
    const factsV11 = path.join(tmpRoot, 'facts-v11.jsonl');
    fs.writeFileSync(factsV11, toJsonl([
      FF('docs/a.md', 'file', 'docs/a.md'),         // 有 docref 覆盖
      FF('docs/b.md', 'file', 'docs/b.md'),         // 无覆盖 → covered 违
      FF('scratch/lonely.mjs', 'file', 'scratch/lonely.mjs'),   // 无边 → isolated 通过
      FF('scratch/wired.mjs', 'file', 'scratch/wired.mjs'),     // 有 import → isolated 违
      FF('src/exempted.mjs', 'file', 'src/exempted.mjs'),
      FF('ok.tmp', 'file', 'ok.tmp'),      // 在豁免集 → attrs 不违
      FF('bad.tmp', 'file', 'bad.tmp'),                          // attrs 违（severity warn）
      EDGE('docs/a.md', 'docref', 'README.md', 'docs/a.md'),    // a.md 被引用
      EDGE('scratch/wired.mjs', 'import', 'scratch/wired.mjs', 'src/a.mjs'), // wired 出边
    ]));
    const chk11 = (extra = []) =>
      runNode([CHECK, '--facts', factsV11, '--rules', rulesV11, '--json', ...extra]);
    const v9 = JSON.parse(chk11().stdout);
    const rulesHit = new Set(v9.violations.map((x) => x.rule));
    // covered: a.md 有入边过；b.md 零入度违
    assert.ok(rulesHit.has('covered:md-docref-covered'));
    assert.ok(v9.violations.some((x) => x.rule === 'covered:md-docref-covered'
      && x.unit === 'docs/b.md'), 'b.md 无 docref 覆盖应违');
    assert.ok(!v9.violations.some((x) => x.unit === 'docs/a.md'),
      'a.md 被引用不应违 covered');
    // isolated: wired.mjs 有边→违；lonely.mjs 无边→过
    assert.ok(v9.violations.some((x) => x.rule === 'isolated:scratch-clean'
      && x.unit === 'scratch/wired.mjs'));
    assert.ok(!v9.violations.some((x) => x.unit === 'scratch/lonely.mjs'));
    // parity: declared 两 md 都在观察集 → 无 parity 违；observed 中 wired/lonely
    //   非 md 不入集
    assert.ok(![...rulesHit].some((r) => r.startsWith('parity:')),
      `parity 双向对齐应零违: ${JSON.stringify(v9.violations)}`);
    // attrs: bad.tmp 违 warn 级（severity 贯通）
    const vTmp = v9.violations.find((x) => x.rule === 'attrs:no-tmp');
    assert.ok(vTmp && vTmp.severity === 'warn' && vTmp.unit === 'bad.tmp',
      'attrs severity=warn 应贯通');
    assert.ok(!v9.violations.some((x) => x.unit === 'ok.tmp'),
      '豁免集成员任何 ∀ 族都不应违');
    // finding 契约字段：expect/observed/fix 在场
    assert.ok(vTmp.expect && vTmp.observed && vTmp.fix, 'finding 契约字段应在场');

    // staged 安全表：∀ 族全跳；attrs 仍跑（unit-local 安全）
    const vStaged = JSON.parse(chk11(['--staged', 'bad.tmp,scratch/wired.mjs']).stdout);
    const rStaged = new Set(vStaged.violations.map((x) => x.rule));
    assert.ok(![...rStaged].some((r) => /^(covered|isolated|parity|required):/.test(r)),
      'staged 应跳过全部 ∀/P 族');
    assert.ok(rStaged.has('attrs:no-tmp'), 'attrs 是 unit-local——staged 应仍评估');

    // parity 双向差集：声明集多一项 → missing；观察集多一 md → undeclared
    const rulesP = path.join(tmpRoot, 'rules-p.json');
    fs.writeFileSync(rulesP, JSON.stringify({
      version: 1,
      domains: [{ name: 'docs', match: 'docs/**' }],
      rules: { parity: [{ name: 'p1', declared: ['docs/a.md', 'docs/ghost.md'],
        observed_units_in: 'docs/**/*.md', observed_kind: 'file' }] },
    }));
    const factsP = path.join(tmpRoot, 'facts-p.jsonl');
    fs.writeFileSync(factsP, toJsonl([
      FF('docs/a.md', 'file', 'docs/a.md'), FF('docs/extra.md', 'file', 'docs/extra.md')]));
    const vP = JSON.parse(runNode([CHECK, '--facts', factsP, '--rules', rulesP,
      '--json']).stdout);
    assert.ok(vP.violations.some((x) => x.rule === 'parity:p1:missing' && x.unit === 'docs/ghost.md'),
      'declared∖observed 应产 missing');
    assert.ok(vP.violations.some((x) => x.rule === 'parity:p1:undeclared' && x.unit === 'docs/extra.md'),
      'observed∖declared 应产 undeclared');

    // manifest fail-closed：未注册边 kind / 族 / 顶层键
    const mkRules = (o) => { const p = path.join(tmpRoot, `r${Math.random().toString(36).slice(2)}.json`);
      fs.writeFileSync(p, JSON.stringify(o)); return p; };
    const rBadVia = mkRules({ version: 1, domains: [{ name: 'x', match: 'x/**' }],
      manifest: { edge_kinds: ['import'] },
      rules: { forbidden: [{ name: 'r1', via: ['teleport'], from: ['x'], to: ['x'] }] } });
    assert.equal(runNode([CHECK, '--facts', factsV11, '--rules', rBadVia]).status, 3,
      '未注册边 kind 应 fail-closed');
    const rBadFam = mkRules({ version: 1, domains: [{ name: 'x', match: 'x/**' }],
      manifest: { families: ['forbidden'] },
      rules: { covered: [{ name: 'r1', units_in: 'x/**' }] } });
    assert.equal(runNode([CHECK, '--facts', factsV11, '--rules', rBadFam]).status, 3,
      '未注册族应 fail-closed');
    const rBadSev = mkRules({ version: 1, domains: [{ name: 'x', match: 'x/**' }],
      rules: { forbidden: [{ name: 'r1', severity: 'fatal', from: ['x'], to: ['x'] }] } });
    assert.equal(runNode([CHECK, '--facts', factsV11, '--rules', rBadSev]).status, 3,
      '非法 severity 应 fail-closed');

    // ruleset lint：forbidden∩allowed 域交叠 → config_warnings（非致命）
    const rOverlap = mkRules({ version: 1, domains: [{ name: 'a', match: 'a/**' },
      { name: 'b', match: 'b/**' }],
      rules: {
        forbidden: [{ name: 'f1', from: ['a'], to: ['b'], via: ['import'] }],
        allowed: [{ name: 'a1', from: ['a'], to: ['b'], via: ['import'] }] } });
    const rLint = runNode([CHECK, '--facts', factsV11, '--rules', rOverlap, '--json']);
    assert.ok(JSON.parse(rLint.stdout).config_warnings.some((w) => w.includes('交叠')),
      'forbidden∩allowed 交叠应产 ruleset-lint');

    // 确定性序：同一违规集两跑输出 byte-identical + 排序键序
    const o1 = chk11().stdout, o2 = chk11().stdout;
    assert.equal(o1, o2, '违规输出应确定性一致');

    // ---------- 组 10: gitignore 适配器（declare 边 oracle） ----------
    const hasGit = spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;
    if (hasGit) {
      const R3 = path.join(tmpRoot, 'repo3');
      fs.mkdirSync(R3, { recursive: true });
      spawnSync('git', ['init', '-q'], { cwd: R3 });
      fs.writeFileSync(path.join(R3, '.gitignore'), '*.tmp\n!important.tmp\nbuild/\n');
      fs.writeFileSync(path.join(R3, 'a.tmp'), 'x');
      fs.writeFileSync(path.join(R3, 'b.txt'), 'x');
      fs.writeFileSync(path.join(R3, 'important.tmp'), 'x');
      fs.mkdirSync(path.join(R3, 'build'), { recursive: true });
      fs.writeFileSync(path.join(R3, 'build/gen.js'), 'export function gen() {}\n');
      fs.writeFileSync(path.join(R3, 'src-kept.js'), 'export function kept() {}\n');
      const g3 = runNode([EXTRACT, '--root', R3, '--allow-degraded']);
      assert.equal(g3.status, 0, `gitignore 抽取应过: ${g3.stderr}`);
      const gf = parseJsonl(g3.stdout);
      const decls = gf.filter((x) => x.kind === 'declare');
      assert.ok(decls.some((x) => x.extra?.to === 'a.tmp' && x.extra?.source === 'gitignore'),
        'a.tmp 应被 *.tmp 认领');
      assert.ok(decls.some((x) => x.extra?.to === 'important.tmp' && x.extra?.negated),
        '!important.tmp 应产 negated 边');
      assert.ok(!decls.some((x) => x.extra?.to === 'b.txt'), 'b.txt 不应有 declare 边');
      assert.ok(decls.every((x) => x.extractor === 'git-check-ignore@1'), 'extractor 戳记');
      // v1.1a 剪枝：忽略声明件不读内容——file/declare 事实在，decl 事实不在
      assert.ok(gf.some((x) => x.kind === 'file' && x.unit === 'build/gen.js'),
        '忽略件仍产 file 事实（隔离检测面）');
      assert.ok(!gf.some((x) => x.kind === 'decl' && x.file.startsWith('build/')),
        '忽略目录内 js 不产 decl');
      assert.ok(gf.some((x) => x.unit === 'src-kept.js#kept'),
        '非忽略件正常产 decl');
      // 非 git 仓静默空集（repo2 无 .git）
      const gNo = runNode([EXTRACT, '--root', R2, '--allow-degraded']);
      assert.equal(gNo.status, 0);
      assert.ok(!parseJsonl(gNo.stdout).some((x) => x.kind === 'declare'),
        '非 git 仓 declare 应空集');
    }

    // ---------- 组 11: T7 钉版——golden fixture 字节契约 ----------
    // 固件只含 md/ps1（零 js → 不依赖 ast-grep 在位性；--no-ignore-scan → 不依赖 git）
    // 上游抽取器升级导致的事实面漂移在此显形；有意升级须再生 golden：
    //   node private/engineering/ming-boundary/scripts/extract-facts.mjs
    //     --root tests/fixtures/mb-golden/repo --no-ignore-scan --allow-degraded
    //     --out tests/fixtures/mb-golden/facts.golden.jsonl
    const GOLDEN_REPO = path.resolve(import.meta.dirname, '../fixtures/mb-golden/repo');
    const GOLDEN = path.resolve(import.meta.dirname, '../fixtures/mb-golden/facts.golden.jsonl');
    const gout = path.join(tmpRoot, 'golden-actual.jsonl');
    const gr = runNode([EXTRACT, '--root', GOLDEN_REPO, '--no-ignore-scan',
      '--allow-degraded', '--out', gout]);
    assert.equal(gr.status, 0, `golden 抽取应过: ${gr.stderr}`);
    assert.equal(fs.readFileSync(gout, 'utf8'), fs.readFileSync(GOLDEN, 'utf8'),
      'golden 事实面漂移——若属有意升级请再生固件并在评审中说明');
    const gFacts = parseJsonl(fs.readFileSync(gout, 'utf8'));
    assert.ok(gFacts.some((x) => x.kind === 'docref' && x.extra?.dead),
      'golden 应含死链样本');
    assert.ok(gFacts.some((x) => x.kind === 'mention' && x.extra?.to === 'src/tool.ps1#Invoke-Main'),
      'golden 应含解析型 mention');

    // ---------- 组 12: 采纳自举——-WithBoundary 铺 kit → 任意仓门点火 ----------
    // 覆盖"任意仓库调用"面：install-hooks -Target -WithBoundary 应产出
    // 组件子树+yaml桥+gates.local门+契约模板，且固件仓上的门真能报违规。
    const hasPwsh = spawnSync('pwsh', ['-NoProfile', '-Command', '$PSVersionTable.PSVersion'],
      { encoding: 'utf8' }).status === 0;
    if (hasPwsh && hasGit) {
      const adopt = path.join(tmpRoot, 'adopted');
      fs.mkdirSync(adopt, { recursive: true });
      spawnSync('git', ['init', '-q'], { cwd: adopt });
      const INSTALL = path.resolve(import.meta.dirname, '../../scripts/install-hooks.ps1');
      const ins = spawnSync('pwsh', ['-NoProfile', '-File', INSTALL,
        '-Target', adopt, '-WithBoundary'], { encoding: 'utf8' });
      assert.equal(ins.status, 0, `-WithBoundary 采纳应过: ${ins.stderr || ins.stdout}`);
      for (const rel of [
        'boundaries.yaml',
        'private/engineering/ming-boundary/scripts/extract-facts.mjs',
        'private/engineering/ming-boundary/scripts/check-boundaries.mjs',
        'private/engineering/ming-boundary/scripts/lib/adapters/markdown.mjs',
        'scripts/lib/yaml-lite.ps1',
        'scripts/lib/yaml2json.ps1',
        'scripts/hooks/gates.local/boundary-edge.mjs',
        'scripts/hooks/engine.mjs'])
        assert.ok(fs.existsSync(path.join(adopt, rel)), `采纳件缺席: ${rel}`);

      // 门点火：固件违规（src → vendor 命中模板 src-never-imports-vendor）
      fs.mkdirSync(path.join(adopt, 'src'), { recursive: true });
      fs.mkdirSync(path.join(adopt, 'vendor'), { recursive: true });
      fs.writeFileSync(path.join(adopt, 'vendor/lib.js'), 'export const v = 1;\n');
      fs.writeFileSync(path.join(adopt, 'src/evil.mjs'), "import '../vendor/lib.js';\n");
      const { pathToFileURL } = await import('node:url');
      const { gate: adoptedGate } = await import(
        pathToFileURL(path.join(adopt, 'scripts/hooks/gates.local/boundary-edge.mjs')).href);
      const fAdopt = await adoptedGate.run({ root: adopt, files: ['src/evil.mjs'] });
      assert.ok(fAdopt.length > 0, '采纳仓边界门应报 src→vendor 违规');
      assert.ok(fAdopt.some((x) => x.message.includes('src-never-imports-vendor')),
        `应命中模板规则: ${fAdopt.map((x) => x.message).join(' | ')}`);

      // 契约归采纳侧：二次铺入不得覆盖已裁 boundaries.yaml
      fs.writeFileSync(path.join(adopt, 'boundaries.yaml'), '# 采纳侧已裁\n');
      const ins2 = spawnSync('pwsh', ['-NoProfile', '-File', INSTALL,
        '-Target', adopt, '-WithBoundary'], { encoding: 'utf8' });
      assert.equal(ins2.status, 0, `幂等再铺应过: ${ins2.stderr || ins2.stdout}`);
      assert.equal(fs.readFileSync(path.join(adopt, 'boundaries.yaml'), 'utf8'),
        '# 采纳侧已裁\n', 'boundaries.yaml 不得被二次铺入覆盖');
    } else {
      console.log('    (跳过组12: pwsh/git 不在位)');
    }

    console.log('  12 组断言全过');
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}
