// tests/contract/test-adapter-contract.mjs
// 契约测试: 假 Harness 适配器行为验证 (Mock Harness Adapter Contract Test)
// 依据: testing-core-oracle 独立判定律 & testing-scenario-cli 契约规范
// 核心目标:
// 1. 证明任何读取 RouteDecision 的适配器，在非 reverse 高置信场景下，绝对严禁触发工单初始化/写盘副作用！
// 2. 证明适配器默认只将 active_recipe 的核心包正文加载进上下文，绝不无脑倾倒 11 份正文，实现 Token 经济性与高召回并存！

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Decide } from '../../scripts/route-core.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'config/router-manifest.json'), 'utf8'));

/**
 * 模拟一个通用的 Harness 适配器 (如 Claude Code / OpenCode 适配层)
 */
class MockHarnessAdapter {
  constructor() {
    this.caseInitCalled = false;
    this.workspaceTouched = false;
    this.dispatchedSkills = [];
    this.loadedSkillBodies = []; // 模拟实际注入会话上下文的正文包
    this.injectedCandidateList = []; // 模拟注入会话的机读候选清单 (仅名称)
    this.lastAction = null;
  }

  // 模拟被适配器调用的逆向建单副作用函数
  initReverseCase(caseName) {
    this.caseInitCalled = true;
    this.workspaceTouched = true;
  }

  // 模拟适配器执行 RouteDecision
  execute(hint) {
    const decision = Decide(hint, manifest);

    // 注入机读候选名单供模型知情全局
    this.injectedCandidateList = decision.candidates;

    // 默认仅加载 active_recipe 推荐装配的正文，杜绝上下文爆炸
    this.loadedSkillBodies = decision.active_recipe?.skills || [];

    // 适配器硬性契约规范:
    // 1. 只有当 domain === 'reverse' 且 confidence === 'high' 时，才允许在用户明确意图下调用 initReverseCase
    // 2. 其它任何情况 (testing / ui / none / mixed / low confidence) 必须严格禁止调用建单！
    if (decision.domain === 'reverse' && decision.confidence === 'high' && decision.action === 'dispatch') {
      this.initReverseCase('auto-case');
      this.dispatchedSkills = decision.active_recipe?.skills || [];
      this.lastAction = 'reverse_dispatched';
    } else if (decision.domain === 'testing') {
      this.dispatchedSkills = decision.active_recipe?.skills || [];
      this.lastAction = 'testing_dispatched';
    } else if (decision.domain === 'ui') {
      this.dispatchedSkills = decision.active_recipe?.skills || [];
      this.lastAction = 'ui_dispatched';
    } else if (decision.domain === 'mixed') {
      this.lastAction = 'ask_clarification';
    } else {
      this.lastAction = 'handoff';
    }

    return decision;
  }
}

export function run() {
  console.log('[TEST CONTRACT] 假 Harness 适配器契约与副作用阻断测试...');

  // 契约 1: 现场原句 -> 盘点意图: 候选集全量 11 包提供，但默认正文只加载 catalog 4 包！
  {
    const adapter = new MockHarnessAdapter();
    const d = adapter.execute('规范化测试覆盖设计，找找相关的skill我们现有的里面，并且都讲述一番');
    assert.equal(d.domain, 'testing');
    assert.equal(adapter.caseInitCalled, false, 'CRITICAL: 测试任务严禁触发逆向工单初始化！');
    assert.equal(adapter.workspaceTouched, false, 'CRITICAL: 测试任务严禁触碰工作区！');
    assert.equal(adapter.lastAction, 'testing_dispatched');

    // 召回与加载经济性断言
    assert.equal(adapter.injectedCandidateList.length, 11, '候选集必须全量 11 包供模型盘点');
    assert.equal(adapter.loadedSkillBodies.length, 4, '默认上下文正文必须只加载 catalog 推荐的 4 个核心包');
    assert.ok(adapter.loadedSkillBodies.includes('testing-core-oracle'));
    assert.ok(adapter.loadedSkillBodies.includes('testing-workflow-spec'));
    assert.ok(adapter.loadedSkillBodies.includes('testing-workflow-characterize'));
    assert.ok(adapter.loadedSkillBodies.includes('testing-property-mutation'));
  }

  // 契约 2: 纯逆向高置信用例 -> 允许按需派发
  {
    const adapter = new MockHarnessAdapter();
    const d = adapter.execute('使用 jadx 与 frida 分析 APK 登录加密逻辑');
    assert.equal(d.domain, 'reverse');
    assert.equal(adapter.caseInitCalled, true);
    assert.equal(adapter.lastAction, 'reverse_dispatched');
  }

  // 契约 3: 无关闲聊/低置信 -> 必须 handoff, 绝对严禁建单
  {
    const adapter = new MockHarnessAdapter();
    const d = adapter.execute('今天天气真好，出去散步');
    assert.equal(d.domain, 'none');
    assert.equal(adapter.caseInitCalled, false);
    assert.equal(adapter.lastAction, 'handoff');
  }

  // 契约 4: 跨领域复合意图 -> 必须 ask_clarification, 绝对严禁悄悄建单
  {
    const adapter = new MockHarnessAdapter();
    const d = adapter.execute('逆向分析某模块并为该逻辑编写单元测试');
    assert.equal(d.domain, 'mixed');
    assert.equal(adapter.caseInitCalled, false, '复合任务在澄清前禁止偷跑建单');
    assert.equal(adapter.lastAction, 'ask_clarification');
    // 双域候选集必须同时可见
    assert.ok(adapter.injectedCandidateList.includes('testing-core-oracle'));
    assert.ok(adapter.injectedCandidateList.includes('reverse-skill-router'));
  }

  console.log('  -> 假 Harness 适配器契约与加载经济性测试全部通过！');
}

if (process.argv[1] && process.argv[1].endsWith('test-adapter-contract.mjs')) {
  run();
}
