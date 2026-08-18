'use strict';

const fs = require('fs');
const path = require('path');
const { FirefoxBase } = require('./firefox_base');
const bidiContext = require('../_bidi/browsing_context');

class FirefoxTab extends FirefoxBase {
  constructor() {
    super();
    this._type = 'FirefoxTab';
  }

  _init_from_browser(browser, contextId) {
    this._initContext(browser, contextId);
    return this;
  }

  async activate() {
    await bidiContext.activate(this._driver._browser_driver, this._context_id);
    return this;
  }

  async close(others = false) {
    if (others) {
      await this._browser.close_tabs(this._context_id, true);
    } else {
      try {
        await bidiContext.close(this._driver._browser_driver, this._context_id);
      } catch (_) { /* ignore */ }
    }
  }

  /**
   * Python: ``FirefoxTab.save(path=None, name=None, as_pdf=False)``
   */

  /**
   * 与 Python ``__repr__`` 同语义：含当前 URL 片段。JS 中 ``url`` 为异步，故提供 ``await describe()``；
   * 同步日志请用 ``toString()``（context id）。
   * @returns {Promise<string>}
   */
  async describe() {
    try {
      const u = await this.url;
      return `<FirefoxTab ${String(u || '').slice(0, 60)}>`;
    } catch (_) {
      return '<FirefoxTab ?>';
    }
  }

  toString() {
    const id = this._context_id ? String(this._context_id).slice(0, 36) : '?';
    return `<FirefoxTab ${id}>`;
  }

  async save(dirPath = null, name = null, asPdf = false) {
    let dir = dirPath || '.';
    let baseName = name;
    if (!baseName) {
      const title = await this.title;
      baseName = String(title || 'page').replace(/[/\\:*?"<>|]/g, '').slice(0, 50);
    }
    const ext = asPdf ? '.pdf' : '.html';
    const filePath = path.join(dir, `${baseName}${ext}`);
    if (asPdf) {
      await this.pdf(filePath);
    } else {
      const html = await this.html;
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, html, 'utf8');
    }
    return filePath;
  }
}

module.exports = { FirefoxTab };
