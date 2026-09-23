---
name: xfqtrace-kit
description: Android Native 层 Trace 工具包（xfinject 注入链路 + xfqtrace 引擎 + 无痕 hook backend）。适用于 Android App 协议逆向中的 native 层调用追踪、加密参数生成链路定位、so 层函数插桩、反检测对抗研究。注意：仅限授权研究目标。
---

# xfqtrace-kit v2.2

Android Native 层 Trace 工具包（xfinject 注入链路 + xfqtrace 引擎 + 无痕 hook backend）。

> **工具本体不入仓**：本目录仅 skill 入口文档。kit 载荷（bin/docs/examples/helpers）
> 经公开 pip 包 `xfqtrace-skills` 获取或本地工具目录外置持有，不随仓库分发。

## 版本与更新

- 当前：**v2.2**（2026-08 发布）
- v2.2 变更：初步 bypass 部分检测；新增无痕 hook backend(3) + `xfqtrace-hide.kpm`（规避 hook/trace 检测；隐藏 xfQTrace/xfinject 相关 VMA、payload、stage、helper 映射；shadow-page/xfqhide shadow inline hook；降低 /proc/pid/maps、inline patch、trace payload 暴露）
- [警告] **正常推荐 2.1**：2.2 测试时间不足，可能还有 bug 待发现（4 系内核 shadow-page 方案可用）

## 安装与更新

```bash
pipx install xfqtrace-skills   # 第一次（含 Codex/Claude skill）
xfq update -y                  # 更新 xfq
xfq version                    # 确认 0.1.7（cli: 0.1.7 / active kit: 2.2 / latest: 2.2）
xfq init ./xfqtrace-kit-2.2.zip -p <密码> --force   # 导入 kit
xfq skill install --target both                     # 刷 skill 到 Codex/Claude
xfq doctor --serial <serial>   # 环境检查
```

kit 压缩包为双密码 AES 加密（需 7z 解压，unzip 不支持）——密码随 kit 分发渠道获取，不入仓。

## 目录结构（kit 载荷，本地外置）

```
bin/        libxfqtrace.so、xfinjectd、xfqtrace-hide.kpm、7z/lz4/pidcat
docs/       USAGE.md（完整指南：快速使用 / DSL / 排查）
examples/   各应用 recipe 目录
helpers/    bypass_*.js、xfinject_backend.py 等辅助脚本
```

## 快速使用

```bash
python 全自动化trace.py -p <package> --inject-backend xfinject   # spawn 模式（推荐）
python 全自动化trace.py -p <package> --attach --inject-backend frida-server  # attach 只适合 frida-server
python 全自动化trace.py -p <package> --clear-only                # 清日志
```

详细见 kit 内 `docs/USAGE.md`。

## Gadget 注入配合（xfqtrace 做 trace）

- 开源 gadget：`rusda`（vertical/rusda，魔改 server/gadget）+ `inject_frida_gadget.py` 辅助脚本
- 连接：`frida -H 127.0.0.1:14725 -n Gadget -l examples/<pkg>/gadget_trace.js`

## 工作流定位（与生态配合）

1. **静态定位**：apk-reverse / garlic-reverse 定位 native 签名入口（如 libttboringssl 的 JNI 导出）
2. **动态 trace**：本 kit 注入 xfinject → xfqtrace 采集 so 层调用链/参数
3. **协议侧验证**：ui-oracle-protocol（UI 操作→请求映射）或 mitmproxy 抓包对拍 trace 结论
4. **反检测对抗**：2.2 的 hide backend 用于对抗检测研究（仅授权目标）

## 注意事项

- 仅授权研究目标使用（scope 门禁见 reverse-skill-router 的 case-init）
- 2.2 的 hide backend 用于对抗检测研究，遵守目标平台条款
