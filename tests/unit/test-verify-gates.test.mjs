// 单元测试: scripts/verify.mjs 门禁编排器 + 此前缺口件微断言
// 覆盖: profileSteps 步骤表完备性（门禁自身失聪面）/ runStep 传播 /
//   emit-operational-event stdin 契约 / secrets·pii·link-rot 门行为 fixture /
//   check-test-coverage 自洽（覆盖登记表自身无漏报）。
// fixture 不触仓外真实文件；网络类门只测纯函数提取面（离线断言）。

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const VERIFY = path.join(ROOT, 'scripts/verify.mjs');
const EMIT = path.join(ROOT, 'scripts/emit-operational-event.mjs');
const COVERAGE = path.join(ROOT, 'scripts/check-test-coverage.mjs');

const runNode = (args, opts = {}) =>
  spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 30000, ...opts });

export async function run() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-gates-'));
  try {
    // ---------- verify.mjs：profile 步骤表 = 门禁失聪的直接可测面 ----------
    const { profileSteps, runStep } = await import(pathToFileURL(VERIFY).href);

    const quick = profileSteps('quick');
    assert.equal(quick.length, 1, 'quick 应恰好一步');
    assert.ok(quick[0][1].includes('--profile'), 'quick 应调 tests/run --profile quick');

    const full = profileSteps('full');
    assert.equal(full.length, 3, 'full=套件+供应链+langs 派生对账三步');
    assert.ok(full[1][1].includes('--strict'), 'full 供应链须严格档');
    assert.ok(!full[1][1].includes('--check-freshness'), 'full 不含新鲜度比对');
    assert.ok(full[2][1].includes('--verify') &&
      full[2][1][0].includes('sync-langs'), 'full 末步为上游金数据离线对账');

    const rel = profileSteps('release');
    assert.equal(rel.length, 3, 'release=套件+供应链新鲜度+benchmark 三步');
    assert.ok(rel[1][1].includes('--check-freshness'), 'release 供应链须带新鲜度');
    assert.ok(rel[2][1].some(a => a.includes('route-performance')), 'release 末步是 benchmark');
    assert.equal(profileSteps('affected'), null, 'affected 走动态计划器不入静态表');
    assert.equal(profileSteps('bogus'), null, '未知 profile 返回 null');

    // runStep 传播：子进程非零 → false（且不因异常炸掉）
    assert.equal(runStep(process.execPath, ['-e', 'process.exit(0)'], {}, true), true);
    assert.equal(runStep(process.execPath, ['-e', 'process.exit(1)'], {}, true), false);
    assert.equal(runStep(process.execPath, ['-e', 'throw new Error("x")'], {}, true), false);

    // CLI 层：未知 flag/非法 profile → exit 2
    assert.equal(runNode([VERIFY, '--bogus']).status, 2, '未知旗标应 exit 2');
    assert.equal(runNode([VERIFY, '--profile', 'bogus']).status, 2, '非法 profile 应 exit 2');

    // ---------- emit-operational-event：stdin→NDJSON 追加契约 ----------
    const evFile = path.join(tmp, 'events.ndjson');
    const good = runNode([EMIT], {
      input: JSON.stringify({ event: 'lint.checked', ok: true,
        fields: { sources_checked: 3, error_count: 0 } }),
      env: { ...process.env, MING_SKILLS_EVENT_FILE: evFile },
    });
    assert.equal(good.status, 0, `合法事件应 exit 0: ${good.stderr}`);
    const lines = fs.readFileSync(evFile, 'utf8').trim().split('\n');
    assert.equal(lines.length, 1, '事件文件应恰好一行');
    const ev = JSON.parse(lines[0]);
    assert.equal(ev.event, 'lint.checked', 'event 名应透传');
    assert.equal(ev.sources_checked, 3, 'fields 应平铺进事件');
    assert.ok(ev.timestamp, '事件须带 timestamp 字段');

    // 未知事件名 → createOperationalEvent 抛 → exit 1（词表外事件 fail-closed）
    const unknown = runNode([EMIT], {
      input: JSON.stringify({ event: 'bogus.event' }),
      env: { ...process.env, MING_SKILLS_EVENT_FILE: evFile } });
    assert.equal(unknown.status, 1, '未知事件名应 exit 1');

    const bad = runNode([EMIT], { input: '{not json',
      env: { ...process.env, MING_SKILLS_EVENT_FILE: evFile } });
    assert.equal(bad.status, 1, '坏 JSON 应 exit 1');
    assert.equal(fs.readFileSync(evFile, 'utf8').trim().split('\n').length, 1,
      '坏输入不得追加事件行');

    // ---------- secrets 门行为 fixture（引擎之外此前无单件断言） ----------
    const { gate: secrets } = await import('../../scripts/hooks/gates/secrets.mjs');
    const mkCtx = (map) => ({
      root: tmp, files: [...map.keys()], gateConfig: {},
      read: (p) => map.get(p),
    });
    // fixture 密钥拆串组装——源文件不落完整指纹（secrets 门对测试文件同样生效，
    // 这正是门正常工作的证据；拆串让 fixture 存在而源码不含完整模式）
    const fakeAwsKey = ['AKIA', 'IOSFODNN7', 'EXAMPLE'].join('');
    let f = await secrets.run(mkCtx(new Map([
      ['config.txt', 'aws_key = "' + fakeAwsKey + '"'],   // L1 签名层命中
    ])));
    assert.ok(f.some(x => x.matchText?.includes('AKIA') || /AWS|Access/i.test(x.message || '')),
      'AWS 签名密钥应命中');
    // 密钥样本打码——finding 不得含完整密钥明文（脱敏红线）
    assert.ok(!f.some(x => JSON.stringify(x.message || '').includes(fakeAwsKey)),
      'message 不得泄漏密钥全文');

    f = await secrets.run(mkCtx(new Map([
      ['app.js', 'const api_key = "xxxxxxxxxxxxxxxx";\nconst token = "test-placeholder";'],
    ])));
    assert.equal(f.length, 0, `占位符/低熵值不应报: ${JSON.stringify(f)}`);

    f = await secrets.run(mkCtx(new Map([['id_rsa_deploy', '']])));
    assert.ok(f.some(x => /keyfile|私钥/.test(x.message || '')), '私钥文件名应 L0 命中');

    // ---------- pii 门行为 fixture ----------
    const { gate: pii } = await import('../../scripts/hooks/gates/pii.mjs');
    f = await pii.run(mkCtx(new Map([
      // 同上：家目录串拆拼，源码不落 `C:\Users\<名>` 整段
      ['doc.md', '日志见 ' + ['C:\\Users', 'zhangsan', 'prod'].join('\\') + '\\out.txt'],
    ])));
    assert.ok(f.some(x => x.level === 'error'), 'Windows 家目录真名路径应 error');
    f = await pii.run(mkCtx(new Map([
      ['doc.md', String.raw`示例 C:\Users\test\out.txt（fixture 白名单名）`],
    ])));
    assert.equal(f.length, 0, 'fixture 白名单名不应误报');

    // ---------- link-rot 纯函数面（离线）：URL 提取剥尾标点 ----------
    const { extractLinks } = await import('../../scripts/hooks/gates/link-rot.mjs');
    const links = extractLinks('见 https://a.com/x). 与 https://b.com/y, 尾 https://c.com/z*.');
    const urls = links.map(l => l.url);
    assert.ok(urls.includes('https://a.com/x'), `尾 ) 应剥除: ${urls}`);
    assert.ok(urls.includes('https://b.com/y'), '尾 , 应剥除');
    assert.ok(urls.includes('https://c.com/z'), '尾 *. 应剥除');
    assert.ok(!extractLinks('无链接文本').length, '无 URL 应为空集');

    // ---------- check-test-coverage 自洽：登记表自身输出必须 ok ----------
    const cov = runNode([COVERAGE, '--json']);
    assert.equal(cov.status, 0, `覆盖登记应零缺口: ${cov.stderr}`);
    const covJ = JSON.parse(cov.stdout);
    assert.equal(covJ.ok, true);
    assert.ok(covJ.total >= 60, '可执行件基线规模应≥60（防遍历静默退化）');

    // ---------- parseExempt 台账纪律：裸路径豁免不生效且显式报错 ----------
    const { parseExempt } = await import('../../scripts/check-test-coverage.mjs');
    const parsed = parseExempt('# 注释\na/b.mjs — 正当理由\n\nbare/path.ps1\nx/y.sh —   \n');
    assert.ok(parsed.exempt.has('a/b.mjs'), '带理由行应生效');
    assert.deepEqual(parsed.malformed, ['bare/path.ps1', 'x/y.sh'],
      '裸路径/空理由行必须计入 malformed（既不免除义务又须报错）');
    assert.ok(!parsed.exempt.has('bare/path.ps1'));

    console.log('  -> verify-gates: profile 表/传播/事件契约/secrets/pii/link-rot/覆盖登记 全绿');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  }
}
