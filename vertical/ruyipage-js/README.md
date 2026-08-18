# ruyipage-js

`ruyipage-js` 是基于 WebDriver BiDi 的 Firefox 自动化框架（Node.js 版）。

英文文档请查看：`README.en.md`

---

## 仓库关系

- JS 实现仓库：[`GanFish404/ruyipage-js`](https://github.com/GanFish404/ruyipage-js)
- Go 实现仓库：[`pll177/ruyipage-go`](https://github.com/pll177/ruyipage-go)
- Python 基线仓库：[`LoseNine/ruyipage`](https://github.com/LoseNine/ruyipage)
- 指纹浏览器仓库（搭配使用）：[`LoseNine/firefox-fingerprintBrowser`](https://github.com/LoseNine/firefox-fingerprintBrowser)

`ruyipage-js` 延续 Python `ruyipage` 的 Firefox + BiDi 技术路线；Go 版 `ruyipage-go` 也是同路线的并行实现。三者都围绕同一类高层自动化能力建设，但分别面向不同语言生态。
说明：`ruyipage-js` 不强依赖指纹浏览器，使用官方标准 Firefox 也可以完整运行自动化流程；指纹浏览器是“可选增强方案”。

---

## 项目定位

`ruyipage-js` 不是“只包一层底层 BiDi 命令”的轻封装，而是面向业务自动化的高层 API：

- 页面自动化（导航、定位、交互、脚本执行）
- Prompt/对话框处理（含自动策略和手动处理）
- 网络相关能力（监听、拦截、上下文隔离）
- 页面上下文能力（tab、frame、storage、wait、actions）

如果你希望写的是“可维护的业务流程脚本”，而不仅是临时脚本，这套 API 会更顺手。

---

## 能力总览

| 能力域 | 主要入口 | 典型用途 |
| --- | --- | --- |
| 浏览器启动 | `FirefoxPage.create()` | 创建会话并进入页面 |
| 页面导航 | `get/back/forward/refresh` | 页面流转与跳转控制 |
| 元素定位与操作 | `ele/eles` + `click/input` | 表单填写、按钮点击、信息提取 |
| 脚本执行 | `run_js` | 复杂 DOM 读取与页面内逻辑执行 |
| Prompt 管理 | `set_prompt_handler` / `wait_prompt` / `handle_prompt` | 统一处理 alert/confirm/prompt |
| 业务等待 | `page.wait` / `ele.wait` | 降低动态页面时序问题 |
| 存储操作 | `local_storage` / `session_storage` | 登录态、页面缓存、状态读写 |
| 多上下文 | `new_tab` / `get_frame` | 多 tab、iframe 自动化 |

---

## 目录

- [1. 安装与环境](#1-安装与环境)
- [2. 快速开始](#2-快速开始)
- [3. 核心对象](#3-核心对象)
- [4. 页面能力](#4-页面能力)
- [5. 元素能力](#5-元素能力)
- [6. Prompt 与对话框](#6-prompt-与对话框)
- [7. 常见场景示例](#7-常见场景示例)
- [8. 示例测试用例](#8-示例测试用例)
- [9. 使用注意事项](#9-使用注意事项)
- [10. 常见问题（FAQ）](#10-常见问题faq)

---

## 1. 安装与环境

```bash
npm install
```

- Node.js 版本要求：`>=16`
- 浏览器：Firefox（建议使用稳定版最新版本）

---

## 2. 快速开始

运行内置示例：

```bash
node quickstart_bing_search.js
```

最小可运行示例：

```js
const { FirefoxOptions, FirefoxPage } = require('./index');

async function main() {
  const opts = new FirefoxOptions();
  const page = await FirefoxPage.create(opts);
  try {
    await page.get('https://example.com');
    console.log('title =', await page.title);
    console.log('url =', await page.url);
  } finally {
    await page.quit();
  }
}

main().catch(console.error);
```

---

## 新手上手路径（第一次用建议）

按下面顺序走，基本不会懵：

1. **先只跑最小脚本**：`create -> get -> 读 title -> quit`  
2. **再加元素操作**：`ele -> input/click`  
3. **再加脚本执行**：`run_js`  
4. **最后加复杂能力**：prompt、frame、多 tab、网络相关

建议固定这个模板，避免资源没释放：

```js
const { FirefoxOptions, FirefoxPage } = require('./index');

async function run() {
  const page = await FirefoxPage.create(new FirefoxOptions());
  try {
    // your business steps
  } finally {
    await page.quit();
  }
}

run().catch(console.error);
```

---

## 3. 核心对象

- `FirefoxOptions`：浏览器启动配置
- `FirefoxPage`：页面主对象（大多数 API 入口）
- `FirefoxTab`：标签页对象
- `FirefoxFrame`：iframe 对象
- `FirefoxElement`：元素对象

常用导入：

```js
const { FirefoxOptions, FirefoxPage, Keys, By } = require('./index');
```

---

## 启动参数（重点）

这一节专门讲“浏览器怎么启动、参数怎么传”，新手先看这里。

### 3.1 `FirefoxOptions` 常用参数

| 方法 | 参数 | 说明 | 推荐值 |
| --- | --- | --- | --- |
| `set_browser_path(path)` | `string` | Firefox 可执行文件路径 | Windows 常见：`C:\\Program Files\\Mozilla Firefox\\firefox.exe` |
| `set_address("host:port")` | `string` | 调试地址（同时设置 host+port） | `127.0.0.1:9222` |
| `set_port(port)` | `number` | 仅设置调试端口 | `9222`（默认） |
| `set_user_dir(dir)` / `set_profile(dir)` | `string` | 用户数据目录（profile） | 业务场景建议固定目录 |
| `headless(on)` | `boolean` | 无头模式 | 调试阶段 `false`，CI 可 `true` |
| `private_mode(on)` | `boolean` | 隐私模式 | 按需开启 |
| `set_window_size(w, h)` | `number, number` | 启动窗口大小 | `1280, 800` |
| `set_timeouts({ base, page_load, script })` | `object` | 三类超时（秒） | `base:10,page_load:30,script:30` |
| `set_download_path(path)` | `string` | 下载目录 | 项目内固定目录 |
| `set_proxy(proxy)` | `string` | 代理地址 | `http://127.0.0.1:7890` 或 `socks5://127.0.0.1:1080` |
| `set_auto_port(on)` | `boolean` | 自动端口分配 | 并发启动多个实例时建议 `true` |
| `set_argument(arg, value?)` | `string` | 追加 Firefox 启动参数 | 按需 |
| `set_fpfile(path)` | `string` | 指纹配置文件路径（传给 `--fpfile`） | 搭配指纹浏览器时使用 |
| `set_pref(key, value)` | `string, any` | 写入 Firefox user.js 偏好 | 按需 |
| `set_user_prompt_handler(config)` | `object` | session 级 prompt 默认策略 | 可选 |

### 3.2 启动参数调用路径（一步步）

```js
const { FirefoxOptions, FirefoxPage } = require('./index');

async function bootstrap() {
  const opts = new FirefoxOptions()
    .set_browser_path('C:\\Program Files\\Mozilla Firefox\\firefox.exe')
    .set_user_dir('D:\\ruyipage_user_data')
    .set_port(9222)
    .headless(false)
    .set_window_size(1280, 800)
    .set_timeouts({ base: 10, page_load: 30, script: 30 });

  const page = await FirefoxPage.create(opts);
  try {
    await page.get('https://example.com');
  } finally {
    await page.quit();
  }
}

bootstrap().catch(console.error);
```

### 3.3 代理怎么用（重点）

```js
const opts = new FirefoxOptions()
  .set_user_dir('D:\\ruyipage_user_data_proxy')
  .set_proxy('http://127.0.0.1:7890');
```

SOCKS5 示例：

```js
const opts = new FirefoxOptions()
  .set_user_dir('D:\\ruyipage_user_data_proxy')
  .set_proxy('socks5://127.0.0.1:1080');
```

说明：

- 建议代理与 `set_user_dir(...)` 一起使用，配置会写入该 profile 的 `user.js`；
- 代理字符串建议用 `scheme://host:port` 形式；
- 如果你要切换代理，建议切换不同 `user_dir`，避免 profile 残留配置混淆。

### 3.4 user-data-dir（`user_dir`）怎么配置

`set_user_dir(path)` 就是你要的 `user-data-dir`（Firefox profile）入口：

```js
const opts = new FirefoxOptions()
  .set_user_dir('D:\\ruyipage_user_data_main');
```

建议：

- **一次性脚本**：可不传 `user_dir`（用临时 profile）；
- **长期业务脚本**：必须传固定 `user_dir`（保留登录态、缓存、站点设置）；
- **多账号并发**：每个账号单独 `user_dir`，不要混用。

### 3.5 搭配指纹浏览器（你当前场景）

先说明：这部分是可选能力，不用指纹浏览器也能正常用 `ruyipage-js`。

如果你已经编译好指纹浏览器，核心就是把浏览器可执行路径和 `fpfile` 都传进来：

```js
const { FirefoxOptions, FirefoxPage } = require('./index');

async function runWithFingerprintBrowser() {
  const opts = new FirefoxOptions()
    .set_browser_path('D:\\fingerprint-browser\\firefox.exe') // 你的编译版浏览器路径
    .set_fpfile('D:\\fingerprints\\profile1.txt') // 指纹配置文件
    .set_user_dir('D:\\profiles\\user1') // 建议每个账号一个独立目录
    .set_proxy('http://127.0.0.1:7890') // 可选
    .set_port(9222);

  const page = await FirefoxPage.create(opts);
  try {
    await page.get('https://example.com');
  } finally {
    await page.quit();
  }
}

runWithFingerprintBrowser().catch(console.error);
```

使用要点：

- `set_browser_path(...)` 必须指向你编译出来的浏览器 `exe`；
- `set_fpfile(...)` 对应你准备的指纹配置文件；
- `set_user_dir(...)` 建议按账号隔离，避免 profile 混用；
- 该指纹浏览器项目当前说明是 Windows 场景，路径也按 Windows 习惯配置。

---

## 4. 页面能力

### 4.1 导航

- `await page.get(url)`
- `await page.back()`
- `await page.forward()`
- `await page.refresh()`

参数说明（`page.get(url, wait?, timeout?)`）：

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `url` | `string` | 目标地址，建议完整 `https://...` |
| `wait` | `boolean` / `undefined` | 是否等待页面加载完成 |
| `timeout` | `number` / `undefined` | 导航超时（秒） |

参数建议：

- `wait`：新手建议先不传，使用默认行为；
- `timeout`：首轮调试建议 `10~20` 秒，网络慢时再增大；
- `url`：尽量使用完整 URL，避免相对地址带来的上下文问题。

示例（推荐新手写法）：

```js
await page.get('https://example.com', true, 15);
```

### 4.2 元素查找

- `await page.ele(locator, index?, timeout?)`
- `await page.eles(locator, timeout?)`

定位写法示例：
- CSS: `'css:#login-btn'` or `'#login-btn'`
- XPath: `'xpath://button[@id="login-btn"]'`

参数说明（`page.ele(locator, index?, timeout?)`）：

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `locator` | `string` | 定位表达式 |
| `index` | `number` / `undefined` | 第几个匹配结果（常用 `1`） |
| `timeout` | `number` / `undefined` | 查找超时（秒） |

参数建议：

- `locator`：新手优先用 CSS；  
- `index`：默认用 `1`，除非明确要第 N 个；  
- `timeout`：动态页面建议 `3~8` 秒。

参数调用示例：

```js
const first = await page.ele('#submit', 1, 5);
const second = await page.ele('.item', 2, 3);
```

### 4.3 脚本执行

- `await page.run_js(script, ...args)`
- `await page.run_js('document.title', { as_expr: true })`

参数说明（`run_js`）：

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `script` | `string` | 执行脚本文本 |
| `...args` | `any[]` | 传给脚本的参数 |
| `as_expr` | `boolean` | 按表达式执行 |
| `timeout` | `number` | 脚本超时（秒） |
| `sandbox` | `string` | 指定 sandbox |

参数建议：

- 只取值时优先 `as_expr: true`；  
- 脚本较复杂时用 `return ...` 形式并设置 `timeout`；  
- 初学者先不要用 `sandbox`，先跑通主流程再细分隔离执行。

参数调用示例：

```js
const sum = await page.run_js('return arguments[0] + arguments[1];', 1, 2);
const title = await page.run_js('document.title', { as_expr: true, timeout: 5 });
```

### 4.4 页面信息

- `await page.title`
- `await page.url`
- `await page.html`

### 4.5 页面结束

- `await page.close()`
- `await page.quit()`

---

## 5. 元素能力

拿到元素后常用方法：

- `await ele.click()`
- `await ele.input(text)`
- `await ele.text`
- `await ele.attr(name)`
- `await ele.run_js(script, ...args)`

示例：

```js
const searchInput = await page.ele('#sb_form_q');
await searchInput.input('ruyipage');
```

---

## 6. Prompt 与对话框

### 6.1 设置自动处理策略

```js
await page.set_prompt_handler({
  alert: 'dismiss',
  confirm: 'accept',
  prompt: 'ignore',
  default: 'dismiss',
  // prompt_text: 'optional text'
});
```

支持的策略：
- `'accept'`
- `'dismiss'`
- `'ignore'`

参数说明（`set_prompt_handler(config)`）：

| 字段 | 可选值 | 说明 |
| --- | --- | --- |
| `alert` | `accept/dismiss/ignore` | alert 策略 |
| `confirm` | `accept/dismiss/ignore` | confirm 策略 |
| `prompt` | `accept/dismiss/ignore` | prompt 策略 |
| `default` | `accept/dismiss/ignore` | 默认策略 |
| `prompt_text` | `string` | prompt 自动输入文本 |

新手建议策略（通用稳妥版）：

```js
await page.set_prompt_handler({
  alert: 'dismiss',
  confirm: 'accept',
  prompt: 'ignore',
  default: 'dismiss',
});
```

说明：

- `prompt_text` 仅用于 prompt 输入场景；
- 如果你使用了自动策略，就不要同时在同一时刻再手动 `accept_prompt`/`dismiss_prompt`。

### 6.2 手动处理

- `await page.wait_prompt(timeout?)`
- `await page.accept_prompt(text?)`
- `await page.dismiss_prompt()`
- `await page.handle_prompt(accept?, text?)`

### 6.3 登录弹窗场景

- `await page.prompt_login(locator, username, password, trigger?, timeout?)`

参数说明（`prompt_login`）：

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `locator` | `string` | 触发登录弹窗的元素定位器 |
| `username` | `string` | 第一个 prompt 输入值 |
| `password` | `string` | 第二个 prompt 输入值 |
| `trigger` | `string` / `undefined` | 触发方式（常见 `mouse`） |
| `timeout` | `number` / `undefined` | 超时秒数 |

参数调用示例（按顺序）：

```js
await page.prompt_login('#login-btn', 'alice', 'p@ssw0rd', 'mouse', 8);
```

调用路径理解（给新手）：

1. 先通过 `locator` 定位并触发登录动作；  
2. 第一个 prompt 注入 `username`；  
3. 第二个 prompt 注入 `password`；  
4. 超时或流程异常时抛错，建议外层 `try/finally` 兜底退出。

---

## 7. 常见场景示例

### 7.1 打开页面并点击元素

```js
await page.get('https://example.com');
const btn = await page.ele('#submit');
await btn.click();
```

### 7.2 获取列表文本

```js
const items = await page.eles('.item');
for (const it of items) {
  console.log(await it.text);
}
```

### 7.3 执行页面脚本

```js
const title = await page.run_js('return document.title;');
console.log(title);
```

---

## 8. 示例测试用例

下面示例演示 `set_prompt_handler` + prompt 状态检查。

```js
const { FirefoxOptions, FirefoxPage } = require('./index');

async function casePromptHandler() {
  const page = await FirefoxPage.create(new FirefoxOptions());
  try {
    await page.set_prompt_handler({
      alert: 'dismiss',
      confirm: 'accept',
      prompt: 'ignore',
      default: 'dismiss',
    });

    await page.get('https://example.com');

    const opened = page.get_last_prompt_opened();
    const closed = page.get_last_prompt_closed();
    console.log({ opened, closed });
  } finally {
    await page.quit();
  }
}

casePromptHandler();
```

---

## 9. 使用注意事项

- 大多数浏览器交互 API 需要 `await`
- 建议每个脚本都在 `finally` 里调用 `await page.quit()`
- 对于动态页面，元素查找建议加超时与重试策略
- Prompt 自动处理与手动处理不要混用在同一时刻，避免语义冲突
- 新手建议先只用 CSS 定位，稳定后再引入 XPath
- 先跑通单页面流程，再叠加 frame/tab/prompt 等复杂功能

---

## 参数速记（新手版）

以下是最常用 API 的“直接可抄”参数模板：

```js
await page.get('https://example.com', true, 15);
const ele = await page.ele('#submit', 1, 5);
const value = await page.run_js('document.title', { as_expr: true, timeout: 5 });
await page.set_prompt_handler({ alert: 'dismiss', confirm: 'accept', prompt: 'ignore', default: 'dismiss' });
await page.prompt_login('#login-btn', 'alice', 'p@ssw0rd', 'mouse', 8);
```

---

## 10. 常见问题（FAQ）

### Q1：为什么有些属性也需要 `await`？
`ruyipage-js` 与浏览器通信是异步模型，像 `page.title`、`page.url` 这类值通过 BiDi 获取，因此使用时建议统一写成 `await page.title`。

### Q2：`set_prompt_handler` 和 `handle_prompt` 怎么选？
如果你的流程里 prompt 逻辑固定，优先用 `set_prompt_handler` 做统一策略；如果每次弹窗处理不同，使用 `wait_prompt` + `handle_prompt` 更灵活。

### Q3：元素偶尔找不到怎么办？
先确认定位器稳定，再增加等待（如 `page.wait` / `ele.wait`）；动态页面建议避免立即查找，先等待关键区域渲染。

### Q4：脚本结束后浏览器没关？
确保把 `await page.quit()` 放在 `finally`，不要只放在正常分支里。
