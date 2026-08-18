'use strict';

const { BasePage } = require('../_base/base');
const { ContextDriver } = require('../_base/driver');
const { Settings } = require('../_functions/settings');
const { Keys } = require('../_functions/keys');
const { parse_locator: parseLocator } = require('../_functions/locator');
const {
  parse_value: parseValue,
  make_shared_ref: makeSharedRef,
  serialize_value: serializeValue,
} = require('../_functions/bidi_values');
const { ElementNotFoundError, BiDiError, JavaScriptError, WaitTimeoutError } = require('../errors');
const bidiContext = require('../_bidi/browsing_context');
const bidiScript = require('../_bidi/script');
const injectStrings = require('./_inject_strings');
const bidiStorage = require('../_bidi/storage');
const { FirefoxElement } = require('../_elements/firefox_element');
const { NoneElement } = require('../_elements/none_element');
const { Actions } = require('../_units/actions');
const { create_page_wait } = require('../_units/page_waiter');
const { Listener } = require('../_units/listener');
const { Interceptor } = require('../_units/interceptor');
const { NetworkManager } = require('../_units/network_tools');
const { ExtensionManager } = require('../_units/extensions');
const { CookieInfo } = require('../_units/cookies');
const { PageScroller } = require('../_units/page_scroller');
const { TouchActions } = require('../_units/touch_actions');
const { PrefsManager } = require('../_units/prefs');
const { TabRect } = require('../_units/tab_rect');
const { PageStates } = require('../_units/page_states');
const { PageSetter } = require('../_units/page_setter');
const { StorageManager } = require('../_units/dom_storage');
const { CookiesSetter } = require('../_units/cookies_setter');
const { ConsoleListener } = require('../_units/console_listener');
const { WindowManager } = require('../_units/window_manager');
const { BrowserManager } = require('../_units/browser_manager');
const { ContextManager } = require('../_units/contexts_manager');
const { EmulationManager } = require('../_units/emulation_manager');
const { DownloadsManager } = require('../_units/downloads_manager');
const { EventTracker } = require('../_units/events');
const { NavigationTracker } = require('../_units/navigation_tracker');
const { RealmTracker } = require('../_units/realm_tracker');
const { ConfigManager } = require('../_units/config_manager');
const { wrapCallableInvoke } = require('../_functions/callable_proxy');
const bidiSession = require('../_bidi/session');
const bidiPermissions = require('../_bidi/permissions_commands');
const { ScriptResult } = require('../_units/script_tools');
const { make_static_ele: makeStaticEle, make_static_eles: makeStaticEles } = require('../_elements/static_element');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function _peel_run_js_kwargs(args) {
  if (!args.length) return { args: [], kwargs: {} };
  const last = args[args.length - 1];
  if (last && typeof last === 'object' && !Array.isArray(last)) {
    const keys = Object.keys(last);
    const allowed = new Set(['as_expr', 'timeout', 'sandbox']);
    if (keys.length && keys.every((k) => allowed.has(k))) {
      return { args: args.slice(0, -1), kwargs: last };
    }
  }
  return { args: [...args], kwargs: {} };
}

class FirefoxBase extends BasePage {
  /** Python: ``FirefoxBase._is_expected_navigation_abort`` */
  static isExpectedNavigationAbort(error) {
    if (!(error instanceof BiDiError)) return false;
    const text = `${error.error || ''} ${error.bidi_message || ''}`.toUpperCase();
    return text.includes('NS_BINDING_ABORTED');
  }

  constructor() {
    super();
    this._type = 'FirefoxBase';
    this._browser = null;
    this._context_id = null;
    this._driver = null;
    this._load_mode = 'normal';
    this._actions = null;
    this._wait = null;
    this._listener = null;
    this._interceptor = null;
    this._network_manager = null;
    this._extensions = null;
    this._scroll = null;
    this._touch = null;
    this._prefs = null;
    this._realms = null;
    this._config = null;
    this._rect = null;
    this._states = null;
    this._setter = null;
    this._local_storage = null;
    this._session_storage = null;
    this._console = null;
    this._window = null;
    this._browser_manager = null;
    this._contexts = null;
    this._emulation = null;
    this._downloads = null;
    this._events = null;
    this._navigation = null;
    this._last_prompt_opened = null;
    this._last_prompt_closed = null;
    this._prompt_subscription_id = null;
    this._prompt_handler_config = null;
    this._prompt_on_opened = null;
    this._prompt_on_closed = null;
    this._ua_preload_script_id = null;
    this._cookies_setter = null;
  }

  /**
   * Python: ``BasePage.__repr__`` 为 ``<Type url>``；JS 中 ``url`` 为异步 getter，
   * 此处用 ``_context_id``（browsing context id）作为同步可读的身份片段；空时仍保留空格，与 Python 空 ``url`` 时 ``<FirefoxBase >`` 形态一致。
   */
  toString() {
    const tail = this._context_id != null && this._context_id !== '' ? String(this._context_id) : '';
    return `<${this._type} ${tail}>`;
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toString();
  }

  _initContext(browser, contextId) {
    if (this._driver && this._prompt_subscription_id) {
      void this.clear_prompt_handler();
    }
    this._browser = browser;
    this._context_id = contextId;
    this._driver = new ContextDriver(browser.driver, contextId);
    this._load_mode = browser.options.load_mode || 'normal';
    this._wait = null;
    this._scroll = null;
    this._touch = null;
    this._prefs = null;
    this._realms = null;
    this._config = null;
    this._rect = null;
    this._states = null;
    this._setter = null;
    this._local_storage = null;
    this._session_storage = null;
    this._console = null;
    this._window = null;
    this._browser_manager = null;
    this._contexts = null;
    this._emulation = null;
    this._downloads = null;
    this._events = null;
    this._navigation = null;
    this._actions = null;
    this._listener = null;
    this._interceptor = null;
    this._network_manager = null;
    this._extensions = null;
    this._cookies_setter = null;
    void (async () => {
      try {
        await this._maybeEnableXpathPicker();
        await this._maybeEnableActionVisual();
      } catch (_) { /* ignore */ }
    })();
  }

