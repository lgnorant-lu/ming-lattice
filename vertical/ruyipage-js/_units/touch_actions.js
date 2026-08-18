'use strict';

const input = require('../_bidi/input_commands');

class TouchActions {
  constructor(owner) {
    this._owner = owner;
  }

  async perform(actions) {
    await input.perform_actions(
      this._owner._driver._browser_driver,
      this._owner._context_id,
      actions
    );
    return this._owner;
  }

  async release() {
    await input.release_actions(this._owner._driver._browser_driver, this._owner._context_id);
    return this._owner;
  }

  toString() {
    return '<TouchActions>';
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toString();
  }
}

module.exports = { TouchActions };
