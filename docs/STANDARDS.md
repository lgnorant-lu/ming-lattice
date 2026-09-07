# ming-skills 仓库工程、测试与治理规范总纲 (STANDARDS)

本文档是 `ming-skills` 作为独立主权技能中枢（Skills Hub & Monorepo）的**核心治理总纲**。所有自研技能开发、测试验证、上游生态吸收与提交发布必须严格遵守本文档所列标准。

---

## 1. 提交规范（Commit Standards）

本仓库遵循严格的 **Conventional Commits 规范 + 铁律约束**，提交信息由 Git Hooks（`commit-msg`）进行自动化门禁拦截。

### 1.1 提交格式
```
<type>(<scope>): <中文描述>

- 详细变更点 1
- 详细变更点 2
```

### 1.2 Type 白名单
| Type | 语义说明 | 适用场景示例 |
|---|---|---|
| `feat` | 新增功能/技能 | 新增自研测试包、UI 范式、新部署模块 |
| `fix` | 缺陷修复 | 修复 SKILL.md 路径、修复脚本 Bug、修复字符编码 |
| `chore` | 生态同步与日常维护 | 上游增量拉取、`registry.yaml` Pin 刷新、配置变更 |
| `docs` | 文档与架构地图 | 更新 STANDARDS、CLAUDE.md、SKILL-INDEX.md |
| `style` | 格式与排版 | Markdown 缩进、空格排版、代码格式微调 |
| `refactor` | 重构与优化 | 目录结构调整、脚本模块化重构 |
| `test` | 测试与验证 | 新增自动化测试脚本、测试桩数据补充 |
| `perf` | 性能提升 | 缓存检测优化、增量 Fetch 加速 |
| `collect` | 垂直生态采集 | 引入新的外部 Vendored 参考仓库 |
| `sync` | 客户端部署同步 | 调整 `.cc-switch/skills` 部署目标映射 |

### 1.3 提交铁律
1. **Emoji 绝对禁令**：全仓库（文档、技能、代码、Commit Message）**严禁使用任何 Unicode Emoji 装饰符**。一律使用 `[禁止]`、`[警告]`、`[性能]`、`[契约]` 等结构化文本标签代替。
2. **原子性提交（Atomic Commits）**：
   - 自研功能/测试包落地（`feat:`）与上游依赖同步（`chore:`）必须**分步提交**，严禁混杂成单个巨型提交；
   - 包含上游生态增量时，必须在 Commit 正文中清晰列出变更的仓库名称、Commit Hash 与核心改动。
3. **中文描述先行**：标题统一采用中文描述，Scope 必须采用小写字母（如 `(testing-rust)`、`(registry)`、`(hooks)`）。

---

## 2. 测试规范体系与 Oracle 质量治理

本仓库内嵌完整的 **11 包测试规范族（testing-family）**，由 [`private/engineering/testing/testing-core-oracle`](../private/engineering/testing/testing-core-oracle/SKILL.md) 作为元规则中枢。

### 2.1 测试分层与四大禁令
1. **独立判定律（Test Oracle）**：测试代码必须具备独立的期望来源，严禁「调用生产代码获取结果后再断言结果等于该结果」（同义反复）。
2. **三项铁律禁令**：
   - **Goodhart 禁令**：禁止为刷高覆盖率指标而编写无实际断言的空测试。
   - **同义反复禁令**：禁止在测试中复制被测函数的业务算法逻辑。
   - **Ian Cooper 门面原则**：禁止对私有实现细节进行侵入式断言；测试应绑定公共可观察行为。
3. **质量属性 Overlay**：覆盖确定性（FIRST 原则）、可诊断性（失败时输出可读 Diff）与密封性（测试间零状态残留）。

### 2.2 组合路由拓扑（Composition Routing）
Agent 在执行项目测试任务时，按 [`private/engineering/testing/testing-core-oracle/references/compose.yaml`](../private/engineering/testing/testing-core-oracle/references/compose.yaml) 选择适用组合。审阅时不激活实施司机，实施时同一工作项最多选择一个 workflow：

```text
Active Skills = testing-core-oracle + 当前 workflow（实施时最多一个）
                + 已确认语言 + 适用场景 + 按风险选择的深度验证
```

