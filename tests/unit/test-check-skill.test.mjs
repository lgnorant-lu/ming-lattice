// tests/unit/test-check-skill.test.mjs
// 单元测试: private/engineering/ming-skill-forge/scripts/check-skill.mjs
// 覆盖: frontmatter 契约（块标量回归）, 链接检查（代码围栏豁免回归）,
//       条件化惯例（metadata 自声明 / -paradigm vs -idiom）, emoji 禁令,
//       CLI 退出码契约
// fixture 全在 os.tmpdir 下临时生成，skipRouter/skipRegistry 隔离仓库真源。

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkDir, checkCandidates, routerDomainKeys, domainVocabSweep, unregisteredDirs, collectStats, skillLayer } from '../../private/engineering/ming-skill-forge/scripts/check-skill.mjs';

const SCRIPT = path.resolve(import.meta.dirname, '../../private/engineering/ming-skill-forge/scripts/check-skill.mjs');
const OPTS = { skipRouter: true, skipRegistry: true };

let tmpRoot;
function mkSkill(dirName, skillMd) {
  const dir = path.join(tmpRoot, dirName);
  fs.mkdirSync(dir, { recursive: true });
  if (skillMd !== null) fs.writeFileSync(path.join(dir, 'SKILL.md'), skillMd, 'utf8');
  return dir;
}

function fm(name, extra = '', desc = '这是一个用于测试的技能描述，覆盖触发词 alpha、beta、gamma 场景使用。') {
  return `---\nname: ${name}\ndescription: ${desc}\n${extra}---\n\n正文内容。\n`;
}

const has = (issues, level, frag) => issues.some(i => i.level === level && i.msg.includes(frag));

