---
name: rs-js-reverse
description: 瑞数/RS 系风控 JS 逆向专项（412 挑战、r2mKa、$_ts.nsd/cd、basearr 拟合、双跳 cookie 采集、sdenv 环境检测）。适用于瑞数 4/5/6 代、动态 cookie 与请求签名场景。
---

# RS / 瑞数系 JS 逆向专项

来源：吸收自 [js-reverse-715494637](https://github.com/715494637/reverse-skill) 的专项 references（2026-08-18 采集），定位为基座 js-reverse 的**补充专项**——基座对瑞数/RS 覆盖为零，本 skill 填补该空白。

## 适用场景

- 目标站点使用瑞数（Ruishu/RS）4/5/6 代风控
- 出现 412 挑战页 / `$_ts.nsd` / `$_ts.cd` / `r2mKa` / `basearr` 等特征
- 动态 cookie（如 `FSSBBIl1UgzbN7N83T`）与请求签名链路定位

## 执行入口

按需读取 references 对应专项（全部来自实测沉淀）：

| 文件 | 内容 |
|---|---|
| `references/rs-collection-and-two-hop-routing.md` | RS 采集与双跳路由（cookie 收集规则） |
| `references/rs-recovery-anchors.md` | 恢复锚点（定位恢复点的关键位置） |
| `references/rs-runtime-and-basearr-fit.md` | 运行时分析与 basearr 拟合（sdenv 环境匹配） |
| `references/request-chain-recording.md` | 请求链证据化记录规范 |
| `references/anti-patterns.md` | 反模式目录（关键词优先搜索等常见错误） |

## 工作流要点

1. **先确认家族版本**：`$_ts.nsd` 存在 → 4/5 代；`r2mKa`/双跳 cookie → 6 代特征（读 `rs-collection-and-two-hop-routing.md`）
2. **采集双跳 cookie**：第一次请求的响应 cookie → 第二次请求携带 → 按两跳路由规则记录（见 routing 文档）
3. **定位恢复锚点**：用 `rs-recovery-anchors.md` 的锚点清单在混淆代码中找恢复点
4. **运行时拟合**：`basearr` 是环境指纹数组——用 `rs-runtime-and-basearr-fit.md` 的拟合流程对齐环境
5. **验证**：复现请求链路，对照真实请求的 cookie/签名做闭环校验（记录到请求链文件）

## 注意事项

- 本专项只做**授权研究**场景（scope 门由基座 ops 契约管理）
- 若与基座 `js-reverse` 同时存在：RS 特征任务优先走本 skill，其余走基座 js-reverse
