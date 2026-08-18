'use strict';

const bidiBrowser = require('../_bidi/browser_commands');

class BrowserManager {
  constructor(owner) {
    this._owner = owner;
  }

  async close() {
    await bidiBrowser.close(this._owner._driver._browser_driver);
    return this._owner;
  }

  /**
   * Python: ``create_user_context`` — 返回新建 **user context id**（``str``），非整包 BiDi 结果。
   */
  async create_user_context() {
    const raw = await bidiBrowser.create_user_context(this._owner._driver._browser_driver);
    if (raw && raw.userContext != null && raw.userContext !== '') return String(raw.userContext);
    return null;
  }

  /**
   * Python: ``get_user_contexts`` — 返回 ``userContexts`` 列表（无则 ``[]``）。
   */
  async get_user_contexts() {
    const raw = await bidiBrowser.get_user_contexts(this._owner._driver._browser_driver);
    if (raw && Array.isArray(raw.userContexts)) return raw.userContexts;
    return [];
  }

  /**
   * Python: ``remove_user_context`` — 删除后返回 **页面对象**（``owner``）便于链式调用。
   */
  async remove_user_context(userContext) {
    await bidiBrowser.remove_user_context(this._owner._driver._browser_driver, userContext);
    return this._owner;
  }

  /**
   * Python: ``create_tab`` — 新建 tab 的 **browsing context id**。
   * 经 ``BrowserBiDiDriver.run`` 直发 ``browsingContext.create``，避免 ``ContextDriver`` 为
   * ``browsingContext.*`` 误注入 ``context`` 参数。
   */
  async create_tab(user_context = null, background = false) {
    const bd = this._owner._driver._browser_driver;
    const params = { type: 'tab' };
    if (background) params.background = true;
    if (user_context != null && user_context !== '') params.userContext = user_context;
    const r = await bd.run('browsingContext.create', params);
    return r && r.context != null ? String(r.context) : null;
  }

  /**
   * Python: ``get_client_windows`` — 返回 ``clientWindows`` 列表（无则 ``[]``）。
   */
  async get_client_windows() {
    const raw = await bidiBrowser.get_client_windows(this._owner._driver._browser_driver);
    if (raw && Array.isArray(raw.clientWindows)) return raw.clientWindows;
    return [];
  }

  /**
   * Python: ``set_window_state(client_window, state=None, width=None, height=None, x=None, y=None)``。
   */
  async set_window_state(client_window, state = null, width = null, height = null, x = null, y = null) {
    return bidiBrowser.set_client_window_state(
      this._owner._driver._browser_driver,
      client_window,
      { state, width, height, x, y },
    );
  }

  toString() {
    return '<BrowserManager>';
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toString();
  }
}

module.exports = { BrowserManager };
