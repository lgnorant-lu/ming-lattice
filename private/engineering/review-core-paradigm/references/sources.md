# Sources — review-core-paradigm 引用边界与文献索引

## 权威文献与真条目

- **Xuanwo「消融实验」实践**（@xuanwo, 2026-09-02）：实现完成后以「消融实验，去掉不必要的抽象和设计」作触发词的可执行反馈环；「模型需要的不是更多要求和限制，而是可以切实执行的 Feedback Loop」；其公开 AGENTS.md 的 Plan/Code 分级与坏味道清单（含「无实际收益的过度设计」）是该技巧的常载语境；
- **维兰《关于 AI Coding 的一些个人技巧》**（2026-09）：巴菲特测试（skill 必要性）、提问式提示、控制设计、选择性向后兼容、AI Review 人筛环——本包采纳其 review 独立性两难的解法（AI 审、人筛、回喂）；
- **code-simplicity-reviewer 社区原型**（≥4 个独立实现：vgv-wingspan / marcusrbrown/systematic / lavra / whetstone）：「实现完成后最终简化 pass」agent 的收敛形态；whetstone 变体确立 report-first（只产报告不改码）；ia-code-simplicity-reviewer 的 over-production traps 分类法（While-I'm-here 等命名失败模式）；
- **Generator-Critic / Implementor-Verifier 模式与 fresh-context review 实践**（tanhdev / MindStudio / fullsend / hve-core）：评审者只拿 diff+spec 不拿生成上下文；「生成收敛、评审发散」定性框架；P0-P2 分级 + 人聚焦高严重度的门控形态。

## 实证来源（成因研究）

- **arXiv 2605.13280**：LLM 代码有独特可读性缺陷模式——不必要的复杂结构、冗余注释是系统性产出特征；
- **ODIN（ICML'24）+ Verbosity Compensation（arXiv 2411.07858）**：RLHF 长度 reward hacking；不确定时冗长化（GPT-4 VC 频率 50.4%，冗余是信心反指标）——冗余偏差的训练成因；
- **arXiv 2605.24050 / 2601.04748**：skill 库膨胀的 shadowing（202 库 -21% pass）与选择相变——本包自身立项经必要性三问（ming-skill-forge §7.1）的证据基础；
- **arXiv 2608.11386**：工具架构改变 agent 行为；纯文本认知脚手架效应有限——对「思考方式类 skill」的弱反证，本包故选程序封装而非观念说教。

## 本仓实证

- 2026-09 hooks 引擎化过程中的两轮「审计推敲」即本程序的 instinct 版：matcher `?` 语义、`gate.X.globs` 空承诺键、whitespace 空文件守卫等缺陷均产自「摘下看是否成立」式复查；
- blog-tui 第二采纳者实装中 gates.local/available() 的设计被实证保留（真实调用方），L2 plan-artifact 被消融掉（无消费方）。

## 明确不纳入

- PR 流水线/CI 门禁实现本身（属工程面工具，本仓见 scripts/hooks 与 docs/GIT_HOOKS.md）；
- 文档体系评审（docs-core-paradigm 域）与测试用例设计（testing 域）的分流规则——正文 description 负触发已声明；
- 通用工作态度/勤奋/并行纪律——使用者修养非程序知识，不过 ming-skill-forge §7.1 必要性三问。
