'use strict';

class ElementSetter {
  constructor(element) {
    this._element = element;
  }

  async attr(name, value) {
    const n = String(name);
    const v = String(value);
    await this._element._runSafe(
      `(el, name, val) => { el.setAttribute(name, val); }`,
      n,
      v
    );
    return this._element;
  }

  toString() {
    return '<ElementSetter>';
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toString();
  }
}

module.exports = { ElementSetter };
