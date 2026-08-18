'use strict';

/**
 * Python: ``cookies_setter.CookiesSetter`` — 薄封装 ``set_cookies`` / ``delete_cookies``。
 */
class CookiesSetter {
  constructor(owner) {
    this._owner = owner;
  }

  /** Python: ``set(cookies)`` */
  async set(cookies) {
    await this._owner.set_cookies(cookies);
    return this._owner;
  }

  /** Python: ``remove(name, domain=None)`` */
  async remove(name, domain = null) {
    await this._owner.delete_cookies(name, domain);
    return this._owner;
  }

  /** Python: ``clear()`` */
  async clear() {
    await this._owner.delete_cookies();
    return this._owner;
  }

  toString() {
    return '<CookiesSetter>';
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toString();
  }
}

module.exports = { CookiesSetter };