- **绿场行为**：`testing-core-oracle` + `testing-workflow-spec` + 已确认语言/场景包
- **棕场保行为**：`testing-core-oracle` + `testing-workflow-characterize` + 已确认语言/场景包
- **仓库审阅**：`testing-core-oracle` + `references/review.md`；不自动加载 workflow

---

## 3. 上游生态吸收与 Dry-run 运行规范

为确保上游社区仓库更新不会破坏本仓库的自洽性，建立“缓存读取/网络检查/显式应用”分层流程。DryRun 只预览，不联网、不写 registry：

### 3.1 变更检测（Dry-run 优先）
```powershell
# 1. 默认检测（读取 TTL 缓存，零网络开销）
pwsh scripts/update.ps1

# 2. 演练预览（-DryRun 开关，零网络且不修改本地 registry.yaml）
pwsh scripts/update.ps1 -Force -DryRun

# 3. 指定目标检测
pwsh scripts/update.ps1 -Name decode-js
```

### 3.2 增量拉取与吸收标准流程
1. **审查检测报告**：查看 `update.ps1` 输出的可更新清单与 Commit 摘要；DryRun 的 `NOT_CHECKED` 不是“最新”；
2. **安全与凭据初筛**：拉取前评估上游变更，严禁引入未经脱敏的真实生产密钥；
3. **增量拉取与检出**：
   ```powershell
   git -C vertical/<name> fetch --depth 1 origin main
   git -C vertical/<name> checkout FETCH_HEAD
   ```
4. **刷新事实源**：更新 [`registry.yaml`](../registry.yaml) 中对应条目的 `pin` 与 `acquiredAt`；
5. **门禁全量验收**：
   ```powershell
   pwsh scripts/lint.ps1    # 必须 ERROR=0
   ```
6. **原子提交**：执行 `chore: 上游生态增量拉取与 registry pin 刷新`。

### 3.3 客户端分发与部署（Sync Dry-run）
```powershell
# 演练部署（-WhatIf / -DryRun 查看软链变更，不写入磁盘）
pwsh scripts/sync.ps1 -DryRun

# 实际部署（创建符号链接至 .cc-switch/skills）
pwsh scripts/sync.ps1
```

---

## 4. 编码与工程防污染契约

1. **UTF-8 without BOM 强制标准**：
   - 仓库内所有 `.md`、`.yaml`、`.json`、`.ps1`、`.js` 必须采用纯正 UTF-8 编码存储；
   - 严禁使用 Windows PowerShell 5.1 默认重定向操作符（`>` / `Set-Content` 未指定编码）写入非 ASCII 字符，避免引入 GBK 转义乱码；
   - 统一使用 Node.js 工具链或 PowerShell 7+ `[System.IO.File]::WriteAllText` 确保字符完整。
2. **大文件防御基线**：
   - 严禁将超过 `50MB` 的二进制、多媒体（`*.mp4`）或归档压缩包（`*.tar.gz`、`*.zip`）加入 Git 版本控制；
   - 任何大型外部样本必须通过 `.gitignore` 过滤，或通过 Git LFS 外部托管。
3. **单一事实源原则（Single Source of Truth）**：
   - 客户端激活状态、路径映射与版本 Pin 仅由 [`registry.yaml`](../registry.yaml) 统一声明，严禁在客户端目录手动修改产生漂移。

---

## 5. 数据契约演进五条禁令

为了确保跨 Harness 消费端的长期稳定性，公开 Schema（如 `RouteDecision`, `RouterManifest`）的演进必须遵守以下规则。字段以 schema 为准，v2 的模式与安全退回见 [ADR-0005](adr/ADR-0005-review-safe-routing.md)：

1. **[禁止] 随意删除已有字段**：已发布的公开字段（如 `domain`, `candidates`, `active_recipe`）严禁直接移除，避免下游解析直接崩溃；
2. **[禁止] 修改已有字段的语义与类型**：字段名称与数据类型的映射必须不可变（例如 `confidence` 不得从 `string` 改为 `number`）；
3. **[强制] 破坏性变更必须升级顶级版本号**：若出现不可调和的结构破坏，必须升级 `schemaVersion`（如从 `1.0` 升级为 `2.0`）；
4. **[规范] 多版本共存显式演进**：若未来出现 v1/v2 并存需求，遵循双读单写（Dual-read Single-write）过渡期机制；
5. **[规范] 读取端宽容读取策略（Tolerant Reader）**：允许忽略未知数据字段，但未知控制命令、模式、权限或版本必须安全退回，不能当作成功。

