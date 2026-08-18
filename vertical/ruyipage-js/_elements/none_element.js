'use strict';

const { BaseElement } = require('../_base/base');

/**
 * 未找到元素时的占位对象（与 Python NoneElement 行为对齐）。
 */
class NoneElement extends BaseElement {
  constructor(page = null, method = null, args = null) {
    super();
    this._type = 'NoneElement';
    this._page = page;
    this._method = method;
    this._args = args || {};
    this.isNoneElement = true;
  }

  toString() {
    return '<NoneElement>';
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toString();
  }

  get tag() { return ''; }
  get text() { return (async () => '')(); }
  get html() { return (async () => '')(); }
  get inner_html() { return (async () => '')(); }
  get outer_html() { return (async () => '')(); }
  get is_displayed() { return (async () => false)(); }
  get is_enabled() { return (async () => false)(); }
  get is_checked() { return (async () => false)(); }
  get size() { return (async () => ({ width: 0, height: 0 }))(); }

  async attr() { return ''; }
  async ele() { return this; }
  async eles() { return []; }
  async click_self() { return this; }
  async input() { return this; }
}

module.exports = { NoneElement };
