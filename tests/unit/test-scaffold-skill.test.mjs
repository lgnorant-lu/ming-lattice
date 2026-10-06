// tests/unit/test-scaffold-skill.test.mjs
// 单元测试: private/engineering/ming-skill-forge/scripts/scaffold-skill.mjs
// 覆盖七缺陷回归：选项值误食 name / --under 逃逸与白名单 / 旗标吞值 /
//   desc YAML 注入写前拦截 / 失败不留残骸 / 跨层与 registry 重名 / kebab 严式+长度
// 副流程：dry-run 不落盘、真写+自证、candidates 毕业提示、ming- 命名空间警示、
//   --register 沙箱闭环（SCAFFOLD_ROOT 注入 + 委托 upsert 正典插位）
// 约定：校验类用例一律 --dry-run 或断言非变更；真写用例用 zz-* 名并在 finally 清理。

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SCRIPT = path.resolve(import.meta.dirname, '../../private/engineering/ming-skill-forge/scripts/scaffold-skill.mjs');
const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const DESC = '这是一个用于脚手架测试的技能描述，触发词 alpha、beta、gamma 场景使用。';

function scaffold(args, env) {
  const r = spawnSync('node', [SCRIPT, ...args], {
    encoding: 'utf8',
    env: env ? { ...process.env, ...env } : process.env,
  });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}
const absent = (rel) => !fs.existsSync(path.join(REPO_ROOT, rel));

