// tests/unit/test-ming.test.mjs
// ming 命名域双层契约测试: scripts/check-ming.mjs + registry weight 分层(fetch)
//   + scaffold --register + scripts/deploy-ledger.mjs 部署态账本
// 覆盖: 伞面 schema/projects↔目录双向/项目包 name=ming-<dir>/members↔registry
//       对账/weight 默认面排除与显式可达/--register 条目生成/账本 write→check
//       漂移与覆盖断言。fixture 全本地零网络。

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHECK_MING = path.resolve(import.meta.dirname, '../../scripts/check-ming.mjs');
const FETCH = path.resolve(import.meta.dirname, '../../scripts/fetch.mjs');
const LEDGER = path.resolve(import.meta.dirname, '../../scripts/deploy-ledger.mjs');
const SCAFFOLD = path.resolve(import.meta.dirname, '../../private/engineering/ming-skill-forge/scripts/scaffold-skill.mjs');

let n = 0;
const mkRoot = () => fs.mkdtempSync(path.join(process.env.SKILLS_TEST_TMPDIR || os.tmpdir(), `ming-${n++}-`));

const sh = (script, args, env = {}) =>
  spawnSync(process.execPath, [script, ...args], { env: { ...process.env, ...env }, encoding: 'utf8', timeout: 60000 });

const UMBRELLA = `manifestVersion: "1"\nscope: ming\ndescription: "fx"\nnaming:\n  prefix: "ming-"\nkinds:\n  - lattice\n  - pack\nprojects:\n  - lattice\n`;
const PKG = (over = {}) => {
  const m = { name: 'ming-lattice', version: '0.1.0', kind: 'lattice', members: '    - "private/ming-*"', ...over };
  return `manifestVersion: "1"\nname: ${m.name}\nversion: ${m.version}\nkind: ${m.kind}\ndescription: "fx"\nnaming:\n  prefix: "ming-"\npackages:\n  members:\n${m.members}\nsources:\n  registry: registry.yaml\n  docDomains: docs/ming.yaml\n`;
};

// fixture 仓根：伞面 + lattice 项目包 + registry(private 一条) + 成员目录
function mkFixture({ meta = '    metaSystem: true', skillMd = true, umbrella = UMBRELLA, pkg = PKG() } = {}) {
  const root = mkRoot();
  fs.mkdirSync(path.join(root, '.ming', 'lattice'), { recursive: true });
  if (umbrella !== null) fs.writeFileSync(path.join(root, '.ming', 'ming.yaml'), umbrella);
  if (pkg !== null) fs.writeFileSync(path.join(root, '.ming', 'lattice', 'package.yaml'), pkg);
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'ming.yaml'), 'ming_v: "1"\n');
  const packDir = path.join(root, 'private', 'ming-foo');
  fs.mkdirSync(packDir, { recursive: true });
  if (skillMd) fs.writeFileSync(path.join(packDir, 'SKILL.md'), '---\nname: ming-foo\n---\n');
  const entry = `  - name: ming-foo\n${meta ? meta + '\n' : ''}    path: private/ming-foo\n    enabled: true\n    deploy:\n      claude: true\n`;
  fs.writeFileSync(path.join(root, 'registry.yaml'), `private:\n${entry}candidates:\n`);
  return root;
}

const issues = (root) => sh(CHECK_MING, ['--json'], { MING_CHECK_ROOT: root });

