'use strict';

/**
 * 基础类
 */

class BasePage {
  constructor() {
    this._type = 'BasePage';
  }

  toString() {
    return `<${this._type}>`;
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toString();
  }
}

class BaseElement {
  constructor() {
    this._type = 'BaseElement';
  }

  toString() {
    return `<${this._type}>`;
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toString();
  }
}

module.exports = { BasePage, BaseElement };
