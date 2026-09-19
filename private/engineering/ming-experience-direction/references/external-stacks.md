# 外部参考栈（按阶梯层组织）

海纳百川的外部印证与可采栈。每层只收"该层决策能直接用"的参考，不堆书名。

## 方法论正典（元模型）

- **Garrett 五平面**（Elements of User Experience, 2002）：Strategy→Scope→Structure→Skeleton→Surface 建造序——文档阶梯的祖师爷模型；其"基本二元性"（每平面同时有软件面与信息空间面）是双轴思考的先声；
- **MDA 框架**（Hunicke/LeBlanc/Zubeck 2004, GDC）：Mechanics→Dynamics→Aesthetics，建造方向与体验方向相反——**双轴模型的最直接先例**；"小机制改动向上级联成意外体验"= 我们"下层偷渡上层"边界违规的同构警告；
- **RampStack creative-direction skill**（开源）：四轴 brief 框架（tone/aesthetic/relationship/sensory）——"让 brief 可被下游引用、drift 在决策时被捕"，与我们宪法可追溯律同病同药；证明"方向结构化为机读件"是生态公认需求；
- **Storyflow 三类评审**：direction/craft/decision 三型评审不可混开——评审相位表的直接来源；
- **Nielsen crit 协议**：presenter framing（用户是谁/目标/约束/今天要什么反馈）、3-8 人、反馈只对声明问题；
- **Agency routes / SMP**：创意公司"多条 creative routes 竞选、选定不混合"惯例 + single-minded proposition——备选案不混合制的行业原型。

## 宪法层（00）

- **GOV.UK Design Principles**（2012 起迭代至今）：十条原则活十年的先例——"Start with user needs / Do less / Iterate then iterate again"；证明好宪法是少而可追溯；
- **Dieter Rams 十诫**：工业设计的宪法原型；Rams 自己声明"非金科玉律"——宪法是可演化的，不是铭文；
- **IDEO / GDS 服务型原则**：原则面向"服务"而非"页面"——与产品系统体验同构。

## 哲学/情绪层（01）

- **Don Norman 情感设计三层**：visceral（本能观感）/ behavioral（使用行为）/ reflective（反思意义）——目标情绪可按层拆解再回填到各语法层；
- **Calm Technology（Amber Case）**：技术应在需要时才占据注意力——与克制门/稀薄关系场同源。

## 叙事层（02-04）

- **三幕弧线**：Entry/Conflict/Resolution 的通用骨架；Inkwell（Awwwards 2025）用三幕 + 禁跳章滚动旅程做 stealth 品牌发布；
- **Storyframe 12-beat（GLIDE）**：把网站每节映射到剧本节拍的文案侧框架——节拍密度比我们 7 阶段细，适合文案重的项目；
- **The Spark（Active Theory/Codrops 2026）**："storyboard 先于引擎选型，叙事脊柱要在技术栈替换下存活"——文档阶梯纪律的工业同构；
- **Hero's Journey**：经典 12 段原型，适合"用户即英雄"型产品页；重叙事慎用（会显得套路）；
- **gut-check 判据**："2 句话说不清弧线 = 不是叙事项目"（ai-web-design-codex playbook）。

## 空间层（05）

- **Christopher Alexander 模式语言**：空间关系先于实体——关系场思维的建筑学祖先；
- **Edward Tufte 信息密度**：data-ink ratio——密度语义（density carries meaning）的理论底；
- **Gestalt 原理**：接近性/相似性/连续性——关系与因果的空间编码工具箱。

## 动效层（06）

- **Disney 12 Principles of Animation → UI 映射**：squash & stretch 慎用（消费感），timing/staging/ease-in-out 必用；
- **Ussai UX Choreography 五原则**（R/GA + Glen Keane, SXSW 2015）：feedback(夸张)/feedforward(预示)/spatial awareness(舞台调度)/user focus/brand voice——动效语义词表的现成工业版："motion 回答 how+when+why"；
- **Material M3 Motion**：easing/duration token 表（emphasized/standard 双集 + short/medium/long 时长档）+ 新 motion physics springs；
- **IBM Carbon Motion**：productive vs expressive 双模式——企业级克制动效的参照系；
- **micro-interaction 四要素（Dan Saffer）**：trigger/rules/feedback/loops-and-modes——交互级动效的最小完整模型。

