'use strict';

const fs = require('fs');
const path = require('path');

class FirefoxOptions {
  constructor() {
    this._browser_path = process.platform === 'win32'
      ? 'C:\\Program Files\\Mozilla Firefox\\firefox.exe'
      : process.platform === 'darwin'
        ? '/Applications/Firefox.app/Contents/MacOS/firefox'
        : 'firefox';

    this._address = '127.0.0.1';
    this._port = 9222;
    this._profile_path = null;
    this._arguments = [];
    this._preferences = {};
    this._headless = false;
    this._download_path = '.';
    this._load_mode = 'normal';
    this._timeouts = { base: 10, page_load: 30, script: 30 };
    this._existing_only = false;
    this._retry_times = 10;
    this._retry_interval = 2.0;
    this._proxy = null;
    this._auto_port = false;
    this._fpfile = null;
    this._private_mode = false;
    this._user_prompt_handler = null;
    this._xpath_picker_enabled = false;
    this._action_visual_enabled = false;
    /** @type {string|null} BiDi browser.UserContext id（触摸模拟 scope=user_context 时使用） */
    this._user_context = null;
  }

  get browser_path() { return this._browser_path; }
  get address() { return `${this._address}:${this._port}`; }
  get host() { return this._address; }
  get port() { return this._port; }
  get profile_path() { return this._profile_path; }
  get arguments() { return this._arguments.slice(); }
  get preferences() { return { ...this._preferences }; }
  get is_headless() { return this._headless; }
  get download_path() { return this._download_path; }
  get load_mode() { return this._load_mode; }
  get timeouts() { return { ...this._timeouts }; }
  get is_existing_only() { return this._existing_only; }
  get retry_times() { return this._retry_times; }
  get retry_interval() { return this._retry_interval; }
  get proxy() { return this._proxy; }
  get auto_port() { return this._auto_port; }
  get fpfile() { return this._fpfile; }
  get is_private_mode() { return this._private_mode; }
  /** Python: ``user_prompt_handler`` 属性（``session`` 级 ``unhandledPromptBehavior`` 源数据） */
  get user_prompt_handler() {
    return this._user_prompt_handler && typeof this._user_prompt_handler === 'object'
      ? { ...this._user_prompt_handler }
      : null;
  }
  get xpath_picker_enabled() { return this._xpath_picker_enabled; }
  get action_visual_enabled() { return this._action_visual_enabled; }
  get user_context() { return this._user_context; }

  set_browser_path(p) {
    this._browser_path = p;
    return this;
  }

