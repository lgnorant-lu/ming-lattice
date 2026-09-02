---
name: ui-design-paradigms
description: 现代数字产品与跨端 UI/UX 设计范式知识库与决策路由。包含 Google Material 3 (M3/Material You)、shadcn/ui 极客工程风、Apple HIG 毛玻璃、Microsoft Fluent 2、Bento Grid 便当盒美学、Swiss Style 瑞士国际排版、Neubrutalism 新野兽派、Editorial 杂志风等全球主流 UI 范式的核心哲学、Design Tokens 规范、网格韵律、组件层级与选型决策。当需要进行界面重构、设计规范对齐、组件库选型、制定设计系统或美化前端交互时使用。
---

# UI Design Paradigms — 现代数字产品与跨端 UI/UX 设计范式知识库

> 本技能为现代数字产品设计系统的**通用范式与设计哲学知识库**（独立于具体业务经验，纯粹收录设计系统与规范）。
> 核心目标：为前端重构、设计系统搭建、组件库选型提供标准化的**设计哲学、Token 规范、视觉层级与选型决策**。

---

## 快速导航与选型决策路由 (Decision Matrix)

```
需求场景类型                               推荐设计范式                      核心特征与关键字
───────────────────────────────────────────────────────────────────────────────────────────────────
B端控制台 / 开发者工具 / 极客数据面板   ─▶  shadcn / Linear 极客工程风     单色灰阶(Zinc), 1px细线, 等宽字符, Ghost按钮
跨端通用 / Android 生态 / 消费级应用   ─▶  Google Material 3 (M3)         Tonal Surface 色阶容器, 9999px胶囊, 动态色彩
苹果生态 / 创意多媒体 / 高端工具应用   ─▶  Apple HIG (Liquid Glass)      高斯毛玻璃, 晶体微光边框, SF Pro 字阶
SaaS 营销页 / 特性展示 / 聚合控制台    ─▶  Bento Grid (便当盒美学)        非对称模块化, 空间仪表槽, 光标环境聚光灯
专业设计工具 / 极简排版 / 高端后台     ─▶  Swiss Style (瑞士平面排版)     严格数学栅格, 巨幅无衬线字阶, 包豪斯纯色块
创作者平台 / 独立开发 / 潮流社区      ─▶  Neubrutalism (新野兽派)        粗黑硬描边(2px), 纯色撞色, 零模糊硬阴影
内容出版 / 深度阅读 / 知识归档平台     ─▶  Editorial Magazine (杂志风)    衬线/无衬线混排, 首字下沉, 纸张暖底色
───────────────────────────────────────────────────────────────────────────────────────────────────
```

---

## 核心范式深度拆解

### 1. Google Material Design 3 (M3 / Material You)
* **核心哲学**：*“内容即容器，色彩即情感 (Content as Container, Color as Emotion)”*
* **关键设计规范**：
  * **Tonal Surface（色阶表面）**：废除纯黑生硬阴影，在暗色与亮色模式下通过叠加 5%~15% 的半透明基底色阶（Surface Container Low / Medium / High）来表达空间纵深；
  * **9999px 药丸胶囊（Pill & Capsule Shapes）**：搜索栏、Chip 辅助标签、主按钮均使用大圆角；
  * **严格的 5 级按钮层级**：
    1. `Filled Button`（纯色主行动点，如 Google 蓝 `#0b57d0`，全局单容器唯一）；
    2. `Tonal Button`（次要底色按钮，用于辅助操作）；
    3. `Outlined Button`（细线描边按钮）；
    4. `Text / Ghost Button`（纯文字无背景）；
    5. `FAB`（浮动球）。
  * **RAIL 性能交互**：微动效曲线 `cubic-bezier(0.2, 0, 0, 1)`，反馈时长控制在 150ms~300ms。

### 2. shadcn / Linear 极客工程风 (Modern Developer First)
* **核心哲学**：*“零噪音，绝对聚焦数据流与生产力 (Zero Noise, Radical Focus)”*
* **关键设计规范**：
  * **中性灰阶基底**：全站基于 `Zinc` / `Slate` / `Neutral` 单色调，严格禁用高饱和渐变与发光；
  * **1px 结构线划分空间**：使用 `border-zinc-200`（亮色）与 `border-zinc-800`（暗色）代替阴影；
  * **等宽数据流（Monospace Integration）**：包名、版本号、哈希值、快捷键提示（`⌘K`、`/`）统一使用 `JetBrains Mono` / `SF Mono`；
  * **语义化 Design Tokens**：
    * `background` / `foreground`
    * `card` / `card-foreground`
    * `muted` / `muted-foreground`
    * `accent` / `accent-foreground`
  * **容器化与信息减法**：低频/调试类操作一律收拢至 `Dropdown Menu` 或 `Sheet`（侧边滑动抽屉）。

