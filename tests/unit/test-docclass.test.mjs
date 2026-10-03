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
import { loadSpecText, classify, evaluateDoc, scanDocs }
  from '../../private/engineering/ming-boundary/scripts/lib/docclass.mjs';

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

  console.log('  docclass 断言全过');
}
