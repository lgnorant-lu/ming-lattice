---
name: garlic-reverse
description: Garlic 反编译器专项（C 写的世界最快 APK/Java/DEX 反编译器, jadx 上位替代）。适用于 APK/DEX/JAR/CLASS 反编译、类结构查看、调用图分析, 尤其是大 APK 与混淆目标——速度比 jadx 快数量级。可选 `garlic -m` 启动 MCP 模式(含 DuckDB SQL 分析)。
---

# Garlic Reverse — jadx 的上位替代

来源：device_register_analysis.md 实战验证（Kimi 3.0.6 完整还原），Garlic 对**大 APK/混淆目标**的处理速度远超 jadx；纯 C 实现单二进制无 JVM 依赖。

## 工具形态（两种, CLI 优先）

```bash
# ① CLI 模式（推荐, AI 直接调用不吃力）
garlic app.apk -o output/              # 反编译 APK/DEX/JAR/CLASS → Java 源码
garlic classes.jar -o out/             # 纯 Java 反编译
garlic --help                          # 全参数

# ② MCP 模式（可选, v1.6+）
garlic -m                              # stdio MCP 服务器（反编译/类结构/调用图/DuckDB SQL）
```

前置依赖：Garlic v1.6+ 二进制（GitHub Releases 有 Windows/macOS/Linux）；MCP 模式额外需要 **DuckDB CLI**（`analyze`/`cg_import`/`cg_query` 工具依赖它）。

## 工作流（APK 逆向）

1. **反编译**：`garlic app.apk -o decompiled/` —— 一次产出全部 Java 源码（比 jadx 快数量级）
2. **定位入口**：grep 关键类/接口（如 `device_register`、`EncryptorUtil`）→ 打开对应 `.java`
3. **调用链分析**：类结构 + 调用图（MCP 模式的 `cg_query` 或 CLI 输出交叉引用）
4. **与 smali 交叉验证**：Garlic 对部分混淆控制流存在条件反转/变量类型恢复错误（实测），**精确条件用 smali 校正**——伪代码定位调用关系, smali 确认细节
5. **动态确认**：Frida hook 关键方法（如 `EncryptorUtil.a([BI)[B`），受控输入坐实算法

## 与 jadx 的取舍

| 场景 | 选 Garlic | 选 jadx |
|---|---|---|
| 大 APK / 批量反编译 | ✅ 快数量级 | ❌ 慢 |
| 混淆目标定位 | ✅ 快（但伪代码可能有条件反转） | 兜底 |
| 老牌生态/文档 | 新 | ✅ 成熟 |
| smali 精确性 | 需交叉验证 | 直接可看 |

## 与 Rizin 的搭配

Rizin（radare2 的现代重写）处理 Native 层——命令与 r2 兼容，基座 `radare2` skill 可直接用。组合链路：
`Garlic(Java 层) → Rizin/r2(native .so) → Frida(动态坐实)` —— 对应 device_register_analysis.md 的完整方法论。

## 注意事项

- 只在**授权研究**场景使用（scope 门由基座 ops 契约管理）
- MCP 模式的 DuckDB 分析依赖本地 DuckDB CLI，未装时退 CLI 模式
- Windows 二进制从 GitHub Releases 获取（仓库源码需 CMake/Zig 自行编译）
