'use strict';

class ElementStates {
  constructor(element) {
    this._element = element;
  }

  get displayed() {
    return this._element.is_displayed;
  }

  get enabled() {
    return this._element.is_enabled;
  }

  toString() {
    return '<ElementStates>';
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toString();
  }
}

module.exports = { ElementStates };
