# Precedents — Ming-L 域 x 动词矩阵的活体先例对照

本文件回答"这套范式有没有实例化参照"：矩阵**每个格子都能指到活的系统**，但没有任何单一系统覆盖全矩阵——本范式是多系统并集的综合，组合层的摩擦需靠候审档与"省"动力学制度化发现。

## 域 x 先例

| 域 | 最强先例 | 具体形态 |
|---|---|---|
| Meta | Python PEP 1 / IETF RFC 2026 | "规则怎么改规则"的立法先例，60 年实证 |
| Spec | Ferrocene Rust Language Specification | 把实现行为写死成可认证 spec——normative/descriptive 分离的商业级实例 |
| Dev | Kubernetes API Conventions + Google Style Guides | 对象/错误/命名规范，细节级开发契约 |
| Gov | K8s SIG/OWNERS | OWNERS 文件 = 机器可查的管辖权（approver/reviewer 分权） |
| Verify | SQLite TH3 + 590x 测试比 | 验证域做到极限的形态（航空级认证） |
| Know | K8s CHANGELOG / Jepsen 分析归档 | 冻结史 + 事故归档 |
| Ops | OpenTelemetry spec | OTel spec 与 semantic conventions 分离 = 结构类型/语义标签分离的直系先例 |
| Exp | MLflow/W&B + NeurIPS 可复现计划 | 实验 manifest、artifact 链——ML 界实验域雏形 |
| Req | 所有标准组织 | RFC "Motivation" 节 = 薄 Req 形态 |

## 动词 x 先例

| 动词 | 先例 |
|---|---|
| 立 | CNCF sandbox 准入、cookiecutter/copier 脚手架 |
| 用 | PEP 编号索引、OWNERS 查询、API discovery |
| 守 | OpenSSF Scorecard 自动扣分、Spectral lint severity 分级（效力光谱的直接先例） |
| 省 | Rust crater run——全生态回归扫编译器改动的影响面，"省"的大规模实例 |
| 改 | KEP 修订链、PEP 修订史 |
| 增 | K8s feature gates alpha->beta->GA、Rust `#![feature]` 不稳定特性——孵化->验证->升格逐字同款 |
| 废 | K8s Deprecation Policy（X 版本弃用窗口）、Python DeprecationWarning->Removal |

## 技术系统级先例（与节点/算子规范体系贴身）

- **MLIR**：TableGen 算子 schema（=算子 spec）、每 op 自带 verifier（=契约）、dialect 命名空间（`ming.*` = experimental dialect 同款）、pass instrumentation（=宽事件）——"算子规范+契约+溯源"跑通十年；
- **Datasheets for Datasets / Model Cards**：provenance 作为一等公民在 ML 界已是规范现实——manifest 溯源条款的学术版；
- **OpenAPI + Spectral**：spec + 可机检规则分级（severity 0-3）——效力阶梯与规则 frontmatter 的先例；
- **OWNERS**（K8s/Chromium）：scope 代数的活例——目录级管辖权、继承、跨目录审批。

## 覆盖度诚实评估

- 单系统最高覆盖：**Kubernetes ~80%**（KEP=Meta、API Conventions=Dev、SIG=Gov、Conformance=Verify、feature gates=增、deprecation=废）——被规模逼出的必然形态，非理论构造；
- 无先例格：域 x 动词矩阵作为**整体显式检查器**使用（先例系统各自长出这些机制，但未把矩阵当诊断工具）；
- 风险声明：格子有先例 != 矩阵组合必然稳定——组合处未知靠候审档与省动力学消化，不靠先验消灭。
