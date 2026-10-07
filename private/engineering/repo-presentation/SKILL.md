---
name: repo-presentation
description: 仓库呈现与版本通道规范元规则——pre-release 通道判据（alpha/beta/rc 冻结面与升档浸泡）、Semver/PEP440 双轨映射与版本字段漂移检测、README 组件选型与隐私分层（shields/VHS/asciinema 等）、GFM 高级件（details/Alert/mermaid/双主题）、CLI banner/wordmark 触发与抑制契约。当版本发布准备、pre-release 通道判定、README/仓库美化、徽章选型、CLI 标识输出设计时使用。触发词：版本号、alpha、beta、rc、pre-release、PEP 440、semver、README 美化、徽章、shields、mermaid、details 折叠、cli banner、wordmark、版本通道。不适用：CHANGELOG 写作、CI 徽章配置、PyPI 发布流程。
metadata:
  layer: methodology
  compose: overlay-on-docs-core
---

# repo-presentation — 仓库呈现与版本通道规范

仓库"呈现面"的决策判据集：版本号怎么标、README 件放不放、GFM 件用不用、CLI 人格面出不出。四域常在同波"发布准备/仓库整理"任务中并用，故单包四节。不覆盖 CHANGELOG 写作、CI 徽章生成配置、包管理发布流程。

---

## 1. 版本通道（version channels）

### 1.1 通道冻结面与升档判据

判据骨架取 AndroidX 组件库 versioning.md（库视角最完整），通用化为：

| 通道 | 冻结面 | 浸泡期 | 升档判据 | tag 形态 |
|---|---|---|---|---|
| alpha | 冻**功能集**——新功能不再入档 | ≥2 周 | 功能集稳定，无 pending feature | `1.0.0-alpha.N` |
| beta | 冻 **API 面**——例外仅 ship-blocker 级修正 | ≥2 周 | API 面零未决变更，已知缺陷清单收敛 | `1.0.0-beta.N` |
| rc | 冻**构建**——rc 工件即终版候选 | 短浸泡（回归验证窗口） | 零 ship-blocker；rc 与终版**同构建** | `1.0.0-rc.N` |
| stable | 已发 rc 直接转正，不重建 | — | rc 浸泡期无阻断回归 | `1.0.0` |

- 编号惯例：首 alpha 从 `alpha01`/`alpha.1` 起（AndroidX 惯例 01 起，semver 惯例 .1 起，两轨皆可，**一仓一轨**）。
- 浸泡期是判据不是仪式：期内零阻断缺陷才升档；有阻断则修后**重计**浸泡期。
- 降档合法：rc 发现 ship-blocker → 修后回 alpha/beta 重走，禁带病转正。

### 1.2 Semver / PEP 440 双轨映射

跨栈仓（Rust+Python、Node+Python）同一发布须两轨同义：

| Semver 2.0（tag / Cargo.toml / npm） | PEP 440（pyproject.toml / wheel） | 语义 |
|---|---|---|
| `1.0.0-alpha.1` | `1.0.0a1` | alpha 1 |
| `1.0.0-beta.2` | `1.0.0b2` | beta 2 |
| `1.0.0-rc.1` | `1.0.0rc1` | rc 1 |
| `1.0.0` | `1.0.0` | stable |
| `1.0.0-dev.3` | `1.0.0.dev3` | 开发快照 |
| `1.0.0+build.5` | `1.0.0+build5`（本地段保留） | 构建元数据 |
| — | `1.0.0a1.post2` | PEP 独有的 post 段，Semver 无正典对应——跨栈仓**避免 post** |

- maturin 类构建器自动归一：源字段写一轨，产物按目标生态归一——**源以 tag/Cargo 的 semver 为 SoT**，pyproject 字段由构建器派生，不手双写。
- `pip --pre` 隔离语义：PEP440 pre-release 段天然被 pip 默认过滤——pre 通道天然有"不打扰 stable 用户"的隔离；npm/其他生态无此闸，pre tag 的分发隔离须显式（dist-tag / 通道说明）。
- [禁止] 双轨同仓混写（tag 打 `1.0.0a1` 或 pyproject 写 `1.0.0-alpha.1`）——两轨各守其生态正典。

