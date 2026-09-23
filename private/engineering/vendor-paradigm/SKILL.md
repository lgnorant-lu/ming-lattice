---
name: vendor-paradigm
description: 第三方内容入库范式元规则——清单即锁/内容即产物/孤本例外声明三原则 + 四件套（锁清单/物化器/边界门/孤本位）+ vendored-vs-物化判据。当讨论 vendoring、第三方依赖入库、参考仓集合管理、大文件该不该进 git、lockfile 选型、上游消失应对、gitlink/submodule 事故时使用。触发词：vendor, vendoring, 物化, materialization, lockfile, 第三方依赖, 依赖入库, third_party, gitlink, subtree, submodule, 孤本, orphan, sourceGone。
metadata:
  layer: infrastructure
  compose: cross-scene
---

# Vendor Paradigm — 第三方内容入库范式

> 沉淀于 2026-09-23 skills-collection vertical/ 物化化实战（96 仓 vendored→索引制改造，`.git` 188M→9M）+ 外部先例调研（Go modules / vendir / Bazel / Google third_party）。
> 核心结论：**vendored 字节入库只剩一个合法理由——上游可得性例外；其余场景都该是「清单即锁、内容即产物」。**

## 1. 判据：先问要不要实体字节

RSC《Defining Go Modules》给了 vendoring 的存在理由清单，只剩两条：

| 理由 | 现代替代 | vendored 还需吗 |
|---|---|---|
| 可复现性（reproducibility） | lockfile 版本钉死 + 代理/缓存 | **否**——pin+fetch 等价 |
| 可得性（availability） | 上游可能消失 | **唯一残值**——仅此场景留字节 |

**判定树**：

```
要引用第三方内容？
├─ 只读参考/工具源码，上游健在 → 物化制（registry 记 repo+pin，fetch 物化）
├─ 上游已消失/将消失（可得性例外）→ 孤本位：实体字节入库 + 声明式标记
├─ 需要在网页端浏览其文件 → vendored 合法（GitHub 浏览性是真需求）
└─ CI/消费方直接拉取 → 不入库，留给消费方自己解析
```

配套消融判据：**凡不属于"可得性例外"的实体字节都是可删的**——这把"哪些该留"从审美判断变成布尔条件。

## 2. 三原则

1. **清单即锁**（manifest-as-lock）：repo URL + 完整 40 位 commit SHA 进单一事实源。**不要再造独立 lockfile**——registry/lockfile 双 SoT 必漂移。注意 git fetch 协议 want 行要全 40 位，短 SHA 不可 fetch。
2. **内容即产物**（content-as-artifact）：字节是 pin 的物化产物，本地可再生——入 `.gitignore`，用物化器按需产出，不进提交历史。
3. **孤本例外声明**（orphan-by-declaration）：留实体字节的必须显式声明（如 `sourceGone: true`）——白名单由声明字段**派生**，不另建清单。

## 3. 四件套（最小完备集）

| 件 | 职责 | 删掉会怎样 |
|---|---|---|
| 锁清单（registry/manifest） | SoT：repo+pin+孤本标记+元数据 | 无索引一切崩 |
| 物化器（fetch） | pin→字节：init+浅取@pin+detached checkout，幂等+DryRun+`--reconcile` | 退化为 N 条手动 clone |
| `.gitignore` 物化区规则 | **真正的第一道防线**——默认路径约束 | `git status` 被 untracked 淹没，误 add 迟早发生 |
| 边界门（pre-commit gate） | `staged ∩ 物化区 ⊆ 孤本白名单`——拦显式越权（`git add -f` 能绕 gitignore 绕不过门） | 短期无事，误入库是活失效路径 |

**不变量单句化检验**：整套设计应能压成一句可判真伪的话（本仓实例：「远端只含索引与孤本字节，本地 fetch 后可全链即用」）。压不成的设计通常藏了第二个目的。

## 4. 物化器契约要点（实战踩出的坑）

