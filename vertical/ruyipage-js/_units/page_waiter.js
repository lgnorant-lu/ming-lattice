'use strict';

const { Settings } = require('../_functions/settings');
const { WaitTimeoutError } = require('../errors');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class PageWaiter {
  constructor(owner) {
    this._owner = owner;
  }

  async _wait_condition(condition_fn, timeout, msg = '') {
    let t = timeout;
    if (t == null) t = Settings.element_find_timeout;
    const end = Date.now() + t * 1000;
    while (true) {
      try {
        const result = await condition_fn();
        if (result != null && result !== false) return result;
      } catch (_) { /* ignore */ }
      if (Date.now() >= end) {
        if (Settings.raise_when_wait_failed) throw new WaitTimeoutError(msg);
        return false;
      }
      await sleep(300);
    }
  }

  async _check_displayed(locator) {
    const ele = await this._owner.ele(locator, 1, 0.1);
    if (ele && !ele.isNoneElement && await ele.is_displayed) return ele;
    return null;
  }

  async _check_hidden(locator) {
    const ele = await this._owner.ele(locator, 1, 0.1);
    if (!ele || ele.isNoneElement || !await ele.is_displayed) return true;
    return null;
  }

  /** Python: page.wait(seconds) */
  async call(seconds) {
    await sleep(seconds * 1000);
    return this._owner;
  }

  async ele_displayed(locator, timeout = null) {
    return this._wait_condition(
      () => this._check_displayed(locator),
      timeout,
      `等待元素可见: ${locator}`
    );
  }

  async ele_hidden(locator, timeout = null) {
    return this._wait_condition(
      () => this._check_hidden(locator),
      timeout,
      `等待元素隐藏: ${locator}`
    );
  }

  async ele_deleted(locator, timeout = null) {
    return this._wait_condition(
      async () => {
        const list = await this._owner.eles(locator, 0.1);
        return list.length === 0 ? true : null;
      },
      timeout,
      `等待元素删除: ${locator}`
    );
  }

  async ele(locator, timeout = null) {
    return this._wait_condition(
      async () => {
        const e = await this._owner.ele(locator, 1, 0.1);
        return (e && !e.isNoneElement) ? e : null;
      },
      timeout,
      `等待元素出现: ${locator}`
    );
  }

  async title_is(title, timeout = null) {
    return this._wait_condition(
      async () => {
        const t = await this._owner.title;
        return t === title ? true : null;
      },
      timeout,
      `等待标题为: ${title}`
    );
  }

  async title_contains(text, timeout = null) {
    return this._wait_condition(
      async () => {
        const t = await this._owner.title;
        return (t && t.includes(text)) ? true : null;
      },
      timeout,
      `等待标题包含: ${text}`
    );
  }

  async url_contains(text, timeout = null) {
    return this._wait_condition(
      async () => {
        const u = await this._owner.url;
        return (u && u.includes(text)) ? true : null;
      },
      timeout,
      `等待URL包含: ${text}`
    );
  }

  async url_change(current_url = null, timeout = null) {
    const cur = current_url != null ? current_url : await this._owner.url;
    return this._wait_condition(
      async () => {
        const u = await this._owner.url;
        return u !== cur ? true : null;
      },
      timeout,
      '等待URL变化'
    );
  }

  async doc_loaded(timeout = null) {
    return this._wait_condition(
      async () => {
        const s = await this._owner.ready_state;
        return s === 'complete' ? true : null;
      },
      timeout,
      '等待页面加载'
    );
  }

  async load_start(timeout = null) {
    return this._wait_condition(
      async () => {
        const s = await this._owner.ready_state;
        return s === 'loading' ? true : null;
      },
      timeout,
      '等待加载开始'
    );
  }

  async js_result(script, timeout = null) {
    return this._wait_condition(
      async () => {
        const v = await this._owner.run_js(script);
        return v || null;
      },
      timeout,
      `等待JS结果: ${String(script).slice(0, 30)}...`
    );
  }

  toString() {
    return '<PageWaiter>';
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toString();
  }
}

class ElementWaiter {
  constructor(owner, element) {
    this._owner = owner;
    this._element = element;
  }

  async _wait_condition(condition_fn, timeout, msg = '') {
    let t = timeout;
    if (t == null) t = Settings.element_find_timeout;
    const end = Date.now() + t * 1000;
    while (true) {
      try {
        const result = await condition_fn();
        if (result != null && result !== false) return result;
      } catch (_) { /* ignore */ }
      if (Date.now() >= end) {
        if (Settings.raise_when_wait_failed) throw new WaitTimeoutError(msg);
        return false;
      }
      await sleep(300);
    }
  }

  async displayed(timeout = null) {
    return this._wait_condition(
      async () => {
        const ok = await this._element.is_displayed;
        return ok ? this._element : null;
      },
      timeout,
      '等待元素可见'
    );
  }

  async hidden(timeout = null) {
    return this._wait_condition(
      async () => {
        const ok = await this._element.is_displayed;
        return ok ? null : true;
      },
      timeout,
      '等待元素隐藏'
    );
  }

  /**
   * Python: ``ElementWaiter.enabled`` — 超时仅返回 ``False``，不读 ``raise_when_wait_failed``。
   */
  async enabled(timeout = null) {
    let t = timeout;
    if (t == null) t = Settings.element_find_timeout;
    const end = Date.now() + t * 1000;
    while (true) {
      if (await this._element.is_enabled) return this._element;
      if (Date.now() >= end) return false;
      await sleep(300);
    }
  }

  /**
   * Python: ``ElementWaiter.disabled`` — 超时仅返回 ``False``。
   */
  async disabled(timeout = null) {
    let t = timeout;
    if (t == null) t = Settings.element_find_timeout;
    const end = Date.now() + t * 1000;
    while (true) {
      if (!await this._element.is_enabled) return true;
      if (Date.now() >= end) return false;
      await sleep(300);
    }
  }

  toString() {
    return '<ElementWaiter>';
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toString();
  }
}

/**
 * 与 Python ``page.wait`` 一致：可 ``await wait(2)``，也可 ``await wait.doc_loaded()``。
 * @param {import('../_pages/firefox_base').FirefoxBase} owner
 */
function create_page_wait(owner) {
  const waiter = new PageWaiter(owner);
  const fn = (seconds) => waiter.call(seconds);
  fn.ele_displayed = waiter.ele_displayed.bind(waiter);
  fn.ele_hidden = waiter.ele_hidden.bind(waiter);
  fn.ele_deleted = waiter.ele_deleted.bind(waiter);
  fn.ele = waiter.ele.bind(waiter);
  fn.title_is = waiter.title_is.bind(waiter);
  fn.title_contains = waiter.title_contains.bind(waiter);
  fn.url_contains = waiter.url_contains.bind(waiter);
  fn.url_change = waiter.url_change.bind(waiter);
  fn.doc_loaded = waiter.doc_loaded.bind(waiter);
  fn.load_start = waiter.load_start.bind(waiter);
  fn.js_result = waiter.js_result.bind(waiter);
  return fn;
}

function create_element_wait(owner, element) {
  const waiter = new ElementWaiter(owner, element);
  const fn = async (seconds) => {
    await sleep(seconds * 1000);
    return element;
  };
  fn.displayed = waiter.displayed.bind(waiter);
  fn.hidden = waiter.hidden.bind(waiter);
  fn.enabled = waiter.enabled.bind(waiter);
  fn.disabled = waiter.disabled.bind(waiter);
  return fn;
}

module.exports = { PageWaiter, ElementWaiter, create_page_wait, create_element_wait };
