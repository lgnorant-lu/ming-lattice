---
name: jsc-deobfuscator
description: 对 View8 反编译并序列化的 JSCeal/V8 伪代码做静态反混淆与函数命名。适用于匹配的 javascript-obfuscator 模式；不直接接受原始 .jsc，不输出可运行 JavaScript，不用于普通 JS 源码反混淆。
compatibility: Python 3.10+、本包 requirements.txt 依赖及匹配目标 V8 版本的反汇编器；上游 View8 产物必须由受控流程本地生成。AI 命名另需经允许的模型后端。
---

# JSC Deobfuscator

本地契约依据：[README](README.md) 和 [deobf_all.py](deobf_all.py)。来源为 hasherezade/jsc_deobfuscator，版本以部署包实际内容为准，不以一次采集日期推断兼容性。

## 输入与边界

- 原始 `.jsc` 需先确认压缩形式与 V8 版本，经匹配的反汇编器和 View8 生成序列化产物。本工具不替代这两个阶段。
- `deobf_all.py` 输入是 View8 序列化文件，输出是静态分析伪代码和可选序列化结果，不是可直接交给 Node.js 或 iv8 执行的 JS。
- View8 序列化使用 pickle。不得加载来源不明的 `.pkl`；静态分析工具处理恶意序列化输入仍可能执行代码。只用受控环境中本地生成且未被替换的产物。
- 用户只要求审阅时不运行样本、不安装依赖、不调用外部模型。缺工具、版本不匹配或输入来源不明时停止并报告缺口。

## 工作流

1. 从宿主技能位置解析本包根目录，确认 [README](README.md) 中的依赖与目标版本。不要猜本机路径或把整个目录默认当作可执行权限。
2. 保留输入来源、样本摘要、V8/反汇编器/View8 版本及生成命令；不同样本不共用 decoder 缓存。
3. 在允许的隔离输出目录运行静态转换。以下 `SKILL_ROOT` 和 `CASE_ROOT` 由宿主解析，路径均需引用：

```bash
python "$SKILL_ROOT/deobf_all.py" --inp "$CASE_ROOT/decompiled/app.dec.pkl" --out "$CASE_ROOT/deobfuscated/app.deobf.txt" --export_format decompiled serialized
```

4. 对照转换前后的函数、常量、控制流和未处理模式，验证重要结论。输出存在或更易读不等于语义已被证明，也不能仅凭退出码判定成功。
5. AI 命名是可选独立阶段。先按本包 README 确认参数、模型及数据发送范围；模型命名只是待验证假设，不是证据。

## 交付与失败

交付输入来源与工具版本、实际命令、输出路径、关键变换的证据、残留模式和未验证结论。依赖失败、输入不兼容、部分转换分别标明，不自动更新工具或转为执行样本。
