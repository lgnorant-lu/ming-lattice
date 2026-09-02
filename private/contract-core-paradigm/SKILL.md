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

请求侧：可把必填改可选，不可把可选改必填。枚举只加值。线格式若有字段号（如 protobuf tag）禁止复用。

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

## 4. Compose

```
contract-core-paradigm
+ 场景差页
+ docs-core-paradigm（Reference = schema）
+ testing-core-oracle + 场景测试包（夹具与 kind 字段）
+ obs-core-paradigm（事件字段名对齐）
```
