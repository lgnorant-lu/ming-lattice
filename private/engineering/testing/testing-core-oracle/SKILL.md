---
name: testing-core-oracle
description: 测试元规则与判定中枢（Core Testing Oracle & Meta-Rules）：定义独立 Oracle 判定律、Agile 测试四象限、FIRST 原则、Goodhart 覆盖率禁令、同义反复与实现绑定防范、质量属性（安全/性能/可观测性）横切规范，以及多包加载时的组合协议（Composition Protocol）。触发词：test-strategy, testing-philosophy, oracle, test-review, test-quality, code-testing, verification-strategy.
---

# Testing Core Oracle — 测试元规则与判定中枢

> **核心定义**：测试真正回答的问题是「如果这段代码的行为错了，测试会不会失败？」，而不是「这段代码有没有被执行过？」。
> 100% 覆盖率与 0% 有效断言可以完全共存。测试的根本价值在于提供**独立于生产代码实现之外的判定依据（Oracle）与证伪能力**。

## 使用边界

先区分审阅、解释、规划与实施。用户只要求审阅时，按 [审阅流程](references/review.md) 输出证据与适配矩阵，不因加载了工作流就修改业务代码、更新 Golden、安装工具或提交。检查已有测试命令的副作用后，才在允许的范围内运行。预言机形态选型、范式缩写消歧（MT/PBT/DbC/CDC）与正交选型清单参见 [预言机形状与范式消歧](references/oracle-shapes-and-disambiguation.md)。B 级质量属性（性能/隐私/韧性等）在测试族的横切落点见 [overlays](references/overlays.md)；组合规范机读源见 [compose.yaml](references/compose.yaml)。

---

## 1. 核心禁令（Testing Invariants & Bans）

在任何场景、任何语言、任何驱动流程下，所有测试必须遵守以下铁律：

### [禁止] 禁令一：Goodhart 覆盖率完成指标禁令
- **严禁**将「追求 100% 代码行/分支覆盖率」作为 AI 或开发者的交付目标。
- **定位**：代码覆盖率是**事后探照灯**（用于发现完全未触及的高风险盲区），而不是质量成绩单。
- **危害**：把覆盖率作为考核目标会稳定诱发：
  - 给 getter/setter 或无逻辑胶水函数编写空转测试；
  - 过度 Mock 所有错误分支，只断言「某个内部依赖被调用过」；
  - 为了覆盖冷门行而构造与业务语义无关的垃圾测试。

### [禁止] 禁令二：同义反复测试禁令（No Confirmation Tests）
- **严禁**在同一次测试中由被测实现计算期望值，或把未经独立核验的当前输出宣称为正确规格。阅读实现用于理解风险，不等于测试无效。
- **危害**：当实现和期望共享同一个错误时，测试无法证伪该错误。已知好样本必须说明其来源，不能仅凭文件名叫 Golden 就当作正确答案。
- **要求**：断言必须来自**独立需求、外部标准协议、数学不变量、已知好样本（Golden Samples）或明确定义的错误码契约**。
- **表征例外**：允许在修改前捕获独立保存的 `kind: characterize` 基线，用于证明行为未变；它不证明原行为正确。注明原始版本、输入、捕获方式和已知缺陷。修 Bug 时新增 `kind: spec` 的独立期望，审查有意差异，不盲目更新全部基线。

### [禁止] 禁令三：实现细节焊死禁令（Ian Cooper 律）
- **严禁**为每个内部私有类/内部辅助函数单独编写单测。
- **定位**：被测系统（SUT, System Under Test）是**模块的公开行为门面（Public API / Seam）**，而非内部实现细节。
- **判定标准**：如果对模块内部进行等价重构（行为不变，仅调整私有代码结构），现有测试**不应该发生任何编译错误或失败**。若重构即爆红，说明测试测的是实现而非行为。

---

## 2. 意图诊断：Agile 测试四象限（Testing Quadrants）

在动手编写测试前，必须明确当前测试的**目标受众**与**核心目的**，防止精力错配：

