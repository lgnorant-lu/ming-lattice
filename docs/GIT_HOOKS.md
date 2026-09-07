# Git Hooks 门禁与自动化流水线规范（Git Hooks Governance）

本文档定义 `ming-skills` 仓库的 Git Hook 门禁体系规范：Hook 清单、检查项、分级策略、安装指引、跳过策略与跨平台兼容性约束。

---

## 1. Hook 清单

| Hook | 触发阶段 | 检查核心内容 | 拦截策略 |
|---|---|---|---|
| `commit-msg` | 提交信息录入 | Conventional Commits 主题格式、type 白名单、Emoji 禁令、乱码防御 | 格式/type 恒为 `error` 级；Emoji / 乱码按 `.hooksrc` 分级 |
| `pre-commit` | 提交前暂存区 | 暂存 blob 批量大文件、乱码、凭据和 Emoji 静态扫描；基于 `plan.mjs` 影响面受限测试 | 命中静态违规或受影响测试失败即阻断提交；纯文档改动免测秒级放行 |
| `pre-push` | 推送前远端同步 | 解析 push ref 范围，过滤删除操作；执行全量本地质量门禁 (`verify.mjs --profile full`) | 自动化测试或离线供应链门禁失败即阻断推送 |

---

## 2. 详细检查项与分层架构（A+B+C）

门禁体系采用分层递进架构，兼顾日常提交极速响应与远端代码质量底线：

```
[git commit] -> pre-commit -> 暂存区静态批量扫描 (cat-file --batch-check)
                           -> 影响面计划器 plan.mjs (单调性、fail-closed)
                           -> 受影响测试套件 (纯文档 < 2s; 受限代码 < 5s)

[git push]   -> pre-push   -> 解析 push stdin (过滤删除分支操作)
                           -> 统一质量门禁 verify.mjs --profile full
                           -> 全量 17 个测试套件 + 严格离线供应链检查

[CI / 发布]  -> CI 门禁    -> 干净 checkout
                           -> verify.mjs --profile release (含新鲜度比对 + benchmark 性能硬阈值)
```

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
   - 使用 `git cat-file --batch-check` 单进程批量扫描暂存区（Staged Files）对象大小，凡超过 `50MB` 立即阻断提交，防止大归档污染 Git 历史。
2. **编码防污染扫描（0 Mojibake）**：
   - 对暂存的 `.md`, `.yaml`, `.ps1`, `.json`, `.js` 进行字符扫描，拦截 GBK 转义乱码。
3. **真实生产敏感密钥防泄漏（Secret Prevention）**：
   - 拦截包含 `ghp_` (GitHub Token), `sk-` (OpenAI Key), `AKIA` (AWS Key), `BEGIN PRIVATE KEY` 等真实生产私钥。
4. **显式影响面受限测试**：
   - 由 `scripts/hooks/plan.mjs` 分析暂存快照：纯文档变动直接跳过运行期测试；特定域变动（如路由、CLI、供应链）仅执行对应受影响套件；关键全局配置（`registry.yaml`、`tests/run.mjs` 等）或未知路径则 fail-closed 自动升级全量。

> [!NOTE]
> **测试快照语义说明**：静态扫描严格基于暂存区 index blob 校验；而自动化测试套件在当前工作树环境执行。若检测到工作树存在未暂存的修改，`check.mjs` 会输出黄色警告提示开发者仔细核对提交差异。

### 2.3 `pre-push` 检查项
1. **推送引用分析**：读取 `stdin` 中的 `<local-ref> <local-sha> <remote-ref> <remote-sha>`，过滤远端分支删除等无代码推送行为。
2. **全量本地门禁**：调用 `node scripts/verify.mjs --profile full`，执行全部 17 个测试套件及严格模式离线供应链门禁。由于 Git hooks 可被客户端绕过，最终安全底线由远端 CI 和主干分支保护规则把关。

---

## 3. Hook 分级机制（`.hooksrc`）

仓库根目录通过 [`.hooksrc`](../.hooksrc) 进行门禁等级配置：

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

## 6. 可迁移方法论与仓库实现边界

本文件描述本仓库的 Hook 拓扑和命令；可迁移的判断规则分别维护在现有技能中，避免把仓库路径和脚本细节复制进通用规范：

| 问题 | 方法论入口 | 本仓库实现 |
|---|---|---|
| 参数、退出码、stdout/stderr 与 runner 选择 | [testing-scenario-cli](../private/engineering/testing/testing-scenario-cli/SKILL.md) | `tests/run.mjs`、`scripts/verify.mjs` |
| schema、制品、finding 与 freshness | [contract-core-paradigm](../private/engineering/contract-core-paradigm/SKILL.md) | `docs/schemas/`、`scripts/check-supply-chain.mjs` |
| 失败、预检与独立事件通道 | [obs-core-paradigm](../private/engineering/obs-core-paradigm/SKILL.md) | `scripts/emit-operational-event.mjs`、`scripts/sync.ps1` |
| provenance、pin、离线和 fail-closed | [sec-core-paradigm](../private/engineering/sec-core-paradigm/SKILL.md) | `registry.yaml`、`artifacts/`、供应链脚本 |

新增仓库若复用这些规则，应引用 skill 并替换实现映射；只有形成第二个真实仓库的相同门禁拓扑后，才考虑抽取独立编排 skill。
