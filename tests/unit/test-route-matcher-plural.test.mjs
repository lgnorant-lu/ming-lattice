// tests/unit/test-route-matcher-plural.test.mjs
// route-core matches() 英文形态学变体契约: 单复数双向命中 + 边界/非英语保护 + 否定从句一致
// mini-manifest 隔离词表——只测 matches 语义，不依赖生产词表漂移。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Decide } from '../../private/ming-skills-router/scripts/route-core.mjs';

const manifest = {
  version: '2.0.0',
  domains: {
    testing: {
      skills: ['skill-alpha', 'skill-beta'],
      triggers: ['submodule', 'policy', 'class', 'git hooks', 'lint suppression', '注释审计', 'ci/cd'],
      negatives: [],
      weakTriggers: [],
      qualityGateTriggers: [],
      skillTriggers: {},
    },
    engineering: {
      skills: [],
      triggers: ['zebra'],
      negatives: [],
      weakTriggers: [],
      qualityGateTriggers: [],
      skillTriggers: {},
    },
  },
  recipes: {},
  availability: { 'skill-alpha': 'ready', 'skill-beta': 'ready' },
  skillDocs: {},
};

const domainOf = hint => Decide(hint, manifest).domain;

export function run() {
  // --- 单数词 → 复数文本（修复目标：原边界匹配死缺） ---
  assert.equal(domainOf('audit all submodules before merge'), 'testing');          // +s
  assert.equal(domainOf('review the classes in this package'), 'testing');          // +es (s 尾)
  assert.equal(domainOf('engineering policies drift check'), 'testing');            // y→ies
  assert.equal(domainOf('clean lint suppressions across docs'), 'testing');         // 多词项词尾
  console.log('  [ok] 单数词命中复数文本 (s/es/ies/多词项)');

  // --- 复数词 → 单数文本（对称剥形） ---
  assert.equal(domainOf('check my git hook config'), 'testing');                    // s 剥
  console.log('  [ok] 复数词命中单数文本');

  // --- 边界与形态学保护：共享词尾≠复数 ---
  assert.equal(domainOf('zebrafish habitat survey'), 'none');                       // zebra 不破右边界
  assert.equal(domainOf('the module loader design'), 'none');                       // submodule 不破左边界
  assert.equal(domainOf('status update review'), 'none');                           // us 尾禁剥 (statu 伪干)
  assert.equal(domainOf('this analysi fragment'), 'none');                          // is 尾禁剥 (analysi 伪干) —— 注: analysis 未注册
  assert.equal(domainOf('o ring gasket spec'), 'none');                             // 干长<3 禁剥 (os→o 防线，os 未注册但语义同)
  console.log('  [ok] 边界保护与非英语尾防剥');

  // --- 非英语/标点项零变体不回归 ---
  assert.equal(domainOf('注释审计 报告生成'), 'testing');                            // CJK 原样命中
  assert.equal(domainOf('ci/cd pipeline gate'), 'testing');                          // 标点项原样命中
  console.log('  [ok] CJK/标点项不生产变体、原语义保留');

  // --- 否定从句与显式点名共用同一 matches：语义一致 ---
  {
    const d = Decide('不要用 skill-alphas，只审计 submodules', manifest);
    assert.equal(d.domain, 'testing');
    assert.ok(!d.candidates.includes('skill-alpha'), '否定从句中的复数点名必须同样排除');
    console.log('  [ok] 否定从句复数点名排除一致');
  }
  {
    const d = Decide('explicitly use skill-alphas for the audit', manifest);
    assert.ok(d.candidates.includes('skill-alpha'), '复数显式点名应召回技能本体');
    console.log('  [ok] 复数点名召回技能本体');
  }

  // --- 生产词表回归锚点（真实 manifest，防合成盲区） ---
  {
    const real = JSON.parse(fs.readFileSync(
      path.resolve(import.meta.dirname, '../../config/router-manifest.json'), 'utf8'));
    assert.equal(Decide('audit lint suppressions and stale comments', real).domain, 'engineering');
    assert.equal(Decide('check git hook before commit', real).domain, 'engineering');
    assert.equal(Decide('zebrafish care guide', real).domain, 'none');
    assert.equal(Decide('the car care status', real).domain, 'none');
    console.log('  [ok] 生产 manifest 双向命中 + 无碰撞回归');
  }

  console.log('route-matcher-plural: 7 组形态学断言通过');
}

if (process.argv[1] && process.argv[1].endsWith('test-route-matcher-plural.test.mjs')) {
  run();
}
