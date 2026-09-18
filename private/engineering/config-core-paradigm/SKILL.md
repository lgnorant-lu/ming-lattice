---
name: config-core-paradigm
description: Cross-scene configuration meta-rules: schema-first, binding projection, composition over precedence, ten-axis model, feature-flag lifecycle, complexity-clock restraint. Use when designing env vars, config files, user prefs, feature flags, i18n, or precedence rules. Triggers: config, env vars, feature flag, i18n, 配置, 环境变量, 特性开关. Not for payload evolution (see contract-core-paradigm).
metadata:
  layer: config
  compose: cross-scene
---

# Config Core Paradigm — 跨场景配置归一化元规则

配置不是一个东西，是一种**决策形态**：值不在写代码处定，延迟到某个上下文里绑定。归一化 = 每个配置点把下面的十轴答全——"类"只是常见的轴剖面组合，不是模型本身。

## 1. 十轴模型（核心抽象）

| 轴 | 回答的问题 | 典型词表 |
|---|---|---|
| **bind-time** | 值何时定 | `build / deploy / startup / runtime / per-run / per-request` |
| **authority** | 谁定值 | `dev / ops / experimenter / user / policy / derived` |
| **scope** | 值管到哪 | `global / env / tenant / user / session / run / node` |
| **dynamism** | 绑定后能不能变 | `frozen / restart-bound / reloadable / live` |
| **source** | 值从哪来 | `schema-default / file / env / cli / remote / computed / store` |
| **resolution** | 多源竞争谁赢 | `fixed-order / composition / explicit-override` |
| **shape** | 值长什么样 | schema'd（本模型唯一合法值——无 stringly） |
| **secrecy** | 公开还是密 | `public / secret` |
| **longevity** | 值活多久 | `permanent / transitional`（过渡型必须死） |
| **provenance** | 为什么是这个值 | `introspectable`（必须可答） |

**轴到既有机制的投影**（正交性自检——本包不另造轴，是把已有轴投到配置实体上）：

- bind-time → **序律**（组装根在 startup 解析 = 一个排序决策）
- authority → **gov**（归属权即 stakeholder）
- scope → **作用域代数**（属性系统已有机制）
- dynamism → **用动力学** + Port 注入决策
- longevity → **废动力学**（过渡配置必须退休——release flag 不死是债）
- secrecy → sec overlay；provenance → obs（`config_resolved` 宽事件）；shape → spec

## 2. 五类剖面（实例非模型）

| 类 | bind | auth | scope | dyn | source | longevity |
|---|---|---|---|---|---|---|
| 部署配置 | startup | ops | env | restart-bound | env/file | permanent |
| 用户态配置 | runtime | user | user | live | user-store | permanent |
| 参数配置 | per-run | experimenter | run/node | live | graph/sweep | per-run |
| 特性开关 | runtime | 按型分* | targeting | live | flag-store | **transitional** |
| 资源配置 | per-request | product | locale | static | bundle | permanent |

\* Hodgson 四型归属不同：release→dev、ops→ops、permission→product、experiment→experimenter。

**判例**：实验工作台的算法参数是 `bind:per-run / auth:experimenter / scope:run,node`——不是部署配置；算法变体开关是 experiment toggle，要挂寿命元数据。sweep 本质是"把一个轴变成逐 run 变量"。

## 3. 解析：组合优于优先级（Hydra 先例）

硬编码优先级链（`env > file`）是**有序组合**的特例。一般规则：**解析序必须显式、固定、可内省**——

- **defaults list 是数据不是代码**：合并序写成列表（声明式），last-wins；不写 if-chain 散落各源读取；
- **`_self_` 位置即语义**：本文件值相对 defaults 的位置要可指定（Hydra `_self_` 先例——序本身是配置的一部分）;
- **覆盖文法显式**：`key=val` 覆盖、`+key` 追加、`~key` 删除（Hydra override grammar）——增删改三种操作各有语法，不混用覆盖表达追加；
- **缺省必填**：无默认的键标 MISSING，启动即错，不留到用时空指针（Hydra MISSING 先例）。