export function run() {
  console.log('[TEST UNIT] scaffold-skill.mjs...');
  const cleanups = [];
  try {
    // ── 缺陷1回归：旗标值不被误食为 name；--under 前置时 name 仍取位置参数 ──
    {
      const r = scaffold(['--under', 'private/engineering', 'zz-order-fx', '--desc', DESC, '--dry-run']);
      assert.equal(r.status, 0, `dry-run 应成功: ${r.stderr}`);
      assert.ok(r.stdout.includes(path.join('private', 'engineering', 'zz-order-fx')),
        `name 应解析为 zz-order-fx 而非 under 值: ${r.stdout}`);
    }

    // ── 缺陷2回归：--under 逃逸——../、绝对路径、非白名单层全部拒绝且不落盘 ──
    for (const under of ['../', '..', 'C:/temp', 'deployable', 'vertical/x', 'bogus']) {
      const r = scaffold(['zz-escape-fx', '--under', under, '--desc', DESC, '--dry-run']);
      assert.equal(r.status, 1, `--under ${under} 应拒`);
      assert.ok(r.stderr.includes('白名单'), `--under ${under} 应报白名单: ${r.stderr}`);
    }
    // 白名单正向面：testing 族子层是真实包层，必须可进（回归——初版白名单漏收）
    {
      const r = scaffold(['zz-testing-fx', '--under', 'private/engineering/testing', '--desc', DESC, '--dry-run']);
      assert.equal(r.status, 0, `testing 子层应放行: ${r.stderr}`);
      assert.ok(r.stdout.includes(path.join('private', 'engineering', 'testing', 'zz-testing-fx')), '落点应在 testing 子层');
    }
    // 派生白名单：Windows 反斜杠归一 + 未登记新层拒（纳层须先 registry 登记）
    {
      const r = scaffold(['zz-bs-fx', '--under', 'private\\engineering', '--desc', DESC, '--dry-run']);
      assert.equal(r.status, 0, `反斜杠应归一放行: ${r.stderr}`);
      const r2 = scaffold(['zz-lab-fx', '--under', 'private/labs', '--desc', DESC, '--dry-run']);
      assert.equal(r2.status, 1, '未登记新层应拒');
      assert.ok(r2.stderr.includes('登记'), '应提示纳层准入路径');
      // 重复旗标拒
      assert.equal(scaffold(['zz-dup-fx', '--desc', DESC, '--desc', DESC]).status, 1, '重复 --desc 应拒');
    }
    assert.ok(absent('../zz-escape-fx'), '逃逸目录不得存在于仓外');
    assert.ok(absent('private/zz-escape-fx'), '拒绝后不得落盘');

    // ── 缺陷3回归：旗标吞值——--desc --paradigm 拒 ──
    {
      const r = scaffold(['zz-swallow-fx', '--desc', '--paradigm']);
      assert.equal(r.status, 1, '吞值应拒');
      assert.ok(r.stderr.includes('缺值'), `应报缺值: ${r.stderr}`);
    }
    // 未知旗标 / 多位置参数
    assert.equal(scaffold(['zz-fx', '--desc', DESC, '--bogus']).status, 1, '未知旗标应拒');
    assert.equal(scaffold(['foo', 'bar', '--desc', DESC]).status, 1, '多位置参数应拒');

    // ── 缺陷4+5回归：desc YAML 注入写前拦截，失败零残骸 ──
    for (const [desc, frag] of [
      ['第一行\n第二行触发词补充长度测试', '单行'],
      ['含冒号: 破坏 plain scalar 的描述文本测试', 'plain scalar'],
      [' 首尾空白描述文本测试触发词 ', '空白'],
      ['短', '过短'],
    ]) {
      const r = scaffold(['zz-desc-fx', '--desc', desc]);
      assert.equal(r.status, 1, `desc "${desc.slice(0, 12)}…" 应拒`);
      assert.ok(r.stderr.includes(frag), `应报 "${frag}": ${r.stderr}`);
      assert.ok(absent('private/zz-desc-fx'), '校验失败不得留残骸');
    }

    // ── 缺陷6回归：跨层/registry 重名碰撞 ──
    {
      // private/engineering 已有目录
      const r = scaffold(['review-core-paradigm', '--desc', DESC, '--under', 'private']);
      assert.equal(r.status, 1, '同 registry 名应拒');
      assert.ok(/重名碰撞/.test(r.stderr), `应报重名: ${r.stderr}`);
      // candidates 候审区名 → 放行 + 毕业提示
      const c = scaffold(['narrative-core-paradigm', '--desc', DESC, '--dry-run']);
      assert.equal(c.status, 0, `候选名应放行: ${c.stderr}`);
      assert.ok(c.stdout.includes('候审区'), `应报毕业提示: ${c.stdout}`);
    }

    // ── 缺陷7回归：kebab 严式 + 长度 ──
    for (const bad of ['-foo', 'foo-', 'a', 'ok', 'Foo', 'foo--bar', 'foo_bar']) {
      const r = scaffold([bad, '--desc', DESC, '--dry-run']);
      assert.equal(r.status, 1, `name ${bad} 应拒`);
      assert.ok(r.stderr.includes('kebab-case'), `${bad} 应报 kebab: ${r.stderr}`);
    }
    // 缺陷8回归：Windows 保留设备名——kebab 过但跨平台毒名（win32 建不出/
    // POSIX 建出 Windows 拉不动）
    for (const dev of ['con', 'aux', 'nul', 'com1', 'lpt9']) {
      const r = scaffold([dev, '--desc', DESC, '--dry-run']);
      assert.equal(r.status, 1, `设备名 ${dev} 应拒`);
      assert.ok(r.stderr.includes('保留设备名'), `${dev} 应报保留名: ${r.stderr}`);
    }

    // ── dry-run 契约：校验通过也不落盘 ──
    {
      const r = scaffold(['zz-dry-fx', '--desc', DESC, '--dry-run']);
      assert.equal(r.status, 0, `dry-run 应过: ${r.stderr}`);
      assert.ok(r.stdout.includes('[dry-run]'), '应标 dry-run');
      assert.ok(absent('private/zz-dry-fx'), 'dry-run 不得落盘');
    }

    // ── 真写：自证 E=0 + 纳层评估记录 + 接线清单 ──
    {
      const dest = path.join(REPO_ROOT, 'private', 'zz-write-fx');
      cleanups.push(dest);
      const r = scaffold(['zz-write-fx', '--desc', DESC]);
      assert.equal(r.status, 0, `真写应过: ${r.stderr}`);
      assert.ok(fs.existsSync(path.join(dest, 'SKILL.md')), 'SKILL.md 应生成');
      const md = fs.readFileSync(path.join(dest, 'SKILL.md'), 'utf8');
      assert.ok(md.includes('name: zz-write-fx'), 'name 应替换');
      assert.ok(md.includes(DESC), 'desc 应注入');
      assert.ok(r.stdout.includes('纳层评估'), '应有准入门控记录');
      assert.ok(r.stdout.includes('接线清单'), '应有接线清单');
    }

    // ── 真写 --paradigm：references/sources.md 生成 ──
    {
      const dest = path.join(REPO_ROOT, 'private', 'zz-para-fx');
      cleanups.push(dest);
      const r = scaffold(['zz-para-fx', '--desc', DESC, '--paradigm']);
      assert.equal(r.status, 0, `paradigm 写应过: ${r.stderr}`);
      assert.ok(fs.existsSync(path.join(dest, 'references', 'sources.md')), 'sources.md 应生成');
    }

    // ── ming- 命名空间警示 ──
    {
      const dest = path.join(REPO_ROOT, 'private', 'ming-zz-fx');
      cleanups.push(dest);
      const r = scaffold(['ming-zz-fx', '--desc', DESC]);
      assert.equal(r.status, 0, `ming- 写应过: ${r.stderr}`);
      assert.ok(r.stdout.includes('metaSystem'), '应警示 metaSystem 声明');
    }

    // ── --register 沙箱闭环：委托 upsert 正典——条目须落在 candidates 横幅之前的 private 段内 ──
    {
      const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-reg-'));
      cleanups.push(sandbox);
      fs.copyFileSync(path.join(REPO_ROOT, 'registry.yaml'), path.join(sandbox, 'registry.yaml'));
      const r = scaffold(['zz-reg-fx', '--desc', DESC, '--register'], { SCAFFOLD_ROOT: sandbox });
      assert.equal(r.status, 0, `register 应过: ${r.stderr}`);
      assert.ok(fs.existsSync(path.join(sandbox, 'private', 'zz-reg-fx', 'SKILL.md')),
        '包应落在沙箱 private/');
      const reg = fs.readFileSync(path.join(sandbox, 'registry.yaml'), 'utf8');
      const entIdx = reg.indexOf('- name: zz-reg-fx');
      assert.ok(entIdx > 0, '条目应已登记');
      const bannerIdx = reg.indexOf('候审区');
      assert.ok(bannerIdx > 0 && entIdx < bannerIdx,
        '条目须插在 candidates 横幅之前（private 段内）——复刻插位曾咬过 lite 解析');
      assert.match(reg, /- name: zz-reg-fx\n {4}path: private\/zz-reg-fx\n {4}enabled: true\n {4}note: "[^"]+"\n {4}deploy:\n {6}claude: true/,
        '条目 schema 序位应与 upsert 正典一致');
    }
  } finally {
    for (const d of cleanups) fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  }
}
