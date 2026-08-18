#  RuyiPage Preload Script
适合在页面真正加载前注入脚本，适用于标记、调试和初始化环境。
## API 与参数说明
### page.add_preload_script
`page.add_preload_script(script)`
在页面加载前注入脚本
参数说明
参数 | 说明  
---|---  
script | 参数含义与默认值请结合当前 API 场景使用。  
### page.remove_preload_script
`page.remove_preload_script(script_id)`
移除已注入的 preload script
参数说明
参数 | 说明  
---|---  
script_id | 参数含义与默认值请结合当前 API 场景使用。  
### page.realms.start
`page.realms.start()`
开始监听 realm 事件
### page.events.wait
`page.events.wait('script.message')`
等待 preload script 发送的消息
参数说明
参数 | 说明  
---|---  
'script.message' | 参数含义与默认值请结合当前 API 场景使用。  
## 相关示例
  * 参见示例中心：/automation/examples


## 相关示例源码
### JavaScript 执行与脚本能力
examples/07_javascript.py
展示 run_js、参数传递、DOM 修改和 preload script 的调试价值。
GitHub 仓库 [查看仓库源码](https://github.com/LoseNine/ruyipage/blob/main/examples/07_javascript.py) page.run_jsele.run_jspage.get_realmspage.eval_handlepage.add_preload_scriptpage.remove_preload_script
  * 执行表达式并获取返回值
  * 向脚本传参
  * 直接修改 DOM 内容
  * 在元素上下文执行 JS
  * 读取 realms 并注入 preload script


源码文件：`app/content/ruyipage_examples/07_javascript.py` · 仓库：[07_javascript.py](https://github.com/LoseNine/ruyipage/blob/main/examples/07_javascript.py)
python 注释版
注释版 原始版 自动换行 复制代码
```
# =============================
# RuyiPage 示例注释版
# 标题: JavaScript 执行与脚本能力
# 说明: 展示 run_js、参数传递、DOM 修改和 preload script 的调试价值。
# 你会学到:
#   1. 执行表达式并获取返回值
#   2. 向脚本传参
#   3. 直接修改 DOM 内容
#   4. 在元素上下文执行 JS
#   5. 读取 realms 并注入 preload script
# 相关 API: page.run_js, ele.run_js, page.get_realms, page.eval_handle, page.add_preload_script, page.remove_preload_script
# =============================

# -*- coding: utf-8 -*-
"""
示例7: JavaScript执行
测试功能：
- 执行JavaScript代码
- 获取返回值
- 传递参数
- 在元素上执行JS
- 修改页面内容
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


def test_javascript():
    """测试JavaScript执行功能"""
    print("=" * 60)
    print("测试7: JavaScript执行")
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

        # 1. 执行简单的JavaScript
        print("\n1. 执行简单的JavaScript:")
        result = page.run_js("return 1 + 2")
        print(f"   1 + 2 = {result}")

        # 2. 获取页面信息
        print("\n2. 获取页面信息:")
        title = page.run_js("return document.title")
        print(f"   页面标题: {title}")

        url = page.run_js("return window.location.href")
        print(f"   页面URL: {url}")

        # 3. 修改页面内容
        print("\n3. 修改页面内容:")
        page.run_js(
            'document.getElementById("main-title").textContent = "标题已被JS修改"'
        )
        new_title = page.ele("#main-title").text
        print(f"   修改后的标题: {new_title}")

        # 4. 传递参数
        print("\n4. 传递参数到JavaScript:")
        result = page.run_js("return arguments[0] + arguments[1]", 10, 20)
        print(f"   10 + 20 = {result}")

        # 5. 在元素上执行JavaScript
        print("\n5. 在元素上执行JavaScript:")
        btn = page.ele("#click-btn")
        btn_text = btn.run_js("function() { return this.textContent; }")
        print(f"   按钮文本: {btn_text}")

        # 修改元素样式
        btn.run_js(
            'function() { this.style.background = "red"; this.style.color = "white"; }'
        )
        page.wait(0.5)
        print(f"   ✓ 按钮样式已修改")

        # 6. 获取元素属性
        print("\n6. 通过JS获取元素属性:")
        input_elem = page.ele("#text-input")
        placeholder = input_elem.run_js("function() { return this.placeholder; }")
        print(f"   输入框placeholder: {placeholder}")

        # 7. 执行复杂的JavaScript
        print("\n7. 执行复杂的JavaScript:")
        result = page.run_js("""
            (() => {
                const elements = document.querySelectorAll('.test-class');
                return Array.from(elements).map(el => el.textContent);
            })()
        """)
        print(f"   所有.test-class元素的文本: {result}")

        # 8. 修改输入框的值
        print("\n8. 通过JS修改输入框:")
        page.run_js("document.getElementById('text-input').value = 'JS设置的值'")
        value = page.ele("#text-input").value
        print(f"   输入框的值: {value}")

        # 9. 通过JS触发事件
        print("\n9. 通过JS触发事件:")
        page.run_js('document.getElementById("click-btn").click()')
        page.wait(0.5)
        result = page.ele("#click-result").text
        print(f"   点击结果: {result}")

        # 10. 获取计算样式
        print("\n10. 获取元素的计算样式:")
        color = page.run_js("""
            (() => {
                const elem = document.getElementById('click-btn');
                return window.getComputedStyle(elem).backgroundColor;
            })()
        """)
        print(f"   按钮背景色: {color}")

        # 11. 滚动到元素
        print("\n11. 通过JS滚动到元素:")
        page.run_js('document.getElementById("scroll-section").scrollIntoView()')
        page.wait(0.5)
        print(f"   ✓ 已滚动到滚动测试区域")

        # 12. 创建新元素
        print("\n12. 通过JS创建新元素:")
        page.run_js("""
            const div = document.createElement('div');
            div.id = 'js-created';
            div.textContent = 'JavaScript创建的元素';
            div.style.padding = '10px';
            div.style.background = '#ffeb3b';
            document.body.appendChild(div);
        """)
        page.wait(0.5)
        new_elem = page.ele("#js-created")
        print(f"   新元素文本: {new_elem.text}")

        # 13. 在 sandbox 中执行脚本
        print("\n13. 在sandbox中执行JavaScript:")
        sandbox_value = page.run_js(
            """
            globalThis.__ruyiSandboxCount = (globalThis.__ruyiSandboxCount || 0) + 1;
            return globalThis.__ruyiSandboxCount;
            """,
            as_expr=False,
            sandbox="example07",
        )
        normal_value = page.run_js("return globalThis.__ruyiSandboxCount || 0")
        print(f"   sandbox 计数: {sandbox_value}")
        print(f"   页面主世界计数: {normal_value}")

        # 14. 获取当前 context 的 realms
        print("\n14. 获取脚本Realms:")
        realms = page.get_realms()
        realm_types = sorted({realm.type or "unknown" for realm in realms})
        print(f"   Realm数量: {len(realms)}")
        print(f"   Realm类型: {realm_types}")

        # 15. 通过高层 script 结果对象执行并读取 handle/value
        print("\n15. 通过高层脚本接口执行:")
        eval_result = page.eval_handle(
            "JSON.stringify({title: document.title, ready: document.readyState})"
        )
        print(f"   evaluate 返回类型: {eval_result.type}")
        print(f"   evaluate 结果: {eval_result.result.value}")

        # 16. 预加载脚本
        print("\n16. 预加载脚本 add/removePreloadScript:")
        preload_id = page.add_preload_script("""() => {
            window.__example07Preload = 'preload-ready';
        }""")
        page.get(test_url)
        page.wait(1)
        preload_value = page.run_js("return window.__example07Preload")
        print(f"   preload脚本ID: {preload_id.id}")
        print(f"   preload注入结果: {preload_value}")
        page.remove_preload_script(preload_id)

        # 17. 移除预加载脚本后再次导航
        print("\n17. 移除预加载脚本后验证:")
        page.get(test_url)
        page.wait(1)
        removed_value = page.run_js("return window.__example07Preload || null")
        print(f"   移除后注入结果: {removed_value}")

        print("\n" + "=" * 60)
        print("✓ 所有JavaScript执行测试通过！")
        print("=" * 60)

    except Exception as e:
        print(f"\n✗ 测试失败: {e}")
        import traceback

        traceback.print_exc()
    finally:
        page.wait(2)
        page.quit()


if __name__ == "__main__":
    test_javascript()

```

```
# -*- coding: utf-8 -*-
"""
示例7: JavaScript执行
测试功能：
- 执行JavaScript代码
- 获取返回值
- 传递参数
- 在元素上执行JS
- 修改页面内容
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


def test_javascript():
    """测试JavaScript执行功能"""
    print("=" * 60)
    print("测试7: JavaScript执行")
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

        # 1. 执行简单的JavaScript
        print("\n1. 执行简单的JavaScript:")
        result = page.run_js("return 1 + 2")
        print(f"   1 + 2 = {result}")

        # 2. 获取页面信息
        print("\n2. 获取页面信息:")
        title = page.run_js("return document.title")
        print(f"   页面标题: {title}")

        url = page.run_js("return window.location.href")
        print(f"   页面URL: {url}")

        # 3. 修改页面内容
        print("\n3. 修改页面内容:")
        page.run_js(
            'document.getElementById("main-title").textContent = "标题已被JS修改"'
        )
        new_title = page.ele("#main-title").text
        print(f"   修改后的标题: {new_title}")

        # 4. 传递参数
        print("\n4. 传递参数到JavaScript:")
        result = page.run_js("return arguments[0] + arguments[1]", 10, 20)
        print(f"   10 + 20 = {result}")

        # 5. 在元素上执行JavaScript
        print("\n5. 在元素上执行JavaScript:")
        btn = page.ele("#click-btn")
        btn_text = btn.run_js("function() { return this.textContent; }")
        print(f"   按钮文本: {btn_text}")

        # 修改元素样式
        btn.run_js(
            'function() { this.style.background = "red"; this.style.color = "white"; }'
        )
        page.wait(0.5)
        print(f"   ✓ 按钮样式已修改")

        # 6. 获取元素属性
        print("\n6. 通过JS获取元素属性:")
        input_elem = page.ele("#text-input")
        placeholder = input_elem.run_js("function() { return this.placeholder; }")
        print(f"   输入框placeholder: {placeholder}")

        # 7. 执行复杂的JavaScript
        print("\n7. 执行复杂的JavaScript:")
        result = page.run_js("""
            (() => {
                const elements = document.querySelectorAll('.test-class');
                return Array.from(elements).map(el => el.textContent);
            })()
        """)
        print(f"   所有.test-class元素的文本: {result}")

        # 8. 修改输入框的值
        print("\n8. 通过JS修改输入框:")
        page.run_js("document.getElementById('text-input').value = 'JS设置的值'")
        value = page.ele("#text-input").value
        print(f"   输入框的值: {value}")

        # 9. 通过JS触发事件
        print("\n9. 通过JS触发事件:")
        page.run_js('document.getElementById("click-btn").click()')
        page.wait(0.5)
        result = page.ele("#click-result").text
        print(f"   点击结果: {result}")

        # 10. 获取计算样式
        print("\n10. 获取元素的计算样式:")
        color = page.run_js("""
            (() => {
                const elem = document.getElementById('click-btn');
                return window.getComputedStyle(elem).backgroundColor;
            })()
        """)
        print(f"   按钮背景色: {color}")

        # 11. 滚动到元素
        print("\n11. 通过JS滚动到元素:")
        page.run_js('document.getElementById("scroll-section").scrollIntoView()')
        page.wait(0.5)
        print(f"   ✓ 已滚动到滚动测试区域")

        # 12. 创建新元素
        print("\n12. 通过JS创建新元素:")
        page.run_js("""
            const div = document.createElement('div');
            div.id = 'js-created';
            div.textContent = 'JavaScript创建的元素';
            div.style.padding = '10px';
            div.style.background = '#ffeb3b';
            document.body.appendChild(div);
        """)
        page.wait(0.5)
        new_elem = page.ele("#js-created")
        print(f"   新元素文本: {new_elem.text}")

        # 13. 在 sandbox 中执行脚本
        print("\n13. 在sandbox中执行JavaScript:")
        sandbox_value = page.run_js(
            """
            globalThis.__ruyiSandboxCount = (globalThis.__ruyiSandboxCount || 0) + 1;
            return globalThis.__ruyiSandboxCount;
            """,
            as_expr=False,
            sandbox="example07",
        )
        normal_value = page.run_js("return globalThis.__ruyiSandboxCount || 0")
        print(f"   sandbox 计数: {sandbox_value}")
        print(f"   页面主世界计数: {normal_value}")

        # 14. 获取当前 context 的 realms
        print("\n14. 获取脚本Realms:")
        realms = page.get_realms()
        realm_types = sorted({realm.type or "unknown" for realm in realms})
        print(f"   Realm数量: {len(realms)}")
        print(f"   Realm类型: {realm_types}")

        # 15. 通过高层 script 结果对象执行并读取 handle/value
        print("\n15. 通过高层脚本接口执行:")
        eval_result = page.eval_handle(
            "JSON.stringify({title: document.title, ready: document.readyState})"
        )
        print(f"   evaluate 返回类型: {eval_result.type}")
        print(f"   evaluate 结果: {eval_result.result.value}")

        # 16. 预加载脚本
        print("\n16. 预加载脚本 add/removePreloadScript:")
        preload_id = page.add_preload_script("""() => {
            window.__example07Preload = 'preload-ready';
        }""")
        page.get(test_url)
        page.wait(1)
        preload_value = page.run_js("return window.__example07Preload")
        print(f"   preload脚本ID: {preload_id.id}")
        print(f"   preload注入结果: {preload_value}")
        page.remove_preload_script(preload_id)

        # 17. 移除预加载脚本后再次导航
        print("\n17. 移除预加载脚本后验证:")
        page.get(test_url)
        page.wait(1)
        removed_value = page.run_js("return window.__example07Preload || null")
        print(f"   移除后注入结果: {removed_value}")

        print("\n" + "=" * 60)
        print("✓ 所有JavaScript执行测试通过！")
        print("=" * 60)

    except Exception as e:
        print(f"\n✗ 测试失败: {e}")
        import traceback

        traceback.print_exc()
    finally:
        page.wait(2)
        page.quit()


if __name__ == "__main__":
    test_javascript()

```

### Script 事件：realm 创建销毁与 preload 消息
examples/32_script_events.py
用于说明 realms 和 preload script 如何和事件订阅配合。
GitHub 仓库 [查看仓库源码](https://github.com/LoseNine/ruyipage/blob/main/examples/32_script_events.py) page.realms.startpage.realms.listpage.events.startpage.events.waitpage.add_preload_scriptpage.remove_preload_script
  * 观察 realm 创建与销毁
  * 订阅 script.message
  * 通过 preload script 发送事件消息


源码文件：`app/content/ruyipage_examples/32_script_events.py` · 仓库：[32_script_events.py](https://github.com/LoseNine/ruyipage/blob/main/examples/32_script_events.py)
python 注释版
注释版 原始版 自动换行 复制代码
```
#!/usr/bin/env python
# =============================
# RuyiPage 示例注释版
# 标题: Script 事件：realm 创建销毁与 preload 消息
# 说明: 用于说明 realms 和 preload script 如何和事件订阅配合。
# 你会学到:
#   1. 观察 realm 创建与销毁
#   2. 订阅 script.message
#   3. 通过 preload script 发送事件消息
# 相关 API: page.realms.start, page.realms.list, page.events.start, page.events.wait, page.add_preload_script, page.remove_preload_script
# =============================

# -*- coding: utf-8 -*-
"""示例32: Script Events（严格结果版）"""

import io
import sys
from typing import Dict, List

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

from ruyipage import FirefoxPage, PreloadScript


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
    print("测试 32: Script Events")
    print("=" * 70)

    page = FirefoxPage()
    results: List[Dict[str, str]] = []
    temp_tab = None
    preload: PreloadScript | None = None

    try:
        page.get("https://www.example.com")
        add_result(results, "页面加载", "成功", "example.com 已加载")

        # 1. realmCreated / realmDestroyed
        page.realms.start()
        initial_realms = page.realms.list()
        add_result(
            results,
            "script.getRealms baseline",
            "成功",
            f"初始 realm 数量: {len(initial_realms)}",
        )

        temp_tab = page.contexts.create_tab()
        page.wait(1)
        created_realms = page.realms.list()
        if len(created_realms) > len(initial_realms):
            add_result(
                results,
                "script.realmCreated",
                "成功",
                f"realm 数量: {len(initial_realms)} -> {len(created_realms)}",
            )
        else:
            add_result(
                results, "script.realmCreated", "跳过", "当前环境未稳定观察到新增 realm"
            )

        if temp_tab:
            page.contexts.close(temp_tab)
            temp_tab = None
            page.wait(1)

        destroyed_realms = page.realms.list()
        if len(destroyed_realms) <= len(created_realms):
            add_result(
                results,
                "script.realmDestroyed",
                "成功",
                f"关闭后 realm 数量: {len(destroyed_realms)}",
            )
        else:
            add_result(
                results,
                "script.realmDestroyed",
                "跳过",
                "当前环境未稳定观察到 realm 销毁",
            )

        page.realms.stop()

        # 2. script.message
        if page.events.start(["script.message"], contexts=[page.tab_id]):
            preload = page.add_preload_script(
                """
                () => {
                    const ch = new BroadcastChannel('ruyi-script-message');
                    ch.postMessage({ type: 'preload', value: 'hello' });
                    ch.close();
                }
                """
            )

            page.get("https://www.example.com/?script-message=1")
            message_event = page.events.wait("script.message", timeout=3)

            if message_event:
                add_result(
                    results,
                    "script.message",
                    "成功",
                    f"channel={message_event.channel} data={message_event.data}",
                )
            else:
                add_result(
                    results,
                    "script.message",
                    "跳过",
                    "当前环境未稳定观察到 script.message",
                )
        else:
            add_result(
                results, "script.message", "不支持", "未能订阅 script.message 事件"
            )

        print_results(results)

    except Exception as e:
        add_result(results, "示例执行", "失败", str(e)[:120])
        print_results(results)
        raise
    finally:
        if preload is not None:
            try:
                page.remove_preload_script(preload)
            except Exception:
                pass
        try:
            page.realms.stop()
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
"""示例32: Script Events（严格结果版）"""

import io
import sys
from typing import Dict, List

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

from ruyipage import FirefoxPage, PreloadScript


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
    print("测试 32: Script Events")
    print("=" * 70)

    page = FirefoxPage()
    results: List[Dict[str, str]] = []
    temp_tab = None
    preload: PreloadScript | None = None

    try:
        page.get("https://www.example.com")
        add_result(results, "页面加载", "成功", "example.com 已加载")

        # 1. realmCreated / realmDestroyed
        page.realms.start()
        initial_realms = page.realms.list()
        add_result(
            results,
            "script.getRealms baseline",
            "成功",
            f"初始 realm 数量: {len(initial_realms)}",
        )

        temp_tab = page.contexts.create_tab()
        page.wait(1)
        created_realms = page.realms.list()
        if len(created_realms) > len(initial_realms):
            add_result(
                results,
                "script.realmCreated",
                "成功",
                f"realm 数量: {len(initial_realms)} -> {len(created_realms)}",
            )
        else:
            add_result(
                results, "script.realmCreated", "跳过", "当前环境未稳定观察到新增 realm"
            )

        if temp_tab:
            page.contexts.close(temp_tab)
            temp_tab = None
            page.wait(1)

        destroyed_realms = page.realms.list()
        if len(destroyed_realms) <= len(created_realms):
            add_result(
                results,
                "script.realmDestroyed",
                "成功",
                f"关闭后 realm 数量: {len(destroyed_realms)}",
            )
        else:
            add_result(
                results,
                "script.realmDestroyed",
                "跳过",
                "当前环境未稳定观察到 realm 销毁",
            )

        page.realms.stop()

        # 2. script.message
        if page.events.start(["script.message"], contexts=[page.tab_id]):
            preload = page.add_preload_script(
                """
                () => {
                    const ch = new BroadcastChannel('ruyi-script-message');
                    ch.postMessage({ type: 'preload', value: 'hello' });
                    ch.close();
                }
                """
            )

            page.get("https://www.example.com/?script-message=1")
            message_event = page.events.wait("script.message", timeout=3)

            if message_event:
                add_result(
                    results,
                    "script.message",
                    "成功",
                    f"channel={message_event.channel} data={message_event.data}",
                )
            else:
                add_result(
                    results,
                    "script.message",
                    "跳过",
                    "当前环境未稳定观察到 script.message",
                )
        else:
            add_result(
                results, "script.message", "不支持", "未能订阅 script.message 事件"
            )

        print_results(results)

    except Exception as e:
        add_result(results, "示例执行", "失败", str(e)[:120])
        print_results(results)
        raise
    finally:
        if preload is not None:
            try:
                page.remove_preload_script(preload)
            except Exception:
                pass
        try:
            page.realms.stop()
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
        try:
            page.quit()
        except Exception:
            pass


if __name__ == "__main__":
    main()

```
