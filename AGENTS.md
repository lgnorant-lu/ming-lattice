# ming-skills-router — Agent 技能集散与工程中枢

本仓库是统一技能集散地与工程中枢：registry.yaml 是**单一事实源**，vertical/deployable/private 分层存放，scripts/ 负责增删改查部署。

## 仓库地图

```
registry.yaml            唯一事实源: base(基座模块)/vertical(参考)/deployable(部署)/private(私有) + targets/layers(层别登记)/candidates(候审区)
.ming/ming.yaml          ming 命名域伞面 SoT: scope/命名谱(lattice 族谱)/kinds 词表/projects 登记
.ming/lattice/package.yaml 本箱身份 manifest: name=ming-lattice/kind/members glob/SoT 指针——校验: node scripts/check-ming.mjs
.ming/lattice/state/     本机运行态域 (gitignored): deploy-ledger.json 部署态账本——sync 装了什么/哪版/漂没漂
.hooksrc                 Git Hook 分级门禁配置 (Emoji/乱码/密钥/lint 等级)
.githooks/               Git Hooks 拦截脚本 (commit-msg, pre-commit)
base/reverse-skill/      路由基座 (上游 submodule; 带**有意本地补丁**——skills/SKILL.md PRE-CHECK 第0步 fail-closed 路由硬化 + field-journal 沉淀, 勿当脏态清理)
vertical/                物化区: 远端仅存索引(gitignored), 本地经 scripts/fetch.mjs 按 pin 物化; sourceGone 孤本例外入库
deployable/              部署包装 (SKILL.md 改写 + symlink 指向源; mirror 上游边经 source: 字段声明, build-deployable/parity 依此建链与核验)
private/                 私有与自研内容 (路由、质量规范、UI/协议工具及个人资产)
distill/                 项目级经验沉淀库【本地内容区·gitignored 不入仓】INDEX.yaml 机读索引 + <project>/ 条目 + _proposals 晋升staging——机制在仓(ming-distiller+check-index), 内容本地
scripts/                 sync/update/lint/test + route-core/build-router-manifest + hooks/(validate/check) + install-hooks
tests/                   run.mjs 统一驱动 + unit/ + integration/ + test-route-decision.mjs
docs/                    STANDARDS(工程总纲)/GOVERNANCE-SPINE(工件本体与对账结构)/ROUTER_ARCHITECTURE(路由契约)/TESTING(测试自举)/GIT_HOOKS(门禁)/SKILL-INDEX
```

## 工作流（常规操作）

- **开箱自举**: `node scripts/bootstrap.mjs`（克隆体一键就绪：submodule init + vertical 物化 + deployable 死链接修复 + hooksPath；`--dry-run` 预览 / `--skip-fetch` 离线）
- **全量测试自举**: `pwsh scripts/test.ps1 --require-all` 或 `node tests/run.mjs --require-all`（单元、20 条黄金、路由安全、暂存区 Hook、隔离 CLI 集成）
- **安装 Git 门禁**: `pwsh scripts/install-hooks.ps1`（配置 core.hooksPath 指向 .githooks）；`-Target <repo>` 铺门禁 kit 到外仓，`+ -WithBoundary` 连 ming-boundary 组件+门+boundaries.yaml 模板一起铺。跨平台等价实现：`node scripts/install-hooks.mjs --target <repo>` / `sh scripts/install-hooks.sh -t <repo>`（scaffold 在 pwsh 缺席时自动回退 Node）
- **仓库采纳编排**: `node scripts/scaffold-repo.mjs --target <repo>`——域骨架(scaffold-domains)+门禁 kit(install-hooks -Target)+自检 单入口；`--with-boundary`/`--skip-*`/`--dry-run` 可选
- **部署到客户端**: `pwsh scripts/sync.ps1`（支持 `-DryRun` 演练预览，链接到 .cc-switch/skills）
- **部署态对账**: `node scripts/deploy-ledger.mjs --write`（快照落账）/ `--check`（漂移 missing/changed/foreign + 覆盖 uncovered 对账）
- **激活 Claude**: `.cc-switch/skills` → 符号链接补到 `~/.claude/skills`（Claude 启动时快照, 重启生效）
- **更新检测**: `pwsh scripts/update.ps1`（支持 `-DryRun` 演练；缓存优先, TTL 7 天; `sourceGone: true` 条目零网络跳过）
- **质量检查**: `pwsh scripts/lint.ps1`（部署模块必须有 SKILL.md, 硬编码路径检查）
- **物化参考层**: `node scripts/fetch.mjs`（`--dry-run` 预览 / `--only <名>` 单项 / `--reconcile` 对齐漂移 / `--include-heavy` 纳入 weight:heavy 重仓；默认面=core，含 base submodule 引导）
- **新增采集**: registry 登记条目(repo+pin 全 40 位 SHA) → `node scripts/fetch.mjs --only <名>` 物化验证 → 提交 registry 行（**vertical/ 永不入库**——vendor-boundary 门会拦）

