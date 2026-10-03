// tests/unit/test-distill-index.test.mjs
// 单元测试: private/ming-distiller/scripts/check-index.mjs
// 覆盖: INDEX<->条目<->frontmatter 三方对账（含 revision/updatedAt 双写漂移）/
//       _proposals frontmatter 格式门（status/type 闭集、id==文件名、reviewAfter 超期）/
//       INDEX 缺席 graceful 跳过 / --strict 提升 W
// fixture 全在 os.tmpdir 下临时生成（MING_DISTILL_DIR 注入），不触仓库真 distill/。

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SCRIPT = path.resolve(import.meta.dirname, '../../private/ming-distiller/scripts/check-index.mjs');

let tmpRoot;
function mkLib() {
  const dir = path.join(tmpRoot, `lib-${Math.random().toString(36).slice(2, 8)}`);
  fs.mkdirSync(path.join(dir, 'proj'), { recursive: true });
  fs.mkdirSync(path.join(dir, '_proposals'), { recursive: true });
  return dir;
}
const runCheck = (dir, extra = []) =>
  spawnSync(process.execPath, [SCRIPT, ...extra], {
    encoding: 'utf8', timeout: 30000,
    env: { ...process.env, MING_DISTILL_DIR: dir },
  });
const ENTRY_FM = (id, rev = 1, ua = '2026-10-02') =>
  `---\nid: ${id}\nproject: proj\naxis: [arch]\ntags: [x]\nrevision: ${rev}\nupdatedAt: ${ua}\nstatus: active\nscope: project-only\n---\n\n正文。\n`;
const IDX_ROW = (id, rev = 1, ua = '2026-10-02') =>
  `  - id: ${id}\n    project: proj\n    path: distill/proj/${id}.md\n    axis: [arch]\n    tags: [x]\n    summary: 测试摘要。\n    revision: ${rev}\n    updatedAt: ${ua}\n    status: active\n    scope: project-only\n`;
const writeIndex = (dir, rows) =>
  fs.writeFileSync(path.join(dir, 'INDEX.yaml'), `schemaVersion: "1.0"\nentries:\n${rows}`, 'utf8');
const writeEntry = (dir, id, text) => fs.writeFileSync(path.join(dir, 'proj', `${id}.md`), text, 'utf8');
const writeProp = (dir, name, text) => fs.writeFileSync(path.join(dir, '_proposals', name), text, 'utf8');
const issuesOf = (r, level, frag) => r.stdout.split('\n').some(l => l.startsWith(`[${level}]`) && l.includes(frag));