## 视觉/材质层（07-08）

- **禁带清单先例**：PULSE 明禁玻璃拟态/紫蓝渐变/霓虹/glitch/终端绿字/悬浮 HUD——负面清单写法；
- **驯化（taming）流程**：mood frames → 删到只剩语义 → 抽 token；资产圣经的"删除测试"：删除后表达实质受损才留；
- **Dark composite / precision 材质方向**：低反射、有质量、可切层——肃穆系体验的常用材质母题；
- **Atomic Design（Brad Frost）**：atoms→molecules→organisms→templates→pages 部件家族层级——与资产圣经"部件家族"同构；**关键警告：它不是线性流程**而是整体/局部并发的心智模型（先画 atoms 再祈祷合得拢是误读）；token 是其"亚原子粒子"。

## 场景层（09）

- **Scrollytelling 正典**：Snow Fall（NYT 2012，该体裁命名之作——11 人 6 个月；教训是"can we snowfall this"反噬：奇观不能盖过报道）、Firestorm（Guardian）、The Pudding 全库；
- **scroll = playhead**：滚动位置即播放头，用户控制时间——场景章节即"镜头"；
- **每场景一个主问题**：与 Snow Fall"每章开头一张 title card"同构的结构单元。

## 技术映射层（10）

- **栈分级**（ai-web-design-codex）：内容站 → 原生 CSS `scroll-timeline`（~0 JS）；一页叙事 → Lenis + GSAP ScrollTrigger（~150KB）；award 级 WebGL → Astro + Lenis + GSAP + R3F + r3f-scroll-rig——**选能成立的最轻栈**；
- **GPU 介入阈值**（2026 口径）：CSS transform/shadow 能完成的用 CSS；需真 3D 几何/纹理/光照才上 WebGL/WebGPU；WebGPU 在着色器预编译与显式内存上优于 WebGL（首帧掉帧与移动端崩溃的治理）；
- **镜头语言工具**：scroll 驱动 camera dolly（GSAP scrub + CatmullRomCurve3 相机路径，Blender 可导出路径）、FOV 50-60 自然观感（75+ 鱼眼畸变）、DOF/bloom/volumetric fog 后处理景深；
- **声场**：Web Audio API 运行时生成音效（Trionn 案）——免音频文件体积、可与动效同时间轴同步；
- **HTML-in-Canvas 区分**：WICG HTML-in-Canvas（原生 DOM→Canvas）≠ html2canvas 系导出——映射层写场景级用法。

## Token 层（11）

- **W3C DTCG Format 2025.10**：首个稳定版 token 格式，`$value/$type/$description` + 组与 `$extends`；duration/cubicBezier 一等类型；
- **三层 token 结构**：primitive（有什么值）→ semantic（什么意思）→ component（用在哪）——M3 叫 ref/sys/comp，Carbon 叫 background/layer/component，同构不同名；
- **choreography 边界**（UI/UX Atlas）：时长缓动进 token，编舞逻辑（时序编排/弹簧参数/property 选择）留组件代码——token 层不吞编舞；
- **luminance-first 可读性**：去色后一级关系仍须靠明度/线宽/间距可读。

## 降级/可及性（横切）

- **prefers-reduced-motion 两层级联**：全局 `@media` 归零层（fail-closed）+ 高优先级恢复层（仅恢复必需信号，且改写为 opacity/瞬态而非位移）——逐组件开关是 fail-open 反模式；
- **动效三类处置**：decorative → 禁用归零；essential → 改 opacity 化/瞬态表达；ambient → 降速而非停（如自旋减为极低转速）；
- **性能预算先例**：DeepSee Commerce（Awwwards HM）——WebGL 场景不阻塞首绘、中端 Android 与顶配同体验是验收线。

## 反模式索引（学了别用）

- "snowfalling" 贬义化：奇观盖过内容的反噬——视觉服务叙事，不是反过来；
- 榜单站选型（Awwwards 截图即规范）：案例是灵感不是宪法；
- 叙事未立先上 WebGL：技术栈先行是文档阶梯倒置。
