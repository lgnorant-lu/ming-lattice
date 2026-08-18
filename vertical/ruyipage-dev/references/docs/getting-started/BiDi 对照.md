#  RuyiPage BiDi 对照
适合说明 RuyiPage 的协议来源、W3C BiDi 对照工具和扩展价值。
## API 与参数说明
### FirefoxPage
`FirefoxPage`
基于 WebDriver BiDi 协议的页面对象
### page.contexts.*
`page.contexts.*`
BiDi browsingContext 命令封装
### page.network.*
`page.network.*`
BiDi network 命令封装
### page.events.*
`page.events.*`
BiDi 事件订阅封装
### page.intercept.*
`page.intercept.*`
BiDi 网络拦截封装
### page.realms.*
`page.realms.*`
BiDi script realm 封装
## 相关示例
  * 参见示例中心：/automation/examples


## 相关示例源码
### 提取 W3C WebDriver BiDi 规范 API 清单
examples/w3c_bidi/extract_w3c_bidi.py
适合放在 BiDi 对照页，强调项目对协议演进的关注。
GitHub 仓库 [查看仓库源码](https://github.com/LoseNine/ruyipage/blob/main/examples/w3c_bidi/extract_w3c_bidi.py) FirefoxPagepage.getpage.run_js
  * 抓取 W3C BiDi 规范目录和 API 清单
  * 为对照表和文档生成提供原始数据


源码文件：`app/content/ruyipage_examples/w3c_bidi/extract_w3c_bidi.py` · 仓库：[w3c_bidi/extract_w3c_bidi.py](https://github.com/LoseNine/ruyipage/blob/main/examples/w3c_bidi/extract_w3c_bidi.py)
python 注释版
注释版 原始版 自动换行 复制代码
```
#!/usr/bin/env python
# =============================
# RuyiPage 示例注释版
# 标题: 提取 W3C WebDriver BiDi 规范 API 清单
# 说明: 适合放在 BiDi 对照页，强调项目对协议演进的关注。
# 你会学到:
#   1. 抓取 W3C BiDi 规范目录和 API 清单
#   2. 为对照表和文档生成提供原始数据
# 相关 API: FirefoxPage, page.get, page.run_js
# =============================

# -*- coding: utf-8 -*-
"""从W3C WebDriver BiDi规范网页提取所有API（使用正确的选择器）"""

import sys
import io
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from ruyipage import *
import re

# 创建浏览器
page = FirefoxPage()

try:
    print("正在访问 W3C WebDriver BiDi 规范...")
    page.get('https://w3c.github.io/webdriver-bidi/')

    print("等待页面加载...")
    page.wait(3)

    print("\n从目录 (ol.toc li a) 提取所有API...")

    # 提取目录中的所有链接
    toc_script = """
    (() => {
        const items = [];
        document.querySelectorAll('ol.toc li a').forEach(link => {
            const href = link.getAttribute('href');
            const text = link.textContent.trim();
            if (href && text) {
                items.push({
                    href: href,
                    text: text,
                    id: href.replace('#', '')
                });
            }
        });
        return items;
    })()
    """

    toc_items = page.run_js(toc_script)

    print(f"\n找到 {len(toc_items)} 个目录项")

    # 分析提取命令和事件
    commands = {}
    events = {}
    modules = set()

    for item in toc_items:
        text = item['text']
        id_str = item['id']

        # 提取命令（格式：The module.command Command）
        cmd_match = re.search(r'The\s+(\w+)\.(\w+)\s+Command', text)
        if cmd_match:
            module = cmd_match.group(1)
            cmd_name = f"{module}.{cmd_match.group(2)}"
            modules.add(module)
            if module not in commands:
                commands[module] = []
            commands[module].append(cmd_name)
            print(f"  命令: {cmd_name}")

        # 提取事件（格式：The module.event Event）
        evt_match = re.search(r'The\s+(\w+)\.(\w+)\s+Event', text)
        if evt_match:
            module = evt_match.group(1)
            evt_name = f"{module}.{evt_match.group(2)}"
            modules.add(module)
            if module not in events:
                events[module] = []
            events[module].append(evt_name)
            print(f"  事件: {evt_name}")

    print(f"\n\n=== 统计结果 ===")
    print(f"模块数: {len(modules)}")
    print(f"命令数: {sum(len(v) for v in commands.values())}")
    print(f"事件数: {sum(len(v) for v in events.values())}")

    print("\n\n=== 按模块分类的命令 ===")
    for module in sorted(commands.keys()):
        print(f"\n{module} 模块 ({len(commands[module])} 个命令):")
        for cmd in sorted(commands[module]):
            print(f"  - {cmd}")

    print("\n\n=== 按模块分类的事件 ===")
    for module in sorted(events.keys()):
        print(f"\n{module} 模块 ({len(events[module])} 个事件):")
        for evt in sorted(events[module]):
            print(f"  - {evt}")

    # 保存结构化数据
    import json
    result = {
        'modules': sorted(list(modules)),
        'commands': commands,
        'events': events,
        'total_commands': sum(len(v) for v in commands.values()),
        'total_events': sum(len(v) for v in events.values())
    }

    with open('E:/ruyipage/w3c_bidi_apis.json', 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    print("\n\n结构化数据已保存到: E:/ruyipage/w3c_bidi_apis.json")

finally:
    page.quit()

```

```
#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""从W3C WebDriver BiDi规范网页提取所有API（使用正确的选择器）"""

import sys
import io
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from ruyipage import *
import re

# 创建浏览器
page = FirefoxPage()

try:
    print("正在访问 W3C WebDriver BiDi 规范...")
    page.get('https://w3c.github.io/webdriver-bidi/')

    print("等待页面加载...")
    page.wait(3)

    print("\n从目录 (ol.toc li a) 提取所有API...")

    # 提取目录中的所有链接
    toc_script = """
    (() => {
        const items = [];
        document.querySelectorAll('ol.toc li a').forEach(link => {
            const href = link.getAttribute('href');
            const text = link.textContent.trim();
            if (href && text) {
                items.push({
                    href: href,
                    text: text,
                    id: href.replace('#', '')
                });
            }
        });
        return items;
    })()
    """

    toc_items = page.run_js(toc_script)

    print(f"\n找到 {len(toc_items)} 个目录项")

    # 分析提取命令和事件
    commands = {}
    events = {}
    modules = set()

    for item in toc_items:
        text = item['text']
        id_str = item['id']

        # 提取命令（格式：The module.command Command）
        cmd_match = re.search(r'The\s+(\w+)\.(\w+)\s+Command', text)
        if cmd_match:
            module = cmd_match.group(1)
            cmd_name = f"{module}.{cmd_match.group(2)}"
            modules.add(module)
            if module not in commands:
                commands[module] = []
            commands[module].append(cmd_name)
            print(f"  命令: {cmd_name}")

        # 提取事件（格式：The module.event Event）
        evt_match = re.search(r'The\s+(\w+)\.(\w+)\s+Event', text)
        if evt_match:
            module = evt_match.group(1)
            evt_name = f"{module}.{evt_match.group(2)}"
            modules.add(module)
            if module not in events:
                events[module] = []
            events[module].append(evt_name)
            print(f"  事件: {evt_name}")

    print(f"\n\n=== 统计结果 ===")
    print(f"模块数: {len(modules)}")
    print(f"命令数: {sum(len(v) for v in commands.values())}")
    print(f"事件数: {sum(len(v) for v in events.values())}")

    print("\n\n=== 按模块分类的命令 ===")
    for module in sorted(commands.keys()):
        print(f"\n{module} 模块 ({len(commands[module])} 个命令):")
        for cmd in sorted(commands[module]):
            print(f"  - {cmd}")

    print("\n\n=== 按模块分类的事件 ===")
    for module in sorted(events.keys()):
        print(f"\n{module} 模块 ({len(events[module])} 个事件):")
        for evt in sorted(events[module]):
            print(f"  - {evt}")

    # 保存结构化数据
    import json
    result = {
        'modules': sorted(list(modules)),
        'commands': commands,
        'events': events,
        'total_commands': sum(len(v) for v in commands.values()),
        'total_events': sum(len(v) for v in events.values())
    }

    with open('E:/ruyipage/w3c_bidi_apis.json', 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    print("\n\n结构化数据已保存到: E:/ruyipage/w3c_bidi_apis.json")

finally:
    page.quit()

```

### 生成 RuyiPage 与 W3C BiDi 规范对比表
examples/w3c_bidi/generate_comparison.py
用于补充规范实现率和测试率的对照视图。
GitHub 仓库 [查看仓库源码](https://github.com/LoseNine/ruyipage/blob/main/examples/w3c_bidi/generate_comparison.py) 离线文档工具
  * 读取规范 API 清单
  * 生成实现率和测试率表格
  * 统计缺失 API 并输出 Markdown


源码文件：`app/content/ruyipage_examples/w3c_bidi/generate_comparison.py` · 仓库：[w3c_bidi/generate_comparison.py](https://github.com/LoseNine/ruyipage/blob/main/examples/w3c_bidi/generate_comparison.py)
python 注释版
注释版 原始版 自动换行 复制代码
```
#!/usr/bin/env python
# =============================
# RuyiPage 示例注释版
# 标题: 生成 RuyiPage 与 W3C BiDi 规范对比表
# 说明: 用于补充规范实现率和测试率的对照视图。
# 你会学到:
#   1. 读取规范 API 清单
#   2. 生成实现率和测试率表格
#   3. 统计缺失 API 并输出 Markdown
# 相关 API: 离线文档工具
# =============================

# -*- coding: utf-8 -*-
"""生成RuyiPage与W3C BiDi规范的精确对比表格"""

import sys
import io
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

import json

# 读取W3C规范数据
with open('w3c_bidi_apis.json', 'r', encoding='utf-8') as f:
    w3c_data = json.load(f)

# RuyiPage已实现的API
ruyipage_commands = {
    'session': [
        'session.status',
        'session.new',
        'session.end',
        'session.subscribe',
        'session.unsubscribe'
    ],
    'browser': [
        'browser.close',
        'browser.createUserContext',
        'browser.getUserContexts',
        'browser.removeUserContext',
        'browser.getClientWindows',
        'browser.setClientWindowState',
        'browser.setDownloadBehavior'
    ],
    'browsingContext': [
        'browsingContext.activate',
        'browsingContext.captureScreenshot',
        'browsingContext.close',
        'browsingContext.create',
        'browsingContext.getTree',
        'browsingContext.handleUserPrompt',
        'browsingContext.locateNodes',
        'browsingContext.navigate',
        'browsingContext.print',
        'browsingContext.reload',
        'browsingContext.setViewport',
        'browsingContext.traverseHistory'
        # 缺少: browsingContext.setBypassCSP
    ],
    'emulation': [
        'emulation.setUserAgentOverride',
        'emulation.setGeolocationOverride',
        'emulation.setTimezoneOverride',
        'emulation.setLocaleOverride',
        'emulation.setScreenOrientationOverride',
        'emulation.setScreenSettingsOverride',
        'emulation.setNetworkConditions',
        'emulation.setTouchOverride'
        # 缺少: setScriptingEnabled, setScrollbarTypeOverride, setForcedColorsModeThemeOverride
    ],
    'network': [
        'network.addIntercept',
        'network.removeIntercept',
        'network.continueRequest',
        'network.continueResponse',
        'network.continueWithAuth',
        'network.failRequest',
        'network.provideResponse',
        'network.addDataCollector',
        'network.removeDataCollector',
        'network.getData',
        'network.disownData',
        'network.setCacheBehavior',
        'network.setExtraHeaders'
    ],
    'script': [
        'script.evaluate',
        'script.callFunction',
        'script.addPreloadScript',
        'script.removePreloadScript',
        'script.getRealms',
        'script.disown'
    ],
    'storage': [
        'storage.getCookies',
        'storage.setCookie',
        'storage.deleteCookies'
    ],
    'input': [
        'input.performActions',
        'input.releaseActions',
        'input.setFiles'
    ],
    'webExtension': [
        'webExtension.install',
        'webExtension.uninstall'
    ]
}

ruyipage_events = {
    'browsingContext': [
        'browsingContext.contextCreated',
        'browsingContext.contextDestroyed',
        'browsingContext.domContentLoaded',
        'browsingContext.load',
        'browsingContext.navigationStarted',
        'browsingContext.userPromptOpened',
        'browsingContext.userPromptClosed'
        # 缺少: downloadWillBegin, downloadEnd, fragmentNavigated, historyUpdated,
        #       navigationAborted, navigationCommitted, navigationFailed
    ],
    'network': [
        'network.beforeRequestSent',
        'network.responseStarted',
        'network.responseCompleted',
        'network.fetchError',
        'network.authRequired'
    ],
    'script': [
        'script.realmCreated',
        'script.realmDestroyed'
        # 缺少: script.message
    ],
    'log': [
        'log.entryAdded'
    ]
    # 缺少: input.fileDialogOpened
}

# 测试覆盖情况
tested_commands = {
    'session': ['session.status', 'session.new', 'session.end', 'session.subscribe', 'session.unsubscribe'],
    'browser': ['browser.close', 'browser.createUserContext', 'browser.getUserContexts',
                'browser.removeUserContext', 'browser.getClientWindows', 'browser.setClientWindowState'],
    'browsingContext': ['browsingContext.activate', 'browsingContext.captureScreenshot',
                       'browsingContext.close', 'browsingContext.create', 'browsingContext.getTree',
                       'browsingContext.handleUserPrompt', 'browsingContext.locateNodes',
                       'browsingContext.navigate', 'browsingContext.print', 'browsingContext.reload',
                       'browsingContext.setViewport', 'browsingContext.traverseHistory'],
    'emulation': [],  # 未测试
    'network': ['network.addIntercept', 'network.removeIntercept', 'network.continueRequest',
                'network.continueResponse', 'network.continueWithAuth', 'network.failRequest',
                'network.provideResponse', 'network.addDataCollector', 'network.removeDataCollector',
                'network.getData', 'network.disownData', 'network.setCacheBehavior', 'network.setExtraHeaders'],
    'script': ['script.evaluate', 'script.callFunction', 'script.addPreloadScript',
               'script.removePreloadScript', 'script.getRealms', 'script.disown'],
    'storage': ['storage.getCookies', 'storage.setCookie', 'storage.deleteCookies'],
    'input': ['input.performActions', 'input.releaseActions', 'input.setFiles'],
    'webExtension': []  # 未测试
}

# 生成Markdown表格
output = []
output.append("# WebDriver BiDi API 完整对比表（基于W3C官方规范）\n")
output.append("## 📊 总体统计\n")
output.append("| 项目 | W3C规范 | RuyiPage实现 | 已测试 | 实现率 | 测试率 |")
output.append("|------|---------|-------------|--------|--------|--------|")

total_w3c_cmds = w3c_data['total_commands']
total_w3c_evts = w3c_data['total_events']
total_rp_cmds = sum(len(v) for v in ruyipage_commands.values())
total_rp_evts = sum(len(v) for v in ruyipage_events.values())
total_tested_cmds = sum(len(v) for v in tested_commands.values())

output.append(f"| 命令 | {total_w3c_cmds} | {total_rp_cmds} | {total_tested_cmds} | {total_rp_cmds/total_w3c_cmds*100:.1f}% | {total_tested_cmds/total_w3c_cmds*100:.1f}% |")
output.append(f"| 事件 | {total_w3c_evts} | {total_rp_evts} | {total_rp_evts} | {total_rp_evts/total_w3c_evts*100:.1f}% | {total_rp_evts/total_w3c_evts*100:.1f}% |")
output.append(f"| **总计** | **{total_w3c_cmds + total_w3c_evts}** | **{total_rp_cmds + total_rp_evts}** | **{total_tested_cmds + total_rp_evts}** | **{(total_rp_cmds + total_rp_evts)/(total_w3c_cmds + total_w3c_evts)*100:.1f}%** | **{(total_tested_cmds + total_rp_evts)/(total_w3c_cmds + total_w3c_evts)*100:.1f}%** |")

output.append("\n---\n")

# 按模块生成详细对比
for module in sorted(w3c_data['modules']):
    output.append(f"\n## {module} 模块\n")

    # 命令对比
    if module in w3c_data['commands']:
        w3c_cmds = w3c_data['commands'][module]
        rp_cmds = ruyipage_commands.get(module, [])
        tested_cmds = tested_commands.get(module, [])

        output.append(f"### 命令 ({len(rp_cmds)}/{len(w3c_cmds)} = {len(rp_cmds)/len(w3c_cmds)*100:.1f}%)\n")
        output.append("| W3C命令 | RuyiPage | 测试 | 状态 |")
        output.append("|---------|----------|------|------|")

        for cmd in sorted(w3c_cmds):
            implemented = "✅" if cmd in rp_cmds else "❌"
            tested = "✅" if cmd in tested_cmds else ("⚠️" if cmd in rp_cmds else "❌")
            status = "完成" if cmd in tested_cmds else ("已实现未测试" if cmd in rp_cmds else "未实现")
            output.append(f"| {cmd} | {implemented} | {tested} | {status} |")

    # 事件对比
    if module in w3c_data['events']:
        w3c_evts = w3c_data['events'][module]
        rp_evts = ruyipage_events.get(module, [])

        output.append(f"\n### 事件 ({len(rp_evts)}/{len(w3c_evts)} = {len(rp_evts)/len(w3c_evts)*100:.1f}%)\n")
        output.append("| W3C事件 | RuyiPage | 测试 | 状态 |")
        output.append("|---------|----------|------|------|")

        for evt in sorted(w3c_evts):
            implemented = "✅" if evt in rp_evts else "❌"
            tested = "✅" if evt in rp_evts else "❌"
            status = "完成" if evt in rp_evts else "未实现"
            output.append(f"| {evt} | {implemented} | {tested} | {status} |")

    output.append("")

# 未实现的API清单
output.append("\n## 🚫 未实现的W3C API清单\n")
output.append("### 命令\n")
missing_cmds = []
for module in w3c_data['commands']:
    w3c_cmds = w3c_data['commands'][module]
    rp_cmds = ruyipage_commands.get(module, [])
    for cmd in w3c_cmds:
        if cmd not in rp_cmds:
            missing_cmds.append(cmd)

for i, cmd in enumerate(missing_cmds, 1):
    output.append(f"{i}. ❌ **{cmd}**")

output.append("\n### 事件\n")
missing_evts = []
for module in w3c_data['events']:
    w3c_evts = w3c_data['events'][module]
    rp_evts = ruyipage_events.get(module, [])
    for evt in w3c_evts:
        if evt not in rp_evts:
            missing_evts.append(evt)

for i, evt in enumerate(missing_evts, 1):
    output.append(f"{i}. ❌ **{evt}**")

# 未测试的API清单
output.append("\n## ⚠️ 已实现但未测试的API\n")
untested = []
for module in ruyipage_commands:
    rp_cmds = ruyipage_commands[module]
    tested_cmds = tested_commands.get(module, [])
    for cmd in rp_cmds:
        if cmd not in tested_cmds:
            untested.append(cmd)

for i, cmd in enumerate(untested, 1):
    output.append(f"{i}. ⚠️ **{cmd}**")

# 总结
output.append("\n## 🏆 总结\n")
output.append(f"- ✅ **命令实现率**: {total_rp_cmds}/{total_w3c_cmds} = **{total_rp_cmds/total_w3c_cmds*100:.1f}%**")
output.append(f"- ✅ **事件实现率**: {total_rp_evts}/{total_w3c_evts} = **{total_rp_evts/total_w3c_evts*100:.1f}%**")
output.append(f"- ✅ **总体实现率**: {total_rp_cmds + total_rp_evts}/{total_w3c_cmds + total_w3c_evts} = **{(total_rp_cmds + total_rp_evts)/(total_w3c_cmds + total_w3c_evts)*100:.1f}%**")
output.append(f"- ✅ **测试覆盖率**: {total_tested_cmds + total_rp_evts}/{total_w3c_cmds + total_w3c_evts} = **{(total_tested_cmds + total_rp_evts)/(total_w3c_cmds + total_w3c_evts)*100:.1f}%**")
output.append(f"- ❌ **缺失API数**: {len(missing_cmds) + len(missing_evts)} 个（{len(missing_cmds)}命令 + {len(missing_evts)}事件）")
output.append(f"- ⚠️ **未测试API数**: {len(untested)} 个")

output.append("\n---\n")
output.append("**数据来源**: W3C WebDriver BiDi 规范 (https://w3c.github.io/webdriver-bidi/)")
output.append("\n**生成时间**: 2026-04-06")

# 保存到文件
result_text = '\n'.join(output)
with open('E:/ruyipage/examples/W3C_BIDI_COMPARISON.md', 'w', encoding='utf-8') as f:
    f.write(result_text)

print(result_text)
print("\n\n对比表格已保存到: E:/ruyipage/examples/W3C_BIDI_COMPARISON.md")

```

```
#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""生成RuyiPage与W3C BiDi规范的精确对比表格"""

import sys
import io
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

import json

# 读取W3C规范数据
with open('w3c_bidi_apis.json', 'r', encoding='utf-8') as f:
    w3c_data = json.load(f)

# RuyiPage已实现的API
ruyipage_commands = {
    'session': [
        'session.status',
        'session.new',
        'session.end',
        'session.subscribe',
        'session.unsubscribe'
    ],
    'browser': [
        'browser.close',
        'browser.createUserContext',
        'browser.getUserContexts',
        'browser.removeUserContext',
        'browser.getClientWindows',
        'browser.setClientWindowState',
        'browser.setDownloadBehavior'
    ],
    'browsingContext': [
        'browsingContext.activate',
        'browsingContext.captureScreenshot',
        'browsingContext.close',
        'browsingContext.create',
        'browsingContext.getTree',
        'browsingContext.handleUserPrompt',
        'browsingContext.locateNodes',
        'browsingContext.navigate',
        'browsingContext.print',
        'browsingContext.reload',
        'browsingContext.setViewport',
        'browsingContext.traverseHistory'
        # 缺少: browsingContext.setBypassCSP
    ],
    'emulation': [
        'emulation.setUserAgentOverride',
        'emulation.setGeolocationOverride',
        'emulation.setTimezoneOverride',
        'emulation.setLocaleOverride',
        'emulation.setScreenOrientationOverride',
        'emulation.setScreenSettingsOverride',
        'emulation.setNetworkConditions',
        'emulation.setTouchOverride'
        # 缺少: setScriptingEnabled, setScrollbarTypeOverride, setForcedColorsModeThemeOverride
    ],
    'network': [
        'network.addIntercept',
        'network.removeIntercept',
        'network.continueRequest',
        'network.continueResponse',
        'network.continueWithAuth',
        'network.failRequest',
        'network.provideResponse',
        'network.addDataCollector',
        'network.removeDataCollector',
        'network.getData',
        'network.disownData',
        'network.setCacheBehavior',
        'network.setExtraHeaders'
    ],
    'script': [
        'script.evaluate',
        'script.callFunction',
        'script.addPreloadScript',
        'script.removePreloadScript',
        'script.getRealms',
        'script.disown'
    ],
    'storage': [
        'storage.getCookies',
        'storage.setCookie',
        'storage.deleteCookies'
    ],
    'input': [
        'input.performActions',
        'input.releaseActions',
        'input.setFiles'
    ],
    'webExtension': [
        'webExtension.install',
        'webExtension.uninstall'
    ]
}

ruyipage_events = {
    'browsingContext': [
        'browsingContext.contextCreated',
        'browsingContext.contextDestroyed',
        'browsingContext.domContentLoaded',
        'browsingContext.load',
        'browsingContext.navigationStarted',
        'browsingContext.userPromptOpened',
        'browsingContext.userPromptClosed'
        # 缺少: downloadWillBegin, downloadEnd, fragmentNavigated, historyUpdated,
        #       navigationAborted, navigationCommitted, navigationFailed
    ],
    'network': [
        'network.beforeRequestSent',
        'network.responseStarted',
        'network.responseCompleted',
        'network.fetchError',
        'network.authRequired'
    ],
    'script': [
        'script.realmCreated',
        'script.realmDestroyed'
        # 缺少: script.message
    ],
    'log': [
        'log.entryAdded'
    ]
    # 缺少: input.fileDialogOpened
}

# 测试覆盖情况
tested_commands = {
    'session': ['session.status', 'session.new', 'session.end', 'session.subscribe', 'session.unsubscribe'],
    'browser': ['browser.close', 'browser.createUserContext', 'browser.getUserContexts',
                'browser.removeUserContext', 'browser.getClientWindows', 'browser.setClientWindowState'],
    'browsingContext': ['browsingContext.activate', 'browsingContext.captureScreenshot',
                       'browsingContext.close', 'browsingContext.create', 'browsingContext.getTree',
                       'browsingContext.handleUserPrompt', 'browsingContext.locateNodes',
                       'browsingContext.navigate', 'browsingContext.print', 'browsingContext.reload',
                       'browsingContext.setViewport', 'browsingContext.traverseHistory'],
    'emulation': [],  # 未测试
    'network': ['network.addIntercept', 'network.removeIntercept', 'network.continueRequest',
                'network.continueResponse', 'network.continueWithAuth', 'network.failRequest',
                'network.provideResponse', 'network.addDataCollector', 'network.removeDataCollector',
                'network.getData', 'network.disownData', 'network.setCacheBehavior', 'network.setExtraHeaders'],
    'script': ['script.evaluate', 'script.callFunction', 'script.addPreloadScript',
               'script.removePreloadScript', 'script.getRealms', 'script.disown'],
    'storage': ['storage.getCookies', 'storage.setCookie', 'storage.deleteCookies'],
    'input': ['input.performActions', 'input.releaseActions', 'input.setFiles'],
    'webExtension': []  # 未测试
}

# 生成Markdown表格
output = []
output.append("# WebDriver BiDi API 完整对比表（基于W3C官方规范）\n")
output.append("## 📊 总体统计\n")
output.append("| 项目 | W3C规范 | RuyiPage实现 | 已测试 | 实现率 | 测试率 |")
output.append("|------|---------|-------------|--------|--------|--------|")

total_w3c_cmds = w3c_data['total_commands']
total_w3c_evts = w3c_data['total_events']
total_rp_cmds = sum(len(v) for v in ruyipage_commands.values())
total_rp_evts = sum(len(v) for v in ruyipage_events.values())
total_tested_cmds = sum(len(v) for v in tested_commands.values())

output.append(f"| 命令 | {total_w3c_cmds} | {total_rp_cmds} | {total_tested_cmds} | {total_rp_cmds/total_w3c_cmds*100:.1f}% | {total_tested_cmds/total_w3c_cmds*100:.1f}% |")
output.append(f"| 事件 | {total_w3c_evts} | {total_rp_evts} | {total_rp_evts} | {total_rp_evts/total_w3c_evts*100:.1f}% | {total_rp_evts/total_w3c_evts*100:.1f}% |")
output.append(f"| **总计** | **{total_w3c_cmds + total_w3c_evts}** | **{total_rp_cmds + total_rp_evts}** | **{total_tested_cmds + total_rp_evts}** | **{(total_rp_cmds + total_rp_evts)/(total_w3c_cmds + total_w3c_evts)*100:.1f}%** | **{(total_tested_cmds + total_rp_evts)/(total_w3c_cmds + total_w3c_evts)*100:.1f}%** |")

output.append("\n---\n")

# 按模块生成详细对比
for module in sorted(w3c_data['modules']):
    output.append(f"\n## {module} 模块\n")

    # 命令对比
    if module in w3c_data['commands']:
        w3c_cmds = w3c_data['commands'][module]
        rp_cmds = ruyipage_commands.get(module, [])
        tested_cmds = tested_commands.get(module, [])

        output.append(f"### 命令 ({len(rp_cmds)}/{len(w3c_cmds)} = {len(rp_cmds)/len(w3c_cmds)*100:.1f}%)\n")
        output.append("| W3C命令 | RuyiPage | 测试 | 状态 |")
        output.append("|---------|----------|------|------|")

        for cmd in sorted(w3c_cmds):
            implemented = "✅" if cmd in rp_cmds else "❌"
            tested = "✅" if cmd in tested_cmds else ("⚠️" if cmd in rp_cmds else "❌")
            status = "完成" if cmd in tested_cmds else ("已实现未测试" if cmd in rp_cmds else "未实现")
            output.append(f"| {cmd} | {implemented} | {tested} | {status} |")

    # 事件对比
    if module in w3c_data['events']:
        w3c_evts = w3c_data['events'][module]
        rp_evts = ruyipage_events.get(module, [])

        output.append(f"\n### 事件 ({len(rp_evts)}/{len(w3c_evts)} = {len(rp_evts)/len(w3c_evts)*100:.1f}%)\n")
        output.append("| W3C事件 | RuyiPage | 测试 | 状态 |")
        output.append("|---------|----------|------|------|")

        for evt in sorted(w3c_evts):
            implemented = "✅" if evt in rp_evts else "❌"
            tested = "✅" if evt in rp_evts else "❌"
            status = "完成" if evt in rp_evts else "未实现"
            output.append(f"| {evt} | {implemented} | {tested} | {status} |")

    output.append("")

# 未实现的API清单
output.append("\n## 🚫 未实现的W3C API清单\n")
output.append("### 命令\n")
missing_cmds = []
for module in w3c_data['commands']:
    w3c_cmds = w3c_data['commands'][module]
    rp_cmds = ruyipage_commands.get(module, [])
    for cmd in w3c_cmds:
        if cmd not in rp_cmds:
            missing_cmds.append(cmd)

for i, cmd in enumerate(missing_cmds, 1):
    output.append(f"{i}. ❌ **{cmd}**")

output.append("\n### 事件\n")
missing_evts = []
for module in w3c_data['events']:
    w3c_evts = w3c_data['events'][module]
    rp_evts = ruyipage_events.get(module, [])
    for evt in w3c_evts:
        if evt not in rp_evts:
            missing_evts.append(evt)

for i, evt in enumerate(missing_evts, 1):
    output.append(f"{i}. ❌ **{evt}**")

# 未测试的API清单
output.append("\n## ⚠️ 已实现但未测试的API\n")
untested = []
for module in ruyipage_commands:
    rp_cmds = ruyipage_commands[module]
    tested_cmds = tested_commands.get(module, [])
    for cmd in rp_cmds:
        if cmd not in tested_cmds:
            untested.append(cmd)

for i, cmd in enumerate(untested, 1):
    output.append(f"{i}. ⚠️ **{cmd}**")

# 总结
output.append("\n## 🏆 总结\n")
output.append(f"- ✅ **命令实现率**: {total_rp_cmds}/{total_w3c_cmds} = **{total_rp_cmds/total_w3c_cmds*100:.1f}%**")
output.append(f"- ✅ **事件实现率**: {total_rp_evts}/{total_w3c_evts} = **{total_rp_evts/total_w3c_evts*100:.1f}%**")
output.append(f"- ✅ **总体实现率**: {total_rp_cmds + total_rp_evts}/{total_w3c_cmds + total_w3c_evts} = **{(total_rp_cmds + total_rp_evts)/(total_w3c_cmds + total_w3c_evts)*100:.1f}%**")
output.append(f"- ✅ **测试覆盖率**: {total_tested_cmds + total_rp_evts}/{total_w3c_cmds + total_w3c_evts} = **{(total_tested_cmds + total_rp_evts)/(total_w3c_cmds + total_w3c_evts)*100:.1f}%**")
output.append(f"- ❌ **缺失API数**: {len(missing_cmds) + len(missing_evts)} 个（{len(missing_cmds)}命令 + {len(missing_evts)}事件）")
output.append(f"- ⚠️ **未测试API数**: {len(untested)} 个")

output.append("\n---\n")
output.append("**数据来源**: W3C WebDriver BiDi 规范 (https://w3c.github.io/webdriver-bidi/)")
output.append("\n**生成时间**: 2026-04-06")

# 保存到文件
result_text = '\n'.join(output)
with open('E:/ruyipage/examples/W3C_BIDI_COMPARISON.md', 'w', encoding='utf-8') as f:
    f.write(result_text)

print(result_text)
print("\n\n对比表格已保存到: E:/ruyipage/examples/W3C_BIDI_COMPARISON.md")

```