---

## 6. 宽结构化事件名规范（OTel 语义对齐）

以下是仓库级宽结构化事件命名。当前路由 CLI 已通过独立 NDJSON 文件旁路接入 `route.decided` / `route.failed`；这不是 OpenTelemetry exporter。实施时需保留已有的人读文本和 stdout 契约，并对事件值、关联 ID 和脱敏单独测试：

| 规范事件名 (event.name) | 触发场景 | 核心必填字段 |
|---|---|---|
| `route.decided` | `route-core.mjs` 完成一次路由决策 | `timestamp`, `hint_hash`, `domain`, `recipe`, `duration_ms` |
| `manifest.built` | `build-router-manifest.mjs` 编译完成 | `timestamp`, `domains_count`, `recipes_count`, `output_path` |
| `sync.completed` | `sync.ps1` 软链部署或演练完成 | `timestamp`, `linked_count`, `skipped_count`, `is_dry_run` |
| `lint.checked` | `lint.ps1` 全量静态门禁检查完成 | `timestamp`, `sources_checked`, `error_count`, `warn_count` |
| `test.suite_finished` | `tests/run.mjs` 测试套件运行完毕 | `timestamp`, `passed_suites`, `total_suites`, `duration_ms` |
| `sync.failed` | `sync.ps1` 遭遇致命读取或复制异常早退 | `timestamp`, `error_type`, `duration_ms` |

路由事件的机读字段见 [observability-event.schema.json](schemas/observability-event.schema.json)。启用方式为 `node scripts/route-core.mjs --event-file <path> [--work-unit-id <opaque-id>] <hint>`；不提供 `--event-file` 时不产生事件文件。事件只保留 `hint_hash`，并将失败原因收敛为稳定 `error_code`，不序列化异常消息。

工具链事件使用环境变量 `MING_SKILLS_EVENT_FILE` 作为旁路目标，`MING_SKILLS_WORK_UNIT_ID` 作为可选关联 ID；未设置事件文件时，`build-router-manifest.mjs`、`tests/run.mjs`、`lint.ps1` 和 `sync.ps1` 不增加输出或写盘。事件只记录计数、布尔状态、仓库相对路径和稳定错误类型，旁路写入失败不改变主命令退出码。

---

## 7. 供应链门禁与制品治理规范 (Supply-Chain & Artifact Governance)

为了防范恶意投毒与依赖漂移，仓库执行离线供应链溯源门禁与 CycloneDX / SCA 制品协同机制：

1. **制品生成与新鲜度门禁（Artifact Freshness Gate）**：
   - `artifacts/sbom.cdx.json`（CycloneDX 1.5 SBOM）与 `artifacts/sca.npm.json`（离线 SCA 审计报告）作为版本跟踪制品纳入受控管理；
   - 本地与 CI 门禁通过 `--check` 选项进行无损新鲜度校验（`node scripts/generate-supply-chain-sbom.mjs --check` 与 `node scripts/generate-supply-chain-sca.mjs --check`），只有 lockfile 产生实质变更时才触发重写。
2. **纯参考源例外准则（Reference-Only Exception Policy）**：
   - `vertical/` 中声明 `deploy: {}` 的条目（如 `js-reverse-ops`、`wire-mcp` 等）仅作离线代码与知识参考，不向任何 Agent 客户端直接挂载；
   - 此类包内若包含未提供 lockfile 的 `package.json`，供应链门禁将其识别为 `reference-only` 并降级为 `INFO` 提示，不阻断自动化测试与发布流程。
3. **离线隔离与网络零依赖（Offline Hermetic Verification）**：
   - 常规门禁和 CI 执行均强制 `network=not_used`，严禁在常规流水线中发起无受控的动态网络拉取；
   - 依赖更新与漏洞库比对采用定期受控任务，经由 `scripts/update.ps1` 与联网 SCA 扫描后受控提交流水线。

