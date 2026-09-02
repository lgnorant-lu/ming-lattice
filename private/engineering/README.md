# 软件工程质量与规范总族 (Engineering Meta-Paradigms)

本目录收录跨场景可携带的**软件工程元规范与质量属性体系**（包含 A 列 4 大元规范包、B 列质量 Overlay 单包，以及测试子规范族）。

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
├── docs-core-paradigm/                # [A列-文档] Diataxis 四体裁、ADR 决策留痕、第一事实源
├── obs-core-paradigm/                 # [A列-可观测] 宽结构化事件、相关 ID 穿透、脱敏红线
├── sec-core-paradigm/                 # [A列-安全] 不可信输入、最小权限、OWASP AST01~10 供应链
├── contract-core-paradigm/            # [A列-契约] 演进五条（只加不改义）、破坏升版本、宽容读取
└── overlay-core-paradigm/             # [B列-横切] 性能、隐私、韧性、成本、兼容、无障碍
```

---

## 2. 跨项目立项装配总公式 (Universal Compose)

未来在任何新项目立项时，Agent 只需遵循同一套极简组合公式：

```
Project Stack = 1 个开发工作流 (spec / characterize)
              + 1 套测试组合 (oracle + 场景 + 语言)
              + [按需] A 列工程元包 (docs | obs | sec | contract)
              + [按需] B 列质量横切包 (overlay-core-paradigm)
              + 该层 scenes/<scene>.md 场景形态差
```

---

## 3. 层间硬性契约闭环

- **文档 Reference** $\longleftrightarrow$ **数据契约 Schema**（单一事实源，绝不手抄第二真相）；
- **可观测 `error_code`** $\longleftrightarrow$ **契约枚举** $\longleftrightarrow$ **测试断言**（同一语义字典）；
- **安全在契约之前**（未知字段可宽容忽略，未知命令绝对不可执行）。
