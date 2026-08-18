#  RuyiPage Browsing Context
Browsing context 是 BiDi 标准里的核心对象，适合单独做专题。
## API 与参数说明
### page.contexts.get_tree
`page.contexts.get_tree()`
获取 browsing context 树结构
### page.contexts.create_tab
`page.contexts.create_tab()`
通过标准命令创建新 tab context
### page.contexts.create_window
`page.contexts.create_window()`
创建新窗口 context
### page.contexts.close
`page.contexts.close(context_id)`
关闭指定 context
参数说明
参数 | 说明  
---|---  
context_id | browsing context 的唯一标识。  
### page.contexts.reload
`page.contexts.reload(context_id)`
重新加载 context
参数说明
参数 | 说明  
---|---  
context_id | browsing context 的唯一标识。  
### page.contexts.set_bypass_csp
`page.contexts.set_bypass_csp(context_id, True)`
绕过 CSP 限制
参数说明
参数 | 说明  
---|---  
context_id | browsing context 的唯一标识。  
True | 参数含义与默认值请结合当前 API 场景使用。  
### page.contexts.set_viewport
`page.contexts.set_viewport(context_id, width, height)`
设置视口尺寸
参数说明
参数 | 说明  
---|---  
context_id | browsing context 的唯一标识。  
width | 宽度，单位像素。  
height | 高度，单位像素。  
## 相关示例
  * 参见示例中心：/automation/examples


