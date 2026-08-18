#  RuyiPage Browser 模块
browser_tools 和浏览器级控制能力与页面对象配合，适合更高级的自动化调试。
## API 与参数说明
### page.browser_tools.get_user_contexts
`page.browser_tools.get_user_contexts()`
获取所有用户上下文
### page.browser_tools.create_user_context
`page.browser_tools.create_user_context()`
创建新用户上下文
### page.browser_tools.remove_user_context
`page.browser_tools.remove_user_context(id)`
删除用户上下文
参数说明
参数 | 说明  
---|---  
id | 参数含义与默认值请结合当前 API 场景使用。  
### page.browser_tools.create_tab
`page.browser_tools.create_tab(user_context_id)`
在指定上下文创建标签页
参数说明
参数 | 说明  
---|---  
user_context_id | 参数含义与默认值请结合当前 API 场景使用。  
### page.browser_tools.get_client_windows
`page.browser_tools.get_client_windows()`
获取所有客户端窗口
### page.browser_tools.set_window_state
`page.browser_tools.set_window_state(id, state)`
设置窗口状态
参数说明
参数 | 说明  
---|---  
id | 参数含义与默认值请结合当前 API 场景使用。  
state | 窗口状态（normal/maximized/minimized/fullscreen）。  
## 相关示例
  * 参见示例中心：/automation/examples


