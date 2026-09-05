---
name: docs-presentation-idiom
description: Cross-scene GitHub Markdown presentation and typography rules. Eliminates AI aesthetic fatigue, emoji soup, and duplicated marketing fluff. Enforces block-type visual flow, strict symbol budgets, Chinese-English spacing, persona-based entry diversion, and volume limits (<= 200 lines for root README). Use when reviewing, writing, or refactoring GitHub READMEs, project docs, or release notes.
metadata:
  layer: documentation
  compose: overlay-on-docs-core
---

# Docs Presentation Idiom — GitHub 文档视觉与排版范式

本包规定 GitHub Markdown 的**视觉动线、排版律与去疲劳规则**。解决 AI 编码中泛滥的“Emoji 轰炸、标题套板、同义反复、纯文本大砖块”问题。本包不替代 `docs-core-paradigm`（Diátaxis 体裁分流），而是作为其视觉表现与排版落地的硬性约束。

---

## 1. 核心禁令

1. **[禁止] 标题装饰前缀** — 严禁在标题（`#`, `##`, `###`）前添加任何 Emoji 或符号（包含将 Emoji 换皮为菱形、箭头等前缀映射）。标题前缀默认归零。视觉层级由标题字号与相邻块类型决定，不靠前缀地标。
2. **[禁止] 同义反复扩写** — 严禁并列存在内容重叠的章节（如「核心优势」表后紧跟「功能特性」列表）。同类信息必须归并为单张能力对照表。
3. **[禁止] 4 列 HTML 指标卡作为默认** — 严禁在首屏默认使用 4 列 HTML 表格卡片（移动端易碎且产生横向滚动）。指标优先采用单行中圆点分隔。
4. **[禁止] 社交预览充当产品图** — 严禁将社交卡片（social-preview / OG banner）作为第一折插图。缺真实界面图时必须执行合法降级，不准以封面图顶包。
5. **[禁止] 徽章通铺瀑布** — 首屏徽章数量 $\le 4$ 枚（仅允许：核心版本、CI 状态、开源协议、核心生态），严禁排满一整行无关徽章。
6. **[禁止] 根目录冗余 TOC** — GitHub 页面自带右侧 Outline 导航，根 README 严禁在正文顶部堆砌 20 行带符号的链接目录。
7. **[禁止] 超过体积红线** — 根 README 目标 $\le 200$ 行源码（不含生成物），警戒 $300$ 行，超过 $400$ 行必须强制分流至 `docs/`，严禁通过无限套叠 `<details>` 假装达标。
8. **[禁止] 散文代替时序图** — 严禁使用多段纯文字数字编号（1. 2. 3. 4. 5.）描述复杂的安装/运行数据流，必须使用真实反映数据源与回退机制的 Mermaid 流程图。
9. **[禁止] 套话标题** — 严禁使用「核心优势」「功能特性」「使用方法」等通用套话。改用具体的任务与动作：「安装」「在设置页里做什么」「和自己搜 GitHub 差在哪」「作者如何被收录」。

---

## 2. 视觉扫读动线（Block-Type Flow）

纯 Markdown 无自定义 CSS 时，眼球只对**块类型的反差与切换**产生扫描锚点。

### 2.1 块类型切换律
相邻两块严禁出现同类冗长文本。标准眼球动线：
$$\text{名字与单行介绍} \longrightarrow \text{单行中圆点指标} \longrightarrow \text{产品真实图或直接进入命令} \longrightarrow \text{单行安装命令} \longrightarrow \text{Alert 风险说明} \longrightarrow \text{能力矩阵表} \longrightarrow \text{架构图} \longrightarrow \text{折叠后景}$$

- **代码围栏当色块**：`bash`、`yaml` 在 GitHub 上天然自带浅灰底色，是第一视觉停顿点。
- **单行指标**：采用 `·` 分隔（`9500+ DSH 插件 · 20000+ 通用 Skills · 2 小时增量同步 · 0 API 限流`）。
- **折叠当后景（`<details>`）**：辅助原理、长接口表、致谢放入折叠，不展开时不占用主扫描动线。

