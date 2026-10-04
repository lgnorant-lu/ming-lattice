# consumers/ — 内置消费方目录件

消费层模型：`facts.jsonl` 是统一证据面，`run-boundary.mjs` 一次提取后向全部启用消费方分发（extract once → fan-out）。
evaluator（check-boundaries.mjs）恒在，不在 `consumers:` 段列举。

## 内置目录件

| id | outputs | 默认 phases | mutates | 用途 |
|---|---|---|---|---|
| `metrics` | report | staged/ci/manual | 否 | 事实面统计 + fidelity 降级遥测（采纳诊断用）；契约在场追加命名空间段：per-domain 分桶 + 域间边矩阵 |
| `emit-skeleton` | files | manual | **是** | 从观察拓扑起草 `boundaries.suggested.yaml`（推断稿，一律 warn 级，须人工审） |
| `diff` | report | ci/manual | 否 | 事实面差分（config.baseline 必填，仓根相对路径） |
| `docclass` | findings | staged/ci/manual | 否 | docClass 头判定（config.spec=docclass.yaml 必填）——classify 纯路径先筛、命中类才读件；遍历域=facts file facts（gitignored 治理文档本机照判、CI 真空过） |
| `nslaw` | findings+report | ci/manual | 否 | 标识命名空间法律（config.registry=ming.1 namespaces.json 必填）——defs×refs join 审计：悬空引用/撞名/格式/未登记族/散文-机读漂移 + per-ns 统计 |

## 选用与配置

`boundaries.yaml` 顶层 `consumers:` 段逐 id 列名激活（**列举是唯一激活通道**，目录内有文件不自动跑）：

```yaml
consumers:
  metrics:
    phases: [ci, manual]
  diff:
    baseline: .boundary/baseline.facts.jsonl
  my-check:
    entry: boundary.consumers/my-check.mjs
    phases: [ci]
    outputs: findings
    level: warn
```

解析序：`entry:`（须解析在仓根内，越界拒）→ `boundary.consumers/<id>.mjs`（约定区）→ `consumers/<id>.mjs`（本目录，kit 件）。
列名无实现 = CONFIG error（fail-closed，exit≠0）。

## 元数据键

| 键 | 必填 | 语义 |
|---|---|---|
| `phases` | 否（内置件有默认） | `staged`/`ci`/`manual`——staged 只跑声明者；∀ 语义消费方不得声明 staged |
| `level` | 否 | findings 的 severity 映射提示（消费方自身的 finding.severity 优先） |
| `outputs` | 否 | `findings`（JSONL 违规流）/ `report`（文本）/ `files`（写盘，须 `mutates:true`） |
| `mutates` | files 型必填 true | 写文件型消费方声明；无 `--apply` 时只准产出 `planned` |
| `entry` | 否 | 显式入口路径（仓根相对，越界即拒） |
| `baseline` | diff 必填 | 基线 facts.jsonl 路径 |
| `spec` | docclass 必填 | docClass spec（docclass.yaml）仓根相对路径，越界即拒 |
| `domains_from` | 否 | metrics 命名空间段的契约路径（仓根相对，缺省 `boundaries.yaml`；契约缺席则跳过该段） |
| `out` | 否 | emit-skeleton 输出路径（仓根相对，缺省 `boundaries.suggested.yaml`；越界拒、已存在拒写） |
| `registry` | nslaw 必填 | ming.1 namespaces.json 仓根相对路径（schema 归 ming-l-paradigm 立法） |
| `defs` | 否 | nslaw 实例登记源 `[{path, mode, pattern?, field?}]`；mode ∈ first_col/heading/bold/tokens/filename（path=目录，pattern 整段 match 即 ID）/json_field/section_list |
| `scan_exts` | 否 | nslaw 扫描扩展名（缺省 `[".md"]`） |
| `scan_exclude` | 否 | nslaw 追加豁免 globs（叠加契约 exemptions） |
| `scan_exclude_from` | 否 | nslaw 豁免清单文件（行首 glob + `#` 注释） |
| `prose_from` | 否 | nslaw 散文登记处文档——表内反引号前缀与 registry 双向互锁（反向只查 role=id） |
| `extra_namespaces_from` | 否 | nslaw 行首前缀清单（`PREFIX # 注释` 行，如 IV8 work_id_local_namespaces.txt）——合成 role=value 命名空间 `^<P>-?\d+[a-z]?$`，已在 registry 的裸前缀跳过 |
| `contract_from` | 否 | nslaw 豁免来源契约（缺省 `boundaries.yaml`） |
| `min_family` | 否 | nslaw 未登记族最少成员数（缺省 2） |
| `timeout_ms` | 否 | 默认 120s |
| `args` | 否 | 追加 argv |

未知键 → config warning。未知 phase/outputs → CONFIG error。

## 消费方协议 v1.1

调起：`node <entry> --facts <jsonl> --root <root> --config <entry-json> [--apply]`

- `outputs: findings` → stdout 逐行 JSONL `{"rule","severity","unit","file","line"?,"expect","observed","fix"}`，runner 归并按 (unit,line,rule) 排序并加 `via:<id>`
- `outputs: report` → stdout 自由文本，runner 加 `== [id] ==` 头输出
- `outputs: files` → stdout JSON `{planned:[],written:[],preview?}`；**无 `--apply` 只准 planned+preview，不得写盘**
- v1.1 双通道：`outputs: [findings, report]`——`{` 起头可解析行入 findings，其余行收编为 report 文本；`files` 独占 stdout 不得组合
- 非零退出 → error finding `<id>:crash`（stderr 截 500 字进 fix）

## 防线（先例固化）

- emit 型永不覆盖既有文件（terraform `-generate-config-out` 同款：只写新路径）
- emit 推断规则一律 `severity: warn` + `why: inferred:*`——生成物不是法律
- emit 在降级面 >20% 时头部标 `[WARN]`——降级事实写不出可信契约
- staged 相位无 `--staged-units` → runner 拒跑 evaluator（部分视图 ∀ 误报防线）

## 候审位（未实现，按消费拉动再落）

`extends:` 预设段（键名已注册）/ reachable / unique / n-way parity / cardinality / 通用查询引擎；
audit-domains §7 → 共享 lib 收敛（ming-l-paradigm 原生实现暂留）；
emit-skeleton 吃 nslaw unregistered-family 报告反起草 namespaces.json 草案。

## 设计血统（外部先例 2026-09 调研固化）

孤立/孤儿检测在不同生态各有语义深度，本层取通用图面而非逐语言 RTA：

| 生态先例 | 语义 | 本层映射 |
|---|---|---|
| Rust `dead_code`（cargo check "never used"） | decl 级零入度，`pub` 面豁免 | `isolated`/`covered` 族 + `surface` 标记 |
| Go `deadcode`（RTA 全程序） + staticcheck U1000 | roots→可达集；`-whylive` 证人链 | 候审 `reachable` 消费方的语义参考：roots 声明+可达集+解释链 |
| JS/TS knip | **入口点注册表驱动**——漏一个入口=整片假孤儿 | docrole 推断/exemptions 即入口声明面；fidelity 戳记≈其 configuration hints |
| Python vulture 等 | 静态近似+置信度 | 前端候审 |

结论：垂直生态工具在语言内更深，但跨介质边（文档/manifest/gitignore/boundary）只有本层能连。reachable 实现时先回看此表。
