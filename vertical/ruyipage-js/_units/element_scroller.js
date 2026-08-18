'use strict';

class ElementScroller {
  constructor(element) {
    this._element = element;
  }

  async into_view() {
    await this._element._runSafe(`(el) => { el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }); }`);
    return this._element;
  }

  async by(dx, dy) {
    const x = Number(dx);
    const y = Number(dy);
    await this._element._runSafe(`(el) => { el.scrollLeft += ${x}; el.scrollTop += ${y}; }`);
    return this._element;
  }

  toString() {
    return '<ElementScroller>';
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toString();
  }
}

module.exports = { ElementScroller };