## 相关示例源码
### Browser 模块：用户上下文与客户端窗口
examples/25_browser_user_context.py
Browser 模块最完整的 user context 与 client window 说明案例。
GitHub 仓库 [查看仓库源码](https://github.com/LoseNine/ruyipage/blob/main/examples/25_browser_user_context.py) page.browser_tools.get_user_contextspage.browser_tools.create_user_contextpage.browser_tools.remove_user_contextpage.browser_tools.create_tabpage.browser_tools.get_client_windowspage.browser_tools.set_window_state
  * 读取 user context 列表
  * 创建与删除 user context
  * 在指定 user context 中创建新 tab
  * 读取 client window 列表
  * 切换窗口状态为 minimized / maximized / fullscreen


源码文件：`app/content/ruyipage_examples/25_browser_user_context.py` · 仓库：[25_browser_user_context.py](https://github.com/LoseNine/ruyipage/blob/main/examples/25_browser_user_context.py)
python 注释版
注释版 原始版 自动换行 复制代码
```
#!/usr/bin/env python
# =============================
# RuyiPage 示例注释版
# 标题: Browser 模块：用户上下文与客户端窗口
# 说明: Browser 模块最完整的 user context 与 client window 说明案例。
# 你会学到:
#   1. 读取 user context 列表
#   2. 创建与删除 user context
#   3. 在指定 user context 中创建新 tab
#   4. 读取 client window 列表
#   5. 切换窗口状态为 minimized / maximized / fullscreen
# 相关 API: page.browser_tools.get_user_contexts, page.browser_tools.create_user_context, page.browser_tools.remove_user_context, page.browser_tools.create_tab, page.browser_tools.get_client_windows, page.browser_tools.set_window_state
# =============================

# -*- coding: utf-8 -*-
"""示例25: Browser 模块（用户上下文 + 客户端窗口）严格结果版"""

import io
import sys
import time
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
    print("测试 25: Browser 用户上下文与窗口管理")
    print("=" * 70)

    page = FirefoxPage()
    results: List[Dict[str, str]] = []
    user_context_id = None
    new_tab_ctx = None

    try:
        page.get("https://www.example.com")

        # 1. user context 生命周期
        before = page.browser_tools.get_user_contexts()
        before_ids = [i.get("userContext") for i in before]
        add_result(
            results,
            "browser.getUserContexts before",
            "成功",
            f"创建前数量: {len(before)}",
        )

        user_context_id = page.browser_tools.create_user_context()
        if user_context_id:
            add_result(
                results,
                "browser.createUserContext",
                "成功",
                f"userContext={user_context_id}",
            )
        else:
            add_result(
                results, "browser.createUserContext", "失败", "未返回 userContext ID"
            )

        after_create = page.browser_tools.get_user_contexts()
        after_create_ids = [i.get("userContext") for i in after_create]
        if user_context_id in after_create_ids and len(after_create) == len(before) + 1:
            add_result(
                results,
                "browser.getUserContexts after create",
                "成功",
                f"数量变为 {len(after_create)}",
            )
        else:
            add_result(
                results,
                "browser.getUserContexts after create",
                "失败",
                "创建后数量或ID校验不通过",
            )

        if user_context_id:
            new_tab_ctx = page.browser_tools.create_tab(user_context=user_context_id)
            if new_tab_ctx:
                add_result(
                    results,
                    "browsingContext.create tab in user context",
                    "成功",
                    f"context={new_tab_ctx}",
                )
            else:
                add_result(
                    results,
                    "browsingContext.create tab in user context",
                    "失败",
                    "未返回新 tab context",
                )

        if new_tab_ctx:
            try:
                page.contexts.close(new_tab_ctx)
                add_result(
                    results, "browsingContext.close new tab", "成功", "新 tab 已关闭"
                )
                new_tab_ctx = None
            except Exception as e:
                add_result(
                    results, "browsingContext.close new tab", "跳过", str(e)[:120]
                )

        if user_context_id:
            page.browser_tools.remove_user_context(user_context_id)
            add_result(
                results,
                "browser.removeUserContext",
                "成功",
                f"已删除 {user_context_id}",
            )

            after_remove = page.browser_tools.get_user_contexts()
            after_remove_ids = [i.get("userContext") for i in after_remove]
            if user_context_id not in after_remove_ids and len(after_remove) == len(
                before_ids
            ):
                add_result(
                    results,
                    "browser.getUserContexts after remove",
                    "成功",
                    f"数量回到 {len(after_remove)}",
                )
            else:
                add_result(
                    results,
                    "browser.getUserContexts after remove",
                    "失败",
                    "删除后数量或ID校验不通过",
                )
            user_context_id = None

        # 2. client window 状态流
        windows = page.browser_tools.get_client_windows()
        if not windows:
            add_result(
                results, "browser.getClientWindows", "失败", "未返回任何 client window"
            )
        else:
            add_result(
                results, "browser.getClientWindows", "成功", f"窗口数量: {len(windows)}"
            )
            win = windows[0]
            win_id = win.get("clientWindow")
            states = ["minimized", "normal", "maximized", "fullscreen", "normal"]
            state_notes = []
            state_failed = False
            for state in states:
                page.browser_tools.set_window_state(win_id, state=state)
                time.sleep(0.4)
                current_windows = page.browser_tools.get_client_windows()
                current = current_windows[0] if current_windows else {}
                current_state = current.get("state")
                state_notes.append(f"{state}->{current_state}")
                if current_state != state:
                    state_failed = True

            if state_failed:
                add_result(
                    results,
                    "browser.setClientWindowState",
                    "失败",
                    ", ".join(state_notes),
                )
            else:
                add_result(
                    results,
                    "browser.setClientWindowState",
                    "成功",
                    ", ".join(state_notes),
                )

        print_results(results)

    except Exception as e:
        add_result(results, "示例执行", "失败", str(e)[:120])
        print_results(results)
        raise
    finally:
        if new_tab_ctx:
            try:
                page.contexts.close(new_tab_ctx)
            except Exception:
                pass
        if user_context_id:
            try:
                page.browser_tools.remove_user_context(user_context_id)
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
"""示例25: Browser 模块（用户上下文 + 客户端窗口）严格结果版"""

import io
import sys
import time
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
    print("测试 25: Browser 用户上下文与窗口管理")
    print("=" * 70)

    page = FirefoxPage()
    results: List[Dict[str, str]] = []
    user_context_id = None
    new_tab_ctx = None

    try:
        page.get("https://www.example.com")

        # 1. user context 生命周期
        before = page.browser_tools.get_user_contexts()
        before_ids = [i.get("userContext") for i in before]
        add_result(
            results,
            "browser.getUserContexts before",
            "成功",
            f"创建前数量: {len(before)}",
        )

        user_context_id = page.browser_tools.create_user_context()
        if user_context_id:
            add_result(
                results,
                "browser.createUserContext",
                "成功",
                f"userContext={user_context_id}",
            )
        else:
            add_result(
                results, "browser.createUserContext", "失败", "未返回 userContext ID"
            )

        after_create = page.browser_tools.get_user_contexts()
        after_create_ids = [i.get("userContext") for i in after_create]
        if user_context_id in after_create_ids and len(after_create) == len(before) + 1:
            add_result(
                results,
                "browser.getUserContexts after create",
                "成功",
                f"数量变为 {len(after_create)}",
            )
        else:
            add_result(
                results,
                "browser.getUserContexts after create",
                "失败",
                "创建后数量或ID校验不通过",
            )

        if user_context_id:
            new_tab_ctx = page.browser_tools.create_tab(user_context=user_context_id)
            if new_tab_ctx:
                add_result(
                    results,
                    "browsingContext.create tab in user context",
                    "成功",
                    f"context={new_tab_ctx}",
                )
            else:
                add_result(
                    results,
                    "browsingContext.create tab in user context",
                    "失败",
                    "未返回新 tab context",
                )

        if new_tab_ctx:
            try:
                page.contexts.close(new_tab_ctx)
                add_result(
                    results, "browsingContext.close new tab", "成功", "新 tab 已关闭"
                )
                new_tab_ctx = None
            except Exception as e:
                add_result(
                    results, "browsingContext.close new tab", "跳过", str(e)[:120]
                )

        if user_context_id:
            page.browser_tools.remove_user_context(user_context_id)
            add_result(
                results,
                "browser.removeUserContext",
                "成功",
                f"已删除 {user_context_id}",
            )

            after_remove = page.browser_tools.get_user_contexts()
            after_remove_ids = [i.get("userContext") for i in after_remove]
            if user_context_id not in after_remove_ids and len(after_remove) == len(
                before_ids
            ):
                add_result(
                    results,
                    "browser.getUserContexts after remove",
                    "成功",
                    f"数量回到 {len(after_remove)}",
                )
            else:
                add_result(
                    results,
                    "browser.getUserContexts after remove",
                    "失败",
                    "删除后数量或ID校验不通过",
                )
            user_context_id = None

        # 2. client window 状态流
        windows = page.browser_tools.get_client_windows()
        if not windows:
            add_result(
                results, "browser.getClientWindows", "失败", "未返回任何 client window"
            )
        else:
            add_result(
                results, "browser.getClientWindows", "成功", f"窗口数量: {len(windows)}"
            )
            win = windows[0]
            win_id = win.get("clientWindow")
            states = ["minimized", "normal", "maximized", "fullscreen", "normal"]
            state_notes = []
            state_failed = False
            for state in states:
                page.browser_tools.set_window_state(win_id, state=state)
                time.sleep(0.4)
                current_windows = page.browser_tools.get_client_windows()
                current = current_windows[0] if current_windows else {}
                current_state = current.get("state")
                state_notes.append(f"{state}->{current_state}")
                if current_state != state:
                    state_failed = True

            if state_failed:
                add_result(
                    results,
                    "browser.setClientWindowState",
                    "失败",
                    ", ".join(state_notes),
                )
            else:
                add_result(
                    results,
                    "browser.setClientWindowState",
                    "成功",
                    ", ".join(state_notes),
                )

        print_results(results)

    except Exception as e:
        add_result(results, "示例执行", "失败", str(e)[:120])
        print_results(results)
        raise
    finally:
        if new_tab_ctx:
            try:
                page.contexts.close(new_tab_ctx)
            except Exception:
                pass
        if user_context_id:
            try:
                page.browser_tools.remove_user_context(user_context_id)
            except Exception:
                pass
        try:
            page.quit()
        except Exception:
            pass


if __name__ == "__main__":
    main()

```

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

### 标签页管理：新建、切换、查找、关闭、后台激活
examples/09_tabs.py
展示 tab 作为日常页面操作的重要组织单位。
GitHub 仓库 [查看仓库源码](https://github.com/LoseNine/ruyipage/blob/main/examples/09_tabs.py) page.new_tabpage.tabs_countpage.tab_idspage.get_tabpage.get_tabspage.latest_tabpage.close_other_tabspage.browser.activate_tab
  * 新建标签页并加载地址
  * 通过标题、索引等方式查找 tab
  * 获取所有标签页 ID
  * 激活后台标签页
  * 关闭单个标签或保留当前标签关闭其他标签
  * 观察 browsing context 树结构


源码文件：`app/content/ruyipage_examples/09_tabs.py` · 仓库：[09_tabs.py](https://github.com/LoseNine/ruyipage/blob/main/examples/09_tabs.py)
python 注释版
注释版 原始版 自动换行 复制代码
```
# =============================
# RuyiPage 示例注释版
# 标题: 标签页管理：新建、切换、查找、关闭、后台激活
# 说明: 展示 tab 作为日常页面操作的重要组织单位。
# 你会学到:
#   1. 新建标签页并加载地址
#   2. 通过标题、索引等方式查找 tab
#   3. 获取所有标签页 ID
#   4. 激活后台标签页
#   5. 关闭单个标签或保留当前标签关闭其他标签
# 相关 API: page.new_tab, page.tabs_count, page.tab_ids, page.get_tab, page.get_tabs, page.latest_tab, page.close_other_tabs, page.browser.activate_tab
# =============================

# -*- coding: utf-8 -*-
"""
示例9: 标签页管理
测试功能：
- 新建标签页
- 切换标签页
- 关闭标签页
- 获取标签页列表
- 标签页操作
"""

import os
import sys
import io

# 设置控制台输出编码为UTF-8（Windows兼容）
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from ruyipage import FirefoxPage, FirefoxOptions


def test_tabs():
    """测试标签页管理功能"""
    print("=" * 60)
    print("测试9: 标签页管理")
    print("=" * 60)

    opts = FirefoxOptions()
    opts.headless(False)
    page = FirefoxPage(opts)

    try:
        # 加载测试页面
        test_page = os.path.join(
            os.path.dirname(__file__), "test_pages", "test_page.html"
        )
        test_url = "file:///" + os.path.abspath(test_page).replace("\\", "/")
        page.get(test_url)
        page.wait(1)

        # 1. 获取当前标签页数量
        print("\n1. 获取当前标签页数量:")
        print(f"   标签页数量: {page.tabs_count}")

        tab2_url = "data:text/html,<html><head><title>Example Tab</title></head><body>tab2</body></html>"
        tab3_url = "data:text/html,<html><head><title>Wikipedia Tab</title></head><body>tab3</body></html>"

        # 2. 新建标签页
        print("\n2. 新建标签页:")
        tab2 = page.new_tab(tab2_url)
        page.wait(2)
        print(f"   ✓ 新标签页已创建")
        print(f"   新标签页标题: {tab2.title}")
        print(f"   当前标签页数量: {page.tabs_count}")

        # 3. 再新建一个标签页
        print("\n3. 再新建一个标签页:")
        tab3 = page.new_tab(tab3_url)
        page.wait(2)
        print(f"   ✓ 第三个标签页已创建")
        print(f"   标签页标题: {tab3.title}")
        print(f"   当前标签页数量: {page.tabs_count}")

        # 4. 获取所有标签页ID
        print("\n4. 获取所有标签页ID:")
        tab_ids = page.tab_ids
        print(f"   标签页ID列表: {tab_ids}")

        print("   当前页面 tab_id: {}".format(page.tab_id))

        # 5. 通过序号获取标签页
        print("\n5. 通过序号获取标签页:")
        first_tab = page.get_tab(1)
        print(f"   第1个标签页标题: {first_tab.title}")

        second_tab = page.get_tab(2)
        print(f"   第2个标签页标题: {second_tab.title}")

        # 6. 切换到第一个标签页
        print("\n6. 切换到第一个标签页:")
        first_tab.get(test_url)
        page.wait(1)
        print(f"   当前标题: {first_tab.title}")

        # 7. 获取最新的标签页
        print("\n7. 获取最新的标签页:")
        latest = page.latest_tab
        print(f"   最新标签页标题: {latest.title}")

        # 8. 通过标题查找标签页
        print("\n8. 通过标题查找标签页:")
        example_tab = page.get_tab(title="Example")
        if example_tab:
            print(f"   找到标签页: {example_tab.title}")
        else:
            print(f"   未找到包含'Example'的标签页")

        # 9. 通过URL查找标签页
        print("\n9. 通过URL查找标签页:")
        wiki_tab = page.get_tab(title="Wikipedia")
        if wiki_tab:
            print(f"   找到标签页: {wiki_tab.title}")
        else:
            print(f"   未找到包含'wikipedia'的标签页")

        # 10. 获取所有匹配的标签页
        print("\n10. 获取所有标签页:")
        all_tabs = page.get_tabs()
        print(f"   共有 {len(all_tabs)} 个标签页")
        for i, tab in enumerate(all_tabs, 1):
            print(f"   标签页{i}: {tab.title[:50]}")

        # 10.1 获取窗口句柄信息
        print("\n10.1 获取客户端窗口信息:")
        window_handles = page.browser.window_handles
        print(f"   clientWindows 数量: {len(window_handles)}")
        if window_handles:
            first_window = window_handles[0]
            print(f"   首个窗口状态: {first_window.get('state')}")

        # 10.2 读取 browsing context 树
        print("\n10.2 获取 browsing context 树:")
        tree = page.contexts.get_tree()
        contexts = tree.contexts
        print(f"   顶层 context 数量: {len(contexts)}")
        if contexts:
            print(f"   第一个 context: {contexts[0].context}")

        # 11. 关闭一个标签页
        print("\n11. 关闭第二个标签页:")
        second_tab.close()
        page.wait(1)
        print(f"   ✓ 标签页已关闭")
        print(f"   剩余标签页数量: {page.tabs_count}")

        # 12. 关闭其他标签页（保留第一个）
        print("\n12. 关闭其他标签页:")
        page.close_other_tabs(first_tab)
        page.wait(1)
        print(f"   ✓ 其他标签页已关闭")
        print(f"   剩余标签页数量: {page.tabs_count}")

        # 13. 新建后台标签页
        print("\n13. 新建后台标签页:")
        bg_tab = page.new_tab(tab2_url, background=True)
        page.wait(1)
        print(f"   ✓ 后台标签页已创建")
        print(f"   当前标签页数量: {page.tabs_count}")

        # 14. 激活标签页
        print("\n14. 激活后台标签页:")
        page.browser.activate_tab(bg_tab)
        page.wait(1)
        print(f"   ✓ 标签页已激活")

        # 15. 通过高层 context API 创建后台标签页
        print("\n15. 通过高层context API创建后台标签页:")
        bidi_tab_id = page.contexts.create_tab(
            background=True,
            reference_context=page.tab_id,
        )
        page.wait(1)
        print(f"   高层新标签页ID: {bidi_tab_id}")
        print(f"   当前标签页数量: {page.tabs_count}")

        # 清理纯 BiDi 新建的标签页，避免影响退出顺序
        bidi_tab = page.get_tab(bidi_tab_id)
        if bidi_tab:
            bidi_tab.close()
            page.wait(1)
            print("   ✓ 纯BiDi标签页已关闭")

        print("\n" + "=" * 60)
        print("✓ 所有标签页管理测试通过！")
        print("=" * 60)

    except Exception as e:
        print(f"\n✗ 测试失败: {e}")
        import traceback

        traceback.print_exc()
    finally:
        page.wait(2)
        page.quit()


if __name__ == "__main__":
    test_tabs()

```

```
# -*- coding: utf-8 -*-
"""
示例9: 标签页管理
测试功能：
- 新建标签页
- 切换标签页
- 关闭标签页
- 获取标签页列表
- 标签页操作
"""

import os
import sys
import io

# 设置控制台输出编码为UTF-8（Windows兼容）
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from ruyipage import FirefoxPage, FirefoxOptions


def test_tabs():
    """测试标签页管理功能"""
    print("=" * 60)
    print("测试9: 标签页管理")
    print("=" * 60)

    opts = FirefoxOptions()
    opts.headless(False)
    page = FirefoxPage(opts)

    try:
        # 加载测试页面
        test_page = os.path.join(
            os.path.dirname(__file__), "test_pages", "test_page.html"
        )
        test_url = "file:///" + os.path.abspath(test_page).replace("\\", "/")
        page.get(test_url)
        page.wait(1)

        # 1. 获取当前标签页数量
        print("\n1. 获取当前标签页数量:")
        print(f"   标签页数量: {page.tabs_count}")

        tab2_url = "data:text/html,<html><head><title>Example Tab</title></head><body>tab2</body></html>"
        tab3_url = "data:text/html,<html><head><title>Wikipedia Tab</title></head><body>tab3</body></html>"

        # 2. 新建标签页
        print("\n2. 新建标签页:")
        tab2 = page.new_tab(tab2_url)
        page.wait(2)
        print(f"   ✓ 新标签页已创建")
        print(f"   新标签页标题: {tab2.title}")
        print(f"   当前标签页数量: {page.tabs_count}")

        # 3. 再新建一个标签页
        print("\n3. 再新建一个标签页:")
        tab3 = page.new_tab(tab3_url)
        page.wait(2)
        print(f"   ✓ 第三个标签页已创建")
        print(f"   标签页标题: {tab3.title}")
        print(f"   当前标签页数量: {page.tabs_count}")

        # 4. 获取所有标签页ID
        print("\n4. 获取所有标签页ID:")
        tab_ids = page.tab_ids
        print(f"   标签页ID列表: {tab_ids}")

        print("   当前页面 tab_id: {}".format(page.tab_id))

        # 5. 通过序号获取标签页
        print("\n5. 通过序号获取标签页:")
        first_tab = page.get_tab(1)
        print(f"   第1个标签页标题: {first_tab.title}")

        second_tab = page.get_tab(2)
        print(f"   第2个标签页标题: {second_tab.title}")

        # 6. 切换到第一个标签页
        print("\n6. 切换到第一个标签页:")
        first_tab.get(test_url)
        page.wait(1)
        print(f"   当前标题: {first_tab.title}")

        # 7. 获取最新的标签页
        print("\n7. 获取最新的标签页:")
        latest = page.latest_tab
        print(f"   最新标签页标题: {latest.title}")

        # 8. 通过标题查找标签页
        print("\n8. 通过标题查找标签页:")
        example_tab = page.get_tab(title="Example")
        if example_tab:
            print(f"   找到标签页: {example_tab.title}")
        else:
            print(f"   未找到包含'Example'的标签页")

        # 9. 通过URL查找标签页
        print("\n9. 通过URL查找标签页:")
        wiki_tab = page.get_tab(title="Wikipedia")
        if wiki_tab:
            print(f"   找到标签页: {wiki_tab.title}")
        else:
            print(f"   未找到包含'wikipedia'的标签页")

        # 10. 获取所有匹配的标签页
        print("\n10. 获取所有标签页:")
        all_tabs = page.get_tabs()
        print(f"   共有 {len(all_tabs)} 个标签页")
        for i, tab in enumerate(all_tabs, 1):
            print(f"   标签页{i}: {tab.title[:50]}")

        # 10.1 获取窗口句柄信息
        print("\n10.1 获取客户端窗口信息:")
        window_handles = page.browser.window_handles
        print(f"   clientWindows 数量: {len(window_handles)}")
        if window_handles:
            first_window = window_handles[0]
            print(f"   首个窗口状态: {first_window.get('state')}")

        # 10.2 读取 browsing context 树
        print("\n10.2 获取 browsing context 树:")
        tree = page.contexts.get_tree()
        contexts = tree.contexts
        print(f"   顶层 context 数量: {len(contexts)}")
        if contexts:
            print(f"   第一个 context: {contexts[0].context}")

        # 11. 关闭一个标签页
        print("\n11. 关闭第二个标签页:")
        second_tab.close()
        page.wait(1)
        print(f"   ✓ 标签页已关闭")
        print(f"   剩余标签页数量: {page.tabs_count}")

        # 12. 关闭其他标签页（保留第一个）
        print("\n12. 关闭其他标签页:")
        page.close_other_tabs(first_tab)
        page.wait(1)
        print(f"   ✓ 其他标签页已关闭")
        print(f"   剩余标签页数量: {page.tabs_count}")

        # 13. 新建后台标签页
        print("\n13. 新建后台标签页:")
        bg_tab = page.new_tab(tab2_url, background=True)
        page.wait(1)
        print(f"   ✓ 后台标签页已创建")
        print(f"   当前标签页数量: {page.tabs_count}")

        # 14. 激活标签页
        print("\n14. 激活后台标签页:")
        page.browser.activate_tab(bg_tab)
        page.wait(1)
        print(f"   ✓ 标签页已激活")

        # 15. 通过高层 context API 创建后台标签页
        print("\n15. 通过高层context API创建后台标签页:")
        bidi_tab_id = page.contexts.create_tab(
            background=True,
            reference_context=page.tab_id,
        )
        page.wait(1)
        print(f"   高层新标签页ID: {bidi_tab_id}")
        print(f"   当前标签页数量: {page.tabs_count}")

        # 清理纯 BiDi 新建的标签页，避免影响退出顺序
        bidi_tab = page.get_tab(bidi_tab_id)
        if bidi_tab:
            bidi_tab.close()
            page.wait(1)
            print("   ✓ 纯BiDi标签页已关闭")

        print("\n" + "=" * 60)
        print("✓ 所有标签页管理测试通过！")
        print("=" * 60)

    except Exception as e:
        print(f"\n✗ 测试失败: {e}")
        import traceback

        traceback.print_exc()
    finally:
        page.wait(2)
        page.quit()


if __name__ == "__main__":
    test_tabs()

```