  set_address(address) {
    const s = String(address);
    const v6 = s.match(/^\[([^\]]+)\]:(\d+)$/);
    if (v6) {
      this._address = v6[1];
      this._port = parseInt(v6[2], 10);
      return this;
    }
    const idx = s.lastIndexOf(':');
    if (idx > 0) {
      this._address = s.slice(0, idx);
      this._port = parseInt(s.slice(idx + 1), 10);
    } else {
      this._address = s;
    }
    return this;
  }

  set_port(port) {
    this._port = parseInt(port, 10);
    return this;
  }

  set_argument(arg, value = null) {
    if (value != null) {
      this._arguments.push(`${arg}=${value}`);
    } else if (!this._arguments.includes(arg)) {
      this._arguments.push(arg);
    }
    return this;
  }

  remove_argument(arg) {
    this._arguments = this._arguments.filter(
      (a) => a !== arg && !String(a).startsWith(`${arg}=`)
    );
    return this;
  }

  set_pref(key, value) {
    this._preferences[key] = value;
    return this;
  }

  set_user_prompt_handler(handler) {
    this._user_prompt_handler = handler ? { ...handler } : null;
    return this;
  }

  set_download_path(downloadPath) {
    this._download_path = path.resolve(String(downloadPath));
    return this;
  }

  set_auto_port(onOff = true) {
    this._auto_port = onOff;
    return this;
  }

  set_retry(times = null, interval = null) {
    if (times != null) this._retry_times = times;
    if (interval != null) this._retry_interval = interval;
    return this;
  }

  set_profile(profilePath) {
    this._profile_path = profilePath;
    return this;
  }

  set_user_dir(userDir) {
    return this.set_profile(userDir);
  }

  set_user_context(contextId) {
    this._user_context = contextId != null ? String(contextId) : null;
    return this;
  }

  /**
   * 设置浏览器代理（写入 profile 的 user.js）。
   * @param {string} proxy - 如 ``http://127.0.0.1:7890``、``socks5://127.0.0.1:1080``
   */
  set_proxy(proxy) {
    this._proxy = proxy ? String(proxy) : null;
    return this;
  }

  headless(on = true) {
    this._headless = !!on;
    return this;
  }

  existing_only(on = true) {
    this._existing_only = !!on;
    return this;
  }

  set_load_mode(mode) {
    this._load_mode = mode;
    return this;
  }

  set_timeouts({ base, page_load, script } = {}) {
    if (base != null) this._timeouts.base = base;
    if (page_load != null) this._timeouts.page_load = page_load;
    if (script != null) this._timeouts.script = script;
    return this;
  }

  set_window_size(width, height) {
    this._arguments = this._arguments.filter(
      (a) => !String(a).startsWith('--width=') && !String(a).startsWith('--height=')
    );
    this._arguments.push(`--width=${parseInt(width, 10)}`);
    this._arguments.push(`--height=${parseInt(height, 10)}`);
    return this;
  }

  set_fpfile(fp) {
    this._fpfile = fp;
    return this;
  }

  private_mode(on = true) {
    this._private_mode = !!on;
    return this;
  }

  enable_xpath_picker(on = true) {
    this._xpath_picker_enabled = !!on;
    return this;
  }

  enable_action_visual(on = true) {
    this._action_visual_enabled = !!on;
    return this;
  }

  quick_start({
    browser_path: browserPath = null,
    user_dir: userDir = null,
    private: priv = false,
    headless: hl = false,
    xpath_picker: xpathPicker = false,
    action_visual: actionVisual = false,
    window_size: windowSize = [1280, 800],
    timeout_base: timeoutBase = 10,
    timeout_page_load: timeoutPageLoad = 30,
    timeout_script: timeoutScript = 30,
  } = {}) {
    if (browserPath) this.set_browser_path(browserPath);
    if (userDir) this.set_user_dir(userDir);
    this.private_mode(priv);
    this.headless(hl);
    this.enable_xpath_picker(xpathPicker);
    this.enable_action_visual(actionVisual);
    if (windowSize && windowSize.length === 2) {
      this.set_window_size(windowSize[0], windowSize[1]);
    }
    this.set_timeouts({
      base: timeoutBase,
      page_load: timeoutPageLoad,
      script: timeoutScript,
    });
    return this;
  }

  build_command() {
    const cmd = [this._browser_path];
    cmd.push(`--remote-debugging-port=${this._port}`);
    cmd.push('--no-remote');
    cmd.push('--marionette');
    if (this._profile_path) {
      cmd.push('--profile', this._profile_path);
    }
    if (this._headless) cmd.push('--headless');
    if (this._private_mode) cmd.push('-private');
    if (this._fpfile) cmd.push(`--fpfile=${this._fpfile}`);
    for (const a of this._arguments) cmd.push(a);
    return cmd;
  }

  write_prefs_to_profile() {
    if (!this._profile_path) return;

    const prefs = { ...this._preferences };
    prefs['remote.prefs.recommended'] = prefs['remote.prefs.recommended'] ?? true;
    prefs['datareporting.policy.dataSubmissionEnabled'] = prefs['datareporting.policy.dataSubmissionEnabled'] ?? false;
    prefs['toolkit.telemetry.reportingpolicy.firstRun'] = prefs['toolkit.telemetry.reportingpolicy.firstRun'] ?? false;
    prefs['browser.shell.checkDefaultBrowser'] = prefs['browser.shell.checkDefaultBrowser'] ?? false;
    prefs['browser.startup.homepage_override.mstone'] = prefs['browser.startup.homepage_override.mstone'] ?? 'ignore';
    prefs['browser.tabs.warnOnClose'] = prefs['browser.tabs.warnOnClose'] ?? false;
    prefs['browser.warnOnQuit'] = prefs['browser.warnOnQuit'] ?? false;
    prefs['marionette.enabled'] = prefs['marionette.enabled'] ?? true;

    if (this._download_path) {
      prefs['browser.download.dir'] = this._download_path;
      prefs['browser.download.folderList'] = 2;
      prefs['browser.download.useDownloadDir'] = true;
    }

    if (this._proxy) {
      const proxy = this._proxy;
      let scheme = 'http';
      let addr = proxy;
      if (proxy.includes('://')) {
        [scheme, addr] = proxy.split('://', 2);
      }
      const lastColon = addr.lastIndexOf(':');
      const host = lastColon > 0 ? addr.slice(0, lastColon) : addr;
      const prt = lastColon > 0 ? addr.slice(lastColon + 1) : '8080';
      if (scheme.startsWith('socks')) {
        prefs['network.proxy.type'] = 1;
        prefs['network.proxy.socks'] = host;
        prefs['network.proxy.socks_port'] = parseInt(prt, 10);
        prefs['network.proxy.socks_version'] = scheme.includes('5') ? 5 : 4;
        prefs['network.proxy.socks_remote_dns'] = prefs['network.proxy.socks_remote_dns'] ?? true;
      } else {
        prefs['network.proxy.type'] = 1;
        prefs['network.proxy.http'] = host;
        prefs['network.proxy.http_port'] = parseInt(prt, 10);
        prefs['network.proxy.ssl'] = host;
        prefs['network.proxy.ssl_port'] = parseInt(prt, 10);
        prefs['signon.autologin.proxy'] = prefs['signon.autologin.proxy'] ?? true;
        prefs['network.auth.subresource-http-auth-allow'] = prefs['network.auth.subresource-http-auth-allow'] ?? 2;
      }
    }

    fs.mkdirSync(this._profile_path, { recursive: true });
    const lines = [];
    for (const [key, value] of Object.entries(prefs)) {
      let valStr;
      if (typeof value === 'boolean') valStr = value ? 'true' : 'false';
      else if (typeof value === 'number') valStr = String(value);
      else if (typeof value === 'string') {
        valStr = `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
      } else {
        valStr = `"${String(value)}"`;
      }
      lines.push(`user_pref("${key}", ${valStr});`);
    }
    fs.writeFileSync(path.join(this._profile_path, 'user.js'), `${lines.join('\n')}\n`, 'utf8');
  }

  toString() {
    return `<FirefoxOptions ${this.address}>`;
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toString();
  }
}

module.exports = { FirefoxOptions };