export function run() {
  console.log('[TEST UNIT] ming 命名域双层契约...');

  // 1. 真仓对账——伞面/项目包/members/registry 四层一致
  {
    const r = sh(CHECK_MING, []);
    assert.equal(r.status, 0, `真仓 check-ming 应全过: ${r.stderr}${r.stdout}`);
  }

  // 2. fixture 合法形 → 零 E
  {
    const r = issues(mkFixture());
    assert.equal(r.status, 0, `合法 fixture 应零 E: ${r.stdout}`);
  }

  // 3. schema 硬校验——kind 出伞面词表 / name 脱命名空间 / name 与目录不符 / version 非三段 → E
  for (const [label, over] of [
    ['kind 出词表', { kind: 'plugin' }],
    ['name 脱命名空间', { name: 'lattice' }],
    ['name 与目录不符', { name: 'ming-other' }],
    ['version 非三段', { version: '1.0' }],
  ]) {
    const r = issues(mkFixture({ pkg: PKG(over) }));
    assert.equal(r.status, 1, `${label} 应 E: ${r.stdout}`);
  }

  // 4. 伞面缺席 → E；伞面 scope 错 → E
  {
    const r = issues(mkFixture({ umbrella: null }));
    assert.equal(r.status, 1);
    assert.match(r.stdout, /ming\.yaml 缺席/);
    const r2 = issues(mkFixture({ umbrella: UMBRELLA.replace('scope: ming', 'scope: other') }));
    assert.equal(r2.status, 1);
    assert.match(r2.stdout, /scope=other/);
  }

  // 5. projects↔目录双向——未登记目录 W / 登记无目录 E
  {
    const root = mkFixture();
    fs.mkdirSync(path.join(root, '.ming', 'ghost'), { recursive: true });   // 幽灵目录未登记
    const r = issues(root);
    assert.match(r.stdout, /未登记项目目录.*ghost/);
    const r2 = issues(mkFixture({ umbrella: UMBRELLA.replace('projects:\n  - lattice', 'projects:\n  - lattice\n  - ghost2') }));
    assert.equal(r2.status, 1);
    assert.match(r2.stdout, /登记项目无目录.*ghost2/);
  }

  // 6. 成员↔registry 对账——成员缺 SKILL.md / 未登记 / 缺 metaSystem → E
  for (const [label, fx] of [
    ['成员缺 SKILL.md', { skillMd: false }],
    ['成员缺 metaSystem', { meta: '' }],
  ]) {
    const r = issues(mkFixture(fx));
    assert.equal(r.status, 1, `${label} 应 E: ${r.stdout}`);
  }
  {
    const root = mkFixture();
    let reg = fs.readFileSync(path.join(root, 'registry.yaml'), 'utf8');
    reg = reg.replace('name: ming-foo', 'name: other-pack').replace('path: private/ming-foo', 'path: private/other-pack');
    fs.writeFileSync(path.join(root, 'registry.yaml'), reg);
    const r = issues(root);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /未入 registry private/);
  }

  // 7. weight 分层——heavy 默认面排除/--include-heavy 与 --only 可达
  {
    const root = mkRoot();
    fs.mkdirSync(path.join(root, 'vertical', 'heavy-x'), { recursive: true });
    fs.mkdirSync(path.join(root, 'vertical', 'core-x'), { recursive: true });
    const reg = `vertical:\n` +
      `  - name: heavy-x\n    repo: https://x/y.git\n    pin: ${'0'.repeat(40)}\n    weight: heavy\n    enabled: true\n` +
      `  - name: core-x\n    repo: https://x/y.git\n    pin: ${'0'.repeat(40)}\n    enabled: true\n`;
    fs.writeFileSync(path.join(root, 'registry.yaml'), reg);

    const dflt = sh(FETCH, ['--dry-run'], { FETCH_ROOT: root });
    assert.match(dflt.stdout, /重仓跳过\(weight=heavy\) 1: heavy-x/, `默认面应跳 heavy: ${dflt.stdout}`);

    const all = sh(FETCH, ['--dry-run', '--include-heavy'], { FETCH_ROOT: root });
    assert.doesNotMatch(all.stdout, /重仓跳过/, `--include-heavy 不应有 heavy 桶: ${all.stdout}`);

    const named = sh(FETCH, ['--dry-run', '--only', 'heavy-x'], { FETCH_ROOT: root });
    assert.doesNotMatch(named.stdout, /重仓跳过/, `--only 显式点名应可达 heavy: ${named.stdout}`);
  }

  // 8. scaffold --register——ming-* 名自动 metaSystem / 重名 fail-closed
  {
    const ok = sh(SCAFFOLD, ['ming-fixture-probe', '--desc', 'fixture 探针包——验证 register 条目生成契约', '--register', '--dry-run']);
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /metaSystem: true/, 'ming-* 条目应自动 metaSystem');
    assert.match(ok.stdout, /path: private\/ming-fixture-probe/);

    const dup = sh(SCAFFOLD, ['ming-boundary', '--desc', 'fixture 重名探针包——验证 registry 名碰撞 fail-closed 防御', '--register']);
    assert.equal(dup.status, 1, 'registry 已有名应拒');
    assert.match(dup.stderr, /重名碰撞/);
  }

  // 9. deploy-ledger——write 立账→check 无漂移；改文件系统→check 抓 missing/changed/foreign
  {
    const root = mkRoot();
    const targetDir = path.join(root, 'fake-target');
    fs.mkdirSync(path.join(targetDir, 'unit-a'), { recursive: true });
    fs.mkdirSync(path.join(targetDir, 'unit-b'), { recursive: true });
    fs.mkdirSync(path.join(root, '.ming', 'lattice'), { recursive: true });
    fs.writeFileSync(path.join(root, 'registry.yaml'),
      `targets:\n  claude: "${targetDir.replace(/\\/g, '/')}"\n` +
      `private:\n  - name: unit-a\n    deploy:\n      claude: true\n  - name: unit-b\n    deploy:\n      claude: true\n  - name: unit-c\n    deploy:\n      claude: true\n`);

    const w = sh(LEDGER, ['--write'], { LEDGER_ROOT: root });
    assert.equal(w.status, 0, w.stderr);
    const ledgerPath = path.join(root, '.ming', 'lattice', 'state', 'deploy-ledger.json');
    assert.ok(fs.existsSync(ledgerPath), '账本应落 state/');
    const led = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
    assert.equal(led.clients.claude.entries.length, 2);

    const clean = sh(LEDGER, ['--check'], { LEDGER_ROOT: root });
    assert.equal(clean.status, 1, 'uncovered unit-c 应使 exit=1');
    assert.match(clean.stdout, /uncovered.*unit-c/);

    // 漂移：删 unit-b → missing；加外来件 → foreign
    fs.rmSync(path.join(targetDir, 'unit-b'), { recursive: true });
    fs.mkdirSync(path.join(targetDir, 'stray-x'));
    const drift = sh(LEDGER, ['--check'], { LEDGER_ROOT: root });
    assert.match(drift.stdout, /missing.*unit-b/, `unit-b 删除应抓 missing: ${drift.stdout}`);
    assert.match(drift.stdout, /foreign.*stray-x/, `stray-x 应抓 foreign: ${drift.stdout}`);
  }

  console.log('  [PASS] ming 命名域契约全过');
}