```
                    面向技术 (Technology-Facing)
                               │
               Q1: 支撑团队 (引导开发) │ Q4: 批判产品 (发现系统未知)
                               │
            • 单元测试 / 模块门面测试    │ • 性能基准与分配阶数 (Criterion)
            • 类型系统约束与静态分析    │ • 安全 Fuzzing (畸形输入/越界)
            • 纯逻辑不变量验证          │ • 内存泄漏与并发竞争 (Miri/Race)
            ───────────────────────────┼───────────────────────────
            Q2: 支撑业务 (验证意图)     │ Q3: 批判产品 (体验与探索)
                               │
            • BDD / 验收场景契约       │ • 探索性测试与真实用例演练
            • CLI 参数与退出码规格     │ • 真实流量回放与差异对比
            • API / 跨语言交互契约     │ • 极端边界探索
                               │
                    面向业务 (Business-Facing)
```

- **Q1 (支撑团队·技术)**：纯逻辑单元、状态机迁移、算法性质。
- **Q2 (支撑业务·技术/功能)**：Given/When/Then 验收场景，对外输出结构。
- **Q3 (批判产品·业务)**：复杂链路的边界探索与真实用户路径。
- **Q4 (批判产品·技术)**：质量属性验证（抗攻击、吞吐阶数、无泄漏）。

---

## 3. FIRST 属性与 Flaky 零容忍政策

所有自动化测试套件必须具备良好的工程物理属性：

- **Fast（秒级反馈）**：单测与轻量集成必须能在数秒内完成，否则测试套件会逐渐被开发者跳过。
- **Isolated（独立无序）**：每个用例生命周期独立，不得依赖全局状态或用例执行先后顺序。
- **Repeatable（确定性重放）**：相同输入必须产生绝对一致的结果。
- **Self-validating（自决通过）**：测试结果是绝对的 Pass/Fail，无需依赖人眼审查控制台输出。
- **Timely（时机恰当）**：尽量在行为被固化之前定义好断言。

### [警告] Flaky（偶发抖动）治理政策
- **根因分析**：Flaky 通常由未控制的非确定性因素（系统时钟、随机数、外部真网络、多线程竞态、共享全局状态）引起。
- **硬性约束**：
  1. 严禁在测试中使用 `sleep(N)` 来等待异步操作，必须等待明确的**可观察状态条件**。
  2. 业务断言依赖时间时，注入可控时钟；测试超时保护和独立基准可使用单调时钟，不把机器速度当功能 Oracle。
  3. 随机失败必须可重放：保留种子、最小反例和运行参数。固定回归种子与探索新种子并存，不能永远只探索同一组输入。

---

## 4. 测试套件形状与成本启发式

测试套件的形状取决于业务逻辑所处的层级与调用成本，而非机械教条：

| 形状模型 | 适用场景 | 核心权衡 |
|---|---|---|
| **测试金字塔 (Pyramid)** | 后端服务、CLI 工具、解析引擎 | 纯逻辑厚、外部 IO 边界清晰。以大量秒级单测/模块测试为底座，极少端到端。 |
| **测试奖杯 (Trophy)** | 前端 UI、富客户端、跨模块集成 | 静态类型垫底，重心放在「用户可观察的组件/集成行为」，减少纯单测。 |
| **测试蜂巢 (Honeycomb)** | 微服务网格、分布式数据管道 | 重点在模块间契约与数据流集成，纯单测与全系统 E2E 均较薄。 |

### Google Size vs. Scope 正交法则
- **Size（资源开销）**：Small（纯内存单线程、无磁盘/网络）、Medium（允许单机文件/本地端口）、Large（跨机、多进程、真实外部系统）。
- **Scope（验证范围）**：Narrow（单个函数/状态机）、Medium（模块门面）、Wide（全系统端到端）。
- **原则**：**能在 Small 尺寸下完成验证的逻辑，绝不拉起 Large 环境。**

---

## 5. 质量属性横切规范（Quality Attributes Overlay）

