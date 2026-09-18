#!/usr/bin/env node
// audit-domains.test.mjs — audit-domains 自测套（守门员自洽：M3 律"本包尽量符合自身规则"）
// 每用例一棵迷你 fixture 文档树 → node audit-domains.mjs <dir> --json → 断言 E/W/I 与命中消息
// 用法: node audit-domains.test.mjs   退出码: 0=全过  1=有失败

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const AUDIT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'audit-domains.mjs');

const fm = (o) => `---\n${Object.entries(o).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n`;
const NS_MIN = JSON.stringify({ namespaces: [
  { prefix: 'M<N>', pattern: '^M\\d+$', domain: 'plan', ordering: 'enum', role: 'id', note: '里程碑' },
]});

function makeTree(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-fx-'));
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
  return dir;
}

function runAudit(dir, extra = []) {
  const r = spawnSync('node', [AUDIT, dir, '--json', ...extra], { encoding: 'utf8' });
  const out = (r.stdout || '').trim();
  let json;
  try { json = JSON.parse(out.slice(out.indexOf('{'))); }
  catch { return { parseError: true, stdout: out, stderr: r.stderr, status: r.status, issues: [] }; }
  return { ...json, status: r.status, stderr: r.stderr };
}

const count = (res, lv) => (res.issues || []).filter(i => i.level === lv).length;
const hits = (res, frag) => (res.issues || []).filter(i => i.msg.includes(frag));

