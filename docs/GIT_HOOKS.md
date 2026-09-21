---
dynamics: [守,改,增]
domain: meta
status: normative
---

# Git Hooks 门禁与自动化流水线规范（Git Hooks Governance）

本文档定义 `ming-skills` 仓库的 Git Hook 门禁体系规范：Hook 清单、检查项、分级策略、安装指引、跳过策略与跨平台兼容性约束。

---

## 1. Hook 清单

| Hook | 触发阶段 | 检查核心内容 | 拦截策略 |
|---|---|---|---|
| `commit-msg` | 提交信息录入 | Conventional Commits 主题格式、type 白名单、Emoji 禁令、乱码防御 | 格式/type 恒为 `error` 级；Emoji / 乱码按 `.hooksrc` 分级 |
| `pre-commit` | 提交前暂存区 | 暂存 blob 批量大文件、乱码、凭据和 Emoji 静态扫描；基于 `plan.mjs` 影响面受限测试 | 命中静态违规或受影响测试失败即阻断提交；纯文档改动免测秒级放行 |
| `pre-push` | 推送前远端同步 | 解析 push ref 范围，过滤删除操作；执行全量本地质量门禁 (`verify.mjs --profile full`) | 自动化测试或离线供应链门禁失败即阻断推送 |
| `post-merge` | merge/pull 完成后 | chores 族：监看文件变更提醒（registry→sync 预览、submodule 指针→update、引擎文件→trust） | **suggest-only 永不阻断**——只打印提醒不执行命令 |

---

## 2. 详细检查项与分层架构（A+B+C）

门禁体系采用分层递进架构，兼顾日常提交极速响应与远端代码质量底线：

```
[git commit] -> pre-commit shim -> engine.mjs -> cheap 门（secrets/mojibake/emoji/large-file/声明式门）
                                             -> error 命中即跳过昂贵门
                                             -> impact-test 门 (plan.mjs 单调性、fail-closed)

[git push]   -> pre-push shim   -> engine.mjs -> pre-push-verify 门（过滤删除分支，verify.mjs --profile full）

[CLI / CI]   -> engine.mjs run check|ci   命名运行组——与 hooks 同一份 .hooksrc 配置
             -> engine.mjs run fix        自愈组（whitespace 等 fixable 门重写工作区，re-stage 由用户确认）
             -> engine.mjs baseline       冻结既有违规（棕场接入钥匙）
             -> engine.mjs list / trust   诊断清单 / gates 完整性再确认

[CI / 发布]  -> CI 门禁    -> 干净 checkout
                           -> verify.mjs --profile release (含新鲜度比对 + benchmark 性能硬阈值)
```

### 2.0 引擎化架构（gate 目录 + 声明式门）

`scripts/hooks/engine.mjs` 是统一调度器；门禁规则分两源：

- **原生码门** `scripts/hooks/gates/*.mjs`：导出 `gate` 对象 `{id, stages, defaultLevel, expensive?, needsAllFiles?, globs?, exclude?, available?(ctx), run(ctx)→findings[]}`。secrets/mojibake/emoji/large-file/commit-msg/impact-test/pre-push-verify 七门为出厂目录。
- **声明式正则门** `.hooksrc` 内 `gate.<id>.<key>` 平铺键——覆盖"单模式+单消息"长尾检查，零代码：
  ```ini
  gate.no-debugger.level=error
  gate.no-debugger.globs=*.js,*.ts,*.mjs
  gate.no-debugger.pattern=\bdebugger\b|console\.(log|debug)
  gate.no-debugger.message=调试语句残留
  gate.no-debugger.once=true            # 可选：逐文件单报
  gate.no-debugger.skipIf=merge,rebase  # 可选：git 态条件（merge/rebase/cherry-pick/ref:<branch>）
  ```
