---
name: arch-core-paradigm
description: 跨场景架构边界元规则——六边形架构（Ports & Adapters）的最小形态：内核/端口/适配器/依赖倒置/组装根六概念，适用边界判定，与 DDD/Clean/Onion 的关系，端口作为 FFI/语言迁移接缝。当讨论架构边界、模块解耦、外部系统适配、语言迁移预备、插件化 vs 端口化抉择时使用。触发词：六边形架构、hexagonal、ports and adapters、端口适配器、依赖倒置、clean architecture、洋葱架构、架构边界、FFI 边界、strangler fig、内核解耦。
metadata:
  layer: architecture
  compose: overlay-on-engineering
---

# Arch Core Paradigm — 架构边界元规则（六边形/Ports & Adapters 最小形态）

> 沉淀于 2026-09-16 外部调研（Cockburn 正典 + Fowler/Palermo/Bob 一手来源 + 迁移实践案例）。
> 核心结论：**东西不多，概念就 6 个；值得用最小形态，不值得上全套样板。**

## 1. 六个核心概念（正典即全部）

源自 Alistair Cockburn《Hexagonal Architecture》2005（原名 Configurable Dependency；六边形只是"五边形七边形画不出来"的图形选择）：

1. **内核（inside）**：业务逻辑，不知任何外部技术。
2. **Driving port（驱动端口）**：别人调我，我实现它（应用提供的 API）。
3. **Driven port（被驱端口）**：我调别人，别人实现它（应用需要的 SPI）。
4. **Driving adapter**：把外部触发（CLI/测试/HTTP/定时器）翻译成 driving port 调用。
5. **Driven adapter**：实现 driven port，对接 DB/文件/外部服务。
6. **Configurator（组装根）**：启动处把适配器注入端口——这就是原名 "Configurable Dependency" 的本义。

依赖规则：**所有源码依赖指向内部**。强实现判据（Cockburn 2025 书稿）：driven port 必须用纯领域语言表达，"app cannot know anything about the external technology"——用 SQL 写端口是技术合规但把手铐在 SQL 上。

其余一切（六边形画法、in/out 目录结构、per-use-case port、DTO 链、DI 框架）都是**可选实现惯例，不是模式本体**。Cockburn：多数应用只有 2 个端口，他见过最多 4 个。

## 2. 判定：谁触发对话

- driver/primary/driving（左）：触发交互的一方 → adapter **uses** hexagon 的端口（端口由应用实现）；
- driven/secondary（右）：被应用触发 → adapter **implements** hexagon 的端口。
- 术语 driving/driven 与 inbound/outbound/primary/secondary 同义，混用正常。

## 3. 相邻架构关系矩阵

| 对象 | 关系 | 一句话 |
|---|---|---|
| 经典三层（Fowler PoEAA） | 被修正对象 | 六边形把 UI→domain→datasource 反转为 UI→domain←datasource；只剩内外 |
| Onion（Palermo 2008） | 同构再表述 | 内层定义接口、外层实现、耦合朝中心；Palermo 自陈"不适合小网站" |
| Clean（Uncle Bob 2012） | 同思路+增量 | 增量是 Use Cases 环（承自 BCE）；Bob 明列来源含 Hexagonal |
| DDD | 正交互补 | 六边形管边界形态，对内核内部沉默；DDD 战略层帮你决定画几个六边形（每 BC 一个），战术层管里面怎么摆 |
| 插件架构 | 机制同源、意图相反 | 端口=内核主动定义的抽象（防御，隔离已知外部技术）；插件点=宿主被动接纳的扩展（开放，接纳未知未来功能）。结构上插件点≈ driving port 的运行时动态装配变体 |

## 4. 适用边界

**值得上**：同一端口多适配器并存（test/mock/真实 DB）；外部技术可能要换（2025 版 intent 明含 "change connected technologies"）；核心逻辑被多种驱动复用；长生命周期复杂应用；有明确迁移计划。

**过度设计**：纯 CRUD/领域稀薄（Fowler 判据）；小网站/原型期（Palermo）；单适配器且不会变。

**已知批评**（采纳为约束）：
- Fowler 对称性批评：图上 controller 调核心与核心调 DB 画得对称，本质不对称（PoEAA p.21）；
- Port explosion：端口按"对话"分（persist things / tell time / draw randomness），不按用例/类型分；
- 反射性仓储接口（永远只有一个实现的 XxxRepository = shadow codebase，Dan North 语）；
- 样板税：每层 DTO+mapper 链，anemic use case 是典型失败模式；
- YAGNI：动态语言里接口声明本身不是必需（Cockburn 原书即演示 Ruby 无声明版）。

## 5. 端口作为迁移接缝（FFI/ABI 场景）

"先定义干净 Port 再换实现"无正典命名，但是 intent 直接推论 + 有可考实践：

- **GitGuardian**（dev.to 官方案例）：Python 检测引擎迁 Rust——公共数据类型先行钉死 + PyO3 绑定保兼容 + Rust 子集逐步接管；
- **price-parser 移植**：`core.rs`（纯 Rust）+ `lib.rs`（PyO3 适配器）+ **原 Python 测试套件原封不动当 oracle**——端口=公共 API，测试=driving adapter；
- **上位模式**：Fowler Strangler Fig——端口边界就是绞杀接缝；"设计时就该让应用未来易于被 strangle"。

验收判据（抄 Cockburn 强实现）：grep 内核代码不得出现 `requests`/文件路径常量/SQL/框架类型——出现即端口不干净，迁移时必还债。

## 6. 最小形态（管道类内核首选）

Gary Bernhardt **Functional Core, Imperative Shell**（2012）是管道场景下 P&A 的轻量等价物：

```
内核 = 纯转换逻辑，输入输出只用可序列化值（bytes/普通 dict/Arrow），不 import 任何 IO 库
driven port 按对话分：SourcePort（拉数据）/ SinkPort（落库写文件）/ 按需 HttpPort/ClockPort —— 3 个左右
driving port 可不抽象：入口 pipeline.run(batch) 一个签名，CLI 和 pytest 都是 driving adapter
main.py = 组装根做装配，无 DI 框架
测试套件只通过端口打内核 —— 将来原封不动成为新实现的 oracle
```

**不要做的**：不给一次性脚本套 ports/adapters 目录；不为假想变化建单实现接口；不在层间搞 DTO 链。

## 7. 对当前问题的直接回答

**"架构涉及的东西是不是有点多？"——不多。** 模式本体只有 §1 六个概念 + 一条依赖规则。市面上让人望而却步的内容（per-use-case port、UseCase 类层级、RequestDTO/ResponseDTO 对、DI 容器）全是可选惯例，且多数被原作者和社区明确批评为过度设计。判断标准极简：**内核能不能不装数据库不连网络地跑测试**——能，就是六边形了。

## 8. Compose

```
arch-core-paradigm（本包：边界判定 + 最小形态）
+ contract-core-paradigm（端口签名 = 数据契约，演进五条同样适用）
+ testing-core-oracle（测试只打端口，oracle 判定独立于实现）
+ docs-core-paradigm（端口定义即 Reference）
```
