// test-lexical-layer.test.mjs — S3 词法层专项不变量（ADR-0007）
// 覆盖 recall-eval 端到端之外的单元级契约：
//   none→ask 升级 / 永不置域-dispatch / 否定排除 / 缺席降级 / 停用词与证据下限 / 确定性
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Decide } from '../../scripts/route-core.mjs';

const manifest = JSON.parse(fs.readFileSync(new URL('../../config/router-manifest.json', import.meta.url), 'utf8'));

export function run() {
  // 1. 无域触发词但有可信词法命中 → ask + 候选（不置域）
  {
    const d = Decide('上游改了字段怎么保证下游不破', manifest);
    assert.equal(d.domain, 'none');
    assert.equal(d.action, 'ask');
    assert.ok(d.candidates.includes('contract-core-paradigm'), '词法应召回 contract-core');
    assert.ok(d.reasons.some(r => r.startsWith('lexical_fallback')), '需记录 lexical_fallback');
  }

  // 2. 词法信号永不置域/dispatch——domain=none 时 action 恒不为 dispatch
  //    （dispatch 需确定性域证据；词法命中只走 ask 提名）
  {
    const probes = [
      '上游改了字段怎么保证下游不破',
      '接口的字段改了下游会炸吗',
      'node 插件和 python 互调的边界契约怎么测',
      '数据的 schema 演进怎么做到不破坏兼容'
    ];
    for (const q of probes) {
      const d = Decide(q, manifest);
      if (d.domain === 'none')
        assert.ok(d.action !== 'dispatch', `domain=none 不得 dispatch: ${q}`);
    }
  }

  // 3. 被否定短语明确排除的技能不进词法候选
  {
    const d = Decide('别用 contract-core-paradigm，字段演进向后兼容这事咋办', manifest);
    assert.ok(!d.candidates.includes('contract-core-paradigm'), '否定技能不得被词法召回');
  }

  // 4. skillDocs 缺席/畸形 → 优雅降级为纯确定性行为，不崩
  {
    const { skillDocs, ...noDocs } = manifest;
    const d = Decide('上游改了字段怎么保证下游不破', noDocs);
    assert.equal(d.domain, 'none');
    assert.equal(d.action, 'handoff'); // 无词法层 → 退回原始 handoff
    assert.deepEqual(d.candidates, []);

    const broken = { ...manifest, skillDocs: { 'x': 'not-an-object', 'y': null } };
    const d2 = Decide('上游改了字段怎么保证下游不破', broken);
    assert.ok(['handoff', 'ask'].includes(d2.action), '畸形 skillDocs 不得崩溃');
  }

  // 5. 停用词-only 查询不产生任何词法候选
  {
    const d = Decide('is a to the of for and', manifest);
    assert.deepEqual(d.candidates, []);
    assert.equal(d.action, 'handoff');
    const d2 = Decide('帮我 怎么 什么 一下', manifest);
    assert.equal(d2.action, 'handoff');
  }

  // 6. 证据下限：纯 description 命中（加权字段零命中）不提名
  //    实测定标: "mysql 索引失效"仅中 distiller 的 description '索引'
  {
    const d = Decide('mysql 索引失效的常见原因', manifest);
    assert.ok(!d.candidates.includes('ming-distiller'), '纯 description 命中不得提名');
    assert.equal(d.action, 'handoff');
  }

  // 7. 确定性：同输入两次决策完全一致
  {
    const q = '上游改了字段怎么保证下游不破';
    assert.deepEqual(Decide(q, manifest).candidates, Decide(q, manifest).candidates);
    assert.deepEqual(Decide(q, manifest).reasons, Decide(q, manifest).reasons);
  }

  // 8. unavailable 技能不进词法候选
  {
    const m2 = JSON.parse(JSON.stringify(manifest));
    m2.availability['contract-core-paradigm'] = 'disabled';
    const d = Decide('上游改了字段怎么保证下游不破', m2);
    assert.ok(!d.candidates.includes('contract-core-paradigm'), 'disabled 技能不得被召回');
  }

  console.log('[PASS] lexical-layer: 8 组 S3 不变量断言通过');
}

if (process.argv[1]?.endsWith('test-lexical-layer.test.mjs')) run();
