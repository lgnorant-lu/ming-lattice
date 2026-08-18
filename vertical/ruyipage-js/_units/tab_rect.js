'use strict';

class TabRect {
  constructor(owner) {
    this._owner = owner;
  }

  async viewport_size() {
    return this._owner.run_js('[window.innerWidth, window.innerHeight]');
  }

  async document_size() {
    return this._owner.run_js(
      '[document.documentElement.scrollWidth, document.documentElement.scrollHeight]'
    );
  }

  async window_size() {
    return this.viewport_size();
  }

  toString() {
    return '<TabRect>';
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toString();
  }
}

module.exports = { TabRect };
