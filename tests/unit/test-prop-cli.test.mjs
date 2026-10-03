// tests/unit/test-prop-cli.test.mjs
// 单元测试: private/ming-distiller/scripts/prop.mjs（L1 提案结构化原语）
//       + scripts/lib/proposal-schema.mjs（共享词表/门函数——直接导入断言）
// 覆盖: new 模板落盘+幂等拒写+写时门 / check 门与 check-index 判级同源 /
//       report 候审排序 / register QUEUE.yaml 投影生成+幂等 noop
// fixture 全在 os.tmpdir 下临时生成（MING_DISTILL_DIR 注入），不触仓库真 distill/。

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gateProposal, parseFmText, PROP_TYPES } from '../../private/ming-distiller/scripts/lib/proposal-schema.mjs';

const SCRIPT = path.resolve(import.meta.dirname, '../../private/ming-distiller/scripts/prop.mjs');
const CHECK_SCRIPT = path.resolve(import.meta.dirname, '../../private/ming-distiller/scripts/check-index.mjs');

let tmpRoot;
function mkLib() {
  const dir = path.join(tmpRoot, `lib-${Math.random().toString(36).slice(2, 8)}`);
  fs.mkdirSync(path.join(dir, '_proposals'), { recursive: true });
  return dir;
}
const runProp = (dir, argv) =>
  spawnSync(process.execPath, [SCRIPT, ...argv], {
    encoding: 'utf8', timeout: 30000,
    env: { ...process.env, MING_DISTILL_DIR: dir },
  });
const writeProp = (dir, name, text) => fs.writeFileSync(path.join(dir, '_proposals', name), text, 'utf8');
const PROP_FM = (id, status = 'pending', extra = '') =>
  `---\nid: ${id}\ntarget: x/\ntype: new-package\nstatus: ${status}\nopenedAt: 2026-09-20\n${extra}---\n\n正文。\n`;

