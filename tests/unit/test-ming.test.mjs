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

  // 6b. kit 领养仓——无 registry/零成员/未声明 sources → 零 E 零 W（IV8 试点同形）
  {
    const root = mkRoot();
    fs.mkdirSync(path.join(root, '.ming', 'iv8'), { recursive: true });
    fs.writeFileSync(path.join(root, '.ming', 'ming.yaml'),
      'manifestVersion: "1"\nscope: ming\nkinds:\n  - lattice\n  - pack\n  - kit\nprojects:\n  - iv8\n');
    fs.writeFileSync(path.join(root, '.ming', 'iv8', 'package.yaml'),
      'manifestVersion: "1"\nname: ming-iv8\nversion: "0.1.0"\nkind: kit\npackages:\n  members:\n');
    const r = issues(root);
    assert.equal(r.status, 0, `kit 领养仓应零 E: ${r.stdout}`);
    assert.doesNotMatch(r.stdout, /members 缺\/空|registry/, 'kit 应豁免 members/registry 提示');
  }

  // 6c. kit 声明 sources.registry 而文件缺席 → E（条件化不豁免已声明指针）
  {
    const root = mkRoot();
    fs.mkdirSync(path.join(root, '.ming', 'iv8'), { recursive: true });
    fs.writeFileSync(path.join(root, '.ming', 'ming.yaml'),
      'manifestVersion: "1"\nscope: ming\nkinds:\n  - lattice\n  - pack\n  - kit\nprojects:\n  - iv8\n');
    fs.writeFileSync(path.join(root, '.ming', 'iv8', 'package.yaml'),
      'manifestVersion: "1"\nname: ming-iv8\nversion: "0.1.0"\nkind: kit\npackages:\n  members:\nsources:\n  registry: registry.yaml\n');
    const r = issues(root);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /sources\.registry 指向不存在/);
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

    // 错拼 fail-closed：weight: hevy 若静默按 core 会并入默认面——危险向 fail-open 先拦
    fs.writeFileSync(path.join(root, 'registry.yaml'), reg.replace('weight: heavy', 'weight: hevy'));
    const bad = sh(FETCH, ['--dry-run'], { FETCH_ROOT: root });
    assert.equal(bad.status, 2, 'weight 出词表应 exit 2');
    assert.match(bad.stderr, /出封闭词表.*hevy/);
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
      `private:\n  - name: unit-a\n    deploy:\n      claude: true\n  - name: unit-b\n    deploy:\n      claude: true\n  - name: unit-c\n    deploy:\n      claude: true\n` +
      `  - name: unit-d\n    deploy:\n      codx: true\n`);   // codx 错拼客户名——应 warn 不静默

    const w = sh(LEDGER, ['--write'], { LEDGER_ROOT: root });
    assert.equal(w.status, 0, w.stderr);
    assert.match(w.stderr, /deploy 客户名不在 targets: unit-d\/codx/, '错拼客户名应告警');
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

  // 10. scaffold-ming——领养模板化：新建/幂等/projects 并入/自证回滚/dry-run 零写
  {
    const SCM = path.resolve(import.meta.dirname, '../../scripts/scaffold-ming.mjs');
    const t = mkRoot();
    fs.mkdirSync(path.join(t, '.git'), { recursive: true });

    const dry = sh(SCM, ['--target', t, '--name', 'blog', '--dry-run']);
    assert.equal(dry.status, 0, dry.stderr);
    assert.ok(!fs.existsSync(path.join(t, '.ming')), 'dry-run 应零落盘');

    const mk = sh(SCM, ['--target', t, '--name', 'blog']);
    assert.equal(mk.status, 0, mk.stderr);
    for (const f of ['.ming/ming.yaml', '.ming/blog/package.yaml', '.gitignore'])
      assert.ok(fs.existsSync(path.join(t, f)), `${f} 应落盘`);
    const selfCheck = issues(t);
    assert.equal(selfCheck.status, 0, `生成物应即过 check-ming: ${selfCheck.stdout}`);

    const re = sh(SCM, ['--target', t, '--name', 'blog']);
    assert.equal(re.status, 0);
    assert.match(re.stdout, /skip.*package\.yaml 在场/s, '重放应幂等 skip');

    const second = sh(SCM, ['--target', t, '--name', 'api']);
    assert.equal(second.status, 0, second.stderr);
    const umb = fs.readFileSync(path.join(t, '.ming', 'ming.yaml'), 'utf8');
    assert.match(umb, /  - api\n/, '伞面 projects 应并入 api');
    assert.match(umb, /  - blog\n/);

    // 回滚：预置登记无目录的 ghost 项目 → 写后自证 E → 全部还原
    const t2 = mkRoot();
    fs.mkdirSync(path.join(t2, '.git'), { recursive: true });
    fs.mkdirSync(path.join(t2, '.ming'), { recursive: true });
    fs.writeFileSync(path.join(t2, '.ming', 'ming.yaml'),
      'manifestVersion: "1"\nscope: ming\nkinds:\n  - kit\nprojects:\n  - ghost\n');
    const rb = sh(SCM, ['--target', t2, '--name', 'newp']);
    assert.equal(rb.status, 1, '自证 E 应 exit 1');
    assert.match(rb.stderr, /回滚/);
    assert.ok(!fs.existsSync(path.join(t2, '.ming', 'newp')), '回滚后新项目件应清除');
    assert.match(fs.readFileSync(path.join(t2, '.ming', 'ming.yaml'), 'utf8'),
      /projects:\n  - ghost\n$/, '伞面应还原');

    fs.rmSync(t, { recursive: true, force: true });
    fs.rmSync(t2, { recursive: true, force: true });
  }

  // 11. registry-upsert——条目安全编辑：add 段尾插位/set 块内改写/remove 删块/校验 fail-closed
  {
    const UP = path.resolve(import.meta.dirname, '../../scripts/registry-upsert.mjs');
    const t = mkRoot();
    fs.copyFileSync(path.resolve(import.meta.dirname, '../../registry.yaml'), path.join(t, 'registry.yaml'));
    const env = { REG_UPSERT_ROOT: t };
    const pin = '0'.repeat(40);

    let r = sh(UP, ['add', '--section', 'vertical', '--name', 'probe-repo', '--repo', 'https://x/y.git',
      '--pin', pin, '--domain', 'misc', '--dry-run'], env);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(!/probe-repo/.test(fs.readFileSync(path.join(t, 'registry.yaml'), 'utf8')), 'dry-run 零写');

    r = sh(UP, ['add', '--section', 'vertical', '--name', 'probe-repo', '--repo', 'https://x/y.git',
      '--pin', pin, '--domain', 'misc'], env);
    assert.equal(r.status, 0, r.stderr);
    r = sh(UP, ['set', '--name', 'probe-repo', '--weight', 'heavy', '--enabled', 'false'], env);
    assert.equal(r.status, 0, r.stderr);
    const reg = fs.readFileSync(path.join(t, 'registry.yaml'), 'utf8');
    assert.match(reg, /name: probe-repo[\s\S]*?enabled: false[\s\S]*?weight: heavy/, 'set 应在块内改写');
    r = sh(UP, ['remove', '--name', 'probe-repo'], env);
    assert.equal(r.status, 0);
    assert.ok(!/probe-repo/.test(fs.readFileSync(path.join(t, 'registry.yaml'), 'utf8')), 'remove 应删块');

    // fail-closed 面：重名/坏 pin/出词表 weight/未知 deploy 客户/无 pin 远端
    const bad = [
      ['add', '--section', 'vertical', '--name', 'ming-skills-router', '--repo', 'r', '--pin', pin],
      ['add', '--section', 'vertical', '--name', 'bad-pin', '--repo', 'r', '--pin', 'abc'],
      ['add', '--section', 'vertical', '--name', 'bad-w', '--repo', 'r', '--pin', pin, '--weight', 'hevy'],
      ['add', '--section', 'vertical', '--name', 'bad-d', '--repo', 'r', '--pin', pin, '--deploy', 'codx'],
      ['add', '--section', 'vertical', '--name', 'no-pin', '--repo', 'r'],
      ['set', '--name', 'probe-x', '--pin', pin],
      ['frobnicate', '--name', 'x'],
    ];
    for (const a of bad) {
      const rr = sh(UP, a, env);
      assert.equal(rr.status, 2, `${a.join(' ')} 应 exit 2: ${rr.stdout}${rr.stderr}`);
    }
    fs.rmSync(t, { recursive: true, force: true });
  }

  console.log('  [PASS] ming 命名域契约全过');
}
