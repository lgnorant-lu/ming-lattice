---
name: blog-content
description: |
  博客内容创作与发布全流程规范。适用于在 blog-content 仓库中创建、编辑、发布博客文章。涵盖文章模板、Frontmatter 字段、Markdown 约定、命名规则、目录结构、提交规范与发布流程。当用户需要在博客中写文章、改文章或了解博客内容规范时使用本 skill。
---

# blog-content 博客内容创作规范

> 适用于 `lgnorant-lu/blog-content` 仓库的博客文章全生命周期管理。
> 三仓关系：`blog-content`（内容源）-> `blog-tui`（SSH 阅读器） + `blog-web`（Web 壳）。

---

## 1. 目录结构

```
blog-content/
  config.yaml               # 站点配置（标题、描述、giscus 仓库等，见 §10）
  posts/                    # 已发布文章（读者可见；生产/开发均显示）
  drafts/                   # 草稿（不发布，仅本地；`draft: true` 文章放此）
  pages/                    # 静态页面（关于、项目等，非文章列表）
  templates/                # 文章模板（写新文时复制到 drafts/，不被 scanner 索引）
    post-template.md        # 默认文章模板
  public/                   # 静态资源（图片、字体等，按需存放）
    images/                 # 文章图片子目录
```

**禁止**：在 `blog-web` 或 `blog-tui` 仓库中直接修改 `posts/*.md`。内容只写进 `blog-content/posts/`。

---

## 2. 文件命名

```
YYYY-MM-DD-slug.md
```

| 段 | 规则 |
|----|------|
| `YYYY-MM-DD` | ISO 日期，必须与 frontmatter `date` 一致 |
| `slug` | URL 安全标识符，小写，连字符分隔 |
| `.md` | 禁止 `.mdx` |

例：`2026-07-09-hello-world.md`

slug 解析正则（与 scanner 一致）：
```
^\d{4}-\d{2}-\d{2}-(.+)\.md$
```

新文章流程：
```
cp templates/post-template.md drafts/YYYY-MM-DD-slug.md
# 编辑 frontmatter + 正文
# 准备就绪后 mv 到 posts/
```

---

## 3. Frontmatter

YAML 前后 `---` 包裹，由 `gray-matter`（web）和 `gopkg.in/yaml.v3`（tui）解析。
权威规格：`blog-tui/docs/specs/frontmatter.md`——本节为速查层，冲突以规格为准。

### 3.1 必填字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `title` | string | 文章标题 |
| `date` | string | ISO 日期 `YYYY-MM-DD`，与文件名日期一致 |

### 3.2 可选字段

展示层（渲染引擎消费）：

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `updated` | string | git 最后提交日期 | 最后修改日期（git 不可用时回退 `date`） |
| `author` | string | 站点 `site.author` | 覆盖默认作者 |
| `cover` | string | `""` | 封面图路径（`/images/...`） |
| `draft` | boolean | `false` | 草稿标记 |

语义层（搜索/分类/AI 消费）：

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `slug` | string | 从文件名解析 | 自定义 URL slug（`[a-z0-9-]+`） |
| `summary` | string | 正文首段 | 文章摘要，1-2 句 |
| `tags` | string[] | `[]` | 维度标签（≤15 个，TUI 可浏览） |
| `categories` | string[] | `[]` | 层级分类（3-5 个，TUI 可浏览） |
| `keywords` | string | `""` | 细粒搜索词——**逗号分隔字符串**非数组（FTS5 索引） |
| `series` | string | `""` | 系列归属——同 `series` 值文章可顺序导航，空串=不属于任何系列 |
| `weight` | number | `0` | 同日文章排序降序；`0` = 按文件名自然序 |

### 3.3 tags / categories / keywords 正交分工

| 字段 | 回答的问题 | 粒度 | 示例 |
|------|-----------|------|------|
| `categories` | 属于哪个大领域 | 粗（3-5 个） | `["tech"]` |
| `tags` | 涉及什么技术/概念 | 中（5-15 个） | `["go", "tui"]` |
| `keywords` | 搜什么词能找到 | 细（逗号串，10-30 词） | `"golang, ssh tunnel"` |

