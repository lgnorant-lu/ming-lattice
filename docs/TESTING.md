# 测试与验证

需要 Node.js 22+。完整套件还需要 PowerShell 7 和 Git；不下载依赖，不连接真实上游，不部署到个人客户端。

```bash
node tests/run.mjs --require-all
```

也可通过 `pwsh scripts/test.ps1 --require-all` 或 `sh scripts/test.sh --require-all` 透传。省略 `--require-all` 时，缺少工具的套件单列为 skipped，不计入 passed；严格模式下任何跳过也使退出码非零。

## 验证范围

| 套件 | 判定来源与检查 |
|---|---|
| Hook 单测 | 提交格式的合法/非法输入 |
| Manifest 单测 | 合成 registry 与入口；启用、停用、缺失、身份错误、重复及路径越界；默认无写盘，显式写入仅临时根 |
| 路由黄金 | 典型任务的分类与候选回归，不单独代表配方质量 |
| 路由安全回归 | 只读模式、多包名、否定和引用、词边界、实际配方、可用性、未知契约安全退回 |
| 适配器契约 | 模式映射、候选与正文分离；分类永不授予 case-init 权限 |
| YAML/registry | 标量、列表和真实 registry 可解析；隔离集成另验证重复键及部署结构 |
| CLI 隔离集成 | 临时仓库中真实部署内容、DryRun 状态不变、无效配置拒绝、包装重建不覆盖正文 |
| Hook 暂存区集成 | 临时 Git 仓库的 staged/unstaged 分离、工作文件已删、Unicode 和空格路径；不提交 |
| Manifest 新鲜度 | `--check` 比较两份清单，忽略生成时间；只读，不自动修复 |

测试定义在 [tests/run.mjs](../tests/run.mjs)，计数以运行结果为准。测试使用临时目录并在 finally 清理；可用 `SKILLS_TEST_TMPDIR` 指定已存在的测试临时父目录。

## 内容与部署检查

```powershell
pwsh -NoProfile -File scripts/lint.ps1
pwsh -NoProfile -File scripts/lint.ps1 -Json
pwsh -NoProfile -File scripts/sync.ps1 -DryRun -Module rust-reverse
```

lint 对启用的部署单元要求入口及身份有效，参考仓库不按完整部署包验收。`-Json` 始终输出数组且错误退出码与文本模式一致。相对引用检查仍是启发式，不能证明全部运行时依赖齐全。

`update.ps1 -DryRun` 仅预览，连同 `-Force` 也不 fetch/ls-remote、不写 registry；未检查的来源显示 `NOT_CHECKED`，不是“最新”。真实更新检查需用户另行允许。

## 刷新清单

```bash
node scripts/build-router-manifest.mjs
node scripts/build-router-manifest.mjs --check
```

前者是显式写操作，后者只检查。测试不会自动重写两份真实 manifest。每个文件采用临时文件后改名；两份清单不是跨文件事务，中断后用 `--check` 发现不一致并重新生成。

## 门禁与限制

已安装的 pre-commit 对暂存 blob 扫描，再执行严格测试模式。测试读取工作树，因此部分暂存不等于对完整待提交树进行了隔离验证，提交前仍需审阅 staged/unstaged 差异。

通过这些测试不代表所有 Skill 内容正确、真实客户端遵循限制或所有 OS 已通过。当前没有完整 JSON Schema 验证器、跨客户端效果评估、实际浏览器 E2E、规模基准或自动变异活动；不要用 passed 比例代替这些证据。

方法论入口：[testing-core-oracle](../private/engineering/testing/testing-core-oracle/SKILL.md)；只读流程：[review.md](../private/engineering/testing/testing-core-oracle/references/review.md)。
