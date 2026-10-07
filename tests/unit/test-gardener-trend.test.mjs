// tests/unit/test-gardener-trend.test.mjs
// gardener-trend 探针契约: 序列抽取/新高检测/absence 语义/严格档/参数缺陷 fail-closed
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { readEvents, extractSeries, analyzeSeries, analyze } from '../../scripts/gardener-trend.mjs';

export function run() {
  const ROOT = path.resolve(import.meta.dirname, '../..');
  const CLI = path.join(ROOT, 'scripts', 'gardener-trend.mjs');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gardener-'));
  const write = (name, lines) => { const f = path.join(tmp, name); fs.writeFileSync(f, lines.join('\n'), 'utf8'); return f; };
  const ev = (event, fields) => JSON.stringify({ schema_version: '1.0', event, ok: true, at: '2026-10-07T00:00:00Z', ...fields });

  // --- 序列抽取 ---
  {
    const f = write('basic.jsonl', [
      ev('lint.checked', { warn_count: 1, error_count: 0 }),
      ev('sync.completed', { linked_count: 3 }),
      ev('lint.checked', { warn_count: 2, error_count: 0 }),
      'not json {{{',
    ]);
    const { events, malformed, missing } = readEvents(f);
    assert.equal(events.length, 3); assert.equal(malformed, 1); assert.equal(missing, false);
    const pts = extractSeries(events, 'lint.checked', 'warn_count');
    assert.deepEqual(pts.map(p => p.value), [1, 2]);
    console.log('  [ok] 序列抽取+畸形行容错');
  }

  // --- 新高检测三态 ---
  {
    assert.equal(analyzeSeries([{ value: 1 }, { value: 3 }], 8).status, 'new-high');
    assert.equal(analyzeSeries([{ value: 3 }, { value: 1 }], 8).status, 'flat');
    assert.equal(analyzeSeries([{ value: 2 }, { value: 2 }], 8).status, 'flat');
    assert.equal(analyzeSeries([{ value: 9 }], 8).status, 'baseline');
    assert.equal(analyzeSeries([], 8).status, 'absence');
    // window 截断: 老高点滚出窗后不再压线
    const pts = [{ value: 99 }, { value: 1 }, { value: 2 }];
    assert.equal(analyzeSeries(pts, 2).status, 'new-high'); // 窗=[1,2]
    console.log('  [ok] 新高/flat/baseline/absence + window 截断');
  }

  // --- analyze 全序列表 ---
  {
    const events = [
      JSON.parse(ev('lint.checked', { warn_count: 5, error_count: 0 })),
      JSON.parse(ev('lint.checked', { warn_count: 5, error_count: 0 })),
      JSON.parse(ev('test.suite_finished', { failed_suites: 0 })),
      JSON.parse(ev('test.suite_finished', { failed_suites: 1 })),
    ];
    const r = analyze(events, { window: 8 });
    const by = Object.fromEntries(r.map(x => [x.label, x.status]));
    assert.equal(by['lint.warn'], 'flat');      // 5→5 无新高
    assert.equal(by['test.failed'], 'new-high'); // 0→1 新高
    assert.equal(by['test.skipped'], 'absence');
    console.log('  [ok] analyze 多序列分判');
  }

  // --- CLI: 缺席文件 absence 报告 exit 0 ---
  {
    const out = execFileSync('node', [CLI, '--event-file', path.join(tmp, 'nope.jsonl')], { encoding: 'utf8' });
    assert.match(out, /absence/);
    console.log('  [ok] 缺席文件 absence 报告 exit 0');
  }

  // --- CLI: --strict 新高 exit 1, 平 exit 0 ---
  {
    const f = write('rising.jsonl', [
      ev('lint.checked', { warn_count: 1, error_count: 0 }),
      ev('lint.checked', { warn_count: 4, error_count: 0 }),
    ]);
    let code = 0;
    try { execFileSync('node', [CLI, '--event-file', f, '--strict'], { encoding: 'utf8' }); }
    catch (e) { code = e.status; }
    assert.equal(code, 1);
    const f2 = write('flat.jsonl', [
      ev('lint.checked', { warn_count: 3, error_count: 0 }),
      ev('lint.checked', { warn_count: 3, error_count: 0 }),
    ]);
    const out = execFileSync('node', [CLI, '--event-file', f2, '--strict'], { encoding: 'utf8' });
    assert.match(out, /flat/);
    console.log('  [ok] --strict 新高 exit 1 / 平 exit 0');
  }

  // --- CLI 参数缺陷 fail-closed ---
  {
    for (const args of [['--window', 'x'], ['--window', '1'], ['--bogus']]) {
      let code = 0;
      try { execFileSync('node', [CLI, ...args], { encoding: 'utf8', stdio: 'pipe' }); }
      catch (e) { code = e.status; }
      assert.equal(code, 2, `参数缺陷 ${args} 应 exit 2`);
    }
    console.log('  [ok] 参数缺陷 fail-closed');
  }

  console.log('gardener-trend 契约断言全过');

}
