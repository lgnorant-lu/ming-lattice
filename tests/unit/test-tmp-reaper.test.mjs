// test-tmp-reaper.test.mjs — tmp-reaper.mjs 收割契约测试
// 断言面（substrate reaper 先例形态）：
//   transit 前缀判别 / mtime 龄阈 / transit-vs-cache 分档 / dry-run 不删 /
//   目录整体收割 / 非匹配名不碰 / 缺席 root noop / 预算截断 / CLI kill-switch

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { reapOnce, DEFAULT_RULES } from '../../scripts/lib/tmp-reaper.mjs';

const tmpBase = process.env.SKILLS_TEST_TMPDIR || os.tmpdir();
const CLEAN_TEMP = path.resolve(import.meta.dirname, '../../scripts/clean-temp.mjs');

const DAY = 24 * 3600_000;
const ago = (ms) => new Date(Date.now() - ms);
const age = (f, ms) => fs.utimesSync(f, ago(ms), ago(ms));

function seed(dir) {
  const mk = (name, msAgo, isDir = false) => {
    const p = path.join(dir, name);
    if (isDir) { fs.mkdirSync(p, { recursive: true }); fs.writeFileSync(path.join(p, 'inner.txt'), 'x'); }
    else fs.writeFileSync(p, 'x');
    age(p, msAgo);
    return p;
  };
  return {
    transitOld:   mk('skc-mb-facts-1.jsonl', 2 * DAY),          // reap
    transitYoung: mk('skc-mb-spec-2.json', 1 * 3600_000),       // keep young
    legacyOld:    mk('mb-facts-99.jsonl', 2 * DAY),             // reap（遗留域）
    cacheYoung:   mk('mb-node-types-rust-aaa.json', 2 * DAY),   // keep（cache 30d 档）
    cacheOld:     mk('mb-node-types-go-bbb.json', 40 * DAY),    // reap（超 cache 龄）
    dirOld:       mk('skc-ming-cli-stale', 2 * DAY, true),      // reap 整目录
    foreign:      mk('other-tool-tmp.txt', 60 * DAY),           // keep（非命名域）
  };
}

export function run() {
  const tmp = fs.mkdtempSync(path.join(tmpBase, 'skc-test-reaper-'));
  try {
    // 1. dry-run：报告 reapable 但一字不删
    {
      const dir = path.join(tmp, 'd1'); fs.mkdirSync(dir);
      const f = seed(dir);
      const rep = reapOnce({ root: dir, apply: false });
      assert.equal(rep.matched, 6, '六个命名域命中');
      assert.equal(rep.reapable, 4, 'transit-old+legacy+cache-old+dir = 4 可收');
      assert.equal(rep.keptYoung, 2, 'young+cache-young 保留');
      assert.ok(fs.existsSync(f.transitOld) && fs.existsSync(f.dirOld),
        'dry-run 不得删');
      console.log('  -> dry-run 判别面 passed');
    }

    // 2. apply：该删的删、该留的留
    {
      const dir = path.join(tmp, 'd2'); fs.mkdirSync(dir);
      const f = seed(dir);
      const rep = reapOnce({ root: dir, apply: true });
      assert.equal(rep.deleted, 4);
      assert.equal(rep.errors.length, 0);
      assert.ok(!fs.existsSync(f.transitOld), 'transit 超龄已删');
      assert.ok(!fs.existsSync(f.legacyOld), '遗留 mb-* 已删');
      assert.ok(!fs.existsSync(f.cacheOld), 'cache 超 30d 已删');
      assert.ok(!fs.existsSync(f.dirOld), '命名域目录整体已删');
      assert.ok(fs.existsSync(f.transitYoung), '未超龄保留');
      assert.ok(fs.existsSync(f.cacheYoung), 'cache 档内保留');
      assert.ok(fs.existsSync(f.foreign), '非命名域不碰');
      console.log('  -> apply transit/cache/目录判别 passed');
    }

    // 3. 缺席 root = noop 不抛不报错
    {
      const rep = reapOnce({ root: path.join(tmp, 'nonexist'), apply: true });
      assert.equal(rep.scanned, 0);
      assert.equal(rep.errors.length, 0);
      console.log('  -> 缺席 noop passed');
    }

    // 4. 预算截断：budget=0 时不得扫完全集
    {
      const dir = path.join(tmp, 'd4'); fs.mkdirSync(dir);
      for (let i = 0; i < 20; i++) {
        const p = path.join(dir, `skc-f-${i}.txt`);
        fs.writeFileSync(p, 'x'); age(p, 2 * DAY);
      }
      // budgetMs=-1：首轮预算检查即截断（budget=0 在 ms 粒度下有竞态——
      // 全集可能同一毫秒内扫完导致不截断，-1 确定性触发早退语义）
      const rep = reapOnce({ root: dir, apply: true, budgetMs: -1 });
      assert.equal(rep.truncated, true, '预算耗尽应标 truncated');
      assert.equal(rep.scanned, 0, '预算即竭应零扫描');
      console.log('  -> 预算截断 passed');
    }

    // 5. CLI：dry-run 默认 / --apply 真删 / SKC_REAP_OFF kill-switch
    {
      const dir = path.join(tmp, 'd5'); fs.mkdirSync(dir);
      const f = seed(dir);
      let r = spawnSync(process.execPath, [CLEAN_TEMP, '--root', dir],
        { encoding: 'utf8', timeout: 30_000 });
      assert.equal(r.status, 0, `dry-run exit: ${r.stderr}`);
      assert.ok(r.stdout.includes('dry-run'), '默认 dry-run');
      assert.ok(fs.existsSync(f.transitOld), 'CLI dry-run 不删');

      r = spawnSync(process.execPath, [CLEAN_TEMP, '--root', dir, '--apply', '--json'],
        { encoding: 'utf8', timeout: 30_000 });
      assert.equal(r.status, 0, `apply exit: ${r.stderr}`);
      const rep = JSON.parse(r.stdout);
      assert.equal(rep.deleted, 4);
      assert.ok(!fs.existsSync(f.transitOld), 'CLI apply 真删');

      const f2 = seed(dir); // 重置同形态
      r = spawnSync(process.execPath, [CLEAN_TEMP, '--root', dir, '--apply'],
        { encoding: 'utf8', timeout: 30_000, env: { ...process.env, SKC_REAP_OFF: '1' } });
      assert.equal(r.status, 0);
      assert.ok(fs.existsSync(f2.transitOld), 'SKC_REAP_OFF=1 不得删');
      console.log('  -> CLI dry-run/apply/kill-switch passed');
    }

    console.log('  tmp-reaper 契约断言全过');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  }
}