### 1.3 版本一致性门

版本字段常散居 `pyproject.toml` / `Cargo.toml` / git tag / wheel 文件名多处——漂移是高频事故（tag 打了 1.0.1 而 pyproject 留 1.0.0）。

- **判据：字段等值断言属确定性可机械化面**——`grep`/`toml` 解析抽各字段，归一化（剥 `v` 前缀、双轨归一）后等值比较。这是典型的"卡低位→门"晋升候选，本包只给判据不给实现：发布前跑一致断言，漂移即 fail。
- 例外排气阀：预发布演练（不真发 tag）时 tag 缺席属合法——一致性门须认"缺 tag"与"tag 漂移"两种不同信号。

## 2. README / 仓库美化

### 2.1 组件件隐私与供应链分层判据（自创三档）

| 层 | 形态 | 代价面 | 判据 |
|---|---|---|---|
| **Tier A 静态仓内** | SVG/PNG 产物入仓（mermaid 渲染图、VHS 产 GIF、本地生成徽章） | 零第三方依赖、零遥测 | **默认档**——能静态产出的一律静态入仓 |
| **Tier B 托管动态** | shields.io/github-readme-stats/capsule-render/typing-svg/snk 等托管 SVG 服务 | **每次浏览回第三方服务**：可用性依赖 + 访客遥测面 | 明示信息增益才放行（实时 CI 状态、动态星数）；装饰性动态件不值这个代价 |
| **Tier C 实录件** | VHS tape→GIF、asciinema cast→GIF/SVG | 产物静态（同 Tier A 收益），录制脚本入仓可复现 | 动态效果的正确形态——**产物静态入仓，脚本入仓可再生** |

选型口诀：**先问"这件是信息还是装饰"——信息件问能否静态化（能→A/C），动态信息件才谈 B；装饰件进 B 层须显式写出隐私代价接受理由。**

### 2.2 组件件索引

- 徽章：shields.io（事实标准）；awesome-badges / readme-widget-hub 作索引仓。
- 头图/打字机：capsule-render、readme-typing-svg（B 层，纯装饰件默认不荐）。
- 统计图：github-readme-stats（B 层；自托管可降代价）。
- 技能图标：skill-icons。
- 贡献动画：Platane/snk（B 层，装饰性）。

### 2.3 终端实录类

- **VHS**：`.tape` DSL 声明终端会话→直产 GIF——脚本入仓，GIF 可再生，首选形态。
- **asciinema**：`.cast` 事件流（可版本化的会话记录）；`agg` 转 GIF、`svg-term-cli` 转 SVG——cast 源文件入仓同享可复现性。
- s-vhs 等衍生同判据：**录制源（tape/cast）与产物（GIF/SVG）双入仓**——产物是构建物不是源，源缺席的 GIF 不可再生=化石。

### 2.4 审美纪律

- 徽章预算：首屏 ≤5-6 枚，超出的降级到文档深处；每枚必须答"提供了什么信息"。
- 装饰件 vs 信息件：信息件（版本/CI/license/文档链）优先，纯装饰件（打字机/分隔图）默认删——装饰税是可用性+遥测双税。
- README 长度上限与去营销腔：复用 `docs-presentation-idiom` 的动线/体积预算/中英混排律，本包不重复立规。
- [禁止] README 里藏"AI 写作腔"——成就列表、营销形容词堆叠、无信息徽章墙。

## 3. Markdown 高级件（GFM mastery）

GitHub 原生渲染件——**全是 Tier A**（仓内文本，平台渲染，无第三方服务）：

