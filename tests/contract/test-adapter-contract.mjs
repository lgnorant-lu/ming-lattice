// tests/contract/test-adapter-contract.mjs
// 契约测试: 真实 Harness 适配层映射验证 (Canonical adapt() Contract Test)
// 依据: testing-core-oracle 独立判定律 & testing-scenario-cli 契约规范
// 核心目标:
// 1. 验证 adapt(decision) 真实映射层在非 reverse 高置信场景下，绝对严禁开放 allowCaseInit！
// 2. 验证 adapt(decision) 默认只把 active_recipe 的核心包正文加入 loadSkills，绝不无脑倾倒 11 份正文！
// 3. 验证盘点意图下 promptAction 精确映射为 'overview_explain'！

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Decide, adapt } from '../../scripts/route-core.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'config/router-manifest.json'), 'utf8'));

export function run() {
  console.log('[TEST CONTRACT] 真实 Harness 适配层 adapt(decision) 行为契约测试...');

  // 契约 1: 现场原句 -> 盘点意图: 候选集全量 11 包提供，但正文仅加载 catalog 4 包，动作映射为 overview_explain
  {
    const d = Decide('规范化测试覆盖设计，找找相关的skill我们现有的里面，并且都讲述一番', manifest);
    const adapted = adapt(d);

    assert.equal(d.domain, 'testing');
    assert.equal(adapted.allowCaseInit, false, 'CRITICAL: 测试任务严禁开启工单初始化权限！');
    assert.equal(adapted.promptAction, 'overview_explain', '盘点意图必须映射为阐述讲述动作！');
    assert.equal(adapted.injectedCandidates.length, 11, '候选集必须全量 11 包供模型感知');
    assert.equal(adapted.loadSkills.length, 4, '默认正文只加载 catalog 4 个核心包');
    assert.ok(adapted.loadSkills.includes('testing-core-oracle'));
    assert.ok(adapted.loadSkills.includes('testing-workflow-spec'));
    assert.ok(adapted.loadSkills.includes('testing-workflow-characterize'));
    assert.ok(adapted.loadSkills.includes('testing-property-mutation'));
  }

  // 契约 2: 纯单点 CLI 实现任务 -> 动作必须是 implement，正文加载窄配方
  {
    const d = Decide('为 scripts/update.ps1 补充退出码和边界错误单元测试', manifest);
    const adapted = adapt(d);

    assert.equal(d.domain, 'testing');
    assert.equal(adapted.allowCaseInit, false);
    assert.equal(adapted.promptAction, 'implement', '单点编码任务必须映射为实施动作！');
    assert.ok(adapted.loadSkills.includes('testing-core-oracle'));
    assert.ok(adapted.loadSkills.includes('testing-scenario-cli'));
  }

  // 契约 3: 纯逆向高置信用例 -> 允许按需开启工单权限
  {
    const d = Decide('使用 jadx 与 frida 分析 APK 登录加密逻辑', manifest);
    const adapted = adapt(d);

    assert.equal(d.domain, 'reverse');
    assert.equal(adapted.allowCaseInit, true, '高置信逆向任务允许开启建单权限');
    assert.equal(adapted.promptAction, 'implement');
  }

  // 契约 4: 无关闲聊/低置信 -> 必须 handoff, 绝对严禁开启建单
  {
    const d = Decide('今天天气真好，出去散步', manifest);
    const adapted = adapt(d);

    assert.equal(d.domain, 'none');
    assert.equal(adapted.allowCaseInit, false);
    assert.equal(adapted.promptAction, 'handoff');
    assert.equal(adapted.loadSkills.length, 0);
  }

  // 契约 5: 跨领域复合意图 -> 必须 ask_clarification, 绝对严禁开启建单
  {
    const d = Decide('逆向分析某模块并为该逻辑编写单元测试', manifest);
    const adapted = adapt(d);

    assert.equal(d.domain, 'mixed');
    assert.equal(adapted.allowCaseInit, false, '复合任务在澄清前禁止开启建单权限');
    assert.equal(adapted.promptAction, 'ask_clarification');
    assert.ok(adapted.injectedCandidates.includes('testing-core-oracle'));
    assert.ok(adapted.injectedCandidates.includes('reverse-skill-router'));
  }

  console.log('  -> 真实 Harness 适配层契约测试全部通过！');
}

if (process.argv[1] && process.argv[1].endsWith('test-adapter-contract.mjs')) {
  run();
}
