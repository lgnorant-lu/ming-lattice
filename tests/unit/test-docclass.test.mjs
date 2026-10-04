// tests/unit/test-docclass.test.mjs
// 单元测试: private/engineering/ming-boundary/scripts/lib/docclass.mjs
//   （docClass 注册表内核——docClass 组件形态 D 的内核层）
// 覆盖: spec 装载 fail-closed（未知键/词表越界/畸形） / classify 匹配语义
//   （first 序/path/name/any/exactPath/notPath 否决） / evaluate 判定面
//   （required/freshness/states+tolerate/fields 约束/conditional 算子/
//   missingFrontmatter 档级 / 嵌套点径） / 双方言 spec 形态（IV8 blockquote
//   九类结构与 sc frontmatter 三类结构的代表子集——对拍验证 spec 无损）
// fixture 全部内联——不触仓库真 spec 与真文档。

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadSpecText, classify, evaluateDoc, scanDocs }
  from '../../private/engineering/ming-boundary/scripts/lib/docclass.mjs';

const REPO = path.resolve(import.meta.dirname, '../..');
const RUN_BOUNDARY = path.join(REPO,
  'private/engineering/ming-boundary/scripts/run-boundary.mjs');

const load = (text) => loadSpecText(text);
const loadOk = (text) => {
  const r = load(text);
  assert.deepEqual(r.errors, [], `spec 应装载成功: ${JSON.stringify(r.errors)}`);
  return r.spec;
};

// IV8 形态 spec 代表子集（blockquote 方言——对拍验证 spec 无损表达）
const IV8_SPEC = `
schemaVersion: 1
header: blockquote-head
matchOrder: first
docClasses:
  - name: convention
    match:
      path: "docs/conventions/*.md"
    required: [Created, Status, Scope]
    freshness:
      anyOf: [Updated, "Last Audit"]
  - name: design_doc
    match:
      path: "docs/roadmap/*/analysis/*.md"
    required: [Created, Status]
    states:
      field: Status
      vocab: [draft, accepted, implemented, superseded, archived]
      tolerate: [record]
    conditional:
      - when:
          Status: superseded
        require: [Superseded-By]
        level: warn
        msg: "superseded doc missing \`{field}\` (status={when.Status})"
      - when:
          Status: implemented
        require: [Implemented-In]
        level: warn
  - name: proposal
    match:
      any:
        - name: "PROP-*.md"
        - path: "docs/proposals/*.md"
    required: [Created, Status]
    states:
      field: Status
      vocab: [draft, proposed, accepted, rejected, deferred]
`;

// 本仓形态 spec 代表子集（frontmatter 方言）
const SC_SPEC = `
schemaVersion: 1
header: yaml-frontmatter
docClasses:
  - name: distill-entry
    match:
      path: "distill/*/*.md"
      notPath: "distill/_proposals/*"
    required: [id, status]
    staging: local
    idScheme: date-slug
    agingDays: 30
    fields:
      status:
        vocab: [active, superseded]
      supersedes:
        role: relation
        target: entry-id
    gates:
      missingFrontmatter: warn
  - name: distill-proposal
    match:
      path: "distill/_proposals/*.md"
    required: [id, status]
    fields:
      id:
        equalsFilenameStem: true
      status:
        vocab: [pending, landed, rejected]
      type:
        vocab: [promotion, field-feedback, package-iteration, new-package, policy-decision]
      reviewAfter:
        pattern: "^\\\\d{4}-\\\\d{2}-\\\\d{2}$|^P\\\\d+D$"
    conditional:
      - when:
          status: pending
        check:
          reviewAfter:
            lt-date: today
        level: warn
        msg: "候审超期应复审（存续/撤回/升格）"
    gates:
      missingFrontmatter: error
  - name: skill-package
    match:
      name: SKILL.md
    required: [name, description]
    fields:
      metadata.layer:
        nested: true
    gates:
      missingFrontmatter: error
`;

const BQ_DOC = (fields) =>
  '# 标题\n' + fields.map((f) => `> ${f}`).join('\n') + '\n\n正文。\n';

