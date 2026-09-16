# ming-skills

Ming 的 Agent 技能集散与工程中枢（Skills Hub & Monorepo）：统一管理测试规范族、逆向与安全知识库、垂直参考生态与部署分发，具备确定性配方路由（Skill Router）、离线优先供应链治理与分层自动化门禁流水线。

---

## 1. 资产体系与规模基线

仓库采用四层清晰解耦的资产架构。全仓所有技能、模块与参考源均由 `registry.yaml` 作为单一事实源（Single Source of Truth）进行配置治理：

| 资产层次 | 目录路径 | 规模与构成 | 治理与部署策略 |
|---|---|---|---|
| **Base（底座层）** | `base/reverse-skill/` | **1 个基座（20 个已启用模块）**<br>submodule 跟踪 upstream 逆向体系 | 按需通过 `base[].modules` 声明并分发至客户端 |
| **Vertical（参考层）** | `vertical/` | **94 个垂直参考库**<br>涵盖前端混淆、二进制、移动端与爬虫案例 | 离线 vendored 归档；`deploy:{}` 仅作只读参考 |
| **Deployable（包装层）** | `deployable/` | **24 个包装技能**<br>本地封装门面、去重清洗与定制包装 | 映射包装并分发至目标客户端环境 |
| **Private（自研层）** | `private/` | **24 个核心自研技能**<br>测试规范体系族、UI 设计范式、路由内核 | 核心自研资产；深度受控部署与规则锁定 |

- **Lint 校验源基线**：全仓由 `scripts/lint.ps1` 校验 **162 处入口源**（$20 + 94 + 24 + 24 = 162$），保证 frontmatter、相对引用与入口脚本完整性。
- **路由编排技能**：由 `config/router-manifest.json` 策划并受控编排 **37 个唯一技能**，分布于 5 大核心领域及 13 条可执行配方。
- **供应链依赖基线**：离线 CycloneDX 1.5 SBOM 聚合 **1083 个依赖组件**；SCA 扫描覆盖 **38 个 lockfile**（离线缓存 0 advisory findings）。
- **自动化质量门禁**：测试套件矩阵包含 **17 个独立测试套件**，覆盖单元、契约、隔离集成、效果评估与性能基准。

---

## 2. 技能路由与配方内核（Skill Router）

为了防止大模型在复杂任务中产生技能选择漂移或无序加载，仓库自研了客户端无关的纯函数路由决策内核：

```text
用户输入意图 (Task Prompt)
  │
  ▼
[route-core.mjs] 纯函数决策内核
  ├─ 识别任务模式: review | explain | plan | implement
  ├─ 净化过滤: 剥离 Markdown 引用块、代码围栏与否定前缀 (如 "不要使用 apk-reverse")
  ├─ 词边界匹配 (Word Boundary Token Matching)
  └─ 确定性装配: 领域 (Domain) + 候选集 (Candidates) + 核心配方 (Recipe)
  │
  ▼
[RouteDecision v2.0.0]
  ├─ allowCaseInit: false (fail-closed 恒定关闭，严禁越权创建工单)
  ├─ active_recipe: 对应 13 条工程级配方，装配唯一技能清单
  └─ adapt() 适配层: 纯映射至宿主 Harness，安全拒绝未知协议
```

### 核心领域分布

| 领域 (Domain) | 包含技能示例 | 典型适用场景 |
|---|---|---|
| **testing** | `testing-core-oracle`, `testing-python-idiom`, `testing-rust-idiom`, `testing-property-mutation` | 绿场规格驱动开发、遗留系统表征测试、FFI 跨语言嵌入测试、性质测试 |
| **reverse** | `apk-reverse`, `ida-reverse`, `hello-js-reverse`, `frida-hook` | Android APK 脱壳与分析、IDA 静态反编译、前端 JS 混淆还原、二进制逆向 |
| **ui** | `ui-design-paradigms`, `ui-interaction-specs` | 全局响应式布局、设计系统 Tokens、前端交互与组件规范 |
| **engineering** | `engineering-layer-packs`, `docs-core-paradigm`, `contract-core-paradigm` | 真实工程自举、文档体系构建、架构规范与契约设计 |
| **protocol** | `mcp-builder` | 外部 Model Context Protocol 协议集成与标准化插件设计 |

---

## 3. Git Hooks 门禁与流水线架构（A+B+C）

仓库具备工业级 Git Hook 门禁体系，兼顾日常提交极速响应与远端推送安全底线：

