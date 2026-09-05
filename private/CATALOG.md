# 私有技能全景目录 (Private Skills Catalog)

本目录记录 `private/` 下由团队自研与深度定制的所有技能包。为开发者和 Agent 提供清晰、结构化的软约束导引。

---

## 1. 结构化目录索引

```
private/
├── CATALOG.md                         # 本导引目录
├── ming-skills-router/                # 全局无副作用领域分流与配方装配总控中枢
│
├── engineering/                       # 软件工程质量属性与元规范总族
│   ├── README.md                      # 工程总族导引与 Universal Compose 公式
│   ├── testing/                       # 测试规范子族 (11 包四层解耦模型)
│   ├── docs-core-paradigm/            # A列: 跨场景文档元规则 (Diataxis + ADR)
│   ├── docs-presentation-idiom/       # A列: GitHub 文档视觉排版与去疲劳范式
│   ├── obs-core-paradigm/             # A列: 跨场景可观测元规则 (宽事件 + 脱敏)
│   ├── sec-core-paradigm/             # A列: 跨场景安全元规则 (运行时 + AST10)
│   ├── contract-core-paradigm/        # A列: 跨场景数据契约元规则 (演进五条)
│   └── overlay-core-paradigm/         # B列: 质量属性横切不变量单包
│
├── ui-design-paradigms/               # 全局 UI/UX 设计范式与 Design Tokens
├── ui-oracle-protocol/                # UI 控件自动化作为协议逆向 Oracle (timestamper)
├── xfqtrace-kit/                      # xfqtrace 无痕 hook 与 30+ 站点逆向 Recipe
└── blog-content/                      # 博客与技术内容生成管道
```

---

## 2. 软约束规范 (Authoring Guidelines)

1. **原子叶子原则 (Atomic Leaf Skill)**：
   - 每一个可调用的 Skill 必须是一个**包含 `SKILL.md` 的叶子目录**；
   - `SKILL.md` 中的 `name:` 必须**严格等于叶子目录名**；
   - 分组目录（如 `engineering/`、`testing/`）仅供组织与导引使用，不承载 `SKILL.md`。
2. **扁平化部署 (Flat Harness Deployment)**：
   - 无论 `private/` 内部如何嵌套，`scripts/sync.ps1` 始终将叶子技能扁平软链到 `C:\Users\<user>\.cc-switch\skills\<name>`。
3. **单一事实源对齐**：
   - 所有在 `private/` 下新建或移动的技能，必须同步在 [`registry.yaml`](../registry.yaml) 中登记其相对路径。