安全、性能与可观测性不是项目后期的增补模块，而是必须与正确性并列的**一等测试不变量**：

### [安全] 安全质量属性（Security Overlay）
- **Oracle**：定义「**绝对不允许发生的状态**」（如沙箱逃逸、未授权内存访问、敏感凭据外泄）。
- **测试手段**：
  - **Fuzzing 模糊测试**：对所有外部不可信输入（字节流、字符串、反序列化包）进行随机变异撞击，断言系统产生结构化 `Err` 而非崩溃/UB（Undefined Behavior）。
  - **边界越界断言**：验证权限、路径穿越（`../`）、内存上限在越界时被立即阻断。

### [性能] 性能质量属性（Performance Overlay）
- **严禁**在日常功能测试中写「执行耗时必须 < 5ms」这种依赖机器配置的脆弱断言。
- **有效断言方式**：
  - **内存分配阶数验证**：断言对 N 个元素的处理保持 O(1) 或 O(N) 分配，无额外无界扩张。
  - **独立基准任务**：通过专用基准工具（如 Criterion）跟踪版本间回归趋势，设置 CI 性能衰减阈值。

### [可观测性] 可观测性与日志（Telemetry Overlay）
- **严禁**断言日志中的自然语言文学描述（避免日志微调导致测试全红）。
- **有效断言方式**：
  - 断言关键异常路径上触发了**结构化的错误事件（Error Code / Context Fields）**。
  - 断言输出的追踪链（Trace ID / Span ID）跨边界传递未丢失。

---

## 6. 组合协议（Composition Protocol）

按工作项组合，不按整个仓库强选一种语言或工作流：

```text
审阅：Oracle + 按需语言/场景/质量参考；不激活实施司机
实施：Oracle + 已确认语言包 + 0..N 个适用场景 + 1 个当前阶段工作流
加深：按风险增加性质/变异测试；跨语言边界可加载多个语言包
```

`compose.yaml` 的 workflow 互斥只约束同一工作项、同一实施阶段。盘点时可比较两个工作流；棕场中的新行为可以先锁基线，再按独立规格修改。语言或场景证据不足时标记待确认，不默认 Rust、Python 或 FFI。

### 组合匹配矩阵：

```
[testing-core-oracle] (全局强制基石)
        │
        ├── 场景特化 (Scenario) ──┬── [testing-scenario-cli] (CLI/脚本工具)
        │                         ├── [testing-scenario-scraper] (爬虫/数据管道)
        │                         └── [testing-scenario-embed-ffi] (V8/JS补丁/PyO3)
        │
        ├── 语言机制 (Language)  ──┬── [testing-rust-idiom] (cfg(test)/Miri/Proptest)
        │                         ├── [testing-python-idiom] (pytest/fixtures/Hypothesis)
        │                         ├── [testing-go-idiom] (表驱动/原生Fuzz)
        │                         └── [testing-js-idiom] (Vitest/DOM/Node隔离)
        │
        └── 工作流驱动 (Driver)  ──┬── [testing-workflow-spec] (绿场: Spec/BDD验收先行)
                                  ├── [Pocock tdd / Obra TDD] (严格红绿小步循环, 二选一)
                                  └── [testing-workflow-characterize] (棕场: Golden锁现状)
```

---

## 7. 参考文献索引

完整学术条目、行业规范与明确不纳入正文的清单详见 [测试引用与文献边界](references/sources.md)。

主要理论源流：
- **TDD 与行为契约**：Kent Beck (*Canon TDD*), Ian Cooper (*Seam Testing*), Martin Fowler (*Test Pyramid*)
- **性质测试与蜕变验证**：Claessen & Hughes (*QuickCheck*), T.Y. Chen et al. (*Metamorphic Testing*, CSUR 2018)
- **边界规约与语言安全**：Bertrand Meyer (*DbC*), Ian Robinson (*CDC*), Alexis King (*Parse, don't validate*), IAB RFC 9413 (*Robustness Principle Critique*)

