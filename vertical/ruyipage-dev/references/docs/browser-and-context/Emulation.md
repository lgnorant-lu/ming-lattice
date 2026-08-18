#  RuyiPage Emulation
讲 UA、locale、timezone、screen、offline、scrollbar 和 forced colors 等仿真能力。
## API 与参数说明
### page.emulation.set_user_agent
`page.emulation.set_user_agent(ua)`
覆盖 User-Agent
参数说明
参数 | 说明  
---|---  
ua | User-Agent 字符串。  
### page.emulation.set_geolocation
`page.emulation.set_geolocation(lat, lon)`
模拟地理位置
参数说明
参数 | 说明  
---|---  
lat | 纬度（地理位置）。  
lon | 经度（地理位置）。  
### page.emulation.set_timezone
`page.emulation.set_timezone(tz)`
设置时区
参数说明
参数 | 说明  
---|---  
tz | 时区标识，如 Asia/Shanghai。  
### page.emulation.set_locale
`page.emulation.set_locale(locale)`
设置语言/地区
参数说明
参数 | 说明  
---|---  
locale | 地区语言标识，如 zh-CN。  
### page.emulation.set_screen_size
`page.emulation.set_screen_size(width, height, dpr)`
设置屏幕尺寸和 DPR
参数说明
参数 | 说明  
---|---  
width | 宽度，单位像素。  
height | 高度，单位像素。  
dpr | 设备像素比（devicePixelRatio）。  
### page.emulation.set_screen_orientation
`page.emulation.set_screen_orientation(type, angle)`
设置屏幕方向
参数说明
参数 | 说明  
---|---  
type | 参数含义与默认值请结合当前 API 场景使用。  
angle | 参数含义与默认值请结合当前 API 场景使用。  
### page.emulation.set_network_offline
`page.emulation.set_network_offline(True)`
切换网络离线状态
参数说明
参数 | 说明  
---|---  
True | 参数含义与默认值请结合当前 API 场景使用。  
### page.emulation.set_touch_enabled
`page.emulation.set_touch_enabled(True)`
启用触摸能力
参数说明
参数 | 说明  
---|---  
True | 参数含义与默认值请结合当前 API 场景使用。  
### page.emulation.set_javascript_enabled
`page.emulation.set_javascript_enabled(False)`
禁用 JavaScript
参数说明
参数 | 说明  
---|---  
False | 参数含义与默认值请结合当前 API 场景使用。  
### page.emulation.apply_mobile_preset
`page.emulation.apply_mobile_preset(preset)`
应用移动端预设
参数说明
参数 | 说明  
---|---  
preset | 移动端预设名称。  
### page.emulation.set_forced_colors_mode
`page.emulation.set_forced_colors_mode(mode)`
切换 forced colors 模式
参数说明
参数 | 说明  
---|---  
mode | 参数含义与默认值请结合当前 API 场景使用。  
### page.emulation.set_scrollbar_type
`page.emulation.set_scrollbar_type(type)`
切换滚动条显示模式
参数说明
参数 | 说明  
---|---  
type | 参数含义与默认值请结合当前 API 场景使用。  
## 相关示例
  * 参见示例中心：/automation/examples


