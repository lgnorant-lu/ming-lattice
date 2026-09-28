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
import { fact, domainOf, sortFacts, toJsonl, parseJsonl }
  from '../../private/engineering/ming-boundary/scripts/lib/facts.mjs';

const PKG = path.resolve(import.meta.dirname, '../../private/engineering/ming-boundary');
const EXTRACT = path.join(PKG, 'scripts/extract-facts.mjs');
const CHECK = path.join(PKG, 'scripts/check-boundaries.mjs');
const hasSg = spawnSync('ast-grep', ['--version'], { encoding: 'utf8' }).status === 0
  || fs.existsSync('D:/Caches/npm-global/node_modules/@ast-grep/cli/ast-grep.exe');

let tmpRoot;
function wfile(rel, text) {
  const p = path.join(tmpRoot, 'repo', rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text, 'utf8');
  return p;
}
const runNode = (args, env = {}) =>
  spawnSync(process.execPath, args, { encoding: 'utf8', env: { ...process.env, ...env } });

export function run() {
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

    // ---------- 组 2: fixture 仓 ----------
    wfile('src/b.mjs', 'export default function b() {}\nexport const K = 1;\n');
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
    // vendored 域不产内容事实（白名单外）
    assert.equal(at('vendored/v1/lib.mjs', 'decl').length, 0, 'vendored 不应产 decl');
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

    console.log('  6 组断言全过');
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}
