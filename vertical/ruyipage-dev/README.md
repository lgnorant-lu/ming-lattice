# ruyipage-dev

> 本仓库已停止维护。
>
> 如意本人已经提供官方 skill，建议后续直接使用：
> <https://github.com/LoseNine/ruyipage-skill?tab=readme-ov-file>

RuyiPage Python 自动化开发 skill，面向 Codex / Claude Code 这类 AI coding agents，聚焦 Firefox 路线、WebDriver BiDi、已有浏览器接管、网络拦截、user context、多账号隔离和高风控场景调试。

感谢[如意大佬](https://github.com/LoseNine)的开源分享，也感谢 [RuyiPage 项目](https://github.com/LoseNine/ruyipage) 对 Firefox 自动化、BiDi 能力和高风控场景实践的持续投入。

## Maintenance Status

这个仓库保留为历史参考，不再继续更新、补充或跟进 RuyiPage 的最新能力。

如果你正在寻找可继续维护的版本，请优先使用如意本人编写的官方 skill：

- 官方 skill：<https://github.com/LoseNine/ruyipage-skill?tab=readme-ov-file>
- RuyiPage 项目仓库：<https://github.com/LoseNine/ruyipage>

## Installation

### Local Skill Installation

这个 skill 已安装在本机 Codex skills 目录：

```bash
~/.codex/skills/ruyipage-dev
```

如果要在另一台机器上使用，可以复制整个目录到：

```bash
${CODEX_HOME:-$HOME/.codex}/skills/ruyipage-dev
```

### Included References

这个 skill 已内置本地参考资料，不需要额外联网即可使用：

```bash
references/project-readme.md   # 项目 README 本地副本
references/index.md            # 参考资料索引
references/docs/               # 清理后的 RuyiPage 文档
```

## Quick Start

在 agent prompt 里直接这样用：

```text
Use $ruyipage-dev to implement a RuyiPage login flow in Python.
Use $ruyipage-dev to debug FirefoxPage attach and cookie persistence.
Use $ruyipage-dev to refactor a RuyiPage script for network interception.
```

## What This Skill Covers

### Core Workflow

```text
1. 明确是新启动浏览器、接管已有浏览器，还是多账号隔离场景
2. 优先读取 project README 和 getting-started 文档
3. 选择 FirefoxPage / FirefoxOptions / launch / attach 模式
4. 基于页面、元素、上下文、网络四层能力实现脚本
5. 优先复用 examples 中已有模式
```

### Main Topics

```text
FirefoxPage / FirefoxOptions / launch
已有 Firefox 或指纹浏览器接管
页面对象、导航、等待、定位、表单、动作链
iframe / Shadow DOM / isTrusted / 复杂边界
Cookies / 标签页 / 窗口 / Browser 模块 / User Context
下载 / 截图 / PDF / Console / Script / Preload Script
网络能力 / 请求拦截 / 网络事件 / 导航事件 / Data Collector
高风控场景 / BiDi 对照 / 示例中心
```

## Directory Structure

```text
ruyipage-dev/
├── README.md
├── SKILL.md
├── agents/
│   └── openai.yaml
└── references/
    ├── index.md
    ├── project-readme.md
    └── docs/
        ├── getting-started/
        ├── page-and-elements/
        ├── browser-and-context/
        ├── network/
        └── examples/
```

## Reference Sources

- 文档站引用：<https://0xshoulderlab.site/automation>
- 项目仓库引用：<https://github.com/LoseNine/ruyipage>

## Recommended Reading Order

```text
1. references/project-readme.md
2. references/index.md
3. references/docs/getting-started/RuyiPage 文档首页.md
4. references/docs/getting-started/框架概览.md
5. references/docs/getting-started/安装.md
6. references/docs/getting-started/快速上手.md
7. 再按任务读取 page-and-elements / browser-and-context / network / examples
```

## Search Recipes

```bash
rg -n -S "等待|元素|拦截|高风控|接管" references/docs
rg -n -i "firefoxpage|launch|cookie|download|context" references/docs
rg -n -i "attach|user_dir|fingerprint|bidi|firefox" references/project-readme.md
```

## Notes

- `references/project-readme.md` 基于项目 README 整理。
- `references/docs/` 基于文档站抓取结果整理，只保留 RuyiPage 相关内容。
- `SKILL.md` 是给 AI agent 执行任务时加载的正式工作流说明。
- 这个 `README.md` 是给人看的入口文档，用来解释 skill 的范围、来源和资料结构。
