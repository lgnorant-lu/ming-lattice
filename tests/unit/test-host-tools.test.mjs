// tests/unit/test-host-tools.test.mjs
// 单元测试: private/host-tools/{tools.yaml,tools.mjs,shims/{find,grep}}
// 覆盖: registry schema 形状 / status 表渲染确定性 / shim 契约
//       （find / 拦·透传 / grep TTY 拦·管道透传·--real-grep·GREP_GUARD_OFF·egrep 映射）
//       / doctor shim-wipe 检测 / bashrc UTF-16 编码探针 / gen-hints 托管块生成
// HT_HOME 注入假 HOME（tmpdir），不触真实用户文件；bash shim 行为经
// GUARD_ASSUME_TTY=1 探针注入交互分支，不依赖真实 PTY。

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseYamlLite }
  from '../../private/engineering/ming-boundary/scripts/lib/yaml.mjs';

const PKG = path.resolve(import.meta.dirname, '../../private/host-tools');
const TOOLS = path.join(PKG, 'tools.mjs');
const SHIM_GREP = path.join(PKG, 'shims/grep');
const SHIM_FIND = path.join(PKG, 'shims/find');
const TIERS = new Set(['block-form', 'soft-ban', 'hint', 'coexist']);

function bash() { // bash.exe 定位（Git usr/bin 在 PATH 则裸名即可）
  for (const c of ['bash', 'C:/Program Files/Git/usr/bin/bash.exe'])
    if (spawnSync(c, ['-c', 'true']).status === 0) return c;
  return null;
}
const BASH = bash();

function mkHome() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ht-'));
  fs.mkdirSync(path.join(d, '.local', 'bin'), { recursive: true });
  return d;
}
function tools(home, args, extraEnv = {}) {
  return spawnSync(process.execPath, [TOOLS, ...args],
    { encoding: 'utf8', env: { ...process.env, HT_HOME: home, ...extraEnv } });
}
function runShim(shim, argv, extraEnv = {}) {
  return spawnSync(BASH, [shim, ...argv],
    { encoding: 'utf8', env: { ...process.env, ...extraEnv } });
}

