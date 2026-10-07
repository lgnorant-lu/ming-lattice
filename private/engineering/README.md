# 软件工程质量与规范总族 (Engineering Meta-Paradigms)

本目录收录跨场景可携带的**软件工程元规范与质量属性体系**（包含 A 列 6 大元规范包、B 列质量 Overlay 单包，以及测试子规范族）。

---

## 1. 资产全景

```
private/engineering/
├── testing/                           # [测试规范子族] 11 包四层解耦模型 (详见 testing/README.md)
│   ├── testing-core-oracle/           # 测试元判定律
│   ├── testing-workflow-*/            # 绿场/棕场工作流
│   ├── testing-*-idiom/               # 4 语言地道测试
│   ├── testing-scenario-*/            # 3 大场景特化
│   └── testing-property-mutation/     # 性质变异
│
├── docs-core-paradigm/                # [A列-文档内容] Diataxis 四体裁、ADR 决策留痕、第一事实源
├── docs-presentation-idiom/           # [A列-文档表现] GitHub Markdown 视觉排版、动线与去疲劳
├── obs-core-paradigm/                 # [A列-可观测] 宽结构化事件、相关 ID 穿透、脱敏红线
├── sec-core-paradigm/                 # [A列-安全] 不可信输入、最小权限、OWASP AST01~10 供应链
├── contract-core-paradigm/            # [A列-契约] 演进五条（只加不改义）、破坏升版本、宽容读取
├── config-core-paradigm/              # [A列-配置] 十轴模型、组合解析、旗标生命周期、复杂度时钟
├── overlay-core-paradigm/             # [B列-横切] 性能、隐私、韧性、成本、兼容、无障碍
├── arch-core-paradigm/                # [A列-架构] 六边形/Ports-Adapters 最小形态、迁移接缝
├── review-core-paradigm/              # [A列-评审] 消融实验摘除存活性、独立上下文 critic、人筛回喂、证据收尾
├── review-signal-audit/               # [A列-评审] 静态信号面位错审计（五病型 taxonomy + sweep→harvest 收割晋升门禁提案）
├── repo-presentation/                 # [A列-呈现] 版本通道判据（alpha/beta/rc 冻结面+浸泡）+ Semver/PEP440 双轨 + README 件隐私分层 + GFM 高级件 + CLI 人格面抑制契约
├── explore-core-paradigm/             # [A列-发散] 承诺前候选生成：升降模型 + VS尾部采样/异策略/形态学矩阵/premortem + disagree续探agree承诺
├── depth-core-paradigm/               # [A列-裁决] finding 下潜深度：动态序贯下潜 + 静态先验绊线 + 可行动性停止判据
├── mutation-safety-paradigm/          # [A列-变更安全] L0-L5 阶梯 + dry-run 三戒律（同路径/输出同构/零副作用）+ 变更类声明
├── classify-core-paradigm/            # [A列-分类] 六公理：分面优于鸽笼/决策分化律/封闭词表/豁免排气阀/三平面分离/容忍分层
├── compiler-pipeline-paradigm/        # [A列-方法论] 编译器九段契约（lex→link）+ 质量vs编译延迟取舍 + 抽象机选型
├── vendor-paradigm/                   # [A列-入库] 第三方内容物化范式（清单即锁/孤本例外/物化器契约）
├── ming-l-paradigm/                   # [A列-方法论] Ming-L 九域分层（项目结构规范总图）、粒度分级、候审档
├── ming-skill-forge/                  # [A列-方法论] 技能包创作规程 + check-skill.mjs 硬门控
├── ming-experience-direction/         # [A列-方法论] 体验导演式设计流水线（文档阶梯/宪法/叙事主干/六门过审/媒介预算）
└── ming-boundary/                     # [组件] 项目图事实提取(JSONL) + boundaries.yaml 边界契约断言 (ADR-0008)
```

---

## 2. 跨项目立项装配总公式 (Universal Compose)

未来在任何新项目立项时，Agent 只需遵循同一套极简组合公式：

```
Project Stack = 1 个开发工作流 (spec / characterize)
              + 1 套测试组合 (oracle + 语言 + [按需] 场景)
              + [按需] A 列工程元包 (docs | docs-presentation | obs | sec | contract | config | arch | review | review-signal | explore | depth | mutation-safety | classify | ming-l | experience-direction | repo-presentation)
              + [按需] B 列质量横切包 (overlay-core-paradigm)
              + 该层 scenes/<scene>.md 场景形态差
```

---

## 3. 层间硬性契约闭环

- **文档 Reference** $\longleftrightarrow$ **数据契约 Schema**（单一事实源，绝不手抄第二真相）；
- **可观测 `error_code`** $\longleftrightarrow$ **契约枚举** $\longleftrightarrow$ **测试断言**（同一语义字典）；
- **安全在契约之前**（未知字段可宽容忽略，未知命令绝对不可执行）。
