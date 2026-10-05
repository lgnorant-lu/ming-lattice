// tests/unit/test-validate-hooks.test.mjs
// 单元测试: scripts/hooks/validate.mjs
// 覆盖: Commit Type 校验, Scope 格式, Emoji 过滤, Mojibake 拦截, 合并放行

import assert from 'node:assert/strict';
import path from 'node:path';
import { validateSubject, validateTrailer, extractSubject, hasEmoji, hasMojibake, loadHookConfig, commitMsgPolicy } from '../../scripts/hooks/validate.mjs';

const root = path.resolve(import.meta.dirname, '../..');
// 走真实装配路径（与引擎门/CLI 同一 commitMsgPolicy 装配点）：
// 本仓 .hooksrc 注入 12 型词表 + AI 署名禁尾——断言对象是"本仓生效 spec"而非裸默认
const legacy = loadHookConfig(root);
const gcfg = Object.fromEntries(
  Object.entries(legacy).filter(([k]) => k.startsWith('gate.commit-msg.'))
    .map(([k, v]) => [k.slice('gate.commit-msg.'.length), v])
);
const repoPolicy = commitMsgPolicy(legacy, gcfg);
const strict = { ...repoPolicy, emojiLevel: 'error', mojibakeLevel: 'error' };

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
    const res = validateSubject(c, strict);
    assert.equal(res.ok, true, `合法用例被误拒: "${c}" - 原因: ${res.reason}`);
  }
  // 装配完整性回测：本仓词表确含仓专型（否则上面的 collect/sync 用例是假绿）
  assert.ok(repoPolicy.types.includes('collect') && repoPolicy.types.includes('merge'),
    'repoPolicy 应含仓专词表（.hooksrc gate.commit-msg.types）');

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
    const res = validateSubject(inv.subject, strict);
    assert.equal(res.ok, false, `非法用例被放行: "${inv.subject}"`);
    if (inv.match) {
      assert.ok(res.reason.includes(inv.match), `错误信息不符: "${res.reason}" 未包含 "${inv.match}"`);
    }
  }

  // 6. validateTrailer — 署名禁令走本仓装配 policy（禁尾=仓级政策注入非烧死默认）
  const cleanMsg = 'feat(x): 正常提交\n\n正文无署名行';
  assert.equal(validateTrailer(cleanMsg, repoPolicy).ok, true);
  assert.equal(validateTrailer('feat(x): a\n\nGenerated with [Devin](https://devin.ai)', repoPolicy).ok, false);
  assert.equal(validateTrailer('feat(x): a\n\nCo-Authored-By: Devin <bot@x>', repoPolicy).ok, false);
  assert.equal(validateTrailer('feat(x): a\n\nCo-Authored-By: Claude <noreply@anthropic.com>', repoPolicy).ok, false);
  assert.equal(validateTrailer('feat(x): a\n\nCo-Authored-By: Human <h@x>', repoPolicy).ok, false, '字段级拦截不区分署名对象');
  assert.ok(repoPolicy.bannedTrailers.length >= 2, 'repoPolicy 应含署名禁尾（.hooksrc bannedTrailers）');
  assert.equal(validateTrailer(cleanMsg, { trailerLevel: 'off' }).ok, true);
  const wr = validateTrailer('feat(x): a\n\nCo-Authored-By: Devin <b@x>', { ...repoPolicy, trailerLevel: 'warn' });
  assert.equal(wr.ok, true);
  assert.equal(wr.warnings.length, 1);
  assert.equal(validateTrailer('').ok, true);
  assert.equal(validateTrailer(null).ok, true);

  // 7. 仓私有文档规范键（subjectCjk/bodySections/sectionTypes）——policy 透传断言：
  //    本仓 .hooksrc 显式开 → repoPolicy 携带；裸 policy（无键）→ 未定义即 kit 默认关
  assert.equal(repoPolicy.subjectCjk, true, 'repoPolicy 应含 subjectCjk（.hooksrc gate.commit-msg.subjectCjk）');
  assert.deepEqual(repoPolicy.bodySections, ['实施内容', '本提交不授权', '已执行审阅'],
    'repoPolicy.bodySections 应为本仓三段式标记集');
  const bare = commitMsgPolicy({}, {});
  assert.equal(bare.subjectCjk, undefined, 'kit 裸默认 subjectCjk 应未定义（默认关）');
  assert.equal(bare.bodySections, undefined, 'kit 裸默认 bodySections 应未定义（默认关）');
  const custom = commitMsgPolicy({}, { subjectCjk: 'true', bodySections: '甲,乙', sectionTypes: 'feat' });
  assert.equal(custom.subjectCjk, true);
  assert.deepEqual(custom.bodySections, ['甲', '乙']);
  assert.deepEqual(custom.sectionTypes, ['feat']);

  console.log('  -> validate.mjs 全部断言通过！');
}

if (process.argv[1] && process.argv[1].endsWith('test-validate-hooks.test.mjs')) {
  run();
}
