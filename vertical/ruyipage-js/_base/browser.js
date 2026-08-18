'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const { BrowserBiDiDriver } = require('./driver');
const { FirefoxOptions } = require('../_configs/firefox_options');
const { getBidiWsUrl, isPortOpen } = require('../_adapter/remote_agent');
const bidiSession = require('../_bidi/session');
const bidiContext = require('../_bidi/browsing_context');
const { FirefoxTab } = require('../_pages/firefox_tab');
const { BrowserConnectError, BrowserLaunchError } = require('../errors');

function normalizeOptions(addrOrOpts) {
  if (addrOrOpts instanceof FirefoxOptions) return addrOrOpts;
  if (typeof addrOrOpts === 'string') {
    const o = new FirefoxOptions();
    o.set_address(addrOrOpts);
    return o;
  }
  if (addrOrOpts == null) return new FirefoxOptions();
  return new FirefoxOptions().set_address(String(addrOrOpts));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Firefox {
  static _BROWSERS = new Map();

  static async create(addrOrOpts = null) {
    const opts = normalizeOptions(addrOrOpts);
    const address = opts.address;
    const existing = Firefox._BROWSERS.get(address);
    if (existing && existing._initialized) return existing;

    const browser = new Firefox();
    await browser._connectOrLaunch(opts);
    Firefox._BROWSERS.set(browser._address, browser);
    return browser;
  }

  constructor() {
    this._options = null;
    this._address = '';
    this._driver = null;
    this._process = null;
    this._session_id = '';
    this._owns_session = false;
    this._context_ids = [];
    this._tab_objects = new Map();
    this._auto_profile = null;
    this._initialized = false;
    this._xpath_picker_global_preload_script_id = null;
    this._action_visual_global_preload_script_id = null;
  }

  get address() { return this._address; }
  get driver() { return this._driver; }
  get session_id() { return this._session_id; }
  get options() { return this._options; }
  get process() { return this._process; }

  /** Python: browser.tab_ids（JS: ``await browser.tab_ids``） */
  get tab_ids() {
    return (async () => {
      await this._refresh_tabs();
      return this._context_ids.slice();
    })();
  }

  /** Python: browser.tabs_count */
  get tabs_count() {
    return (async () => {
      const ids = await this.tab_ids;
      return ids.length;
    })();
  }

  _get_or_create_tab(contextId) {
    if (!contextId) return null;
    if (!this._tab_objects.has(contextId)) {
      const tab = new FirefoxTab();
      tab._init_from_browser(this, contextId);
      this._tab_objects.set(contextId, tab);
    }
    return this._tab_objects.get(contextId);
  }

  /** Python: browser.latest_tab */
  get latest_tab() {
    return (async () => {
      await this._refresh_tabs();
      if (!this._context_ids.length) return null;
      return this._get_or_create_tab(this._context_ids[this._context_ids.length - 1]);
    })();
  }

  /**
   * Python: browser.get_tab(id_or_num=None, title=None, url=None)
   */
  async get_tab(id_or_num = null, title = null, url = null) {
    await this._refresh_tabs();
    if (typeof id_or_num === 'number') {
      const idx = id_or_num > 0 ? id_or_num - 1 : id_or_num;
      if (idx >= 0 && idx < this._context_ids.length) {
        return this._get_or_create_tab(this._context_ids[idx]);
      }
      if (id_or_num < 0 && this._context_ids.length + id_or_num >= 0) {
        return this._get_or_create_tab(this._context_ids[this._context_ids.length + id_or_num]);
      }
      return null;
    }
    if (typeof id_or_num === 'string') {
      if (this._context_ids.includes(id_or_num)) return this._get_or_create_tab(id_or_num);
      return null;
    }
    if (title || url) {
      for (const ctxId of this._context_ids) {
        const tab = this._get_or_create_tab(ctxId);
        if (title) {
          const t = await tab.title;
          if (!t.includes(title)) continue;
        }
        if (url) {
          const u = await tab.url;
          if (!u.includes(url)) continue;
        }
        return tab;
      }
      return null;
    }
    if (this._context_ids.length) return this._get_or_create_tab(this._context_ids[0]);
    return null;
  }

  /** Python: browser.get_tabs(title=None, url=None) */
  async get_tabs(title = null, url = null) {
    await this._refresh_tabs();
    const out = [];
    for (const ctxId of this._context_ids) {
      const tab = this._get_or_create_tab(ctxId);
      if (title) {
        const t = await tab.title;
        if (!t.includes(title)) continue;
      }
      if (url) {
        const u = await tab.url;
        if (!u.includes(url)) continue;
      }
      out.push(tab);
    }
    return out;
  }

  /** Python: browser.new_tab(url=None, background=False) */
  async new_tab(url = null, background = false) {
    const ref = this._context_ids[0] || null;
    const params = { type: 'tab', background: !!background };
    if (ref) params.referenceContext = ref;
    const r = await this._driver.run('browsingContext.create', params);
    const ctxId = r.context || '';
    if (ctxId && !this._context_ids.includes(ctxId)) this._context_ids.push(ctxId);
    const tab = this._get_or_create_tab(ctxId);
    if (url) await tab.get(url);
    return tab;
  }

  /** Python: browser.activate_tab */
  async activate_tab(id_ind_tab) {
    let ctxId;
    if (typeof id_ind_tab === 'string') {
      ctxId = id_ind_tab;
    } else if (typeof id_ind_tab === 'number') {
      const idx = id_ind_tab > 0 ? id_ind_tab - 1 : id_ind_tab;
      ctxId = this._context_ids[idx];
    } else {
      ctxId = id_ind_tab._context_id || id_ind_tab.tab_id;
    }
    await bidiContext.activate(this._driver, ctxId);
  }

  /** Python: browser.close_tabs(tabs_or_ids=None, others=False) */
  async close_tabs(tabs_or_ids = null, others = false) {
    if (tabs_or_ids == null) return;
    const list = Array.isArray(tabs_or_ids) ? tabs_or_ids : [tabs_or_ids];
    const targetIds = new Set();
    for (const t of list) {
      if (typeof t === 'string') targetIds.add(t);
      else targetIds.add(t._context_id || String(t));
    }
    let toClose;
    if (others) {
      toClose = this._context_ids.filter((cid) => !targetIds.has(cid));
    } else {
      toClose = this._context_ids.filter((cid) => targetIds.has(cid));
    }
    for (const cid of toClose) {
      try {
        await bidiContext.close(this._driver, cid);
      } catch (_) { /* ignore */ }
      this._tab_objects.delete(cid);
    }
    await this._refresh_tabs();
  }

  async _connectOrLaunch(opts) {
    this._options = opts;
    this._address = opts.address;

    if (await this._try_connect()) {
      this._initialized = true;
      return;
    }

    if (opts.is_existing_only) {
      throw new BrowserConnectError(
        `无法连接到 ${this._address}，请先启动 Firefox 并开启远程调试端口 ${opts.port}。`
      );
    }

    await this._ensure_launch_port_available();
    await this._launch_browser();

    for (let i = 0; i <= opts.retry_times; i += 1) {
      if (await this._try_connect()) {
        this._initialized = true;
        return;
      }
      await sleep(opts.retry_interval * 1000);
    }

    throw new BrowserConnectError(`启动后无法连接到 ${this._address}，请检查 Firefox 是否正常启动。`);
  }

  async _ensure_launch_port_available() {
    const [host, portStr] = this._address.split(':');
    const port = parseInt(portStr, 10);
    if (await isPortOpen(host, port, 500)) {
      const o = this._options;
      let p = port + 1;
      while (p < 65535 && await isPortOpen(host, p, 200)) p += 1;
      o.set_port(p);
      this._address = o.address;
      // eslint-disable-next-line no-console
      console.warn(`检测到端口 ${port} 已被占用，已自动切换到 ${p}`);
    }
  }

  async _launch_browser() {
    const opts = this._options;
    if (!opts.profile_path) {
      this._auto_profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ruyipage_'));
      opts.set_profile(this._auto_profile);
    }
    opts.write_prefs_to_profile();
    const cmd = opts.build_command();

    try {
      this._process = spawn(cmd[0], cmd.slice(1), {
        stdio: 'ignore',
        detached: false,
        windowsHide: true,
      });
    } catch (e) {
      if (e.code === 'ENOENT') {
        throw new BrowserLaunchError(
          `找不到 Firefox: ${opts.browser_path}\n请安装 Firefox 或通过 set_browser_path() 指定路径。`
        );
      }
      throw new BrowserLaunchError(`启动 Firefox 失败: ${e.message}`);
    }

    await sleep(1000);
  }

  async _try_connect() {
    const [host, portStr] = this._address.split(':');
    const port = parseInt(portStr, 10);
    if (!await isPortOpen(host, port, 2000)) return false;

    try {
      const wsUrl = await getBidiWsUrl(host, port, 5);
      this._driver = BrowserBiDiDriver.getInstance(this._address);
      await this._driver.start(wsUrl);
      await this._create_session();
      await this._subscribe_events();
      await this._setup_download_behavior();
      await this._refresh_tabs();
      return true;
    } catch (e) {
      if (this._driver) {
        try {
          this._driver.stop();
        } catch (_) { /* ignore */ }
        this._driver = null;
      }
      return false;
    }
  }

  async _create_session() {
    let status = { ready: true, message: '' };
    try {
      status = await bidiSession.status(this._driver);
    } catch (_) { /* ignore */ }

    const tryNew = async () => {
      const result = await bidiSession.sessionNew(
        this._driver,
        {},
        this._options._user_prompt_handler
      );
      this._session_id = result.sessionId || '';
      this._driver.session_id = this._session_id;
      this._owns_session = true;
    };

    if (status.ready) {
      await tryNew();
      return;
    }

    try {
      await bidiSession.end(this._driver);
    } catch (_) { /* ignore */ }

    try {
      await tryNew();
    } catch (e) {
      const errStr = String(e.message || e).toLowerCase();
      if (errStr.includes('maximum') || errStr.includes('session not created')) {
        this._session_id = '';
        this._driver.session_id = '';
        this._owns_session = false;
        return;
      }
      throw e;
    }
  }

  async _subscribe_events() {
    try {
      await bidiSession.subscribe(this._driver, [
        'browsingContext.contextCreated',
        'browsingContext.contextDestroyed',
      ]);
    } catch (_) { /* ignore */ }

    this._driver.set_callback('browsingContext.contextCreated', (params) => {
      const ctx = params.context || '';
      if (ctx && !this._context_ids.includes(ctx)) this._context_ids.push(ctx);
    });
    this._driver.set_callback('browsingContext.contextDestroyed', (params) => {
      const ctx = params.context || '';
      const i = this._context_ids.indexOf(ctx);
      if (i >= 0) this._context_ids.splice(i, 1);
      this._tab_objects.delete(ctx);
    });
  }

  async _setup_download_behavior() {
    const downloadPath = this._options.download_path;
    if (!downloadPath) return;
    const abs = path.resolve(downloadPath);
    try {
      await this._driver.run('browser.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: abs,
      });
    } catch (_) { /* 部分版本不支持 */ }
  }

  async _refresh_tabs() {
    try {
      const result = await bidiContext.getTree(this._driver, { maxDepth: 0 });
      const contexts = result.contexts || [];
      this._context_ids = contexts.map((c) => c.context).filter(Boolean);
    } catch (_) { /* ignore */ }
  }

  /**
   * 复用探测阶段已建立的 BiDi 连接构造浏览器（对应 Python ``create_browser_from_probe_info``）。
   * @param {object} info - ``probeBidiAddress(..., keepDriver=true)`` 的返回值
   */
  static async fromProbeInfo(info) {
    const address = info.address;
    const existing = Firefox._BROWSERS.get(address);
    if (existing && existing._initialized) return existing;

    const driver = info.driver;
    if (!driver) {
      throw new BrowserConnectError('探测结果中缺少可复用的 BiDi 连接');
    }

    const browser = new Firefox();
    browser._options = new FirefoxOptions().set_address(address).existing_only(true);
    browser._address = address;
    browser._driver = driver;
    browser._session_id = info.session_id || '';
    browser._owns_session = !!info.session_owned;
    browser._process = null;
    browser._context_ids = (info.contexts || []).map((c) => c.context).filter(Boolean);
    browser._tab_objects = new Map();
    browser._auto_profile = null;

    await browser._subscribe_events();
    await browser._setup_download_behavior();
    await browser._refresh_tabs();
    browser._initialized = true;
    Firefox._BROWSERS.set(address, browser);
    return browser;
  }

  async quit(timeout = 5, force = false) {
    const addr = this._address;
    if (this._driver) {
      this._driver.mark_closing();
      try {
        await this._driver.run('browser.close', {}, 3);
      } catch (_) { /* ignore */ }

      if (this._owns_session) {
        try {
          await bidiSession.end(this._driver);
        } catch (_) { /* ignore */ }
        this._owns_session = false;
      }
      try {
        this._driver.stop();
      } catch (_) { /* ignore */ }
      this._driver = null;
    }

    if (this._process) {
      try {
        this._process.kill(force ? 'SIGKILL' : undefined);
        await new Promise((resolve) => {
          const t = setTimeout(resolve, timeout * 1000);
          this._process.once('exit', () => {
            clearTimeout(t);
            resolve();
          });
        });
      } catch (_) { /* ignore */ }
      this._process = null;
    }

    if (this._auto_profile) {
      try {
        fs.rmSync(this._auto_profile, { recursive: true, force: true });
      } catch (_) { /* ignore */ }
      this._auto_profile = null;
    }

    Firefox._BROWSERS.delete(addr);
    this._initialized = false;
  }

  toString() {
    return `<Firefox ${this._address || ''}>`;
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toString();
  }
}

async function createBrowserFromProbeInfo(info) {
  return Firefox.fromProbeInfo(info);
}

module.exports = { Firefox, normalizeOptions, createBrowserFromProbeInfo };
