---
name: web-reverse-iv8
description: 'Use this skill when analyzing web JS encryption parameters (e.g. "这个 sign 怎么生成的"/"这个 w 参数怎么破"/"定位加密函数"), handling obfuscation (OB shell/eval-Function shell), identifying JSVMP/Worker/WASM carriers, choosing deobfuscation/reuse schemes, or patching iv8 environment to run target JS locally. Covers the full chain: HAR parameter tracing, encryption point localization via `_initiator.stack`, local deobfuscation, Python rewrite vs iv8 env-patching scheme selection, and local verification against HAR real values. Do NOT use for general web development, crawler engineering, frida-based runtime hooking, binary protocol reverse engineering (non-web-JS), or RPC/browser automation (Puppeteer/Playwright/Selenium — explicitly prohibited).'
compatibility: 'Python 3.8–3.14、Windows x64、Linux x64(manylinux 标准,支持 CentOS/Ubuntu/Debian/Fedora);macOS arm64 实验版经 GitHub Releases 分发不上 PyPI;核心依赖 iv8 社区版(`pip install iv8`)、httpx;可选依赖 curl_cffi(TLS 指纹)、wasmtime/pywasm(WASM 场景)、Node.js(Webpack bootstrap 拆解等纯计算备选);HAR 与 trace 文件由用户提供'
metadata:
  version: "v9.6"
---

# web 逆向实战指南

## 阶段门阻断规则(启动前必读,脚本硬阻断)

> stage_gate.py 检查字段见 [scripts/stage_gate.py](scripts/stage_gate.py) 源码注释。本章节保留 L3 强制前置(违反 → 产物无效)。

### 过程可信机制(v9.6 新增,防止先斩后奏)

**问题来源**:3/3 实战问卷复现 — agent 跳过 stage_gate 直接跑业务,业务结果正确后回填产物,gate 校验"产物自洽性"无法阻止。

**规则**:
- 每个 gate 必须运行并写入 `.stage_gate_history.jsonl`(stage_gate.py 自动记录)
- 进入 gate N 时,检查 gate N-1 是否已 PASS,无记录 → BLOCK
- 跳过 gate 直接跑业务 = P0 违规(即使业务结果正确)
- 交付前 stage5-verify.md §0 必须含 gate 运行记录(从 .stage_gate_history.jsonl 提取)

```
IF 要进入 gate N(N ∈ {3,4,5})
   THEN stage_gate.py 自动检查 gate N-1 是否已 PASS
   IF gate N-1 无记录 → BLOCK: "未运行 gate N-1 直接进入 gate N,禁止先斩后奏"
   IF gate N-1 状态 = BLOCK → BLOCK: "前置 gate N-1 未通过,不能进入 gate N"
```

**禁止**:
- ⛔ 跳过 gate 2 直接跑 gate 3(无 gate 2 PASS 记录)
- ⛔ 删除 .stage_gate_history.jsonl 规避检查
- ⛔ 业务跑通后回填产物再跑 gate(顺序违规)

### 强制前置(L3 指令层,违反 → 产物无效 + 阶段门阻断)

```
IF 要进入阶段 N(N ∈ {2,3,4,5})
   THEN 必须先运行:
        uv run scripts/stage_gate.py --stage N --task-dir ./<task-name>

   IF 退出码 == 0 (PASS)
      THEN 允许进入阶段 N
   IF 退出码 == 1 (BLOCK)
      THEN 禁止进入阶段 N
           禁止调用任何阶段 N 的工具/模块文件
           必须按 stdout JSON.action 字段回退到阶段 N-1 补齐缺失产物
           补齐后重新运行本检查,直到看到 PASS
   IF 退出码 == 2 (ARGS)
      THEN 修正命令行参数后重新运行

IF 跳过 stage_gate.py 直接进入阶段 N
   THEN 产物无效,触发 P0 阶段门阻断
        必须停下,运行 stage_gate.py,按结果回退或继续

IF stage_gate.py 返回 PASS
   THEN 还需确认 ./<task-name>/stageN.json manifest 已按 assets/templates/stageN.manifest.json 模板填写
        (stageN.json 缺失或 schema 校验失败 → stage_gate.py 返回 BLOCK;manifest 是硬门 P0)
        stageN 对应关系:gate 2→stage1.json / gate 3→stage2.json / gate 4→stage3.json / gate 5→stage5.json
```

