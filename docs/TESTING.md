# 测试与验证

需要 Node.js 22+。完整套件还需要 PowerShell 7 和 Git；不下载依赖，不连接真实上游，不部署到个人客户端。

```bash
node tests/run.mjs --require-all
node scripts/verify.mjs --profile <quick|affected|full|release>
```

也可通过 `pwsh scripts/test.ps1 --require-all` 或 `sh scripts/test.sh --require-all` 透传。省略 `--require-all` 时，缺少工具的套件单列为 skipped，不计入 passed；严格模式下任何跳过也使退出码非零。

`scripts/verify.mjs` 提供分级门禁编排：
- `--profile quick`：仅运行纯 Node 逻辑测试（跳过外部 pwsh 进程池，秒级响应）；
- `--profile affected`：基于 `scripts/hooks/plan.mjs` 仅运行暂存区改动受影响的测试套件；
- `--profile full`：全量 17 个测试套件 + 严格离线供应链门禁；
- `--profile release`：full 门禁 + SBOM/SCA 新鲜度就地深度比对 + Benchmark 性能硬阈值检查。

## 验证范围

| 套件 | 判定来源与检查 |
|---|---|
| Hook 单测 | 提交格式的合法/非法输入 |
| Manifest 单测 | 合成 registry 与入口；启用、停用、缺失、身份错误、重复及路径越界；默认无写盘，显式写入仅临时根 |
| 路由黄金 | 典型任务的分类与候选回归，不单独代表配方质量 |
| 路由效果评估 | `tests/evals/route-effects.json` 的独立任务契约；验证 mode/domain/action/recipe、实际加载集合和禁止动作 |
| 路由安全回归 | 只读模式、多包名、否定和引用、词边界、实际配方、可用性、未知契约安全退回 |
| 适配器契约 | 模式映射、候选与正文分离；分类永不授予 case-init 权限 |
| 可观测事件契约 | 独立 NDJSON 通道、事件字段、相关 ID、非负耗时及 prompt/密钥脱敏；stdout JSON 不变 |
| RouteDecision 兼容矩阵 | 同主版本加字段、旧版本显式退回、未知控制值拒绝、必填字段缺失及路径型技能名拒绝 |
| 供应链来源门禁 | 外部来源 pins、provenance 协议、本地源有效性、锁文件存在性及 schema 强类型校验 |
| SBOM 生成与新鲜度 | CycloneDX 1.5 组件去重、依赖并集、来源 provenance 及组件版本变更防篡改比对 |
| SCA 报告与新鲜度 | 离线 advisory cache 扫描、漏洞状态及严重级别防篡改比对 |
| Lint 契约 | 验证 lint.ps1 文本模式、-Json 模式及 lint.checked 结构化运行事件断言 |
| Hook 影响面计划器 | 显式路径规则、未知路径 fail-closed、任务并集、单调性保证及 pre-push ref 解析 |
| YAML/registry | 标量、列表和真实 registry 可解析；隔离集成另验证重复键及部署结构 |
| CLI 隔离集成 | 临时仓库中真实部署内容、DryRun 状态不变、无效配置拒绝、包装重建不覆盖正文（有界并发池调度） |
| Hook 暂存区集成 | 临时 Git 仓库的 staged/unstaged 分离、工作文件已删、Unicode 和空格路径；不提交 |
| Manifest 新鲜度 | `--check` 比较两份清单，忽略生成时间；只读，不自动修复 |

测试定义在 [tests/run.mjs](../tests/run.mjs)，计数以运行结果为准（全量共 17 个套件）。测试使用临时目录并在 finally 清理；可用 `SKILLS_TEST_TMPDIR` 指定已存在的测试临时父目录。CLI 隔离测试采用有界异步进程池（并发上限 4）调度以提升执行效率。

## 内容与部署检查

```powershell
pwsh -NoProfile -File scripts/lint.ps1
pwsh -NoProfile -File scripts/lint.ps1 -Json
pwsh -NoProfile -File scripts/sync.ps1 -DryRun -Module rust-reverse
```