export function run() {
  console.log('[TEST UNIT] docclass.mjs...');
  const today = '2026-10-04';

  // ── 组 1: spec 装载 fail-closed 面 ──
  {
    // 畸形 YAML
    let r = load('docClasses: [');
    assert.ok(r.spec === null && r.errors.length > 0, '畸形 YAML 应拒载');
    // schemaVersion 缺席/越值
    for (const t of ['docClasses:\n  - name: x\n    match:\n      path: "a/*"\n',
      'schemaVersion: 2\ndocClasses:\n  - name: x\n    match:\n      path: "a/*"\n']) {
      r = load(t);
      assert.ok(r.errors.some((e) => e.includes('schemaVersion')), `schemaVersion 钉应 fail: ${t}`);
    }
    // 未知文件级/类级/match/field/conditional/gates 键全部拒载
    const badSpecs = [
      ['schemaVersion: 1\nbogusKey: 1\ndocClasses:\n  - name: x\n    match:\n      path: "a/*"\n', '未知文件级键'],
      ['schemaVersion: 1\ndocClasses:\n  - name: x\n    match:\n      path: "a/*"\n    bogusAxis: 1\n', '未知类级键'],
      ['schemaVersion: 1\ndocClasses:\n  - name: x\n    match:\n      path: "a/*"\n      glob: "x"\n', '未知键 glob'],
      ['schemaVersion: 1\ndocClasses:\n  - name: x\n    match:\n      path: "a/*"\n    fields:\n      f1:\n        badkey: 1\n', '未知键 badkey'],
      ['schemaVersion: 1\ndocClasses:\n  - name: x\n    match:\n      path: "a/*"\n    gates:\n      bogusGate: warn\n', 'gates 未知键'],
      ['schemaVersion: 1\ndocClasses:\n  - name: x\n    match:\n      path: "a/*"\n    conditional:\n      - when:\n          a: b\n        bogusProp: 1\n', '未知键 bogusProp'],
    ];
    for (const [t, frag] of badSpecs) {
      r = load(t);
      assert.ok(r.spec === null && r.errors.some((e) => e.includes(frag)),
        `应拒载并点名 "${frag}": ${JSON.stringify(r.errors)}`);
    }
    // 非法值面
    const badValues = [
      ['schemaVersion: 1\ndocClasses: []\n', 'docClasses 须为非空列表'],
      ['schemaVersion: 1\ndocClasses:\n  - name: x\n    match:\n      notPath: "a/*"\n', '须至少一条包含键'],
      ['schemaVersion: 1\ndocClasses:\n  - name: x\n    match:\n      path: "a/*"\n  - name: x\n    match:\n      path: "b/*"\n', 'name 重复'],
      ['schemaVersion: 1\ndocClasses:\n  - name: x\n    match:\n      path: "a/*"\n    header: toml-fm\n', '方言未实现'],
      ['schemaVersion: 1\nheader: yaml-frontmatter\ndocClasses:\n  - name: x\n    match:\n      path: "a/*"\n    gates:\n      missingFrontmatter: loud\n', '档级越出'],
      ['schemaVersion: 1\ndocClasses:\n  - name: x\n    match:\n      path: "a/*"\n    fields:\n      f1:\n        pattern: "[unclosed"\n', '非法正则'],
      ['schemaVersion: 1\ndocClasses:\n  - name: x\n    match:\n      path: "a/*"\n    fields:\n      f1:\n        role: graph\n', 'role 未实现'],
      ['schemaVersion: 1\ndocClasses:\n  - name: x\n    match:\n      path: "a/*"\n    conditional:\n      - when:\n          Status:\n            greaterThan: x\n', '算子未实现'],
      ['schemaVersion: 1\ndocClasses:\n  - name: x\n    match:\n      path: "a/*"\n    conditional:\n      - when:\n          Status: x\n        check:\n          f1:\n            gt: today\n', '算子未实现'],
      ['schemaVersion: 1\ndocClasses:\n  - name: x\n    match:\n      path: "a/*"\n    freshness:\n      anyOf: []\n', 'freshness'],
      ['schemaVersion: 1\nmatchOrder: all\ndocClasses:\n  - name: x\n    match:\n      path: "a/*"\n', 'matchOrder 仅实现 first'],
      // ── 值形状钉（双引擎镜像校验面，审计补硬） ──
      ['schemaVersion: 1\ndocClasses:\n  - name: x\n    match:\n      path: 5\n', 'match.path 须为字符串或字符串列表'],
      ['schemaVersion: 1\ndocClasses:\n  - name: x\n    match:\n      path: ["a/*", 7]\n', 'match.path 须为字符串或字符串列表'],
      ['schemaVersion: 1\ndocClasses:\n  - name: x\n    match:\n      path: "a/*"\n    freshness:\n      anyOf: [d]\n      level: loud\n', 'freshness.level 仅 error|warn'],
      ['schemaVersion: 1\ndocClasses:\n  - name: x\n    match:\n      path: "a/*"\n    states:\n      field: status\n      vocab: [a]\n      tolerate: x\n', 'states.tolerate 须为字符串列表'],
      ['schemaVersion: 1\ndocClasses:\n  - name: x\n    match:\n      path: "a/*"\n    states: [a, 3]\n', 'states 简写须为字符串列表'],
      ['schemaVersion: 1\ndocClasses:\n  - name: x\n    match:\n      path: "a/*"\n    fields:\n      f1:\n        vocab: [1, x]\n', 'fields.f1.vocab 须为非空字符串列表'],
      ['schemaVersion: 1\ndocClasses:\n  - name: x\n    match:\n      path: "a/*"\n    fields:\n      f1:\n        tolerate: z\n', 'fields.f1.tolerate 须为字符串列表'],
      ['schemaVersion: 1\ndocClasses:\n  - name: x\n    match:\n      path: "a/*"\n    conditional:\n      - when:\n          Status:\n            notIn: active\n', 'notIn 须为字符串列表'],
      ['schemaVersion: 1\ndocClasses:\n  - name: x\n    match:\n      path: "a/*"\n    conditional:\n      - when:\n          Status: [a]\n', '值须为字符串或算子映射'],
      ['schemaVersion: 1\ndocClasses:\n  - name: x\n    match:\n      path: "a/*"\n    conditional:\n      - when:\n          Status: active\n        require: [5]\n', 'require 项须为非空字符串'],
      ['schemaVersion: 1\ndocClasses:\n  - name: x\n    match:\n      path: "a/*"\n    conditional:\n      - when:\n          Status: active\n        require: [f]\n        msg: 3\n', 'msg 须为字符串'],
      ['schemaVersion: 1\ndocClasses:\n  - name: x\n    match:\n      path: "a/*"\n    fields:\n      f1:\n        multiline: true\n', '未知键 multiline'],
    ];
    for (const [t, frag] of badValues) {
      r = load(t);
      assert.ok(r.spec === null && r.errors.some((e) => e.includes(frag)),
        `非法值应点名 "${frag}": ${JSON.stringify(r.errors)}`);
    }
  }

  // ── 组 2: 良构 spec 装载 + classify 匹配语义 ──
  const iv8 = loadOk(IV8_SPEC);
  const sc = loadOk(SC_SPEC);
  {
    // first 序：PROP-*.md 同时撞 name glob 与 path glob → proposal 类命中
    assert.equal(classify('docs/proposals/PROP-1.md', iv8)?.name, 'proposal');
    assert.equal(classify('docs/x/PROP-9.md', iv8)?.name, 'proposal', 'any.name 亦命中');
    assert.equal(classify('docs/conventions/c.md', iv8)?.name, 'convention');
    assert.equal(classify('docs/roadmap/v0.8/analysis/d.md', iv8)?.name, 'design_doc');
    assert.equal(classify('README.md', iv8), null, '未命中归 unclassified');
    // notPath 否决（sc）：_proposals 下文件不被 distill-entry 截获
    assert.equal(classify('distill/_proposals/2026-01-01-x.md', sc)?.name, 'distill-proposal',
      'notPath 否决应让位后序类');
    assert.equal(classify('distill/proj/note.md', sc)?.name, 'distill-entry');
    // name glob 匹配 basename
    assert.equal(classify('private/p/sk/SKILL.md', sc)?.name, 'skill-package');
    // 惰性声明键归一化后原样透传（IV8 dict(c) 同款——词表内键不得被吞）
    const entry = sc.classes.find((c) => c.name === 'distill-entry');
    assert.equal(entry.staging, 'local');
    assert.equal(entry.idScheme, 'date-slug');
    assert.equal(entry.agingDays, 30);
  }

  // ── 组 3: evaluate 判定面（IV8 blockquote 方言） ──
  {
    // 合规件
    let r = evaluateDoc('docs/conventions/x.md',
      BQ_DOC(['Created: 2026-01-01', 'Status: active', 'Scope: x', 'Updated: 2026-02-02']),
      iv8, { today });
    assert.equal(r.className, 'convention');
    assert.equal(r.dialect, 'blockquote');
    assert.equal(r.fields.Status, 'active');
    assert.deepEqual(r.issues, [], `合规件零违例: ${JSON.stringify(r.issues)}`);
    // required 缺席 → E
    r = evaluateDoc('docs/conventions/x.md',
      BQ_DOC(['Created: 2026-01-01', 'Status: active']), iv8, { today });
    assert.ok(r.issues.some((i) => i.level === 'E' && i.msg.includes('缺 Scope')));
    assert.ok(r.issues.some((i) => i.level === 'E' && i.rule === 'freshness'),
      'freshness anyOf 全缺应 E');
    // freshness anyOf 部分在场即满足
    r = evaluateDoc('docs/conventions/x.md',
      BQ_DOC(['Created: 2026-01-01', 'Status: active', 'Scope: x', 'Last Audit: 2026-03-01']),
      iv8, { today });
    assert.ok(!r.issues.some((i) => i.rule === 'freshness'), 'anyOf 部分在场应满足');
    // 空值=缺报（meta_check `not fields[key]` 语义对齐）：required 要非空，
    // 但空值字段仍在场——states/vocab 约束照常判定
    r = evaluateDoc('docs/conventions/x.md',
      BQ_DOC(['Created: 2026-01-01', 'Status:', 'Scope: x', 'Updated: 2026-02-02']),
      iv8, { today });
    assert.ok(r.issues.some((i) => i.level === 'E' && i.rule === 'required'
      && i.field === 'Status'), '空值 required 字段应 E');
    r = evaluateDoc('docs/roadmap/v0.8/analysis/d.md',
      BQ_DOC(['Created: 2026-01-01', 'Status:', 'Superseded-By: x.md']), iv8, { today });
    assert.ok(r.issues.some((i) => i.rule === 'required' && i.field === 'Status')
      && r.issues.some((i) => i.rule === 'states'),
      '空值 Status 应同时产 required E 与 states E（meta_check 同判）');
    // conditional.require 同律：空值目标字段应触发 warn
    r = evaluateDoc('docs/roadmap/v0.8/analysis/d.md',
      BQ_DOC(['Created: 2026-01-01', 'Status: superseded', 'Superseded-By:']), iv8, { today });
    assert.ok(r.issues.some((i) => i.level === 'W' && i.msg.includes('Superseded-By')),
      '空值 Superseded-By 应视作缺字段触发 conditional W');
    // states vocab + tolerate
    r = evaluateDoc('docs/roadmap/v0.8/analysis/d.md',
      BQ_DOC(['Created: 2026-01-01', 'Status: record']), iv8, { today });
    assert.ok(!r.issues.some((i) => i.rule === 'states'), 'record 应 tolerate 静默豁免');
    r = evaluateDoc('docs/roadmap/v0.8/analysis/d.md',
      BQ_DOC(['Created: 2026-01-01', 'Status: wild']), iv8, { today });
    assert.ok(r.issues.some((i) => i.level === 'E' && i.rule === 'states'
      && i.msg.includes('wild')), '野生 Status 应 E');
    // conditional：superseded→Superseded-By 缺 → W（level: warn 非 E）
    r = evaluateDoc('docs/roadmap/v0.8/analysis/d.md',
      BQ_DOC(['Created: 2026-01-01', 'Status: superseded']), iv8, { today });
    assert.ok(r.issues.some((i) => i.level === 'W' && i.msg.includes('Superseded-By')),
      'superseded 缺 Superseded-By 应 W');
    // cond.msg 模板渲染（IV8 meta_check 契约）：{field}=缺报字段、
    // {when.X}=when 字段实际值——require 缺报同享模板非仅 check
    assert.ok(r.issues.some((i) => i.rule === 'conditional'
      && i.msg.includes('missing `Superseded-By`') && i.msg.includes('status=superseded')),
      `msg 模板应渲染占位符: ${JSON.stringify(r.issues)}`);
    r = evaluateDoc('docs/roadmap/v0.8/analysis/d.md',
      BQ_DOC(['Created: 2026-01-01', 'Status: superseded', 'Superseded-By: docs/roadmap/v0.9/new.md']),
      iv8, { today });
    assert.ok(!r.issues.some((i) => i.msg.includes('Superseded-By')), '补齐后无 warn');
    // notIn when：status ∉ [draft] 时 require——proposed 命中
    r = evaluateDoc('docs/proposals/PROP-2.md',
      BQ_DOC(['Created: 2026-01-01', 'Status: proposed']), iv8, { today });
    assert.equal(r.className, 'proposal');
    // 对拍律：野生态不派生 conditional（when 引用违例字段→该条跳过）
    r = evaluateDoc('docs/roadmap/v0.8/analysis/d.md',
      BQ_DOC(['Created: 2026-01-01', 'Status: contract reference (wild)']), iv8, { today });
    assert.ok(r.issues.some((i) => i.rule === 'states'), '野生态仍 E');
    assert.ok(!r.issues.some((i) => i.rule === 'conditional'),
      '野生态 when 引用 Status 的 conditional 应跳过');
    // 对拍律：有 blockquote 节点但零字段面 ≠ missingFrontmatter
    // （描述性引用块在场时 meta_check 只报 required——头门语义是"节点缺席"）
    r = evaluateDoc('docs/conventions/x.md',
      '# T\n\n> 纯描述引用行无字段\n> 继续描述\n\n正文\n', iv8, { today });
    assert.ok(!r.issues.some((i) => i.rule === 'header'),
      'bq 节点在场零字段不应报 header 门');
  }

  // ── 组 4: evaluate 判定面（本仓 frontmatter 方言） ──
  const FM = (body) => `---\n${body}\n---\n\n# 正文\n`;
  {
    // equalsFilenameStem
    let r = evaluateDoc('distill/_proposals/2026-01-01-ok.md',
      FM('id: 2026-01-01-ok\ntarget: x/\ntype: promotion\nstatus: landed\nopenedAt: 2026-01-01'),
      sc, { today });
    assert.deepEqual(r.issues.filter((i) => i.level === 'E'), [],
      `合规提案零 E: ${JSON.stringify(r.issues)}`);
    r = evaluateDoc('distill/_proposals/2026-01-01-bad.md',
      FM('id: 2026-01-01-other\ntarget: x/\ntype: promotion\nstatus: landed\nopenedAt: 2026-01-01'),
      sc, { today });
    assert.ok(r.issues.some((i) => i.rule === 'stem'), 'id≠文件名片干应 E');
    // vocab
    r = evaluateDoc('distill/_proposals/2026-01-01-x.md',
      FM('id: 2026-01-01-x\ntarget: x/\ntype: alien\nstatus: pending\nopenedAt: 2026-01-01\nreviewAfter: 2099-01-01'),
      sc, { today });
    assert.ok(r.issues.some((i) => i.rule === 'vocab' && i.msg.includes('alien')),
      'type 越词表应 E');
    // pattern 联合形态：date|P\d+D 双合法
    for (const v of ['2099-01-01', 'P30D']) {
      r = evaluateDoc('distill/_proposals/2026-01-01-x.md',
        FM(`id: 2026-01-01-x\ntarget: x/\ntype: promotion\nstatus: landed\nopenedAt: 2026-01-01\nreviewAfter: ${v}`),
        sc, { today });
      assert.ok(!r.issues.some((i) => i.rule === 'pattern'), `reviewAfter=${v} 应过 pattern`);
    }
    // conditional check lt-date：pending + reviewAfter < today → W
    r = evaluateDoc('distill/_proposals/2026-01-01-x.md',
      FM('id: 2026-01-01-x\ntarget: x/\ntype: promotion\nstatus: pending\nopenedAt: 2026-01-01\nreviewAfter: 2026-01-05'),
      sc, { today });
    assert.ok(r.issues.some((i) => i.level === 'W' && i.rule === 'conditional-check'
      && i.msg.includes('候审超期')), 'pending 超期应 W');
    // P30D 非日期形态不参与 lt-date
    r = evaluateDoc('distill/_proposals/2026-01-01-x.md',
      FM('id: 2026-01-01-x\ntarget: x/\ntype: promotion\nstatus: pending\nopenedAt: 2026-01-01\nreviewAfter: P30D'),
      sc, { today });
    assert.ok(!r.issues.some((i) => i.rule === 'conditional-check'), 'P30D 应跳过 lt-date');
    // landed + 过期 reviewAfter → when 不命中无 W
    r = evaluateDoc('distill/_proposals/2026-01-01-x.md',
      FM('id: 2026-01-01-x\ntarget: x/\ntype: promotion\nstatus: landed\nopenedAt: 2026-01-01\nreviewAfter: 2020-01-01'),
      sc, { today });
    assert.ok(!r.issues.some((i) => i.rule === 'conditional-check'), '非 pending 不查 aging');
    // missingFrontmatter 档级差异：entry=warn / proposal=error
    r = evaluateDoc('distill/proj/plain.md', '# 无头文档\n', sc, { today });
    assert.ok(r.issues.some((i) => i.level === 'W' && i.rule === 'header'),
      'entry 无 fm 应 W');
    r = evaluateDoc('distill/_proposals/2026-01-01-x.md', '# 无头提案\n', sc, { today });
    assert.ok(r.issues.some((i) => i.level === 'E' && i.rule === 'header'),
      'proposal 无 fm 应 E');
    // 嵌套点径：metadata.layer 经 yaml-lite 走树
    r = evaluateDoc('private/p/SKILL.md',
      FM('name: s\ndescription: d\nmetadata:\n  layer: methodology'),
      sc, { today });
    assert.equal(r.className, 'skill-package');
    const nestedSpec = loadOk(`
schemaVersion: 1
header: yaml-frontmatter
docClasses:
  - name: pkg
    match:
      name: SKILL.md
    required: [metadata.layer]
`);
    r = evaluateDoc('private/p/SKILL.md',
      FM('name: s\nmetadata:\n  layer: methodology'), nestedSpec, { today });
    assert.deepEqual(r.issues, [], '嵌套点径 metadata.layer 应解析在场');
    r = evaluateDoc('private/p/SKILL.md',
      FM('name: s\nmetadata:\n  other: x'), nestedSpec, { today });
    assert.ok(r.issues.some((i) => i.rule === 'required' && i.field === 'metadata.layer'),
      '嵌套缺席应按 required 判');
  }

  // ── 组 5: scanDocs 聚合 + 未分类件 ──
  {
    const { results, counts } = scanDocs([
      { rel: 'docs/conventions/ok.md', text: BQ_DOC(['Created: 2026-01-01', 'Status: a', 'Scope: s', 'Updated: 2026-02-02']) },
      { rel: 'random/note.md', text: 'plain text' },
      { rel: 'docs/conventions/bad.md', text: 'plain text no header' },
    ], iv8, { today });
    assert.equal(counts.classified, 2);
    assert.equal(counts.unclassified, 1);
    assert.equal(results[1].className, null);
    assert.ok(counts.E >= 1, '无头 convention 应计 E');
  }

  // ── 组 6: distill/docclass.yaml 真 spec 兼容面（L4 文件同载两引擎） ──
  // L4 简写形态（states 列表/agingDays/staging/idScheme）应被内核接受
  {
    const l4 = loadOk(`
schemaVersion: 1
docClasses:
  - name: proposal
    match:
      path: "distill/_proposals/*.md"
    header: yaml-frontmatter
    staging: local
    idScheme: date-slug
    states:
      - pending
      - landed
      - rejected
    agingDays: 30
`);
    assert.equal(classify('distill/_proposals/x.md', l4)?.name, 'proposal',
      'L4 文件应被内核装载且类可命中');
    const r = evaluateDoc('distill/_proposals/2026-01-01-x.md',
      FM('id: 2026-01-01-x\nstatus: pending\nopenedAt: 2026-01-01'), l4, { today });
    assert.equal(r.className, 'proposal');
    assert.ok(!r.issues.some((i) => i.rule === 'states'), 'states 简写词表 pending 应合法');
    const r2 = evaluateDoc('distill/_proposals/2026-01-01-x.md',
      FM('id: 2026-01-01-x\nstatus: wild\nopenedAt: 2026-01-01'), l4, { today });
    assert.ok(r2.issues.some((i) => i.rule === 'states' && i.msg.includes('wild')),
      'states 简写词表野生值应 E');
  }

  // ── 组 7: consumers/docclass driving port——run-boundary 全链端到端 ──
  //   遍历域=facts file facts；classify 先筛后读件；findings 协议映射
  //   （E→error/W→warn、rule=docclass:<rule>:<field>）；spec 装载失败
  //   fail-closed=crash finding 非白放。
  {
    const R = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-port-'));
    try {
      fs.mkdirSync(path.join(R, 'docs'), { recursive: true });
      fs.writeFileSync(path.join(R, 'boundaries.yaml'),
        'version: 1\ndomains: []\nconsumers:\n  docclass:\n    spec: spec.yaml\n');
      fs.writeFileSync(path.join(R, 'spec.yaml'), `
schemaVersion: 1
header: yaml-frontmatter
docClasses:
  - name: entry
    match:
      path: "docs/*.md"
    required: [id, status]
    gates:
      missingFrontmatter: error
`);
      fs.writeFileSync(path.join(R, 'docs', 'a.md'),
        '---\nid: a\nstatus: active\n---\n# A\n');
      fs.writeFileSync(path.join(R, 'docs', 'b.md'), '---\nid: b\n---\n# B\n');
      fs.writeFileSync(path.join(R, 'docs', 'nohead.md'), '# 无头文档\n');
      const facts = path.join(R, 'facts.jsonl');
      fs.writeFileSync(facts, ['docs/a.md', 'docs/b.md', 'docs/nohead.md',
        'notes/free.md'].map((r) =>
        JSON.stringify({ kind: 'file', file: r })).join('\n'));
      const run = (extra = []) => spawnSync(process.execPath,
        [RUN_BOUNDARY, '--root', R, '--phase', 'ci', '--only', 'docclass',
         '--facts', facts, '--json', ...extra], { encoding: 'utf8' });

      // 正常面：b 缺 status→error finding；nohead 无 fm→header error；
      // a 干净；notes/free.md 未匹配类不评估
      let r = run();
      assert.equal(r.status, 1, `违例面应 exit1: ${r.stderr}`);
      const findings = JSON.parse(r.stdout).findings
        .filter((f) => f.via === 'docclass');
      const rules = findings.map((f) => `${f.unit}|${f.rule}|${f.severity}`);
      assert.ok(rules.includes('docs/b.md|docclass:required:status|error'),
        `required 缺报应 error: ${JSON.stringify(rules)}`);
      assert.ok(rules.includes('docs/nohead.md|docclass:header|error'),
        `无头应 header error: ${JSON.stringify(rules)}`);
      assert.ok(!findings.some((f) => f.unit === 'docs/a.md'),
        '合规件不应产 finding');
      assert.ok(!findings.some((f) => f.unit === 'notes/free.md'),
        '未治理路径不应评估');

      // spec 缺席→fail-closed crash finding（门禁不白放）
      fs.writeFileSync(path.join(R, 'boundaries.yaml'),
        'version: 1\ndomains: []\nconsumers:\n  docclass:\n    spec: gone.yaml\n');
      r = run();
      assert.equal(r.status, 1);
      const crash = JSON.parse(r.stdout).findings
        .find((f) => f.rule === 'docclass:crash');
      assert.ok(crash && crash.severity === 'error',
        'spec 缺席应 docclass:crash error');
    } finally {
      fs.rmSync(R, { recursive: true, force: true });
    }
  }

  // ── 组 8: 双引擎共享语料（IV8 docclass_eval.py 对拍契约面） ──
  // 语料孪生件: IV8 tests/fixtures/docclass-xlang-cases.json——两仓同步。
  // expect 为逐引擎期望：accept/reject 分歧=有意子集边界而非缺陷。
  {
    const corpus = JSON.parse(fs.readFileSync(
      path.join(REPO, 'tests/fixtures/docclass-xlang/cases.json'), 'utf8'));
    for (const c of corpus.loadCases) {
      const r = load(c.spec);
      const ok = r.spec !== null && r.errors.length === 0;
      assert.equal(ok, c.expect.mjs === 'accept',
        `loadCase ${c.id}: mjs 期望 ${c.expect.mjs}，实际 ${ok ? 'accept' : 'reject'}${r.errors.length ? ' (' + r.errors[0].slice(0, 80) + ')' : ''}`);
    }
    const vec = (issues, lvl) => issues.filter((i) => i.level === lvl)
      .map((i) => [i.rule, i.field ?? null]);
    for (const c of corpus.verdictCases) {
      const spec = loadOk(c.spec);
      for (const doc of c.docs) {
        const exp = c.expect[doc.path];
        const r = evaluateDoc(doc.path, doc.text, spec, { today });
        assert.equal(r.className ?? null, exp.class,
          `verdictCase ${c.id}/${doc.path} 类归判`);
        assert.deepEqual(vec(r.issues, 'E'), exp.errors,
          `verdictCase ${c.id}/${doc.path} errors 向量`);
        assert.deepEqual(vec(r.issues, 'W'), exp.warns,
          `verdictCase ${c.id}/${doc.path} warns 向量`);
      }
    }
  }

  console.log('  docclass 断言全过');
}
