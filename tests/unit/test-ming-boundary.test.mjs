// tests/unit/test-ming-boundary.test.mjs
// 单元测试: private/engineering/ming-boundary/scripts/{extract-facts,check-boundaries,
//   run-boundary}.mjs + scripts/lib/langs/rust.mjs + scripts/lib/langs/python.mjs
//   + scripts/lib/langs/sh.mjs + scripts/lib/yaml.mjs
//   + scripts/lib/langs/rust.derived.mjs + scripts/lib/langs/python.derived.mjs
//   （语法级前端描述符与上游派生词表，后者经描述符 import 由断言面行使）
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
import { parseTags, linguistExts, derive, emitDerived,
  checkDerivedConsistency, parseUpstreamPins }
  from '../../private/engineering/ming-boundary/scripts/lib/langs/derive.mjs';

const PKG = path.resolve(import.meta.dirname, '../../private/engineering/ming-boundary');
const REPO = path.resolve(PKG, '../../..');
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
    // v1.1b：TypeScript 面——tree-sitter-typescript 规则集应产同构事实
    wfile('src/mod.ts', [
      'import { K } from \'./b.mjs\';',
      'export function tsTop(): number { return K; }',
    ].join('\n'));
    // v1.2 Rust 语法级面（ADR-0010 syntactic 档：crate/self/super/外部 crate 四分 + mod 解析）
    wfile('crates/demo/src/lib.rs', [
      'mod dom;',
      'mod util { use super::Hidden; pub fn inner() {} }',
      '#[cfg(feature = "x")]',
      'mod gated_x;',
      '#[cfg(unix)]',
      'mod cfg_wrap { use crate::dep::depfn; }',
      'pub use crate::dom::Elem;',
      'use crate::net::fetch;',
      'use std::collections::HashMap;',
      'use crate::gone::Thing;',
      'pub fn lib_entry() -> i32 { 1 }',
      'struct Hidden { f: u8 }',
      'pub(crate) fn helper() {}',
      'macro_rules! shout { () => {} }',
    ].join('\n'));
    wfile('crates/demo/src/dom.rs',
      'mod sub;\npub struct Elem;\nimpl Elem { pub fn new() -> Elem { Elem } }\nfn private() {}\n');
    wfile('crates/demo/src/dom/sub.rs', 'use super::Elem;\nuse crate::net::fetch;\n');
    wfile('crates/demo/src/net.rs', 'pub fn fetch() {}\n');
    wfile('crates/demo/src/dep.rs', 'pub fn depfn() {}\n');
    // tests/<file>.rs 各自是独立 crate 根：mod common; 找兄弟 tests/common/
    wfile('crates/demo/tests/common/mod.rs', 'pub fn helper() {}\n');
    wfile('crates/demo/tests/probe_x.rs',
      'mod common;\nuse common::helper;\nfn self_item() {}\nuse crate::self_item;\n');
    // v1.3 Python 语法级面（ADR-0010 syntactic 档：相对点导入/包 __init__/
    //   PEP420 命名空间/外部不判死/逐名子模块探测/init re-export）
    wfile('pkg/__init__.py', 'from .helper import run\nfrom . import sibling\n');
    wfile('pkg/helper.py', 'MAX = 3\ndef run():\n    pass\nclass Runner:\n    def go(self):\n        pass\n');
    wfile('pkg/sibling.py',
      'from ..pkg import helper\nimport os\nimport pkg.helper\nfrom .sub import deep\n');
    wfile('pkg/sub/deep.py',
      'from .. import helper\nimport missing_ext_mod_xyz\nfrom .gone import thing\n');
    // 包索引实证：deep/nest 不在任何惯例根名表——靠 __init__ 链实算导入根；
    // scripts/ 下松散脚本互导经松散目录根命中
    wfile('deep/nest/__init__.py', '');
    wfile('deep/nest/core.py', 'def core():\n    pass\n');
    wfile('scripts/sib.py', 'X = 1\n');
    wfile('scripts/useit.py', 'import nest.core\nimport sib\n');
    wfile('scripts/tool.ps1', 'function Invoke-Thing { }\n. .\\lib\\helper.ps1\n');
    // v1.4 sh 语法级面（上游无 tags.scm 的手写词表件）：source/. 边四分
    //   （module/dead/computed/external）+ fn/const decl 族谱
    wfile('scripts/main.sh', [
      '#!/bin/bash',
      'source lib/util.sh',
      '. ./env.sh',
      'source lib/gone.sh',
      'source "$DIR/dyn.sh"',
      '. /etc/profile.d/x.sh',
      'foo() { :; }',
      'function bar() { :; }',
      'readonly MAX=3',
      'export PATH_ADD=1',
    ].join('\n'));
    wfile('scripts/lib/util.sh', 'helper() { :; }\n');
    wfile('scripts/env.sh', 'E=1\n');
    // 无扩展名认领面：shebang 嗅探收 .githooks 钩件（ext=='' 走 sniffFile）
    wfile('.githooks/pre-commit', '#!/bin/bash\nsource ../scripts/env.sh\nhook_fn() { :; }\n');
    wfile('.githooks/not-a-hook', 'plain text no shebang\n');
    wfile('data-noext', 'binary\x00data no ext\n');
    wfile('docs/note.md', '# md\n');
    // v1.1 文档面：README/docref/mention/docrole 载体
    wfile('README.md', '# Fixture Repo\n\nSee [notes](docs/note.md) and [api](docs/api.md).\n');
    wfile('docs/api.md', [
      '---', 'docrole: api', '---',
      '# API Reference',
      'Entry point is `top()` — see [impl](../src/a.mjs).',
      // v1.1b 引用式链接：全形 [t][label] + 快捷 [label]，定义行不产边
      'Ref link: [to b][bref] and shortcut [bref2]; unused [unused]: ../src/nope.md',
      '[bref]: ../src/b.mjs',
      '[bref2]: note.md',
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
    // Rust 语法级断言（syntactic 档）
    const LIB = 'crates/demo/src/lib.rs';
    const rimp = at(LIB, 'import');
    const ri = (n) => rimp.find((x) => x.name === n);
    // crate:: 最长前缀解析：use crate::dom::Elem → src/dom.rs（Elem 作成员）
    assert.equal(ri('crate::dom::Elem')?.extra?.to, 'crates/demo/src/dom.rs',
      'crate:: 路径应解析到 crate src/ 根');
    assert.equal(ri('crate::dom::Elem')?.extra?.mechanism, 'rust-pub-use');
    assert.equal(ri('crate::dom::Elem')?.scope, 'module');
    // pub use 双发：import 边 + export 边
    assert.ok(at(LIB, 'export').some((x) =>
      x.extra?.mechanism === 'rust-pub-use' && x.extra?.to === 'crates/demo/src/dom.rs'),
      'pub use 应产 export 边');
    assert.equal(ri('crate::net::fetch')?.extra?.to, 'crates/demo/src/net.rs');
    assert.equal(ri('std::collections::HashMap')?.scope, 'external',
      '裸 ident 首段=外部 crate');
    assert.ok(ri('crate::gone::Thing')?.extra?.dead, 'crate:: 死链应标 dead');
    // mod 语义：mod dom; 产边+decl；内联 mod util {} 只有 decl
    const modEdge = rimp.find((x) => x.extra?.mechanism === 'mod-decl');
    assert.equal(modEdge?.name, 'dom');
    assert.equal(modEdge?.extra?.to, 'crates/demo/src/dom.rs');
    assert.ok(!rimp.some((x) => x.name === 'util'), '内联 mod {} 不应产依赖边');
    const rdecl = at(LIB, 'decl');
    assert.ok(rdecl.some((d) => d.name === 'lib_entry' && d.extra?.shape === 'fn' &&
      d.extra?.surface === 'public'), 'pub fn 应 surface=public');
    assert.ok(rdecl.some((d) => d.name === 'Hidden' && d.extra?.shape === 'struct' &&
      d.extra?.surface === 'internal'), '非 pub struct 应 internal');
    assert.ok(rdecl.some((d) => d.name === 'helper' && d.extra?.surface === 'internal'),
      'pub(crate) 限域应 internal');
    assert.ok(rdecl.some((d) => d.name === 'shout' && d.extra?.shape === 'macro'),
      'macro_rules! 应产 shape=macro decl');
    assert.ok(rdecl.some((d) => d.name === 'dom' && d.extra?.shape === 'mod'));
    assert.ok(at('crates/demo/src/dom.rs', 'decl')
      .some((d) => d.name === 'new'), 'impl 内方法应入图');
    // super:: 语义：具名文件 foo.rs 的孩子目录=dir/foo（非 dir 本身）——
    // dom/sub.rs 里 super:: 应落 dom.rs 命名空间而非 src/（曾误上溯一层的回归钉）
    const SUB = 'crates/demo/src/dom/sub.rs';
    assert.equal(at(SUB, 'import').find((x) => x.name === 'super::Elem')
      ?.extra?.to, 'crates/demo/src/dom.rs', 'super:: 应落父模块孩子目录');
    assert.equal(at('crates/demo/src/dom.rs', 'import')
      .find((x) => x.extra?.mechanism === 'mod-decl')?.extra?.to,
      'crates/demo/src/dom/sub.rs', '具名文件 mod-decl 应解析进 dir/stem/');
    // 内联 mod 深度：mod util {} 里的 super::Hidden 应回文件模块层（lib.rs 自身）
    // cfg 门标记：#[cfg] 修饰的 mod-decl 与内联 mod 内的 use 都带 extra.cfg
    assert.equal(at(LIB, 'import').find((x) => x.extra?.mechanism === 'mod-decl' &&
      x.name === 'gated_x')?.extra?.cfg, true, '#[cfg] mod 应带 cfg 标记');
    assert.equal(ri('crate::net::fetch')?.extra?.cfg, undefined,
      '无 cfg 门的 use 不应带 cfg 标记');
    assert.equal(ri('crate::dep::depfn')?.extra?.cfg, true,
      'cfg 内联 mod 内的 use 应传递 cfg 标记');
    assert.equal(ri('super::Hidden')?.extra?.to, 'crates/demo/src/lib.rs',
      '内联 mod 内 super:: 应先扣内联深度再出文件模块层');
    // tests/<file>.rs 是 crate 根：mod common; → 兄弟 tests/common/mod.rs；
    // use common::helper 首段经文件级 mod 声明识别为本地模块（非 external）
    const T = 'crates/demo/tests/probe_x.rs';
    assert.equal(at(T, 'import').find((x) => x.extra?.mechanism === 'mod-decl')
      ?.extra?.to, 'crates/demo/tests/common/mod.rs',
      'tests/ crate 根的 mod-decl 应找兄弟目录');
    const cuse = at(T, 'import').find((x) => x.name === 'common::helper');
    assert.equal(cuse?.scope, 'module', '本地 mod 声明过的首段不标 external');
    assert.equal(cuse?.extra?.to, 'crates/demo/tests/common/mod.rs');
    // 非 src/ crate 根里 crate:: 应锚文件自身命名空间而非判死
    assert.equal(at(T, 'import').find((x) => x.name === 'crate::self_item')
      ?.extra?.to, T, 'tests/ 下 crate:: 应解析回本文件');
    // py. Python 面：相对导入/包解析/外部不判死/命名空间/init re-export/decl
    const INIT = 'pkg/__init__.py';
    assert.equal(at(INIT, 'import').find((x) => x.name === '.helper')
      ?.extra?.to, 'pkg/helper.py', 'from .helper import run 应解包内兄弟');
    assert.ok(at(INIT, 'import').some((x) => x.name === '.' &&
      x.extra?.to === INIT), 'from . import x 应发包边到 __init__');
    assert.ok(at(INIT, 'export').some((x) => x.extra?.mechanism === 'py-reexport'),
      '__init__.py from-import 应双发 export 边');
    const SIB = 'pkg/sibling.py';
    assert.equal(at(SIB, 'import').find((x) => x.name === '..pkg')
      ?.extra?.to, INIT, 'from ..pkg 应上溯一层包');
    assert.equal(at(SIB, 'import').find((x) => x.name === 'os')
      ?.scope, 'external', 'stdlib 应 external 不判死');
    assert.equal(at(SIB, 'import').find((x) => x.name === 'pkg.helper')
      ?.extra?.to, 'pkg/helper.py', '绝对导入应经候选根命中');
    // PEP420：pkg/sub 无 __init__.py 是命名空间包——不判死且名字可探测
    const subEdge = at(SIB, 'import').find((x) => x.name === '.sub');
    assert.ok(subEdge && !subEdge.extra?.dead, '命名空间包不应判死');
    assert.equal(at(SIB, 'import').find((x) => x.name === '.sub.deep')
      ?.extra?.to, 'pkg/sub/deep.py', 'from .sub import deep 应探测到子模块');
    const DEEP = 'pkg/sub/deep.py';
    assert.equal(at(DEEP, 'import').find((x) => x.name === '..helper')
      ?.extra?.to, 'pkg/helper.py', 'from .. import helper 逐名探测兄弟');
    assert.equal(at(DEEP, 'import').find((x) => x.name === 'missing_ext_mod_xyz')
      ?.scope, 'external', '外部包不判死');
    assert.ok(at(DEEP, 'import').find((x) => x.name === '.gone')
      ?.extra?.dead, '相对导入落空应判死（仓内主张）');
    const hpDecl = at('pkg/helper.py', 'decl');
    assert.ok(hpDecl.some((d) => d.name === 'MAX' && d.extra?.shape === 'const'),
      '模块级赋值应产 const decl（derived inside 链）');
    assert.ok(hpDecl.some((d) => d.name === 'Runner' && d.extra?.shape === 'class'));
    assert.ok(hpDecl.some((d) => d.name === 'run' && d.extra?.shape === 'fn'));
    assert.ok(hpDecl.some((d) => d.name === 'go'),
      '方法 function_definition 应入 decl（shape 同 fn）');
    // py-idx. 包索引：非标包根 deep/ 经 __init__ 链实算为导入根（旧猜词表
    // 只有 python/src/tests/tools——本断言是索引化的回归钉）
    const USE = 'scripts/useit.py';
    assert.equal(at(USE, 'import').find((x) => x.name === 'nest.core')
      ?.extra?.to, 'deep/nest/core.py',
      'import nest.core 应经包索引命中非标根 deep/');
    assert.equal(at(USE, 'import').find((x) => x.name === 'sib')
      ?.extra?.to, 'scripts/sib.py', '松散脚本同目录互导应命中');
    // sh. v1.4 Bash 面（固件规范七场景断言面）
    const SH = 'scripts/main.sh';
    const shImp = at(SH, 'import');
    const shLive = shImp.find((x) => x.name === 'lib/util.sh');
    assert.equal(shLive?.extra?.to, 'scripts/lib/util.sh',
      'source 相对路径应解析 module 边');
    assert.equal(shLive?.scope, 'module',
      '活 source 边应 scope=module（消融钉：落空也产同名 to，光断 to 分辨不出死活）');
    assert.ok(!shLive?.extra?.dead, '活 source 边不应标 dead');
    assert.equal(shImp.find((x) => x.name === './env.sh')
      ?.extra?.to, 'scripts/env.sh', '. ./env 应同机制解析');
    assert.ok(shImp.find((x) => x.name === 'lib/gone.sh')
      ?.extra?.dead, 'source 落空应 dead（运行期硬依赖）');
    const shDyn = shImp.find((x) => x.name === '$DIR/dyn.sh');
    assert.equal(shDyn?.extra?.mechanism, 'sh-source-computed',
      '变量展开的 source 应标 sh-source-computed');
    assert.ok(shDyn && !shDyn.extra?.dead, '动态 source 不可静态判死');
    assert.equal(shImp.find((x) => x.name === '/etc/profile.d/x.sh')?.scope,
      'external', '绝对路径 source 应 external');
    const shDecl = at(SH, 'decl');
    assert.ok(shDecl.some((d) => d.name === 'foo' && d.extra?.shape === 'fn')
      && shDecl.some((d) => d.name === 'bar'),
      'foo(){} 与 function bar(){} 双形态都应产 fn decl');
    assert.ok(shDecl.some((d) => d.name === 'MAX' && d.extra?.surface === 'internal'),
      'readonly 非 export 应 internal');
    assert.ok(shDecl.some((d) => d.name === 'PATH_ADD' && d.extra?.surface === 'public'),
      'export 赋值应 public');
    assert.equal(shDecl.filter((d) => d.name === 'PATH_ADD').length, 1,
      'export X= 的 decl_cmd 与 variable_assignment 不双发');
    // shebang 认领：无扩展名 .githooks 钩件经 sniffFile 入 sh 面
    const HOOK = '.githooks/pre-commit';
    assert.equal(at(HOOK, 'import').find((x) => x.name === '../scripts/env.sh')
      ?.extra?.to, 'scripts/env.sh',
      '无扩展名钩件的 source 应解析 module 边（sniffFile 认领）');
    assert.ok(at(HOOK, 'decl').some((d) => d.name === 'hook_fn'),
      '钩件函数 decl 应产出');
    assert.equal(at('.githooks/not-a-hook', 'decl').length, 0,
      '无 shebang 件不应被认领');
    assert.equal(at('data-noext', 'decl').length, 0,
      '二进制无扩展名件不应被认领');
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
    // 8c+. 引用式链接（CommonMark reference）：[t][label]/[label] 产边；定义行与未用定义不产
    assert.ok(drNames.includes('src/b.mjs'), '[to b][bref] 引用式应解析成边');
    assert.ok(drNames.includes('docs/note.md'), '[bref2] 快捷式应解析成边');
    assert.ok(!drNames.includes('src/nope.md'), '未使用的 [unused]: 定义不产边');
    // 8e-ts. TypeScript 面：TS 规则集产同构 import/decl（v1.1b——TS 仓曾静默零边）
    assert.equal(at('src/mod.ts', 'import')[0]?.extra?.to, 'src/b.mjs',
      '.ts import 应解析');
    assert.ok(at('src/mod.ts', 'decl').some((d) => d.name === 'tsTop'),
      '.ts function decl 应入图');
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
    // 降级路径下 Rust regex 兜底同构断言（组3 只走 ast-grep 正道）
    const deadFacts = parseJsonl(dead.stdout);
    const rsDead = deadFacts.filter((x) => x.file === 'crates/demo/src/lib.rs');
    assert.ok(rsDead.some((x) => x.kind === 'import' && x.fidelity === 'regex-degraded' &&
      x.extra?.mechanism === 'rust-pub-use'), '降级路径应产 rust-pub-use 边');
    assert.ok(rsDead.some((x) => x.kind === 'decl' && x.fidelity === 'regex-degraded'),
      '降级路径应产 rs decl 事实');
    assert.equal(rsDead.find((x) => x.name === 'crate::net::fetch')?.extra?.to,
      'crates/demo/src/net.rs', '降级路径 crate:: 解析应同构命中');
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

    // ---------- 组 13: 消费层——run-boundary 编排 + consumers 段 lint/调度/防线 ----------
    {
      const C = path.join(tmpRoot, 'cons-repo');
      const cf = (rel, s) => {
        const p = path.join(C, rel);
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, s, 'utf8');
      };
      cf('src/x.mjs', "import '../vendor/v.mjs';\n");
      cf('vendor/v.mjs', 'export const v = 1;\n');
      cf('docs/o.md', '# orphan\n');
      cf('boundary.consumers/echo.mjs',
        "console.log(JSON.stringify({rule:'echo:test',severity:'note'," +
        "unit:'boundary.consumers/echo.mjs',expect:'run',observed:'ok',fix:'-'}));\n");
      cf('boundaries.json', JSON.stringify({ version: 1,
        domains: [{ name: 'src', match: 'src/**' }, { name: 'vendor', match: 'vendor/**' },
                  { name: 'docs', match: 'docs/**' }],
        manifest: { edge_kinds: ['import', 'docref'], find_levels: ['error', 'warn', 'note'] },
        rules: {
          forbidden: [{ name: 'nv', from: ['src'], to: ['vendor'], via: ['import'],
                        severity: 'error', why: 't' }],
          covered: [{ name: 'dc', units_in: 'docs/**/*.md', needs: ['docref'],
                      severity: 'warn', why: 't' }] },
        consumers: { metrics: { bogus: 1 }, 'emit-skeleton': {},
          echo: { phases: ['ci', 'staged'] }, ghost: {}, trav: { entry: '../evil.mjs' },
          diff: { baseline: 'base.facts.jsonl' } } }));
      const fpath = path.join(C, 'facts.jsonl');
      let rx = runNode([EXTRACT, '--root', C, '--out', fpath]);
      assert.equal(rx.status, 0, `抽取应过: ${rx.stderr}`);
      const RB = path.join(PKG, 'scripts/run-boundary.mjs');
      const runRB = (a) => runNode([RB, '--root', C, '--facts', fpath,
        '--rules', path.join(C, 'boundaries.json'), ...a]);
      const runJson = (a) => {
        const x = runRB([...a, '--json']);
        assert.equal(x.status !== null, true, `runner 应退出: ${x.stderr}`);
        return { status: x.status, j: JSON.parse(x.stdout) };
      };

      // ci: evaluator+metrics+echo 归并；emit(manual-only) 不跑；ghost/trav fail-closed
      const r1 = runJson(['--phase', 'ci']);
      assert.equal(r1.status, 1, '违规+配置错应 exit 1');
      assert.ok(r1.j.findings.some(f => f.rule === 'forbidden:nv' && f.via === 'check'),
        'evaluator 违规须归并');
      assert.ok(r1.j.findings.some(f => f.rule === 'echo:test' && f.via === 'echo'),
        '约定区自定义件须跑通');
      assert.ok(r1.j.errors.some(e => e.includes('ghost')), '无实现消费方 fail-closed');
      assert.ok(r1.j.errors.some(e => e.includes('越出仓根')), 'entry 越界须拒');
      assert.ok(r1.j.warnings.some(w => w.includes('未知键')), '未知配置键告警');
      assert.ok(r1.j.reports.some(rep => rep.id === 'metrics'), 'metrics 报告在场');
      assert.ok(!r1.j.reports.some(rep => rep.id === 'emit-skeleton'),
        'manual-only 件不该在 ci 跑');

      // staged 无 units → CONFIG 错且 evaluator 拒跑
      const r2 = runJson(['--phase', 'staged']);
      assert.ok(r2.j.errors.some(e => e.includes('staged-units')),
        'staged 缺 units 须 CONFIG 拒');
      assert.ok(!r2.j.findings.some(f => f.via === 'check'), 'staged 无 units 时 evaluator 不得跑');

      // staged 带 units → 只评 ∃ 族（forbidden 火，covered 不跑）
      const r3 = runJson(['--phase', 'staged', '--staged-units', 'src/x.mjs']);
      assert.ok(r3.j.findings.some(f => f.rule === 'forbidden:nv'), 'staged ∃ 族须评');
      assert.ok(!r3.j.findings.some(f => f.rule.startsWith('covered')),
        'staged 不得评 ∀ 族');

      // emit: 预览不写盘 → apply 写盘 → 二次 apply fail-closed
      const r4 = runJson(['--phase', 'manual', '--only', 'emit-skeleton']);
      assert.ok(!fs.existsSync(path.join(C, 'boundaries.suggested.yaml')),
        '无 --apply 不得写盘');
      assert.ok(r4.j.reports[0]?.text.includes('generated by emit-skeleton'),
        `预览须带草稿正文: ${r4.j.reports[0]?.text?.slice(0, 120)}`);
      runRB(['--phase', 'manual', '--only', 'emit-skeleton', '--apply']);
      assert.ok(fs.existsSync(path.join(C, 'boundaries.suggested.yaml')), 'apply 须落盘');
      const r6 = runJson(['--phase', 'manual', '--only', 'emit-skeleton', '--apply']);
      assert.ok(r6.j.findings.some(f => f.rule === 'emit-skeleton:crash'),
        '二次 apply 应 fail-closed(crash finding)');

      // diff: baseline 缺 import 边 → +added 1
      fs.writeFileSync(path.join(C, 'base.facts.jsonl'),
        fs.readFileSync(fpath, 'utf8').split('\n')
          .filter(l => l && !l.includes('"kind":"import"')).join('\n') + '\n');
      const r7 = runJson(['--phase', 'manual', '--only', 'diff']);
      assert.ok(r7.j.reports.some(rep => rep.id === 'diff' && rep.text.includes('+added 1')),
        `diff 应报 +added 1: ${JSON.stringify(r7.j.reports.map(r => r.id))}`);

      // --facts-extra: 外部适配器事实并入评估分发（CDC 面：producer 契约经归并口）
      const extraPath = path.join(C, 'ext.facts.jsonl');
      fs.writeFileSync(extraPath, JSON.stringify({
        v: 1, unit: 'src/x.mjs#ExtSym', kind: 'decl', name: 'ExtSym',
        file: 'src/x.mjs', fidelity: 'semantic', scope: 'file-local',
        extractor: 'scip-adapter@1', extra: { producer: 'rust-analyzer' } }) + '\n');
      const r8 = runJson(['--phase', 'ci', '--only', 'metrics',
        '--facts-extra', extraPath]);
      const mtxt = r8.j.reports.find(r => r.id === 'metrics')?.text || '';
      assert.ok(mtxt.includes('scip-adapter@1'), '外部事实应入流并见 metrics');
      assert.ok(mtxt.includes('semantic'), '外部事实 fidelity 档应可见');
      // 不存在的外部文件 → fail-closed 而非静默跳过
      const r9 = runRB(['--phase', 'ci', '--only', 'metrics',
        '--facts-extra', path.join(C, 'nope.jsonl')]);
      assert.equal(r9.status, 2, '缺外部事实文件应 exit 2 fail-closed');
      assert.ok(r9.stderr.includes('facts-extra'), 'stderr 应点名 --facts-extra');
      // --facts 源文件不被归并改写（新 tmp 副本策略）
      const before = fs.readFileSync(fpath, 'utf8');
      runJson(['--phase', 'ci', '--only', 'metrics', '--facts-extra', extraPath]);
      assert.equal(fs.readFileSync(fpath, 'utf8'), before, '--facts 源不得被改写');
      // 外部事实=不可信输入：坏 JSONL 行 fail-closed 而非带病并入
      const badPath = path.join(C, 'bad.facts.jsonl');
      fs.writeFileSync(badPath,
        '{"v":1,"unit":"x","kind":"decl","file":"a.rs","fidelity":"semantic"}\n{not json}\n');
      const r10 = runRB(['--phase', 'ci', '--only', 'metrics',
        '--facts-extra', badPath]);
      assert.equal(r10.status, 2, '坏 JSONL 外部事实应 exit 2');
      assert.ok(r10.stderr.includes('facts-extra') && r10.stderr.includes(':2'),
        'stderr 应点名 --facts-extra 与行号');
    }

    // ---------- 组 14: derive.mjs 纯核（DDT 矩阵）+ pin↔derived 对账（CDC） ----------
    {
      // DDT: tags.scm S-expr 形态矩阵 → 捕获归属期望
      const SCM = `
(module (call (identifier) @name) @reference.call)
(class_definition name: (identifier) @name) @definition.class
(impl_item name: (type_identifier) @name) @reference.implementation
(module (expression_statement (assignment left: (identifier) @name) @definition.constant))
`;
      const caps = parseTags(SCM);
      const capOf = (cap) => caps.filter((c) => c.capture === cap);
      assert.ok(capOf('reference.call').some((c) => c.kind === 'call'),
        'reference.call 宿主应为 call 节点');
      assert.ok(capOf('definition.class').some((c) =>
        c.kind === 'class_definition' && c.nameKind === 'identifier'),
        'definition.class 应记 nameKind=identifier');
      assert.ok(capOf('definition.constant').some((c) =>
        c.kind === 'assignment' &&
        c.inside.join('>') === 'module>expression_statement'),
        'inside 链应外→内有序');
      // linguist 行级解析：目标块内 exts 收集、块外不越界
      const LING = `Python:\n  extensions:\n    - ".py"\n    - ".pyi"\nRust:\n  extensions:\n    - ".rs"\n`;
      assert.deepEqual(linguistExts(LING, 'Python'), ['.py', '.pyi']);
      assert.deepEqual(linguistExts(LING, 'Rust'), ['.rs']);
      // derive 去重+排序确定性 + emit 头注 provenance
      const d = derive('x', { linguist: 'Python' }, SCM, LING);
      assert.ok(d.declKinds.some((k) => k.shape === 'constant' &&
        k.inside?.join('>') === 'module>expression_statement'),
        'inside 链应入 derived 条目');
      const body = emitDerived('python',
        { grammar: 'g/r', rev: 'abc1234', tags: 'queries/tags.scm' }, d);
      assert.ok(body.includes('DO NOT EDIT') && body.includes('abc1234'),
        '派生物须带 DO-NOT-EDIT 戳与 provenance rev');
      // CDC: pin↔derived 对账状态机（ok/stale/missing/orphan 四态）
      const YAML = `version: 1\nsources:\n  linguist:\n    rev: 1111111\nlangs:\n  rust:\n    rev: aaaaaaa\n  python:\n    rev: bbbbbbb\n`;
      const pins = parseUpstreamPins(YAML);
      assert.deepEqual(pins, { rust: 'aaaaaaa', python: 'bbbbbbb' },
        'pins 只认 langs: 节（sources.linguist 不混入）');
      const st = checkDerivedConsistency(YAML, {
        rust: '// provenance: g/r@aaaaaaa t\nexport const derived={};',
        // python 缺席 → missing；ghost 无 pin → orphan
        ghost: '// provenance: g/r@ccccccc t\nexport const derived={};',
      });
      assert.equal(st.rust.state, 'ok');
      assert.equal(st.python.state, 'missing');
      assert.equal(st.ghost.state, 'orphan');
      const stStale = checkDerivedConsistency(YAML, {
        rust: '// provenance: g/r@fffffff t\nexport const derived={};',
        python: '// provenance: g/r@bbbbbbb t\nexport const derived={};',
      });
      assert.equal(stStale.rust.state, 'stale', 'pin 升未重生成应判 stale');
    }

    // ---------- 组 15: yaml-lite 去 POSIX 化（lit≡pwsh parity + fail-closed） ----------
    {
      const { parseYamlLite } = await import(
        '../../private/engineering/ming-boundary/scripts/lib/yaml.mjs');
      const { spawnSync } = await import('node:child_process');
      // DDT 形态矩阵：map/list/flow/引号/注释/嵌套清单全场景
      const CASES = [
        'a: 1\nb: x\nc: [p, q]\n',
        'list:\n  - a\n  - b\n',
        'items:\n  - name: n1\n    key: v1\n  - name: n2\n    sub:\n      - s1\n      - s2\n',
        "q: 'has # inside'  # comment\nd: \"dq\"\nempty: []\n",
        'deep:\n  l1:\n    l2:\n      - x\n',
      ];
      for (const [i, y] of CASES.entries()) {
        const got = parseYamlLite(y);
        assert.ok(got && typeof got === 'object', `DDT-${i} 应产对象`);
      }
      assert.deepEqual(parseYamlLite(CASES[2]).items[1].sub, ['s1', 's2'],
        'map 项下嵌套 list 应正确归巢');
      assert.equal(parseYamlLite(CASES[3]).q, 'has # inside',
        '引号内 # 不应被注释剥离');
      // fail-closed：不支持构造必须抛（回退 pwsh 桥而非静默错解）
      for (const bad of ['a: |\n  block\n', 'a: &x 1\nb: *x\n',
        'a: {k: v}\n', 'x:\n\t- y\n']) {
        assert.throws(() => parseYamlLite(bad), /不支持|未闭合/,
          `非法构造应抛错: ${bad.slice(0, 20)}`);
      }
      // CDC parity：本仓+IV8 真契约 lite≡pwsh 输出全等（pwsh 在位才互证）
      const pwsh = spawnSync('pwsh', ['-NoProfile', '-File',
        path.join(REPO, 'scripts/lib/yaml2json.ps1'), '-Path',
        path.join(REPO, 'boundaries.yaml')], { encoding: 'utf8' });
      if (pwsh.status === 0) {
        const lite = parseYamlLite(fs.readFileSync(
          path.join(REPO, 'boundaries.yaml'), 'utf8'));
        assert.deepEqual(lite, JSON.parse(pwsh.stdout),
          'boundaries.yaml lite 输出应与 pwsh 正典全等');
      }
      // lite 自洽断言（无 pwsh 也跑）：本仓契约的关键面
      const own = parseYamlLite(fs.readFileSync(
        path.join(REPO, 'boundaries.yaml'), 'utf8'));
      assert.ok(own.manifest.edge_kinds.includes('ref'), 'manifest 词表应解析');
      assert.ok(own.rules.forbidden.length > 0, 'forbidden 规则块应解析');
      assert.ok(own.exemptions.every((e) => e.glob && e.why),
        'exemptions 每项应带 glob+why');
    }

    console.log('  15 组断言全过');
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}