export function run() {
  console.log('[TEST UNIT] prop.mjs...');
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prop-cli-'));
  try {
    // 1. new --dry-run：预览不落盘
    let lib = mkLib();
    let r = runProp(lib, ['new', 'my-proposal', '--type', 'new-package', '--target', 'x/', '--dry-run']);
    assert.equal(r.status, 0, `dry-run 应 exit 0: ${r.stderr}`);
    assert.ok(r.stdout.includes('[dry-run]'), '应出 dry-run 预览');
    assert.equal(fs.readdirSync(path.join(lib, '_proposals')).length, 0, 'dry-run 不落盘');

    // 2. new 实写：契约 fm 齐全 + 门校验放行
    r = runProp(lib, ['new', 'my-proposal', '--type', 'new-package', '--target', 'x/', '--opened-at', '2026-10-03']);
    assert.equal(r.status, 0, `new 应 exit 0: ${r.stderr}`);
    const fpath = path.join(lib, '_proposals', '2026-10-03-my-proposal.md');
    assert.ok(fs.existsSync(fpath), '应落盘 2026-10-03-my-proposal.md');
    const text = fs.readFileSync(fpath, 'utf8');
    assert.ok(text.includes('id: 2026-10-03-my-proposal'), 'id==文件名');
    assert.ok(text.includes('status: pending'), '初态 pending');
    assert.ok(/reviewAfter: \d{4}-\d{2}-\d{2}/.test(text), '默认 P30D 解析为日期');
    assert.ok(text.includes('## 修订记录'), '骨架含修订记录节');

    // 3. new 幂等：同 slug 重跑拒写 exit 1
    r = runProp(lib, ['new', 'my-proposal', '--type', 'new-package', '--target', 'x/', '--opened-at', '2026-10-03']);
    assert.equal(r.status, 1, '同 slug 重跑应拒写');
    assert.ok(r.stderr.includes('幂等拒写'), '应说明幂等拒写');

    // 4. new 参数门：坏 slug / 越词表 type / 缺 target → exit 2
    lib = mkLib();
    for (const [argv, frag] of [
      [['new', 'Bad_Slug', '--type', 'promotion', '--target', 'x/'], 'kebab'],
      [['new', 'ok-slug', '--type', 'wild-type', '--target', 'x/'], 'type 越出闭集'],
      [['new', 'ok-slug', '--type', 'promotion'], '缺 --target'],
      [['new', 'ok-slug', '--type', 'promotion', '--target', 'x/', '--review-after', 'not-a-date'], '非 <YYYY-MM-DD|PnD>'],
    ]) {
      const rr = runProp(lib, argv);
      assert.equal(rr.status, 2, `${argv.join(' ')} 应 exit 2`);
      assert.ok(rr.stderr.includes(frag), `${argv.join(' ')} 应含 "${frag}": ${rr.stderr}`);
    }

    // 5. check：干净库 E=0；野生 status E=1——与 check-index 判级同源
    lib = mkLib();
    writeProp(lib, '2026-09-20-ok.md', PROP_FM('2026-09-20-ok'));
    r = runProp(lib, ['check']);
    assert.equal(r.status, 0, `干净库应 E=0: ${r.stdout}`);
    writeProp(lib, '2026-09-20-wild.md', PROP_FM('2026-09-20-wild', 'P1-landed'));
    r = runProp(lib, ['check']);
    assert.equal(r.status, 1, '野生 status 应 E 阻断');
    assert.ok(r.stdout.includes('status 越出闭集'), '应报 status 越出闭集');
    // 判级同源断言：check-index 对同 fixture 报同句（INDEX 需在场否则其短路跳过）
    fs.writeFileSync(path.join(lib, 'INDEX.yaml'), 'schemaVersion: "1.0"\nentries:\n', 'utf8');
    const rc = spawnSync(process.execPath, [CHECK_SCRIPT, '--json'], {
      encoding: 'utf8', timeout: 30000, env: { ...process.env, MING_DISTILL_DIR: lib } });
    const ciErrs = JSON.parse(rc.stdout).issues.filter(i => i.level === 'E').map(i => i.msg);
    assert.ok(ciErrs.some(m => m.includes('status 越出闭集')), 'check-index 应报同一违例（lib 同源）');

    // 6. report：pending 到期升序 + landed 殿后 + 恒 exit 0
    lib = mkLib();
    writeProp(lib, '2026-09-20-overdue.md', PROP_FM('2026-09-20-overdue', 'pending', 'reviewAfter: 2026-09-25\n'));
    writeProp(lib, '2026-10-01-future.md', PROP_FM('2026-10-01-future', 'pending', 'reviewAfter: 2099-01-01\n'));
    writeProp(lib, '2026-09-10-done.md', PROP_FM('2026-09-10-done', 'landed'));
    r = runProp(lib, ['report']);
    assert.equal(r.status, 0);
    const iOver = r.stdout.indexOf('2026-09-20-overdue');
    const iFut = r.stdout.indexOf('2026-10-01-future');
    const iDone = r.stdout.indexOf('2026-09-10-done');
    assert.ok(iOver >= 0 && iFut > iOver && iDone > iFut, 'pending 到期升序、landed 殿后');
    assert.ok(/total=3 pending=2/.test(r.stdout), '队列合计正确');

    // 7. register：dry-run 不落盘 → 实写 QUEUE.yaml → 重跑幂等 noop
    lib = mkLib();
    writeProp(lib, '2026-09-20-a.md', PROP_FM('2026-09-20-a', 'pending', 'reviewAfter: 2099-01-01\n'));
    writeProp(lib, '2026-09-21-b.md', PROP_FM('2026-09-21-b', 'landed'));
    r = runProp(lib, ['register', '--dry-run']);
    assert.equal(r.status, 0);
    assert.ok(!fs.existsSync(path.join(lib, '_proposals', 'QUEUE.yaml')), 'dry-run 不落盘');
    r = runProp(lib, ['register']);
    assert.equal(r.status, 0);
    const q = fs.readFileSync(path.join(lib, '_proposals', 'QUEUE.yaml'), 'utf8');
    assert.ok(q.includes('generated: prop-register'), '投影带生成标记');
    assert.ok(q.includes('- id: 2026-09-20-a'), '投影含条目');
    assert.ok(/pending: 1\ntotal: 2/.test(q), '投影合计正确');
    r = runProp(lib, ['register']);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('幂等 noop'), '无变化应幂等 noop');
    // 条目变更 → 重跑再写（非 noop）
    writeProp(lib, '2026-09-22-c.md', PROP_FM('2026-09-22-c', 'rejected'));
    r = runProp(lib, ['register']);
    assert.ok(!r.stdout.includes('noop'), '条目变更应再写');
    assert.ok(fs.readFileSync(path.join(lib, '_proposals', 'QUEUE.yaml'), 'utf8').includes('total: 3'));

    // 8. 未知 flag / 未知动词 → exit 2（fail-closed 同全仓 CLI 契约）
    r = runProp(lib, ['check', '--bogus']);
    assert.equal(r.status, 2);
    r = runProp(lib, ['frobnicate']);
    assert.equal(r.status, 2);

    // 9. docclass.yaml 配置面（L4）：states 子集收窄改变判决
    lib = mkLib();
    writeProp(lib, '2026-09-20-rejected-one.md', PROP_FM('2026-09-20-rejected-one', 'rejected'));
    r = runProp(lib, ['check']);
    assert.equal(r.status, 0, '默认词表下 rejected 合法');
    fs.writeFileSync(path.join(lib, 'docclass.yaml'),
      'schemaVersion: 1\ndocClasses:\n  - name: proposal\n    states:\n      - pending\n      - landed\n', 'utf8');
    r = runProp(lib, ['check']);
    assert.equal(r.status, 1, 'config states 子集收窄后 rejected 应越出闭集');
    assert.ok(r.stdout.includes('status 越出闭集: rejected（pending|landed）'), `配置子集应驱动闭集判词: ${r.stdout}`);

    // 10. 配置 fail-closed：非法 states 值 / 畸形 YAML → check 计 E；写动词 exit 2
    lib = mkLib();
    fs.writeFileSync(path.join(lib, 'docclass.yaml'),
      'schemaVersion: 1\ndocClasses:\n  - name: proposal\n    states:\n      - pending\n      - draft\n', 'utf8');
    r = runProp(lib, ['check']);
    assert.equal(r.status, 1);
    assert.ok(r.stdout.includes('含非法值 draft'), `非法子集值应 fail-closed: ${r.stdout}`);
    r = runProp(lib, ['new', 'x', '--type', 'promotion', '--target', 'x/']);
    assert.equal(r.status, 2, '配置违例时写动词应 fail-closed');
    assert.ok(r.stderr.includes('含非法值 draft'), '应点名非法值');
    fs.writeFileSync(path.join(lib, 'docclass.yaml'), 'docClasses: [', 'utf8');
    r = runProp(lib, ['check']);
    assert.equal(r.status, 1, '畸形 YAML 应计 E');
    assert.ok(r.stdout.includes('解析失败') || r.stdout.includes('缺 docClasses'), '应报解析失败');

    // 11. idScheme 未实现值 → new fail-closed（防静默错号）
    lib = mkLib();
    fs.writeFileSync(path.join(lib, 'docclass.yaml'),
      'schemaVersion: 1\ndocClasses:\n  - name: proposal\n    idScheme: PROP-NNNN\n', 'utf8');
    r = runProp(lib, ['new', 'x', '--type', 'promotion', '--target', 'x/']);
    assert.equal(r.status, 2);
    assert.ok(r.stderr.includes('idScheme=PROP-NNNN'), `未实现 idScheme 应点名: ${r.stderr}`);
    // states 子集缺 pending → new 自产件必违规，fail-closed 不落地
    fs.writeFileSync(path.join(lib, 'docclass.yaml'),
      'schemaVersion: 1\ndocClasses:\n  - name: proposal\n    states:\n      - landed\n', 'utf8');
    r = runProp(lib, ['new', 'x', '--type', 'promotion', '--target', 'x/']);
    assert.equal(r.status, 2, 'states 缺 pending 时 new 应拒建');
    assert.ok(r.stderr.includes('缺 pending'), '应点名缺 pending');

    // 12. agingDays 配置驱动 new 默认 reviewAfter
    lib = mkLib();
    fs.writeFileSync(path.join(lib, 'docclass.yaml'),
      'schemaVersion: 1\ndocClasses:\n  - name: proposal\n    agingDays: 7\n', 'utf8');
    r = runProp(lib, ['new', 'quick', '--type', 'promotion', '--target', 'x/', '--opened-at', '2026-10-01']);
    assert.equal(r.status, 0, `agingDays 配置下 new 应成功: ${r.stderr}`);
    const qt = fs.readFileSync(path.join(lib, '_proposals', '2026-10-01-quick.md'), 'utf8');
    assert.ok(qt.includes('reviewAfter: 2026-10-08'), 'agingDays=7 应生成 openedAt+7d');

    // 13. lib 直测：gateProposal/parseFmText 单元面（词表+aging 边界）
    const fmWild = parseFmText(PROP_FM('x', 'wild-status'));
    const gi = gateProposal('_proposals/x.md', 'x', fmWild, '2026-10-03');
    assert.ok(gi.some(i => i.level === 'E' && i.msg.includes('status 越出闭集')), 'lib 门直测: 野生 status 应 E');
    const fmOk = parseFmText(PROP_FM('x', 'pending', 'reviewAfter: 2026-09-01\n'));
    const gi2 = gateProposal('_proposals/x.md', 'x', fmOk, '2026-10-03');
    assert.ok(gi2.some(i => i.level === 'W' && i.msg.includes('候审超期')), 'lib 门直测: 超期 pending 应 W');
    const gi3 = gateProposal('_proposals/x.md', 'x', fmOk, '2026-08-01');
    assert.ok(!gi3.length, 'lib 门直测: 未到期 pending 零违例');
    assert.ok(PROP_TYPES.has('policy-decision'), '词表含 policy-decision');
    assert.ok(!parseFmText('无 frontmatter 正文'), '无 fm 应 null');

    console.log('  prop CLI 断言全过');
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  }
}
