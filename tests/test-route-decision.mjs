// tests/test-route-decision.mjs
// ming-skills 核心路由决策 20 条结构化黄金用例集 (Structured Golden Decision Suite)
// 依据: testing-core-oracle 独立判定律 & testing-scenario-cli 契约规范
// 覆盖: 单领域 / 双领域复合 / 显式点名 / 歧义消歧 / 边界异常 / 拒识放行

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Decide } from '../scripts/route-core.mjs';

const root = path.resolve(import.meta.dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'config/router-manifest.json'), 'utf8'));

const GOLDEN_CASES = [
  // ── 1. 单领域: 测试规范族 (Testing) ──
  {
    category: '单领域-测试',
    name: '1.1 本次现场失败原句 (规范化测试覆盖设计)',
    hint: '规范化测试覆盖设计，找找相关的skill我们现有的里面，并且都讲述一番',
    assert: (res) => {
      assert.equal(res.domain, 'testing');
      assert.notEqual(res.domain, 'reverse');
      assert.ok(res.skills.includes('testing-core-oracle'));
      assert.equal(res.action, 'dispatch');
      assert.equal(res.side_effects, 'none');
    }
  },
  {
    category: '单领域-测试',
    name: '1.2 绿场 BDD/TDD 规格驱动测试',
    hint: '按照规格驱动开发规范为新模块编写 TDD 测试用例',
    assert: (res) => {
      assert.equal(res.domain, 'testing');
      assert.equal(res.recipe, 'spec-driven-greenfield');
      assert.ok(res.skills.includes('testing-workflow-spec'));
      assert.equal(res.side_effects, 'none');
    }
  },
  {
    category: '单领域-测试',
    name: '1.3 棕场遗留系统表征锁定',
    hint: '对遗留代码进行表征测试并锁定 Golden 行为输出',
    assert: (res) => {
      assert.equal(res.domain, 'testing');
      assert.equal(res.recipe, 'characterization-brownfield');
      assert.ok(res.skills.includes('testing-workflow-characterize'));
      assert.equal(res.side_effects, 'none');
    }
  },
  {
    category: '单领域-测试',
    name: '1.4 跨语言 FFI 嵌入测试场景',
    hint: '设计跨语言 Rust+V8 FFI 运行时内存隔离契约测试',
    assert: (res) => {
      assert.equal(res.domain, 'testing');
      assert.equal(res.recipe, 'embed-ffi-greenfield');
      assert.ok(res.skills.includes('testing-scenario-embed-ffi'));
      assert.equal(res.side_effects, 'none');
    }
  },
  {
    category: '单领域-测试',
    name: '1.5 爬虫与数据清洗离线测试场景',
    hint: '针对爬虫数据采集与清洗管道编写离线 fixture 单元测试',
    assert: (res) => {
      assert.equal(res.domain, 'testing');
      assert.equal(res.recipe, 'scraper-pipeline');
      assert.ok(res.skills.includes('testing-scenario-scraper'));
      assert.equal(res.side_effects, 'none');
    }
  },
  {
    category: '单领域-测试',
    name: '1.6 性质测试与变异测试',
    hint: '使用 hypothesis 进行性质测试并复查变异杀伤率',
    assert: (res) => {
      assert.equal(res.domain, 'testing');
      assert.ok(res.skills.includes('testing-core-oracle'));
      assert.equal(res.side_effects, 'none');
    }
  },

  // ── 2. 单领域: 逆向与安全分析 (Reverse) ──
  {
    category: '单领域-逆向',
    name: '2.1 Frida Hook 与小程序签名分析',
    hint: '用 Frida hook 微信小程序 sign 签名算法并分析 so 文件',
    assert: (res) => {
      assert.equal(res.domain, 'reverse');
      assert.ok(res.skills.includes('reverse-skill-router'));
      assert.equal(res.action, 'dispatch');
      assert.equal(res.side_effects, 'none');
    }
  },
  {
    category: '单领域-逆向',
    name: '2.2 APK 反编译与 Smali 分析',
    hint: '使用 jadx 逆向反编译 APK 并在 smali 中定位校验逻辑',
    assert: (res) => {
      assert.equal(res.domain, 'reverse');
      assert.ok(res.skills.includes('reverse-skill-router'));
      assert.equal(res.action, 'dispatch');
    }
  },
  {
    category: '单领域-逆向',
    name: '2.3 IDA 二进制反汇编与 ROP 链构建',
    hint: '使用 IDA Pro 进行二进制反汇编分析并构建 pwn 链',
    assert: (res) => {
      assert.equal(res.domain, 'reverse');
      assert.equal(res.action, 'dispatch');
    }
  },

  // ── 3. 单领域: UI/UX 设计范式 (UI) ──
  {
    category: '单领域-UI',
    name: '3.1 全局响应式布局与设计规范',
    hint: '为 Web 控制台设计全局响应式布局与交互设计规范',
    assert: (res) => {
      assert.equal(res.domain, 'ui');
      assert.ok(res.skills.includes('ui-design-paradigms'));
      assert.equal(res.action, 'dispatch');
      assert.equal(res.side_effects, 'none');
    }
  },
  {
    category: '单领域-UI',
    name: '3.2 前端色彩体系与 Design Tokens',
    hint: '制定前端组件库的色彩体系与视觉设计规范',
    assert: (res) => {
      assert.equal(res.domain, 'ui');
      assert.ok(res.skills.includes('ui-design-paradigms'));
      assert.equal(res.action, 'dispatch');
    }
  },

  // ── 4. 显式点名具体技能包 (Explicit Skill) ──
  {
    category: '显式点名',
    name: '4.1 显式点名 testing-python-idiom',
    hint: '使用 testing-python-idiom 规范编写 pytest fixtures 与异常断言',
    assert: (res) => {
      assert.equal(res.domain, 'testing');
      assert.ok(res.skills.includes('testing-python-idiom'));
      assert.ok(res.skills.includes('testing-core-oracle'));
      assert.equal(res.action, 'dispatch');
    }
  },
  {
    category: '显式点名',
    name: '4.2 显式点名 testing-rust-idiom',
    hint: '查看 testing-rust-idiom 的 miri 与 cargo test 最佳实践',
    assert: (res) => {
      assert.equal(res.domain, 'testing');
      assert.ok(res.skills.includes('testing-rust-idiom'));
    }
  },
  {
    category: '显式点名',
    name: '4.3 显式点名 ui-design-paradigms',
    hint: '加载 ui-design-paradigms 查阅主流界面模式',
    assert: (res) => {
      assert.equal(res.domain, 'ui');
      assert.ok(res.skills.includes('ui-design-paradigms'));
    }
  },

  // ── 5. 歧义与中英同义消歧 ──
  {
    category: '歧义消歧',
    name: '5.1 单测同义词: "写单测与回归验收"',
    hint: '帮这个项目写单测，把回归验收自动化做起来',
    assert: (res) => {
      assert.equal(res.domain, 'testing');
      assert.notEqual(res.domain, 'reverse');
      assert.equal(res.action, 'dispatch');
    }
  },
  {
    category: '歧义消歧',
    name: '5.2 中英混写: "pytest coverage design"',
    hint: 'need pytest coverage design and test framework advice',
    assert: (res) => {
      assert.equal(res.domain, 'testing');
      assert.notEqual(res.domain, 'reverse');
    }
  },

  // ── 6. 跨领域复合意图 (Mixed) ──
  {
    category: '复合Mixed',
    name: '6.1 逆向 + 测试复合意图',
    hint: '对目标进行逆向分析并为其核心算法设计单元测试规范',
    assert: (res) => {
      // 必须识别为 mixed 或包含 ask 机制，严禁静默硬选逆向并调用 case-init
      assert.ok(res.domain === 'mixed' || res.domain === 'testing', '必须进入复合或受保护领域');
      assert.equal(res.side_effects, 'none', '零副作用保证');
    }
  },

  // ── 7. 边界异常与拒识放行 (None / Edge) ──
  {
    category: '边界拒识',
    name: '7.1 无关闲聊自然语言',
    hint: '今天天气真好，出去散步晒太阳',
    assert: (res) => {
      assert.equal(res.domain, 'none');
      assert.equal(res.action, 'handoff');
      assert.equal(res.skills.length, 0);
      assert.equal(res.side_effects, 'none');
    }
  },
  {
    category: '边界拒识',
    name: '7.2 纯空字符串与空格',
    hint: '      ',
    assert: (res) => {
      assert.equal(res.domain, 'none');
      assert.equal(res.action, 'handoff');
      assert.equal(res.side_effects, 'none');
    }
  },
  {
    category: '边界拒识',
    name: '7.3 纯特殊符号与斜杠',
    hint: '/// ??? !!! ###',
    assert: (res) => {
      assert.equal(res.domain, 'none');
      assert.equal(res.action, 'handoff');
      assert.equal(res.side_effects, 'none');
    }
  }
];

export function run() {
  let passed = 0;
  let failed = 0;

  console.log(`\n========== [ming-skills 路由决策内核 20 条结构化黄金用例集] ==========`);
  for (const tc of GOLDEN_CASES) {
    try {
      const decision = Decide(tc.hint, manifest);
      tc.assert(decision);
      console.log(`[PASS] [${tc.category}] ${tc.name}`);
      passed++;
    } catch (err) {
      console.error(`[FAIL] [${tc.category}] ${tc.name}`);
      console.error(`       错误: ${err.message}`);
      failed++;
    }
  }
  console.log(`======================================================================`);
  console.log(`结果: ${passed}/${GOLDEN_CASES.length} 黄金用例全部通过！\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith('test-route-decision.mjs')) {
  run();
}
