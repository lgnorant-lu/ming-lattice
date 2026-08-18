---
name: roco-sandbox-engine
description: 对战沙盒逻辑模拟器的实现指南。包含 Rust 核心、Python 强化学习外壳、60位掩码语义、17步严格时序仲裁以及协议级数据还原的权威规格说明。
---

# Roco Sandbox Engine

## 概述
本技能旨在指导开发者实现高度置信的《洛克王国世界》对战沙盒模拟器。它摒弃了 UE4 表现层的噪音，专注于 100% 还原后端的数值结算、状态掩码运算以及指令流时序。

## 核心能力 (Core Capabilities)

### 1. 数值核心 (Numerical Core)
沙盒必须在初始化 Pet 实例时强制执行 `CalcBasicProperty` 公式。
- **PVP 强制基准**: 等级 60, 天赋 31, 突破 5 星, 性格正向属性 1.2x 修正。
- **公式参考**: 详见 [LOGIC_ATLAS.md](references/LOGIC_ATLAS.md) 第 1 节。

### 2. 状态掩码引擎 (Bitmask & Status)
模拟器底层必须维护一个 64 位的 **RefCount 数组**（物理上映射为 2 个 uint32），管理 60 个逻辑标记位。
- **核心 Bit 位**: 12-封印, 16-禁换宠, 22-无敌, 40-打断, 48-施法中。
- **引用计数逻辑**: 只有当某个状态位的 count 降至 0 时，该限制才正式解除。

### 3. 17 步严格时序仲裁 (Arbitration Engine)
生成的 `PerformNotify` 协议流必须严格遵守客户端预处理时序。
- **关键序位**: 换宠 → 应对(Counter) → 连击 → 共鸣 → 伤害 → 死亡。
- **机制**: 采用 `BattleAsyncChain` 模型，支持递归插入“应对技”节点。

### 4. 数据接口与协议 (Data & Protocol)
- **输入**: 解析 `ZONE_BATTLE_CMD_PUSHBACK_REQ` 堆栈，支持 `POPBACK` 撤回。
- **输出**: 序列化为 `PerformNotify` 簇（Cluster -> Group -> Node）。

## 使用指南

- **开发 Rust 内核时**: 参考 `LOGIC_ATLAS.md` 中的指令。
- **实现 AI 训练外壳时**: 使用 Python Gym 接口包装内核的 `step()` 函数。
- **处理复杂 Effect 时**: 查阅 [EFFECT_DICTIONARY.md](references/EFFECT_DICTIONARY.md) 中的 Order ID 映射。

## 参考资产

- [LOGIC_ATLAS.md](references/LOGIC_ATLAS.md): 整合公式、常数与 17 步时序表。
- [EFFECT_DICTIONARY.md](references/EFFECT_DICTIONARY.md): 补全后的 70+ Effect 与 100+ BuffBase 指令语义。
