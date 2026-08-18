'use strict';

const { FirefoxBase } = require('./firefox_base');
const { ContextDriver } = require('../_base/driver');
const { Firefox } = require('../_base/browser');
const { FirefoxOptions } = require('../_configs/firefox_options');
const { Settings } = require('../_functions/settings');
const bidiContext = require('../_bidi/browsing_context');

function normalizePageOptions(addrOrOpts) {
  if (addrOrOpts instanceof FirefoxOptions) return addrOrOpts;
  if (typeof addrOrOpts === 'string') {
    const o = new FirefoxOptions();
    o.set_address(addrOrOpts);
    return o;
  }
  if (addrOrOpts == null) return new FirefoxOptions();
  return new FirefoxOptions().set_address(String(addrOrOpts));
}

class FirefoxPage extends FirefoxBase {
  static _PAGES = new Map();

  /**
   * Python: ``FirefoxPage(opts)`` — 在 JS 中请 ``await FirefoxPage.create(opts)``（别名 ``FirefoxPage.from``）。
   */
  static async create(addrOrOpts = null) {
    const opts = normalizePageOptions(addrOrOpts);
    const page = new FirefoxPage();
    await page._bootstrap(opts);
    FirefoxPage._PAGES.set(page._firefox.address, page);
    return page;
  }

  /**
   * 基于 ``probeBidiAddress(..., keepDriver=true)`` 结果构造页面（对应 Python ``_page_from_live_probe_info``）。
   */
  static async fromLiveProbeInfo(info, tabIndex = 1, latestTab = false) {
    const browser = await Firefox.fromProbeInfo(info);
    const page = new FirefoxPage();
    page._page_initialized = true;
    page._firefox = browser;

    const to = browser.options.timeouts;
    Settings.bidi_timeout = to.base;
    Settings.page_load_timeout = to.page_load;
    Settings.script_timeout = to.script;

    await browser._refresh_tabs();
    const tabIds = await browser.tab_ids;
    let ctxId = null;
    if (tabIds.length) {
      if (latestTab) {
        [ctxId] = tabIds.slice(-1);
      } else if (typeof tabIndex === 'number' && tabIndex < 0 && tabIds.length + tabIndex >= 0) {
        ctxId = tabIds[tabIds.length + tabIndex];
      } else {
        const idx = typeof tabIndex === 'number' && tabIndex > 0 ? tabIndex - 1 : 0;
        ctxId = idx >= 0 && idx < tabIds.length ? tabIds[idx] : tabIds[0];
      }
    }
    if (!ctxId) {
      const r = await bidiContext.create(browser.driver, { type: 'tab' });
      ctxId = r.context;
    }
    page._initContext(browser, ctxId);
    FirefoxPage._PAGES.set(browser.address, page);
    return page;
  }

  constructor() {
    super();
    this._type = 'FirefoxPage';
    this._firefox = null;
    this._page_initialized = false;
  }

  async _bootstrap(opts) {
    this._firefox = await Firefox.create(opts);
    this._page_initialized = true;

    Settings.bidi_timeout = opts.timeouts.base;
    Settings.page_load_timeout = opts.timeouts.page_load;
    Settings.script_timeout = opts.timeouts.script;

    await this._firefox._refresh_tabs();
    const tabIds = await this._firefox.tab_ids;
    let ctxId;
    if (tabIds.length) {
      [ctxId] = tabIds;
    } else {
      const r = await bidiContext.create(this._firefox.driver, { type: 'tab' });
      ctxId = r.context;
    }
    this._initContext(this._firefox, ctxId);
  }

  get browser() {
    return this._firefox;
  }

  /** Python: page.tabs_count */
  get tabs_count() {
    return this._firefox.tabs_count;
  }

  /** Python: page.tab_ids */
  get tab_ids() {
    return this._firefox.tab_ids;
  }

  /** Python: page.latest_tab */
  get latest_tab() {
    return this._firefox.latest_tab;
  }

  /** Python: page.new_tab(url=None, background=False) */
  async new_tab(url = null, background = false) {
    return this._firefox.new_tab(url, background);
  }

  /** Python: page.get_tab(...) */
  async get_tab(id_or_num = null, title = null, url = null) {
    return this._firefox.get_tab(id_or_num, title, url);
  }

  /** Python: page.get_tabs(...) */
  async get_tabs(title = null, url = null) {
    return this._firefox.get_tabs(title, url);
  }

  /** Python: page.close() */
  async close() {
    try {
      await bidiContext.close(this._driver._browser_driver, this._context_id);
    } catch (_) { /* ignore */ }
    await this._firefox._refresh_tabs();
    const tabIds = await this._firefox.tab_ids;
    if (tabIds.length) {
      this._context_id = tabIds[tabIds.length - 1];
      this._driver = new ContextDriver(this._firefox.driver, this._context_id);
    }
  }

  /** Python: page.close_other_tabs(tab_or_ids=None) */
  async close_other_tabs(tab_or_ids = null) {
    let keep = tab_or_ids == null ? this._context_id : tab_or_ids;
    if (keep && typeof keep === 'object') keep = keep._context_id || keep.tab_id;
    await this._firefox.close_tabs(keep, true);
  }

  /** Python: page.quit(timeout=5, force=False) */
  async quit(timeout = 5, force = false) {
    if (!this._firefox) return;
    const addr = this._firefox.address;
    await this._firefox.quit(timeout, force);
    FirefoxPage._PAGES.delete(addr);
    this._page_initialized = false;
    this._firefox = null;
  }

  /** Python: ``page.save(path=None, name=None, as_pdf=False)`` */
  async save(dirPath = '.', name = null, asPdf = false) {
    const fs = require('fs');
    const pathMod = require('path');
    let n = name;
    if (n == null) {
      const title = await this.title;
      n = [...String(title)].filter((c) => !'\\/:*?"<>|'.includes(c)).join('').slice(0, 50) || 'page';
    }
    const base = pathMod.join(dirPath, n);
    if (asPdf) {
      const fp = `${base}.pdf`;
      await this.pdf(fp);
      return fp;
    }
    const fp = `${base}.html`;
    const htmlText = await this.html;
    fs.mkdirSync(dirPath, { recursive: true });
    fs.writeFileSync(fp, htmlText, 'utf8');
    return fp;
  }
}

/** 与 ``create`` 相同，对应 Python 构造调用习惯 */
FirefoxPage.from = FirefoxPage.create;

module.exports = { FirefoxPage, normalizePageOptions };
