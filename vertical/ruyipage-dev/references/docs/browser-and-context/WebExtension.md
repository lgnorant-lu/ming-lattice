#  RuyiPage WebExtension
目录扩展和 XPI 安装能力适合浏览器级扩展实验。
## API 与参数说明
### page.extensions.install
`page.extensions.install(path)`
安装目录扩展
参数说明
参数 | 说明  
---|---  
path | 本地文件路径或目录路径。  
### page.extensions.install_archive
`page.extensions.install_archive(path)`
安装 XPI 打包扩展
参数说明
参数 | 说明  
---|---  
path | 本地文件路径或目录路径。  
### page.extensions.uninstall
`page.extensions.uninstall(ext_id)`
卸载指定扩展
参数说明
参数 | 说明  
---|---  
ext_id | 参数含义与默认值请结合当前 API 场景使用。  
### page.extensions.uninstall_all
`page.extensions.uninstall_all()`
卸载所有测试扩展
## 相关示例
  * 参见示例中心：/automation/examples


## 相关示例源码
### WebExtension：目录扩展与 XPI 安装卸载
examples/22_web_extension.py
覆盖扩展安装、验证注入和卸载，是浏览器级能力的重要专题。
GitHub 仓库 [查看仓库源码](https://github.com/LoseNine/ruyipage/blob/main/examples/22_web_extension.py) page.extensions.installpage.extensions.install_archivepage.extensions.uninstallpage.extensions.uninstall_allpage.run_js
  * 安装目录扩展
  * 验证 content script 生效
  * 打包并安装 XPI 扩展
  * 卸载指定扩展与清空测试扩展


源码文件：`app/content/ruyipage_examples/22_web_extension.py` · 仓库：[22_web_extension.py](https://github.com/LoseNine/ruyipage/blob/main/examples/22_web_extension.py)
python 注释版
注释版 原始版 自动换行 复制代码
```
#!/usr/bin/env python
# =============================
# RuyiPage 示例注释版
# 标题: WebExtension：目录扩展与 XPI 安装卸载
# 说明: 覆盖扩展安装、验证注入和卸载，是浏览器级能力的重要专题。
# 你会学到:
#   1. 安装目录扩展
#   2. 验证 content script 生效
#   3. 打包并安装 XPI 扩展
#   4. 卸载指定扩展与清空测试扩展
# 相关 API: page.extensions.install, page.extensions.install_archive, page.extensions.uninstall, page.extensions.uninstall_all, page.run_js
# =============================

# -*- coding: utf-8 -*-
"""示例22: WebExtension 模块测试（完整链路版）

完整链路：
1) 创建测试扩展
2) 安装目录扩展
3) 验证扩展已安装
4) 卸载目录扩展
5) 打包 xpi 并安装
6) 验证扩展已安装
7) 卸载打包扩展
8) 清理测试文件

说明：
- WebExtension BiDi 规范只提供 install / uninstall 命令。
- 当前 Firefox 环境下若返回 unknown command，则视为“当前版本不支持”，不是脚本错误。
"""

import io
import json
import os
import shutil
import sys
import zipfile

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

from ruyipage import FirefoxPage


class Rows:
    def __init__(self):
        self.rows = []

    def add(self, name, status, detail=""):
        self.rows.append((name, status, detail))
        print(f"  {status}: {name}")
        if detail:
            print(f"     详情: {detail}")

    def summary(self):
        print("\n" + "=" * 70)
        print("测试结果汇总")
        print("=" * 70)
        print(f"{'序号':<5} {'项目':<28} {'状态':<8} {'说明'}")
        print("-" * 70)
        for i, (name, status, detail) in enumerate(self.rows, 1):
            print(f"{i:<5} {name:<28} {status:<8} {detail[:36]}")
        print("-" * 70)


def _create_test_extension(ext_dir):
    os.makedirs(ext_dir, exist_ok=True)
    manifest = {
        "manifest_version": 2,
        "name": "RuyiPage Test Extension",
        "version": "1.0.0",
        "description": "测试扩展",
        "browser_specific_settings": {
            "gecko": {
                "id": "test@ruyipage.com",
                "strict_min_version": "109.0",
            }
        },
        "background": {"scripts": ["background.js"]},
        "content_scripts": [
            {
                "matches": ["<all_urls>"],
                "js": ["content.js"],
                "run_at": "document_end",
            }
        ],
        "permissions": [],
    }
    with open(os.path.join(ext_dir, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    with open(os.path.join(ext_dir, "background.js"), "w", encoding="utf-8") as f:
        f.write("console.log('RuyiPage Test Extension loaded!');")

    with open(os.path.join(ext_dir, "content.js"), "w", encoding="utf-8") as f:
        f.write(
            "document.documentElement.setAttribute('data-ruyi-extension', 'loaded');"
        )


def _page_has_extension_marker(page):
    return (
        page.run_js(
            "return document.documentElement.getAttribute('data-ruyi-extension')"
        )
        == "loaded"
    )


def _safe_install(page, path, rows, label):
    try:
        ext_id = page.extensions.install(path)
        if ext_id:
            rows.add(label, "✓ 通过", f"extension_id={ext_id}")
            return ext_id
        rows.add(label, "⚠ 不支持", "当前 Firefox 未返回 extension id")
        return None
    except Exception as e:
        msg = str(e).lower()
        if "unknown command" in msg or "not supported" in msg:
            rows.add(label, "⚠ 不支持", "当前 Firefox 不支持 webExtension.install")
            return None
        raise


def test_web_extension():
    print("=" * 70)
    print("测试 22: WebExtension 模块")
    print("=" * 70)

    page = FirefoxPage()
    rows = Rows()
    ext_dir = "E:/ruyipage/examples/test_extension"
    xpi_path = "E:/ruyipage/examples/test_extension.xpi"

    ext_id = None
    ext_id2 = None

    try:
        # 1) 创建测试扩展
        _create_test_extension(ext_dir)
        rows.add("创建测试扩展", "✓ 通过", ext_dir)

        # 2) 安装目录扩展
        ext_id = _safe_install(page, ext_dir, rows, "安装目录扩展")

        # 3) 验证目录扩展已生效
        if ext_id:
            page.get("https://example.com")
            page.wait(1.5)
            marker = _page_has_extension_marker(page)
            rows.add(
                "目录扩展生效验证",
                "✓ 通过" if marker else "✗ 失败",
                "content script 已注入" if marker else "未检测到注入标记",
            )
        else:
            rows.add("目录扩展生效验证", "⚠ 跳过", "安装未成功")

        # 4) 卸载目录扩展
        if ext_id:
            page.extensions.uninstall(ext_id)
            rows.add("卸载目录扩展", "✓ 通过")
        else:
            rows.add("卸载目录扩展", "⚠ 跳过", "未安装成功")

        # 5) 打包 xpi
        with zipfile.ZipFile(xpi_path, "w", zipfile.ZIP_DEFLATED) as zipf:
            zipf.write(os.path.join(ext_dir, "manifest.json"), "manifest.json")
            zipf.write(os.path.join(ext_dir, "background.js"), "background.js")
            zipf.write(os.path.join(ext_dir, "content.js"), "content.js")
        rows.add("打包 XPI", "✓ 通过", xpi_path)

        # 6) 安装打包扩展
        try:
            ext_id2 = page.extensions.install_archive(xpi_path)
            if ext_id2:
                rows.add("安装 XPI 扩展", "✓ 通过", f"extension_id={ext_id2}")
            else:
                rows.add(
                    "安装 XPI 扩展", "⚠ 不支持", "当前 Firefox 未返回 extension id"
                )
        except Exception as e:
            msg = str(e).lower()
            if "unknown command" in msg or "not supported" in msg:
                rows.add(
                    "安装 XPI 扩展",
                    "⚠ 不支持",
                    "当前 Firefox 不支持 webExtension.install",
                )
            else:
                raise

        # 7) 验证 XPI 扩展已生效
        if ext_id2:
            page.get("https://example.com")
            page.wait(1.5)
            marker = _page_has_extension_marker(page)
            rows.add(
                "XPI 扩展生效验证",
                "✓ 通过" if marker else "✗ 失败",
                "content script 已注入" if marker else "未检测到注入标记",
            )
        else:
            rows.add("XPI 扩展生效验证", "⚠ 跳过", "安装未成功")

        # 8) 卸载打包扩展
        if ext_id2:
            page.extensions.uninstall(ext_id2)
            rows.add("卸载 XPI 扩展", "✓ 通过")
        else:
            rows.add("卸载 XPI 扩展", "⚠ 跳过", "未安装成功")

        print("\n" + "=" * 70)
        print("✓ WebExtension 模块测试完成")
        print("=" * 70)

    except Exception as e:
        rows.add("WebExtension 模块", "✗ 失败", str(e))
        import traceback

        traceback.print_exc()
    finally:
        try:
            page.extensions.uninstall_all()
        except Exception:
            pass
        page.quit()

        if os.path.exists(ext_dir):
            shutil.rmtree(ext_dir)
        if os.path.exists(xpi_path):
            os.remove(xpi_path)

        rows.add("清理测试文件", "✓ 通过")
        rows.summary()


if __name__ == "__main__":
    test_web_extension()

```

```
#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""示例22: WebExtension 模块测试（完整链路版）

完整链路：
1) 创建测试扩展
2) 安装目录扩展
3) 验证扩展已安装
4) 卸载目录扩展
5) 打包 xpi 并安装
6) 验证扩展已安装
7) 卸载打包扩展
8) 清理测试文件

说明：
- WebExtension BiDi 规范只提供 install / uninstall 命令。
- 当前 Firefox 环境下若返回 unknown command，则视为“当前版本不支持”，不是脚本错误。
"""

import io
import json
import os
import shutil
import sys
import zipfile

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

from ruyipage import FirefoxPage


class Rows:
    def __init__(self):
        self.rows = []

    def add(self, name, status, detail=""):
        self.rows.append((name, status, detail))
        print(f"  {status}: {name}")
        if detail:
            print(f"     详情: {detail}")

    def summary(self):
        print("\n" + "=" * 70)
        print("测试结果汇总")
        print("=" * 70)
        print(f"{'序号':<5} {'项目':<28} {'状态':<8} {'说明'}")
        print("-" * 70)
        for i, (name, status, detail) in enumerate(self.rows, 1):
            print(f"{i:<5} {name:<28} {status:<8} {detail[:36]}")
        print("-" * 70)


def _create_test_extension(ext_dir):
    os.makedirs(ext_dir, exist_ok=True)
    manifest = {
        "manifest_version": 2,
        "name": "RuyiPage Test Extension",
        "version": "1.0.0",
        "description": "测试扩展",
        "browser_specific_settings": {
            "gecko": {
                "id": "test@ruyipage.com",
                "strict_min_version": "109.0",
            }
        },
        "background": {"scripts": ["background.js"]},
        "content_scripts": [
            {
                "matches": ["<all_urls>"],
                "js": ["content.js"],
                "run_at": "document_end",
            }
        ],
        "permissions": [],
    }
    with open(os.path.join(ext_dir, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    with open(os.path.join(ext_dir, "background.js"), "w", encoding="utf-8") as f:
        f.write("console.log('RuyiPage Test Extension loaded!');")

    with open(os.path.join(ext_dir, "content.js"), "w", encoding="utf-8") as f:
        f.write(
            "document.documentElement.setAttribute('data-ruyi-extension', 'loaded');"
        )


def _page_has_extension_marker(page):
    return (
        page.run_js(
            "return document.documentElement.getAttribute('data-ruyi-extension')"
        )
        == "loaded"
    )


def _safe_install(page, path, rows, label):
    try:
        ext_id = page.extensions.install(path)
        if ext_id:
            rows.add(label, "✓ 通过", f"extension_id={ext_id}")
            return ext_id
        rows.add(label, "⚠ 不支持", "当前 Firefox 未返回 extension id")
        return None
    except Exception as e:
        msg = str(e).lower()
        if "unknown command" in msg or "not supported" in msg:
            rows.add(label, "⚠ 不支持", "当前 Firefox 不支持 webExtension.install")
            return None
        raise


def test_web_extension():
    print("=" * 70)
    print("测试 22: WebExtension 模块")
    print("=" * 70)

    page = FirefoxPage()
    rows = Rows()
    ext_dir = "E:/ruyipage/examples/test_extension"
    xpi_path = "E:/ruyipage/examples/test_extension.xpi"

    ext_id = None
    ext_id2 = None

    try:
        # 1) 创建测试扩展
        _create_test_extension(ext_dir)
        rows.add("创建测试扩展", "✓ 通过", ext_dir)

        # 2) 安装目录扩展
        ext_id = _safe_install(page, ext_dir, rows, "安装目录扩展")

        # 3) 验证目录扩展已生效
        if ext_id:
            page.get("https://example.com")
            page.wait(1.5)
            marker = _page_has_extension_marker(page)
            rows.add(
                "目录扩展生效验证",
                "✓ 通过" if marker else "✗ 失败",
                "content script 已注入" if marker else "未检测到注入标记",
            )
        else:
            rows.add("目录扩展生效验证", "⚠ 跳过", "安装未成功")

        # 4) 卸载目录扩展
        if ext_id:
            page.extensions.uninstall(ext_id)
            rows.add("卸载目录扩展", "✓ 通过")
        else:
            rows.add("卸载目录扩展", "⚠ 跳过", "未安装成功")

        # 5) 打包 xpi
        with zipfile.ZipFile(xpi_path, "w", zipfile.ZIP_DEFLATED) as zipf:
            zipf.write(os.path.join(ext_dir, "manifest.json"), "manifest.json")
            zipf.write(os.path.join(ext_dir, "background.js"), "background.js")
            zipf.write(os.path.join(ext_dir, "content.js"), "content.js")
        rows.add("打包 XPI", "✓ 通过", xpi_path)

        # 6) 安装打包扩展
        try:
            ext_id2 = page.extensions.install_archive(xpi_path)
            if ext_id2:
                rows.add("安装 XPI 扩展", "✓ 通过", f"extension_id={ext_id2}")
            else:
                rows.add(
                    "安装 XPI 扩展", "⚠ 不支持", "当前 Firefox 未返回 extension id"
                )
        except Exception as e:
            msg = str(e).lower()
            if "unknown command" in msg or "not supported" in msg:
                rows.add(
                    "安装 XPI 扩展",
                    "⚠ 不支持",
                    "当前 Firefox 不支持 webExtension.install",
                )
            else:
                raise

        # 7) 验证 XPI 扩展已生效
        if ext_id2:
            page.get("https://example.com")
            page.wait(1.5)
            marker = _page_has_extension_marker(page)
            rows.add(
                "XPI 扩展生效验证",
                "✓ 通过" if marker else "✗ 失败",
                "content script 已注入" if marker else "未检测到注入标记",
            )
        else:
            rows.add("XPI 扩展生效验证", "⚠ 跳过", "安装未成功")

        # 8) 卸载打包扩展
        if ext_id2:
            page.extensions.uninstall(ext_id2)
            rows.add("卸载 XPI 扩展", "✓ 通过")
        else:
            rows.add("卸载 XPI 扩展", "⚠ 跳过", "未安装成功")

        print("\n" + "=" * 70)
        print("✓ WebExtension 模块测试完成")
        print("=" * 70)

    except Exception as e:
        rows.add("WebExtension 模块", "✗ 失败", str(e))
        import traceback

        traceback.print_exc()
    finally:
        try:
            page.extensions.uninstall_all()
        except Exception:
            pass
        page.quit()

        if os.path.exists(ext_dir):
            shutil.rmtree(ext_dir)
        if os.path.exists(xpi_path):
            os.remove(xpi_path)

        rows.add("清理测试文件", "✓ 通过")
        rows.summary()


if __name__ == "__main__":
    test_web_extension()

```