### 3.4 `draft` 判定与行为

`IsDraft` 双源判定：文件在 `drafts/` 目录 **或** frontmatter `draft: true` 即为草稿。

| 环境 | `draft: false` | `draft: true` |
|------|---------------|---------------|
| 开发 (`npm run dev`) | 显示 | 显示 |
| 生产 (`npm run build`) | 显示 | **隐藏**（唯一硬阻断） |

### 3.5 校验规则（warning 模式）

解析不合规**不拒载**，仅 `slog.Warn`：title 空（回退文件名）、date 非 `YYYY-MM-DD`（回退 mtime）、tags >15、slug 非 `[a-z0-9-]+`（自动 slugify）。唯一硬阻断：`draft: true` 服务器不展示。

### 3.6 规范示例

```yaml
---
title: "文章标题"
date: 2026-07-09
updated: 2026-07-11
author: "lgnorant-lu"
slug: custom-slug
summary: "文章摘要"
tags: [tag1, tag2]
categories: ["tech"]
keywords: "comma, separated, terms"
series: series-name
cover: "/images/cover.webp"
weight: 10
draft: false
---
```

---

## 4. 内容写作约定

| 约定 | 规则 |
|------|------|
| **编码** | UTF-8，无 BOM |
| **换行** | LF（Unix），禁止 CRLF |
| **行宽** | 中文约 80 字符换行，英文不强制 |
| **标点** | 全文统一中/英文标点，不混用 |
| **图片** | 引用 URL 或放在 `public/images/`，WebP 优先，单张 < 500KB |
| **代码块** | 标注语言（````go```、````typescript```） |
| **内部链接** | 使用相对路径 `/posts/slug` |
| **图片链接** | 使用 `/images/filename.webp`（部署后映射到 `/images/`） |

---

## 5. 全局禁止事项

### 5.1 Emoji 零容忍

| 范围 | 要求 |
|------|------|
| **代码 (`.ts`, `.tsx`, `.go`, `.css`)** | 禁止任何 emoji，包括注释、字符串、日志 |
| **文档 (`.md`)** | 禁止 emoji，包括标题、列表、表格、描述 |
| **提交信息 (commit message)** | 禁止 emoji，包括 header 和 body |
| **文章正文** | 禁止 emoji 符号 |
| **UI 文案 (`messages/*.json`)** | 禁止 emoji，用纯文字替代 |
| **SVG/图片** | 禁止 emoji 作为图形元素 |

**例外**：无。所有 emoji 须替换为中文/英文文字表达。

### 5.2 其他禁止

| 禁止事项 | 范围 | 说明 |
|----------|------|------|
| **HTML 内联** | 正文 | 不解析原始 HTML 标签 |
| **自定义 Markdown 容器** | 正文 | 非标准扩展，解析器不支持 |
| **CRLF 换行** | 所有 `.md` 文件 | 必须 LF |
| **中英混用标点** | 正文 | 全文统一方向 |
| **非 CC0 / 未授权素材** | 图片/资源 | 仅使用 CC0 或自有素材 |
| **在 blog-web/blog-tui 仓修改 posts** | 全流程 | 内容只写 `blog-content/posts/` |

---

## 6. Markdown 语法子集

| 语法 | 说明 |
|------|------|
| `#` 至 `######` | 标题 |
| `**bold**` | 粗体 |
| `*italic*` | 斜体 |
| `` `code` `` | 行内代码 |
| ` ``` ` fenced | 代码块（标注语言） |
| `> ` | 引用 |
| `- ` / `1. ` | 无序/有序列表 |
| `[text](url)` | 链接 |
| `![alt](url)` | 图片 |
| `---` | 水平线 |
| 标准 GFM 表格 | 表格 |
| `~~text~~` | 删除线 |

---

## 7. 发布流程

```
写作阶段：
  1. cp templates/post-template.md drafts/YYYY-MM-DD-slug.md
  2. 填充 frontmatter + 正文
  3. 本地预览（blog-tui `make run` 或 blog-web `npm run dev`）