| 坑 | 对策 |
|---|---|
| 短 SHA 不可 fetch | 清单存全 40 位；一次性 API 回填 |
| `HEAD==pin` ≠ 工作树完好 | `ls-tree -r -l -z HEAD` 存在性+尺寸双查（截断可抓）；有索引再 `status -uno`；空索引形态下 diff/status 全员误报 D |
| execFileSync `maxBuffer` 默认 1MB | 大仓 ls-tree 输出数 MB → ENOBUFS；**别让异常被 catch 吞成"就绪"假阴**，升 64MB |
| ls-tree `-l` size 列对齐空格 | `\s+` 切分，`split(' ')` 切出空串 `Number('')=0` 全误判 |
| 非 git 目录收养 | 目录在但无 `.git` → 拒动手报 notRepo，不 `git init` 变异它 |
| 本地漂移 | HEAD≠pin 只报不动；`--reconcile` 显式才对齐；缺文件→自动重建（无可失），改动→drift（可能有本地工作） |
| 改史工具副作用 | filter-repo 收尾 `reset --hard` 会把"原跟踪现剥离"文件全删——**改史后须按清单全量重建物化区** |
| NTFS 非法名/长路径 | `core.longpaths=true`；失败条目记 warning 汇总不中断 |
| `git add` 带 .git 目录 | 变 gitlink（mode 160000）——内层 `.git` 永远重拦，`vertical/**/.git` 段全局拒绝 |

## 5. 失效模式反推件数

不问"需要什么"，问"会怎样坏"——本仓实测三种坏法各有对应件、无冗余：

- **坏法 A**：内容被 commit 回来 → gitignore（默认路径）+ 边界门（显式越权）双层
- **坏法 B**：新克隆不能用 → fetch + lint 未物化容忍 + README 起手式
- **坏法 C**：历史仍含字节 → filter-repo 剥史（**含 gitlink 裸路径**——`--path dir/` 尾斜杠不匹配 gitlink，须 `--path dir` 再剥一轮）

## 6. 上游消失谱系（孤本成因不止一种）

| 形态 | 信号 | 处置 |
|---|---|---|
| 作者选择性下架 | 账号活跃、主仓在推、卫星仓 404（ruyi 四仓实例） | 孤本保留，观察是否复活 |
| pin 悬死 | repo 活但 force-push/分支删，SHA 不可达 | fetch 报 pin unreachable → re-pin 或转孤本人工裁决 |
| 上游重建史 | merge-base 为空、双根提交（jadx-mcp-server 实例） | 确认无本地改动后 reconcile 对齐 |
| 判定纪律 | codeload main+master+github 页面三方全 404 才算死 | 瞬时 404 会复活（Restore-JS 案例） |

## 7. 外部先例映射（收敛解验证）

四个独立生态撞出同一形态——本范式是收敛解非私有发明：

- **Bazel/dist**：fetch-by-SHA，内容寻址缓存 = 物化器原型
- **vendir**（Carvel）：声明式目录 + lockfile = 清单即锁先例
- **Go modules/Nesbitt《Lockfiles Killed Vendoring》**：lockfile 杀死实体 vendor = 物化制理论讣告
- **Google `third_party`**：真要 vendored 时的纪律——LICENSE 随包、**禁嵌套依赖**（dep-in-dep 污染如 vendored 仓里塞 Zydis 快照）、变更申报

## 8. 反模式清单

- 双仓方案（源仓+索引仓）：被单仓索引制完全取代，复杂度无收益
- 独立 lockfile：与 registry pin 双 SoT 漂移
- `git pull` 更新物化仓：更新信号应走元数据对账（registry checkCache），不动工作树
- 提交编译产物：build/ dist/ 入 vendored = 污染面（真实案例两起）
- 白名单例外口子开在忽略区内：白名单存在本身是"边界画错"的信号——能不例外就不例外

## 9. Compose

```
vendor-paradigm（本包：入库判据 + 物化不变量）
+ contract-core-paradigm（registry pin/repo/sourceGone 字段 = 数据契约，加法式演进五条适用）
+ sec-core-paradigm（上游内容=不可信输入，LICENSE/嵌套依赖/凭据混入边界门口径）
+ arch-core-paradigm（gates/ 共享 kit vs gates.local/ 仓专门的归属判定 = 端口边界问题）
+ docs-core-paradigm（清单与流程文档 = Reference/How-to 分工）
```

详细先例出处见 `references/sources.md`。
