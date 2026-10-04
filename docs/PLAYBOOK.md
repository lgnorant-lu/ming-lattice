---
dynamics: [用,守,省,改]
domain: ops
status: descriptive
---

# PLAYBOOK — 集散仓库操作技巧与踩坑记录

> 面向后续所有会话的操作手册。来源：2026-08-18~20 实际运维积累。按"会碰到的操作"组织，每个条目给出正确姿势 + 为什么。

## 一、采集入库（最高频）

### 1.1 新仓库入库标准流程（物化制——vertical/ 永不入库）

```bash
# 1) registry.yaml 登记条目（python 改, 不用 PowerShell 写中文）：
#      name + repo(HTTPS) + path=vertical/<name> + pin(全40位SHA) + acquiredAt + domain + note
# 2) 物化验证: node scripts/fetch.mjs --only <name>
# 3) commit——只有 registry.yaml 一行进仓；vertical/ 字节永不入库
#    （vendor-boundary 门会拦非孤本路径，git add -f 也过不去）
```

**历史教训（勿回退到旧流程）**：旧制是"拷入 + git add + 恢复 .git"——目录带 .git 直接 add 会强制建 gitlink（mode 160000），.gitignore 拦不住，曾 35 次误入史（2026-09 物化制落地时随 vendored 史一并剥除）。现在 .git 元数据由 fetch.mjs 物化时自然建立，**本地 vertical/&lt;name&gt; 是活 clone**，update.ps1 的增量检测照常可用。

**孤儿例外**：上游已下架的孤本（sourceGone: true）是本仓唯一承载字节的 vertical 内容——先入 registry 标 `sourceGone: true`，vendor-boundary 白名单由该字段派生放行。物化目录里的 `.git` 内件仍全局拦截。

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

## 九、git/门禁脚本安全坑（2026-10 审计轮沉淀）

文件名与 registry 值进 git argv 的四个真实注入/逃逸类——均已在双仓实证修复：

### 9.1 `git show :<path>` / `<rev>:<path>` 的 pathspec 魔法注入

`:path` revspec 内层解析 pathspec 魔法（git 文档化行为）：
- `(top)x` → 读出 `x` 的 blob 而非 `(top)x`（staged 内容读串对象=密扫逃逸）
- `!/x` → exclude 魔法直接 fatal
- **`GIT_LITERAL_PATHSPECS=1` 管不了 revspec 位**（只管 `--` 后 pathspec 位）——实测确认

**正解 = sha 两步寻址**：`git ls-files -s -z`（索引）或 `git ls-tree -r -z <rev>`（树）建"文件名→blob sha"表 → `git cat-file blob <sha>`。sha 是 40-hex 无歧义。skills-collection `hooks/lib/files.mjs`、IV8 `check_staged_secrets`/`check_seam_gate`/`check_staged` 均已落地同模式。

### 9.2 `--` 后 pathspec 位仍解析魔法

`git diff -- <name>` 中 `(top)x` 命中 `x` 的 diff 而非自身。修法：`env GIT_LITERAL_PATHSPECS=1` + 传**仓根相对路径**（不是绝对路径——绝对路径的前导盘符虽部分自保护，但相对名才是 pathspec 的正确语义）。IV8 `check_shim_triage`/`check_work_ids`/`check_seam_gate` 已接线。

### 9.3 registry/配置值进 git argv 须拦 `-` 前缀

`git ls-remote <repo>`/`git fetch origin <refspec>` 的位置参数若来自 registry/配置：
- `-` 前缀即选项注入——`ls-remote --upload-pack=<bin>`、`fetch --upload-pack=<bin>` 均远端侧任意执行
- 校验锚：repo 拒 `-` 前缀；pin 限 40-hex；路径 `resolve` 后钉仓根
- 已修：fetch.mjs（pin/repo/path 三校验）、update.ps1（ls-remote `-` 前缀拦）

### 9.4 枚举吞错 = 门禁静默缺席（fail-open）

`except → return []` / `|| true` 把 git 探测失败变成"无暂存文件"→ 全部门触发判空跳过 → 提交放行。规矩：**枚举失败必须传播**（Python `check=True` 不带 except / bash 顶层探测先行）；`grep` 无匹配退 1 用 `|| true` 是合法的（grep 1≠git 失败），但 git 本身失败要拦。IV8 `check_install_dispatch`/`check_staged_secrets`/`pre-commit` 顶层探测已修。

### 9.5 `grep -E` 不支持 `(?:…)` 非捕获组

POSIX ERE 无非捕获组语法——写进模式整个静默不命中（`grep -q` 退 1 当"未命中"=扫描失效）。曾致 IV8 pre-push token 扫描失效一轮。**ERE 侧用裸 `(...)`**；Python/JS 正则不受限。跨脚本复制正则时逐宿主核对方言。

### 9.6 门校验对象 = 暂存 blob 非工作树

`git add` 后工作树再改：查工作树的门会误 FAIL 有效提交；反向 stage 脏→恢复工作树则放行脏索引。门禁该读 `git cat-file blob <staged-sha>`（同 9.1 寻址）；`is_file()` 类工作树存在性守卫对暂存语义是错的。IV8 `check_staged`(TOC)/`check_work_ids` 已修。
