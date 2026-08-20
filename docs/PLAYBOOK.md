# PLAYBOOK — 集散仓库操作技巧与踩坑记录

> 面向后续所有会话的操作手册。来源：2026-08-18~20 实际运维积累。按"会碰到的操作"组织，每个条目给出正确姿势 + 为什么。

## 一、采集入库（最高频）

### 1.1 新仓库入库标准流程（顺序铁律）

```bash
# 1) 下载 tarball 到 /tmp 解压（不要 git clone 进 vertical/）
# 2) 拷入 vertical/<name> 并 git add（此时绝不能有 .git！）
# 3) 注册 registry（用 python 脚本, 不用 PowerShell 写中文）
# 4) 恢复 .git metadata（git init + remote add + fetch blob:none）
# 5) commit
```

**为什么先 add 再建 .git**：目录带 .git 时 git add 会强制创建 gitlink（mode 160000），.gitignore 拦不住。git rm --cached + 删 .git + 重 add 才能解，恶心。

**metadata 恢复模板**（注意 cwd 必须在仓库根，不是 vertical/）：

```bash
git init -q vertical/<name>
git -C vertical/<name> remote add origin https://github.com/<owner>/<repo>.git
git -C vertical/<name> fetch -q --depth 1 --filter=blob:none origin main 2>/dev/null \
  || git -C vertical/<name> fetch -q --depth 1 --filter=blob:none origin master 2>/dev/null
# 判断用 FETCH_HEAD 而非 HEAD（HEAD 在 update-ref 前不存在, 会误判失败）
git -C vertical/<name> update-ref refs/heads/main FETCH_HEAD
git -C vertical/<name> symbolic-ref HEAD refs/heads/main
```

fetch 瞬时 TLS 失败（代理不稳）→ 外层 for try 1..3 + 双分支重试。

### 1.2 判断仓库死了没（三方一致）

| 通道 | 命令 |
|---|---|
| codeload main | `curl -o /dev/null -w '%{http_code}' https://codeload.github.com/<o>/<r>/tar.gz/refs/heads/main` |
| codeload master | 同上换 master |
| github 页面 | `curl -o /dev/null -w '%{http_code}' https://github.com/<o>/<r>` |

**全 404 才算死**。瞬时 404 会复活（Restore-JS/Crack-JS-Spider 案例：30 分钟内判死又复活）。真下架例：ruyipage-js/go/dev/ruyi-mcp（三方一致 404），registry 标 `sourceGone: true` 后 update 零网络跳过。

### 1.3 生态采集策略（LoseNine 案例总结）

- **下架窗口以分钟计**（Restore-JS 列表页出现后数分钟 404）——看到高价值资产**当场采**，不留下一轮
- fork 收藏夹占比高（Session/DrissionPage/frida/cefpython 等知名项目 fork 无价值，跳过）
- 用户页仓库列表不稳定（60→100+ 抖动），以 codeload 探测为准，别信列表页数量

## 二、registry 编辑（易碎区）

### 2.1 必须用 python 改，禁止 PowerShell 写中文

PowerShell 5.1 默认 ANSI 编码写 UTF-8 文件 → 中文注释乱码 + **换行丢失**（注释行与下一个 `- name:` 粘成一行，整行变注释 → 幽灵条目：文件系统有、registry 解析不到、sync 跳过）。

**曾发生的真实事故**：`# 部署包装层…` 与 `- name: hello-js-reverse` 同行 → hello-js-reverse 幽灵化 23/24 计数错乱。修复：python re.sub 把注释与条目分行。

正确姿势：
```python
t = open('registry.yaml', encoding='utf-8').read()
t = t.replace(old, new)
open('registry.yaml', 'w', encoding='utf-8', newline='\n').write(t)
```

### 2.2 段切分 & 计数

```python
t = open('registry.yaml', encoding='utf-8').read()
base  = t.split('base:')[1].split('vertical:')[0]
vert  = t.split('vertical:')[1].split('deployable:')[0]
dep   = t.split('deployable:')[1].split('private:')[0]
priv  = t.split('private:')[1]
names = re.findall(r'^  - name: (\S+)', sec, re.M)  # 条目名
mods  = re.findall(r'^\s+([a-z0-9-]+): \[', base, re.M)  # base 模块
```

注意 base 段里 `modules:` 的键名正则与条目不同（无 `- name:`）。

### 2.3 pin 语义（用户纠正过的认知）

- **pin = 采集时的 content version**，不必须等于上游 HEAD
- HEAD 差异 = **更新信号**（update.ps1 负责检测并回写 checkCache）
- `sourceGone: true` 条目 pin 写 `gone-<日期>`，update 直接跳过（零网络）

## 三、部署与激活

### 3.1 双链结构

```
registry → .cc-switch/skills（sync.ps1 建链接）
.cc-switch/skills → ~/.claude/skills（cc-switch 软件激活 or 手工补链）
```

