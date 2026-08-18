---
name: jsc-deobfuscator
description: V8 字节码静态反混淆（bytenode/electron 保护对抗, hasherezade 出品）。适用于 .jsc 编译产物、javascript-obfuscator 保护的 V8 字节码的静态还原与 AI 辅助分析。
---

# JSC Deobfuscator — V8 字节码反混淆

来源：hasherezade/jsc_deobfuscator（2026-08-04 更新），针对 **javascript-obfuscator 保护的编译 V8 字节码**（.jsc 文件，bytenode/Electron 场景）的静态还原。

## 工具形态（Python 脚本, CLI 直接调用）

```bash
# 全自动反混淆（推荐起点）
python deobf_all.py <input.jsc> [输出目录]

# AI 辅助模式（分步, 可控）
python deobf_ai.py <input.jsc>          # 分阶段执行, 适合配合 AI 分析中间态

# 辅助脚本（按需）
deobf_commons.py          # 公共库
deobf_globals.py          # 全局变量处理
deobf_scope2.py           # 作用域处理
deobf_inline_temporaries.py / deobf_replace_ops.py  # 临时变量内联/算子替换
```

## 工作流

1. **确认形态**：目标是 `.jsc`（V8 序列化字节码）→ 本工具；目标是原始 JS 混淆 → 走 AST 路线（js-deobfuscator/decode-js 参考, xbs-ast-deobfuscation 已部署）
2. **反混淆**：`deobf_all.py` 全自动跑一遍, 检查输出可读性
3. **不理想 → AI 辅助**：`deobf_ai.py` 分步执行, 每步中间态交给 AI 分析（配合基座 js-reverse 的定位方法论）
4. **验证**：反混淆输出与真实运行行为对照（iv8 环境跑一遍比对）

## 与 iv8/View8 的配合

| 工具 | 层 | 场景 |
|---|---|---|
| **jsc_deobfuscator** | 静态还原 | javascript-obfuscator 保护的 .jsc |
| **view8** | 静态反编译 | 任意 V8 序列化字节码 → 可读代码（需 patched V8 二进制） |
| **iv8** | 动态运行 | 补环境跑目标 JS（验证/复现） |

## 注意事项

- 只处理**已授权**研究目标（scope 门由基座 ops 契约管理）
- Python 3.x, 无额外依赖（纯标准库脚本）
- 仅静态分析, 不执行目标代码
