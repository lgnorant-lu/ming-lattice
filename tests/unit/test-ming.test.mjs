// tests/unit/test-ming.test.mjs
// 箱身份契约测试: scripts/check-ming.mjs + registry weight 分层(fetch) + scaffold --register
// 覆盖: manifest schema 硬校验/成员↔registry 双向对账/weight 默认面排除与显式可达/
//       --register 条目生成(ming-* 自动 metaSystem)。fixture 全本地零网络。

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHECK_MING = path.resolve(import.meta.dirname, '../../scripts/check-ming.mjs');
const FETCH = path.resolve(import.meta.dirname, '../../scripts/fetch.mjs');
const SCAFFOLD = path.resolve(import.meta.dirname, '../../private/engineering/ming-skill-forge/scripts/scaffold-skill.mjs');
const REPO = path.resolve(import.meta.dirname, '../..');

let n = 0;
const mkRoot = () => fs.mkdtempSync(path.join(process.env.SKILLS_TEST_TMPDIR || os.tmpdir(), `ming-${n++}-`));

const sh = (script, args, env = {}) =>
  spawnSync(process.execPath, [script, ...args], { env: { ...process.env, ...env }, encoding: 'utf8', timeout: 60000 });

// fixture manifest：最小合法形 + 可覆写字段
const manifest = (over = {}) => {
  const m = { name: 'ming-lattice', version: '0.1.0', kind: 'lattice', members: '    - "private/ming-*"', ...over };
  return `manifestVersion: "1"\nname: ${m.name}\nversion: ${m.version}\nkind: ${m.kind}\ndescription: "fixture"\nnaming:\n  prefix: "ming-"\npackages:\n  members:\n${m.members}\nsources:\n  registry: registry.yaml\n  docDomains: docs/ming.yaml\n`;
};

// fixture 仓根：manifest + registry(private 一条) + 成员目录(SKILL.md)
function mkFixture({ meta = '    metaSystem: true', skillMd = true, manifestText = manifest() } = {}) {
  const root = mkRoot();
  fs.mkdirSync(path.join(root, '.ming'), { recursive: true });
  if (manifestText !== null) fs.writeFileSync(path.join(root, '.ming', 'ming.yaml'), manifestText);
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
const levels = (r) => JSON.parse(r.stdout).issues.map(i => i.level);

export function run() {
  console.log('[TEST UNIT] ming 箱身份契约...');

  // 1. 真仓对账——manifest/members/registry 三方一致（parity 断言）
  {
    const r = sh(CHECK_MING, []);
    assert.equal(r.status, 0, `真仓 check-ming 应全过: ${r.stderr}${r.stdout}`);
  }

  // 2. fixture 合法形 → 零 E
  {
    const r = issues(mkFixture());
    assert.equal(r.status, 0, `合法 fixture 应零 E: ${r.stdout}`);
    assert.deepEqual(levels(r), []);
  }

  // 3. schema 硬校验——kind 出封闭词表 / name 非 ming-* / version 非三段 → E
  for (const [label, over] of [
    ['kind 出词表', { kind: 'plugin' }],
    ['name 脱命名空间', { name: 'lattice' }],
    ['version 非三段', { version: '1.0' }],
  ]) {
    const r = issues(mkFixture({ manifestText: manifest(over) }));
    assert.equal(r.status, 1, `${label} 应 E: ${r.stdout}`);
  }

  // 4. manifest 缺席 → E(fail-closed)
  {
    const r = issues(mkFixture({ manifestText: null }));
    assert.equal(r.status, 1);
    assert.match(r.stdout, /ming\.yaml 缺席/);
  }

  // 5. 成员↔registry 对账——成员缺 SKILL.md / 未登记 / 缺 metaSystem → E
  for (const [label, fx] of [
    ['成员缺 SKILL.md', { skillMd: false }],
    ['成员缺 metaSystem', { meta: '' }],
  ]) {
    const r = issues(mkFixture(fx));
    assert.equal(r.status, 1, `${label} 应 E: ${r.stdout}`);
  }
  {   // registry 无该成员条目 → 未登记 E（entry 换成别的名）
    const root = mkFixture();
    let reg = fs.readFileSync(path.join(root, 'registry.yaml'), 'utf8');
    reg = reg.replace('name: ming-foo', 'name: other-pack').replace('path: private/ming-foo', 'path: private/other-pack');
    fs.writeFileSync(path.join(root, 'registry.yaml'), reg);
    const r = issues(root);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /未入 registry private/);
  }

  // 6. weight 分层——heavy 默认面排除/--include-heavy 与 --only 可达
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

  // 7. scaffold --register——ming-* 名自动 metaSystem / 重名 fail-closed
  {
    const ok = sh(SCAFFOLD, ['ming-fixture-probe', '--desc', 'fixture 探针包——验证 register 条目生成契约', '--register', '--dry-run']);
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /metaSystem: true/, 'ming-* 条目应自动 metaSystem');
    assert.match(ok.stdout, /path: private\/ming-fixture-probe/);

    const dup = sh(SCAFFOLD, ['ming-boundary', '--desc', 'fixture 重名探针包——验证 registry 名碰撞 fail-closed 防御', '--register']);
    assert.equal(dup.status, 1, 'registry 已有名应拒');
    assert.match(dup.stderr, /重名碰撞/);
  }

  console.log('  [PASS] ming 箱身份契约全过');
}