### 2.2 视觉预算约束
- **粗体预算**：全文粗体字符占比 $\le 10\%$。粗体是定位锚点，不是气氛助推器。
- **Alert 原生容器**：仅在存在远程执行风险（`> [!WARNING]`）或前置依赖（`> [!NOTE]`）时使用，严禁当花边装饰通篇铺设。
- **单色结构符限制**：`├─ └─ │` 仅用于目录树；`❯` 仅出现在代码块；`✓ / —` 仅出现在对照表单元格。

---

## 3. 读者入口分流模型（Persona Diversion）

README 是分流地图，不是百科全书。各角色读者必须在指定阶段完成分流：

| 读者画像 | 第一诉求 | README 承载内容 | 后续分流去向 |
|---|---|---|---|
| **终端安装者** | 复制哪一行即可运行 | 首屏命令 + 一张真实界面截图（缺图则纯命令） | 安装完毕即离开，不强迫读原理 |
| **GUI 使用者** | 安装后去哪里点击 | 5 步以内的操作说明 + 关键交互 | 进阶使用链至 `docs/tutorials/` |
| **插件/生态作者** | 我的插件如何被收录 | 简明收录条件一览 | 详细开发规范链至 `STANDARD.md` |
| **二次开发者/Agent**| 接口定义与数据流 | 真实数据流 Mermaid 架构图 | HTTP 表与代码结构链至 `docs/` |

---

## 4. 中英混排排版律

1. **文件级分离**：中文维护 `README.md`，英文维护 `README.en.md`，严禁在同一段落内逐句对译。两者章节结构必须同构。
2. **汉字与 ASCII 空格**：汉字与英文字词、数字、内联反引号代码之间强制保留一个空格：
   - 正确：`在 DSH Web GUI 中运行 \`install.sh\` 耗时 2 秒。`
   - 错误：`在DSH Web GUI中运行\`install.sh\`耗时2秒。`
3. **标点依宿主语言**：中文文档统一使用全角标点（，。！？：）；英文文档使用半角标点。
4. **代码反引号紧贴**：反引号紧贴代码本身，不包裹外部中文标点：`执行 \`dsh web\`。`
5. **表头单语言**：中文表格表头严禁出现 `Feature / 特性` 双语混排。

---

## 5. 编写与审查前必须回答的 6 个判定题 (Oracle)

- [ ] **Q1. 标题是否彻底零前缀？** 去除所有标题 Emoji 与符号映射后，视觉动线是否依然清晰自然？
- [ ] **Q2. 是否消除了同义反复？** 是否把优势与特性归并为单张高密度能力矩阵？
- [ ] **Q3. 首屏产品图是否保真？**（可证伪性检验：若图片 alt 或文件名指向 social-preview / banner，则本题判定**失败**。无真实截图时必须执行合法降级：首屏直接承接命令，或明确标注待补）。
- [ ] **Q4. 是否实现了读者分流？** 插件作者是否在第三屏前已被引导至 `STANDARD.md`，且根 README 未手抄整套开发规范？
- [ ] **Q5. 视觉预算是否达标？** 粗体 $\le 10\%$，徽章 $\le 4$ 枚，指标为单行，Alert 无装饰性滥用？
- [ ] **Q6. 源码行数是否在红线内？** 根 README 源码总行数是否在 $\le 200$ 行以内（警戒线 300，超 400 拆文件）？包含必要的已知限制、免责声明与卸载命令？

---

## 6. Compose 规范

```
docs-presentation-idiom (排版动线与去疲劳规则)
+ docs-core-paradigm (Diataxis 四象限与事实源契约)
+ references/scenes/<scene>.md (场景骨架: marketplace | cli | library)
```