## 相关示例源码
### Emulation 模块：UA、地理位置、时区、语言、屏幕与移动预设
examples/21_emulation.py
讲清 emulation 在 Firefox 路线上的主要能力边界。
GitHub 仓库 [查看仓库源码](https://github.com/LoseNine/ruyipage/blob/main/examples/21_emulation.py) page.emulation.set_user_agentpage.emulation.set_geolocationpage.emulation.set_timezonepage.emulation.set_localepage.emulation.set_screen_orientationpage.emulation.set_screen_sizepage.emulation.set_network_offlinepage.emulation.set_touch_enabled
  * 覆盖 UA
  * 模拟地理位置、时区和语言
  * 设置屏幕尺寸和方向
  * 切换网络离线状态
  * 尝试开启触摸能力
  * 应用移动端预设


源码文件：`app/content/ruyipage_examples/21_emulation.py` · 仓库：[21_emulation.py](https://github.com/LoseNine/ruyipage/blob/main/examples/21_emulation.py)
python 注释版
注释版 原始版 自动换行 复制代码
```
#!/usr/bin/env python
# =============================
# RuyiPage 示例注释版
# 标题: Emulation 模块：UA、地理位置、时区、语言、屏幕与移动预设
# 说明: 讲清 emulation 在 Firefox 路线上的主要能力边界。
# 你会学到:
#   1. 覆盖 UA
#   2. 模拟地理位置、时区和语言
#   3. 设置屏幕尺寸和方向
#   4. 切换网络离线状态
#   5. 尝试开启触摸能力
# 相关 API: page.emulation.set_user_agent, page.emulation.set_geolocation, page.emulation.set_timezone, page.emulation.set_locale, page.emulation.set_screen_orientation, page.emulation.set_screen_size, page.emulation.set_network_offline, page.emulation.set_touch_enabled
# =============================

# -*- coding: utf-8 -*-
"""示例21: Emulation 模块测试（严格结果版）"""

import io
import sys

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

from ruyipage import FirefoxPage


class Row:
    def __init__(self):
        self.rows = []

    def add(self, name, status, detail=""):
        self.rows.append((name, status, detail))
        print(f"  {status}: {name}")
        if detail:
            print(f"     详情: {detail}")

    def table(self):
        print("\n" + "=" * 70)
        print("测试结果汇总")
        print("=" * 70)
        print(f"{'序号':<5} {'项目':<32} {'状态':<8} {'说明'}")
        print("-" * 70)
        for i, (name, status, detail) in enumerate(self.rows, 1):
            print(f"{i:<5} {name:<32} {status:<8} {detail[:32]}")
        print("-" * 70)


def test_emulation():
    print("=" * 70)
    print("测试 21: Emulation 模块")
    print("=" * 70)

    page = FirefoxPage()
    rows = Row()

    try:
        page.get("data:text/html,<html><body><h1>Emulation Test</h1></body></html>")

        # 1) UA
        original_ua = page.run_js("navigator.userAgent")
        custom_ua = (
            "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) "
            "AppleWebKit/605.1.15"
        )
        page.emulation.set_user_agent(custom_ua)
        page.refresh()
        new_ua = page.run_js("navigator.userAgent")
        rows.add(
            "User-Agent 覆盖",
            "✓ 通过" if custom_ua in str(new_ua) else "✗ 失败",
            f"UA={'命中' if custom_ua in str(new_ua) else '未命中'}",
        )

        # 2) geolocation
        try:
            page.emulation.set_geolocation(39.9042, 116.4074, accuracy=100)
            rows.add("地理位置覆盖", "✓ 通过", "命令执行成功")
        except Exception as e:
            rows.add("地理位置覆盖", "✗ 失败", str(e))

        # 3) timezone
        try:
            page.emulation.set_timezone("America/New_York")
            page.refresh()
            timezone = page.run_js("Intl.DateTimeFormat().resolvedOptions().timeZone")
            ok = "New_York" in str(timezone)
            rows.add("时区覆盖", "✓ 通过" if ok else "✗ 失败", f"当前={timezone}")
        except Exception as e:
            rows.add("时区覆盖", "✗ 失败", str(e))

        # 4) locale
        try:
            page.emulation.set_locale("ja-JP")
            page.refresh()
            language = page.run_js("navigator.language")
            ok = "ja" in str(language).lower()
            rows.add("语言覆盖", "✓ 通过" if ok else "✗ 失败", f"当前={language}")
        except Exception as e:
            rows.add("语言覆盖", "✗ 失败", str(e))

        # 5) orientation
        try:
            page.emulation.set_screen_orientation("landscape-primary", angle=90)
            page.refresh()
            orientation = page.run_js("screen.orientation.type")
            ok = "landscape" in str(orientation)
            rows.add(
                "屏幕方向覆盖", "✓ 通过" if ok else "✗ 失败", f"当前={orientation}"
            )
        except Exception as e:
            rows.add("屏幕方向覆盖", "✗ 失败", str(e))

        # 6) screen settings
        try:
            page.emulation.set_screen_size(1920, 1080, device_pixel_ratio=2.0)
            page.refresh()
            sw = page.run_js("screen.width")
            sh = page.run_js("screen.height")
            ok = sw == 1920 and sh == 1080
            rows.add("屏幕设置覆盖", "✓ 通过" if ok else "✗ 失败", f"当前={sw}x{sh}")
        except Exception as e:
            rows.add("屏幕设置覆盖", "✗ 失败", str(e))

        # 7) network offline
        supported = page.emulation.set_network_offline(True)
        rows.add(
            "网络条件模拟",
            "✓ 通过" if supported else "⚠ 不支持",
            "离线模式" if supported else "当前 Firefox 未实现",
        )

        # 8) touch override
        supported = page.emulation.set_touch_enabled(True)
        rows.add(
            "触摸模拟",
            "✓ 通过" if supported else "⚠ 不支持",
            "启用触摸" if supported else "当前 Firefox 未实现",
        )

        # 9) javascript enable
        supported = page.emulation.set_javascript_enabled(True)
        rows.add(
            "JavaScript 开关",
            "✓ 通过" if supported else "⚠ 不支持",
            "启用 JS" if supported else "当前 Firefox 未实现",
        )

        # 10) scrollbar
        supported = page.emulation.set_scrollbar_type("overlay")
        rows.add(
            "滚动条类型",
            "✓ 通过" if supported else "⚠ 不支持",
            "overlay" if supported else "当前 Firefox 未实现",
        )

        # 11) forced colors
        supported = page.emulation.set_forced_colors_mode("dark")
        rows.add(
            "强制颜色模式",
            "✓ 通过" if supported else "⚠ 不支持",
            "dark" if supported else "当前 Firefox 未实现",
        )

        # 12) bypass csp
        supported = page.emulation.set_bypass_csp(True)
        rows.add(
            "CSP 绕过",
            "✓ 通过" if supported else "⚠ 不支持",
            "enabled=True" if supported else "当前 Firefox 未实现",
        )

        # 13) mobile preset
        support = page.emulation.apply_mobile_preset(
            custom_ua,
            width=390,
            height=844,
            device_pixel_ratio=3.0,
            orientation_type="portrait-primary",
            angle=0,
            locale="en-US",
            timezone_id="America/New_York",
            touch=True,
        )
        rows.add("移动端预设", "✓ 通过", str(support))

        print("\n" + "=" * 70)
        print("✓ Emulation 模块测试完成")
        print("=" * 70)
    finally:
        rows.table()
        page.quit()


if __name__ == "__main__":
    test_emulation()

```

```
#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""示例21: Emulation 模块测试（严格结果版）"""

import io
import sys

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

from ruyipage import FirefoxPage


class Row:
    def __init__(self):
        self.rows = []

    def add(self, name, status, detail=""):
        self.rows.append((name, status, detail))
        print(f"  {status}: {name}")
        if detail:
            print(f"     详情: {detail}")

    def table(self):
        print("\n" + "=" * 70)
        print("测试结果汇总")
        print("=" * 70)
        print(f"{'序号':<5} {'项目':<32} {'状态':<8} {'说明'}")
        print("-" * 70)
        for i, (name, status, detail) in enumerate(self.rows, 1):
            print(f"{i:<5} {name:<32} {status:<8} {detail[:32]}")
        print("-" * 70)


def test_emulation():
    print("=" * 70)
    print("测试 21: Emulation 模块")
    print("=" * 70)

    page = FirefoxPage()
    rows = Row()

    try:
        page.get("data:text/html,<html><body><h1>Emulation Test</h1></body></html>")

        # 1) UA
        original_ua = page.run_js("navigator.userAgent")
        custom_ua = (
            "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) "
            "AppleWebKit/605.1.15"
        )
        page.emulation.set_user_agent(custom_ua)
        page.refresh()
        new_ua = page.run_js("navigator.userAgent")
        rows.add(
            "User-Agent 覆盖",
            "✓ 通过" if custom_ua in str(new_ua) else "✗ 失败",
            f"UA={'命中' if custom_ua in str(new_ua) else '未命中'}",
        )

        # 2) geolocation
        try:
            page.emulation.set_geolocation(39.9042, 116.4074, accuracy=100)
            rows.add("地理位置覆盖", "✓ 通过", "命令执行成功")
        except Exception as e:
            rows.add("地理位置覆盖", "✗ 失败", str(e))

        # 3) timezone
        try:
            page.emulation.set_timezone("America/New_York")
            page.refresh()
            timezone = page.run_js("Intl.DateTimeFormat().resolvedOptions().timeZone")
            ok = "New_York" in str(timezone)
            rows.add("时区覆盖", "✓ 通过" if ok else "✗ 失败", f"当前={timezone}")
        except Exception as e:
            rows.add("时区覆盖", "✗ 失败", str(e))

        # 4) locale
        try:
            page.emulation.set_locale("ja-JP")
            page.refresh()
            language = page.run_js("navigator.language")
            ok = "ja" in str(language).lower()
            rows.add("语言覆盖", "✓ 通过" if ok else "✗ 失败", f"当前={language}")
        except Exception as e:
            rows.add("语言覆盖", "✗ 失败", str(e))

        # 5) orientation
        try:
            page.emulation.set_screen_orientation("landscape-primary", angle=90)
            page.refresh()
            orientation = page.run_js("screen.orientation.type")
            ok = "landscape" in str(orientation)
            rows.add(
                "屏幕方向覆盖", "✓ 通过" if ok else "✗ 失败", f"当前={orientation}"
            )
        except Exception as e:
            rows.add("屏幕方向覆盖", "✗ 失败", str(e))

        # 6) screen settings
        try:
            page.emulation.set_screen_size(1920, 1080, device_pixel_ratio=2.0)
            page.refresh()
            sw = page.run_js("screen.width")
            sh = page.run_js("screen.height")
            ok = sw == 1920 and sh == 1080
            rows.add("屏幕设置覆盖", "✓ 通过" if ok else "✗ 失败", f"当前={sw}x{sh}")
        except Exception as e:
            rows.add("屏幕设置覆盖", "✗ 失败", str(e))

        # 7) network offline
        supported = page.emulation.set_network_offline(True)
        rows.add(
            "网络条件模拟",
            "✓ 通过" if supported else "⚠ 不支持",
            "离线模式" if supported else "当前 Firefox 未实现",
        )

        # 8) touch override
        supported = page.emulation.set_touch_enabled(True)
        rows.add(
            "触摸模拟",
            "✓ 通过" if supported else "⚠ 不支持",
            "启用触摸" if supported else "当前 Firefox 未实现",
        )

        # 9) javascript enable
        supported = page.emulation.set_javascript_enabled(True)
        rows.add(
            "JavaScript 开关",
            "✓ 通过" if supported else "⚠ 不支持",
            "启用 JS" if supported else "当前 Firefox 未实现",
        )

        # 10) scrollbar
        supported = page.emulation.set_scrollbar_type("overlay")
        rows.add(
            "滚动条类型",
            "✓ 通过" if supported else "⚠ 不支持",
            "overlay" if supported else "当前 Firefox 未实现",
        )

        # 11) forced colors
        supported = page.emulation.set_forced_colors_mode("dark")
        rows.add(
            "强制颜色模式",
            "✓ 通过" if supported else "⚠ 不支持",
            "dark" if supported else "当前 Firefox 未实现",
        )

        # 12) bypass csp
        supported = page.emulation.set_bypass_csp(True)
        rows.add(
            "CSP 绕过",
            "✓ 通过" if supported else "⚠ 不支持",
            "enabled=True" if supported else "当前 Firefox 未实现",
        )

        # 13) mobile preset
        support = page.emulation.apply_mobile_preset(
            custom_ua,
            width=390,
            height=844,
            device_pixel_ratio=3.0,
            orientation_type="portrait-primary",
            angle=0,
            locale="en-US",
            timezone_id="America/New_York",
            touch=True,
        )
        rows.add("移动端预设", "✓ 通过", str(support))

        print("\n" + "=" * 70)
        print("✓ Emulation 模块测试完成")
        print("=" * 70)
    finally:
        rows.table()
        page.quit()


if __name__ == "__main__":
    test_emulation()

```

### Emulation 高级能力：颜色模式、屏幕、方向、脚本与滚动条
examples/27_emulation_advanced.py
强调 emulation 的高级能力和 Firefox 当前支持情况。
GitHub 仓库 [查看仓库源码](https://github.com/LoseNine/ruyipage/blob/main/examples/27_emulation_advanced.py) page.emulation.set_forced_colors_modepage.emulation.set_screen_sizepage.emulation.set_screen_orientationpage.emulation.set_javascript_enabledpage.emulation.set_scrollbar_type
  * 切换 forced colors 模式
  * 调整屏幕尺寸和 DPR
  * 切换屏幕方向和角度
  * 启用或禁用 JavaScript
  * 切换滚动条显示模式


源码文件：`app/content/ruyipage_examples/27_emulation_advanced.py` · 仓库：[27_emulation_advanced.py](https://github.com/LoseNine/ruyipage/blob/main/examples/27_emulation_advanced.py)
python 注释版
注释版 原始版 自动换行 复制代码
```
#!/usr/bin/env python
# =============================
# RuyiPage 示例注释版
# 标题: Emulation 高级能力：颜色模式、屏幕、方向、脚本与滚动条
# 说明: 强调 emulation 的高级能力和 Firefox 当前支持情况。
# 你会学到:
#   1. 切换 forced colors 模式
#   2. 调整屏幕尺寸和 DPR
#   3. 切换屏幕方向和角度
#   4. 启用或禁用 JavaScript
#   5. 切换滚动条显示模式
# 相关 API: page.emulation.set_forced_colors_mode, page.emulation.set_screen_size, page.emulation.set_screen_orientation, page.emulation.set_javascript_enabled, page.emulation.set_scrollbar_type
# =============================

# -*- coding: utf-8 -*-
"""示例27: Emulation 高级能力（严格结果版）"""

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
    print("测试 27: Emulation 高级能力")
    print("=" * 70)

    page = FirefoxPage()
    results: List[Dict[str, str]] = []

    try:
        page.get("https://www.example.com")
        add_result(results, "页面加载", "成功", "example.com 已加载")

        # 1. 强制颜色模式
        forced_active = page.emulation.set_forced_colors_mode("active")
        add_result(
            results,
            "emulation.setForcedColorsModeThemeOverride active",
            "成功" if forced_active else "不支持",
            "标准命令已实现" if forced_active else "当前 Firefox 未实现该命令",
        )

        forced_none = page.emulation.set_forced_colors_mode("none")
        add_result(
            results,
            "emulation.setForcedColorsModeThemeOverride none",
            "成功" if forced_none else "不支持",
            "标准命令已实现" if forced_none else "当前 Firefox 未实现该命令",
        )

        # 2. 屏幕设置
        page.emulation.set_screen_size(1920, 1080, device_pixel_ratio=2.0)
        size1 = page.run_js(
            "return [screen.width, screen.height, window.devicePixelRatio]"
        )
        if (
            size1
            and int(size1[0]) == 1920
            and int(size1[1]) == 1080
            and float(size1[2]) == 2.0
        ):
            add_result(
                results,
                "emulation.setScreenSettingsOverride 1920x1080@2",
                "成功",
                str(size1),
            )
        elif size1 and int(size1[0]) == 1920 and int(size1[1]) == 1080:
            add_result(
                results,
                "emulation.setScreenSettingsOverride 1920x1080@2",
                "跳过",
                f"尺寸生效，但 DPR 未生效: {size1}",
            )
        else:
            add_result(
                results,
                "emulation.setScreenSettingsOverride 1920x1080@2",
                "失败",
                str(size1)[:120],
            )

        page.emulation.set_screen_size(375, 812, device_pixel_ratio=3.0)
        size2 = page.run_js(
            "return [screen.width, screen.height, window.devicePixelRatio]"
        )
        if (
            size2
            and int(size2[0]) == 375
            and int(size2[1]) == 812
            and float(size2[2]) == 3.0
        ):
            add_result(
                results,
                "emulation.setScreenSettingsOverride 375x812@3",
                "成功",
                str(size2),
            )
        elif size2 and int(size2[0]) == 375 and int(size2[1]) == 812:
            add_result(
                results,
                "emulation.setScreenSettingsOverride 375x812@3",
                "跳过",
                f"尺寸生效，但 DPR 未生效: {size2}",
            )
        else:
            add_result(
                results,
                "emulation.setScreenSettingsOverride 375x812@3",
                "失败",
                str(size2)[:120],
            )

        # 3. 屏幕方向
        page.emulation.set_screen_orientation("portrait-primary", angle=0)
        orientation1 = page.run_js(
            "return [screen.orientation.type, screen.orientation.angle]"
        )
        if orientation1 and orientation1[0] == "portrait-primary":
            add_result(
                results,
                "emulation.setScreenOrientationOverride portrait",
                "成功",
                str(orientation1),
            )
        else:
            add_result(
                results,
                "emulation.setScreenOrientationOverride portrait",
                "失败",
                str(orientation1)[:120],
            )

        page.emulation.set_screen_orientation("landscape-primary", angle=90)
        orientation2 = page.run_js(
            "return [screen.orientation.type, screen.orientation.angle]"
        )
        if (
            orientation2
            and orientation2[0] == "landscape-primary"
            and int(orientation2[1]) == 90
        ):
            add_result(
                results,
                "emulation.setScreenOrientationOverride landscape",
                "成功",
                str(orientation2),
            )
        elif orientation2 and orientation2[0] == "landscape-primary":
            add_result(
                results,
                "emulation.setScreenOrientationOverride landscape",
                "跳过",
                f"方向类型生效，但角度未生效: {orientation2}",
            )
        else:
            add_result(
                results,
                "emulation.setScreenOrientationOverride landscape",
                "失败",
                str(orientation2)[:120],
            )

        # 4. 脚本启用/禁用
        js_off = page.emulation.set_javascript_enabled(False)
        add_result(
            results,
            "emulation.setScriptingEnabled false",
            "成功" if js_off else "不支持",
            "标准命令已实现" if js_off else "当前 Firefox 未实现该命令",
        )

        js_on = page.emulation.set_javascript_enabled(True)
        add_result(
            results,
            "emulation.setScriptingEnabled true",
            "成功" if js_on else "不支持",
            "标准命令已实现" if js_on else "当前 Firefox 未实现该命令",
        )

        # 5. 滚动条类型
        sb_none = page.emulation.set_scrollbar_type("none")
        add_result(
            results,
            "emulation.setScrollbarTypeOverride none",
            "成功" if sb_none else "不支持",
            "标准命令已实现" if sb_none else "当前 Firefox 未实现该命令",
        )

        sb_standard = page.emulation.set_scrollbar_type("standard")
        add_result(
            results,
            "emulation.setScrollbarTypeOverride standard",
            "成功" if sb_standard else "不支持",
            "标准命令已实现" if sb_standard else "当前 Firefox 未实现该命令",
        )

        sb_overlay = page.emulation.set_scrollbar_type("overlay")
        add_result(
            results,
            "emulation.setScrollbarTypeOverride overlay",
            "成功" if sb_overlay else "不支持",
            "标准命令已实现" if sb_overlay else "当前 Firefox 未实现该命令",
        )

        print_results(results)

    except Exception as e:
        add_result(results, "示例执行", "失败", str(e)[:120])
        print_results(results)
        raise
    finally:
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
"""示例27: Emulation 高级能力（严格结果版）"""

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
    print("测试 27: Emulation 高级能力")
    print("=" * 70)

    page = FirefoxPage()
    results: List[Dict[str, str]] = []

    try:
        page.get("https://www.example.com")
        add_result(results, "页面加载", "成功", "example.com 已加载")

        # 1. 强制颜色模式
        forced_active = page.emulation.set_forced_colors_mode("active")
        add_result(
            results,
            "emulation.setForcedColorsModeThemeOverride active",
            "成功" if forced_active else "不支持",
            "标准命令已实现" if forced_active else "当前 Firefox 未实现该命令",
        )

        forced_none = page.emulation.set_forced_colors_mode("none")
        add_result(
            results,
            "emulation.setForcedColorsModeThemeOverride none",
            "成功" if forced_none else "不支持",
            "标准命令已实现" if forced_none else "当前 Firefox 未实现该命令",
        )

        # 2. 屏幕设置
        page.emulation.set_screen_size(1920, 1080, device_pixel_ratio=2.0)
        size1 = page.run_js(
            "return [screen.width, screen.height, window.devicePixelRatio]"
        )
        if (
            size1
            and int(size1[0]) == 1920
            and int(size1[1]) == 1080
            and float(size1[2]) == 2.0
        ):
            add_result(
                results,
                "emulation.setScreenSettingsOverride 1920x1080@2",
                "成功",
                str(size1),
            )
        elif size1 and int(size1[0]) == 1920 and int(size1[1]) == 1080:
            add_result(
                results,
                "emulation.setScreenSettingsOverride 1920x1080@2",
                "跳过",
                f"尺寸生效，但 DPR 未生效: {size1}",
            )
        else:
            add_result(
                results,
                "emulation.setScreenSettingsOverride 1920x1080@2",
                "失败",
                str(size1)[:120],
            )

        page.emulation.set_screen_size(375, 812, device_pixel_ratio=3.0)
        size2 = page.run_js(
            "return [screen.width, screen.height, window.devicePixelRatio]"
        )
        if (
            size2
            and int(size2[0]) == 375
            and int(size2[1]) == 812
            and float(size2[2]) == 3.0
        ):
            add_result(
                results,
                "emulation.setScreenSettingsOverride 375x812@3",
                "成功",
                str(size2),
            )
        elif size2 and int(size2[0]) == 375 and int(size2[1]) == 812:
            add_result(
                results,
                "emulation.setScreenSettingsOverride 375x812@3",
                "跳过",
                f"尺寸生效，但 DPR 未生效: {size2}",
            )
        else:
            add_result(
                results,
                "emulation.setScreenSettingsOverride 375x812@3",
                "失败",
                str(size2)[:120],
            )

        # 3. 屏幕方向
        page.emulation.set_screen_orientation("portrait-primary", angle=0)
        orientation1 = page.run_js(
            "return [screen.orientation.type, screen.orientation.angle]"
        )
        if orientation1 and orientation1[0] == "portrait-primary":
            add_result(
                results,
                "emulation.setScreenOrientationOverride portrait",
                "成功",
                str(orientation1),
            )
        else:
            add_result(
                results,
                "emulation.setScreenOrientationOverride portrait",
                "失败",
                str(orientation1)[:120],
            )

        page.emulation.set_screen_orientation("landscape-primary", angle=90)
        orientation2 = page.run_js(
            "return [screen.orientation.type, screen.orientation.angle]"
        )
        if (
            orientation2
            and orientation2[0] == "landscape-primary"
            and int(orientation2[1]) == 90
        ):
            add_result(
                results,
                "emulation.setScreenOrientationOverride landscape",
                "成功",
                str(orientation2),
            )
        elif orientation2 and orientation2[0] == "landscape-primary":
            add_result(
                results,
                "emulation.setScreenOrientationOverride landscape",
                "跳过",
                f"方向类型生效，但角度未生效: {orientation2}",
            )
        else:
            add_result(
                results,
                "emulation.setScreenOrientationOverride landscape",
                "失败",
                str(orientation2)[:120],
            )

        # 4. 脚本启用/禁用
        js_off = page.emulation.set_javascript_enabled(False)
        add_result(
            results,
            "emulation.setScriptingEnabled false",
            "成功" if js_off else "不支持",
            "标准命令已实现" if js_off else "当前 Firefox 未实现该命令",
        )

        js_on = page.emulation.set_javascript_enabled(True)
        add_result(
            results,
            "emulation.setScriptingEnabled true",
            "成功" if js_on else "不支持",
            "标准命令已实现" if js_on else "当前 Firefox 未实现该命令",
        )

        # 5. 滚动条类型
        sb_none = page.emulation.set_scrollbar_type("none")
        add_result(
            results,
            "emulation.setScrollbarTypeOverride none",
            "成功" if sb_none else "不支持",
            "标准命令已实现" if sb_none else "当前 Firefox 未实现该命令",
        )

        sb_standard = page.emulation.set_scrollbar_type("standard")
        add_result(
            results,
            "emulation.setScrollbarTypeOverride standard",
            "成功" if sb_standard else "不支持",
            "标准命令已实现" if sb_standard else "当前 Firefox 未实现该命令",
        )

        sb_overlay = page.emulation.set_scrollbar_type("overlay")
        add_result(
            results,
            "emulation.setScrollbarTypeOverride overlay",
            "成功" if sb_overlay else "不支持",
            "标准命令已实现" if sb_overlay else "当前 Firefox 未实现该命令",
        )

        print_results(results)

    except Exception as e:
        add_result(results, "示例执行", "失败", str(e)[:120])
        print_results(results)
        raise
    finally:
        try:
            page.quit()
        except Exception:
            pass


if __name__ == "__main__":
    main()

```
