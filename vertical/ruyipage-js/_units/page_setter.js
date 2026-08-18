'use strict';

class PageSetter {
  constructor(owner) {
    this._owner = owner;
  }

  async title(text) {
    const t = String(text);
    await this._owner.run_js('(t) => { document.title = t; }', t);
    return this._owner;
  }

  toString() {
    return '<PageSetter>';
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toString();
  }
}

module.exports = { PageSetter };