export function run() {
  console.log('[TEST UNIT] check-index.mjs...');
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'distill-index-'));
  try {
    // 1. 最小合法库 → exit 0 零 findings
    let lib = mkLib();
    writeEntry(lib, '2026-10-02-ok-entry', ENTRY_FM('2026-10-02-ok-entry'));
    writeIndex(lib, IDX_ROW('2026-10-02-ok-entry'));
    let r = runCheck(lib);
    assert.equal(r.status, 0, `合法库应零 findings: ${r.stdout}`);
    assert.ok(r.stdout.includes('E=0 W=0'), '合法库应零 findings');

    // 2. 回归：INDEX revision 落后于条目 frontmatter → W 漂移（2026-10 审计实证盲区）
    lib = mkLib();
    writeEntry(lib, '2026-10-02-drift-entry', ENTRY_FM('2026-10-02-drift-entry', 4));
    writeIndex(lib, IDX_ROW('2026-10-02-drift-entry', 2));
    r = runCheck(lib);
    assert.equal(r.status, 0, 'W 不阻断（非 --strict）');
    assert.ok(issuesOf(r, 'W', 'revision 双写漂移'), 'INDEX rev 落后应报 W');

    // 3. 回归：_proposals 无 frontmatter → E（散文式 status 行不再算数）
    lib = mkLib();
    writeIndex(lib, '');
    writeProp(lib, '2026-09-29-no-fm.md', '# 提案：裸文\n\n状态：候审\n');
    r = runCheck(lib);
    assert.equal(r.status, 1, '提案缺 frontmatter 应 E 阻断');
    assert.ok(issuesOf(r, 'E', '无 frontmatter'), '应报无 frontmatter');

    // 4. 回归：提案 status/type 越出闭集 → E
    lib = mkLib();
    writeIndex(lib, '');
    writeProp(lib, '2026-09-20-wild-status.md',
      '---\nid: 2026-09-20-wild-status\ntarget: x/\ntype: package-iteration\nstatus: P1-landed\nopenedAt: 2026-09-20\n---\n\n正文。\n');
    r = runCheck(lib);
    assert.equal(r.status, 1);
    assert.ok(issuesOf(r, 'E', 'status 越出闭集'), 'P1-landed 类野生 status 应报 E');
    writeProp(lib, '2026-09-20-wild-status.md',
      '---\nid: 2026-09-20-wild-status\ntarget: x/\ntype: package-candidate\nstatus: pending\nopenedAt: 2026-09-20\n---\n\n正文。\n');
    r = runCheck(lib);
    assert.ok(issuesOf(r, 'E', 'type 越出闭集'), 'package-candidate 类野生 type 应报 E');

    // 5. 回归：pending + reviewAfter 超期 → W 提醒；landed 不报
    lib = mkLib();
    writeIndex(lib, '');
    writeProp(lib, '2026-09-20-old-pending.md',
      '---\nid: 2026-09-20-old-pending\ntarget: x/\ntype: new-package\nstatus: pending\nopenedAt: 2026-09-20\nreviewAfter: 2026-09-25\n---\n\n正文。\n');
    r = runCheck(lib);
    assert.equal(r.status, 0, 'W 不阻断');
    assert.ok(issuesOf(r, 'W', '候审超期'), '超期 pending 应报 W');
    writeProp(lib, '2026-09-20-old-pending.md',
      '---\nid: 2026-09-20-old-pending\ntarget: x/\ntype: new-package\nstatus: landed\nopenedAt: 2026-09-20\nreviewAfter: 2026-09-25\n---\n\n正文。\n');
    r = runCheck(lib);
    assert.ok(!issuesOf(r, 'W', '候审超期'), 'landed 不应再报超期');

    // 6. 提案 frontmatter id 与文件名不一致 → E
    lib = mkLib();
    writeIndex(lib, '');
    writeProp(lib, '2026-09-20-right-name.md',
      '---\nid: 2026-09-20-wrong-id\ntarget: x/\ntype: new-package\nstatus: pending\nopenedAt: 2026-09-20\n---\n\n正文。\n');
    r = runCheck(lib);
    assert.equal(r.status, 1);
    assert.ok(issuesOf(r, 'E', 'id 与文件名不一致'), 'id!=文件名应报 E');

    // 7. INDEX 缺席 → graceful 跳过 exit 0
    lib = fs.mkdtempSync(path.join(tmpRoot, 'empty-'));
    r = runCheck(lib);
    assert.equal(r.status, 0);
    assert.ok(r.stdout.includes('跳过校验'), 'INDEX 缺席应 graceful 跳过');

    // 8. --strict 提升 W → exit 1
    lib = mkLib();
    writeEntry(lib, '2026-10-02-drift2', ENTRY_FM('2026-10-02-drift2', 4));
    writeIndex(lib, IDX_ROW('2026-10-02-drift2', 2));
    r = runCheck(lib, ['--strict']);
    assert.equal(r.status, 1, '--strict 下 W 应阻断');

    // 9. --report 候审浮出：pending 在前按到期升序、landed 殿后、恒 exit 0、INDEX 缺席亦可用
    lib = mkLib(); // 不写 INDEX.yaml——report 独立于主校验
    writeProp(lib, '2026-09-20-overdue.md',
      '---\nid: 2026-09-20-overdue\ntarget: x/\ntype: new-package\nstatus: pending\nopenedAt: 2026-09-20\nreviewAfter: 2026-09-25\n---\n\n正文。\n');
    writeProp(lib, '2026-10-01-future.md',
      '---\nid: 2026-10-01-future\ntarget: x/\ntype: new-package\nstatus: pending\nopenedAt: 2026-10-01\nreviewAfter: 2099-01-01\n---\n\n正文。\n');
    writeProp(lib, '2026-09-10-done.md',
      '---\nid: 2026-09-10-done\ntarget: x/\ntype: new-package\nstatus: landed\nopenedAt: 2026-09-10\n---\n\n正文。\n');
    r = runCheck(lib, ['--report']);
    assert.equal(r.status, 0, '--report 非门禁恒 exit 0');
    const qIdx = r.stdout.indexOf('proposal queue');
    const iOver = r.stdout.indexOf('2026-09-20-overdue');
    const iFut = r.stdout.indexOf('2026-10-01-future');
    const iDone = r.stdout.indexOf('2026-09-10-done');
    assert.ok(qIdx >= 0 && iOver > qIdx && iFut > iOver && iDone > iFut,
      `pending 应按到期升序、landed 殿后:\n${r.stdout}`);
    assert.ok(r.stdout.includes('overdue'), '超期件应标 overdue');
    assert.ok(/queue: total=3 pending=2/.test(r.stdout), '应输出队列合计');

    console.log('  distill-index 契约断言全过');
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  }
}