cc-switch 只自动激活 5 个 → **手工补链**是常态：
```powershell
foreach ($item in Get-ChildItem $src -Force | Where-Object { $_.LinkType -eq 'SymbolicLink' }) {
  if (-not (Test-Path (Join-Path $dst $item.Name))) {
    New-Item -ItemType SymbolicLink -Path (Join-Path $dst $item.Name) -Target $item.FullName
  }
}
```

### 3.2 部署层组装（deployable 模式）

- 内容一律 symlink 指向 vertical/base 源（单一事实源），SKILL.md 才允许改写（改名/描述精炼/路径修复）
- symlink 用 PowerShell `New-Item -ItemType SymbolicLink`（Git Bash ln 不可靠）
- Windows git 提交 symlink 是 mode 120000，正常
- router 这类"多源组装"（SKILL.md + ops + scripts + config + 模块目录）：逐项 symlink，config/routing.json 漏掉会导致 master-route 报 "routing config missing"

### 3.3 激活生效时机

Claude Code **启动时快照** skills 列表——补链后新 skill 要**重启会话**才进 Skill 工具列表。当前会话只会看到新增项（系统实时注入），其余是启动快照。

## 四、脚本运行环境

### 4.1 解释器

| 脚本 | 解释器 | 原因 |
|---|---|---|
| scripts/*.ps1 | **pwsh 7**（不是 powershell 5.1） | 5.1 按 ANSI 解析 UTF-8 中文注释 → ParserError |
| lint/update 等 | pwsh -NoProfile -ExecutionPolicy Bypass -File | 与 5.1 混用会踩 127/解析错 |

### 4.2 PowerShell 语法坑（本仓库脚本内）

- `if (git fetch)` 永远 false（stdout 空）→ 必须 `$LASTEXITCODE`
- 数组 `+=` 破坏引用 → ArrayList；`return , $items` 防单元素展开
- dict 遍历用 `.Keys`（PSObject.Properties 会冒出 Count/Keys 幽灵属性）
- Select-String 不支持跨行 → `[regex]::Match($t, $re, [RegexOptions]::Singleline)`
- bash 里 `Select-Object` 不存在 → 混合脚本时用 PowerShell tool 跑 pwsh 命令

## 五、代理与网络

- 环境变量：`export HTTPS_PROXY=http://127.0.0.1:7890 HTTP_PROXY=http://127.0.0.1:7890`
- 串行探测太慢 → xargs -P8 并行（注意 `-I` 与 `-P` 同用会警告，用 sh -c 包）
- 大 tarball（>10MB）放后台跑，`run_in_background: true`
- codeload 比 github 页面稳（页面要解析 HTML/JSON）；github API 无 token 有 rate limit（60/h）

## 六、路由基座（reverse-skill-router）操作

- **激活主路径**：`/reverse-skill-router` 手动激活 → 描述需求（skill 懒加载, 平时零占用）
- **回退层**：`~/.claude/CLAUDE.md` 只留索引（不 @import SKILL.md 全文——官方反模式, 每会话常驻白占 token）
- **路由调用**：`pwsh -File skills/scripts/master-route.ps1 -Hint "<任务>"`（在 router 目录下）→ PRIMARY + route-scope.md
- **case 门禁**：`case-init.ps1 -Hint "<任务>" -CaseName <名>` → scope.md `auth.status=granted` 前禁止对目标 ACT
- **上游 routing.json 41 规则不认识自有 deployable/private 层** → 跨自有场景（JSVMP/瑞数/ruyipage/ui-oracle）直接点名 skill，别指望 router 路由
- **tool-index.md 是 gitignored 硬前置**：克隆后不存在，必须先 `refresh-tool-index.ps1` 生成（否则 RULES 读取失败路由 broken）；换机必跑
- router 冒烟：`verify-routing-coherence.ps1` 全过 = 结构自洽

## 七、版本与计数核对

- 生效数核对：`Get-ChildItem ~/.claude/skills -Force | ? { $_.LinkType -eq 'SymbolicLink' }`（LinkType 判断, 别用 ls 的 @ 尾巴）
- 预期对照：base 20 + deployable 24 + private 3 = 47 生效；vertical 92 是参考层不部署
- 幽灵条目排查：registry 解析名集合 vs 生效清单集合差集（未知来源 = registry 条目被注释吞了）

## 八、生态现状速查（2026-08-20）

- **LoseNine**：ruyipage 系 4 仓真死（sourceGone）；Restore-JS/Crack-JS-Spider 复活已采；原创资产基本见底
- **观望清单**：全部清零（jshookmcp/xtrace/uiautodev 已采, cy_jsvmp gone, sdenv-ng npm 参考）
- **下轮候选**：游戏安全、JSVMP 引擎层、SSA/IR 方法论已落地；新方向等用户指定