### 3. Apple Human Interface Guidelines (HIG / 拟态毛玻璃)
* **核心哲学**：*“清晰（Clarity）、遵从（Deference）、深度（Depth）”*
* **关键设计规范**：
  * **材质模糊与通透感（Vibrancy & Blur）**：`backdrop-filter: blur(20px~40px)`，配合半透明白/黑底色；
  * **1px 晶体微光边框**：卡片外边缘辅以 `ring-1 ring-white/10` 模拟物理晶体边缘反光；
  * **SF Pro 字阶系统**：大标题（Large Title）、Headline、Subheadline 拥有严密的光学字距（Tracking）。

### 4. Bento Grid (便当盒美学)
* **核心哲学**：*“非对称模块化，把复杂数据装进优雅盒子”*
* **关键设计规范**：
  * **空间层级拆解**：主卡片（2×2 面积）承载核心仪表数据，次卡片（1×1 面积）承载状态指示；
  * **仪表化数据槽**：将散落的文字提炼为 `[ Label 上标 / Value 等宽数值 / Status 状态徽章 ]` 的槽位；
  * **Spotlight Follow 微动效**：卡片监听鼠标坐标，产生半径 300px~400px 的极淡柔光跟随。

### 5. Swiss Style (瑞士国际排版)
* **核心哲学**：*“形式追随功能，排版即是一切 (Form Follows Function)”*
* **关键设计规范**：
  * **严格数学栅格**：全站基于 8px 基础网格或 12 列严密对齐；
  * **巨幅无衬线字阶差**：Helvetica / Inter 粗体大字号标题与小字号说明形成剧烈张力；
  * **包豪斯纯色块**：无阴影、无渐变，通过几何色块分区。

### 6. Neubrutalism (新野兽派)
* **核心哲学**：*“反叛平滑主流，拥抱工业硬核力量”*
* **关键设计规范**：
  * **粗黑实体描边**：`border: 2px solid #000`；
  * **硬偏移投影**：`box-shadow: 4px 4px 0px #000`（无模糊度）；
  * **高饱和撞色**：高亮黄、高亮橙、纯黑、纯白。

---

## 前端实现速查表 (Tailwind CSS 映射)

| 范式 | 卡片容器类 (Container) | 边框与阴影 (Border & Shadow) | 按钮规范 (Button) |
| :--- | :--- | :--- | :--- |
| **shadcn** | `bg-white dark:bg-zinc-900` | `border border-zinc-200 dark:border-zinc-800` | `bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900` |
| **Material 3** | `bg-[#edf2fa] dark:bg-[#181c22]` | `border-transparent rounded-3xl` | `bg-[#0b57d0] text-white rounded-full` |
| **Apple Glass** | `bg-white/70 dark:bg-zinc-900/60 backdrop-blur-xl` | `border border-white/20 ring-1 ring-white/10` | `bg-white/20 hover:bg-white/30 backdrop-blur-md rounded-xl` |
| **Neubrutalism** | `bg-[#fffdf8]` | `border-2 border-black shadow-[4px_4px_0px_0px_#000]` | `bg-amber-400 border-2 border-black active:translate-x-1 active:translate-y-1 active:shadow-none` |

---

## 质量与审查清单 (Linter Checklist)

- [ ] **色彩纯净度**：是否避免了无意义的高饱和 AI 杂色渐变？
- [ ] **层级唯一性**：单卡片/单行是否仅有 1 个高对比 Primary CTA？
- [ ] **字符严谨性**：技术数据（包名、哈希、版本）是否使用 Monospace 等宽字体？
- [ ] **暗色可读性**：暗色模式是否采用 Tonal 色阶或微弱 1px 细线，而非粗暴叠加深黑重阴影？
- [ ] **交互确定感**：高频操作（复制、状态探测）是否在 0~100ms 内提供确定性即时反馈？
