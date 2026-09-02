// tests/unit/test-validate-hooks.test.mjs
// 单元测试: scripts/hooks/validate.mjs
// 覆盖: Commit Type 校验, Scope 格式, Emoji 过滤, Mojibake 拦截, 合并放行

import assert from 'node:assert/strict';
import { validateSubject, extractSubject, hasEmoji, hasMojibake } from '../../scripts/hooks/validate.mjs';

export function run() {
  console.log('[TEST UNIT] scripts/hooks/validate.mjs...');

  // 1. extractSubject
  assert.equal(extractSubject('feat(test): description\n\nbody line'), 'feat(test): description');
  assert.equal(extractSubject('  fix: trim whitespace  \r\nline2'), 'fix: trim whitespace');
  assert.equal(extractSubject(''), '');
  assert.equal(extractSubject(null), '');

  // 2. hasEmoji
  assert.equal(hasEmoji('feat: normal commit'), false);
  assert.equal(hasEmoji('feat: ✨ shiny feature'), true);
  assert.equal(hasEmoji('🚀 deploy'), true);
  assert.equal(hasEmoji('1️⃣ number emoji'), true);
  assert.equal(hasEmoji('🇨🇳 flag emoji'), true);
  assert.equal(hasEmoji('纯中文描述没有任何表情'), false);

  // 3. hasMojibake
  assert.equal(hasMojibake('正常中文描述与英文 normal text'), false);
  assert.equal(hasMojibake('包含乱码\u9357\u922b字符'), true);
  assert.equal(hasMojibake(''), false);

  // 4. validateSubject positive cases
  const validCases = [
    'feat: 新增测试内核',
    'feat(router): 落地路由分桶',
    'fix(registry): 修复编码问题',
    'chore(deps): 升级依赖版本',
    'docs(standards): 完善治理规范',
    'style: 优化代码排版',
    'refactor(hooks): 重构检查脚本',
    'test(golden): 补充 8 条黄金用例',
    'perf: 优化缓存检测耗时',
    'collect(vertical): 采集新参考库',
    'sync: 部署最新技能软链',
    'Merge branch main into develop',
    'Revert feat: 回滚某次提交'
  ];

  for (const c of validCases) {
    const res = validateSubject(c, { emojiLevel: 'error', mojibakeLevel: 'error' });
    assert.equal(res.ok, true, `合法用例被误拒: "${c}" - 原因: ${res.reason}`);
  }

  // 5. validateSubject negative cases
  const invalidCases = [
    { subject: '', reason: '提交主题不能为空' },
    { subject: 'badtype: 错误前缀', match: '提交格式不符合规范' },
    { subject: 'feat: ✨ 包含表情', match: '包含 Emoji' },
    { subject: 'fix: 包含\u9357\u922b乱码', match: '包含 ANSI/GBK' },
    { subject: 'feat(): 空 scope', match: '提交格式不符合规范' },
    { subject: 'feat[router]: 错误括号', match: '提交格式不符合规范' }
  ];

  for (const inv of invalidCases) {
    const res = validateSubject(inv.subject, { emojiLevel: 'error', mojibakeLevel: 'error' });
    assert.equal(res.ok, false, `非法用例被放行: "${inv.subject}"`);
    if (inv.match) {
      assert.ok(res.reason.includes(inv.match), `错误信息不符: "${res.reason}" 未包含 "${inv.match}"`);
    }
  }

  console.log('  -> validate.mjs 全部断言通过！');
}

if (process.argv[1] && process.argv[1].endsWith('test-validate-hooks.test.mjs')) {
  run();
}