## 铁律（历史踩坑, 详见 docs/PLAYBOOK.md）

1. **vertical/ 是物化区永不入库**——远端仅存索引(repo+pin), 字节由 `scripts/fetch.mjs` 物化; 例外=sourceGone 孤本(上游已下架须承载字节)。想提交 vertical/ 文件先想是否该标 sourceGone
2. **cwd 陷阱**——在 vertical/ 里跑 `vertical/<name>` 会建出 vertical/vertical/ 孤儿目录
3. **判定下架要三方一致**——codeload main+master + github 页面全 404 才算死; 瞬时 404 会复活(Restore-JS 案例)
4. **脚本用 pwsh 7 跑**——powershell 5.1 解析 UTF-8 中文注释会错乱
5. **registry 手工编辑用 python**——PowerShell 写中文会丢换行(hello-js-reverse 曾整行变注释成幽灵条目)
6. **meta 语义**: pin=采集时 content version; HEAD 差异=更新信号(不是 pin 必须等于 HEAD)

## 路由基座（reverse-skill-router）

- 主路径: `/reverse-skill-router` 手动激活或语义触发, 然后描述需求
- 全局 CLAUDE.md 只留索引回退(不塞全文, 防常驻 token 浪费)
- 上游 routing.json(41 规则) 不认识我们 deployable/private 层——跨自有场景直接点名 skill
- tool-index.md 是 gitignored 硬前置, 换机首会话需 refresh-tool-index 生成

## 合规

- Ruyi 系列 4 仓已下架, 内容持有(sourceGone 孤本入库); xfqtrace-kit 实体工具外置 (不入库不分发)
- vertical 远端仅存索引即天然不再分发上游字节; 孤本/采集物保留上游许可声明; 私有资产不向外分发
- 提交信息不附 "Generated with Devin" trailer 与 `Co-Authored-By: Devin`——署名即作者本人（2026-09-17 已清史）

## 本机系统护栏（2026-09-17 内存事故后落地）

- **禁止 `find /`**：MSYS2 find 遍历 `/proc/registry` 会泄漏注册表 Key 句柄（实测 17.8M Key 对象 ≈ 4.5GB Paged Pool，cygwin fhandler_registry 的 closedir 不释放 NtOpenKey 句柄，上游 2012 年修过仍回归）。已在 `Git/mingw64/bin/find`(+`.exe`) 前置 guard，拦截 `find /`、`find //`、`find /proc*`，其余透传
- **grep 软禁用**：`grep`/`egrep`/`fgrep` 被 guard 拦截（TTY 判定：交互拦+提示 `rg`/`sg`，脚本/管道透传）。确需原生 grep：`grep --real-grep <args>`，或 `export GREP_GUARD_OFF=1`（跑 ./configure 类构建时）
- **护栏 SoT 已收编 `private/host-tools/`**：tools.yaml 注册表（block-form/soft-ban/hint/coexist 四层）+ shims 源件 + `tools` 状态/`doctor` 体检 + `install.ps1` 部署链（→ `~/.local/bin` 用户级位；`mingw64/bin` 旧件仅作 fallback，Git 升级可覆写）。体检：`tools doctor`；改策略改表后重跑 install
- 搜索选型：文件查找 → `fd <pat> [dir]` / `rg --files [dir]`；内容搜索 → `rg`；结构搜索 → `sg -p`（ast-grep）；磁盘占用 → `dua`/`diskus`
- 系统排障工具链已就绪：sysinternals 全套（`pslist64`/`handle64`/`RAMMap64`/`procdump64`/`livekd64`）、`procs`、`samply`、WPT（`xperf`/`wpa`/`wpr`，`"C:\Program Files (x86)\Windows Kits\10\Windows Performance Toolkit\"`）、`typeperf`/`tracerpt` 内置。大规模进程枚举避免用 PowerShell
