# Sources — ming-skill-forge 引用边界与文献索引

## 权威文献与真条目

- **Anthropic Agent Skills 正典**:
  - *Equipping agents for the real world with Agent Skills*（anthropic.com/engineering, 2025）——渐进披露三级模型的官方阐述；
  - `anthropics/skills` 仓库 `skills/skill-creator/SKILL.md`——创作规程正典：description 触发面工艺、"explain why 而非堆 MUST"、<500 行预算、"信息只住一处"；
  - SKILL.md Format Specification（DeepWiki 整理）——frontmatter 字段契约：name 须 kebab-case 且与目录同名、description 为必填触发面、compatibility 可选。
- **本仓基础设施（硬门控依据）**:
  - `scripts/lint.ps1`——仓库级检查清单（SKILL.md 存在性/frontmatter 缺字段/引用文件存在/硬编码路径/空壳）；
  - `scripts/build-router-manifest.mjs`——DOMAIN_DEFS 策展表：域 skills 列表、triggers、qualityGateTriggers、negatives、skillTriggers、RECIPES；`--check` 验证 manifest 新鲜度；
  - `docs/STANDARDS.md`——提交规范（Conventional Commits + 禁 emoji 铁律）与测试门禁；
  - `docs/SCREENING.md`——vendored 仓库审阅报告（hello-js-reverse = 深技能范本：1360 行正文+9500 行 references；ai-reverse-toolkit = 紧凑范本）。
- **相邻范式**:
  - `private/engineering/ming-l-paradigm`——域判定表（新内容先进哪个域）与候审档机制；
  - `testing/testing-core-oracle`——eval 化验证的 oracle 独立律。

## 实证来源

- DenoiseStudio 设计会话（2026-02）中 ming-l-paradigm 的建包全流程：注册→README→lint→路由接线遗漏被发现→补 DOMAIN_DEFS——"接线三处同批"条款来自此实证；
- lint 输出中 description 绑工具名的 W 级告警（js-reverse 案例）→ 禁令②的来源；
- registry 手工编辑丢中文换行事故（hello-js-reverse 幽灵条目）→"registry 编辑用 python"纪律。

## 必要性判据来源（§7 三问 / 禁令⑧）

- **Anthropic skill-creator 正典**："Default assumption: Claude is already very smart. Only add context Claude doesn't already have"——先验稀缺性的官方表述；
- **arXiv 2605.24050**《More Skills, Worse Agents?》：skill 库扩至 202 时 pass rate 降 ~21%；分解归因显示 **skill shadowing（误选）是主瓶颈，上下文开销效应≈0**——语义撞车判据的直接实证；
- **arXiv 2601.04748**：skill 选择存在相变，库规模过临界点后准确率陡降，相似 skill 间语义混淆是主因，分层路由可缓解——本仓 DOMAIN_DEFS/router 架构方向的旁证；
- **维兰《关于 AI Coding 的一些个人技巧》**（2026-09）："只有模型和巴菲特都不知道的知识才用 Skill"——先验稀缺性的通俗表述（巴菲特测试）。

## 明确不纳入正文

- 技能 marketplace/分发机制（本仓为私有集散，sync.ps1 部署属运维面不进创作规范）；
- SKILL.md 内嵌可执行代码块的讨论（本仓脚本一律落 scripts/ 独立文件）；
- 通用 prompt 工程技巧（属宿主提示词层，非技能包规范）。
