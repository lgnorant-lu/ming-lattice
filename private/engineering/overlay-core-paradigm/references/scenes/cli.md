# Scene delta — CLI / 脚本工具

只写 Overlay 差。测试退出码见 testing-scenario-cli。

## 性能

禁为测格式化算法反复拉起子进程。锁冷启动分配；禁止热路径同步枚举整个家目录。

## 韧性

先写临时文件再原子改名。中断或非 0 退出后目标路径无半成品。`sync -DryRun` 文件系统差分为空。

## 隐私

argv 事件不得包含密钥 flag 的值。

## 成本 / 兼容

同一 `node` 核心；`test.ps1` 与 `test.sh` 只透传。不提供 Cmd。
