'use strict';

const { FirefoxBase } = require('./firefox_base');

class FirefoxFrame extends FirefoxBase {
  constructor(browser, contextId, parentPage) {
    super();
    this._type = 'FirefoxFrame';
    this._parent = parentPage;
    this._initContext(browser, contextId);
  }

  get parent() {
    return this._parent;
  }

  /** Python: ``frame.is_cross_origin`` — JS 请 ``await frame.is_cross_origin`` */
  get is_cross_origin() {
    return (async () => {
      try {
        const po = await this._parent.run_js('location.origin');
        const mo = await this.run_js('location.origin');
        return po !== mo;
      } catch (_) {
        return true;
      }
    })();
  }

  /**
   * 与 Python ``__repr__`` 同语义：含当前 URL 片段（须 ``await``，理由同 ``FirefoxTab.describe``）。
   * @returns {Promise<string>}
   */
  async describe() {
    try {
      const u = await this.url;
      return `<FirefoxFrame ${String(u || '').slice(0, 60)}>`;
    } catch (_) {
      return '<FirefoxFrame ?>';
    }
  }

  toString() {
    const id = this._context_id ? String(this._context_id).slice(0, 36) : '?';
    return `<FirefoxFrame ${id}>`;
  }
}

module.exports = { FirefoxFrame };