export function run() {
  console.log('[TEST UNIT] check-skill.mjs...');
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'check-skill-root-'));
  try {
    // 1. 最小合法包 → 零 findings
    const ok = mkSkill('ok-skill', fm('ok-skill'));
    assert.equal(checkDir(ok, OPTS).length, 0, '合法包应零 findings');

    // 2. 缺 SKILL.md → E
    const empty = mkSkill('empty-skill', null);
    assert.ok(has(checkDir(empty, OPTS), 'E', 'SKILL.md 缺失'));

    // 3. 回归：YAML 块标量 description 正确解析长度（曾误判 "|" 为全文）
    const blockDesc = `description: |\n  块标量描述第一行，足够长的多行内容用于通过二十字符下限检查。\n  第二行继续补充触发词覆盖。`;
    const block = mkSkill('block-desc-skill', `---\nname: block-desc-skill\n${blockDesc}\n---\n\n正文。\n`);
    assert.ok(!has(checkDir(block, OPTS), 'E', 'description 过短'), '块标量不应误报过短');

    // 4. 回归：行内代码/代码围栏里的 [x](y) 不当真链接；裸文链接查存在性
    const codeLink = mkSkill('code-link-skill', fm('code-link-skill') + '\n语法示例 `[text](url)` 与围栏：\n```\n[a](b.md)\n```\n');
    assert.ok(!has(checkDir(codeLink, OPTS), 'E', '引用的文件不存在'), '代码内链接不应检查存在性');
    const realLink = mkSkill('real-link-skill', fm('real-link-skill') + '\n详见 [参考](references/missing.md)。\n');
    assert.ok(has(checkDir(realLink, OPTS), 'E', '引用的文件不存在'), '真实断链应报 E');

    // 5. name != 目录名 → E；非 kebab-case → E
    const badName = mkSkill('dir-name', fm('other-name'));
    assert.ok(has(checkDir(badName, OPTS), 'E', '!= 目录名'));
    const badCase = mkSkill('pascal', fm('PascalName'));
    assert.ok(has(checkDir(badCase, OPTS), 'E', 'kebab-case'));

    // 6. metadata 自声明条件化：声明了查完备，没声明不索求
    const noMeta = mkSkill('no-meta-skill', fm('no-meta-skill'));
    assert.ok(!checkDir(noMeta, OPTS).some(i => i.msg.includes('metadata')), '未声明 metadata 不应索求');
    const halfMeta = mkSkill('half-meta-skill', fm('half-meta-skill', 'metadata:\n  layer: knowledge-paradigm\n'));
    assert.ok(has(checkDir(halfMeta, OPTS), 'W', 'metadata 缺 compose'), '声明后缺字段应报 W');

    // 7. -paradigm vs -idiom 触发分化（撞名修复回归）
    const paradigm = mkSkill('demo-paradigm', fm('demo-paradigm'));
    assert.ok(has(checkDir(paradigm, OPTS), 'W', 'sources.md'), '-paradigm 应索 sources.md');
    const idiom = mkSkill('demo-idiom', fm('demo-idiom'));
    assert.ok(!has(checkDir(idiom, OPTS), 'W', 'sources.md'), '-idiom 不应索 sources.md');

    // 8. emoji → E
    const emoji = mkSkill('emoji-skill', fm('emoji-skill') + '\n含表情 ✨ 的句子。\n');
    assert.ok(has(checkDir(emoji, OPTS), 'E', 'emoji'));

    // 9. 正文 >500 行 → W
    const longBody = fm('long-skill') + '\n' + '行\n'.repeat(510);
    const longDir = mkSkill('long-skill', longBody);
    assert.ok(has(checkDir(longDir, OPTS), 'W', '超 500'));

    // 10. T6 一致性：名字在真实 DOMAIN_DEFS skillTriggers 且描述零交集 → I；含触发词 → 无 I
    //     （借真实包名 contract-core-paradigm，其 skillTriggers 含"数据契约"等词）
    const noOverlap = mkSkill('contract-core-paradigm', fm('contract-core-paradigm', '', 'Only unrelated English words here, xyz.'));
    const drift = checkDir(noOverlap, { skipRegistry: true, skipRouter: false });
    assert.ok(has(drift, 'I', 'skillTriggers'), '触发词零交集应报 I');
    const overlap = mkSkill('contract-core-paradigm', fm('contract-core-paradigm', '', '数据契约演进相关技能包描述，用于测试一致性检查场景。'));
    assert.ok(!has(checkDir(overlap, { skipRegistry: true, skipRouter: false }), 'I', 'skillTriggers'), '含触发词不应报 I');

    // 11. router:false 豁免位：registry 声明的包不进 DOMAIN_DEFS 不报错（I 级留痕）
    //     （借真实条目 blog-content——其 registry 已标 router:false；fixture 路径不符只产 E 不影响断言面）
    const exempt = mkSkill('blog-content', fm('blog-content'));
    const exemptIssues = checkDir(exempt, { skipRegistry: false, skipRouter: false });
    assert.ok(has(exemptIssues, 'I', 'router:false'), '声明豁免应留 I 级痕迹');
    assert.ok(!has(exemptIssues, 'W', '未进 DOMAIN_DEFS'), '豁免包不应报 DOMAIN_DEFS W');
    const unrouted = mkSkill('unrouted-fixture', fm('unrouted-fixture'));
    assert.ok(has(checkDir(unrouted, { skipRegistry: true, skipRouter: false }), 'W', '未进 DOMAIN_DEFS'), '未声明豁免的包仍报 W');

    // 12. CLI 退出码契约：合法→0，缺 SKILL.md→1
    execFileSync('node', [SCRIPT, ok, '--no-router', '--no-registry']); // 不抛即 exit 0
    let failed = false;
    try { execFileSync('node', [SCRIPT, empty, '--no-router', '--no-registry'], { stdio: 'pipe' }); }
    catch (e) { failed = e.status === 1; }
    assert.ok(failed, 'E 级 findings 应 exit 1');

    // 13. 候审区契约：真实 registry candidates 段应全合法（字段齐/零冲突/有证据/无实体）
    const cand = checkCandidates(new Set());
    assert.ok(cand.entries.length >= 4, 'candidates 段应至少登记 4 条候审');
    for (const c of cand.entries) {
      assert.ok(c.domain && c.path && c.rationale && c.graduation && c.openedAt, `候选 ${c.name} 必填字段齐`);
      assert.ok(c.evidence >= 1, `候选 ${c.name} 开市须有 evidence`);
    }
    for (const r of cand.results) {
      assert.ok(!r.issues.some(i => i.level === 'E'), `候选 ${r.name} 不应有 E 级`);
    }
    assert.equal(cand.stats.count, cand.entries.length, '统计数应等于登记数');
    // 与既有包重名应报 E（注入模拟重名验证）
    const collide = checkCandidates(new Set(['immersive-web-idiom']));
    assert.ok(collide.results.find(r => r.name === 'immersive-web-idiom').issues.some(i => i.level === 'E' && i.msg.includes('重名')), '与既有包重名应报 E');

    // 14. 命名空间与层别登记门控
    // 14a. 严格 kebab + ≥3 字符：连字符边界/双连字符/下划线/过短 → E
    for (const bad of ['-lead', 'trail-', 'a--b', 'under_score', 'ab']) {
      const d = mkSkill('kebab-fx', fm(bad));
      assert.ok(has(checkDir(d, OPTS), 'E', 'kebab-case'), `name ${bad} 应报 kebab E`);
    }
    // 14b+c. registryPath 注入 fixture：ming- 保留命名空间 + layers 登记表
    const fxReg = path.join(tmpRoot, 'registry.yaml');
    fs.writeFileSync(fxReg, [
      'layers:',
      '  - methodology',
      'private:',
      '  - name: ming-fx-ok',
      '    metaSystem: true',
      '    path: tmp/ming-fx-ok',
      '    note: x',
      '    deploy: {ccswitch: true}',
      '  - name: ming-fx-bad',
      '    path: tmp/ming-fx-bad',
      '    note: x',
      '    deploy: {ccswitch: true}',
      '  - name: plain-fx',
      '    metaSystem: true',
      '    path: tmp/plain-fx',
      '    note: x',
      '    deploy: {ccswitch: true}',
      '  - name: lay-ok-fx',
      '    path: tmp/lay-ok-fx',
      '    note: x',
      '    deploy: {ccswitch: true}',
      '  - name: lay-bad-fx',
      '    path: tmp/lay-bad-fx',
      '    note: x',
      '    deploy: {ccswitch: true}',
      'candidates:',
      '',
    ].join('\n'), 'utf8');
    const regOpts = { skipRouter: true, registryPath: fxReg };
    const meta = 'metadata:\n  layer: methodology\n  compose: none\n';
    assert.ok(!has(checkDir(mkSkill('ming-fx-ok', fm('ming-fx-ok', meta)), regOpts), 'E', 'metaSystem'), '已声明 metaSystem 不应报 E');
    assert.ok(has(checkDir(mkSkill('ming-fx-bad', fm('ming-fx-bad', meta)), regOpts), 'E', 'metaSystem'), 'ming- 缺声明应报 E');
    assert.ok(has(checkDir(mkSkill('plain-fx', fm('plain-fx', meta)), regOpts), 'W', '声明漂移'), '非 ming- 声明 metaSystem 应报漂移 W');
    assert.ok(!has(checkDir(mkSkill('lay-ok-fx', fm('lay-ok-fx', meta)), regOpts), 'W', '未登记'), '登记层别不应报 W');
    const layBadMeta = 'metadata:\n  layer: bogus-layer\n  compose: none\n';
    assert.ok(has(checkDir(mkSkill('lay-bad-fx', fm('lay-bad-fx', layBadMeta)), regOpts), 'W', '未登记'), '未登记层别应报 W');

    // 15. 资产域词表治理 + stats 投影 + fs→registry 反向对账
    // 15a. domainVocabSweep：登记值零 issue，未登记值 W（fixture registry 注入）
    const fxReg2 = path.join(tmpRoot, 'registry-domains.yaml');
    fs.writeFileSync(fxReg2, [
      'domains:',
      '  - js',
      '  - grp/sub',
      'vertical:',
      '  - name: v-ok',
      '    path: vertical/v-ok',
      '    domain: js',
      '    deploy: {}',
      '  - name: v-slash',
      '    path: vertical/v-slash',
      '    domain: grp/sub',
      '    deploy: {}',
      '  - name: v-bad',
      '    path: vertical/v-bad',
      '    domain: bogus-domain',
      '    deploy: {}',
      '',
    ].join('\n'), 'utf8');
    const domSweep = domainVocabSweep(fxReg2);
    assert.equal(domSweep.filter(i => i.msg.includes('"js"')).length, 0, '登记值 js 不应报');
    assert.equal(domSweep.filter(i => i.msg.includes('grp/sub')).length, 0, '登记的斜杠值应判合法');
    assert.ok(domSweep.some(i => i.level === 'W' && i.msg.includes('bogus-domain')), '未登记 domain 值应报 W');
    // 15b. checkDir 条目级 domain 比对（同 fixture，路径不符只产 E 不影响 W 断言面）
    const fxReg3 = path.join(tmpRoot, 'registry-entry-domain.yaml');
    fs.writeFileSync(fxReg3, [
      'domains:', '  - js', 'layers:', '  - methodology', 'vertical:',
      '  - name: dom-ok-fx', '    path: tmp/dom-ok-fx', '    domain: js', '    note: x', '    deploy: {}',
      '  - name: dom-bad-fx', '    path: tmp/dom-bad-fx', '    domain: nope', '    note: x', '    deploy: {}',
      '',
    ].join('\n'), 'utf8');
    const domOpts = { skipRouter: true, registryPath: fxReg3 };
    assert.ok(!has(checkDir(mkSkill('dom-ok-fx', fm('dom-ok-fx')), domOpts), 'W', '未登记'), '登记 domain 不应报 W');
    assert.ok(has(checkDir(mkSkill('dom-bad-fx', fm('dom-bad-fx')), domOpts), 'W', '未登记'), '条目未登记 domain 应报 W');
    // 15c. unregisteredDirs：含 SKILL.md 未登记=孤儿；容器目录递归；已登记豁免
    //      （返回值为相对 REPO_ROOT 路径——登记集按同法构造，绝对 root 注入可越仓测试）
    const pkRoot = path.join(tmpRoot, 'pk');
    const REPO = path.resolve(import.meta.dirname, '../..');
    const relOf = p => path.relative(REPO, p).replace(/\\/g, '/');
    fs.mkdirSync(path.join(pkRoot, 'reg-one'), { recursive: true });
    fs.writeFileSync(path.join(pkRoot, 'reg-one', 'SKILL.md'), fm('reg-one'));
    fs.mkdirSync(path.join(pkRoot, 'nest', 'deep-pkg'), { recursive: true });
    fs.writeFileSync(path.join(pkRoot, 'nest', 'deep-pkg', 'SKILL.md'), fm('deep-pkg'));
    fs.mkdirSync(path.join(pkRoot, 'plain-dir'), { recursive: true }); // 无 SKILL.md 的容器——非孤儿
    const orphans = unregisteredDirs([pkRoot], new Set([relOf(path.join(pkRoot, 'reg-one'))]));
    assert.ok(!orphans.some(o => o.includes('reg-one')), '已登记目录不应报孤儿');
    assert.ok(!orphans.some(o => o.includes('plain-dir')), '无 SKILL.md 容器目录不应报');
    assert.ok(orphans.some(o => o.includes('deep-pkg')), '嵌套未登记包应正向捕获');
    // 15d. collectStats：layer 直方图 + undeclared 桶（真实 registry 注入路径）
    const stats = collectStats([{ name: 'fake', path: 'private/ming-skills-router' }]);
    assert.equal(stats.layers.infrastructure, 1, 'ming-skills-router layer=infrastructure 应入直方图');
    assert.equal(stats.undeclaredLayers, 0);
    const stats2 = collectStats([]);
    assert.ok(stats2.domains.js > 0 && stats2.domains.mcp > 0, 'domain 直方图应覆盖全域段');
    // 15e. 候选 domain = 目标路由域词表（DOMAIN_DEFS 键）——与条目 domain 资产域同字段不同词表
    const fxReg4 = path.join(tmpRoot, 'registry-cand.yaml');
    fs.writeFileSync(fxReg4, [
      'candidates:',
      '  - name: cand-ok',
      '    domain: engineering',
      '    path: private/engineering/cand-ok',
      '    rationale: "x"',
      '    graduation: "x"',
      '    openedAt: 2026-01-01',
      '    evidence:',
      '      - "e1"',
      '  - name: cand-bad',
      '    domain: no-such-domain',
      '    path: private/x',
      '    rationale: "x"',
      '    graduation: "x"',
      '    openedAt: 2026-01-01',
      '    evidence:',
      '      - "e1"',
      '',
    ].join('\n'), 'utf8');
    const candRes = checkCandidates(new Set(), { registryPath: fxReg4 });
    const okIss = candRes.results.find(r => r.name === 'cand-ok').issues;
    const badIss = candRes.results.find(r => r.name === 'cand-bad').issues;
    assert.ok(!okIss.some(i => i.msg.includes('DOMAIN_DEFS')), '登记路由域 engineering 不应报');
    assert.ok(badIss.some(i => i.level === 'W' && i.msg.includes('DOMAIN_DEFS')), '未登记路由域应报 W');
    const candSkip = checkCandidates(new Set(), { registryPath: fxReg4, skipRouter: true });
    assert.ok(!candSkip.results.find(r => r.name === 'cand-bad').issues.some(i => i.msg.includes('DOMAIN_DEFS')), 'skipRouter 应豁免路由域检查');
    assert.ok(routerDomainKeys().has('engineering'), 'DOMAIN_DEFS 键应含 engineering');

    console.log('  15 组断言全过');
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  }
}
