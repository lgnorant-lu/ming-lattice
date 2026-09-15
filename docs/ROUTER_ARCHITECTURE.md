# 路由架构

定位：个人使用优先、可迁移的技能库，不是公共技能市场或拥有操作权限的执行平台。通用方法与本机路径、私有资产分开；现有目录不为概念分层而搬迁。

## 当前链路

```text
registry + 本地 SKILL.md 身份 -> 构建时 availability
维护者策划的领域/触发词/配方 -> build-router-manifest.mjs
                           -> 两份同内容 manifest
用户当前意图 + manifest     -> Decide（纯函数）
                           -> RouteDecision v2
                           -> adapt（纯映射）
                           -> 宿主另行检查权限、资源与加载限制
可选 --event-file       -> route.decided / route.failed NDJSON（不进入 stdout）
```

领域与配方仍在 [build-router-manifest.mjs](../scripts/build-router-manifest.mjs) 策划维护，尚未从任意 Skill description 自动推导。registry 决定条目与部署启用，构建检查入口身份并记录可用性；`compose.yaml` 是测试方法组合参考，当前不作为编译输入。不能把三者说成已经自动统一。

## 分类与组合

实际内核：[route-core.mjs](../private/ming-skills-router/scripts/route-core.mjs)。先识别 review/explain/plan/implement，处理 Markdown 引用、围栏与明确否定，再按词边界匹配。多包名不会在第一个命中时提前返回。

测试任务按语言、场景与工作流组合，工程质量可叠加。CLI 不覆盖表征意图；性质测试进入实际加载清单。测试/逆向等主任务冲突时返回 ask，而不是用置信度允许目标操作。

这是确定性规则分类，不是完整自然语言解析器。复杂否定、嵌套引用、阶段切换和仓库事实缺失必须由宿主确认；不要宣称任意长 prompt 都已正确理解。

当前已知边界与分类盲区：
1. **中文字词前缀穿透（假阳性风险）**：汉字术语在未作分词/长词消歧时，复合术语（如“渗透测试”）会由于缺乏空白词边界而命中单一通用触发词（如“测试”）。对于高度重叠的领域意图，系统宁可保守返回 `mixed / ask` 或提示人工消歧，不冒进执行未确认的单向单领域配方。
2. **跨语种安全/攻防领域词表局限（假阴性风险）**：当前各领域触发词以受控静态词表为主，未做全量外延安全术语枚举。
3. **关于语义向量检索（Embedding 路由）的架构调研结论**：已在工程上论证，禁止在运行时引入依赖本地 ONNX（冷启动 2~5s、体积 120MB+）或在线外部 API 的推理依赖；后续演进方向为“离线冻结向量校验与词表维护辅助（随取随查快照）”，主路由链路继续保持零依赖、确定性、高吞吐的纯逻辑实现。

## 契约与权限

- [RouteDecision schema](schemas/route-decision.schema.json) 是生产者字段定义；v2 增加模式和显式版本，支持 engineering 领域。当前编排 37 个受控技能，分布于 testing、reverse、ui、engineering、protocol 5 大领域及 13 条可执行配方，其中 `quality-gate-governance` 专用于门禁、runner、制品契约与供应链治理。
- [RouterManifest schema](schemas/router-manifest.schema.json) 定义构建快照。`ready` 仅表示构建时可引用入口，不代表全部依赖、MCP、私有 kit 或实际权限就绪。
- `adapt()` 将未知/v1 控制契约安全退回 handoff，不实施未经验证的兼容推断。消费端可忽略额外数据键，但不能把未知命令或模式当成功。
- 兼容矩阵见 [route-decision-compatibility.json](../tests/contract/route-decision-compatibility.json)：涵盖 9 种跨版本兼容夹具，v2 同主版本额外数据可读，v1/未知主版本、未知控制值和缺失必填字段安全退回。
- 性能门禁见 [route-performance.mjs](../tests/benchmarks/route-performance.mjs)：在 `--strict` 模式下断言单次路由决策 P95 < 10ms（千级候选重复场景 P95 < 50ms），千级 registry 构建 manifest P95 < 200ms。
- `allowCaseInit` 恒为 false。输出限制由宿主继续落实，纯函数和一份禁止列表不是安全沙箱。
- 候选名称与正文加载分离；ask/handoff 不加载执行配方，review/plan/explain 的限制必须传给下游。
- 可观测事件是 CLI 外层的可选旁路；事件只记录 `hint_hash`，不记录完整 prompt、密钥或错误文本。使用 `--event-file` 和可选 `--work-unit-id` 开启。
- registry 供应链门禁通过 `scripts/check-supply-chain.mjs` 离线检查来源 provenance、pin、锁文件和部署入口；结合 `--check-freshness` 提供 SBOM 与 SCA 深度比对防篡改。

与 v1 的变更理由见 [ADR-0005](adr/ADR-0005-review-safe-routing.md)。

## 跨端与分发

Node.js 22+ 可运行同包 CLI，读取同包 manifest；不要求完整管理仓库或 PowerShell。构建阶段需要 PowerShell 7，复用受校验 registry 解析器，避免维护另一套 YAML 解析。

宿主解析技能位置和本机工具路径。私有资产不自动公开；跨端分发必须检查所选技能的资源依赖和许可。Android/iOS 包声明 Bash 与平台要求，改为 SKILL_ROOT 不等于原生 Windows 工具已兼容。

本批不做语义向量检索、全量元数据迁移或多 Agent 调度。验证覆盖与未实现项见 [TESTING](TESTING.md)。
