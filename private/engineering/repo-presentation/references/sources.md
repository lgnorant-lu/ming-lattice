# sources — repo-presentation

## 版本通道

- semver.org §9-11：pre-release 语法（`-<dot-separated identifiers>`）与 precedence 规则——官方规范，判据正典。
- PEP 440：版本标识 `[{a|b|rc}N][.postN][.devN]` 规范与 `pip --pre` 默认过滤语义——官方规范，双轨映射的 PEP 侧正典。
- AndroidX `androidx/docs/versioning.md`：库视角最完整的通道判据骨架——alpha01 起编、≥2 周/档浸泡期、beta=API freeze（例外仅 ship-blocker）、rc 与终版同构建、stable=已发 rc 直接转正。本包 §1.1 表的直接来源。
- Go release cycle：主版本周期与 freeze 惯例参照（次要证据）。
- 正例外证（dogfood 2026-10-08）：blog-tui 的 `git describe --tags →
  -ldflags -X → internal/version.Version → --version/make version/deploy.ps1`
  是"tag SoT + 构建期派生"判据的独立到达实现（Go 栈，非 maturin）——
  版本字段零手双写，漂移在结构上不可能。§1.2/§1.3 判据跨栈普适的实证。

## README / 仓库美化

- 隐私分层判据（Tier A/B/C）为**自创判据**：托管 SVG 服务 = 可用性依赖 + 每浏览一次回第三方服务的遥测面——非上游正典，属本包原创贡献，采纳时请复述该推理而非当外部标准引。
- 组件件来源：shields.io（事实标准）、capsule-render、readme-typing-svg、github-readme-stats、skill-icons、Platane/snk、readme-widget-hub / awesome-badges 索引仓、VHS（charmbracelet，.tape DSL→GIF）、asciinema（.cast + agg + svg-term-cli）、s-vhs。

## CLI 标识输出

- turborepo #11464：stderr banner 被错误监控误报——CI 闸必要性的实证案例。
- orval `--quiet`：抑制旗标正例。
- cligentic banner：bare-invoke/--help 触发 + NO_COLOR/非 TTY 退化——触发契约的现存参照实现。

## 明确不纳入

- CHANGELOG 写作规范（keepachangelog 等）——体裁不同，不进本包。
- CI 徽章生成配置（workflow badge URL 构造）——工具配置非判据。
- PyPI/npm 发布流程（构建、上传、签名）——发布机制非呈现判据。
- 徽章"哪个好看"类主观推荐——本包只给分层判据与预算纪律，不做审美背书。
- Semver 以外版本体系（CalVer 等）的完整判据——仅双轨映射内提及，不展开正典。