- 项目私有门目录 `gates.local/`（入仓的项目特有门）；个人配置覆盖 `.hooksrc.local`（gitignore）。
- **chores 族**（非阻断自动化，`chore.<id>.*` 声明式键）：`watch`（变更监看 globs）+ `message`（提醒文案）+ `stages`（默认 post-merge）。**suggest-only 铁律**：只打印提醒、永不执行命令、exit 恒 0——`.hooksrc` 是仓内跟踪文件，自动执行会把配置变成代码注入面（提案审计裁决）。
- 退出码契约：`0` 通过 / `1` 门禁拦截 / `2` 引擎故障（fail-closed 且可分辨）。
- **索引保真不变量**：staged 源下 gate 经 `ctx.read` 读 `git show :path` 索引 blob，原生门禁止 `fs.read` 工作区；`run ci`/`baseline` 走 `git ls-files` + 工作区读（CI 读已提交态，无污染问题）。

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
3. **敏感密钥防泄漏（Secret Prevention，三层规则）**：
   - **L1 签名层**（error 级，近零误报）：GitHub 全系（`ghp/gho/ghu/ghs/ghr_`、`github_pat_`）、OpenAI/Anthropic（`sk-` 含 `sk-proj-`/`sk-ant-` 新形态）、Stripe、AWS `AKIA/ASIA`、**阿里云 `LTAI`、腾讯云 `AKID`**、Slack `xox*/xapp-`、Google `AIza`、GitLab `glpat-`、npm/PyPI/HuggingFace/DigitalOcean/SendGrid、JWT、PEM 私钥块。
   - **L2 通用赋值层**（默认 warn，`gate.secrets.genericLevel` 调级）：`api_key|token|secret|password` 等赋值形态 + 香农熵≥3.8 过滤 + 占位符白名单（your-/example/${}/<...> 等）——抓签名层不认识的新服务凭据。
   - **L3 编码层**（`gate.secrets.b64Level`，默认 warn）：UTF-16LE/BE 文件转码重扫（PowerShell 重定向产物常见编码）；可疑文件名（env/config/secret/cred/token）内 base64 长串解码回喂 L1，防 `key | base64` 夹带。
   - 输出只报打码样本（`前4…后4`），永不打印明文密钥；`matchText` 仅存原始命中用于 baseline 身份哈希。
4. **显式影响面受限测试**：
   - 由 `scripts/hooks/plan.mjs` 分析暂存快照：纯文档变动直接跳过运行期测试；特定域变动（如路由、CLI、供应链）仅执行对应受影响套件；关键全局配置（`registry.yaml`、`tests/run.mjs` 等）或未知路径则 fail-closed 自动升级全量。

> [!NOTE]
> **测试快照语义说明**：静态扫描严格基于暂存区 index blob 校验；而自动化测试套件在当前工作树环境执行。若检测到工作树存在未暂存的修改，`check.mjs` 会输出黄色警告提示开发者仔细核对提交差异。

### 2.3 `pre-push` 检查项
1. **推送引用分析**：读取 `stdin` 中的 `<local-ref> <local-sha> <remote-ref> <remote-sha>`，过滤远端分支删除等无代码推送行为。
2. **全量本地门禁**：调用 `node scripts/verify.mjs --profile full`，执行全部 17 个测试套件及严格模式离线供应链门禁。由于 Git hooks 可被客户端绕过，最终安全底线由远端 CI 和主干分支保护规则把关。

### 2.4 发布 freshness 与本地缓存

`release` profile 的 freshness 会对 SBOM/SCA 的 lockfile 使用有界并发扫描，并将每个成功或 fallback 结果写入根目录 `.cache/supply-chain/`（该目录不入 Git）：

```powershell
# 查看 lockfile 级耗时与 cache 命中
node scripts/check-supply-chain.mjs --strict --check-freshness --sca-timings

# 调整并发，范围 1-8
node scripts/check-supply-chain.mjs --strict --check-freshness --supply-chain-concurrency 8

# 强制重新执行 npm sbom/audit，不读取已有本地缓存
node scripts/check-supply-chain.mjs --strict --check-freshness --refresh-sca-cache
```