发布阶段：
  4. mv drafts/YYYY-MM-DD-slug.md posts/
  5. git add posts/YYYY-MM-DD-slug.md
  6. git commit -m "feat(posts): add article title"
  7. git push

自动发布：
  8. GitHub Webhook -> 服务器 git pull content
  9. blog-tui 自动重扫（fsnotify 或 cron）
  10. blog-web 自动重建（webhook-rebuild.sh 或 cron，需 pm2 restart）
```

### 7.1 提交信息约定

全部三个仓库统一适用：

```
feat(posts): add article about webgl shaders

## 变更内容
- 新增 2026-07-14-webgl-shaders.md
- 讨论 WebGL 着色器在博客中的应用

## 测试
- blog-tui make run 预览通过
- blog-web npm run dev 显示正常
```

**type 与 scope 速查**：

| type | 适用场景 |
|------|----------|
| `feat` | 新功能/新文章 |
| `fix` | 修复 bug/错别字 |
| `docs` | 纯文档变更 |
| `refactor` | 重构，无行为变化 |
| `test` | 增补测试 |
| `chore` | 工程配置/CI |

blog-content 仓 scope 建议：`posts` / `config` / `drafts`
blog-web / blog-tui 仓 scope 建议：对应模块名

---

## 8. Markdown 与 Shiki 代码高亮

blog-web 使用 `rehype-pretty-code` + Shiki 做代码高亮。写作注意：

- 代码块标注语言：````go```、````typescript```、````bash```、````yaml``` 等
- 支持 `// title=` 显示文件名
- 支持 `{1,3-5}` 行高亮
- 代码块内**禁止** emoji

---

## 9. 图片与资源

- 图片放在 `blog-content/public/images/` 目录
- 引用时使用 `/images/filename.webp`（部署后由 Nginx 映射）
- 格式优先 WebP，次选 PNG，禁 BMP/TIFF
- 单图 ≤ 500KB，大图异步加载
- CC0 或自有版权，**禁止**未授权网络图片

---

## 10. config.yaml 格式（站点配置）

```yaml
title: "站点标题"
description: "站点描述"
base_url: "https://example.com"
giscus_repo: "owner/repo"  # Giscus 评论仓库
language: "zh-CN"
```

---

## 11. 样本文章（sample- 前缀）

文件名以 `sample-` 开头的文章（如 `2026-07-14-sample-server-http-webhook.md`），在 blog-web 首页自动排在真实文章之后，默认折叠在「样本文章」详情块内。不隐藏，仅降低展示优先级。

---

## 12. 三仓职责边界

| 仓库 | 职责 | 可见性 |
|------|------|--------|
| `lgnorant-lu/blog-content` | Markdown 源文件、文章内容 | PUBLIC |
| `lgnorant-lu/blog-tui` | Go SSH TUI 引擎 | PUBLIC |
| `lgnorant-lu/blog-web` | Next.js Web 壳 | PUBLIC |

**内容单向流向**：

```
blog-content/posts/*.md
    | git push
    v
blog-content 远端 (GitHub)
    | webhook / cron
    v
blog-tui 服务器 (自动重扫索引)
blog-web 服务器 (自动 rebuild SSG)
```

---

## 13. 相关文档索引

| 文档 | 位置 |
|------|------|
| 内容规范（完整版含 config.yaml） | `blog-tui/docs/content-spec.md` |
| Frontmatter 字段完整规格 | `blog-tui/docs/specs/frontmatter.md` |
| 提交规范（含 scope 清单） | `blog-tui/docs/conventions/commit.md` |
| 部署架构 | `blog-tui/docs/design/deployment.md` |
| blog-web 设计概览 | `blog-web/docs/design/v2-architecture.md` |
| blog-web 部署指南 | `blog-web/docs/guides/production.md` |
| blog-web 内容约定 | `blog-web/docs/conventions/config-and-i18n.md` |
| 部署安全检查清单 | `blog-web/docs/guides/ssh-deploy-checklist.md` |
