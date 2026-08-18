#  RuyiPage RuyiPage 文档首页
RuyiPage 是一套面向 Firefox + WebDriver BiDi 的自动化框架文档。这里不做泛泛介绍，而是围绕安装、页面控制、结构边界、网络、浏览器能力、反风控和完整示例体系来组织内容。
## 展示图
#### RuyiPage 品牌标识
用于在文档首页和概览页突出 Firefox + BiDi 路线的品牌识别。
![RuyiPage 品牌标识](https://0xshoulderlab.site/static/images/ruyipage/ruyipage.png)
launchFirefoxPagepage.get
#### Cloudflare 场景展示
用于说明 RuyiPage 在高风控场景下的访问与交互能力，适合配合 anti-bot 文档说明。
![Cloudflare 场景展示](https://0xshoulderlab.site/static/images/ruyipage/cloudfare.jpg)
page.handle_cloudflare_challengepage.actionspage.get_cookies
#### hCaptcha 场景展示
用于强调原生动作、拟人输入与 isTrusted 行为在验证码交互场景中的价值。
![hCaptcha 场景展示](https://0xshoulderlab.site/static/images/ruyipage/hcapture.jpg)
page.actionspage.touchpage.is_trusted
#### DataDome 场景展示
用于说明 Firefox + BiDi 路线在更强风控页面上的整体适配价值。
![DataDome 场景展示](https://0xshoulderlab.site/static/images/ruyipage/datadome.jpg)
page.emulationpage.networkpage.actions
#### Outlook 实战访问展示
体现框架在真实业务站点中的页面控制、标签页管理和会话能力。
![Outlook 实战访问展示](https://0xshoulderlab.site/static/images/ruyipage/outlook.jpg)
page.getpage.elepage.browser_tools
#### Google / Gmail 场景展示
适合配合移动端模拟、UA 与 locale/timezone 配置一起说明 emulation 的实战价值。
![Google / Gmail 场景展示](https://0xshoulderlab.site/static/images/ruyipage/google.jpg)
page.emulation.apply_mobile_presetpage.getpage.run_js
## 为什么是 RuyiPage
RuyiPage 的核心路线是 Firefox + WebDriver BiDi，而不是继续围绕 Chromium / CDP 做自动化封装。这意味着它在高风控场景下更容易形成差异化，尤其是原生动作链和 isTrusted 事件支持非常适合真实交互场景。
#### Firefox 主路线
围绕 Firefox 浏览器和 BiDi 协议构建高层 API。
#### 不依赖 CDP
天然避开传统 CDP 自动化暴露面。
#### 原生动作链
动作、拖拽、滚轮、拟人输入更接近真实浏览器行为。
#### 示例体系完整
从 quickstart 到严格结果版示例，方便文档和学习双向映射。
## 推荐阅读顺序
  * 先看安装：了解环境、安装、升级和推荐浏览器环境。
  * 再看快速开始：先跑通最短脚本，再看真实站点 quickstart。
  * 再看页面对象、元素、actions：建立基础操作心智。
  * 需要处理复杂结构时，单独阅读 iframe 和 Shadow DOM。
  * 需要处理高风控、网络、事件和仿真时，继续阅读 network、events、emulation 和 anti-bot。
  * 最后回到 examples 页面，按分类 tab 选择最贴近自己场景的示例。


## 相关示例源码
### 一步上手：最少代码完成访问与读取
examples/01_quickstart.py
最短可运行的 hello-world 级别示例，适合验证环境和建立第一层心智模型。
GitHub 仓库 [查看仓库源码](https://github.com/LoseNine/ruyipage/blob/main/examples/01_quickstart.py) launchpage.getpage.waitpage.titlepage.eleele.textpage.quit
  * 用 launch() 启动 Firefox
  * 访问网页并等待页面稳定
  * 读取标题和 H1 文本
  * 演示最短退出流程


源码文件：`app/content/ruyipage_examples/01_quickstart.py` · 仓库：[01_quickstart.py](https://github.com/LoseNine/ruyipage/blob/main/examples/01_quickstart.py)
python 注释版
注释版 原始版 自动换行 复制代码
```
# =============================
# RuyiPage 示例注释版
# 标题: 一步上手：最少代码完成访问与读取
# 说明: 最短可运行的 hello-world 级别示例，适合验证环境和建立第一层心智模型。
# 你会学到:
#   1. 用 launch() 启动 Firefox
#   2. 访问网页并等待页面稳定
#   3. 读取标题和 H1 文本
#   4. 演示最短退出流程
# 相关 API: launch, page.get, page.wait, page.title, page.ele, ele.text, page.quit
# =============================

# -*- coding: utf-8 -*-
"""
示例01: 一步上手

面向新手：最少代码完成一次页面访问与元素交互。
"""

import io
import sys


if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")


from ruyipage import launch


def quickstart_demo():
    print("=" * 60)
    print("示例01: 一步上手")
    print("=" * 60)

    page = launch(headless=False)

    try:
        page.get("https://example.com")
        page.wait(1)
        print(f"标题: {page.title}")

        h1 = page.ele("tag:h1")
        print(f"H1文本: {h1.text}")

        print("\n✓ 快速上手完成")
    finally:
        page.wait(1)
        page.quit()


if __name__ == "__main__":
    quickstart_demo()

```

```
# -*- coding: utf-8 -*-
"""
示例01: 一步上手

面向新手：最少代码完成一次页面访问与元素交互。
"""

import io
import sys


if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")


from ruyipage import launch


def quickstart_demo():
    print("=" * 60)
    print("示例01: 一步上手")
    print("=" * 60)

    page = launch(headless=False)

    try:
        page.get("https://example.com")
        page.wait(1)
        print(f"标题: {page.title}")

        h1 = page.ele("tag:h1")
        print(f"H1文本: {h1.text}")

        print("\n✓ 快速上手完成")
    finally:
        page.wait(1)
        page.quit()


if __name__ == "__main__":
    quickstart_demo()

```

### Bing 搜索并抓取前三页结果
quickstart_bing_search.py
最接近真实业务脚本的入门示例，展示如何从搜索框输入到结果列表提取。
GitHub 仓库 [查看仓库源码](https://github.com/LoseNine/ruyipage/blob/main/examples/quickstart_bing_search.py) FirefoxOptionsFirefoxPagepage.getpage.elepage.elespage.actions.pressele.attrele.text
  * 打开搜索引擎主页并定位输入框
  * 输入关键词并使用回车提交
  * 批量读取搜索结果列表
  * 在结果容器内二次定位标题、链接和摘要
  * 跨页面翻页抓取结果


源码文件：`app/content/ruyipage_examples/quickstart_bing_search.py` · 仓库：[quickstart_bing_search.py](https://github.com/LoseNine/ruyipage/blob/main/examples/quickstart_bing_search.py)
python 注释版
注释版 原始版 自动换行 复制代码
```
# =============================
# RuyiPage 示例注释版
# 标题: Bing 搜索并抓取前三页结果
# 说明: 最接近真实业务脚本的入门示例，展示如何从搜索框输入到结果列表提取。
# 你会学到:
#   1. 打开搜索引擎主页并定位输入框
#   2. 输入关键词并使用回车提交
#   3. 批量读取搜索结果列表
#   4. 在结果容器内二次定位标题、链接和摘要
#   5. 跨页面翻页抓取结果
# 相关 API: FirefoxOptions, FirefoxPage, page.get, page.ele, page.eles, page.actions.press, ele.attr, ele.text
# =============================

# -*- coding: utf-8 -*-
"""快速开始：Bing 搜索前 3 页。"""
from ruyipage import FirefoxOptions, FirefoxPage, Keys


opts = FirefoxOptions()
# 如果 Firefox 不在默认安装目录，可以取消注释并指定路径。
# opts.set_browser_path(r"D:\Firefox\firefox.exe")

# 如果你想复用登录状态、Cookie、扩展，可以取消注释并指定 userdir。
# opts.set_user_dir(r"D:\ruyipage_userdir")

page = FirefoxPage(opts)

try:
    page.get("https://cn.bing.com/")
    page.ele("#sb_form_q").input("小肩膀教育")
    page.actions.press(Keys.ENTER).perform()
    page.wait(3)

    for page_no in range(1, 4):
        print("=" * 80)
        print(f"第 {page_no} 页")
        print("=" * 80)

        items = page.eles("css:#b_results > li.b_algo")

        for i, item in enumerate(items, 1):
            title_ele = item.ele("css:h2 a")
            if not title_ele:
                continue

            title = " ".join((title_ele.text or "").split())
            url = title_ele.attr("href") or ""

            desc_ele = item.ele("css:.b_caption p")
            content = desc_ele.text if desc_ele else item.text
            content = " ".join((content or "").split())

            print(f"{i}. {title}")
            print(f"   URL: {url}")
            print(f"   内容: {content}")

        if page_no < 3:
            next_btn = page.ele("css:a.sb_pagN")
            if not next_btn:
                break
            next_btn.click_self()
            page.wait(2)
finally:
    page.quit()

```

```
# -*- coding: utf-8 -*-
"""快速开始：Bing 搜索前 3 页。"""
from ruyipage import FirefoxOptions, FirefoxPage, Keys


opts = FirefoxOptions()
# 如果 Firefox 不在默认安装目录，可以取消注释并指定路径。
# opts.set_browser_path(r"D:\Firefox\firefox.exe")

# 如果你想复用登录状态、Cookie、扩展，可以取消注释并指定 userdir。
# opts.set_user_dir(r"D:\ruyipage_userdir")

page = FirefoxPage(opts)

try:
    page.get("https://cn.bing.com/")
    page.ele("#sb_form_q").input("小肩膀教育")
    page.actions.press(Keys.ENTER).perform()
    page.wait(3)

    for page_no in range(1, 4):
        print("=" * 80)
        print(f"第 {page_no} 页")
        print("=" * 80)

        items = page.eles("css:#b_results > li.b_algo")

        for i, item in enumerate(items, 1):
            title_ele = item.ele("css:h2 a")
            if not title_ele:
                continue

            title = " ".join((title_ele.text or "").split())
            url = title_ele.attr("href") or ""

            desc_ele = item.ele("css:.b_caption p")
            content = desc_ele.text if desc_ele else item.text
            content = " ".join((content or "").split())

            print(f"{i}. {title}")
            print(f"   URL: {url}")
            print(f"   内容: {content}")

        if page_no < 3:
            next_btn = page.ele("css:a.sb_pagN")
            if not next_btn:
                break
            next_btn.click_self()
            page.wait(2)
finally:
    page.quit()

```

### Cloudflare / Copilot 快速开始
quickstart_cloudfare.py
面向高风控站点的快速开始示例，覆盖挑战处理、输入框识别和 Cookie 提取。
GitHub 仓库 [查看仓库源码](https://github.com/LoseNine/ruyipage/blob/main/examples/quickstart_cloudfare.py) FirefoxOptionsFirefoxPagepage.getpage.elepage.handle_cloudflare_challengepage.get_cookies
  * 访问高风控站点并等待页面完成首屏加载
  * 自动尝试处理 Cloudflare 挑战
  * 定位输入框并发送问题
  * 提取 document.cookie 与完整 Cookie 信息


源码文件：`app/content/ruyipage_examples/quickstart_cloudfare.py` · 仓库：[quickstart_cloudfare.py](https://github.com/LoseNine/ruyipage/blob/main/examples/quickstart_cloudfare.py)
python 注释版
注释版 原始版 自动换行 复制代码
```
# =============================
# RuyiPage 示例注释版
# 标题: Cloudflare / Copilot 快速开始
# 说明: 面向高风控站点的快速开始示例，覆盖挑战处理、输入框识别和 Cookie 提取。
# 你会学到:
#   1. 访问高风控站点并等待页面完成首屏加载
#   2. 自动尝试处理 Cloudflare 挑战
#   3. 定位输入框并发送问题
#   4. 提取 document.cookie 与完整 Cookie 信息
# 相关 API: FirefoxOptions, FirefoxPage, page.get, page.ele, page.handle_cloudflare_challenge, page.get_cookies
# =============================

# -*- coding: utf-8 -*-
"""快速开始：访问 Copilot，自动尝试通过 Cloudflare，并打印完整 Cookie。"""

from ruyipage import FirefoxOptions, FirefoxPage, Keys


QUESTION = "你好，今天天气怎么样？"


def find_input_box(page: FirefoxPage):
    for _ in range(30):
        box = page.ele("css:textarea")
        if not box:
            box = page.ele('css:[contenteditable="true"]')
        if not box:
            box = page.ele("css:.input-area")
        if box:
            return box
        page.wait(1)
    return None


def print_full_cookies(page: FirefoxPage) -> None:
    print("\n" + "=" * 60)
    print("Cloudflare / 页面 Cookie")
    print("=" * 60)

    raw_cookie = page.run_js("return document.cookie") or ""
    print(f"document.cookie: {raw_cookie}")

    cookies = page.get_cookies(all_info=True)
    print(f"Cookie 数量: {len(cookies)}")
    for i, cookie in enumerate(cookies, 1):
        print(f"[{i}] name={cookie.name}")
        print(f"    value={cookie.value}")
        print(f"    domain={cookie.domain}")
        print(f"    path={cookie.path}")
        print(f"    httpOnly={cookie.http_only}")
        print(f"    secure={cookie.secure}")
        print(f"    sameSite={cookie.same_site}")
        print(f"    expiry={cookie.expiry}")


opts = FirefoxOptions()
# 如果 Firefox 不在默认安装目录，可以取消注释并指定路径。
# opts.set_browser_path(r"D:\Firefox\firefox.exe")

# 如果你想复用登录状态、Cookie、扩展，可以取消注释并指定 userdir。
# opts.set_user_dir(r"D:\ruyipage_userdir")

page = FirefoxPage(opts)

try:
    print("=" * 60)
    print("copilot.microsoft.com Cloudflare 测试")
    print("=" * 60)

    print("\n-> 访问 https://copilot.microsoft.com/ ...")
    page.get("https://copilot.microsoft.com/", wait="none")
    page.wait(5)

    print("-> 等待输入框...")
    input_box = find_input_box(page)

    if input_box:
        print("-> 找到输入框，开始输入问题...")
        try:
            input_box.click()
            page.wait(0.8)
            input_box.input(QUESTION, clear=True)
            page.wait(0.8)

            send_btn = page.ele('css:button[aria-label*="Send"]')
            if not send_btn:
                send_btn = page.ele('css:button[type="submit"]')

            if send_btn:
                print("-> 点击发送按钮...")
                send_btn.click()
            else:
                print("-> 按 Enter 发送...")
                page.actions.press(Keys.ENTER).perform()

            print("-> 已发送问题，等待 Cloudflare 触发...")
            page.wait(15)
        except Exception as e:
            print(f"-> 发送失败: {e}")
            page.wait(5)
    else:
        print("-> 未找到输入框，直接等待 Cloudflare...")
        page.wait(5)

    print("\n-> 开始自动处理 Cloudflare...")
    passed = page.handle_cloudflare_challenge(timeout=120, check_interval=2)

    print("\n" + "=" * 60)
    if passed:
        print("✅ 成功通过 Cloudflare！")
        print_full_cookies(page)
    else:
        print("❌ 超时未通过")

    print("\n[+] 保持浏览器打开 500 秒...")
    page.wait(500)

finally:
    page.quit()

```

```
# -*- coding: utf-8 -*-
"""快速开始：访问 Copilot，自动尝试通过 Cloudflare，并打印完整 Cookie。"""

from ruyipage import FirefoxOptions, FirefoxPage, Keys


QUESTION = "你好，今天天气怎么样？"


def find_input_box(page: FirefoxPage):
    for _ in range(30):
        box = page.ele("css:textarea")
        if not box:
            box = page.ele('css:[contenteditable="true"]')
        if not box:
            box = page.ele("css:.input-area")
        if box:
            return box
        page.wait(1)
    return None


def print_full_cookies(page: FirefoxPage) -> None:
    print("\n" + "=" * 60)
    print("Cloudflare / 页面 Cookie")
    print("=" * 60)

    raw_cookie = page.run_js("return document.cookie") or ""
    print(f"document.cookie: {raw_cookie}")

    cookies = page.get_cookies(all_info=True)
    print(f"Cookie 数量: {len(cookies)}")
    for i, cookie in enumerate(cookies, 1):
        print(f"[{i}] name={cookie.name}")
        print(f"    value={cookie.value}")
        print(f"    domain={cookie.domain}")
        print(f"    path={cookie.path}")
        print(f"    httpOnly={cookie.http_only}")
        print(f"    secure={cookie.secure}")
        print(f"    sameSite={cookie.same_site}")
        print(f"    expiry={cookie.expiry}")


opts = FirefoxOptions()
# 如果 Firefox 不在默认安装目录，可以取消注释并指定路径。
# opts.set_browser_path(r"D:\Firefox\firefox.exe")

# 如果你想复用登录状态、Cookie、扩展，可以取消注释并指定 userdir。
# opts.set_user_dir(r"D:\ruyipage_userdir")

page = FirefoxPage(opts)

try:
    print("=" * 60)
    print("copilot.microsoft.com Cloudflare 测试")
    print("=" * 60)

    print("\n-> 访问 https://copilot.microsoft.com/ ...")
    page.get("https://copilot.microsoft.com/", wait="none")
    page.wait(5)

    print("-> 等待输入框...")
    input_box = find_input_box(page)

    if input_box:
        print("-> 找到输入框，开始输入问题...")
        try:
            input_box.click()
            page.wait(0.8)
            input_box.input(QUESTION, clear=True)
            page.wait(0.8)

            send_btn = page.ele('css:button[aria-label*="Send"]')
            if not send_btn:
                send_btn = page.ele('css:button[type="submit"]')

            if send_btn:
                print("-> 点击发送按钮...")
                send_btn.click()
            else:
                print("-> 按 Enter 发送...")
                page.actions.press(Keys.ENTER).perform()

            print("-> 已发送问题，等待 Cloudflare 触发...")
            page.wait(15)
        except Exception as e:
            print(f"-> 发送失败: {e}")
            page.wait(5)
    else:
        print("-> 未找到输入框，直接等待 Cloudflare...")
        page.wait(5)

    print("\n-> 开始自动处理 Cloudflare...")
    passed = page.handle_cloudflare_challenge(timeout=120, check_interval=2)

    print("\n" + "=" * 60)
    if passed:
        print("✅ 成功通过 Cloudflare！")
        print_full_cookies(page)
    else:
        print("❌ 超时未通过")

    print("\n[+] 保持浏览器打开 500 秒...")
    page.wait(500)

finally:
    page.quit()

```

### 综合实战：表单填写、数据提取、动态内容、截图与状态验证
examples/15_comprehensive.py
最适合展示“一个真实业务脚本长什么样”的综合案例。
GitHub 仓库 [查看仓库源码](https://github.com/LoseNine/ruyipage/blob/main/examples/15_comprehensive.py) page.elepage.elesinputclick_selfselect.by_valuepage.wait.ele_displayedele.screenshotpage.screenshot
  * 完整填写表单
  * 提交并验证页面反馈
  * 抽取表格数据
  * 处理动态新增内容
  * 对关键区域截图
  * 验证状态变化与 isTrusted


源码文件：`app/content/ruyipage_examples/15_comprehensive.py` · 仓库：[15_comprehensive.py](https://github.com/LoseNine/ruyipage/blob/main/examples/15_comprehensive.py)
python 注释版
注释版 原始版 自动换行 复制代码
```
# =============================
# RuyiPage 示例注释版
# 标题: 综合实战：表单填写、数据提取、动态内容、截图与状态验证
# 说明: 最适合展示“一个真实业务脚本长什么样”的综合案例。
# 你会学到:
#   1. 完整填写表单
#   2. 提交并验证页面反馈
#   3. 抽取表格数据
#   4. 处理动态新增内容
#   5. 对关键区域截图
# 相关 API: page.ele, page.eles, input, click_self, select.by_value, page.wait.ele_displayed, ele.screenshot, page.screenshot
# =============================

# -*- coding: utf-8 -*-
"""
示例15: 综合测试 - 实战场景
测试功能：
- 模拟真实的网页自动化场景
- 综合运用多种功能
- 表单填写和提交
- 数据提取
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


def test_comprehensive():
    """综合测试 - 实战场景"""
    print("=" * 60)
    print("测试15: 综合测试 - 实战场景")
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

        print("\n场景1: 填写并提交表单")
        print("-" * 40)

        # 1. 填写文本输入框
        print("1. 填写表单字段...")
        page.ele("#text-input").input("张三")
        page.ele("#email-input").input("zhangsan@example.com")
        page.ele("#password-input").input("password123")
        page.ele("#number-input").input("25")
        page.ele("#textarea").input("这是一段测试文本\n包含多行内容")

        # 2. 选择复选框
        page.ele("#checkbox1").click_self()
        page.ele("#checkbox2").click_self()

        # 3. 选择单选框
        page.ele("#radio1").click_self()

        # 4. 选择下拉框
        select_ele = page.ele("#select-single")
        select_ok = select_ele.select.by_value("opt2", mode="native_only")
        if not select_ok:
            select_ok = select_ele.select.by_value("opt2", mode="compat")

        page.wait(0.5)
        print("   ✓ 表单填写完成")

        # 5. 提交表单
        print("2. 提交表单...")
        page.ele("#submit-btn").click_self()
        page.wait(1)

        # 6. 验证提交结果
        result = page.ele("#form-result").text
        print(f"   提交结果: {result[:100]}...")

        print("\n场景2: 数据提取")
        print("-" * 40)

        # 7. 提取表格数据
        print("1. 提取表格数据...")
        table_rows = page.eles("#data-table tbody tr")
        print(f"   表格共有 {len(table_rows)} 行数据")

        table_data = []
        for row in table_rows:
            cells = row.eles("tag:td")
            if len(cells) >= 4:
                row_data = {
                    "id": cells[0].text,
                    "name": cells[1].text,
                    "age": cells[2].text,
                    "city": cells[3].text,
                }
                table_data.append(row_data)
                print(f"   - {row_data}")

        print("\n场景3: 动态交互")
        print("-" * 40)

        # 8. 测试动态内容
        print("1. 触发延迟显示...")
        page.ele("text:显示延迟内容").click_self()
        dynamic_elem = page.wait.ele_displayed("#dynamic-content", timeout=5)
        if dynamic_elem:
            print(f"   ✓ 延迟内容已显示: {dynamic_elem.text}")

        # 9. 添加多个内容
        print("2. 添加多个动态内容...")
        for i in range(3):
            page.ele("text:添加内容").click_self()
            page.wait(0.3)

        new_items = page.eles("#content-container .result")
        print(f"   ✓ 已添加 {len(new_items)} 个新内容")

        print("\n场景4: 页面截图")
        print("-" * 40)

        # 10. 截取关键区域
        print("1. 截取关键区域...")
        output_dir = os.path.join(os.path.dirname(__file__), "output", "comprehensive")
        os.makedirs(output_dir, exist_ok=True)

        # 表单区域截图
        try:
            form_section = page.ele("#form-section")
            page.scroll.to_see(form_section)
            page.wait(0.5)
            form_section.screenshot(os.path.join(output_dir, "form_filled.png"))
            print(f"   ✓ 表单截图已保存")
        except Exception as e:
            print(f"   ⚠ 表单截图跳过: {str(e)[:50]}")

        # 表格截图
        try:
            table = page.ele("#data-table")
            page.scroll.to_see(table)
            page.wait(0.5)
            table.screenshot(os.path.join(output_dir, "table_data.png"))
            print(f"   ✓ 表格截图已保存")
        except Exception as e:
            print(f"   ⚠ 表格截图跳过: {str(e)[:50]}")

        # 整页截图
        page.screenshot(os.path.join(output_dir, "full_page.png"))
        print(f"   ✓ 整页截图已保存")

        print("\n场景5: 多次交互")
        print("-" * 40)

        # 11. 连续点击测试
        print("1. 连续点击按钮...")
        click_btn = page.ele("#click-btn")
        for i in range(5):
            click_btn.click_self()
            page.wait(0.2)

        result = page.ele("#click-result").text
        print(f"   点击结果: {result}")

        # 12. 鼠标悬停测试
        print("2. 鼠标悬停测试...")
        hover_target = page.ele("#hover-target")
        hover_target.hover()
        page.wait(0.5)
        hover_result = page.ele("#hover-result").text
        print(f"   悬停结果: {hover_result}")

        # 12.1 isTrusted 行为验证
        print("3. isTrusted 行为验证...")
        page.ele("#click-btn").click_self()
        page.wait(0.2)
        page.ele("#text-input").input("T", clear=False)
        page.wait(0.2)
        hover_target.hover()
        page.wait(0.2)
        print(f"   click isTrusted: {page.is_trusted('click')}")
        print(f"   keydown isTrusted: {page.is_trusted('keydown')}")
        print(f"   mouseenter isTrusted: {page.is_trusted('mouseenter')}")

        print("\n场景6: 数据验证")
        print("-" * 40)

        # 13. 验证元素状态
        print("1. 验证元素状态...")
        disabled_btn = page.ele("#disabled-btn")
        print(f"   禁用按钮是否可用: {disabled_btn.is_enabled}")
        print(f"   禁用按钮是否显示: {disabled_btn.is_displayed}")

        # 14. 验证输入值
        print("2. 验证输入值...")
        text_value = page.ele("#text-input").value
        email_value = page.ele("#email-input").value
        print(f"   文本输入框: {text_value}")
        print(f"   邮箱输入框: {email_value}")

        # 15. 验证选择状态
        print("3. 验证选择状态...")
        checkbox1_checked = page.ele("#checkbox1").is_checked
        radio1_checked = page.ele("#radio1").is_checked
        print(f"   复选框1选中: {checkbox1_checked}")
        print(f"   单选框1选中: {radio1_checked}")

        print("\n" + "=" * 60)
        print("✓ 综合测试全部通过！")
        print(f"截图保存在: {output_dir}")
        print("=" * 60)

    except Exception as e:
        print(f"\n✗ 测试失败: {e}")
        import traceback

        traceback.print_exc()
    finally:
        page.wait(3)
        page.quit()


if __name__ == "__main__":
    test_comprehensive()

```

```
# -*- coding: utf-8 -*-
"""
示例15: 综合测试 - 实战场景
测试功能：
- 模拟真实的网页自动化场景
- 综合运用多种功能
- 表单填写和提交
- 数据提取
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


def test_comprehensive():
    """综合测试 - 实战场景"""
    print("=" * 60)
    print("测试15: 综合测试 - 实战场景")
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

        print("\n场景1: 填写并提交表单")
        print("-" * 40)

        # 1. 填写文本输入框
        print("1. 填写表单字段...")
        page.ele("#text-input").input("张三")
        page.ele("#email-input").input("zhangsan@example.com")
        page.ele("#password-input").input("password123")
        page.ele("#number-input").input("25")
        page.ele("#textarea").input("这是一段测试文本\n包含多行内容")

        # 2. 选择复选框
        page.ele("#checkbox1").click_self()
        page.ele("#checkbox2").click_self()

        # 3. 选择单选框
        page.ele("#radio1").click_self()

        # 4. 选择下拉框
        select_ele = page.ele("#select-single")
        select_ok = select_ele.select.by_value("opt2", mode="native_only")
        if not select_ok:
            select_ok = select_ele.select.by_value("opt2", mode="compat")

        page.wait(0.5)
        print("   ✓ 表单填写完成")

        # 5. 提交表单
        print("2. 提交表单...")
        page.ele("#submit-btn").click_self()
        page.wait(1)

        # 6. 验证提交结果
        result = page.ele("#form-result").text
        print(f"   提交结果: {result[:100]}...")

        print("\n场景2: 数据提取")
        print("-" * 40)

        # 7. 提取表格数据
        print("1. 提取表格数据...")
        table_rows = page.eles("#data-table tbody tr")
        print(f"   表格共有 {len(table_rows)} 行数据")

        table_data = []
        for row in table_rows:
            cells = row.eles("tag:td")
            if len(cells) >= 4:
                row_data = {
                    "id": cells[0].text,
                    "name": cells[1].text,
                    "age": cells[2].text,
                    "city": cells[3].text,
                }
                table_data.append(row_data)
                print(f"   - {row_data}")

        print("\n场景3: 动态交互")
        print("-" * 40)

        # 8. 测试动态内容
        print("1. 触发延迟显示...")
        page.ele("text:显示延迟内容").click_self()
        dynamic_elem = page.wait.ele_displayed("#dynamic-content", timeout=5)
        if dynamic_elem:
            print(f"   ✓ 延迟内容已显示: {dynamic_elem.text}")

        # 9. 添加多个内容
        print("2. 添加多个动态内容...")
        for i in range(3):
            page.ele("text:添加内容").click_self()
            page.wait(0.3)

        new_items = page.eles("#content-container .result")
        print(f"   ✓ 已添加 {len(new_items)} 个新内容")

        print("\n场景4: 页面截图")
        print("-" * 40)

        # 10. 截取关键区域
        print("1. 截取关键区域...")
        output_dir = os.path.join(os.path.dirname(__file__), "output", "comprehensive")
        os.makedirs(output_dir, exist_ok=True)

        # 表单区域截图
        try:
            form_section = page.ele("#form-section")
            page.scroll.to_see(form_section)
            page.wait(0.5)
            form_section.screenshot(os.path.join(output_dir, "form_filled.png"))
            print(f"   ✓ 表单截图已保存")
        except Exception as e:
            print(f"   ⚠ 表单截图跳过: {str(e)[:50]}")

        # 表格截图
        try:
            table = page.ele("#data-table")
            page.scroll.to_see(table)
            page.wait(0.5)
            table.screenshot(os.path.join(output_dir, "table_data.png"))
            print(f"   ✓ 表格截图已保存")
        except Exception as e:
            print(f"   ⚠ 表格截图跳过: {str(e)[:50]}")

        # 整页截图
        page.screenshot(os.path.join(output_dir, "full_page.png"))
        print(f"   ✓ 整页截图已保存")

        print("\n场景5: 多次交互")
        print("-" * 40)

        # 11. 连续点击测试
        print("1. 连续点击按钮...")
        click_btn = page.ele("#click-btn")
        for i in range(5):
            click_btn.click_self()
            page.wait(0.2)

        result = page.ele("#click-result").text
        print(f"   点击结果: {result}")

        # 12. 鼠标悬停测试
        print("2. 鼠标悬停测试...")
        hover_target = page.ele("#hover-target")
        hover_target.hover()
        page.wait(0.5)
        hover_result = page.ele("#hover-result").text
        print(f"   悬停结果: {hover_result}")

        # 12.1 isTrusted 行为验证
        print("3. isTrusted 行为验证...")
        page.ele("#click-btn").click_self()
        page.wait(0.2)
        page.ele("#text-input").input("T", clear=False)
        page.wait(0.2)
        hover_target.hover()
        page.wait(0.2)
        print(f"   click isTrusted: {page.is_trusted('click')}")
        print(f"   keydown isTrusted: {page.is_trusted('keydown')}")
        print(f"   mouseenter isTrusted: {page.is_trusted('mouseenter')}")

        print("\n场景6: 数据验证")
        print("-" * 40)

        # 13. 验证元素状态
        print("1. 验证元素状态...")
        disabled_btn = page.ele("#disabled-btn")
        print(f"   禁用按钮是否可用: {disabled_btn.is_enabled}")
        print(f"   禁用按钮是否显示: {disabled_btn.is_displayed}")

        # 14. 验证输入值
        print("2. 验证输入值...")
        text_value = page.ele("#text-input").value
        email_value = page.ele("#email-input").value
        print(f"   文本输入框: {text_value}")
        print(f"   邮箱输入框: {email_value}")

        # 15. 验证选择状态
        print("3. 验证选择状态...")
        checkbox1_checked = page.ele("#checkbox1").is_checked
        radio1_checked = page.ele("#radio1").is_checked
        print(f"   复选框1选中: {checkbox1_checked}")
        print(f"   单选框1选中: {radio1_checked}")

        print("\n" + "=" * 60)
        print("✓ 综合测试全部通过！")
        print(f"截图保存在: {output_dir}")
        print("=" * 60)

    except Exception as e:
        print(f"\n✗ 测试失败: {e}")
        import traceback

        traceback.print_exc()
    finally:
        page.wait(3)
        page.quit()


if __name__ == "__main__":
    test_comprehensive()

```
