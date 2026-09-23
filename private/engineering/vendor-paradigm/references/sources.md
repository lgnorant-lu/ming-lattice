# vendor-paradigm 外部先例出处

## 理论地基

- **Russ Cox《Defining Go Modules》**（research!rsc blog, 2019）——vendoring 存在理由讣告：reproducibility + availability 两条，lockfile+proxy 后只剩 availability 残值。本范式判据树的直接来源。
- **Tommy Nesbitt《Lockfiles Killed Vendoring》**——Bundler 之后实体 vendor 让位 lockfile 的演进论证。

## 先例实现

- **Carvel vendir**——声明式目录物化器：vendir.yml 清单 + vendir.lock 锁，按 ref 拉取目录内容。对应本范式"清单即锁"件。
- **Bazel distdir / repository rules**——fetch-by-SHA + 内容寻址缓存：内容即产物的工业级实现。
- **Git subtree vs submodule**——submodule 语义等价但无 domain/note/enabled 元数据位、孤本无上游可指、UX 恶劣；subtree 字节入库=回到 vendored 老路。本仓否决 `.gitmodules` 路线的理据。

## vendored 纪律（留实体字节时适用）

- **Google `third_party/` 政策**——LICENSE 必须随包、禁止嵌套依赖、变更须申报。dep-in-dep 污染判据来源。

## 本仓实证（2026-09-23）

- vertical/ 96 仓 vendored→物化制改造：92 可物化 + 4 sourceGone 孤本（ruyi 下架族），`.git` 188M→9M，另清出 35 个史中 gitlink 误入库残留。
- 三个真实事故全部转化为物化器检测语义：filter-repo reset 清空工作树（ls-tree -l 双查）、maxBuffer ENOBUFS 假阴（64M）、ls-tree 对齐空格切分 bug。
- jadx-mcp-server 上游重建史实例：merge-base 空、双根提交、本地旧线 tip 落后——reconcile 裁决判据。
- ruyi 家族选择性下架实例：作者活跃主仓在推、4 卫星仓 404、内容未并主仓=刻意撤回。
