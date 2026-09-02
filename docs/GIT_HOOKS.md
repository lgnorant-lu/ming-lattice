# Git Hooks 门禁与自动化流水线规范（Git Hooks Governance）

本文档定义 `ming-skills` 仓库的 Git Hook 门禁体系规范：Hook 清单、检查项、分级策略、安装指引、跳过策略与跨平台兼容性约束。

---

## 1. Hook 清单

| Hook | 触发阶段 | 检查核心内容 | 拦截策略 |
|---|---|---|---|
| `commit-msg` | 提交信息录入 | Conventional Commits 主题格式、type 白名单、Emoji 禁令、乱码防御 | 格式/type 恒为 `error` 级；Emoji / 乱码按 `.hooksrc` 分级 |
| `pre-commit` | 提交前暂存区 | 大文件防御（>50MB）、GBK 乱码扫描、高危凭据防泄漏、Emoji 禁令、`lint.ps1` 校验 | 命中任何 error 级规则即阻断提交 |
| `pre-push` | 推送远端前 | 校验当前分支与远端状态一致性，防止误推未清洗的大文件 | 可选门控 |

---

## 2. 详细检查项

### 2.1 `commit-msg` 检查项
1. **主题格式**：`<type>(<scope>): <中文描述>`
   - 正则：`^(feat|fix|chore|docs|style|refactor|test|perf|revert|collect|sync|merge)(\([a-z0-9-_/*.]+\))?: .+` —— **恒为 error，不可降级**。
2. **Type 白名单**：
   - `feat`: 新增技能、自研测试体系、新规范
   - `fix`: 修复路径、SKILL.md 描述、脚本 Bug、编码乱码
   - `chore`: 上游仓库增量拉取、pin 更新、工具链维护
   - `docs`: 文档、地图、架构总纲更新
   - `style`: 格式、缩进排版优化
   - `refactor`: 结构重构、目录调整
   - `test`: 测试用例、验证脚本补充
   - `perf`: 性能优化（如缓存命中加速）
   - `collect`: 采集新的垂直参考仓库
   - `sync`: 部署分发配置调整
3. **Emoji 绝对禁令**：检测提交主题是否包含 Unicode Emoji 字符，严格按 `.hooksrc` 拦截（默认 `error`）。
4. **乱码特征拦截**：检测提交说明是否因终端编码错误混入 GBK 乱码字符。

### 2.2 `pre-commit` 检查项
1. **大文件防御门禁（50MB 阈值）**：
   - 扫描暂存区（Staged Files）文件大小，凡超过 `50MB` 立即阻断提交，防止大归档（如 `*.tar.gz`, `*.mp4`）污染 Git 历史。
2. **编码防污染扫描（0 Mojibake）**：
   - 对暂存的 `.md`, `.yaml`, `.ps1`, `.json`, `.js` 进行字符扫描，拦截 GBK 转义乱码。
3. **真实生产敏感密钥防泄漏（Secret Prevention）**：
   - 拦截包含 `ghp_` (GitHub Token), `sk-` (OpenAI Key), `AKIA` (AWS Key), `BEGIN PRIVATE KEY` 等真实生产私钥。
4. **全量完整性门禁（`scripts/lint.ps1`）**：
   - 自动执行 `pwsh scripts/lint.ps1`，确保 151+ 源在注册表、软链、Frontmatter 层面 **`ERROR=0`**。

---

## 3. Hook 分级机制（`.hooksrc`）

仓库根目录通过 [`.hooksrc`](file:///d:/dogepy/skills-collection/.hooksrc) 进行门禁等级配置：

```ini
# .hooksrc — ming-skills Git Hook 分级配置
requireCommitMsg=true   # 是否强制提交格式（恒为 true）
emojiLevel=error        # error | warn | off（默认 error: 绝对禁止 Emoji）
mojibakeLevel=error     # error | warn | off（默认 error: 绝对禁止乱码）
secretLevel=error       # error | warn | off（默认 error: 拦截真实生产密钥）
lintLevel=error         # error | warn | off（默认 error: lint 失败阻断提交）
```

| 等级 | 行为表现 |
|---|---|
| `error` | 命中即拒绝提交（默认严格模式，CI 与日常开发强制开启） |
| `warn` | 仅打印黄色警告，不阻断提交（用于临时调试阶段） |
| `off` | 完全跳过该项检查 |

---

## 4. 安装与激活

### 一键安装命令

- **Windows (PowerShell)**:
  ```powershell
  pwsh scripts/install-hooks.ps1
  ```
- **Linux / macOS / Git Bash**:
  ```bash
  sh scripts/install-hooks.sh
  ```

脚本会自动执行 `git config core.hooksPath .githooks`，将 Git 的 Hook 钩子路径直接指向仓库内的 `.githooks` 目录。

---

## 5. 跳过策略与应急方案

> [!CAUTION]
> 仅在紧急 hotfix 或已知特殊操作时使用跳过参数，日常开发严禁绕过门禁！

- **跳过 pre-commit 检查**：
  ```bash
  git commit --no-verify -m "..."
  ```
- **临时调整等级**：修改本地 `.hooksrc` 中的某项配置为 `warn` 或 `off`（请勿随代码提交）。
