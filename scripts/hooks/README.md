# scripts/hooks/ — 门禁引擎 kit

`engine.mjs` 统一调度器 + `gates/` 出厂门 + `lib/` 依赖件 + `validate.mjs`。
本目录整体经 `install-hooks.ps1 -Target` 拷贝分发；`gates.local/` 显式排除。

## 契约要点

- **退出码**：`0` 通过 / `1` 门禁拦截 / `2` 引擎故障（fail-closed 可分辨）
- **原生门形态**：`export const gate = { id, stages?, defaultLevel?, expensive?, globs?, exclude?, available?(ctx), run(ctx)→findings[], fix?(ctx), configKeys? }`
- **配置面**：`.hooksrc` 的 `gate.<id>.<key>`（`level/globs/exclude/cadence` 通用键 +
  门自描述 `configKeys`）；`.hooksrc.local` 个人覆盖（gitignored）；`[glob]` 分节域内调参
- **声明式正则门**：`gate.<id>.pattern/message/globs` 平铺键零代码覆盖长尾检查——
  简单检查优先走它，原生码门留给文件遍历/外部命令场景
- **staged 索引保真**：`ctx.read` 走 `git ls-files -s -z`+`cat-file blob` sha 寻址；
  禁用 `git show :<path>`/`<rev>:<path>`（revspec pathspec 魔法），`--` 后字面化用
  `GIT_LITERAL_PATHSPECS=1`
- **gates.local/**：采纳侧私有门住所——kit 永不携带其内容；本地私门直接在此建 `.mjs`
- **完整性**：engine+gates+gates.local+lib 整树 hash 对账 `.git/hook-engine-state.json`；
  改动确认后 `node scripts/hooks/engine.mjs trust` 更新存值
- **常用命令**：`run check`（staged 门禁）/ `baseline`（棕场冻结）/ `run fix`（自愈）/
  `list`（装载门与采纳元数据）

权威文档：源 kit 仓 `docs/GIT_HOOKS.md`（全量拓扑/分级/迁移方法论——采纳侧经
`.git/hook-engine-state.json` 的 `adoption.sourceRepo` 回溯）。
