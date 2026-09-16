# arch-core-paradigm 来源索引

> 采集于 2026-09-16 外部调研。一手来源优先；二手解读已标注。

## 正典

| 来源 | 内容 | 置信度 |
|---|---|---|
| Alistair Cockburn, "Hexagonal Architecture", HaT TR 2005.02（alistair.cockburn.us/hexagonal-architecture；C2 wiki `?HexagonalArchitecture` / `?PortsAndAdaptersArchitecture`） | 原始 intent："Allow an application to equally be driven by users, programs, automated test or batch scripts, and to be developed and tested in isolation from its eventual run-time devices and databases"；端口定义 "a port identifies a purposeful conversation"；多数应用 2 个端口、最多见过 4 个 | 一手 |
| Cockburn + Juan Manuel Garrido de Paz, *Hexagonal Architecture Explained*（2025 书稿，alistaircockburn.com） | intent 扩写含 "change connected technologies"；强实现判据 "The app cannot know anything about the external technology"；configurator 组装根 | 一手 |
| jmgarridopaz.github.io Cockburn 访谈 | driving/driven 侧区分依据"谁触发对话"；术语混用史 | 一手访谈 |
| Cockburn, *Component-plus-Strategy generalizes Ports-and-Adapters*（HaT TR 2022.01） | P&A 是 Component+Strategy 特例；UML provided/required interface 对应 | 一手 |
| "Configurable Dependency" 归属：Gerard Meszaros 命名，Cockburn 后认为该性质名更贴切——**并非**六边形的"原名" | 纠正流传误记 | 一手转引 |

## 相邻架构一手来源

| 来源 | 内容 |
|---|---|
| Fowler, *PoEAA*（2002）+ martinfowler.com/articles/badri-hexagonal | 三层被修正对象；对称性批评（p.21）；Data Mapper vs Active Record；"看领域复杂度"判据 |
| jeffreypalermo.com Onion Architecture 四篇（2008-07 起） | 四条 tenets；"not appropriate for small websites" |
| blog.cleancoder.com The Clean Architecture（2012-08-13） | Dependency Rule；明列 Hexagonal/Onion/BCE 为来源；增量 = Use Cases 环 |
| docs.aws.amazon.com/prescriptive-guidance hexagonal-architectures | 六边形 = DDD 单 BC 内 technical enabler 的定位表述 |

## 迁移接缝实践

| 来源 | 内容 |
|---|---|
| dev.to/gitguardian "How We Migrated the Heart of Our Platform to Rust" | 公共数据类型先行 + PyO3 保兼容 + Rust 子集逐步接管 |
| Lily Mara, "FFI refactoring"（InfoQ） | 函数级增量 Python→Rust via PyO3/C FFI |
| dev.to price-parser 移植案例 | core.rs 纯 Rust + lib.rs PyO3 适配器 + 原 Python 测试套件作 oracle |
| martinfowler.com Strangler Fig（2004 原帖 / 2024 重写） | 增量替换优于重写；端口边界 = 绞杀接缝 |
| Gary Bernhardt, Functional Core Imperative Shell（destroyallsoftware.com, 2012） | 管道场景下 P&A 的轻量等价物 |

## 未验证标注

- Fowler PoEAA Plugin 定义措辞与页码为常见转述，未逐字核验
- "端口即 FFI 边界"无命名正典，属 intent 推论 + 实践佐证
- "插件=运行时动态发现"与"端口=启动时装配"的区分是实践惯例而非模式定义差异
