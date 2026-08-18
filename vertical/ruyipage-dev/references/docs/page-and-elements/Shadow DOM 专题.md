#  RuyiPage Shadow DOM 专题
重点讲 open shadow 和 closed shadow 的区别，以及 with_shadow 的使用方式。
## API 与参数说明
### ele.with_shadow
`ele.with_shadow()`
进入元素的 shadow root（open 或 closed）
### shadow_root.ele
`shadow_root.ele(locator)`
在 shadow root 内查找元素
参数说明
参数 | 说明  
---|---  
locator | 定位表达式，支持 css/xpath/text/tag/属性组合。  
### page.with_frame
`page.with_frame(locator)`
配合 iframe 使用时切换上下文
参数说明
参数 | 说明  
---|---  
locator | 定位表达式，支持 css/xpath/text/tag/属性组合。  
### frame.ele
`frame.ele(locator)`
在 iframe 内查找元素
参数说明
参数 | 说明  
---|---  
locator | 定位表达式，支持 css/xpath/text/tag/属性组合。  
## 相关示例
  * 参见示例中心：/automation/examples


## 相关示例源码
### Shadow DOM 与嵌套 iframe：open / closed shadow 全场景
examples/14_shadow_dom.py
这是 shadow DOM 与复杂边界专题的主示例，必须在文档中单列。
GitHub 仓库 [查看仓库源码](https://github.com/LoseNine/ruyipage/blob/main/examples/14_shadow_dom.py) ele.with_shadowshadow_root.elepage.with_frameframe.ele
  * 进入主页面 open shadow root
  * 进入主页面 closed shadow root
  * 在 iframe 内访问 open shadow
  * 在 iframe 内访问 closed shadow
  * 组合使用 with_frame 和 with_shadow
  * 处理复杂边界后恢复主页面上下文


源码文件：`app/content/ruyipage_examples/14_shadow_dom.py` · 仓库：[14_shadow_dom.py](https://github.com/LoseNine/ruyipage/blob/main/examples/14_shadow_dom.py)
python 注释版
注释版 原始版 自动换行 复制代码
```
# =============================
# RuyiPage 示例注释版
# 标题: Shadow DOM 与嵌套 iframe：open / closed shadow 全场景
# 说明: 这是 shadow DOM 与复杂边界专题的主示例，必须在文档中单列。
# 你会学到:
#   1. 进入主页面 open shadow root
#   2. 进入主页面 closed shadow root
#   3. 在 iframe 内访问 open shadow
#   4. 在 iframe 内访问 closed shadow
#   5. 组合使用 with_frame 和 with_shadow
# 相关 API: ele.with_shadow, shadow_root.ele, page.with_frame, frame.ele
# =============================

# -*- coding: utf-8 -*-
"""示例14: Shadow DOM + 嵌套 iframe（open/closed 完整场景）

覆盖点：
1) 主页面 open shadow
2) 主页面 closed shadow（桥接函数）
3) 进入 iframe 后 open shadow
4) 进入 iframe 后 closed shadow（桥接函数）
5) with_frame / with_shadow 简洁 API
"""

import io
import os
import sys


if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")


sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from ruyipage import FirefoxOptions, FirefoxPage


def test_shadow_dom():
    print("=" * 60)
    print("测试14: Shadow DOM + 嵌套iframe")
    print("=" * 60)

    opts = FirefoxOptions()
    opts.headless(False)
    page = FirefoxPage(opts)

    try:
        test_page = os.path.join(
            os.path.dirname(__file__), "test_pages", "complex_shadow_iframe.html"
        )
        test_url = "file:///" + os.path.abspath(test_page).replace("\\", "/")
        page.get(test_url)
        page.wait(1)

        # 1) 主页面 open shadow
        print("\n1. 主页面 open shadow:")
        host_open = page.ele("#host-open-shadow")
        with host_open.with_shadow("open") as open_root:
            text = open_root.ele("#host-open-text").text
            print(f"   open文本: {text}")

        # 2) 主页面 closed shadow
        print("\n2. 主页面 closed shadow:")
        host_closed = page.ele("#host-closed-shadow")
        with host_closed.with_shadow("closed") as closed_root:
            text = closed_root.ele("#host-closed-text").text
            print(f"   closed文本: {text}")

        # 3) 进入 iframe，测试 open/closed shadow
        print("\n3. 进入iframe并测试 shadow:")
        with page.with_frame("#outer-iframe") as frame:
            inner_title = frame.ele("#inner-title").text
            print(f"   iframe标题: {inner_title}")

            inner_open = frame.ele("#inner-open-host")
            with inner_open.with_shadow("open") as inner_open_root:
                open_text = inner_open_root.ele("#inner-open-text").text
                print(f"   iframe open文本: {open_text}")

            inner_closed = frame.ele("#inner-closed-host")
            with inner_closed.with_shadow("closed") as inner_closed_root:
                closed_text = inner_closed_root.ele("#inner-closed-text").text
                print(f"   iframe closed文本: {closed_text}")

        # 4) 退出 with_frame 后仍可访问主页面
        print("\n4. 退出iframe后主页面可访问:")
        host_title = page.ele("#host-title").text
        print(f"   主页面标题: {host_title}")

        print("\n" + "=" * 60)
        print("✓ Shadow DOM + 嵌套iframe 测试通过！")
        print("=" * 60)

    except Exception as e:
        print(f"\n✗ 测试失败: {e}")
        import traceback

        traceback.print_exc()
    finally:
        page.wait(1)
        page.quit()


if __name__ == "__main__":
    test_shadow_dom()

```

```
# -*- coding: utf-8 -*-
"""示例14: Shadow DOM + 嵌套 iframe（open/closed 完整场景）

覆盖点：
1) 主页面 open shadow
2) 主页面 closed shadow（桥接函数）
3) 进入 iframe 后 open shadow
4) 进入 iframe 后 closed shadow（桥接函数）
5) with_frame / with_shadow 简洁 API
"""

import io
import os
import sys


if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")


sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from ruyipage import FirefoxOptions, FirefoxPage


def test_shadow_dom():
    print("=" * 60)
    print("测试14: Shadow DOM + 嵌套iframe")
    print("=" * 60)

    opts = FirefoxOptions()
    opts.headless(False)
    page = FirefoxPage(opts)

    try:
        test_page = os.path.join(
            os.path.dirname(__file__), "test_pages", "complex_shadow_iframe.html"
        )
        test_url = "file:///" + os.path.abspath(test_page).replace("\\", "/")
        page.get(test_url)
        page.wait(1)

        # 1) 主页面 open shadow
        print("\n1. 主页面 open shadow:")
        host_open = page.ele("#host-open-shadow")
        with host_open.with_shadow("open") as open_root:
            text = open_root.ele("#host-open-text").text
            print(f"   open文本: {text}")

        # 2) 主页面 closed shadow
        print("\n2. 主页面 closed shadow:")
        host_closed = page.ele("#host-closed-shadow")
        with host_closed.with_shadow("closed") as closed_root:
            text = closed_root.ele("#host-closed-text").text
            print(f"   closed文本: {text}")

        # 3) 进入 iframe，测试 open/closed shadow
        print("\n3. 进入iframe并测试 shadow:")
        with page.with_frame("#outer-iframe") as frame:
            inner_title = frame.ele("#inner-title").text
            print(f"   iframe标题: {inner_title}")

            inner_open = frame.ele("#inner-open-host")
            with inner_open.with_shadow("open") as inner_open_root:
                open_text = inner_open_root.ele("#inner-open-text").text
                print(f"   iframe open文本: {open_text}")

            inner_closed = frame.ele("#inner-closed-host")
            with inner_closed.with_shadow("closed") as inner_closed_root:
                closed_text = inner_closed_root.ele("#inner-closed-text").text
                print(f"   iframe closed文本: {closed_text}")

        # 4) 退出 with_frame 后仍可访问主页面
        print("\n4. 退出iframe后主页面可访问:")
        host_title = page.ele("#host-title").text
        print(f"   主页面标题: {host_title}")

        print("\n" + "=" * 60)
        print("✓ Shadow DOM + 嵌套iframe 测试通过！")
        print("=" * 60)

    except Exception as e:
        print(f"\n✗ 测试失败: {e}")
        import traceback

        traceback.print_exc()
    finally:
        page.wait(1)
        page.quit()


if __name__ == "__main__":
    test_shadow_dom()

```
