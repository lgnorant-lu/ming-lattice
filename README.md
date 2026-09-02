# ming-skills

Ming 的 Agent 技能集散与工程中枢（Skills Hub & Monorepo）：统一管理自研测试规范族、逆向与安全知识库、垂直参考生态与部署分发，具备自主版本雷达与全量门控体系。

## 结构

```
ming-skills/
├── registry.yaml              # 单一事实源：源 → 本地路径 → 部署目标/启用状态
├── private/                   # 自主核心资产（测试规范体系族 11 包 + UI 范式 + 自研工具）
├── deployable/                # 部署包装层（精炼门面, symlink 映射）
├── base/reverse-skill/        # 基座（submodule, 跟踪 zhaoxuya520/reverse-skill upstream）
├── vertical/                  # 垂直参考（92 个 vendored 社区参考库, 增量跟踪）
├── scripts/
│   ├── sync.ps1               # 按 registry 部署到各客户端（symlink, 失败 fallback 复制）
│   ├── update.ps1             # 检测上游更新（fetch + 版本/commit 对比 + 变更摘要）
│   ├── lint.ps1               # 完整性校验（SKILL.md/frontmatter/引用/硬编码路径/空壳）
│   └── lib/yaml-lite.ps1      # 零依赖 YAML 子集解析器（仅支撑 registry.yaml 结构）
└── .trash/                    # sync 备份的旧目标（确认无误后手动删）
```

## 工作流

```
1. 更新检测   pwsh scripts/update.ps1          # 看哪些 repo 有新版本
2. 应用更新   cd base/reverse-skill && git pull --rebase    # 基座（submodule）
             （或 cd vertical/<name> && git pull）
3. 完整性校验 pwsh scripts/lint.ps1            # 部署前检查
4. 部署       pwsh scripts/sync.ps1            # 链接到客户端 skills 目录
```

## 部署链路

```
skills-collection/  →(sync.ps1 symlink)→  .cc-switch/skills/  →(cc-switch auto)→  ~/.claude/skills/
```

- **cc-switch 管**：配置切换 + 分发到客户端
- **本仓库管**：源 + 版本 + 校验
- 新增/启用 skill 后，在 cc-switch 里切换一次配置（或重启）让其同步到客户端目录

## registry.yaml 操作指南

| 操作 | 做法 |
|---|---|
| 启用一个基座模块 | 在 `base[].modules` 下加一行 `模块名: [claude]`（模块需存在于基座 `skills/` 下） |
| 停用 | 从 `modules` 移除该行（**不会**删除已部署目录，需手动清理） |
| 采集一个新垂直 skill | `vertical` 下加条目（name/repo/path/enabled:false）→ `git clone` 到对应 path → `enabled: true` + 填 `deploy` |
| 新增私有 skill | 复制到 `private/<name>/`，registry `private` 加条目 |
| 部署到其他客户端 | `targets` 加客户端目录，条目里把客户端名加入部署列表 |

## 注意

- **符号链接**：Windows 需管理员或开发者模式；无权限时 sync 自动 fallback 为 robocopy 复制（源更新后需重新 sync）
- **`.trash`**：sync 备份的旧目录，确认部署无误后删除：`Remove-Item .trash -Recurse`
- **授权边界**：基座 RULES.md 的授权门（field-journal/precedent-auth）默认按"已授权研究"执行，实际操作前请确认 scope 契约
- 脚本需 **pwsh 7+**（Windows PowerShell 5.1 会因 UTF-8/GBK 编码解析错误）
