import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { route } from '../../scripts/route-core.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const script = path.join(root, 'scripts/route-observer.mjs');
const schema = JSON.parse(fs.readFileSync(path.join(root, 'docs/schemas/route-observed.schema.json'), 'utf8'));

function spawnObserver({ input, args = [], env = {} }) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    input,
    encoding: 'utf8',
    timeout: 15000,
    env: { ...process.env, ...env }
  });
}

function readLedger(file) {
  return fs.readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse);
}

function assertBaseRecord(record) {
  for (const field of schema.required) assert.ok(Object.hasOwn(record, field), `missing ${field}`);
  assert.equal(record.v, schema.properties.v.const);
  assert.match(record.ts, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(typeof record.elapsed_ms, 'number');
  assert.ok(record.elapsed_ms >= 0);
}

export function run() {
  console.log('[TEST CONTRACT] route-observer Stage-0 passive ledger...');
  const temp = fs.mkdtempSync(path.join(process.env.SKILLS_TEST_TMPDIR || os.tmpdir(), 'ming-observer-'));
  try {
    const log = path.join(temp, 'route-observed.jsonl');
    const logEnv = { MING_SKILLS_OBSERVE_LOG: log };

    // 1) 标准 hook payload：stdout 恒空、exit 0、全量决策落账
    const payload = {
      hook_event_name: 'UserPromptSubmit',
      session_id: 'sess-abc123',
      transcript_path: 'C:/Users/x/.claude/projects/p/sess-abc123.jsonl',
      cwd: 'D:/proj',
      prompt: '帮我给这个 Go 函数写表驱动测试'
    };
    const run1 = spawnObserver({ input: JSON.stringify(payload), env: logEnv });
    assert.equal(run1.status, 0, run1.stderr);
    assert.equal(run1.stdout, '', 'observer stdout must stay empty (no injection)');
    assert.equal(run1.stderr, '', 'healthy run must not emit stderr');
    const [record] = readLedger(log);
    assertBaseRecord(record);
    assert.equal(record.session, 'sess-abc123');
    assert.equal(record.transcript, payload.transcript_path);
    assert.equal(record.cwd, 'D:/proj');
    assert.equal(record.hint, payload.prompt);
    assert.equal(record.hint_len, payload.prompt.length);
    assert.deepEqual(record.decision, route(payload.prompt), 'ledger must carry full Decide output');
    assert.equal(record.src, 'claude-hook');

    // 2) 全量决策：强判定 dispatch+high 也必须记（miss-log 不记——这是分母）
    const strong = { prompt: '为 Rust 编写性质测试 hypothesis' };
    const run2 = spawnObserver({ input: JSON.stringify(strong), env: logEnv });
    assert.equal(run2.status, 0);
    const records2 = readLedger(log);
    assert.equal(records2.length, 2);
    const expected = route(strong.prompt);
    if (expected.action === 'dispatch' && expected.confidence === 'high') {
      assert.equal(records2[1].decision.action, 'dispatch', 'strong dispatch must still be observed');
    }

    // 3) 损坏 stdin：exit 0、stdout 空、错误记录留痕（不静默吞）
    const run3 = spawnObserver({ input: 'this is {not json', env: logEnv });
    assert.equal(run3.status, 0);
    assert.equal(run3.stdout, '');
    const errRecord = readLedger(log)[2];
    assertBaseRecord(errRecord);
    assert.equal(errRecord.error, 'bad_stdin_json');
    assert.ok(errRecord.bytes > 0);
    assert.equal(Object.hasOwn(errRecord, 'decision'), false);

    // 4) 超长 hint：截断 1000 字符 + hint_len 记原始长度
    const longPrompt = '写测试 ' + 'x'.repeat(3000);
    const run4 = spawnObserver({ input: JSON.stringify({ prompt: longPrompt }), env: logEnv });
    assert.equal(run4.status, 0);
    const rec4 = readLedger(log)[3];
    assert.equal(rec4.hint.length, 1000);
    assert.equal(rec4.hint_len, longPrompt.length);

    // 5) 宽容字段提取：异名 payload（hint/session/transcript 别名）
    const alt = { hint: '审查一下这个改动', session: 'alt-sess', transcript: '/tmp/t.jsonl', workspace: 'D:/alt' };
    const run5 = spawnObserver({ input: JSON.stringify(alt), env: logEnv });
    assert.equal(run5.status, 0);
    const rec5 = readLedger(log)[4];
    assert.equal(rec5.hint, alt.hint);
    assert.equal(rec5.session, 'alt-sess');
    assert.equal(rec5.transcript, '/tmp/t.jsonl');
    assert.equal(rec5.cwd, 'D:/alt');

    // 6) env=off：台账行数不变，stdout 仍空
    const before = readLedger(log).length;
    const run6 = spawnObserver({ input: JSON.stringify(payload), env: { MING_SKILLS_OBSERVE_LOG: 'off' } });
    assert.equal(run6.status, 0);
    assert.equal(run6.stdout, '');
    assert.equal(readLedger(log).length, before, 'off must not append');

    // 7) 轮换：预置超 1MB 文件 -> 旧账进 .1，新文件只有本次一行
    const rotLog = path.join(temp, 'rot.jsonl');
    fs.writeFileSync(rotLog, `${'x'.repeat(1024 * 1024 + 1)}\n`);
    const run7 = spawnObserver({ input: JSON.stringify(payload), env: { MING_SKILLS_OBSERVE_LOG: rotLog } });
    assert.equal(run7.status, 0);
    assert.ok(fs.existsSync(`${rotLog}.1`), 'rotation must produce .1 generation');
    assert.equal(readLedger(rotLog).length, 1);
    const run7b = spawnObserver({ input: JSON.stringify(payload), env: { MING_SKILLS_OBSERVE_LOG: rotLog } });
    assert.equal(run7b.status, 0);
    assert.equal(readLedger(rotLog).length, 2, 'sub-threshold appends accumulate');

    // 8) 空 stdin + argv 冒烟入口（手动验证用）
    const run8 = spawnObserver({ input: '', args: ['看看', '协议'], env: logEnv });
    assert.equal(run8.status, 0);
    const rec8 = readLedger(log).at(-1);
    assert.equal(rec8.hint, '看看 协议');
    assert.equal(rec8.src, 'claude-hook');

    // 9) src 标识可换宿主（env 与 --src 双通道；--src 缺值不致命）
    const run9 = spawnObserver({ input: JSON.stringify(payload), env: { ...logEnv, MING_SKILLS_OBSERVE_SRC: 'other-hook' } });
    assert.equal(run9.status, 0);
    assert.equal(readLedger(log).at(-1).src, 'other-hook');
    const run9b = spawnObserver({ input: JSON.stringify(payload), args: ['--src', 'devin-hook'], env: logEnv });
    assert.equal(run9b.status, 0);
    assert.equal(readLedger(log).at(-1).src, 'devin-hook');
    const run9c = spawnObserver({ input: JSON.stringify(payload), args: ['--src'], env: logEnv });
    assert.equal(run9c.status, 0);
    assert.equal(readLedger(log).at(-1).src, 'claude-hook', 'missing --src value keeps default');

    console.log('  -> stdout-empty, exit-0, full-decision, truncation, rotation and adapter checks passed');
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

if (process.argv[1]?.endsWith('test-route-observer.mjs')) run();