export async function run() {
  const reg = parseYamlLite(fs.readFileSync(path.join(PKG, 'tools.yaml'), 'utf8'));

  // —— registry schema ——
  assert.equal(reg.version, 1);
  assert.ok(reg.guards && typeof reg.guards === 'object', 'guards 段在册');
  for (const [name, g] of Object.entries(reg.guards)) {
    assert.ok(TIERS.has(g.tier), `${name}: 未知 tier ${g.tier}`);
    if (g.tier === 'block-form') assert.ok(Array.isArray(g.block_args) && g.block_args.length, `${name}: block-form 须 block_args`);
    if (g.tier === 'soft-ban') { assert.ok(g.escape_flag, `${name}: soft-ban 须 escape_flag`); assert.ok(g.env_off, `${name}: soft-ban 须 env_off`); }
    if (g.tier === 'hint') assert.ok(g.alt, `${name}: hint 须有 alt`);
  }
  assert.ok(Array.isArray(reg.free), 'free 段在册');

  const home = mkHome();

  // —— status 渲染（确定性 + 三态列） ——
  const s1 = tools(home, ['status']);
  assert.equal(s1.status, 0, s1.stderr);
  assert.match(s1.stdout, /native {2,}tier/);
  assert.match(s1.stdout, /grep {2,}soft-ban {2,}rg/);
  assert.match(s1.stdout, /sed {2,}coexist/);
  assert.match(s1.stdout, /find {2,}block-form {2,}fd/);
  assert.equal(tools(home, ['status']).stdout, s1.stdout, 'status 双跑确定性');

  // —— shim 在位检测：假 HOME 下用户级位缺席 → 非 user（本机 mingw64 fallback 或 MISSING）——
  assert.match(s1.stdout, /find\s+block-form\s+fd\s+\S+\s+(fallback|MISSING)/, 'shim 须标出层级，假 HOME 不得报 user');

  // —— doctor：假 HOME 无 shim + 无 .bashrc → 报败 ——
  const d1 = tools(home, ['doctor']);
  assert.equal(d1.status, 1, '假 HOME doctor 应失败');
  assert.match(d1.stdout, /FAIL.*find shim/);
  assert.match(d1.stdout, /FAIL.*rc 文件全缺席/);

  // —— doctor：铺 shim + UTF-8 bashrc → shim 项转绿 ——
  fs.copyFileSync(SHIM_FIND, path.join(home, '.local', 'bin', 'find'));
  fs.copyFileSync(SHIM_GREP, path.join(home, '.local', 'bin', 'grep'));
  fs.writeFileSync(path.join(home, '.bashrc'), 'export PATH="$HOME/.local/bin:$PATH"\n', 'utf8');
  const d2 = tools(home, ['doctor']);
  assert.match(d2.stdout, /\[ok\] find shim 在用户级位/);
  assert.match(d2.stdout, /FAIL.*hints 托管块缺席/, 'hint 层存在但 bashrc 无托管块 → FAIL');
  // UTF-16 bashrc 编码探针
  fs.writeFileSync(path.join(home, '.bashrc'), Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from('x=1', 'utf16le')]));
  const d3 = tools(home, ['doctor']);
  assert.match(d3.stdout, /UTF-16/, 'UTF-16 bashrc 应被探出');

  // —— gen-hints：托管块形状 ——
  const gh = tools(home, ['gen-hints']);
  assert.equal(gh.status, 0);
  assert.match(gh.stdout, /# >>> ming host-tools hints >>>/);
  assert.match(gh.stdout, /# <<< ming host-tools hints <<</);
  assert.match(gh.stdout, /du\(\) \{ command -v dua/, 'redirect 模式生成 dua 转发');
  assert.match(gh.stdout, /ls\(\) \{ command -v eza/, 'hint-only 模式生成 eza 提示');
  assert.ok(!/sed\(\)/.test(gh.stdout), 'coexist 件不生 function');

  // —— shim 行为契约（需 bash）——
  if (BASH) {
    // find: 危险形态拦
    const f1 = runShim(SHIM_FIND, ['/']);
    assert.equal(f1.status, 2);
    assert.match(f1.stderr, /find-guard: refused/);
    // find: 正常调用透传真实 find
    const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'ht-find-'));
    fs.writeFileSync(path.join(workdir, 'probe.txt'), 'x');
    const f2 = runShim(SHIM_FIND, [workdir.replace(/\\/g, '/'), '-name', 'probe.txt']);
    assert.equal(f2.status, 0, f2.stderr);
    assert.match(f2.stdout, /probe\.txt/);

    // grep: 非交互（管道 stdout）→ 透传真实 grep
    const g1 = runShim(SHIM_GREP, ['-c', 'x', path.join(workdir, 'probe.txt').replace(/\\/g, '/')]);
    assert.equal(g1.status, 0, g1.stderr);
    assert.equal(g1.stdout.trim(), '1');
    // grep: 注入 TTY → 软禁 exit 2 + 提示
    const g2 = runShim(SHIM_GREP, ['pat'], { GUARD_ASSUME_TTY: '1' });
    assert.equal(g2.status, 2);
    assert.match(g2.stderr, /grep-guard: grep is soft-disabled/);
    assert.match(g2.stderr, /rg <pattern>/);
    // --real-grep 逃生（TTY 下也透传）
    const g3 = runShim(SHIM_GREP, ['--real-grep', '-c', 'x', path.join(workdir, 'probe.txt').replace(/\\/g, '/')], { GUARD_ASSUME_TTY: '1' });
    assert.equal(g3.status, 0);
    assert.equal(g3.stdout.trim(), '1');
    // GREP_GUARD_OFF 逃生
    const g4 = runShim(SHIM_GREP, ['-c', 'x', path.join(workdir, 'probe.txt').replace(/\\/g, '/')], { GUARD_ASSUME_TTY: '1', GREP_GUARD_OFF: '1' });
    assert.equal(g4.status, 0);
    // egrep 名映射 → -E（经 argv0 仿真的软链改名复制）
    const eg = path.join(workdir, 'egrep');
    fs.copyFileSync(SHIM_GREP, eg);
    fs.writeFileSync(path.join(workdir, 're.txt'), 'aab\nabb\n');
    const g5 = runShim(eg, ['-c', 'a+b', path.join(workdir, 're.txt').replace(/\\/g, '/')]);
    assert.equal(g5.stdout.trim(), '2', 'egrep -E 映射应使 a+b 正则生效');
  }

  // —— POSIX 平台注入：HT_PLATFORM=linux → mingw64 fallback 位不在探针面 ——
  const home2 = mkHome();
  const sp = tools(home2, ['status'], { HT_PLATFORM: 'linux' });
  assert.equal(sp.status, 0);
  assert.match(sp.stdout, /find\s+block-form\s+fd\s+\S+\s+MISSING/,
    'POSIX 端无 mingw64 fallback——未铺 shim 应如实 MISSING');
  // POSIX PATH 归一化：/ 分隔符判定（注入纯 POSIX 形 HOME——Windows 形
  // C:\ 盘符冒号与 POSIX PATH ':' 分隔符同形，跨平台语义注定不可混写）
  const dp = tools('/srv/ht-fake', ['doctor'], {
    HT_PLATFORM: 'linux',
    PATH: '/srv/ht-fake/.local/bin:/usr/bin:/bin',
  });
  assert.match(dp.stdout, /\[ok\] PATH 含用户 bin 部署点/, 'POSIX PATH 形如 a/b 也应检出');

  // —— install.sh 冒烟（需 bash）：假 HOME 部署 → doctor 转绿 ——
  if (BASH) {
    const ih = mkHome();
    fs.writeFileSync(path.join(ih, '.bashrc'), 'x=1\n', 'utf8');
    fs.writeFileSync(path.join(ih, '.zshrc'), 'z=1\n', 'utf8');
    const inst = spawnSync(BASH, [path.join(PKG, 'install.sh')],
      { encoding: 'utf8', env: { ...process.env, HT_HOME: ih } });
    assert.equal(inst.status, 0, inst.stderr + inst.stdout);
    const shimGrep = path.join(ih, '.local', 'bin', 'grep');
    assert.ok(fs.existsSync(shimGrep), 'shim 落盘');
    assert.ok(fs.existsSync(path.join(ih, '.local', 'bin', 'tools')), 'tools 入口落盘');
    const rcBody = fs.readFileSync(path.join(ih, '.bashrc'), 'utf8');
    assert.match(rcBody, />>> ming host-tools hints/, 'bashrc 挂块');
    assert.match(rcBody, /^x=1/m, '用户手改区保留');
    assert.match(fs.readFileSync(path.join(ih, '.zshrc'), 'utf8'), /ming host-tools hints/, 'zshrc 也挂块');
    // 幂等重放：第二跑走刷新路径不重复追加
    const inst2 = spawnSync(BASH, [path.join(PKG, 'install.sh')],
      { encoding: 'utf8', env: { ...process.env, HT_HOME: ih } });
    assert.equal(inst2.status, 0);
    assert.match(inst2.stdout, /hints 块已刷新/);
    const cnt = (fs.readFileSync(path.join(ih, '.bashrc'), 'utf8')
      .match(/>>> ming host-tools hints/g) || []).length;
    assert.equal(cnt, 1, '托管块幂等不重复');
    // 部署后 doctor 在假 HOME 下应全绿（PATH 用 win 形态 ';' 拼入假部署点）
    const dOk = tools(ih, ['doctor'], {
      PATH: `${ih}\\.local\\bin;${process.env.PATH}` });
    assert.equal(dOk.status, 0, dOk.stdout + dOk.stderr);
    // uninstall
    const un = spawnSync(BASH, [path.join(PKG, 'install.sh'), '--uninstall'],
      { encoding: 'utf8', env: { ...process.env, HT_HOME: ih } });
    assert.equal(un.status, 0);
    assert.ok(!fs.existsSync(shimGrep), 'uninstall 拆 shim');
  }

  console.log('    host-tools: registry/schema/status/doctor/gen-hints/shim 契约/POSIX 平台/install.sh 全绿');
}