  async _maybeEnableXpathPicker() {
    const opts = this._browser && this._browser.options;
    if (!opts || !opts.xpath_picker_enabled) return;
    const bd = this._driver._browser_driver;
    const src = injectStrings.xpathPicker;
    const bridge = injectStrings.xpathFrameBridge;
    try {
      if (!this._browser._xpath_picker_global_preload_script_id) {
        const r = await bidiScript.add_preload_script(bd, src, {});
        this._browser._xpath_picker_global_preload_script_id = r.script || '';
      }
      await this.run_js(`(${src})()`, { as_expr: true });
      await this.run_js(bridge, injectStrings.xpathPicker);
    } catch (_) { /* ignore */ }
  }

  async _reinjectXpathPickerIfNeeded() {
    const opts = this._browser && this._browser.options;
    if (!opts || !opts.xpath_picker_enabled) return;
    try {
      const src = injectStrings.xpathPicker;
      await this.run_js(`(${src})()`, { as_expr: true });
      await this.run_js(injectStrings.xpathFrameBridge, src);
    } catch (_) { /* ignore */ }
  }

  async _maybeEnableActionVisual() {
    const opts = this._browser && this._browser.options;
    if (!opts || !opts.action_visual_enabled) return;
    const bd = this._driver._browser_driver;
    const av = injectStrings.actionVisual;
    try {
      if (!this._browser._action_visual_global_preload_script_id) {
        const r = await bidiScript.add_preload_script(bd, av, {});
        this._browser._action_visual_global_preload_script_id = r.script || '';
      }
      await this.run_js(`(${av})()`, { as_expr: true });
    } catch (_) { /* ignore */ }
  }

  async _reinjectActionVisualIfNeeded() {
    const opts = this._browser && this._browser.options;
    if (!opts || !opts.action_visual_enabled) return;
    try {
      const av = injectStrings.actionVisual;
      await this.run_js(`(${av})()`, { as_expr: true });
    } catch (_) { /* ignore */ }
  }

  get browser() {
    return this._browser;
  }

  /** Python: ``page('loc')`` / ``__call__`` → ``await page.invoke('loc')`` */
  async invoke(locator, index = 1, timeout = null) {
    return this.ele(locator, index, timeout);
  }

  get actions() {
    if (!this._actions) this._actions = new Actions(this);
    return this._actions;
  }

  /** Python: page.wait — 可 ``await page.wait(2)`` 或 ``await page.wait.doc_loaded()`` */
  get wait() {
    if (!this._wait) this._wait = create_page_wait(this);
    return this._wait;
  }

  get listen() {
    if (!this._listener) this._listener = new Listener(this);
    return this._listener;
  }

  get intercept() {
    if (!this._interceptor) this._interceptor = new Interceptor(this);
    return this._interceptor;
  }

  get network() {
    if (!this._network_manager) this._network_manager = new NetworkManager(this);
    return this._network_manager;
  }

  get extensions() {
    if (!this._extensions) this._extensions = new ExtensionManager(this._driver);
    return this._extensions;
  }

  get scroll() {
    if (!this._scroll) this._scroll = new PageScroller(this);
    return this._scroll;
  }

  get touch() {
    if (!this._touch) this._touch = new TouchActions(this);
    return this._touch;
  }

  get prefs() {
    if (!this._prefs) this._prefs = new PrefsManager(this);
    return this._prefs;
  }

  get realms() {
    if (!this._realms) this._realms = new RealmTracker(this);
    return this._realms;
  }

  get config() {
    if (!this._config) this._config = new ConfigManager(this);
    return this._config;
  }

  get rect() {
    if (!this._rect) this._rect = new TabRect(this);
    return this._rect;
  }

  get states() {
    if (!this._states) this._states = new PageStates(this);
    return this._states;
  }

  get set() {
    if (!this._setter) this._setter = new PageSetter(this);
    return this._setter;
  }

  get local_storage() {
    if (!this._local_storage) this._local_storage = new StorageManager(this, 'local');
    return this._local_storage;
  }

  get session_storage() {
    if (!this._session_storage) this._session_storage = new StorageManager(this, 'session');
    return this._session_storage;
  }

  get console() {
    if (!this._console) this._console = new ConsoleListener(this);
    return this._console;
  }

  get window() {
    if (!this._window) this._window = new WindowManager(this);
    return this._window;
  }

  get browser_tools() {
    if (!this._browser_manager) this._browser_manager = new BrowserManager(this);
    return this._browser_manager;
  }

  get contexts() {
    if (!this._contexts) this._contexts = new ContextManager(this);
    return this._contexts;
  }

  get emulation() {
    if (!this._emulation) this._emulation = new EmulationManager(this);
    return this._emulation;
  }

  get downloads() {
    if (!this._downloads) this._downloads = new DownloadsManager(this);
    return this._downloads;
  }

  get events() {
    if (!this._events) this._events = new EventTracker(this);
    return this._events;
  }

  get navigation() {
    if (!this._navigation) this._navigation = new NavigationTracker(this);
    return this._navigation;
  }

  /** Python: page.tab_id */
  get tab_id() {
    return this._context_id;
  }

  /** Python: page.title（JS 用 ``await page.title``） */
  get title() {
    return (async () => {
      const r = await this.run_js('document.title');
      return r || '';
    })();
  }

  /** Python: page.html */
  get html() {
    return (async () => {
      const r = await this.run_js('document.documentElement.outerHTML');
      return r || '';
    })();
  }

  /** Python: page.url */
  get url() {
    return (async () => {
      const r = await this.run_js('location.href');
      return r || '';
    })();
  }

  /** Python: page.ready_state */
  get ready_state() {
    return (async () => {
      const r = await this.run_js('document.readyState');
      return r || '';
    })();
  }

  /** Python: page.user_agent */
  get user_agent() {
    return (async () => {
      const r = await this.run_js('navigator.userAgent');
      return r || '';
    })();
  }

  /** Python: page.cookies 属性（等同 get_cookies()） */
  get cookies() {
    return (async () => this.get_cookies(false))();
  }

  /** Python: ``page.cookies_setter``（``cookies_setter.CookiesSetter``） */
  get cookies_setter() {
    if (!this._cookies_setter) this._cookies_setter = new CookiesSetter(this);
    return this._cookies_setter;
  }