## 4. 复杂度时钟（Hadlow）——停在四点钟

配置系统的自然膨胀轨迹：`硬编码 → 平铺 KV → 结构化分层 → 规则引擎 → DSL`（0→12 点钟）。纪律：

- **合法上限 = 4~5 点钟**：schema'd 结构化配置 + 有序组合；
- **规则引擎/配置 DSL = 9 点钟以后，禁建**——配置里出现条件/表达式/求值即越线；
- **配置图灵完备化是反模式**：需要"逻辑"的部分回代码，配置只承数据（Hadlow：GUI/规则引擎通常以更贵的方式失败）。

## 5. Feature Flag 专章（Hodgson 分类 + 退休纪律）

| 型 | 用途 | 寿命 | 退休策略 |
|---|---|---|---|
| release | 藏未完成功能 | 天~周 | 全量后即删，过期 CI 报红 |
| experiment | A/B、变体对照 | 周~月 | 实验结题即删 |
| ops | 熔断/kill switch | 长存 | 运维控制面常驻 |
| permission | 按客权限 | 不定 | 转永久配置 |

- **创建即分类**：四型混在一个旗标表 = 债（release 当 permission 养）；
- **每旗标带 owner + expiry**：无 owner 无人退休；release 型超期即警（本项目映射：`provisional` 计龄同构）；
- **旗标债形态**：`if(flag)` 双实现永存——旧路径"以防万一"留着 = 两个真实现并存，废动力学违规。

## 6. 访问与注入（arch 映射）

- **读取位置**：源接触只在 adapters/边缘层（`os.environ`/文件/远程 store 一律如此）；内核见解析后的不可变值；
- **注入两形态**：静态配置=组装根一次解析、按值注入；动态配置（用户态/旗标）= `ConfigPort` 口；
- **配置不回流**：算子/引擎内禁写配置——配置是入向数据，运行态变更是事件不是回写。

## 7. 溯源与内省（obs 映射）

- **effective-config 可答**：任何配置点能答"当前值 + 胜出源 + 被压者"（Hydra `--info` 先例）；
- **解析即事件**：启动解析产出 `config_resolved` 宽事件（键/胜出源/遮蔽源——不含密钥值）；
- **漂移可查**：期望态 vs 生效态 diff 可机读导出。

## 8. i18n 分工

- **码=契约，串=资源**：错误码/枚举键是 schema 资产（稳定 ID）；locale 字符串是表现层资源包；
- **后端不持翻译**：locale 投影发生在 UI/CLI/报告边缘；后端出码不出串；
- **资源包按 locale 分层**：bundle 结构归表现层约定，不进配置 schema。

## 9. 禁令

1. **[禁止] 散落读源**：`getenv`/文件读取出现在边缘层之外 = 泄漏（映射 DenoiseStudio D3 `os` 禁令）；
2. **[禁止] 平行配置系统**：schema 旁再开一个 YAML/JSON 事实源 = 双真相；
3. **[禁止] 隐式解析序**：优先级链写进代码深处不可内省 = 无法审的序；
4. **[禁止] 配置求值化**：配置里出现条件/循环/表达式 = 复杂度时钟越线（§4）；
5. **[禁止] 过渡配置永生化**：transitional 配置无 owner/expiry = 债；
6. **[禁止] 密钥入配置面**：密钥仅 env/secret-store 绑定，禁入仓/禁入日志/禁入事件负载/禁入 effective-config dump。

## 10. Compose

```
config-core-paradigm（本包：十轴模型 + 组合解析 + 时钟纪律 + 旗标生命周期）
+ contract-core-paradigm（shape 轴落地：config schema 的演进=数据契约演进）
+ arch-core-paradigm（读取位置/ConfigPort/组装根注入）
+ sec-core-paradigm（secrecy 轴：密钥边界）
+ obs-core-paradigm（provenance 轴：config_resolved 宽事件）
+ ming-l-paradigm（longevity→废动力学、authority→gov 的域级投影）
+ overlay-core-paradigm（portability：env 绑定差异的可移植面）
```

*参考系与先例索引见 [references/sources.md](references/sources.md)。*
