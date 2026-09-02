# Scene delta — CLI / 脚本工具

契约对象：flags、退出码、配置文件、RouteDecision 一类 JSON。

## 差

退出码语义升主版本才许改（0 成功 / 非 0 用法或运行失败的划分一旦发布即冻结）。`--help` 与 schema 同源。DryRun 不得改变契约形状，只改变副作用。
