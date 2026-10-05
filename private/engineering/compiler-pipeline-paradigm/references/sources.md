# sources — compiler-pipeline-paradigm 理论溯源

## 已纳入参照

| 参照 | 萃取点 | 出处 |
|---|---|---|
| Premature Abstraction 频道编译器系列 Part 1–9 | 九段划分与每段输入/输出/失败模式骨架——§2 九段契约表的直接来源 | YouTube @prematureabstraction（Part 1 自举/Part 2 lexer/Part 3 parsing/Part 4 semantic/Part 5 AST-opt/Part 6 IR-SSA/Part 7 IR-opt/Part 8 codegen-寄存器分配/Part 9 link-load） |
| 同上 Part 8《Handling Infinite Variables in a Compiler》 | 图着色 NP-Complete vs JIT 线性扫描 = 质量vs编译延迟原型；栈机把分配推迟到 JIT 层——§3.1/§3.2 的取舍公理 | YouTube @prematureabstraction |
| 同上 Part 7《Compiler Optimizations》 | LICM/强度削弱/向量化次序 + 别名分析作为前置供给 pass——§4 次序纪律 | 同上 |
| 同上 Part 9《Who calls main()》 | ELF 段表/重定位/PLT-GOT 延迟绑定/CRT 初始化——§2 第 9 段不变量 | 同上 |
| Sandi Metz《The Wrong Abstraction》 | 重复<错误抽象；错误抽象的撤回成本——arch §4.5 抽象时机判据 | Sandi Metz 博文 2016 |
| Kent C. Dodds "AHA Programming" | Avoid Hasty Abstractions——arch §4.5 同源补充 | Kent C. Dodds GitNation talk |
| LLVM 三段架构（front/mid/back decoupling） | 段间 IR 单一来源 = 可替换性根基——§5 禁令 1 的业界原型 | LLVM 官方文档 |
| System V AMD64 ABI | caller/callee-saved 分工、16B 栈对齐、Red Zone——contract §3.5 ABI 契约表 | SysV ABI 规范 |

## 仓内消费点映射（收敛证据）

| 消费点 | 对应段 | 判例意义 |
|---|---|---|
| IV8 `tools/idl/`（parse→merge→validate→unified_ir） | 段 2→3→5 | IR 化的输入校验闭合 |
| IV8 `iv8-surface-codegen`（unified_ir→generated/ 99 件） | 段 5→7 | IR→emit 的 golden 门=段间契约测试 |
| IV8 seam-ledger（generated/handwritten 分类） | 段 7 产物审计 | 发射产物的可追溯锚点 |
| ming-boundary（source→facts JSONL） | 段 1→2 抽取面 | 事实流即 token→AST 的灰度版本 |
| build-router-manifest（registry→投影） | 段 5→6 | 投影=IR 化 + 优化（孤儿键检出=SCCP 同型） |
| 门禁 leak-scan 历史扫（blob→命中） | 段 1 变体 | 词法扫描的流水线化（rev-list→batch→规则匹配） |

## 明确不纳入

- **具体语法定义**（EBNF/正则表）——归各语言的实现文档，非本层元规则
- **指令集手册级细节**（x86 encoding、ARM neon 排布）——太深，超元规则粒度
- **解释器运行时**（GC/对象模型/堆布局）——九段到链接器为止，运行时归另一个包
- **形式化验证**（sema 的证明论视角）——超出"工程取舍"定位
