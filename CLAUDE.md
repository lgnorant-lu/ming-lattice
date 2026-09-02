# skills-collection — 技能集散仓库（我们维护）

本仓库是统一技能集散地：registry.yaml 是**单一事实源**，vertical/deployable/private 分层存放，scripts/ 负责增删改查部署。

## 仓库地图

```
registry.yaml            唯一事实源: base(基座模块)/vertical(参考)/deployable(部署)/private(私有) + targets
base/reverse-skill/      路由基座 (上游 submodule, 只读; 其 skills/ 下有 20 个模块 + router)
vertical/                92 个 vendored 仓库 (参考/源码, 带 .git metadata, 不部署)
deployable/              26 个部署包装 (SKILL.md 改写 + symlink 指向 vertical/base 源)
private/                 15 个私有 (4 个自研: blog-content/ui-oracle-protocol/ui-design-paradigms/xfqtrace-kit + 11 个 testing-family 测试规范族)
scripts/                 sync/update/lint/verify + lib/yaml-lite.ps1
docs/                    SKILL-INDEX(路由参考)/INVENTORY/SCREENING/MCP-INVENTORY/SSA-IR-METHODOLOGY/cases
```

## 工作流（常规操作）

- **部署到客户端**: `powershell -File scripts/sync.ps1`（链接到 .cc-switch/skills）
- **激活 Claude**: `.cc-switch/skills` → 符号链接补到 `~/.claude/skills`（sync 后可能需手工补链新条目；Claude 启动时快照, 重启生效）
- **更新检测**: `powershell -File scripts/update.ps1`（缓存优先, TTL 7 天; `sourceGone: true` 条目零网络跳过）
- **质量检查**: `powershell -File scripts/lint.ps1`（部署模块必须有 SKILL.md, 硬编码路径检查）
- **新增采集**: 下载 tarball → 拷入 vertical/ → 注册 registry → 恢复 .git metadata → 提交

## 铁律（历史踩坑, 详见 docs/PLAYBOOK.md）

1. **先 add 文件再恢复 .git**——目录带 .git 直接 git add 会变 gitlink(mode 160000)
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

- xfqtrace-kit: 双密码(zip AES), 仅授权研究目标; Ruyi 系列 4 仓已下架, 内容持有(sourceGone)
- 采集时保留上游许可声明; 私有资产不向外分发
