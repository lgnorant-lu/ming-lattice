# SSA/IR 反混淆方法论（7 步，可执行）

> 来源：2026-08-18 调研（3 份报告交叉验证）。适用 Web JS + 二进制 + VMP 三类场景。
> 定位：方法论文档（非 skill）——配合 vertical 新资产使用。SSA=Static Single Assignment，IR=Intermediate Representation。

## 核心结论（2026-08 时点）

- **"SSA/IR 无公开 skill，是方法论"结论维持**，但资产密度已足够（8 工具 + 4 论文），值得按本文固化。
- **纠偏**：synchrony 不是 SSA 实现（Babel AST visitor 链）；SSA 路线在 JS 侧的教学实现是 hsk/sccp_js。
- **2025-2026 新进展**：IDA microcode 生态（d810-ng/IDAvator/hrtng）、VMP 去虚拟化（Mergen/VTIL2/vmprotect-research）、Web JSVMP 转向引擎层运行时追踪（XTrace/firefox-reverse，与 SSA 静态路线互补）。
- **权威参照**：google/jsir（MLIR 基 JS 高层 IR，CASCADE 论文：LLM+JSIR 反混淆，2026-08 仍在更新）——SSA/IR 方向的标准答案。

## 7 步流程

### 1. 分诊：先判断要不要上 IR 路线
混淆强度分级：标识符/字符串混淆 → 纯 AST 变换（synchrony/decode-js 的 Babel visitor）足够；含 **CFF/opaque predicate/指令替换/虚拟化** → 才需要 IR + 优化 pass。纯静态能解决的不要引入动态分析。（参照 arXiv 2505.19887：CFF 中等抵抗 LLM、指令替换+组合高抵抗——工具必做、LLM 辅助。）

### 2. 选择 IR 载体（按场景）
- **Web JS**：无现成 JS SSA 工具 → 仿 hsk/sccp_js 管线：Babel 解析 → CFG（支配树/支配边界）→ SSA → SCCP/复制传播/DCE → 反 SSA
- **IDA**：microcode 层（d810-ng 规则 / hrtng / HexRaysDeob），或 **IDAvator 双向桥提升到 LLVM IR** 复用成熟优化器
- **无 IDA**：angr（VEX）/ rz-ghidra（pcode+SSA）/ RetDec BIR
- **VMP**：Mergen/VTIL2 整函数符号执行提升到 LLVM/自定义 IR

### 3. 跑标准优化 pass 链
常量传播+折叠 → 复制传播 → 死代码消除 → 条件分支化简。对"垃圾填充"（不透明谓词、冗余变量）杀伤力最大。

### 4. CFF 还原（SSA 招牌用法）
找 dispatcher 状态变量（入口块常量赋值的变量）→ SSA 定义-使用链追踪全部 use → 恢复真实控制流边。（RPISEC/llvm-deobfuscator 与 HexRaysDeob Unflattener 同款手法）

### 5. opaque predicate 与指令替换
`jcc`/`setcc` 反向切片 → 提升到 SMT（MicroSMT/z3）或抽象解释判恒真/恒假 → patch。指令替换靠模式匹配规则库（d810 的 JSON 规则 + 数学恒等式库）。

### 6. 虚拟化保护（VMP/JSVMP）
定位 VM entry → 提升 handler 到 IR（Mergen 式整函数符号执行 / XTrace 式引擎层 trace）→ **不做 handler 识别**，靠通用优化 pass 化简 → 输出语义等价代码。（vmp2 作者教训：handler 识别脆弱，通用提升才是正解。）

### 7. 等价性验证 + 迭代
还原结果与原始函数符号执行/差分验证（angr/Unicorn/Triton）；d810 式规则按 maturity（PREOPTIMIZED→GLBOPT1）分阶段启停，输出中间态便于调试。

## LLM 辅助边界

- 可辅助：第 1、4 步的 CFG 还原与可读化（arXiv 2604.15390 CoT 结论：CFG 重建 +16%、语义保持 +20.5%）
- 不可替代：指令替换/组合混淆必须工具链（arXiv 2505.19887 失败区间）

## 资产地图（vertical 入库 2026-08-18）

| 层 | 工具 | 形态 |
|---|---|---|
| VMP 去虚拟化 | Mergen（~850★，VMProtect 3.4-3.8/Themida 实测）/ VTIL2（C# 重写 2025 获奖）/ vmprotect-research（Rust 22/22） | 工具 |
| IDA microcode | hrtng（Kaspersky 官方 ~1894★）/ d810-ng / IDAvator（microcode↔LLVM） | 插件 |
| JS 反混淆 | synchrony（~1237★）/ obfuscator-io-deobfuscator / decode-js（已有） | 工具 |
| SSA 教学 | hsk/sccp_js | 代码 |
| JS IR 标准 | google/jsir（660★ MLIR，CASCADE） | 工具 |
| 引擎层 trace | XTrace / firefox-reverse（Web JSVMP，与静态互补） | 工具 |
| 论文 | arXiv 2507.17691（通用 JS 反混淆）/ 2505.19887（LLM vs OLLVM）/ 2604.15390（CoT）/ SoK 去虚拟化 | 文献 |

## 排除项（勿引用）

SledgeHammer / Project X（多次检索零命中，无法验证）；MogVMP/vmp2（已归档，仅方法论教训可摘）；@sresarehumantoo/reaper（能力被覆盖）；SAFE-Deobs（无独立仓库）。
