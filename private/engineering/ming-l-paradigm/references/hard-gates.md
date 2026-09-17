# Hard Gates — Ming-L 硬门控部署形态清单

软门控（文档）只是第一形态。本清单枚举域规范可部署的**机械化形态**，按动词归属组织。
原则：**每条规则先问"它的守形态是什么"**——无守形态的规则是 convention 级，效力阶梯 0 级，承认即可不必羞愧。

## 已实现（本包 scripts/）

| 形态 | 动词 | 物 |
|---|---|---|
| 域体检器 | 省+守 | `scripts/audit-domains.mjs`——orphan/landed/矩阵/双真相/frozen/proposed 六查 |

## 文档级硬形态（项目侧部署，不实现只规范）

| 形态 | 动词 | 部署面 | 先例 |
|---|---|---|---|
| **域 frontmatter 约定** | 用 | 所有域文档带 `domain:` 归属标签——机器可读的"规则住在哪" | OWNERS 元数据 |
| **git pre-commit 钩子** | 守 | `audit-domains.mjs --staged` 挂暂存区——frozen 拦截、词表校验随提交触发 | 本仓库 .githooks |
| **CI 作业** | 守+省 | 全量 audit 周期跑（proposed 计龄、矩阵空格巡检） | repolinter-action（exit-code/issue 双输出模式） |
| **CODEOWNERS** | 守 | Gov 域机器化管辖——域目录 x approver 映射 | K8s/Chromium OWNERS |
| **branch protection** | 守 | required checks——合并门禁阶梯 | Allstar branch-protection policy |
| **issue/PR 模板** | 用 | 写路径形态化——ADR 提案、候审档条目的入口格式 | GitHub issue forms |
| **组织级策略** | 守（继承域） | 组织级 .allstar/ 仓策略下发子项目——域跨项目继承的机器形态 | OpenSSF Allstar（org/repo/policy 三级=作用域代数活例） |
| **脚手架生成器** | 立 | 模板实例化域骨架（assets/templates/，待建） | copier（模板可重放升级）、projen（配置即代码） |

## 形态选择的判定

```
规则能被机器表达吗？
  能 → 问：漏检代价多大？
    大 → 越深的拦截阶段越好（hooks < CI < runtime < structural）
    小 → warn 级即可，先收集违例率再谈晋升
  不能 → convention 级（0），写明承认
```

**效力阶梯部署纪律**（§6.1 机械化版）：新守形态默认从 warn 上线——零违例期数据够了才升 error。直接上 error 的门禁会因误报被绕过，反而比 warn 更弱。
