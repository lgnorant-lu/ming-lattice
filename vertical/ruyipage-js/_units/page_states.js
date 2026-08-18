'use strict';

class PageStates {
  constructor(owner) {
    this._owner = owner;
  }

  get has_alert() {
    return Promise.resolve(!!this._owner._driver._browser_driver.alert_flag);
  }

  toString() {
    return '<PageStates>';
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toString();
  }
}

module.exports = { PageStates };
