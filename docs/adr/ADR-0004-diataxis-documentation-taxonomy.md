# ADR-0004: 采用 Diátaxis 框架进行文档四体裁分类治理

- **状态**: Accepted
- **日期**: 2026-09-02
- **决策者**: ming-skills 核心团队

---

## 1. 背景与上下文 (Context)

工程文档若将架构理念（Why）、操作指令（How-to）、技术参考（What）混写在同一篇大文档中，会导致篇幅膨胀、人读混乱，且后续会话中的 Agent 难以快速提取精准上下文。

---

## 2. 决策内容 (Decision)

引入国际金标准 **Diátaxis 框架**（`https://diataxis.fr`）与 **ADR 决策体系**，对仓库内全部文档明确划分体裁，杜绝第二真相：

| 体裁类别 | 核心受众与目的 | 本仓库对应文档与文件 |
|---|---|---|
| **Explanation（架构阐述）** | 解释设计理念、分层逻辑、为什么这么做 | `docs/ROUTER_ARCHITECTURE.md`, `docs/STANDARDS.md` |
| **Reference（机读参考）** | 权威事实源、Schema、参数、常量定义 | `docs/schemas/*.json`, `config/router-manifest.json`, `registry.yaml` |
| **How-to Guides（操作手册）** | 步骤清晰的任务解决流程与操作入口 | `docs/GIT_HOOKS.md`, `docs/TESTING.md`, `CLAUDE.md` |
| **ADR（架构决策记录）** | 历史上下文、决策依据、后果与防重开凭据 | `docs/adr/ADR-*.md` |

---

## 3. 后果与影响 (Consequences)

- **正面收益**：
  - 各类文档职责严格正交，避免“一篇文档包含万物”的臃肿现象；
  - Agent 在执行任务时可按需加载：查命令看 How-to，查契约看 Reference，查背景看 Explanation。
