# Sources — config-core-paradigm 先例索引

| 成分 | 出处 | 贡献 |
|---|---|---|
| 复杂度时钟 | Mike Hadlow, "The Configuration Complexity Clock" (2012) | 配置膨胀轨迹 0→12 点钟；规则引擎/DSL 是越线形态；本包 §4 纪律上限 |
| 组合式配置 | Hydra (facebookresearch) — Defaults List / `_self_` / override grammar (`=`,`+`,`~`) / Structured Config / `--info` | 组合优于硬编码优先级；解析序即数据；缺省必填 MISSING；effective-config 内省先例 |
| 旗标分类与生命周期 | Pete Hodgson / Martin Fowler, "Feature Toggles" | release/experiment/ops/permission 四型；longevity/dynamism/ownership 三区分轴；退休纪律（owner+expiry+CI 报红） |
| 十二要素 | 12-Factor App, Config 章 | 配置与代码严格分离；env 作为部署绑定的经典表述 |
| 优先级链先例 | Spring Boot externalized config / Viper | 多源 precedence 工业形态——本包推广为"显式可内省的序"而非某一条固定链 |
| 配置语言对照 | CUE / Jsonnet / Dhall / Starlark | 9 点钟以后的形态样本——本包明确**不采用**配置求值化（防膨胀阀） |
| 结构校验 | JSON Schema / Hydra Structured Config | shape 轴统一为 schema'd 的先例 |

## 明确不纳入

- **远程配置中心**（Consul/etcd/Parameter Store）：是 source 词表的一员而非架构前提；本包不规定 store 选型
- **GitOps 工作流**：属 ops 流程非配置模型；Provenance 轴只要求"可答"不规定载体
- **配置加密在仓**（sops/mozilla）：密钥面归 sec-core-paradigm，本包只划"禁入"边界
