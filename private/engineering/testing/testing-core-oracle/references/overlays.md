# 质量属性横切不变量与安全供应链附录 (Quality Overlays & Security Matrix)

本文档是 `testing-core-oracle` 的横切不变量附录。规则描述预期约束，不代表某仓库已通过验证。

---

## 1. 安全供应链引用边界

官方编号以 [OWASP Agentic Skills Top 10](https://owasp.org/www-project-agentic-skills-top-10/top10) 为准，本库映射只在 `sec-core-paradigm` 维护，通过宿主技能索引解析，不依赖安装目录布局。本附录不再复制编号表。

评估来源、权限、隔离、更新与治理时，分别提供证据。Pin 不证明内容可信；纯决策函数不证明执行器隔离；名为 DryRun 的选项不证明无网络或写盘；返回禁止清单也不等于宿主真正拒绝了操作。

---

## 2. B 级横切不变量简明契约 (Quality Overlays)

### 2.1 性能不变量 (Performance Overlay)
- **[禁止]** 功能测试中断言墙钟绝对耗时（如 `assert elapsed < 5ms`）；
- **[规范]** `Decide()` 保持纯内存计算。用规模矩阵和操作次数检查增长趋势，独立基准记录环境、输入规模、基线和方差；不设置通用的单次 5ms 功能断言，也不把有限样本当作复杂度证明。

### 2.2 隐私不变量 (Privacy Overlay)
- **[禁止]** 将用户 Prompt 原文完整记录进 Git 提交日志或公开测试用例；
- **[规范]** 只记录必要的分类和相关 ID；哈希不等于匿名化，提取的 tokens 仍可能含凭据或个人信息。公开回归优先使用合成或已脱敏用例。

### 2.3 可靠性与韧性 (Reliability Overlay)
- **[禁止]** 遇到畸形输入、空字符串或未定义包名时抛出未捕获异常或崩溃退出；
- **[规范]** 在声明的输入类型内安全失败；无匹配与配置损坏需有不同原因。不得把配置加载失败伪装成正常无匹配或成功。

### 2.4 上下文与成本经济性 (Context Cost Overlay)
- **[禁止]** 默认将 11 个技能包的全文无脑注入会话上下文；
- **[规范]** 机读名单与实际加载分开。按任务和正文预算加载；审阅引用不激活执行司机，不以固定四包掩盖跨语言或跨场景需求。

### 2.5 跨端兼容性 (Portability Overlay)
- **[禁止]** 引入 Windows Cmd (`.cmd` / `.bat`) 脚本与专有 GBK 编码；
- **[规范]** 纯 Node.js 大脑 + PowerShell (`.ps1`) 与 POSIX Shell (`.sh`) 双外壳，统一 UTF-8 without BOM。