| 件 | 形态 | 适用 | 滥用边界 |
|---|---|---|---|
| `<details>/<summary>` | 折叠区 | 长参考表、可选阅读、日志/输出样例 | 首屏动线信息不折——折叠=读者默认不看 |
| Alert 块 | `[!NOTE]/[!TIP]/[!IMPORTANT]/[!WARNING]/[!CAUTION]` | 关键提示分级 | **≤2 个/篇**——满屏 alert 即无 alert |
| mermaid | ```` ```mermaid ```` | 流程/时序/依赖图，文本可 diff | 复杂图退化为图片资产（mermaid 超 ~20 节点可读性崩） |
| `<picture>`+`prefers-color-scheme` | 双主题图源 | 深浅主题两套截图/图 | 单主题内容不用——双份维护税 |
| 行内色值 | `` `#RRGGBB` `` | 调色板/色票文档 | 仅设计文档用，滥用成视觉噪音 |
| math | `$...$/$$...$$` | 公式必备场景 | 无 |
| geoJSON/topoJSON | ```` ```geojson ```` | 地理数据可视化 | 无 |
| 锚点互链 | `#section-name` | 长文内部跳转 | 标题改名锚点即断——改名须搜链 |
| align 属性 | `<p align="center">` | 头图/wordmark 居中 | 正文不用——居中文本毁阅读动线 |

## 4. CLI 标识输出（内部工具人格面）

### 4.1 触发契约

banner/wordmark/tagline/哲学行/颜文字**只在"探索时刻"出**——bare-invoke（无参）、`-h`/`--help`、`--version` 三触发点；**工作调用永不出**——人格面出现在数据输出里=污染管道。

### 4.2 抑制矩阵

| 闸 | 条件 | 理由 |
|---|---|---|
| TTY 闸 | `stdout`/`stderr` 非 TTY → 全抑制 | 管道消费方要的是数据不是人格 |
| CI 闸 | `CI=true`/常见 CI env → 全抑制 | CI 日志里的人格面是噪音+误报源（turborepo #11464：stderr banner 被监控误判为错误输出实证） |
| 色彩闸 | `NO_COLOR`/`TERM=dumb` → 色彩退化但文字可留 | 尊重用户色彩偏好标准闸 |
| 个人逃生口 | `<TOOL>_NO_BANNER=1` 类 env off 惯例 | 高频用户的退出权 |

### 4.3 流纪律与制式

- **stdout = 可管道数据；stderr = 诊断 + 人格面**——banner 若必在工作调用出现（不推荐），也只能落 stderr 且过抑制矩阵；探索时刻三触发点无此限（无数据流可污）。
- wordmark 制式：真字体生成期渲染物化（pyfiglet `ansi_shadow` 等字体件）——**禁手绘字形**（不可复现、字体不一致）；语录/哲学行溯源正典不新造。
- orval `--quiet`、cligentic banner（bare-invoke/--help 触发 + NO_COLOR/非 TTY 退化）为正例。

## 5. 红线

1. [禁止] 托管动态件（Tier B）无信息增益理由入 README——装饰性 B 层件=用访客隐私换动效；
2. [禁止] 实录件只入 GIF 不入 tape/cast 源——源缺席的产物不可再生=化石；
3. [禁止] 版本字段手双写（pyproject 与 Cargo/tag 各写一份）——一处 SoT 其余构建器派生；
4. [禁止] CLI 工作调用输出人格面——stdout/stderr 皆不可，探索时刻外零容忍；
5. [禁止] Alert 块超 2 个/篇、首屏关键信息进 `<details>`；
6. [警告] 徽章超预算、装饰件堆叠——审美纪律项，review 时指出不硬拦；
7. [禁止] 通道浸泡期未满升档、rc 带病转正——版本通道判据是质量门不是仪式。

## 6. Compose

```
repo-presentation（本包：版本通道 + README 件 + GFM 件 + CLI 人格面判据）
+ docs-presentation-idiom（README 排版动线/体积预算/去疲劳——本包管"放不放"，它管"怎么排"）
+ docs-core-paradigm（README 体裁=front-page/howto 混合的呈现判定）
+ mutation-safety-paradigm（发布动作=non_idempotent 变更类，版本通道判据是其 preview 语义的一部分）
+ contract-core-paradigm（Semver/PEP440 是版本契约语义，版本字段漂移=契约面破坏）
+ review-signal-audit（README 化石/装饰件堆叠是其信号面之一——审计时复用本包分层判据）
```

## 参考

- `references/sources.md` —— 调研出处索引与明确不纳入清单
