'use strict';

const bidiSession = require('../_bidi/session');
const bidiScript = require('../_bidi/script');

class RealmTracker {
  constructor(owner) {
    this._owner = owner;
    this._realms = {};
    this._subId = null;
    this._createdCb = null;
    this._destroyedCb = null;
  }

  _onCreated = (params) => {
    if (params.context && params.context !== this._owner._context_id) return;
    const id = params.realm;
    if (id) this._realms[id] = params;
    if (this._createdCb) this._createdCb(params);
  };

  _onDestroyed = (params) => {
    if (params.context && params.context !== this._owner._context_id) return;
    const id = params.realm;
    if (id) delete this._realms[id];
    if (this._destroyedCb) this._destroyedCb(params);
  };

  async start() {
    const drv = this._owner._driver._browser_driver;
    try {
      const r = await bidiSession.subscribe(drv, ['script.realmCreated', 'script.realmDestroyed'], [
        this._owner._context_id,
      ]);
      this._subId = r.subscription;
    } catch (_) { /* ignore */ }
    this._owner._driver.set_global_callback('script.realmCreated', this._onCreated, false);
    this._owner._driver.set_global_callback('script.realmDestroyed', this._onDestroyed, false);
    try {
      const result = await bidiScript.get_realms(drv, { context: this._owner._context_id });
      for (const row of result.realms || []) {
        if (row.realm) this._realms[row.realm] = row;
      }
    } catch (_) { /* ignore */ }
    return this;
  }

  async stop() {
    this._owner._driver.remove_global_callback('script.realmCreated', false);
    this._owner._driver.remove_global_callback('script.realmDestroyed', false);
    if (this._subId) {
      try {
        await bidiSession.unsubscribe(this._owner._driver._browser_driver, { subscription: this._subId });
      } catch (_) { /* ignore */ }
      this._subId = null;
    }
    return this;
  }

  list() {
    return Object.values(this._realms);
  }

  on_created(fn) {
    this._createdCb = fn;
    return this;
  }

  on_destroyed(fn) {
    this._destroyedCb = fn;
    return this;
  }

  toString() {
    return '<RealmTracker>';
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toString();
  }
}

module.exports = { RealmTracker };