lint 对启用的部署单元要求入口及身份有效，参考仓库不按完整部署包验收。`-Json` 始终输出数组且错误退出码与文本模式一致。相对引用检查仍是启发式，不能证明全部运行时依赖齐全。

`update.ps1 -DryRun` 仅预览，连同 `-Force` 也不 fetch/ls-remote、不写 registry；未检查的来源显示 `NOT_CHECKED`，不是“最新”。真实更新检查需用户另行允许。

供应链来源门禁是离线检查，不访问上游：

```bash
node scripts/check-supply-chain.mjs
node scripts/check-supply-chain.mjs --json
```

它检查 registry 外部来源的 HTTPS provenance、pin、采集日期、本地源路径、deployable/private 入口和 package lockfile。仅供参考且 `deploy:{}` 的 vertical 依赖缺锁文件记为信息项，真正部署的依赖仍是 warning；`--strict` 将 warning 升级为失败。SBOM/SCA 未生成时明确报告 `not_configured`，不把缺少扫描结果当作通过。
机读输出契约见 [supply-chain-report.schema.json](schemas/supply-chain-report.schema.json)：默认模式仅阻断 `ERROR`，`--strict` 同时阻断 `WARN`。

对于已有 `package-lock.json` 的 registry 来源，可离线生成 CycloneDX lockfile inventory：

```bash
node scripts/generate-supply-chain-sbom.mjs --output artifacts/sbom.cdx.json
```

生成器只使用 npm lockfile，固定 `--offline --omit=dev --omit=optional`；npm 无法处理根 manifest 的 range 型条目时使用明确记录的 lockfile fallback。失败默认停止；`--allow-failures` 才允许输出 `partial` 结果，而 partial 会被 strict 门禁阻断。该产物是 SBOM inventory，不是 SCA 扫描，仍需单独的 OSV/Trivy 等工具。

本机 npm advisory cache 可用时，可生成离线 SCA 报告：

```bash
node scripts/generate-supply-chain-sca.mjs --output artifacts/sca.npm.json
```

`complete + findings_status=none` 才表示本次扫描无发现；`partial` 或有 findings 都会进入 strict 门禁 warning。离线 advisory cache 的新鲜度仍需发布前由受管控扫描环境确认。

独立性能基准不进入默认套件，避免把机器墙钟变成功能门禁：

```bash
node tests/benchmarks/route-performance.mjs
node tests/benchmarks/route-performance.mjs --json
```

基准报告真实/合成路由规模、候选去重和合成 registry 构建的首次/中位/P95 耗时；断言只检查结果、规模关系和构建不写盘，不设置绝对毫秒阈值。

工具链结构化事件可通过 `MING_SKILLS_EVENT_FILE=<path>` 开启，覆盖 manifest 构建、测试套件、lint 和 sync；默认不启用，不改变原有 stdout。

## 刷新清单

```bash
node scripts/build-router-manifest.mjs
node scripts/build-router-manifest.mjs --check
```

前者是显式写操作，后者只检查。测试不会自动重写两份真实 manifest。每个文件采用临时文件后改名；两份清单不是跨文件事务，中断后用 `--check` 发现不一致并重新生成。

## 门禁与限制

已安装的 pre-commit 对暂存 blob 扫描，再执行严格测试模式。测试读取工作树，因此部分暂存不等于对完整待提交树进行了隔离验证，提交前仍需审阅 staged/unstaged 差异。

通过这些测试不代表所有 Skill 内容正确、真实客户端遵循限制或所有 OS 已通过。当前没有完整 JSON Schema 验证器、跨客户端效果评估、实际浏览器 E2E、规模基准或自动变异活动；不要用 passed 比例代替这些证据。

方法论入口：[testing-core-oracle](../private/engineering/testing/testing-core-oracle/SKILL.md)；只读流程：[review.md](../private/engineering/testing/testing-core-oracle/references/review.md)。
