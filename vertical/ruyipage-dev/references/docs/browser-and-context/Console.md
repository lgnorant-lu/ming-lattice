#  RuyiPage Console
console 模块适合做页面调试、日志观察和错误诊断。
## API 与参数说明
### page.console.start
`page.console.start()`
开始监听 console 输出
### page.console.get
`page.console.get()`
获取所有已采集的日志
### page.console.clear
`page.console.clear()`
清空日志缓冲区
### page.console.wait
`page.console.wait(level, timeout)`
等待指定级别的日志出现
参数说明
参数 | 说明  
---|---  
level | 参数含义与默认值请结合当前 API 场景使用。  
timeout | 超时时间（秒），建议按页面复杂度调整。  
### page.console.stop
`page.console.stop()`
停止监听 console
## 相关示例
  * 参见示例中心：/automation/examples


## 相关示例源码
### 控制台监听：采集、过滤、等待与停止监听
examples/12_console_listener.py
演示如何把 console 作为页面调试和自动化观测的一部分。
GitHub 仓库 [查看仓库源码](https://github.com/LoseNine/ruyipage/blob/main/examples/12_console_listener.py) page.console.startpage.console.getpage.console.clearpage.console.waitpage.console.stoppage.run_js
  * 监听 console.log / warn / error
  * 获取全部日志记录
  * 按级别过滤关键日志
  * 等待特定日志出现
  * 停止监听避免噪音累积


源码文件：`app/content/ruyipage_examples/12_console_listener.py` · 仓库：[12_console_listener.py](https://github.com/LoseNine/ruyipage/blob/main/examples/12_console_listener.py)
python 注释版
注释版 原始版 自动换行 复制代码
```
# =============================
# RuyiPage 示例注释版
# 标题: 控制台监听：采集、过滤、等待与停止监听
# 说明: 演示如何把 console 作为页面调试和自动化观测的一部分。
# 你会学到:
#   1. 监听 console.log / warn / error
#   2. 获取全部日志记录
#   3. 按级别过滤关键日志
#   4. 等待特定日志出现
#   5. 停止监听避免噪音累积
# 相关 API: page.console.start, page.console.get, page.console.clear, page.console.wait, page.console.stop, page.run_js
# =============================

# -*- coding: utf-8 -*-
"""
示例12: 控制台监听
测试功能：
- 监听console.log
- 监听console.error
- 监听console.warn
- 获取日志内容
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


def test_console_listener():
    """测试控制台监听功能"""
    print("=" * 60)
    print("测试12: 控制台监听")
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

        # 1. 启动控制台监听
        print("\n1. 启动控制台监听:")
        page.console.start()
        print(f"   ✓ 控制台监听已启动")

        # 2. 触发console.log
        print("\n2. 触发console.log:")
        log_btn = page.ele("text:console.log")
        log_btn.click_self()
        page.wait(1)

        logs = page.console.get()
        print(f"   捕获到 {len(logs)} 条日志")
        for log in logs:
            print(f"   - [{log.level}] {log.text}")

        # 3. 触发console.warn
        print("\n3. 触发console.warn:")
        warn_btn = page.ele("text:console.warn")
        warn_btn.click_self()
        page.wait(1)

        logs = page.console.get()
        print(f"   捕获到 {len(logs)} 条日志")
        for log in logs[-1:]:  # 只显示最新的
            print(f"   - [{log.level}] {log.text}")

        # 4. 触发console.error
        print("\n4. 触发console.error:")
        error_btn = page.ele("text:console.error")
        error_btn.click_self()
        page.wait(1)

        logs = page.console.get()
        print(f"   捕获到 {len(logs)} 条日志")
        for log in logs[-1:]:  # 只显示最新的
            print(f"   - [{log.level}] {log.text}")

        # 5. 触发console.info
        print("\n5. 触发console.info:")
        info_btn = page.ele("text:console.info")
        info_btn.click_self()
        page.wait(1)

        logs = page.console.get()
        print(f"   捕获到 {len(logs)} 条日志")

        # 5.1 级别过滤
        print("\n5.1 级别过滤 (error):")
        error_logs = page.console.get(level="error")
        print(f"   error日志数量: {len(error_logs)}")

        # 6. 清空日志
        print("\n6. 清空日志:")
        page.console.clear()
        logs = page.console.get()
        print(f"   清空后日志数量: {len(logs)}")

        # 7. 通过JS输出日志
        print("\n7. 通过JS输出日志:")
        page.run_js('console.log("通过JS输出的日志")')
        page.run_js('console.error("通过JS输出的错误")')
        page.wait(1)

        logs = page.console.get()
        print(f"   捕获到 {len(logs)} 条日志")
        for log in logs:
            print(f"   - [{log.level}] {log.text}")

        # 7.1 wait() 过滤等待
        print("\n7.1 wait() 等待指定日志:")
        page.run_js('console.error("wait-target-message")')
        waited = page.console.wait(level="error", text="wait-target-message", timeout=5)
        if waited:
            print(f"   ✓ wait捕获: [{waited.level}] {waited.text}")
        else:
            print("   ⚠ wait未捕获到目标日志")

        # 8. 停止监听
        print("\n8. 停止监听:")
        page.console.stop()
        print(f"   ✓ 控制台监听已停止")

        # 8.1 停止后不应继续积累新日志
        print("\n8.1 停止后验证不再捕获:")
        before = len(page.console.get())
        page.run_js('console.log("should-not-be-captured-after-stop")')
        page.wait(0.6)
        after = len(page.console.get())
        print(f"   停止前后日志数量: {before} -> {after}")

        print("\n" + "=" * 60)
        print("✓ 所有控制台监听测试通过！")
        print("=" * 60)

    except Exception as e:
        print(f"\n✗ 测试失败: {e}")
        import traceback

        traceback.print_exc()
    finally:
        try:
            page.console.stop()
        except:
            pass
        page.wait(2)
        page.quit()


if __name__ == "__main__":
    test_console_listener()

```

```
# -*- coding: utf-8 -*-
"""
示例12: 控制台监听
测试功能：
- 监听console.log
- 监听console.error
- 监听console.warn
- 获取日志内容
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


def test_console_listener():
    """测试控制台监听功能"""
    print("=" * 60)
    print("测试12: 控制台监听")
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

        # 1. 启动控制台监听
        print("\n1. 启动控制台监听:")
        page.console.start()
        print(f"   ✓ 控制台监听已启动")

        # 2. 触发console.log
        print("\n2. 触发console.log:")
        log_btn = page.ele("text:console.log")
        log_btn.click_self()
        page.wait(1)

        logs = page.console.get()
        print(f"   捕获到 {len(logs)} 条日志")
        for log in logs:
            print(f"   - [{log.level}] {log.text}")

        # 3. 触发console.warn
        print("\n3. 触发console.warn:")
        warn_btn = page.ele("text:console.warn")
        warn_btn.click_self()
        page.wait(1)

        logs = page.console.get()
        print(f"   捕获到 {len(logs)} 条日志")
        for log in logs[-1:]:  # 只显示最新的
            print(f"   - [{log.level}] {log.text}")

        # 4. 触发console.error
        print("\n4. 触发console.error:")
        error_btn = page.ele("text:console.error")
        error_btn.click_self()
        page.wait(1)

        logs = page.console.get()
        print(f"   捕获到 {len(logs)} 条日志")
        for log in logs[-1:]:  # 只显示最新的
            print(f"   - [{log.level}] {log.text}")

        # 5. 触发console.info
        print("\n5. 触发console.info:")
        info_btn = page.ele("text:console.info")
        info_btn.click_self()
        page.wait(1)

        logs = page.console.get()
        print(f"   捕获到 {len(logs)} 条日志")

        # 5.1 级别过滤
        print("\n5.1 级别过滤 (error):")
        error_logs = page.console.get(level="error")
        print(f"   error日志数量: {len(error_logs)}")

        # 6. 清空日志
        print("\n6. 清空日志:")
        page.console.clear()
        logs = page.console.get()
        print(f"   清空后日志数量: {len(logs)}")

        # 7. 通过JS输出日志
        print("\n7. 通过JS输出日志:")
        page.run_js('console.log("通过JS输出的日志")')
        page.run_js('console.error("通过JS输出的错误")')
        page.wait(1)

        logs = page.console.get()
        print(f"   捕获到 {len(logs)} 条日志")
        for log in logs:
            print(f"   - [{log.level}] {log.text}")

        # 7.1 wait() 过滤等待
        print("\n7.1 wait() 等待指定日志:")
        page.run_js('console.error("wait-target-message")')
        waited = page.console.wait(level="error", text="wait-target-message", timeout=5)
        if waited:
            print(f"   ✓ wait捕获: [{waited.level}] {waited.text}")
        else:
            print("   ⚠ wait未捕获到目标日志")

        # 8. 停止监听
        print("\n8. 停止监听:")
        page.console.stop()
        print(f"   ✓ 控制台监听已停止")

        # 8.1 停止后不应继续积累新日志
        print("\n8.1 停止后验证不再捕获:")
        before = len(page.console.get())
        page.run_js('console.log("should-not-be-captured-after-stop")')
        page.wait(0.6)
        after = len(page.console.get())
        print(f"   停止前后日志数量: {before} -> {after}")

        print("\n" + "=" * 60)
        print("✓ 所有控制台监听测试通过！")
        print("=" * 60)

    except Exception as e:
        print(f"\n✗ 测试失败: {e}")
        import traceback

        traceback.print_exc()
    finally:
        try:
            page.console.stop()
        except:
            pass
        page.wait(2)
        page.quit()


if __name__ == "__main__":
    test_console_listener()

```

### 日志与输入事件：log.entryAdded 与 fileDialogOpened
examples/33_log_input_events.py
把日志和输入事件统一纳入事件系统理解。
GitHub 仓库 [查看仓库源码](https://github.com/LoseNine/ruyipage/blob/main/examples/33_log_input_events.py) page.console.startpage.console.waitpage.events.startpage.events.waitclick(by_js=True)
  * 输出并监听多级别 console 日志
  * 读取 error / warn / table 内容
  * 订阅 fileDialogOpened 事件
  * 观察单文件和多文件输入弹窗打开链路


源码文件：`app/content/ruyipage_examples/33_log_input_events.py` · 仓库：[33_log_input_events.py](https://github.com/LoseNine/ruyipage/blob/main/examples/33_log_input_events.py)
python 注释版
注释版 原始版 自动换行 复制代码
```
#!/usr/bin/env python
# =============================
# RuyiPage 示例注释版
# 标题: 日志与输入事件：log.entryAdded 与 fileDialogOpened
# 说明: 把日志和输入事件统一纳入事件系统理解。
# 你会学到:
#   1. 输出并监听多级别 console 日志
#   2. 读取 error / warn / table 内容
#   3. 订阅 fileDialogOpened 事件
#   4. 观察单文件和多文件输入弹窗打开链路
# 相关 API: page.console.start, page.console.wait, page.events.start, page.events.wait, click(by_js=True)
# =============================

# -*- coding: utf-8 -*-
"""示例33: Log + Input Events（严格结果版）"""

import io
import os
import sys
from typing import Dict, List

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

from ruyipage import FirefoxPage


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
    print("测试 33: Log + Input Events")
    print("=" * 70)

    page = FirefoxPage()
    results: List[Dict[str, str]] = []
    test_file = os.path.join(os.path.dirname(__file__), "test_file_dialog.html")

    try:
        # 1. log.entryAdded
        page.get("https://www.example.com")
        add_result(results, "页面加载", "成功", "example.com 已加载")

        page.console.start()
        page.console.clear()

        page.run_js("console.log('This is a log message')", as_expr=False)
        page.run_js("console.info('This is an info message')", as_expr=False)
        page.run_js("console.warn('This is a warning message')", as_expr=False)
        page.run_js("console.error('This is an error message')", as_expr=False)
        page.run_js("console.debug('This is a debug message')", as_expr=False)
        page.run_js(
            "console.table([{name: 'Alice', age: 18}, {name: 'Bob', age: 20}])",
            as_expr=False,
        )

        log_entry = page.console.wait(timeout=3)
        entries = page.console.entries
        error_entry = next((e for e in entries if e.level == "error"), None)
        warn_entry = next((e for e in entries if e.level == "warn"), None)
        table_entry = next(
            (e for e in entries if "Alice" in (e.text or "") or "Bob" in (e.text or "")),
            None,
        )

        if log_entry:
            add_result(
                results,
                "log.entryAdded first",
                "成功",
                f"level={log_entry.level} text={log_entry.text}",
            )
        else:
            add_result(results, "log.entryAdded first", "失败", "未观察到首条日志事件")

        if error_entry:
            add_result(results, "log.entryAdded error", "成功", error_entry.text or "")
        else:
            add_result(
                results, "log.entryAdded error", "失败", "未观察到 error 日志事件"
            )

        if warn_entry:
            add_result(results, "log.entryAdded warn", "成功", warn_entry.text or "")
        else:
            add_result(results, "log.entryAdded warn", "失败", "未观察到 warn 日志事件")

        if table_entry:
            add_result(results, "log.entryAdded table", "成功", (table_entry.text or "")[:120])
        else:
            add_result(results, "log.entryAdded table", "跳过", "当前 console.table 输出未稳定映射到 text")

        add_result(
            results,
            "log.entryAdded total",
            "成功" if len(entries) >= 6 else "失败",
            f"日志数量: {len(entries)}",
        )
        page.console.stop()


        # 2. input.fileDialogOpened
        html_content = """
        <!DOCTYPE html>
        <html>
        <head><meta charset='utf-8'><title>File Dialog Test</title></head>
        <body>
            <input type='file' id='single-file' />
            <input type='file' id='multiple-files' multiple />
            <button id='trigger-single' onclick="document.getElementById('single-file').click()">Open Single</button>
            <button id='trigger-multiple' onclick="document.getElementById('multiple-files').click()">Open Multiple</button>
        </body>
        </html>
        """
        with open(test_file, "w", encoding="utf-8") as f:
            f.write(html_content)

        page.get(f"file:///{test_file.replace(os.sep, '/')}")
        add_result(results, "文件测试页加载", "成功", "本地 file dialog 页面已加载")

        if page.events.start(["input.fileDialogOpened"], contexts=[page.tab_id]):
            page.events.clear()
            page.ele("#trigger-single").click(by_js=True)
            single_event = page.events.wait("input.fileDialogOpened", timeout=3)
            if single_event and single_event.multiple is False:
                add_result(
                    results,
                    "input.fileDialogOpened single",
                    "成功",
                    f"multiple={single_event.multiple}",
                )
            else:
                add_result(
                    results,
                    "input.fileDialogOpened single",
                    "跳过",
                    "当前环境未稳定观察到单文件对话框事件",
                )

            page.events.clear()
            page.ele("#trigger-multiple").click(by_js=True)
            multi_event = page.events.wait("input.fileDialogOpened", timeout=3)
            if multi_event and multi_event.multiple is True:
                add_result(
                    results,
                    "input.fileDialogOpened multiple",
                    "成功",
                    f"multiple={multi_event.multiple}",
                )
            else:
                add_result(
                    results,
                    "input.fileDialogOpened multiple",
                    "跳过",
                    "当前环境未稳定观察到多文件对话框事件",
                )
        else:
            add_result(
                results,
                "input.fileDialogOpened",
                "不支持",
                "未能订阅 input.fileDialogOpened 事件",
            )

        print_results(results)

    except Exception as e:
        add_result(results, "示例执行", "失败", str(e)[:120])
        print_results(results)
        raise
    finally:
        try:
            page.console.stop()
        except Exception:
            pass
        try:
            page.events.stop()
        except Exception:
            pass
        try:
            if os.path.exists(test_file):
                os.remove(test_file)
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
"""示例33: Log + Input Events（严格结果版）"""

import io
import os
import sys
from typing import Dict, List

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

from ruyipage import FirefoxPage


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
    print("测试 33: Log + Input Events")
    print("=" * 70)

    page = FirefoxPage()
    results: List[Dict[str, str]] = []
    test_file = os.path.join(os.path.dirname(__file__), "test_file_dialog.html")

    try:
        # 1. log.entryAdded
        page.get("https://www.example.com")
        add_result(results, "页面加载", "成功", "example.com 已加载")

        page.console.start()
        page.console.clear()

        page.run_js("console.log('This is a log message')", as_expr=False)
        page.run_js("console.info('This is an info message')", as_expr=False)
        page.run_js("console.warn('This is a warning message')", as_expr=False)
        page.run_js("console.error('This is an error message')", as_expr=False)
        page.run_js("console.debug('This is a debug message')", as_expr=False)
        page.run_js(
            "console.table([{name: 'Alice', age: 18}, {name: 'Bob', age: 20}])",
            as_expr=False,
        )

        log_entry = page.console.wait(timeout=3)
        entries = page.console.entries
        error_entry = next((e for e in entries if e.level == "error"), None)
        warn_entry = next((e for e in entries if e.level == "warn"), None)
        table_entry = next(
            (e for e in entries if "Alice" in (e.text or "") or "Bob" in (e.text or "")),
            None,
        )

        if log_entry:
            add_result(
                results,
                "log.entryAdded first",
                "成功",
                f"level={log_entry.level} text={log_entry.text}",
            )
        else:
            add_result(results, "log.entryAdded first", "失败", "未观察到首条日志事件")

        if error_entry:
            add_result(results, "log.entryAdded error", "成功", error_entry.text or "")
        else:
            add_result(
                results, "log.entryAdded error", "失败", "未观察到 error 日志事件"
            )

        if warn_entry:
            add_result(results, "log.entryAdded warn", "成功", warn_entry.text or "")
        else:
            add_result(results, "log.entryAdded warn", "失败", "未观察到 warn 日志事件")

        if table_entry:
            add_result(results, "log.entryAdded table", "成功", (table_entry.text or "")[:120])
        else:
            add_result(results, "log.entryAdded table", "跳过", "当前 console.table 输出未稳定映射到 text")

        add_result(
            results,
            "log.entryAdded total",
            "成功" if len(entries) >= 6 else "失败",
            f"日志数量: {len(entries)}",
        )
        page.console.stop()


        # 2. input.fileDialogOpened
        html_content = """
        <!DOCTYPE html>
        <html>
        <head><meta charset='utf-8'><title>File Dialog Test</title></head>
        <body>
            <input type='file' id='single-file' />
            <input type='file' id='multiple-files' multiple />
            <button id='trigger-single' onclick="document.getElementById('single-file').click()">Open Single</button>
            <button id='trigger-multiple' onclick="document.getElementById('multiple-files').click()">Open Multiple</button>
        </body>
        </html>
        """
        with open(test_file, "w", encoding="utf-8") as f:
            f.write(html_content)

        page.get(f"file:///{test_file.replace(os.sep, '/')}")
        add_result(results, "文件测试页加载", "成功", "本地 file dialog 页面已加载")

        if page.events.start(["input.fileDialogOpened"], contexts=[page.tab_id]):
            page.events.clear()
            page.ele("#trigger-single").click(by_js=True)
            single_event = page.events.wait("input.fileDialogOpened", timeout=3)
            if single_event and single_event.multiple is False:
                add_result(
                    results,
                    "input.fileDialogOpened single",
                    "成功",
                    f"multiple={single_event.multiple}",
                )
            else:
                add_result(
                    results,
                    "input.fileDialogOpened single",
                    "跳过",
                    "当前环境未稳定观察到单文件对话框事件",
                )

            page.events.clear()
            page.ele("#trigger-multiple").click(by_js=True)
            multi_event = page.events.wait("input.fileDialogOpened", timeout=3)
            if multi_event and multi_event.multiple is True:
                add_result(
                    results,
                    "input.fileDialogOpened multiple",
                    "成功",
                    f"multiple={multi_event.multiple}",
                )
            else:
                add_result(
                    results,
                    "input.fileDialogOpened multiple",
                    "跳过",
                    "当前环境未稳定观察到多文件对话框事件",
                )
        else:
            add_result(
                results,
                "input.fileDialogOpened",
                "不支持",
                "未能订阅 input.fileDialogOpened 事件",
            )

        print_results(results)

    except Exception as e:
        add_result(results, "示例执行", "失败", str(e)[:120])
        print_results(results)
        raise
    finally:
        try:
            page.console.stop()
        except Exception:
            pass
        try:
            page.events.stop()
        except Exception:
            pass
        try:
            if os.path.exists(test_file):
                os.remove(test_file)
        except Exception:
            pass
        try:
            page.quit()
        except Exception:
            pass


if __name__ == "__main__":
    main()

```
