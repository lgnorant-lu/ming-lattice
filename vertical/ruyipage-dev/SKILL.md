---
name: ruyipage-dev
description: Professional RuyiPage (Python) Firefox automation workflow and troubleshooting using the bundled project README and curated RuyiPage docs; use when writing, debugging, or refactoring RuyiPage scripts for FirefoxPage, FirefoxOptions, launch and attach flows, element interaction, user contexts, request interception, anti-bot flows, BiDi-based automation, and fingerprint-browser takeover.
---

# RuyiPage Dev

## Overview

Use this skill to build reliable RuyiPage automation in Python by following a consistent workflow and consulting the bundled project materials in `references/`.

Read `references/project-readme.md` first. Treat it as the entry guide, capability map, and onboarding route for the framework, not as a shallow repository homepage. It already covers product positioning, installation, launch patterns, browser takeover, and Firefox-specific assumptions at a level that is directly useful for implementation work.

Read `references/index.md` next when you need the local doc map or a quick path to the right topic. Use the topic docs after the README has established the right mental model.

## Preferences

- Prefer `FirefoxPage` as the default browser automation entrypoint unless the task clearly needs another object.
- Prefer `launch(...)` for beginner-friendly startup code and `FirefoxOptions` when the task needs explicit browser path, user directory, port, or headless control.
- Prefer attaching to an existing Firefox or fingerprint-browser instance when the user already has a live browser profile, login state, or anti-bot preparation in place.
- Prefer explicit checks for stable page markers over blind sleeps in fragile login, anti-bot, or account-state flows.
- Prefer preserving `user_dir`, `user context`, and browser reuse patterns when debugging authentication or multi-account issues.

## Workflow

### 1) Clarify the target flow and execution model

- Start with `references/project-readme.md` unless the task is already narrowly scoped to one documented API.
- Decide whether the task is a fresh browser launch, takeover of an existing browser, or multi-account automation inside one browser.
- Identify whether the script depends on Firefox-specific behavior, BiDi capabilities, `isTrusted` actions, or fingerprint-browser integration.
- Treat anti-bot, login, and account-state assumptions as first-class design inputs before writing code.

Read:
- `references/project-readme.md`
- `references/docs/getting-started/RuyiPage 文档首页.md`
- `references/docs/getting-started/框架概览.md`
- `references/docs/getting-started/BiDi 对照.md`

### 2) Choose the startup and attach pattern

- Use `FirefoxPage()` for the smallest viable browser example.
- Use `FirefoxOptions()` when the user needs a fixed Firefox binary, profile directory, remote debugging port, or repeatable startup settings.
- Use `launch(...)` when a short, readable startup helper is enough.
- Use existing-browser takeover when the workflow starts from a manually opened Firefox or a Firefox-kernel fingerprint browser such as ADS or FlowerBrowser.

Read:
- `references/project-readme.md`
- `references/docs/getting-started/安装.md`
- `references/docs/getting-started/快速上手.md`

### 3) Build page and element interactions

- Centralize locators and keep them readable.
- Prefer explicit waits and deterministic page-state checks over scattered sleeps.
- Handle `iframe`, shadow boundaries, scroll, drag, touch, and `isTrusted` interactions intentionally rather than as afterthoughts.
- Treat form submission and navigation as state transitions that need confirmation, not just actions to fire.

Read:
- `references/docs/page-and-elements/页面对象.md`
- `references/docs/page-and-elements/页面导航.md`
- `references/docs/page-and-elements/等待机制.md`
- `references/docs/page-and-elements/元素定位.md`
- `references/docs/page-and-elements/选择器.md`
- `references/docs/page-and-elements/表单能力.md`
- `references/docs/page-and-elements/动作链.md`
- `references/docs/page-and-elements/拖拽.md`
- `references/docs/page-and-elements/滚动.md`
- `references/docs/page-and-elements/触摸输入.md`
- `references/docs/page-and-elements/isTrusted.md`
- `references/docs/page-and-elements/iframe 专题.md`
- `references/docs/page-and-elements/Shadow DOM 专题.md`
- `references/docs/page-and-elements/复杂边界.md`

### 4) Manage browser scope and execution context

- Distinguish page-level code from browser-level code.
- Use tab, window, and download APIs deliberately; do not mix responsibilities.
- Preserve context boundaries when debugging cookies, multiple tabs, multiple windows, and isolated user contexts.
- Use console, scripts, preload scripts, screenshots, and PDF export as debugging and observability tools, not just convenience APIs.

Read:
- `references/docs/browser-and-context/JavaScript.md`
- `references/docs/browser-and-context/Script 模块.md`
- `references/docs/browser-and-context/Preload Script.md`
- `references/docs/browser-and-context/Console.md`
- `references/docs/browser-and-context/Cookies.md`
- `references/docs/browser-and-context/标签页.md`
- `references/docs/browser-and-context/窗口.md`
- `references/docs/browser-and-context/Browser 模块.md`
- `references/docs/browser-and-context/User Context.md`
- `references/docs/browser-and-context/Browsing Context.md`
- `references/docs/browser-and-context/下载.md`
- `references/docs/browser-and-context/截图.md`
- `references/docs/browser-and-context/PDF.md`
- `references/docs/browser-and-context/弹窗处理.md`
- `references/docs/browser-and-context/WebExtension.md`
- `references/docs/browser-and-context/认证.md`
- `references/docs/browser-and-context/Emulation.md`
- `references/docs/browser-and-context/移动端模拟.md`

### 5) Debug network and high-risk flows

- Use interception and event hooks when the failure surface is request- or response-driven.
- Inspect navigation events and collected data before blaming page locators.
- Treat anti-bot flows as system behavior that spans browser startup, interaction realism, timing, cookies, and context reuse.

Read:
- `references/docs/network/网络能力.md`
- `references/docs/network/请求拦截.md`
- `references/docs/network/网络事件.md`
- `references/docs/network/导航事件.md`
- `references/docs/network/Data Collector.md`
- `references/docs/network/高风控场景.md`

### 6) Use examples before inventing patterns

- Search the bundled examples before designing a custom approach from scratch.
- Reuse example structure for startup, waits, interception, form handling, downloads, or high-risk scenarios when a close match already exists.
- Adapt examples to the user’s browser path, profile path, account state, and deployment environment rather than copying blindly.

Read:
- `references/docs/examples/`

## Quick Search Recipes

- Search the bundled docs by keyword:
  - `rg -n -S "<keyword>" references/docs`
  - For case-insensitive English terms: `rg -n -i "<keyword>" references/docs`
- Search the project README first when the task is about setup, startup, attach flows, or overall framework intent:
  - `rg -n -i "launch|attach|browser_path|user_dir|fingerprint|bidi|isTrusted" references/project-readme.md`
- Search for a concrete API or class name:
  - `rg -n -i "\\bFirefoxPage\\b|\\bFirefoxOptions\\b|\\blaunch\\b" references`
  - `rg -n -i "\\buser context\\b|\\bbidi\\b|\\bisTrusted\\b" references`
- Search example files by topic:
  - `rg -n -i "登录|cookie|intercept|download|cloudflare|datadome" references/docs/examples`

## Minimal Starter Snippet

Use the README and bundled docs as the source of truth for parameters and return values.

```python
from ruyipage import FirefoxPage, FirefoxOptions, launch

page = FirefoxPage()
page.get("https://www.example.com")
print(page.title)
page.quit()
```