**stage_gate.py 检查字段**(脚本内部规则,Agent 不需记忆,只看退出码;源码注释即唯一真相源):
- 阶段 2 入口:stage1-params.md 含「参数溯源表」「透传链路图」「_initiator.stack」(软警告)+ stage1.json schema 校验(硬门)
- 阶段 3 入口:stage2-output.md 含「[动态 JS 判定](references/workflow/stage2-tracing.md#§20-动态-js-判定v94-新增前置)」「[加密点位](references/workflow/stage2-tracing.md#§31-三概念定义加密点--入口函数--加密函数v94-新增独立成节)」「变换台账」「入口函数」「环境依赖」「入参个数完整性判定」「载体清晰度初判」(软警告)+ stage2.json schema 校验(硬门)
- 阶段 4 入口:stage3-labels.md 含「载体形态判定结论」「载体清晰度最终判定」「判定依据」「分支选择」「分支选择依据」(软警告)+ stage3.json schema 校验(硬门)
- 阶段四交付前(gate 5):stage5-verify.md 含「验证方式」「验证结果」「最终交付物」(软警告)+ stage5.json schema 校验(硬门)。注:产物文件名保留 stage5-* 历史命名(v9.26 合并原阶段四/五),实际对应阶段四验证报告

> **v9.30 双层校验**:md 字段检查降级为软警告(写入 stdout JSON 的 `md_warnings` 字段,不阻断);JSON manifest schema 校验是硬门(缺失或校验失败 → BLOCK)。manifest 提供 gpt 风格的强类型化 + 条件联动校验(verified≥2 captures、iv8→untrusted 控制件、attempts≥8→blocked 等),规则见 [schema_validator.py](scripts/schema_validator.py) 或可读化描述 [assets/schema-rules.yaml](assets/schema-rules.yaml)。md 检查保留是为了不破坏模块散文里"写入 stageN-*.md §N"的锚点引用。

> **v9.5 md vs manifest 真相源**(新增,消除边界模糊):
> - **manifest(JSON)**:硬门真相源,Agent 调试期只填 manifest,stage_gate.py 只校验 manifest
> - **md(叙事)**:交付前补全,服务人类审计,字段语义与 manifest 对齐但不强求逐字一致
> - **禁止**:调试期同时维护 md 和 manifest(浪费轮次);交付期只交付 manifest 不补 md(无法人类审计)
> - **字段去重**:"iv8 调试总轮次"等字段仅在 manifest 维护,md 用引用(见 stage5-verify.md §5.3 引用 manifest.attempts)
> - **BLOCK 调试**:读 [assets/schema-rules.yaml](assets/schema-rules.yaml) 快速定位规则,不用反编译 schema_validator.py 源码

**产物文件模板**:见 [assets/templates/](assets/templates/) 目录(stage1-params / stage2-output / stage3-labels / stage5-verify)。Agent 必须按模板填写,不得自创格式。

**JSON manifest 模板**:见 [assets/templates/](assets/templates/) 目录(stage1 / stage2 / stage3 / stage5 .manifest.json)。Agent 必须按模板填写 stageN.json,与对应 md 产物并行存在,作为 stage_gate.py 的硬门校验对象。manifest 是可校验子集,md 是完整叙事,两者字段语义对齐但不强求逐字一致。

## 核心原则:从内向外,最小执行范围

- 先分析依赖图,确定核心链路 → 只执行最小必要代码。
- 警示:从外向内(让整个应用跑起来)攻击面无限大——CSS/DOM/动画/事件等无关项都能卡死流程。
- 禁止:RPC/浏览器自动化(Puppeteer/Playwright/Selenium)——本 skill 不覆盖。
- 禁止:跳过依赖图分析直接 page.load 整个 JS(例外:IIFE 闭包单体见下方说明)。

> **page.load 整个 JS 的例外条款**:
> 当目标 JS 是 **IIFE 闭包单体**(原"单体混淆",v9.5 重命名;整个文件是一个 IIFE 闭包,所有函数共享闭包变量,无法独立提取)时,page.load 整个 JS 是**允许且唯一可行**的路径。典型场景:
> - 阶段四方案 2 的 iv8 补环境模式(见 [code-extraction.md](references/modules/code-extraction.md) §5.3.2)
> - 阶段二 2.2 Fallback "OB 壳静态完全不可读时的逃生路径"(见 [stage2-tracing.md](references/workflow/stage2-tracing.md) 2.2 Fallback)
> - 阶段二 2.1/2.3 字符串表拉取的 iv8 降级路径(见 [stage2-tracing.md](references/workflow/stage2-tracing.md) §2.1.2-A 降级路径)
>
> **判定 IIFE 闭包单体(If/Then,必须写入 stage3-labels.md §4 才能生效)**:
> ```
> 步骤 1(结构识别,任一命中即满足"含 IIFE 主体"):
>   IF 文件以 IIFE 或立即执行函数开头((function(){...})() / !function(){...}())
>      → 满足(纯 IIFE 结构)
>   IF 文件含 IIFE 调用(grep 命中 `!function(` 或 `(function(` 的某行,且该 IIFE 覆盖文件核心代码体)
>      → 满足(前缀赋值/函数声明 + IIFE 混合结构)
>      典型形态(gcaptcha4.js):
>         _xxx.$_AA = function(){...}();    // 前缀:全局辅助函数赋值
>         _xxx.$_BN = function(){...}();
>         function _xxx(){}
>         !function(){                      // 核心 IIFE 从此处开始
>            !function(){...}()
>         }();
>      判定依据:核心加密逻辑(由阶段二 `_initiator.stack` 定位的 file+line+col)落在 IIFE 内,
>               且 IIFE 内部函数共享闭包变量(grep 搜不到模块导出语句)
>
> 步骤 2(闭包不可独立提取性确认):
>   AND 内部函数共享闭包变量(grep 搜不到 module.exports / export / __webpack_require__ 等模块导出语句)
>   AND 函数不可独立提取(尝试从 IIFE 内 copy 单个函数到独立文件执行 → 缺闭包变量报错)
>
> 步骤 1 + 步骤 2 同时满足
>    → 判定:IIFE 闭包单体
>    → 必须在 stage3-labels.md §4 写明判定依据:
>       - grep 输出(IIFE 调用位置 + 是否有模块导出语句)
>       - 核心加密逻辑是否在 IIFE 内(引用阶段二 _initiator.stack 的 file+line+col)
>       - 函数可独立提取性检查结果
>    → 写入后允许 page.load 整个 JS(这是方案 2 / Fallback / iv8 降级路径的正常路径,非跳过依赖图分析)
> ```
> **非例外场景**(禁令仍生效):多文件站点、Webpack 多 chunk、可拆分的模块化代码——这些必须先做依赖图分析,page.load 仅加载必要代码。
>
> **强制约束**:未在 stage3-labels.md §4 写明 IIFE 闭包单体判定依据就 page.load 整个 JS → 违反"阶段门阻断规则",产物无效。

## 四阶段工作流

| 阶段 | 做什么 | 参考模块文件 |
|------|--------|--------------|
| 阶段一:日志基础分析 | 环境指纹采集(trace)+ HAR 参数分析 + WASM 存在标记(含URL) | references/workflow/stage1-basics.md |
| 阶段二:字符串可读性恢复与迭代溯源 | 2.1 字符串可读性恢复(全文件,不限 OB)→ 2.2 HAR `_initiator.stack` 逐帧溯源 → 2.3 局部去壳(eval/Function 等其他壳层 + Webpack 模块边界提取);静态分析为主,iv8 仅用于 2.1/2.3 字符串表拉取;变换台账记录载体清晰度初判 | references/workflow/stage2-tracing.md |
| 阶段三:载体形态判定与分支选择 | 基于加密点位脱壳后代码 + 变换台账(含载体清晰度初判)做载体形态判定 + 载体清晰度最终判定 + 分支选择(A/B/C/D,分支 C 合并原 C+E,含 Webpack + 无附加保护) | references/workflow/stage3.md |
| 阶段四:本地模拟与验证 | 分支实现指引(A/B/C/D)+ 方案 1/2 判定(分支 C,只看算法可静态还原)+ Python 重写 / iv8 补环境 + 验证 + 参数溯源表(数据由用户提供) | references/workflow/stage4.md |

## 模块索引

> **关键词反查**(v9.26 新增):当你在找某个具体概念/问题/工具时,用"关键词反查"列快速定位文档,无需逐个打开。

| 模块 | 何时用 | 必读时机 | 关键词反查 | 文件路径 |
|------|--------|---------|-----------|----------|
| 阶段门规则 | 进入下一阶段前(脚本硬阻断) | 启动时 | stage_gate / GATE / BLOCK / PASS / 阶段编号 | scripts/stage_gate.py(源码注释) |
| 适用范围 + 契约 + 方法论 + 代码规范 | 确认范围 / 输入输出 / 能力边界 / 写代码规范 | 启动时 + 写代码前 | 适用范围 / 契约 / 数据流 / 代码规范 / 命名 / 跨平台 | references/modules/conventions.md |
| 阶段一主文档(合并 HAR + trace + WASM) | 阶段一编排 + HAR 参数溯源 + `_initiator.stack` + trace 环境指纹 + WASM 标记 | 阶段一启动时 | 参数溯源 / _initiator.stack / 环境指纹 / WASM 标记 / trace 能力边界 | references/workflow/stage1-basics.md |
| 阶段一示例集(辅助参考,非必读) | 参数分类示例 / WASM 检测示例 / trace 数据结构详解 / filter 输出格式示例 | 规则理解困难时 | 参数分类 / WASM 检测 / trace 数据结构 / filter 输出 | references/workflow/examples.md |
| 阶段二主文档(合并 去壳 + Webpack) | 阶段二完整流程编排 + 2.1 字符串还原 + 2.2 栈帧溯源 + 2.3 局部去壳(壳定义/eval-Function/CFF)+ 2.3.5 Webpack 模块边界提取 | 阶段二启动时 | 字符串还原 / 脱壳 / 变换台账 / 边界标记 / OB 壳 / eval / Function / CFF / __webpack_require__ / 模块边界 / require.c | references/workflow/stage2-tracing.md |
| 阶段二示例集(辅助参考,非必读) | depend 调整循环诊断 / 标准B 抽样分层 / require.c 注入模板代码 / 常见误判清单 / 大文件处理 | 规则理解困难时 | depend 调整 / 标准B 抽样 / require.c 注入 / 常见误判 / 大文件 | references/workflow/examples.md |
| trace 能力边界与指纹采集 | 阶段一 trace 速查表 + 能力边界 + 环境指纹采集;阶段四环境差异检测 | 阶段一 + 阶段四 iv8 路径时 | trace / 环境指纹 / 反检测 / webdriver / [Object Proxy] | references/workflow/stage1-basics.md §4-§6 |
| 阶段三主文档(含载体形态 §3.1 + Webpack 特征核对 §3.2 + 分支判定 §3.6) | 载体形态判定矩阵 + W1-W4 特征核对清单 + 分支选择 A/B/C/D + Gotcha | **阶段三启动时必读** | 载体形态 / JSVMP / WASM / Worker / 分支选择 | references/workflow/stage3.md |
| 阶段四主文档(含分支实现指引 §5.1 附录 + 方案1/2判定 + 实现 + 验证 + 职责边界) | 职责边界(只逆向算法,数据由用户提供)+ 分支实现指引(A/B/C/D)+ 分支 C 方案 1/2 判定(只看算法可静态还原)+ Python 重写 + iv8 补环境 + 验证策略 + 参数溯源表 | 阶段四启动时必读 | 方案1/方案2 / Python 重写 / iv8 补环境 / 参数溯源表 / Recovery Level / IIFE 闭包单体 | references/workflow/stage4.md |
| 扣代码与本地模拟(子模块,深度内容) | 扣代码模式 + iv8 补环境模式 + 验证策略 | 阶段四启动时 | 扣代码 / 闭包 hook / 验证策略 | references/modules/code-extraction.md |
| iv8 补环境(子模块,深度内容) | 有浏览器依赖/JSVMP/Worker | 方案 2 时 | iv8 / page.load / 补环境 / 止损规则 / 桩函数 / wrapNative / 指纹参与加密 / environment 覆盖 | references/modules/iv8-env-patching.md |
| 方法论 | 数据流追踪能力边界 + HAR 能力边界 | 概念不清时 | 数据流 / 能力边界 / 不可观测 | references/modules/conventions.md §3 |
| API 速查 | 写代码查签名 | 写 iv8 代码时 | iv8 API / JSContext / page.load / eventLoop / 桩函数清单 / 内存限制 | references/modules/api-reference.md |
| 代码规范(写代码前) | 写代码前 | 写代码前 | 代码规范 / 命名 / 文件组织 / 跨平台 / 工具能力边界 | references/modules/conventions.md §4 |
| trace 分析脚本 | 10 个命令处理大 trace 文件 | 处理大 trace 时 | trace_analyzer.py / 大 trace / fingerprint | scripts/trace_analyzer.py |
| 代码模板 | 单 Context / 多线程 / page.load / 网络桥接 / 扣代码 | 写代码时 | 代码模板 / page_load.py / 网络桥接 | assets/templates/ |

## 禁止事项(分级 P0/P1/P2)

> **分级规则**(v9.5 引入,响应 agent-skills-creation "Calibrate Control to Fragility"):
> - **P0(⛔ 硬约束)**:违反 → 产物无效,触发阶段门阻断。任何兜底/临场发挥均不允许。
> - **P1(⚠️ 流程约束)**:违反 → 必须在对应 stageN-*.md 记录偏离理由,否则视为违规。
> - **P2(📐 风格约束)**:违反 → 影响交付物质量,但不阻断流程。

### P0 硬约束(⛔ 违反 → 阶段门阻断)

- ⛔ 禁止 RPC/浏览器自动化(Puppeteer/Playwright/Selenium 等)——本 skill 不覆盖。
- ⛔ 禁止跳过依赖图分析直接 page.load 整个 JS(例外:IIFE 闭包单体,见"核心原则"例外条款;必须写入 stage3-labels.md §4 才能生效)。
- ⛔ 禁止跳过方案 1 必试清单直接走方案 2(除非方案 2 触发条件任一满足,见 [stage4.md](references/workflow/stage4.md) §5.2.1)。
- ⛔ 禁止因"被加密数据依赖浏览器"而跳过方案 1(v9.17 重构,见 [stage4.md](references/workflow/stage4.md) "职责边界" + §5.2.4 Gotcha)——skill 只逆向算法,数据由用户提供,参数依赖浏览器不阻碍方案 1。
- ⛔ 禁止方案 1 试跑失败后搭建动态调试环境做深入根因分析(快速检查参数对齐排除笔误后,直接降级方案 2,见 [stage4.md](references/workflow/stage4.md) §5.3.3)。
- ⛔ 禁止在 iv8 调试循环中无回退(连续失败 3 次同类错误必须止损,见 [iv8-env-patching.md](references/modules/iv8-env-patching.md) "iv8 失败止损规则")。
- ⛔ 禁止跳过阶段门(阶段二→三→四任一前置产物缺失,必须停下补齐,见"阶段门阻断规则")。
- ⛔ 禁止跳过 `scripts/stage_gate.py`(进入阶段 N 前必须运行 `uv run scripts/stage_gate.py --stage N --task-dir <path>`,看到 PASS 才能继续;跳过 → 产物无效,见"阶段门阻断规则"强制前置)。
- ⛔ 禁止使用 `with_devtools` / `watch_apis` / `enable_console` 等 DevTools 相关 API(iv8 反调试走 `vdebugger;` + `vconsole.log` + `wrapNative`,不走 DevTools;定位环境探测点用 `mode='debug'` + 日志分离 + grep 过滤,见 [iv8-env-patching.md](references/modules/iv8-env-patching.md) "诊断:定位环境探测点")。
- ⛔ 禁止使用 Black-box reuse 模式(已删除,见 [code-extraction.md](references/modules/code-extraction.md) §5.1)。iv8 补环境失败时触发阶段门阻断 → 回溯阶段二检查脱壳代码完整性 → 无法修复则走"任务失败交付物"流程,不允许走 Black-box 兜底。
- ⛔ 禁止跳过 iv8 调试前置门直接进入环境参数对比(v9.30 新增,见 [stage4.md](references/workflow/stage4.md) §5.4.0)。进入方案 2 iv8 补环境前,必须按顺序通过 3 步前置检查:① 算法确认(grep 搜索已知加密算法常量)→ ② 加密前明文对比(hook 入口函数 dump 浏览器 vs iv8 明文)→ ③ 环境检测(仅当明文一致密文不同时才执行)。跳过 Step 1/2 直接列 navigator/screen/canvas 字段对比 → 产物无效。
- ⛔ 禁止在未穷尽现有工具(Grep/Read/Python 内联)前创建诊断脚本(v9.30 新增,见 [conventions.md](references/modules/conventions.md) §4.6.1 "文件创建前置检查")。必须先尝试:Grep 定位 → Read 读取上下文 → `python -c "<单行>"` 验证。三者均无法满足时才允许 Write 创建 .py 文件,且必须在 stage5-verify.md 记录创建理由。违反 → 必须删除多余文件。
- ⛔ 禁止用本地缓存文件跑动态生成 JS(v9.31 新增,见 [stage4.md](references/workflow/stage4.md) §5.4.4)。进入方案 1/2 前必须先判定目标 JS 是否动态生成(同一 URL 两次请求 hash 不同 / 含 32 位随机变量名 / 文件大小每次不同 / 响应含 Set-Cookie)。判定为动态生成 → 必须当次请求下载(带 session cookie,依赖前置接口时先调前置接口),禁止用本地旧文件。跳过判定或用旧文件 → P0 违规,加密输出必然错位(变量名/密钥不匹配),无法通过对齐修复。
- ⛔ 禁止 iv8 不设内存限制(v9.31 修订,见 [api-reference.md](references/modules/api-reference.md) "内存限制")。开发期(快速验证/调试/一次性跑通)必须实施第 1 层(`with` 语句 + `ctx.close(gc="low_memory")`);生产期(批量/长跑/不可信 JS/200KB+)必须实施第 2 层(子进程 + Job Object)。开发期用裸 `ctx = iv8.JSContext()` 违反 [conventions.md](references/modules/conventions.md) §4.1.1 强制上下文管理器。

### P1 流程约束(⚠️ 违反 → 记录偏离理由)

- ⚠️ 禁止用 trace 做加密点定位(trace 对纯 JS 加密函数有结构性盲区,用 HAR `_initiator.stack` + 原始代码直读)。
- ⚠️ 禁止把 trace 当作"要补什么"的清单(以 iv8 debug 探测为准,trace value 仅作基准参考)。
- ⚠️ 禁止跳过去壳后验证(去壳后必须检查业务逻辑完整性,不完整触发分层回退纠错)。
- ⚠️ 禁止把 JSVMP/WASM/Webpack/Worker 当壳去处理(它们是保护类型/打包技术,非壳;Worker 是算子物理隔离)。
- ⚠️ 禁止补 iv8 已有的环境(先查 [references/modules/api-reference.md](references/modules/api-reference.md))。

### P2 风格约束(📐 违反 → 影响交付物质量)

- 📐 禁止人工通读几百 MB trace 文件(用 `scripts/trace_analyzer.py`)。
- 📐 禁止把 JSVMP 内部 eval 当壳(JSVMP 解释器内部的 eval 是 VM 组成部分,不是壳)。
- 📐 禁止用"厂商不会这么做"排除场景(经验不能替代规则,任何标签都可能带壳)。

## 任务失败交付物(If/Then,强制)

> **为什么有失败交付物**:实战中 Agent 失败后无标准报告格式,导致失败原因与已确认事实丢失(见 changelog v9.5 极验4 失败案例)。本章节把"失败时必须输出什么"固化为 If/Then。

```
IF 任务标记为失败(任一触发):
   - 阶段四验证不通过
   - iv8 累计失败 8 次(v9.26 修订:同 API 同错误连续 3 次触发回溯,累计 8 次标记失败)
   - 阶段门阻断后无法补齐前置
   - 用户主动终止

THEN 必须在 stage5-verify.md §5.3 输出标准化失败报告(格式固定):

   任务:<任务名称>
   目标:<用户期望,如 "login 接口 200 success">
   状态:失败
   失败原因(1-2 句):<具体技术原因,如 "iv8 社区版 CryptoJS AES-CBC 子类缺失">
   已确认事实(列表,至少 3 项):
      - <如 "算法是 AES-CBC,密钥来自 lot_number 的 MD5">
      - <如 "加密点位已定位(3 个函数已脱壳)">
      - <如 "HAR 真实参数 lot_number/challenge 已提取">
   已排除的可能原因(列表):
      - <如 "排除方案 1 笔误(逐参数比对一致)">
      - <如 "排除脱壳代码遗漏(stage2-output.md 已完整)">
   下一步建议(具体到方案/工具/资源,至少 2 项):
      - <如 "考虑用 iv8 专业版(CryptoJS 模块完整)">
      - <如 "考虑用 Node.js + jsdom 替代 iv8">

禁止:
   - 仅写"任务失败"无具体原因
   - 不记录已确认事实(下游无法复用)
   - 下一步建议笼统(如"换工具"而不指明哪个工具)
```

## 任务完成前产物整理(If/Then,强制)

> **为什么有此规则**:实战中 Agent 通过 gate 5(阶段四交付前检查)后直接交付,但前序阶段产物文件可能残留占位符未填、字段不全、TODO 未清(见用户反馈"需要整理文档补充未写完的")。本章节把"交付前必须整理所有阶段产物"固化为 If/Then 状态机,与"任务失败交付物"对称——失败有失败报告,成功有产物整理。

```
IF stage5-verify.md §4.3 验证结果 = 通过
   AND 准备向用户交付任务结果
THEN 必须执行"产物整理流程"(4 步顺序执行,不允许跳步):

   Step 1: 全产物清单核对(逐一确认下列 4 个文件存在且无占位符)
      - ./<task>/stage1-params.md
        强制字段:参数溯源表 / 透传链路图 / _initiator.stack / 加密参数清单 / WASM 标记 / 环境指纹
      - ./<task>/stage2-output.md
        强制字段:动态 JS 判定 / 加密点位(file+line+col+functionName)/ 变换台账 4 字段非空 / 入口函数 / 环境依赖清单 / 入参个数完整性判定 / 载体清晰度初判(三选一)/ 边界标记
      - ./<task>/stage3-labels.md
        强制字段:载体形态判定结论(六选一)/ 载体清晰度最终判定(三选一)/ 判定依据 / 分支选择(A/B/C/D)/ 分支选择依据 / 特征核对证据
      - ./<task>/stage5-verify.md
        强制字段:方案选择 / 验证方式 / 验证结果 / 参数溯源表 / 最终交付物

      占位符判定(任一命中即视为"未写完",必须回 Step 2 补全):
        - <...> 尖括号占位符(如 <file>:<line>)
        - ____ 填空线
        - ☐ 未勾选复选框
        - "待定位" / "待补充" / "待填写" / "TODO" 字样

   Step 2: 缺失/不完整产物补全
      IF Step 1 任一文件缺失或含占位符
         THEN 必须回到对应阶段补齐(对应关系:stage1→阶段一 §5 / stage2→阶段二 §5 / stage3→阶段三 §5 / stage5→阶段四 §5)
         → 禁止在交付报告中写"待补充"代替补齐
         → 补齐后重跑 `uv run scripts/stage_gate.py --stage 5 --task-dir <path>` 确认仍 PASS(stage5 现已扩展为全产物核对,见 stage_gate.py _STAGE_RULES[5])

   Step 3: 代码与证据产物核对
      - ./<task>/code/<filename>.py 存在且可运行(stage5-verify.md §6.1 记录的路径)
      - IF 方案 2:./<task>/code/ 下的 iv8 调用入口存在
      - ./<task>/evidence/deobfuscated/ 下脱壳代码文件存在(stage2-output.md §1.1 引用的路径)
      - IF 上述任一缺失 → 回阶段四 §5.3(方案 1)或 §5.4(方案 2)补齐代码产物

   Step 4: 输出"任务完成报告"(标准化格式,固定字段)
      任务:<任务名称>
      目标:<用户期望,如"login 接口 200 success">
      状态:成功
      产物清单(逐一列出路径 + 完整性确认):
         - stage1-params.md  ✓ 完整 / ✗ 缺失字段:<具体字段>
         - stage2-output.md  ✓ 完整 / ✗ 缺失字段:<具体字段>
         - stage3-labels.md  ✓ 完整 / ✗ 缺失字段:<具体字段>
         - stage5-verify.md  ✓ 完整 / ✗ 缺失字段:<具体字段>
         - code/<filename>.py  ✓ 存在 / ✗ 缺失
         - evidence/deobfuscated/  ✓ 存在 / ✗ 缺失
      加密参数:<参数名,如 w>
      算法:<如 AES-CBC + RSA>
      方案:<方案 1 Python 重写 / 方案 2 iv8 补环境>
      验证结果:通过(固定值 === / 非固定值结构 + httpx 发包 200 success)
      参数溯源表:已填写(用户数据获取方式见 stage5-verify.md §6.2)

禁止:
   - ⛔ 跳过 Step 1-3 直接交付(违反 → 任务交付无效)
   - ⛔ 在产物文件中保留占位符(<...>/____/☐ 未勾选/"待定位"/"待补充")
   - ⛔ 任务完成报告中写"待补充"而不补全
   - ⛔ 仅交付 stage5-verify.md 不交付前序阶段产物
```

## 版本变更(维护者参考)

版本变更记录见 [changelog.md](changelog.md)(根目录,非按需加载资源,供维护者查阅)。
