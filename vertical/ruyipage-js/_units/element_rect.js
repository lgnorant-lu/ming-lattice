'use strict';

class ElementRect {
  constructor(element) {
    this._element = element;
  }

  /** 与视口相关的矩形；请 ``await rect.raw()``。 */
  async raw() {
    return this._element._runSafe(`(el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height,
        top: r.top, left: r.left, bottom: r.bottom, right: r.right };
    }`);
  }

  toString() {
    return '<ElementRect>';
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toString();
  }
}

module.exports = { ElementRect };