```text
[git commit] ───────────────────► pre-commit Hook
                                    │
                                    ├─ 1. 批量静态扫描 (git cat-file --batch-check)
                                    │     大文件 (>50MB) / 编码 (0 GBK 乱码) / 凭据防泄漏 / 0 Emoji
                                    │
                                    └─ 2. 显式影响面计划器 (scripts/hooks/plan.mjs)
                                          ├─ 纯文档变更 -> 0 个测试，秒级放行 (实测 0.52s)
                                          ├─ 局部代码变更 -> 仅调度受影响套件 (如 CLI 场景耗时 ~16s)
                                          └─ 全局核心配置/未知路径 -> fail-closed 自动升级全量

[git push] ─────────────────────► pre-push Hook
                                    │
                                    ├─ 解析 push ref 范围 (过滤分支删除操作)
                                    └─ 运行全量本地质量门禁 (scripts/verify.mjs --profile full)

[CI / 发布] ────────────────────► CI 严苛门禁
                                    └─ verify.mjs --profile release (全量 + 新鲜度防篡改 + P95 硬基准)
```

### 质量门禁编排器 `scripts/verify.mjs`

```bash
# 1. 快速模式：纯 Node 逻辑契约/单元测试 (跳过外部 PowerShell 进程池，秒级响应)
node scripts/verify.mjs --profile quick

# 2. 增量模式：由 plan.mjs 分析暂存区并仅运行受影响任务
node scripts/verify.mjs --profile affected

# 3. 全量模式：17 个测试套件全量回归 + 严格离线供应链检查 (pre-push 默认)
node scripts/verify.mjs --profile full

# 4. 发布模式：全量测试 + SBOM/SCA 深度比对防篡改 (--check-freshness) + Benchmark P95 性能硬阈值
node scripts/verify.mjs --profile release
```

---

## 4. 离线优先供应链治理（Supply Chain Governance）

仓库对引入的外部开源资产实行严密的离线供应链审查机制，不依赖动态外网：

1. **强引脚锁定与来源追溯**：
   - 外部 `vertical` 依赖必须声明 `repo`（HTTPS 协议）、完整 `pin`（40 位 commit SHA 或不可篡改 tag）及 `acquiredAt`。
2. **自动化 CycloneDX SBOM 汇总**：
   - 离线提取 npm lockfile 依赖拓扑，生成 `artifacts/sbom.cdx.json`（CycloneDX 1.5 规范，去重聚合 1083 个组件）。
3. **离线漏洞审计报告（SCA）**：
   - 依赖本机离线 npm advisory cache 生成 `artifacts/sca.npm.json`，记录 38 个 lockfile 的漏洞扫描快照。
4. **强类型制品校验与新鲜度防篡改**：
   - 门禁校验组件枚举、非负整数关系（`scanned + failed <= total`）与非空统计。
   - 发布级门禁支持 `--check-freshness`，对 lockfile 内容与制品做深度哈希比对，任何对组件版本或漏洞严重级的篡改均会被直接阻断。

---

## 5. 常用工作流与操作指南

### 5.1 环境要求
- **Node.js**: `22.x+`（推荐 Node 22 原生测试支持）
- **PowerShell**: `pwsh 7+`（跨平台 PowerShell，Windows 内置 5.1 会因编码解析失败）
- **Git**: `2.30+`

### 5.2 常用命令清单

| 命令 | 用途 |
|---|---|
| `node tests/run.mjs --require-all` | 执行全套 17 个自动化测试套件 |
| `pwsh -File scripts/lint.ps1` | 全仓 162 处校验源静态规范与完整性检查 |
| `pwsh -File scripts/sync.ps1 -DryRun` | 预览技能部署分发情况（只读无副作用） |
| `pwsh -File scripts/sync.ps1` | 部署已启用的技能到客户端（Windows 优先使用 symlink） |
| `node scripts/check-supply-chain.mjs --strict` | 运行离线严格模式供应链来源与制品校验 |
| `node scripts/build-router-manifest.mjs --check` | 检查路由清单新鲜度与可用性 |
| `node tests/benchmarks/route-performance.mjs --strict` | 运行路由决策与清单构建 P95 性能硬阈值基准 |

### 5.3 文档导航

- **[TESTING.md](docs/TESTING.md)**：17 个测试套件详细构成、运行方式与内容规范。
- **[GIT_HOOKS.md](docs/GIT_HOOKS.md)**：Git Hooks 分层设计、`.hooksrc` 配置与快照一致性说明。
- **[ROUTER_ARCHITECTURE.md](docs/ROUTER_ARCHITECTURE.md)**：路由决策内核、契约模式与 Harness 适配层设计。
- **[STANDARDS.md](docs/STANDARDS.md)**：测试规范族设计、黄金法则与代码质量约束。
- **[历史快照] [INVENTORY.md](docs/INVENTORY.md)** / **[SCREENING.md](docs/SCREENING.md)**：2026-08-18 历史采集与审阅基线记录。
