---
name: contract-core-paradigm
description: Cross-scene data-contract meta-rules for additive schema evolution, semantic compatibility, and a single source of truth shared with tests and docs. Use when changing JSON schemas, testdata, API payloads, flags, exit codes, or cross-language fixtures. Triggers include schema-evolution, backwards-compatibility, tolerant-reader, data-contract, protobuf-compat, 数据契约, 字段演进, schemaVersion.
metadata:
  layer: data-contract
  compose: overlay-on-testing
---

# Contract Core Paradigm — 跨场景数据契约元规则

契约回答的是「这次输出对不对」之上的问题：字段怎么变、旧消费者还能不能读。兼容分源码、线格式、语义三层。本包不规定 Protobuf/JSON/Avro 哪一种。

安全在契约之前：未知字段可忽略；未知命令不可执行。

## 1. 演进五条

同一主版本（同一 `schemaVersion` 主号）内：

1. **只加字段** — 禁止删除已发布字段。
2. **不改义、不改类型** — 禁止把已有字段从 string 改 int，禁止偷偷改枚举含义。
3. **破坏则升主版本** — 删字段、改语义、请求侧新增必填，必须升 `schemaVersion`（如 `2.0`）。
4. **过渡须显式** — 多版本并存时写明窗口与谁读谁写；未发生多消费者流量时不要假装已上双读双写。
5. **读取端宽容未知键** — 忽略未识别字段；若需原样回写，不要丢掉未知字段。

补充细则（同属 §1，可引用为「演进五条-补充」）：

- 请求侧新增必填通常破坏旧请求；必填改可选也需为缺失值定义兼容行为。请求枚举扩展与响应枚举扩展分开判断：旧消费者的封闭枚举或穷尽分支可能拒绝新值，不能仅因“只加值”就宣称兼容。线格式若有字段号（如 protobuf tag）禁止复用。
- **deprecated 字段退出路径**：字段退役须先标 `deprecated` → 保留观察窗口 → 升主版本方可删除；禁止在同主版本内直接删。
- 版本对夹具还应覆盖缺失与 null、默认值、未知字段及未知枚举。生产者 schema 可严格拒绝拼写错误；消费者是否宽容读取需单独声明和验证。授权、命令等控制字段不得宽容解释为允许。只为实际存在的持久化数据或消费者维护迁移，不为假想版本增加兼容层。

Postel「接收宽容」只适用于可预见扩展，不是把畸形当成功。

## 2. 跨场景禁令

1. **[禁止] 静默改枚举语义**（如 `kind`、`domain`、`error_code`）
2. **[禁止] 删除已发布字段却宣称同版本**
3. **[禁止] 把新必填打进旧请求形状**
4. **[禁止] 把宽容读取理解成不校验、不失败**
5. **[禁止] 手抄第二份字段表** — Reference 指向 schema；测试夹具引用同一文件

## 3. Oracle

- 旧消费者能读新生产者的加字段载荷。
- 新消费者能读旧载荷（缺新字段用默认或可选）。
- 契约测试用 **版本对** 夹具，不只是单次 equals。
- 表征 Golden 标 `kind: characterize`；schema 变了要审 diff，不得当 spec 盲更新。

`error_code` 与可观测事件、测试断言、文档 Reference 同一字典。

## 4. 生成物门禁（Artifact Gate）

对 SBOM、SCA、manifest 或其它提交制品，生产者、schema、校验器、契约测试和文档必须作为一个变更单元维护：

- **字段闭环**：`required`、`properties`、可空类型、数组元素类型和 `additionalProperties` 必须在 schema 与校验器中具有同一语义。
- **正负夹具**：每个可空/可选字段至少有一个有效样本；缺字段、错类型、未知枚举、数组元素错误和额外字段各有负向样本。
- **严格边界**：持久化制品可以严格拒绝未知字段；运行时消费者是否宽容读取是另一份契约，不能用“读取端宽容”掩盖制品污染。
- **新鲜度判定**：只忽略明确声明的生成时间等非语义字段；来源、计数、依赖、finding、失败项的变化都必须能让 freshness 检查失败。
- **失败闭合**：partial、扫描失败、未知来源或 schema 不完整不能被表现为成功制品；错误应进入稳定的结构化 code。

## 5. Compose

```
contract-core-paradigm
+ 场景差页
+ docs-core-paradigm（Reference = schema）
+ testing-core-oracle + 场景测试包（夹具与 kind 字段）
+ obs-core-paradigm（事件字段名对齐）
```
