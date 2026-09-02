// tests/test-route-decision.mjs
// ming-skills 核心路由决策黄金测试集 (Golden Test Suite)
// 验证: 跨 Harness 纯函数 Decide() 决策对象断言 (零 I/O / 零副作用)

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Decide } from '../scripts/route-core.mjs';

const root = path.resolve(import.meta.dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'config/router-manifest.json'), 'utf8'));

const GOLDEN_CASES = [
  {
    name: 'Case 1: 本次现场失败原句 (规范化测试覆盖设计) 必须路由至 testing',
    hint: '规范化测试覆盖设计，找找相关的skill我们现有的里面，并且都讲述一番',
    assert: (res) => {
      assert.equal(res.domain, 'testing', '必须分流至 testing 领域');
      assert.notEqual(res.domain, 'reverse', '绝不能分流至 reverse 领域');
      assert.ok(res.skills.includes('testing-core-oracle'), '必须包含 testing-core-oracle');
      assert.equal(res.action, 'dispatch');
      assert.equal(res.side_effects, 'none', '内核必须保证零副作用');
    }
  },
  {
    name: 'Case 2: 逆向典型任务 (Frida Hook + 小程序 sign 算法)',
    hint: '用 Frida hook 微信小程序 sign 签名算法并分析 so 文件',
    assert: (res) => {
      assert.equal(res.domain, 'reverse', '必须分流至 reverse 领域');
      assert.ok(res.skills.includes('reverse-skill-router'));
      assert.equal(res.action, 'dispatch');
      assert.equal(res.side_effects, 'none');
    }
  },
  {
    name: 'Case 3: 跨语言 FFI 嵌入测试配方 (Rust+V8)',
    hint: '设计跨语言 Rust+V8 FFI 运行时内存隔离契约测试',
    assert: (res) => {
      assert.equal(res.domain, 'testing');
      assert.equal(res.recipe, 'embed-ffi-greenfield', '必须命中 embed-ffi 配方');
      assert.ok(res.skills.includes('testing-scenario-embed-ffi'));
      assert.equal(res.side_effects, 'none');
    }
  },
  {
    name: 'Case 4: UI/UX 设计范式',
    hint: '为 Web 控制台设计全局响应式布局与交互设计规范',
    assert: (res) => {
      assert.equal(res.domain, 'ui', '必须分流至 ui 领域');
      assert.ok(res.skills.includes('ui-design-paradigms'));
      assert.equal(res.action, 'dispatch');
      assert.equal(res.side_effects, 'none');
    }
  },
  {
    name: 'Case 5: 无关自然语言 (拒识与交出控制权)',
    hint: '今天天气真好，出去散步晒太阳',
    assert: (res) => {
      assert.equal(res.domain, 'none', '未命中特征必须判定为 none');
      assert.equal(res.action, 'handoff', '动作必须为 handoff');
      assert.equal(res.skills.length, 0);
      assert.equal(res.side_effects, 'none');
    }
  },
  {
    name: 'Case 6: 显式点名测试包 (testing-python-idiom)',
    hint: '使用 testing-python-idiom 规范编写 pytest fixtures 与异常断言',
    assert: (res) => {
      assert.equal(res.domain, 'testing');
      assert.ok(res.skills.includes('testing-python-idiom'));
      assert.ok(res.skills.includes('testing-core-oracle'));
      assert.equal(res.action, 'dispatch');
      assert.equal(res.side_effects, 'none');
    }
  },
  {
    name: 'Case 7: 爬虫与数据清洗离线测试场景',
    hint: '针对爬虫数据采集与清洗管道编写离线 fixture 单元测试',
    assert: (res) => {
      assert.equal(res.domain, 'testing');
      assert.equal(res.recipe, 'scraper-pipeline', '必须命中 scraper 配方');
      assert.ok(res.skills.includes('testing-scenario-scraper'));
      assert.equal(res.side_effects, 'none');
    }
  },
  {
    name: 'Case 8: 空字符串输入防崩溃',
    hint: '   ',
    assert: (res) => {
      assert.equal(res.domain, 'none');
      assert.equal(res.action, 'handoff');
      assert.equal(res.side_effects, 'none');
    }
  }
];

let passed = 0;
let failed = 0;

console.log(`\n========== [ming-skills 路由决策内核黄金回归测试] ==========`);
for (const tc of GOLDEN_CASES) {
  try {
    const decision = Decide(tc.hint, manifest);
    tc.assert(decision);
    console.log(`[PASS] ${tc.name}`);
    passed++;
  } catch (err) {
    console.error(`[FAIL] ${tc.name}`);
    console.error(`       错误: ${err.message}`);
    failed++;
  }
}
console.log(`=============================================================`);
console.log(`结果: ${passed} 通过, ${failed} 失败\n`);

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