const CASES = [
  {
    name: 'clean-baseline（含互锁正向）',
    files: {
      'META.md': fm({ domain: 'meta', status: 'normative' }) +
        '# META\n\n## 命名空间\n\n| 前缀 | 说明 |\n|---|---|\n| `M<N>` | 里程碑 |\n',
      'namespaces.json': NS_MIN,
      'PLAN.md': fm({ domain: 'plan', status: 'normative' }) + '# PLAN\n\n## M0 — 基座\n\nM0 先行。\n',
    },
    expect: { E: 0, W: 0 },
  },
  {
    name: 'orphan=warn 默认',
    files: { 'DOC.md': '# 无 frontmatter 文档\n' },
    expect: { E: 0, msg: ['orphan'] },
  },
  {
    name: 'orphan=E --strict',
    files: { 'DOC.md': '# 无 frontmatter 文档\n' },
    args: ['--strict'],
    expect: { E: 1, msg: ['orphan'] },
  },
  {
    name: 'canonical 双真相=E',
    files: {
      'A.md': fm({ domain: 'spec', status: 'normative', canonical: '[shared.fact]' }) + '# A\n',
      'B.md': fm({ domain: 'spec', status: 'normative', canonical: '[shared.fact]' }) + '# B\n',
      'namespaces.json': NS_MIN,
    },
    expect: { E: 1, msg: ['双真相'] },
  },
  {
    name: '悬空引用=W',
    files: {
      'P.md': fm({ domain: 'plan', status: 'normative' }) + '# P\n\n依赖 M9 里程碑。\n',
      'namespaces.json': NS_MIN,
    },
    expect: { E: 0, msg: ['悬空引用: M9'] },
  },
  {
    name: 'findings 档引用豁免',
    files: {
      'spec/OPEN-FINDINGS.md': fm({ domain: 'spec', status: 'descriptive' }) + '# FINDINGS\n\n见 M9。\n',
      'namespaces.json': NS_MIN,
    },
    expect: { E: 0, W: 0 },
  },
  {
    name: 'status 词表外=E',
    files: { 'X.md': fm({ domain: 'spec', status: 'bogus' }) + '# X\n' },
    expect: { E: 1, msg: ['status 词表外'] },
  },
  {
    name: 'proposed 超期=W',
    files: { 'X.md': fm({ domain: 'spec', status: 'proposed', since: '2020-01-01' }) + '# X\n' },
    expect: { msg: ['挂账'] },
  },
  {
    name: 'provisional 超龄=W',
    files: { 'X.md': fm({ domain: 'spec', status: 'provisional', since: '2020-01-01' }) + '# X\n' },
    expect: { msg: ['插队'] },
  },
  {
    name: '标号撞名=E',
    files: {
      'A.md': fm({ domain: 'plan', status: 'normative' }) + '# A\n\n## M0 — 甲\n',
      'B.md': fm({ domain: 'plan', status: 'normative' }) + '# B\n\n## M0 — 乙\n',
      'namespaces.json': NS_MIN,
    },
    expect: { E: 1, msg: ['标号撞名'] },
  },
  {
    name: '字母区定义位（## Z. 未登记=W）',
    files: {
      'A.md': fm({ domain: 'spec', status: 'normative' }) + '# A\n\n## Z. 区\n\n3. 某项\n',
      'namespaces.json': NS_MIN,
    },
    expect: { msg: ['不匹配已登记命名空间格式'] },
  },
  {
    name: 'O1 倒挂=W（normative 引 proposed 定义）',
    files: {
      'A.md': fm({ domain: 'spec', status: 'proposed', since: '2020-01-01' }) + '# A\n\n## M5 — 未定稿\n',
      'B.md': fm({ domain: 'spec', status: 'normative' }) + '# B\n\n依赖 M5。\n',
      'namespaces.json': NS_MIN,
    },
    expect: { msg: ['倒挂引用'] },
  },
  {
    name: '登记互锁漂移=E',
    files: {
      'META.md': fm({ domain: 'meta', status: 'normative' }) +
        '# META\n\n## 命名空间\n\n| 前缀 | 说明 |\n|---|---|\n| `M<N>` | 里程碑 |\n| `L<N>` | 文档层 |\n',
      'namespaces.json': JSON.stringify({ namespaces: [
        { prefix: 'M<N>', pattern: '^M\\d+$', domain: 'plan', ordering: 'enum', role: 'id', note: '里程碑' },
        { prefix: 'Q<N>', pattern: '^Q\\d+$', domain: 'spec', ordering: 'enum', role: 'id', note: '候审' },
      ]}),
      'P.md': fm({ domain: 'plan', status: 'normative' }) + '# P\n',
    },
    expect: { E: 2, msg: ['登记漂移'] },
  },
  {
    name: 'meta 无命名空间表互锁跳过',
    files: {
      'META.md': fm({ domain: 'meta', status: 'normative' }) + '# META\n\n无表。\n',
      'namespaces.json': NS_MIN,
      'P.md': fm({ domain: 'plan', status: 'normative' }) + '# P\n',
    },
    expect: { E: 0, W: 0 },
  },
  {
    name: 'CRLF 末行 dynamics 回归（\\r 丢键 bug）',
    files: {
      'PLAN.md': '---\r\ndomain: plan\r\nstatus: normative\r\ndynamics: [立, 用, 省, 改]\r\n---\r\n\r\n# PLAN\r\n',
      'namespaces.json': NS_MIN,
    },
    expect: { noMsg: ['plan x 立', 'plan x 用', 'plan x 省', 'plan x 改'] },
  },
  {
    name: 'ming.yaml tier 词表外=W',
    files: {
      'ming.yaml': 'project: x\ntier: bogus\ndomains: []\n',
      'P.md': fm({ domain: 'plan', status: 'normative' }) + '# P\n',
    },
    expect: { msg: ['tier 词表外'] },
  },
  {
    name: 'ming.yaml 声明域未实例化=I',
    files: {
      'ming.yaml': 'project: x\ntier: standard\ndomains:\n  - meta\n  - spec\n',
      'META.md': fm({ domain: 'meta', status: 'normative' }) + '# META\n',
    },
    expect: { msg: ['声明域 spec 未实例化'] },
  },
  {
    name: 'ming.yaml 行内注释剥除',
    files: {
      'ming.yaml': 'project: x\ntier: full   # minimal | standard | full\ngates: soft  # off | soft | hard\n',
      'P.md': fm({ domain: 'plan', status: 'normative' }) + '# P\n',
    },
    expect: { noMsg: ['词表外'] },
  },
  {
    name: '未登记命名空间族启发式=W',
    files: {
      'A.md': fm({ domain: 'spec', status: 'normative' }) + '# A\n\nZZZ1 与 ZZZ2 两个编号。\n',
    },
    expect: { msg: ['疑似未登记命名空间族'] },
  },
  {
    name: '自定义 namespaces.json 生效',
    files: {
      'A.md': fm({ domain: 'spec', status: 'normative' }) + '# A\n\n## FOO1 — 自定义\n\n见 FOO1。\n',
      'namespaces.json': JSON.stringify({ namespaces: [
        { prefix: 'FOO<N>', pattern: '^FOO\\d+$', domain: 'spec', ordering: 'enum', role: 'id', note: '自定义' },
      ]}),
    },
    expect: { E: 0, W: 0 },
  },
  {
    name: 'ADR 文件名定义位',
    files: {
      'adr/0001-foo.md': fm({ domain: 'meta', status: 'normative' }) + '# ADR\n',
      'B.md': fm({ domain: 'spec', status: 'normative' }) + '# B\n\n依 ADR-0001。\n',
    },
    expect: { E: 0, noMsg: ['悬空引用: ADR-0001'] },
  },
  {
    name: 'frozen 登记=I',
    files: { 'OLD.md': fm({ domain: 'know', status: 'frozen' }) + '# OLD\n' },
    expect: { msg: ['frozen 登记'] },
  },
  {
    name: 'req 孵化位：词表已登记（不报未登记域）',
    files: { 'R.md': fm({ domain: 'req', status: 'proposed', since: '2099-01-01' }) + '# R\n' },
    expect: { E: 0, noMsg: ['未登记域'] },
  },
  {
    name: 'req 声明后未实例化=I（词表合法）',
    files: {
      'ming.yaml': 'project: x\ntier: standard\ndomains:\n  - meta\n  - req\n',
      'META.md': fm({ domain: 'meta', status: 'normative' }) + '# META\n',
    },
    expect: { msg: ['声明域 req 未实例化'], noMsg: ['声明未知域'] },
  },
  {
    name: 'gates:hard W 即拦截（exit 1）',
    files: {
      'ming.yaml': 'project: x\ngates: hard\n',
      'P.md': fm({ domain: 'plan', status: 'normative' }) + '# P\n\n依赖 M9。\n',
      'namespaces.json': NS_MIN,
    },
    expect: { W: 1, exit: 1 },
  },
  {
    name: 'gates:off 永不 fail（exit 0 有 W）',
    files: {
      'ming.yaml': 'project: x\ngates: off\n',
      'P.md': fm({ domain: 'plan', status: 'normative' }) + '# P\n\n依赖 M9。\n',
      'namespaces.json': NS_MIN,
    },
    expect: { W: 1, exit: 0 },
  },
  {
    name: 'gates:soft 默认 E 才 fail（exit 0 有 W）',
    files: {
      'P.md': fm({ domain: 'plan', status: 'normative' }) + '# P\n\n依赖 M9。\n',
      'namespaces.json': NS_MIN,
    },
    expect: { W: 1, exit: 0 },
  },
  {
    name: '--ming-schema 扩展词表（自定义域通道）',
    files: {
      'my.schema.json': JSON.stringify({ properties: {
        domains: { enum: ['meta', 'spec', 'xyz'] },
        tier: { enum: ['lite', 'pro'] },
        gates: { enum: ['off', 'on'] },
      }}),
      'ming.yaml': 'project: x\ntier: lite\ndomains:\n  - xyz\n',
      'X.md': fm({ domain: 'xyz', status: 'normative' }) + '# X\n',
    },
    args: ['--ming-schema', '{dir}/my.schema.json'],
    expect: { E: 0, noMsg: ['未登记域', '词表外', '未知域'] },
  },
  {
    name: '--ming-schema 坏路径=E（显式指定须可加载）',
    files: { 'P.md': fm({ domain: 'plan', status: 'normative' }) + '# P\n' },
    args: ['--ming-schema', '{dir}/nonexistent.json'],
    expect: { E: 1, msg: ['未加载'] },
  },
  {
    name: 'schema 词表生效（扩展 tier 之外仍报词表外）',
    files: {
      'my.schema.json': JSON.stringify({ properties: {
        domains: { enum: ['meta'] }, tier: { enum: ['lite'] }, gates: { enum: ['on'] },
      }}),
      'ming.yaml': 'project: x\ntier: minimal\n',
      'META.md': fm({ domain: 'meta', status: 'normative' }) + '# META\n',
    },
    args: ['--ming-schema', '{dir}/my.schema.json'],
    expect: { msg: ['tier 词表外'] },
  },
];

