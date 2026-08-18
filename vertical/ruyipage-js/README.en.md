# ruyipage-js

`ruyipage-js` is a Firefox automation framework for Node.js based on WebDriver BiDi.

Chinese documentation: `README.md`

---

## Repository Relationship

- JS implementation repository: [`GanFish404/ruyipage-js`](https://github.com/GanFish404/ruyipage-js)
- Python baseline repository: [`LoseNine/ruyipage`](https://github.com/LoseNine/ruyipage)
- Go implementation repository: [`pll177/ruyipage-go`](https://github.com/pll177/ruyipage-go)
- Fingerprint browser repository (used together): [`LoseNine/firefox-fingerprintBrowser`](https://github.com/LoseNine/firefox-fingerprintBrowser)

`ruyipage-js` follows the same Firefox + BiDi direction as Python `ruyipage`; the Go version `ruyipage-go` is a parallel implementation on the same track. They target similar high-level automation capabilities in different language ecosystems.
Note: `ruyipage-js` does not require a fingerprint browser. It works with standard official Firefox; the fingerprint browser is an optional enhancement.

---

## Contents

- [1. Install](#1-install)
- [2. Quick Start](#2-quick-start)
- [3. Core Objects](#3-core-objects)
- [4. Page APIs](#4-page-apis)
- [5. Element APIs](#5-element-apis)
- [6. Prompt & Dialogs](#6-prompt--dialogs)
- [7. Common Scenarios](#7-common-scenarios)
- [8. Example Test Case](#8-example-test-case)
- [9. Notes](#9-notes)

---

## 1. Install

```bash
npm install
```

- Required Node.js version: `>=16`
- Browser: Firefox (latest stable recommended)

---

## 2. Quick Start

Run built-in example:

```bash
node quickstart_bing_search.js
```

Minimal runnable example:

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

## First-Time User Path

Recommended order for beginners:

1. Run the minimal script only: `create -> get -> read title -> quit`  
2. Add element operations: `ele -> input/click`  
3. Add script execution: `run_js`  
4. Add advanced flows: prompt, frame, multi-tab, network

Use this stable template to avoid unclosed browser sessions:

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

## 3. Core Objects

- `FirefoxOptions`: browser launch options
- `FirefoxPage`: main page object (primary API entry)
- `FirefoxTab`: tab object
- `FirefoxFrame`: iframe object
- `FirefoxElement`: element object

Common import:

```js
const { FirefoxOptions, FirefoxPage, Keys, By } = require('./index');
```

---

## Startup Options (Important)

This section explains exactly how to pass launch parameters.

### 3.1 Common `FirefoxOptions` Parameters

| Method | Parameter | Description | Recommended |
| --- | --- | --- | --- |
| `set_browser_path(path)` | `string` | Firefox executable path | Windows common: `C:\\Program Files\\Mozilla Firefox\\firefox.exe` |
| `set_address("host:port")` | `string` | Debug address (host+port) | `127.0.0.1:9222` |
| `set_port(port)` | `number` | Debug port only | `9222` (default) |
| `set_user_dir(dir)` / `set_profile(dir)` | `string` | User data directory (profile) | Use fixed directory for business scripts |
| `headless(on)` | `boolean` | Headless mode | `false` for debug, `true` for CI |
| `private_mode(on)` | `boolean` | Private mode | Optional |
| `set_window_size(w, h)` | `number, number` | Startup window size | `1280, 800` |
| `set_timeouts({ base, page_load, script })` | `object` | Timeouts in seconds | `base:10,page_load:30,script:30` |
| `set_download_path(path)` | `string` | Download directory | Fixed project path |
| `set_proxy(proxy)` | `string` | Proxy address | `http://127.0.0.1:7890` or `socks5://127.0.0.1:1080` |
| `set_auto_port(on)` | `boolean` | Auto port allocation | `true` for multi-instance startup |
| `set_argument(arg, value?)` | `string` | Add Firefox launch args | As needed |
| `set_fpfile(path)` | `string` | Fingerprint file path (passed as `--fpfile`) | Use with fingerprint browser |
| `set_pref(key, value)` | `string, any` | Write Firefox user.js pref | As needed |
| `set_user_prompt_handler(config)` | `object` | Session-level default prompt behavior | Optional |

### 3.2 Step-by-Step Startup Path

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

### 3.3 Proxy Usage

```js
const opts = new FirefoxOptions()
  .set_user_dir('D:\\ruyipage_user_data_proxy')
  .set_proxy('http://127.0.0.1:7890');
```

SOCKS5 example:

```js
const opts = new FirefoxOptions()
  .set_user_dir('D:\\ruyipage_user_data_proxy')
  .set_proxy('socks5://127.0.0.1:1080');
```

Notes:

- Use proxy with `set_user_dir(...)` so prefs persist in that profile;
- Use `scheme://host:port` format;
- For proxy switching, prefer separate `user_dir` profiles to avoid stale settings.

### 3.4 user-data-dir (`user_dir`) Usage

`set_user_dir(path)` is the user-data-dir entry (Firefox profile):

```js
const opts = new FirefoxOptions()
  .set_user_dir('D:\\ruyipage_user_data_main');
```

Recommendations:

- **One-off scripts**: profile can be omitted;
- **Long-running business scripts**: always set fixed `user_dir`;
- **Multi-account parallel runs**: one `user_dir` per account.

### 3.5 Using the Fingerprint Browser (Your Scenario)

Important: this is optional. `ruyipage-js` works normally without a fingerprint browser.

If your fingerprint browser is already compiled, pass both the browser executable path and `fpfile`:

```js
const { FirefoxOptions, FirefoxPage } = require('./index');

async function runWithFingerprintBrowser() {
  const opts = new FirefoxOptions()
    .set_browser_path('D:\\fingerprint-browser\\firefox.exe') // your compiled browser executable
    .set_fpfile('D:\\fingerprints\\profile1.txt') // fingerprint config file
    .set_user_dir('D:\\profiles\\user1') // recommended: one profile per account
    .set_proxy('http://127.0.0.1:7890') // optional
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

Key points:

- `set_browser_path(...)` must point to your compiled browser `exe`;
- `set_fpfile(...)` should point to your fingerprint config file;
- `set_user_dir(...)` should be isolated per account;
- The fingerprint browser project currently documents a Windows-focused setup, so Windows-style paths are used in examples.

---

## 4. Page APIs

### 4.1 Navigation

- `await page.get(url)`
- `await page.back()`
- `await page.forward()`
- `await page.refresh()`

Parameter guide (`page.get(url, wait?, timeout?)`):

| Parameter | Type | Description |
| --- | --- | --- |
| `url` | `string` | Target URL, preferably full `https://...` |
| `wait` | `boolean` / `undefined` | Whether to wait for load completion |
| `timeout` | `number` / `undefined` | Navigation timeout in seconds |

Recommendations:

- `wait`: beginners can keep default behavior first;
- `timeout`: start with `10~20` seconds, then tune;
- `url`: prefer full URL (`https://...`) to avoid context confusion.

Example:

```js
await page.get('https://example.com', true, 15);
```

### 4.2 Element Query

- `await page.ele(locator, index?, timeout?)`
- `await page.eles(locator, timeout?)`

Locator examples:
- CSS: `'css:#login-btn'` or `'#login-btn'`
- XPath: `'xpath://button[@id="login-btn"]'`

Parameter guide (`page.ele(locator, index?, timeout?)`):

| Parameter | Type | Description |
| --- | --- | --- |
| `locator` | `string` | Locator expression |
| `index` | `number` / `undefined` | Match index (commonly `1`) |
| `timeout` | `number` / `undefined` | Lookup timeout in seconds |

Recommendations:

- Start with CSS locators first;
- Use `index=1` unless you explicitly need the Nth match;
- Use `3~8` seconds timeout for dynamic pages.

Parameter call examples:

```js
const first = await page.ele('#submit', 1, 5);
const second = await page.ele('.item', 2, 3);
```

### 4.3 JavaScript Execution

- `await page.run_js(script, ...args)`
- `await page.run_js('document.title', { as_expr: true })`

Parameter guide (`run_js`):

| Parameter | Type | Description |
| --- | --- | --- |
| `script` | `string` | Script content |
| `...args` | `any[]` | Script arguments |
| `as_expr` | `boolean` | Execute as expression |
| `timeout` | `number` | Script timeout in seconds |
| `sandbox` | `string` | Sandbox name |

Recommendations:

- Use `as_expr: true` for quick value reads;
- Use `return ...` style for complex scripts;
- Skip `sandbox` at the beginning, add later if needed.

Parameter call examples:

```js
const sum = await page.run_js('return arguments[0] + arguments[1];', 1, 2);
const title = await page.run_js('document.title', { as_expr: true, timeout: 5 });
```

### 4.4 Page Info

- `await page.title`
- `await page.url`
- `await page.html`

### 4.5 Page Shutdown

- `await page.close()`
- `await page.quit()`

---

## 5. Element APIs

Common element methods:

- `await ele.click()`
- `await ele.input(text)`
- `await ele.text`
- `await ele.attr(name)`
- `await ele.run_js(script, ...args)`

Example:

```js
const searchInput = await page.ele('#sb_form_q');
await searchInput.input('ruyipage');
```

---

## 6. Prompt & Dialogs

### 6.1 Auto Handling Strategy

```js
await page.set_prompt_handler({
  alert: 'dismiss',
  confirm: 'accept',
  prompt: 'ignore',
  default: 'dismiss',
  // prompt_text: 'optional text'
});
```

Supported strategies:
- `'accept'`
- `'dismiss'`
- `'ignore'`

Parameter guide (`set_prompt_handler(config)`):

| Field | Allowed values | Description |
| --- | --- | --- |
| `alert` | `accept/dismiss/ignore` | Alert strategy |
| `confirm` | `accept/dismiss/ignore` | Confirm strategy |
| `prompt` | `accept/dismiss/ignore` | Prompt strategy |
| `default` | `accept/dismiss/ignore` | Fallback strategy |
| `prompt_text` | `string` | Auto input text for prompt |

Beginner-friendly baseline:

```js
await page.set_prompt_handler({
  alert: 'dismiss',
  confirm: 'accept',
  prompt: 'ignore',
  default: 'dismiss',
});
```

### 6.2 Manual Handling

- `await page.wait_prompt(timeout?)`
- `await page.accept_prompt(text?)`
- `await page.dismiss_prompt()`
- `await page.handle_prompt(accept?, text?)`

### 6.3 Prompt Login Flow

- `await page.prompt_login(locator, username, password, trigger?, timeout?)`

Parameter guide (`prompt_login`):

| Parameter | Type | Description |
| --- | --- | --- |
| `locator` | `string` | Locator for the element that triggers login prompt |
| `username` | `string` | First prompt input |
| `password` | `string` | Second prompt input |
| `trigger` | `string` / `undefined` | Trigger mode (commonly `mouse`) |
| `timeout` | `number` / `undefined` | Timeout in seconds |

Example:

```js
await page.prompt_login('#login-btn', 'alice', 'p@ssw0rd', 'mouse', 8);
```

Flow explanation:

1. Locate and trigger the login action by `locator`;  
2. First prompt receives `username`;  
3. Second prompt receives `password`;  
4. Timeout/error should be handled by outer `try/finally`.

---

## 7. Common Scenarios

### 7.1 Open page and click element

```js
await page.get('https://example.com');
const btn = await page.ele('#submit');
await btn.click();
```

### 7.2 Read text from list

```js
const items = await page.eles('.item');
for (const it of items) {
  console.log(await it.text);
}
```

### 7.3 Run page script

```js
const title = await page.run_js('return document.title;');
console.log(title);
```

---

## 8. Example Test Case

This example shows `set_prompt_handler` and prompt state checks.

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

## 9. Notes

- Most browser-interaction APIs require `await`
- Always call `await page.quit()` in `finally`
- For dynamic pages, add timeout/retry strategy for element lookup
- Avoid mixing auto prompt handling and manual handling at the same moment
- Start with CSS locators first, then introduce XPath when needed
- Stabilize single-page flows first, then add frame/tab/prompt complexity

---

## Parameter Quick Copy

```js
await page.get('https://example.com', true, 15);
const ele = await page.ele('#submit', 1, 5);
const value = await page.run_js('document.title', { as_expr: true, timeout: 5 });
await page.set_prompt_handler({ alert: 'dismiss', confirm: 'accept', prompt: 'ignore', default: 'dismiss' });
await page.prompt_login('#login-btn', 'alice', 'p@ssw0rd', 'mouse', 8);
```
