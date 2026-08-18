'use strict';

/**
 * Python: ``storage.StorageManager`` — ``localStorage`` / ``sessionStorage``。
 */
class StorageManager {
  constructor(owner, kind) {
    this._owner = owner;
    this._kind = kind;
  }

  _ns() {
    return this._kind === 'session' ? 'sessionStorage' : 'localStorage';
  }

  async get(key) {
    const ns = this._ns();
    return this._owner.run_js(`(k) => window.${ns}.getItem(k)`, String(key));
  }

  /** Web Storage / 心智别名，与 ``get`` 相同。 */
  async getItem(key) {
    return this.get(key);
  }

  async set(key, value) {
    const ns = this._ns();
    await this._owner.run_js(`(k, v) => { window.${ns}.setItem(k, v); }`, String(key), String(value));
    return this._owner;
  }

  /** Web Storage 命名别名，与 ``set`` 相同。 */
  async setItem(key, value) {
    return this.set(key, value);
  }

  async remove(key) {
    const ns = this._ns();
    await this._owner.run_js(`(k) => { window.${ns}.removeItem(k); }`, String(key));
    return this._owner;
  }

  /** Web Storage 命名别名，与 ``remove`` 相同。 */
  async removeItem(key) {
    return this.remove(key);
  }

  async clear() {
    const ns = this._ns();
    await this._owner.run_js(`() => { window.${ns}.clear(); }`, { as_expr: false });
    return this._owner;
  }

  /** Python: ``keys()`` */
  async keys() {
    const ns = this._ns();
    const r = await this._owner.run_js(`() => Object.keys(window.${ns})`, { as_expr: false });
    return Array.isArray(r) ? r : [];
  }

  /** Python: ``items()`` */
  async items() {
    const ns = this._ns();
    const r = await this._owner.run_js(
      `() => {
        const s = window.${ns};
        const out = {};
        for (let i = 0; i < s.length; i++) {
          const k = s.key(i);
          out[k] = s.getItem(k);
        }
        return out;
      }`,
      { as_expr: false },
    );
    return r && typeof r === 'object' ? r : {};
  }

  /** Python: ``__len__`` */
  async count() {
    const ns = this._ns();
    const n = await this._owner.run_js(`() => window.${ns}.length`, { as_expr: false });
    const v = Number(n);
    return Number.isFinite(v) ? v : 0;
  }

  /** Python: ``__contains__`` */
  async has(key) {
    return (await this.get(key)) != null;
  }

  /**
   * Python: ``__getitem__``（缺失键抛出 ``KeyError``）。
   * @param {string} key
   */
  async getRequired(key) {
    const v = await this.get(key);
    if (v === null || v === undefined) {
      const e = new Error(String(key));
      e.name = 'KeyError';
      throw e;
    }
    return v;
  }

  toString() {
    return `<StorageManager ${this._ns()}>`;
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toString();
  }
}

module.exports = { StorageManager };
