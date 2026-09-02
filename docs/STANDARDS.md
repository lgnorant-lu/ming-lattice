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

本仓库内嵌完整的 **11 包测试规范族（testing-family）**，由 [`private/testing-core-oracle`](file:///d:/dogepy/skills-collection/private/testing-core-oracle/SKILL.md) 作为元规则中枢。

### 2.1 测试分层与四大禁令
1. **独立判定律（Test Oracle）**：测试代码必须具备独立的期望来源，严禁「调用生产代码获取结果后再断言结果等于该结果」（同义反复）。
2. **三项铁律禁令**：
   - **Goodhart 禁令**：禁止为刷高覆盖率指标而编写无实际断言的空测试。
   - **同义反复禁令**：禁止在测试中复制被测函数的业务算法逻辑。
   - **Ian Cooper 门面原则**：禁止对私有实现细节进行侵入式断言；测试应绑定公共可观察行为。
3. **质量属性 Overlay**：覆盖确定性（FIRST 原则）、可诊断性（失败时输出可读 Diff）与密封性（测试间零状态残留）。

### 2.2 组合路由拓扑（Composition Routing）
Agent 在执行项目测试任务时，必须严格按照 [`private/testing-core-oracle/references/compose.yaml`](file:///d:/dogepy/skills-collection/private/testing-core-oracle/references/compose.yaml) 进行标准装配：

$$\text{Active Skills} = \text{testing-core-oracle} + \text{1 Workflow} + \text{1 Idiom} + [\text{N Scenario}] + [\text{Deep Verification}]$$

- **标准配方 1（绿场全栈驱动）**：`oracle` + `workflow-spec` + `rust-idiom` + `scenario-cli`
- **标准配方 2（棕场逆向/存量表征）**：`oracle` + `workflow-characterize` + `python-idiom` + `scenario-embed-ffi`
- **标准配方 3（数据采集流水线）**：`oracle` + `workflow-spec` + `python-idiom` + `scenario-scraper`

---

## 3. 上游生态吸收与 Dry-run 运行规范

为确保上游 92 个社区仓库更新不会破坏本仓库的自洽性，建立**两阶段 Dry-run 雷达工作流**：

### 3.1 变更检测（Dry-run 优先）
```powershell
# 1. 默认检测（读取 TTL 缓存，零网络开销）
pwsh scripts/update.ps1

# 2. 演练检测（-DryRun 开关，强制网络扫描且不修改本地 registry.yaml）
pwsh scripts/update.ps1 -Force -DryRun

# 3. 指定目标检测
pwsh scripts/update.ps1 -Name decode-js
```

### 3.2 增量拉取与吸收标准流程
1. **审查雷达报告**：查看 `update.ps1` 输出的可更新清单与 Commit 摘要；
2. **安全与凭据初筛**：拉取前评估上游变更，严禁引入未经脱敏的真实生产密钥；
3. **增量拉取与检出**：
   ```powershell
   git -C vertical/<name> fetch --depth 1 origin main
   git -C vertical/<name> checkout FETCH_HEAD
   ```
4. **刷新事实源**：更新 [`registry.yaml`](file:///d:/dogepy/skills-collection/registry.yaml) 中对应条目的 `pin` 与 `acquiredAt`；
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
   - 客户端激活状态、路径映射与版本 Pin 仅由 [`registry.yaml`](file:///d:/dogepy/skills-collection/registry.yaml) 统一声明，严禁在客户端目录手动修改产生漂移。