  /**
   * Python: page.get(url, wait=None, timeout=None)
   * @param {string} url
   * @param {string|null} [wait]
   * @param {number|null} [timeout]
   */
  async get(url, wait = null, timeout = null) {
    let w = wait;
    if (w == null) {
      const waitMap = { normal: 'complete', eager: 'interactive', none: 'none' };
      w = waitMap[this._load_mode] || 'complete';
    }

    const prev = timeout != null ? Settings.bidi_timeout : null;
    if (timeout != null) Settings.bidi_timeout = timeout;
    try {
      await bidiContext.navigate(this._driver._browser_driver, this._context_id, url, w);
    } catch (e) {
      if (!(e instanceof BiDiError)) throw e;
      if (FirefoxBase.isExpectedNavigationAbort(e)) {
        /* 页面主动中断导航，与 Python 一致忽略 */
      } else if (!String(e.error || '').toLowerCase().includes('timeout')) {
        console.warn('导航错误:', e);
      }
    } finally {
      if (prev != null) Settings.bidi_timeout = prev;
    }
    await this._reinjectXpathPickerIfNeeded();
    await this._reinjectActionVisualIfNeeded();
    return this;
  }

  async back() {
    await bidiContext.traverse_history(this._driver._browser_driver, this._context_id, -1);
    await this._reinjectXpathPickerIfNeeded();
    await this._reinjectActionVisualIfNeeded();
    return this;
  }

  async forward() {
    await bidiContext.traverse_history(this._driver._browser_driver, this._context_id, 1);
    await this._reinjectXpathPickerIfNeeded();
    await this._reinjectActionVisualIfNeeded();
    return this;
  }

  async refresh(ignore_cache = false) {
    const waitMap = { normal: 'complete', eager: 'interactive', none: 'none' };
    const w = waitMap[this._load_mode] || 'complete';
    try {
      await bidiContext.reload(this._driver._browser_driver, this._context_id, ignore_cache, w);
    } catch (e) {
      if (!(e instanceof BiDiError)) throw e;
      if (!FirefoxBase.isExpectedNavigationAbort(e)) throw e;
    }
    await this._reinjectXpathPickerIfNeeded();
    await this._reinjectActionVisualIfNeeded();
    return this;
  }

  async stop_loading() {
    await this.run_js('window.stop()');
    return this;
  }

  /** Python: page.wait_loading(timeout=None) */
  async wait_loading(timeout = null) {
    let t = timeout;
    if (t == null) t = Settings.bidi_timeout;
    const rs0 = await this.ready_state;
    if (rs0 === 'interactive' || rs0 === 'complete') {
      await this._reinjectXpathPickerIfNeeded();
      await this._reinjectActionVisualIfNeeded();
      return this;
    }
    const end = Date.now() + t * 1000;
    while (Date.now() < end) {
      const state = await this.ready_state;
      if (state === 'interactive' || state === 'complete') {
        await this._reinjectXpathPickerIfNeeded();
        await this._reinjectActionVisualIfNeeded();
        return this;
      }
      await sleep(100);
    }
    throw new WaitTimeoutError(`等待页面加载超时 (${t}s)`);
  }

  /**
   * Python: get_cookies(all_info=False)
   * @param {boolean} [all_info=false]
   */
  async get_cookies(all_info = false) {
    try {
      const result = await bidiStorage.get_cookies(this._driver._browser_driver, {
        partition: { context: this._context_id },
      });
      const cookies = result.cookies || [];
      if (!all_info) {
        return cookies.map((c) => new CookieInfo({
          name: c.name || '',
          value: (c.value && c.value.value) != null ? c.value.value : '',
        }));
      }
      return cookies.map((c) => new CookieInfo(c));
    } catch (_) {
      const cookieStr = (await this.run_js('document.cookie')) || '';
      const out = [];
      for (const pair of cookieStr.split(';')) {
        const p = pair.trim();
        if (!p) continue;
        const eq = p.indexOf('=');
        if (eq < 0) continue;
        out.push(new CookieInfo({
          name: p.slice(0, eq).trim(),
          value: p.slice(eq + 1).trim(),
        }));
      }
      return out;
    }
  }

  async get_cookies_filtered(name = null, domain = null, all_info = true) {
    let list = await this.get_cookies(all_info);
    if (name != null) list = list.filter((c) => c.name === name);
    if (domain != null) list = list.filter((c) => c.domain === domain);
    return list;
  }

  async set_cookies(cookies) {
    let list = cookies;
    if (!Array.isArray(list)) list = [list];
    const bd = this._driver._browser_driver;
    const part = { context: this._context_id };
    for (const cookie of list) {
      const bidiCookie = {
        name: cookie.name || '',
        value: { type: 'string', value: String(cookie.value != null ? cookie.value : '') },
        domain: cookie.domain || '',
      };
      for (const key of ['path', 'httpOnly', 'secure', 'sameSite', 'expiry']) {
        if (Object.prototype.hasOwnProperty.call(cookie, key)) bidiCookie[key] = cookie[key];
      }
      try {
        await bidiStorage.set_cookie(bd, bidiCookie, part);
      } catch (_) {
        await bidiStorage.set_cookie(bd, bidiCookie);
      }
    }
  }

  async delete_cookies(name = null, domain = null) {
    const filter = {};
    if (name) filter.name = name;
    if (domain) filter.domain = domain;
    const bd = this._driver._browser_driver;
    const part = { context: this._context_id };
    try {
      await bidiStorage.delete_cookies(bd, { filter_: Object.keys(filter).length ? filter : null, partition: part });
    } catch (_) {
      await bidiStorage.delete_cookies(bd, { filter_: Object.keys(filter).length ? filter : null });
    }
  }