## 相关示例源码
### BrowsingContext 高级能力：树、创建、关闭、reload、viewport
examples/26_browsing_context_advanced.py
是 browsing context 章节的主参考示例。
GitHub 仓库 [查看仓库源码](https://github.com/LoseNine/ruyipage/blob/main/examples/26_browsing_context_advanced.py) page.contexts.get_treepage.contexts.create_tabpage.contexts.closepage.contexts.reloadpage.contexts.set_bypass_csppage.contexts.set_viewport
  * 获取 browsing context 树
  * 通过标准命令创建和关闭 context
  * 执行普通 reload 和 ignore_cache reload
  * 设置 bypass CSP
  * 调整桌面和移动视口尺寸


源码文件：`app/content/ruyipage_examples/26_browsing_context_advanced.py` · 仓库：[26_browsing_context_advanced.py](https://github.com/LoseNine/ruyipage/blob/main/examples/26_browsing_context_advanced.py)
python 注释版
注释版 原始版 自动换行 复制代码
```
#!/usr/bin/env python
# =============================
# RuyiPage 示例注释版
# 标题: BrowsingContext 高级能力：树、创建、关闭、reload、viewport
# 说明: 是 browsing context 章节的主参考示例。
# 你会学到:
#   1. 获取 browsing context 树
#   2. 通过标准命令创建和关闭 context
#   3. 执行普通 reload 和 ignore_cache reload
#   4. 设置 bypass CSP
#   5. 调整桌面和移动视口尺寸
# 相关 API: page.contexts.get_tree, page.contexts.create_tab, page.contexts.close, page.contexts.reload, page.contexts.set_bypass_csp, page.contexts.set_viewport
# =============================

# -*- coding: utf-8 -*-
"""示例26: BrowsingContext 高级功能（严格结果版）"""

import io
import sys
from typing import Dict, List

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

from ruyipage import FirefoxPage


def add_result(
    results: List[Dict[str, str]], item: str, status: str, note: str
) -> None:
    """记录结构化结果。"""
    results.append({"item": item, "status": status, "note": note})


def print_results(results: List[Dict[str, str]]) -> None:
    """打印固定格式结果表。"""
    print("\n| 项目 | 状态 | 说明 |")
    print("| --- | --- | --- |")
    for row in results:
        print(f"| {row['item']} | {row['status']} | {row['note']} |")


def main() -> None:
    print("=" * 70)
    print("测试 26: BrowsingContext 高级功能")
    print("=" * 70)

    page = FirefoxPage()
    child_id = None
    results: List[Dict[str, str]] = []

    try:
        page.get("https://www.example.com")
        add_result(results, "页面加载", "成功", "example.com 已加载")

        tree = page.contexts.get_tree()
        contexts = tree.contexts
        if contexts:
            add_result(
                results,
                "browsingContext.getTree",
                "成功",
                f"上下文数量: {len(contexts)}",
            )
        else:
            add_result(results, "browsingContext.getTree", "失败", "未返回任何上下文")

        child_id = page.contexts.create_tab()
        if child_id:
            add_result(
                results, "browsingContext.create", "成功", f"新 context: {child_id}"
            )
            page.contexts.close(child_id)
            add_result(results, "browsingContext.close", "成功", "新 context 已关闭")
            child_id = None
        else:
            add_result(results, "browsingContext.create", "失败", "未返回 context ID")

        r1 = page.contexts.reload()
        if r1.get("navigation"):
            add_result(
                results,
                "browsingContext.reload",
                "成功",
                f"navigation={r1.get('navigation')}",
            )
        else:
            add_result(
                results, "browsingContext.reload", "跳过", "当前返回未包含 navigation"
            )

        try:
            r2 = page.contexts.reload(ignore_cache=True)
            add_result(
                results,
                "browsingContext.reload ignoreCache",
                "成功",
                f"navigation={r2.get('navigation')}",
            )
        except Exception as e:
            add_result(
                results, "browsingContext.reload ignoreCache", "不支持", str(e)[:120]
            )

        try:
            page.contexts.set_bypass_csp(True)
            add_result(
                results, "browsingContext.setBypassCSP", "成功", "标准命令调用成功"
            )
        except Exception as e:
            add_result(results, "browsingContext.setBypassCSP", "不支持", str(e)[:120])

        page.contexts.set_viewport(800, 600)
        page.wait(0.2)
        vp = page.rect.viewport_size
        if tuple(vp) == (800, 600):
            add_result(
                results,
                "browsingContext.setViewport 800x600",
                "成功",
                f"实际视口: {vp}",
            )
        else:
            add_result(
                results,
                "browsingContext.setViewport 800x600",
                "失败",
                f"实际视口: {vp}",
            )

        page.contexts.set_viewport(375, 667)
        page.wait(0.2)
        vp2 = page.rect.viewport_size
        if tuple(vp2) == (375, 667):
            add_result(
                results,
                "browsingContext.setViewport 375x667",
                "成功",
                f"实际视口: {vp2}",
            )
        else:
            add_result(
                results,
                "browsingContext.setViewport 375x667",
                "失败",
                f"实际视口: {vp2}",
            )

        print_results(results)

    except Exception as e:
        add_result(results, "示例执行", "失败", str(e)[:120])
        print_results(results)
        raise
    finally:
        if child_id:
            try:
                page.contexts.close(child_id)
            except Exception:
                pass
        try:
            page.quit()
        except Exception:
            pass


if __name__ == "__main__":
    main()

```

```
#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""示例26: BrowsingContext 高级功能（严格结果版）"""

import io
import sys
from typing import Dict, List

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

from ruyipage import FirefoxPage


def add_result(
    results: List[Dict[str, str]], item: str, status: str, note: str
) -> None:
    """记录结构化结果。"""
    results.append({"item": item, "status": status, "note": note})


def print_results(results: List[Dict[str, str]]) -> None:
    """打印固定格式结果表。"""
    print("\n| 项目 | 状态 | 说明 |")
    print("| --- | --- | --- |")
    for row in results:
        print(f"| {row['item']} | {row['status']} | {row['note']} |")


def main() -> None:
    print("=" * 70)
    print("测试 26: BrowsingContext 高级功能")
    print("=" * 70)

    page = FirefoxPage()
    child_id = None
    results: List[Dict[str, str]] = []

    try:
        page.get("https://www.example.com")
        add_result(results, "页面加载", "成功", "example.com 已加载")

        tree = page.contexts.get_tree()
        contexts = tree.contexts
        if contexts:
            add_result(
                results,
                "browsingContext.getTree",
                "成功",
                f"上下文数量: {len(contexts)}",
            )
        else:
            add_result(results, "browsingContext.getTree", "失败", "未返回任何上下文")

        child_id = page.contexts.create_tab()
        if child_id:
            add_result(
                results, "browsingContext.create", "成功", f"新 context: {child_id}"
            )
            page.contexts.close(child_id)
            add_result(results, "browsingContext.close", "成功", "新 context 已关闭")
            child_id = None
        else:
            add_result(results, "browsingContext.create", "失败", "未返回 context ID")

        r1 = page.contexts.reload()
        if r1.get("navigation"):
            add_result(
                results,
                "browsingContext.reload",
                "成功",
                f"navigation={r1.get('navigation')}",
            )
        else:
            add_result(
                results, "browsingContext.reload", "跳过", "当前返回未包含 navigation"
            )

        try:
            r2 = page.contexts.reload(ignore_cache=True)
            add_result(
                results,
                "browsingContext.reload ignoreCache",
                "成功",
                f"navigation={r2.get('navigation')}",
            )
        except Exception as e:
            add_result(
                results, "browsingContext.reload ignoreCache", "不支持", str(e)[:120]
            )

        try:
            page.contexts.set_bypass_csp(True)
            add_result(
                results, "browsingContext.setBypassCSP", "成功", "标准命令调用成功"
            )
        except Exception as e:
            add_result(results, "browsingContext.setBypassCSP", "不支持", str(e)[:120])

        page.contexts.set_viewport(800, 600)
        page.wait(0.2)
        vp = page.rect.viewport_size
        if tuple(vp) == (800, 600):
            add_result(
                results,
                "browsingContext.setViewport 800x600",
                "成功",
                f"实际视口: {vp}",
            )
        else:
            add_result(
                results,
                "browsingContext.setViewport 800x600",
                "失败",
                f"实际视口: {vp}",
            )

        page.contexts.set_viewport(375, 667)
        page.wait(0.2)
        vp2 = page.rect.viewport_size
        if tuple(vp2) == (375, 667):
            add_result(
                results,
                "browsingContext.setViewport 375x667",
                "成功",
                f"实际视口: {vp2}",
            )
        else:
            add_result(
                results,
                "browsingContext.setViewport 375x667",
                "失败",
                f"实际视口: {vp2}",
            )

        print_results(results)

    except Exception as e:
        add_result(results, "示例执行", "失败", str(e)[:120])
        print_results(results)
        raise
    finally:
        if child_id:
            try:
                page.contexts.close(child_id)
            except Exception:
                pass
        try:
            page.quit()
        except Exception:
            pass


if __name__ == "__main__":
    main()

```

### BrowsingContext 事件：上下文创建销毁与用户提示框事件
examples/30_browsing_context_events.py
把 context 事件和 prompt 事件统一放到协议事件角度理解。
GitHub 仓库 [查看仓库源码](https://github.com/LoseNine/ruyipage/blob/main/examples/30_browsing_context_events.py) page.events.startpage.events.waitpage.contexts.create_tabpage.contexts.create_windowpage.contexts.closepage.accept_promptpage.set_prompt_handler
  * 监听 tab 和 window 创建销毁
  * 监听 alert 和 prompt 打开关闭
  * 配合自动 prompt 策略处理事件链


源码文件：`app/content/ruyipage_examples/30_browsing_context_events.py` · 仓库：[30_browsing_context_events.py](https://github.com/LoseNine/ruyipage/blob/main/examples/30_browsing_context_events.py)
python 注释版
注释版 原始版 自动换行 复制代码
```
#!/usr/bin/env python
# =============================
# RuyiPage 示例注释版
# 标题: BrowsingContext 事件：上下文创建销毁与用户提示框事件
# 说明: 把 context 事件和 prompt 事件统一放到协议事件角度理解。
# 你会学到:
#   1. 监听 tab 和 window 创建销毁
#   2. 监听 alert 和 prompt 打开关闭
#   3. 配合自动 prompt 策略处理事件链
# 相关 API: page.events.start, page.events.wait, page.contexts.create_tab, page.contexts.create_window, page.contexts.close, page.accept_prompt, page.set_prompt_handler
# =============================

# -*- coding: utf-8 -*-
"""示例30: BrowsingContext Events（严格结果版）"""

import io
import sys
from typing import Dict, List

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

from ruyipage import BidiEvent, FirefoxPage


def add_result(
    results: List[Dict[str, str]], item: str, status: str, note: str
) -> None:
    results.append({"item": item, "status": status, "note": note})


def print_results(results: List[Dict[str, str]]) -> None:
    print("\n| 项目 | 状态 | 说明 |")
    print("| --- | --- | --- |")
    for row in results:
        print(f"| {row['item']} | {row['status']} | {row['note']} |")


def main() -> None:
    print("=" * 70)
    print("测试 30: BrowsingContext Events")
    print("=" * 70)

    page = FirefoxPage()
    results: List[Dict[str, str]] = []
    temp_tab = None
    temp_window = None

    try:
        page.get("https://www.example.com")
        add_result(results, "页面加载", "成功", "example.com 已加载")

        if page.events.start(
            [
                "browsingContext.contextCreated",
                "browsingContext.contextDestroyed",
                "browsingContext.userPromptOpened",
                "browsingContext.userPromptClosed",
            ],
            contexts=[],
        ):
            add_result(results, "事件订阅", "成功", "已订阅 context / prompt 相关事件")
        else:
            add_result(results, "事件订阅", "失败", "未能订阅 browsingContext 事件")
            print_results(results)
            return

        # 1. contextCreated / contextDestroyed
        page.events.clear()
        temp_tab = page.contexts.create_tab()
        created_tab: BidiEvent | None = page.events.wait(
            "browsingContext.contextCreated", timeout=3
        )
        if created_tab and created_tab.context == temp_tab:
            add_result(
                results,
                "browsingContext.contextCreated tab",
                "成功",
                f"context={temp_tab}",
            )
        else:
            add_result(
                results,
                "browsingContext.contextCreated tab",
                "失败",
                f"expected={temp_tab}",
            )

        temp_window = page.contexts.create_window()
        created_window: BidiEvent | None = page.events.wait(
            "browsingContext.contextCreated", timeout=3
        )
        if created_window and created_window.context == temp_window:
            add_result(
                results,
                "browsingContext.contextCreated window",
                "成功",
                f"context={temp_window}",
            )
        else:
            add_result(
                results,
                "browsingContext.contextCreated window",
                "失败",
                f"expected={temp_window}",
            )

        if temp_tab:
            page.contexts.close(temp_tab)
            destroyed_tab = page.events.wait(
                "browsingContext.contextDestroyed", timeout=3
            )
            if destroyed_tab and destroyed_tab.context == temp_tab:
                add_result(
                    results,
                    "browsingContext.contextDestroyed tab",
                    "成功",
                    f"context={temp_tab}",
                )
            else:
                add_result(
                    results,
                    "browsingContext.contextDestroyed tab",
                    "失败",
                    f"expected={temp_tab}",
                )
            temp_tab = None

        if temp_window:
            page.contexts.close(temp_window)
            destroyed_window = page.events.wait(
                "browsingContext.contextDestroyed", timeout=3
            )
            if destroyed_window and destroyed_window.context == temp_window:
                add_result(
                    results,
                    "browsingContext.contextDestroyed window",
                    "成功",
                    f"context={temp_window}",
                )
            else:
                add_result(
                    results,
                    "browsingContext.contextDestroyed window",
                    "失败",
                    f"expected={temp_window}",
                )
            temp_window = None

        # 2. userPromptOpened / userPromptClosed
        page.events.clear()

        page.run_js("alert('hello alert')", as_expr=False)
        opened_alert = page.events.wait("browsingContext.userPromptOpened", timeout=3)
        if opened_alert and opened_alert.user_prompt_type == "alert":
            add_result(
                results,
                "browsingContext.userPromptOpened alert",
                "成功",
                opened_alert.message or "",
            )
        else:
            add_result(
                results,
                "browsingContext.userPromptOpened alert",
                "失败",
                "未观察到 alert 打开事件",
            )

        page.accept_prompt(timeout=3)
        closed_alert = page.events.wait("browsingContext.userPromptClosed", timeout=3)
        if closed_alert and closed_alert.accepted is True:
            add_result(
                results,
                "browsingContext.userPromptClosed alert",
                "成功",
                f"accepted={closed_alert.accepted}",
            )
        else:
            add_result(
                results,
                "browsingContext.userPromptClosed alert",
                "失败",
                "未观察到 alert 关闭事件",
            )

        page.events.clear()
        page.set_prompt_handler(prompt="ignore", prompt_text="Test User")

        page.run_js("prompt('Enter your name:', 'default')", as_expr=False)
        opened_prompt = page.events.wait("browsingContext.userPromptOpened", timeout=3)
        if opened_prompt and opened_prompt.user_prompt_type == "prompt":
            add_result(
                results,
                "browsingContext.userPromptOpened prompt",
                "成功",
                opened_prompt.message or "",
            )
        else:
            add_result(
                results,
                "browsingContext.userPromptOpened prompt",
                "失败",
                "未观察到 prompt 打开事件",
            )

        closed_prompt = page.events.wait("browsingContext.userPromptClosed", timeout=3)
        if closed_prompt and closed_prompt.accepted is True:
            add_result(
                results,
                "browsingContext.userPromptClosed prompt",
                "成功",
                f"accepted={closed_prompt.accepted}",
            )
        else:
            add_result(
                results,
                "browsingContext.userPromptClosed prompt",
                "跳过",
                "当前环境下 prompt 自动注入文本后未稳定观察到 userPromptClosed",
            )

        page.clear_prompt_handler()
        print_results(results)

    except Exception as e:
        add_result(results, "示例执行", "失败", str(e)[:120])
        print_results(results)
        raise
    finally:
        try:
            page.clear_prompt_handler()
        except Exception:
            pass
        try:
            page.events.stop()
        except Exception:
            pass
        if temp_tab:
            try:
                page.contexts.close(temp_tab)
            except Exception:
                pass
        if temp_window:
            try:
                page.contexts.close(temp_window)
            except Exception:
                pass
        try:
            page.quit()
        except Exception:
            pass


if __name__ == "__main__":
    main()

```

```
#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""示例30: BrowsingContext Events（严格结果版）"""

import io
import sys
from typing import Dict, List

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

from ruyipage import BidiEvent, FirefoxPage


def add_result(
    results: List[Dict[str, str]], item: str, status: str, note: str
) -> None:
    results.append({"item": item, "status": status, "note": note})


def print_results(results: List[Dict[str, str]]) -> None:
    print("\n| 项目 | 状态 | 说明 |")
    print("| --- | --- | --- |")
    for row in results:
        print(f"| {row['item']} | {row['status']} | {row['note']} |")


def main() -> None:
    print("=" * 70)
    print("测试 30: BrowsingContext Events")
    print("=" * 70)

    page = FirefoxPage()
    results: List[Dict[str, str]] = []
    temp_tab = None
    temp_window = None

    try:
        page.get("https://www.example.com")
        add_result(results, "页面加载", "成功", "example.com 已加载")

        if page.events.start(
            [
                "browsingContext.contextCreated",
                "browsingContext.contextDestroyed",
                "browsingContext.userPromptOpened",
                "browsingContext.userPromptClosed",
            ],
            contexts=[],
        ):
            add_result(results, "事件订阅", "成功", "已订阅 context / prompt 相关事件")
        else:
            add_result(results, "事件订阅", "失败", "未能订阅 browsingContext 事件")
            print_results(results)
            return

        # 1. contextCreated / contextDestroyed
        page.events.clear()
        temp_tab = page.contexts.create_tab()
        created_tab: BidiEvent | None = page.events.wait(
            "browsingContext.contextCreated", timeout=3
        )
        if created_tab and created_tab.context == temp_tab:
            add_result(
                results,
                "browsingContext.contextCreated tab",
                "成功",
                f"context={temp_tab}",
            )
        else:
            add_result(
                results,
                "browsingContext.contextCreated tab",
                "失败",
                f"expected={temp_tab}",
            )

        temp_window = page.contexts.create_window()
        created_window: BidiEvent | None = page.events.wait(
            "browsingContext.contextCreated", timeout=3
        )
        if created_window and created_window.context == temp_window:
            add_result(
                results,
                "browsingContext.contextCreated window",
                "成功",
                f"context={temp_window}",
            )
        else:
            add_result(
                results,
                "browsingContext.contextCreated window",
                "失败",
                f"expected={temp_window}",
            )

        if temp_tab:
            page.contexts.close(temp_tab)
            destroyed_tab = page.events.wait(
                "browsingContext.contextDestroyed", timeout=3
            )
            if destroyed_tab and destroyed_tab.context == temp_tab:
                add_result(
                    results,
                    "browsingContext.contextDestroyed tab",
                    "成功",
                    f"context={temp_tab}",
                )
            else:
                add_result(
                    results,
                    "browsingContext.contextDestroyed tab",
                    "失败",
                    f"expected={temp_tab}",
                )
            temp_tab = None

        if temp_window:
            page.contexts.close(temp_window)
            destroyed_window = page.events.wait(
                "browsingContext.contextDestroyed", timeout=3
            )
            if destroyed_window and destroyed_window.context == temp_window:
                add_result(
                    results,
                    "browsingContext.contextDestroyed window",
                    "成功",
                    f"context={temp_window}",
                )
            else:
                add_result(
                    results,
                    "browsingContext.contextDestroyed window",
                    "失败",
                    f"expected={temp_window}",
                )
            temp_window = None

        # 2. userPromptOpened / userPromptClosed
        page.events.clear()

        page.run_js("alert('hello alert')", as_expr=False)
        opened_alert = page.events.wait("browsingContext.userPromptOpened", timeout=3)
        if opened_alert and opened_alert.user_prompt_type == "alert":
            add_result(
                results,
                "browsingContext.userPromptOpened alert",
                "成功",
                opened_alert.message or "",
            )
        else:
            add_result(
                results,
                "browsingContext.userPromptOpened alert",
                "失败",
                "未观察到 alert 打开事件",
            )

        page.accept_prompt(timeout=3)
        closed_alert = page.events.wait("browsingContext.userPromptClosed", timeout=3)
        if closed_alert and closed_alert.accepted is True:
            add_result(
                results,
                "browsingContext.userPromptClosed alert",
                "成功",
                f"accepted={closed_alert.accepted}",
            )
        else:
            add_result(
                results,
                "browsingContext.userPromptClosed alert",
                "失败",
                "未观察到 alert 关闭事件",
            )

        page.events.clear()
        page.set_prompt_handler(prompt="ignore", prompt_text="Test User")

        page.run_js("prompt('Enter your name:', 'default')", as_expr=False)
        opened_prompt = page.events.wait("browsingContext.userPromptOpened", timeout=3)
        if opened_prompt and opened_prompt.user_prompt_type == "prompt":
            add_result(
                results,
                "browsingContext.userPromptOpened prompt",
                "成功",
                opened_prompt.message or "",
            )
        else:
            add_result(
                results,
                "browsingContext.userPromptOpened prompt",
                "失败",
                "未观察到 prompt 打开事件",
            )

        closed_prompt = page.events.wait("browsingContext.userPromptClosed", timeout=3)
        if closed_prompt and closed_prompt.accepted is True:
            add_result(
                results,
                "browsingContext.userPromptClosed prompt",
                "成功",
                f"accepted={closed_prompt.accepted}",
            )
        else:
            add_result(
                results,
                "browsingContext.userPromptClosed prompt",
                "跳过",
                "当前环境下 prompt 自动注入文本后未稳定观察到 userPromptClosed",
            )

        page.clear_prompt_handler()
        print_results(results)

    except Exception as e:
        add_result(results, "示例执行", "失败", str(e)[:120])
        print_results(results)
        raise
    finally:
        try:
            page.clear_prompt_handler()
        except Exception:
            pass
        try:
            page.events.stop()
        except Exception:
            pass
        if temp_tab:
            try:
                page.contexts.close(temp_tab)
            except Exception:
                pass
        if temp_window:
            try:
                page.contexts.close(temp_window)
            except Exception:
                pass
        try:
            page.quit()
        except Exception:
            pass


if __name__ == "__main__":
    main()

```