// emit-index 单独验证（产物文件断言）
{
  const dir = makeTree({
    'P.md': fm({ domain: 'plan', status: 'normative' }) + '# P\n\n## M0 — 基座\n\n见 M0 与 M9。\n',
    'namespaces.json': NS_MIN,
  });
  const idx = path.join(dir, 'labels-index.json');
  const res = runAudit(dir, ['--emit-index', idx]);
  const j = fs.existsSync(idx) ? JSON.parse(fs.readFileSync(idx, 'utf8')) : null;
  CASES.push({
    name: '--emit-index 产物',
    _precomputed: { ok: !!(j && j.ids && j.ids['M0'] && j.ids['M0'].refs >= 1 && j.ids['M0'].dead === false), res },
  });
}

let pass = 0, fail = 0;
for (const c of CASES) {
  if (c._precomputed) {
    if (c._precomputed.ok) { console.log(`[PASS] ${c.name}`); pass++; }
    else { console.log(`[FAIL] ${c.name}`); fail++; }
    continue;
  }
  const dir = makeTree(c.files);
  const res = runAudit(dir, (c.args || []).map(a => a.replaceAll('{dir}', dir)));
  const exp = c.expect || {};
  const problems = [];
  if (res.parseError) problems.push(`JSON 解析失败: ${res.stderr || res.stdout.slice(0, 200)}`);
  if (exp.E !== undefined && count(res, 'E') !== exp.E) problems.push(`E=${count(res, 'E')} 期望 ${exp.E}`);
  if (exp.W !== undefined && count(res, 'W') !== exp.W) problems.push(`W=${count(res, 'W')} 期望 ${exp.W}`);
  if (exp.exit !== undefined && res.status !== exp.exit) problems.push(`exit=${res.status} 期望 ${exp.exit}`);
  for (const frag of exp.msg || []) if (!hits(res, frag).length) problems.push(`缺消息: ${frag}`);
  for (const frag of exp.noMsg || []) if (hits(res, frag).length) problems.push(`不该有: ${frag}`);
  if (problems.length) {
    console.log(`[FAIL] ${c.name} — ${problems.join('; ')}`);
    for (const i of res.issues || []) console.log(`       [${i.level}] ${i.msg}`);
    fail++;
  } else { console.log(`[PASS] ${c.name}`); pass++; }
}
console.log(`\n${pass} passed, ${fail} failed, ${CASES.length} total`);
process.exit(fail ? 1 : 0);