  /**
   * Python: page.screenshot(path=None, full_page=False, as_bytes=None, as_base64=None)
   */
  async screenshot(path = null, full_page = false, { as_bytes: asBytes = null, as_base64: asBase64 = null } = {}) {
    const origin = full_page ? 'document' : 'viewport';
    const result = await bidiContext.capture_screenshot(this._driver._browser_driver, this._context_id, { origin });
    const dataB64 = result.data || '';
    const buf = Buffer.from(dataB64, 'base64');
    if (path) {
      const fs = require('fs');
      const p = require('path');
      const dir = p.dirname(p.resolve(path));
      if (dir) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path, buf);
    }
    if (asBytes) return buf;
    if (asBase64) return dataB64;
    if (path) return path;
    return buf;
  }

  async handle_alert(action = 'accept', text = null, timeout = 3) {
    const accept = action !== 'dismiss';
    const drv = this._driver._browser_driver;
    const end = Date.now() + timeout * 1000;
    while (Date.now() < end) {
      try {
        if (!drv.alert_flag) {
          await sleep(50);
          continue;
        }
        await bidiContext.handle_user_prompt(drv, this._context_id, accept, text);
        return this;
      } catch (e) {
        if (e instanceof BiDiError) {
          const code = String(e.error || '').toLowerCase();
          if (code.includes('no such alert')) {
            await sleep(50);
            continue;
          }
        }
        throw e;
      }
    }
    return this;
  }

  async accept_alert(text = null, timeout = 3) {
    return this.handle_alert('accept', text, timeout);
  }

  async dismiss_alert(timeout = 3) {
    return this.handle_alert('dismiss', null, timeout);
  }

  async get_user_prompt() {
    try {
      const result = await this._driver._browser_driver.run('browsingContext.getTree', { root: this._context_id });
      const contexts = result.contexts || [];
      if (!contexts.length) return null;
      const prompt = contexts[0].userPrompt;
      return prompt && typeof prompt === 'object' ? { ...prompt } : null;
    } catch (_) {
      return null;
    }
  }

  get_last_prompt_opened() {
    return this._last_prompt_opened && typeof this._last_prompt_opened === 'object'
      ? { ...this._last_prompt_opened }
      : null;
  }

  get_last_prompt_closed() {
    return this._last_prompt_closed && typeof this._last_prompt_closed === 'object'
      ? { ...this._last_prompt_closed }
      : null;
  }

  async set_prompt_handler({
    alert: alertAction = 'accept',
    confirm: confirmAction = 'accept',
    prompt: promptAction = 'ignore',
    default: defaultAction = 'accept',
    prompt_text: promptText = null,
  } = {}) {
    await this.clear_prompt_handler();
    this._prompt_handler_config = {
      alert: alertAction,
      confirm: confirmAction,
      prompt: promptAction,
      default: defaultAction,
      prompt_text: promptText,
    };
    const tabId = this._context_id;
    const bd = this._driver._browser_driver;
    /**
     * ``accept`` / ``dismiss`` / ``ignore`` → 是否点「确定」；``ignore`` 表示不自动 ``handleUserPrompt``。
     * @param {string} [strategy]
     * @returns {boolean|null}
     */
    const resolveAccept = (strategy) => {
      const s = String(strategy == null ? 'accept' : strategy).toLowerCase();
      if (s === 'ignore') return null;
      if (s === 'dismiss') return false;
      return true;
    };
    this._prompt_on_opened = (params) => {
      if (params.context !== tabId) return;
      this._last_prompt_opened = { ...params };
      const cfg = this._prompt_handler_config;
      if (!cfg) return;
      const t = String(params.type || '').toLowerCase();

      if (t === 'prompt' && cfg.prompt === 'ignore' && cfg.prompt_text != null) {
        void bidiContext.handle_user_prompt(bd, tabId, true, String(cfg.prompt_text)).catch(() => {});
        return;
      }
      /** ``alert`` / ``confirm`` / ``beforeUnload``：与 Python ``firefox_base.set_prompt_handler`` 中 ``on_opened`` 一致。 */
      if (t === 'alert') {
        const acc = resolveAccept(cfg.alert);
        if (acc == null) return;
        void bidiContext.handle_user_prompt(bd, tabId, acc, null).catch(() => {});
        return;
      }
      if (t === 'confirm') {
        const acc = resolveAccept(cfg.confirm);
        if (acc == null) return;
        void bidiContext.handle_user_prompt(bd, tabId, acc, null).catch(() => {});
        return;
      }
      if (t === 'beforeunload') {
        const acc = resolveAccept(cfg.default);
        if (acc == null) return;
        void bidiContext.handle_user_prompt(bd, tabId, acc, null).catch(() => {});
      }
    };
    this._prompt_on_closed = (params) => {
      if (params.context !== tabId) return;
      this._last_prompt_closed = { ...params };
    };
    this._driver._browser_driver.set_callback(
      'browsingContext.userPromptOpened',
      this._prompt_on_opened,
      tabId,
      true
    );
    this._driver._browser_driver.set_callback(
      'browsingContext.userPromptClosed',
      this._prompt_on_closed,
      tabId,
      true
    );
    const sub = await bidiSession.subscribe(this._driver._browser_driver, [
      'browsingContext.userPromptOpened',
      'browsingContext.userPromptClosed',
    ], [tabId]);
    this._prompt_subscription_id = sub.subscription;
    return this;
  }

  async clear_prompt_handler() {
    try {
      if (this._prompt_subscription_id) {
        await bidiSession.unsubscribe(this._driver._browser_driver, { subscription: this._prompt_subscription_id });
      }
    } catch (_) { /* ignore */ }
    try {
      if (this._driver) {
        this._driver._browser_driver.remove_callback(
          'browsingContext.userPromptOpened',
          this._context_id,
          true
        );
        this._driver._browser_driver.remove_callback(
          'browsingContext.userPromptClosed',
          this._context_id,
          true
        );
      }
    } catch (_) { /* ignore */ }
    this._prompt_subscription_id = null;
    this._prompt_handler_config = null;
    this._prompt_on_opened = null;
    this._prompt_on_closed = null;
    return this;
  }

  async wait_prompt(timeout = 3) {
    const end = Date.now() + timeout * 1000;
    const initialOpened = this.get_last_prompt_opened();
    const initialClosed = this.get_last_prompt_closed();
    while (Date.now() < end) {
      const opened = this.get_last_prompt_opened();
      const closed = this.get_last_prompt_closed();
      if (opened && JSON.stringify(opened) !== JSON.stringify(initialOpened)
        && JSON.stringify(opened) !== JSON.stringify(closed)) {
        return opened;
      }
      const prompt = await this.get_user_prompt();
      if (prompt) return prompt;
      await sleep(50);
    }
    return null;
  }

  async handle_prompt(accept = true, text = null, timeout = 3) {
    const prompt = await this.wait_prompt(timeout);
    if (!prompt) return this;
    await bidiContext.handle_user_prompt(
      this._driver._browser_driver,
      this._context_id,
      accept,
      text == null ? '' : String(text)
    );
    return this;
  }

  async respond_prompt({ accept = true, text = null, timeout = 3 } = {}) {
    return this.handle_prompt(accept, text, timeout);
  }

  async accept_prompt(text = null, timeout = 3) {
    return this.handle_prompt(true, text, timeout);
  }

  async dismiss_prompt(timeout = 3) {
    return this.handle_prompt(false, null, timeout);
  }

  async input_prompt(text, timeout = 3) {
    return this.handle_prompt(true, text, timeout);
  }

  async trigger_prompt_target(locator, trigger = 'mouse') {
    const ele = await this.ele(locator);
    if (!ele || ele.isNoneElement) return this;
    if (trigger === 'keyboard') {
      await ele.click_self();
      await this.actions.key_down(Keys.ENTER).key_up(Keys.ENTER).perform();
    } else {
      await ele.click_self();
    }
    return this;
  }

  /**
   * Python: ``prompt_login(trigger_locator, username, password, trigger='mouse', timeout=3)``
   */
  async prompt_login(triggerLocator, username, password, trigger = 'mouse', timeout = 3) {
    await this.clear_prompt_handler();
    const tabId = this._context_id;
    const bd = this._driver._browser_driver;
    let openedCount = 0;
    let doneResolve;
    const done = new Promise((r) => { doneResolve = r; });

    const onOpened = (params) => {
      if (params.context !== tabId || params.type !== 'prompt') return;
      openedCount += 1;
      /** 与 Python 同步回调一致：用本次事件的序号，避免异步处理时 ``openedCount`` 已被后续事件改写。 */
      const n = openedCount;
      this._last_prompt_opened = { ...params };
      (async () => {
        try {
          if (n === 1) {
            await bidiContext.handle_user_prompt(bd, tabId, true, String(username));
          } else if (n === 2) {
            await bidiContext.handle_user_prompt(bd, tabId, true, String(password));
            doneResolve(true);
          }
        } catch (_) { /* ignore */ }
      })();
    };
    const onClosed = (params) => {
      if (params.context !== tabId) return;
      this._last_prompt_closed = { ...params };
    };

    bd.set_callback('browsingContext.userPromptOpened', onOpened, tabId, true);
    bd.set_callback('browsingContext.userPromptClosed', onClosed, tabId, true);
    let subId = null;
    try {
      const sub = await bidiSession.subscribe(bd, [
        'browsingContext.userPromptOpened',
        'browsingContext.userPromptClosed',
      ], [tabId]);
      subId = sub.subscription;
      await this.trigger_prompt_target(triggerLocator, trigger);
      await Promise.race([
        done,
        sleep(Math.max(1, timeout) * 1000).then(() => false),
      ]);
      await sleep(200);
    } finally {
      if (subId) {
        try {
          await bidiSession.unsubscribe(bd, { subscription: subId });
        } catch (_) { /* ignore */ }
      }
      try {
        bd.remove_callback('browsingContext.userPromptOpened', tabId, true);
        bd.remove_callback('browsingContext.userPromptClosed', tabId, true);
      } catch (_) { /* ignore */ }
    }
    return this;
  }

  async set_viewport(width, height, devicePixelRatio = null) {
    await bidiContext.set_viewport(this._driver._browser_driver, this._context_id, {
      width,
      height,
      device_pixel_ratio: devicePixelRatio,
    });
    return this;
  }

  async set_useragent(ua) {
    const bd = this._driver._browser_driver;
    if (this._ua_preload_script_id) {
      try {
        await bidiScript.remove_preload_script(bd, this._ua_preload_script_id);
      } catch (_) { /* ignore */ }
      this._ua_preload_script_id = null;
    }
    const escapedUa = String(ua).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const injectJs = `() => { Object.defineProperty(navigator, 'userAgent', {get: () => '${escapedUa}'}); }`;
    const r = await bidiScript.add_preload_script(bd, injectJs, { contexts: [this._context_id] });
    this._ua_preload_script_id = r.script || '';
    try {
      await bidiScript.callFunction(bd, this._context_id, injectJs, { arguments: [] });
    } catch (_) { /* preload 仍然生效 */ }
    return this;
  }

  async set_bypass_csp(bypass = true) {
    if (bypass) {
      const injectJs = `() => {
        const observer = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
              if (node.tagName === 'META' && node.httpEquiv
                && node.httpEquiv.toLowerCase() === 'content-security-policy') {
                node.remove();
              }
            }
          }
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
        document.querySelectorAll('meta[http-equiv="Content-Security-Policy"]')
          .forEach((el) => el.remove());
      }`;
      await this.add_preload_script(injectJs);
    }
    return this;
  }

  async add_preload_script(script) {
    const decl = String(script).trim().startsWith('function')
      ? script
      : `() => { ${script} }`;
    const r = await bidiScript.add_preload_script(this._driver._browser_driver, decl, {
      contexts: [this._context_id],
    });
    return r.script || '';
  }

  async remove_preload_script(scriptId) {
    await bidiScript.remove_preload_script(this._driver._browser_driver, scriptId);
  }

  async get_realms(type_ = null) {
    const r = await bidiScript.get_realms(this._driver._browser_driver, {
      context: this._context_id,
      type: type_,
    });
    return (r.realms || []).map((x) => ({ ...x }));
  }

  async disown_handles(handles) {
    const list = Array.isArray(handles) ? handles : [handles];
    await bidiScript.disown(this._driver._browser_driver, list, { context: this._context_id });
    return this;
  }

  async eval_handle(expression, awaitPromise = true) {
    const raw = await bidiScript.evaluate(this._driver._browser_driver, this._context_id, expression, {
      awaitPromise,
      resultOwnership: 'root',
      serializationOptions: { maxDomDepth: 0, includeShadowTree: 'open' },
    });
    return new ScriptResult(raw);
  }

  async set_cache_behavior(behavior = 'bypass') {
    return this.network.set_cache_behavior(behavior);
  }

  async set_download_path(dirPath) {
    return this.downloads.set_path(dirPath);
  }

  async set_geolocation(latitude, longitude, accuracy = 100) {
    return this.emulation.set_geolocation(latitude, longitude, accuracy);
  }

  async set_timezone(timezoneId) {
    return this.emulation.set_timezone(timezoneId);
  }

  async set_locale(locales) {
    return this.emulation.set_locale(locales);
  }

  async set_screen_orientation(orientationType, angle = 0) {
    return this.emulation.set_screen_orientation(orientationType, angle);
  }

  async set_permission(descriptor, state, origin = 'https://example.com') {
    await bidiPermissions.set_permission(
      this._driver._browser_driver,
      descriptor,
      state,
      origin,
      [this._context_id]
    );
    return this;
  }

  /**
   * Python: ``is_trusted(event_key)`` — 读取测试页写入的 ``window.last*Trusted``。
   * @param {string} eventKey 简写（如 ``click``）或完整变量名（如 ``lastClickTrusted``）
   * @returns {Promise<boolean|null>}
   */
  async is_trusted(eventKey) {
    const mapping = {
      click: 'lastClickTrusted',
      dblclick: 'lastDblClickTrusted',
      contextmenu: 'lastContextMenuTrusted',
      keydown: 'lastKeydownTrusted',
      mouseenter: 'lastMouseEnterTrusted',
      mousedown: 'lastMouseDownTrusted',
    };
    const raw = String(eventKey || '');
    const key = mapping[raw.toLowerCase()] || raw;
    const v = await this.run_js('(k) => window[k]', [key], { as_expr: false });
    return v === undefined ? null : v;
  }

  /**
   * Python: ``handle_cloudflare_challenge(timeout=30, check_interval=2)``
   * 流程与日志级别与 Python ``firefox_base`` 中实现一致（``logger.info/debug/warning/error`` → ``console``）。
   */
  async handle_cloudflare_challenge(timeout = 30, checkInterval = 2) {
    const bd = this._driver._browser_driver;
    const start = Date.now();
    let attempt = 0;
    while (Date.now() - start < timeout * 1000) {
      attempt += 1;
      // Python: logger.info(f"CF 验证第 {attempt} 次尝试...")
      console.info(`CF 验证第 ${attempt} 次尝试...`);
      try {
        const tree = await bd.run('browsingContext.getTree', {});
        const allContexts = tree.contexts || [];

        const findCfContext = (ctxs) => {
          for (const c of ctxs) {
            const url = c.url || '';
            if (url.includes('challenges.cloudflare.com') || url.includes('turnstile') || url.includes('cf-chl')) {
              return c;
            }
            const found = findCfContext(c.children || []);
            if (found) return found;
          }
          return null;
        };

        const cfCtx = findCfContext(allContexts);
        if (!cfCtx) {
          // Python: logger.debug("未找到 CF iframe，继续等待...")
          console.debug('未找到 CF iframe，继续等待...');
          await sleep(checkInterval * 1000);
          continue;
        }
        const cfCtxId = cfCtx.context;
        const cfIdShort = String(cfCtxId || '').slice(0, 20);
        // Python: logger.info(f"找到 CF iframe: {cf_ctx_id[:20]}")
        console.info(`找到 CF iframe: ${cfIdShort}`);

        const sizeRaw = await bidiScript.evaluate(bd, cfCtxId, `(() => {
          const rect = document.documentElement.getBoundingClientRect();
          return { w: Math.round(rect.width), h: Math.round(rect.height) };
        })()`, { awaitPromise: false });
        const size = parseValue(sizeRaw.result || {}) || {};
        if (!size.w || !size.h) {
          // Python: logger.warning("无法获取 iframe 尺寸")
          console.warn('无法获取 iframe 尺寸');
          await sleep(checkInterval * 1000);
          continue;
        }
        // Python: logger.info(f"iframe 尺寸: {size['w']}×{size['h']}")
        console.info(`iframe 尺寸: ${size.w}×${size.h}`);

        const checkboxRaw = await bidiScript.evaluate(bd, cfCtxId, `(() => {
          const checkbox = document.querySelector('input[type="checkbox"]')
            || document.querySelector('[role="checkbox"]')
            || document.querySelector('label');
          if (checkbox) {
            const rect = checkbox.getBoundingClientRect();
            return { found: true, x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
          }
          return { found: false };
        })()`, { awaitPromise: false });
        const checkboxData = parseValue(checkboxRaw.result || {}) || {};

        let clickX;
        let clickY;
        if (checkboxData.found) {
          clickX = Math.trunc(checkboxData.x);
          clickY = Math.trunc(checkboxData.y);
          // Python: logger.info(f"在 iframe 内部点击 checkbox: ({click_x}, {click_y})")
          console.info(`在 iframe 内部点击 checkbox: (${clickX}, ${clickY})`);
        } else {
          clickX = 35;
          clickY = Math.floor(size.h / 2);
          // Python: logger.info(f"在 iframe 内部点击左侧: ({click_x}, {click_y})")
          console.info(`在 iframe 内部点击左侧: (${clickX}, ${clickY})`);
        }

        const pause = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
        await bd.run('input.performActions', {
          context: cfCtxId,
          actions: [
            {
              type: 'pointer',
              id: 'mouse_cf',
              parameters: { pointerType: 'mouse' },
              actions: [
                { type: 'pointerMove', x: clickX, y: clickY, duration: 0 },
                { type: 'pause', duration: pause(50, 150) },
                { type: 'pointerDown', button: 0 },
                { type: 'pause', duration: pause(80, 160) },
                { type: 'pointerUp', button: 0 },
              ],
            },
          ],
        });

        await sleep(3000);
        const bodyText = (await this.run_js('document.body.innerText')) || '';
        if (bodyText.length > 200 && !bodyText.toLowerCase().slice(0, 500).includes('verify')) {
          // Python: logger.info("成功通过 CF 验证")
          console.info('成功通过 CF 验证');
          return true;
        }
      } catch (e) {
        // Python: logger.warning(f"CF 验证失败: {e}")
        console.warn('CF 验证失败:', e);
        await sleep(checkInterval * 1000);
      }
    }
    // Python: logger.error(f"CF 验证超时（{timeout}秒）")
    console.error(`CF 验证超时（${timeout}秒）`);
    return false;
  }

  /**
   * Python: run_js(script, *args, as_expr=None, timeout=None, sandbox=None)
   * JS 若需 kwargs，请把最后一项设为仅含 as_expr / timeout / sandbox 的纯对象。
   */
  async run_js(script, ...args) {
    const { args: posArgs, kwargs } = _peel_run_js_kwargs(args);
    return this._run_js(script, posArgs, kwargs);
  }

  async run_js_loaded(script, ...args) {
    await this.wait.doc_loaded();
    return this.run_js(script, ...args);
  }

  async _run_js(script, args, kwargs) {
    const as_expr = kwargs.as_expr != null ? kwargs.as_expr : null;
    const timeout = kwargs.timeout != null ? kwargs.timeout : null;
    const sandbox = kwargs.sandbox != null ? kwargs.sandbox : null;

    let s = String(script).trim();

    let useExpr;
    if (as_expr != null) useExpr = as_expr;
    else if (args.length) useExpr = false;
    else if (s.startsWith('return ')) useExpr = false;
    else useExpr = true;

    const prev = timeout != null ? Settings.bidi_timeout : null;
    if (timeout != null) Settings.bidi_timeout = timeout;

    const bd = this._driver._browser_driver;
    const ctx = this._context_id;

    try {
      let raw;
      if (useExpr) {
        raw = await bidiScript.evaluate(bd, ctx, s, { sandbox });
      } else {
        let funcBody = s;
        if (s.startsWith('return ')) funcBody = `function(){${s}}`;
        else if (!s.startsWith('function') && !s.startsWith('(')) funcBody = `function(){${s}}`;

        const serializedArgs = args.length ? args.map((a) => serializeValue(a)) : null;

        raw = await bidiScript.callFunction(bd, ctx, funcBody, {
          arguments: serializedArgs,
          sandbox,
          serializationOptions: { maxDomDepth: 0, includeShadowTree: 'open' },
        });
      }

      if (raw.type === 'exception') {
        const details = raw.exceptionDetails || {};
        throw new JavaScriptError(details.text || 'script error', details);
      }
      return parseValue(raw.result || {});
    } finally {
      if (prev != null) Settings.bidi_timeout = prev;
    }
  }

  /**
   * Python: ``_get_document_node_id`` — 当前文档 ``sharedReference``，可作 ``startNode``。
   * @returns {Promise<{type:string,sharedId:string}|null>}
   */
  async _getDocumentNodeId() {
    try {
      const raw = await bidiScript.callFunction(
        this._driver._browser_driver,
        this._context_id,
        '() => document',
        {
          serializationOptions: { maxDomDepth: 0, includeShadowTree: 'open' },
        },
      );
      if (!raw || raw.type === 'exception') return null;
      const rv = raw.result || {};
      const sid = rv.sharedId;
      if (sid) return makeSharedRef(sid);
      return null;
    } catch (_) {
      return null;
    }
  }

  async ele(locator, index = 1, timeout = null) {
    return this._findElement(locator, index, timeout, null);
  }

  async eles(locator, timeout = null) {
    return this._findElements(locator, timeout, null);
  }

  async _findElement(locator, index = 1, timeout = null, startNode = null) {
    let t = timeout != null ? timeout : Settings.element_find_timeout;
    const raiseErr = Settings.raise_when_ele_not_found;
    const end = Date.now() + t * 1000;

    while (true) {
      const elements = await this._doFind(locator, startNode);
      if (elements.length) {
        let idx;
        if (index > 0) idx = index - 1;
        else if (index < 0) idx = index;
        else idx = 0;
        if (idx >= 0 && idx < elements.length) return elements[idx];
        if (index < 0 && elements.length + index >= 0) return elements[elements.length + index];
      }
      if (Date.now() >= end) break;
      await sleep(300);
    }

    if (raiseErr) throw new ElementNotFoundError(`未找到元素: ${locator}`);
    return new NoneElement(this, 'ele', { locator });
  }

  async _findElements(locator, timeout = null, startNode = null) {
    let t = timeout != null ? timeout : Settings.element_find_timeout;
    const end = Date.now() + t * 1000;

    while (true) {
      const elements = await this._doFind(locator, startNode);
      if (elements.length) return elements;
      if (Date.now() >= end) break;
      await sleep(300);
    }
    return [];
  }

  async _doFind(locator, startNode = null) {
    const bidiLocator = { ...parseLocator(locator) };
    delete bidiLocator.matchType;

    const params = {
      context: this._context_id,
      locator: bidiLocator,
      serializationOptions: { maxDomDepth: 0, includeShadowTree: 'open' },
    };

    if (startNode && startNode._shared_id) {
      params.startNodes = [makeSharedRef(startNode._shared_id)];
    }

    let nodes = [];
    try {
      const result = await this._driver._browser_driver.run('browsingContext.locateNodes', params);
      nodes = result.nodes || [];
    } catch (e) {
      if (e instanceof BiDiError) {
        const errStr = String(e.error || '').toLowerCase();
        if (errStr.includes('invalid') || errStr.includes('unsupported')) {
          if (bidiLocator.type === 'innerText') {
            return this._findByTextJs(bidiLocator.value || '', startNode);
          }
          return this._findByJs(locator, startNode);
        }
      }
      return [];
    }

    if (!nodes.length && bidiLocator.type === 'innerText') {
      return this._findByTextJs(bidiLocator.value || '', startNode);
    }

    const elements = [];
    for (const node of nodes) {
      const ele = FirefoxElement._fromNode(this, node);
      if (ele) elements.push(ele);
    }
    return elements;
  }

  async _findByTextJs(text, startNode = null) {
    const js = `(text, rootNode) => {
      const root = rootNode || document.body || document.documentElement;
      const results = [];
      const skip = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'LINK', 'META']);
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
      let node;
      while (node = walker.nextNode()) {
        if (skip.has(node.tagName)) continue;
        const nt = (node.textContent || '').trim();
        if (!nt.includes(text)) continue;
        let hasChildMatch = false;
        for (const ch of node.children) {
          if (skip.has(ch.tagName)) continue;
          if ((ch.textContent || '').trim().includes(text)) { hasChildMatch = true; break; }
        }
        if (!hasChildMatch) results.push(node);
      }
      return results;
    }`;

    const args = [{ type: 'string', value: text }];
    if (startNode && startNode._shared_id) {
      args.push(makeSharedRef(startNode._shared_id));
    }

    const raw = await bidiScript.callFunction(
      this._driver._browser_driver,
      this._context_id,
      js,
      {
        arguments: args,
        serializationOptions: { maxDomDepth: 0, includeShadowTree: 'open' },
      }
    );

    if (raw.type === 'exception') return [];
    const rv = raw.result || {};
    if (rv.type !== 'array') return [];
    const out = [];
    for (const node of rv.value || []) {
      const ele = FirefoxElement._fromNode(this, node);
      if (ele) out.push(ele);
    }
    return out;
  }

  /**
   * Python: ``page.pdf(path=None, **kwargs)``
   * @param {string|null} [path=null]
   * @param {object} [printOpts={}] — 透传 ``browsingContext.print``（如 margin、orientation）
   */
  async pdf(path = null, printOpts = {}) {
    const fs = require('fs');
    const result = await bidiContext.print_(this._driver._browser_driver, this._context_id, printOpts);
    const dataB64 = result.data || '';
    const buf = Buffer.from(dataB64, 'base64');
    if (path) {
      fs.writeFileSync(path, buf);
      return path;
    }
    return buf;
  }

  /** Python: ``page.save_pdf(path, **kwargs)`` */
  async save_pdf(path, printOpts = {}) {
    return this.pdf(path, printOpts);
  }

  /**
   * Python: ``page.get_frame(locator=None, index=None, context_id=None)``
   */
  async get_frame(locator = null, index = null, context_id = null) {
    const { FirefoxFrame } = require('./firefox_frame');
    if (context_id) {
      return new FirefoxFrame(this._browser, context_id, this);
    }
    const result = await bidiContext.getTree(this._driver._browser_driver, {
      root: this._context_id,
    });
    const contexts = result.contexts || [];
    const children = contexts.length ? (contexts[0].children || []) : [];

    if (index != null) {
      if (index >= 0 && index < children.length) {
        const childCtx = children[index].context;
        return new FirefoxFrame(this._browser, childCtx, this);
      }
      return null;
    }

    if (locator) {
      const ele = await this.ele(locator);
      if (!ele || ele.isNoneElement) return null;
      const eleSrc = (await ele.attr('src')) || '';
      for (const child of children) {
        const childUrl = child.url || '';
        if (eleSrc && childUrl.includes(eleSrc)) {
          return new FirefoxFrame(this._browser, child.context, this);
        }
      }
      if (children.length === 1) {
        return new FirefoxFrame(this._browser, children[0].context, this);
      }
    }

    if (children.length) {
      return new FirefoxFrame(this._browser, children[0].context, this);
    }
    return null;
  }

  /**
   * Python: ``page.get_frames()``
   */
  async get_frames() {
    const { FirefoxFrame } = require('./firefox_frame');
    const result = await bidiContext.getTree(this._driver._browser_driver, {
      root: this._context_id,
    });
    const contexts = result.contexts || [];
    const children = contexts.length ? (contexts[0].children || []) : [];
    return children.map((c) => new FirefoxFrame(this._browser, c.context, this));
  }

  /**
   * Python: ``with page.with_frame(...)`` — JS 使用 ``for await (const f of page.with_frame(...))``。
   */
  async *with_frame(locator = null, index = null, context_id = null) {
    const frame = await this.get_frame(locator, index, context_id);
    if (!frame) throw new Error('未找到目标 iframe/frame');
    yield frame;
  }

  /** Python: ``page.s_ele(locator=None)`` */
  async s_ele(locator = null) {
    const html = await this.html;
    return makeStaticEle(html, locator);
  }

  /** Python: ``page.s_eles(locator)`` */
  async s_eles(locator) {
    const html = await this.html;
    return makeStaticEles(html, locator);
  }

  async _findByJs(locator, startNode = null) {
    const bidiLocator = parseLocator(locator);
    const locType = bidiLocator.type || '';
    const locValue = bidiLocator.value || '';
    let js;
    let args;
    if (locType === 'css') {
      js = '(sel) => Array.from(document.querySelectorAll(sel))';
      args = [{ type: 'string', value: locValue }];
    } else if (locType === 'xpath') {
      js = `(expr) => {
        const result = [];
        const xr = document.evaluate(expr, document, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
        let node;
        while (node = xr.iterateNext()) result.push(node);
        return result;
      }`;
      args = [{ type: 'string', value: locValue }];
    } else {
      return [];
    }

    const raw = await bidiScript.callFunction(
      this._driver._browser_driver,
      this._context_id,
      js,
      {
        arguments: args,
        serializationOptions: { maxDomDepth: 0, includeShadowTree: 'open' },
      }
    );
    if (raw.type === 'exception') return [];
    const rv = raw.result || {};
    if (rv.type !== 'array') return [];
    const out = [];
    for (const node of rv.value || []) {
      const ele = FirefoxElement._fromNode(this, node);
      if (ele) out.push(ele);
    }
    return out;
  }
}

/**
 * 与 Python ``page(locator, index=1, timeout=None)``（``__call__``）用法接近的可选包装。
 *
 * - ``await p('#id')`` 等价 ``await page.invoke('#id')``。
 * - ``p.get`` / ``p.browser`` / ``p.ele`` 等透传到原 ``page``（方法已 ``bind``）。
 *
 * @param {{ invoke: Function } & Record<string, unknown>} page ``FirefoxBase`` / ``FirefoxTab`` / ``FirefoxFrame`` 实例
 * @returns {Function & Record<string, unknown>}
 */
function wrapPageInvoke(page) {
  if (!page || typeof page.invoke !== 'function') {
    throw new TypeError('wrapPageInvoke: page must have invoke()');
  }
  return wrapCallableInvoke(page, 'invoke');
}

module.exports = { FirefoxBase, wrapPageInvoke };