缓存键绑定 lockfile 内容、Node/npm 版本、scanner 参数和本地 npm audit 索引指纹；指纹不可取得时自动回退真实扫描。缓存用于重复 release 加速，不替代 `--refresh-sca-cache` 的干净发布验证。

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
| `required` | 命中即拒绝，且不吃 `SKIP` 环境变量豁免（最高档；`--no-verify` 仍是 git 层无解，CI 才是真底线） |
| `error` | 命中即拒绝提交（默认严格模式，CI 与日常开发强制开启） |
| `warn` | 仅打印黄色警告，不阻断提交（用于临时调试阶段） |
| `off` | 完全跳过该项检查 |

**等级解析序**：`gate.<id>.level` > 旧键别名（`emojiLevel→emoji` / `mojibakeLevel→mojibake` / `secretLevel→secrets` / `lintLevel→impact-test` / `trailerLevel→commit-msg`）> 门默认级。`.hooksrc.local`（gitignore）在 `.hooksrc` 之上覆盖。

### 3.1 baseline 冻结（棕场接入）

`node scripts/hooks/engine.mjs baseline` 把当前全部违规写入 `.hooks-baseline.json`（存 hash 不存明文；身份=`sha1(gate|file|sha1(matchText))`，行号不入身份）。之后引擎只拦**新增**违规——老欠账冻结入档、新增零容忍。文件改名相当于新文件，需重跑 baseline 再冻结。入仓共享冻结。

### 3.2 临时豁免与完整性

- `SKIP=<gate1>,<gate2> git commit ...`：临时豁免点名门（pre-commit/overcommit 生态惯例名）；`required` 级不吃 SKIP。
- **gates/ 完整性提示**：`engine.mjs` 每次运行比对 `gates/` 目录 hash 与 `.git/hook-engine-state.json` 存值，不一致时打 warn（透明性特性——变化可见，不阻断）；确认无误后 `node scripts/hooks/engine.mjs trust` 再确认。`integrityLevel=off` 可关。
- **CI 增量扫描**：`node scripts/hooks/engine.mjs run check --range=origin/main...HEAD`——PR 相对基线分支的变更扫描（gitleaks `--log-opts` 同语义），checkout 后无暂存区概念的 CI 环境用此入口。
- **自愈**：`node scripts/hooks/engine.mjs run fix`——`fixable` 门（当前 whitespace：行尾空白/EOF 换行）重写工作区文件并报告清单；**不碰 index**，re-stage 由用户确认（刻意避开 lint-staged stash 路线的数据丢失前科）。`run fix --dry-run` 走同一遍历路径只报告不写盘。
- **baseline 预览**：`node scripts/hooks/engine.mjs baseline --dry-run`——按门分组预告将冻结的违规数，不写 `.hooks-baseline.json`。
- **采纳层自检**（与 gates/ 完整性同级，随 `integrityLevel` 开关）：① `.githooks/` shim 与 `lib/shims.mjs` 规范模板对账——手改/模板更新即 warn（外来 hook 无 `engine.mjs` 引用者尊重不碰）；② shim 内引擎引用可达性——store 搬家/引擎缺失即 warn（相对式与绝对烘焙两种引用都验）；③ `.hooksrc` 的 `gate.<id>.*` 孤儿键——配置指向未装载的门（改名/删除残留）即 warn；④ `gates/`、`gates.local/` 下未导出 `gate` 对象的 `.mjs` 文件在加载时 warn（防"写了没生效"静默）。检查者即被检查者，住在引擎装载路径上而非独立门。
- **移植到其他仓**：`pwsh scripts/install-hooks.ps1 -Target <repo>`——铺入 `scripts/hooks/`（engine+gates+lib+依赖件）+ `.githooks/` shim + `.hooksrc`（模板，不覆盖已有）+ `.gitignore` 补 `.hooksrc.local` + hooksPath + integrity 存值。支持 `-WhatIf` 预演（原生 SupportsShouldProcess）；检测到目标已有 `core.hooksPath` 时**拒绝静默切换**（需先平移旧检查到 `gates.local/` 再加 `-Force`——blog-tui 事故的制度化防线）。项目私有门入 `scripts/hooks/gates.local/`；`impact-test`/`pre-push-verify` 在无对应件的仓自动缺席（`available()` 守卫）。第二采纳者实证：blog-tui。

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
