'use strict';

const bidiSession = require('../_bidi/session');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class NavigationEvent {
  constructor(method, params) {
    this.method = method;
    this.params = { ...(params || {}) };
    this.context = this.params.context;
    this.navigation = this.params.navigation;
    this.timestamp = this.params.timestamp;
    this.url = this.params.url;
  }

  toString() {
    return `<NavigationEvent ${this.method} ${String(this.url || '').slice(0, 80)}>`;
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toString();
  }
}

const DEFAULT_EVENTS = [
  'browsingContext.navigationStarted',
  'browsingContext.fragmentNavigated',
  'browsingContext.historyUpdated',
  'browsingContext.domContentLoaded',
  'browsingContext.load',
  'browsingContext.navigationCommitted',
  'browsingContext.navigationFailed',
];

class NavigationTracker {
  constructor(owner) {
    this._owner = owner;
    this._entries = [];
    this._subscriptionId = null;
    this._events = [];
    this._listening = false;
    this._handlers = [];
  }

  get entries() {
    return this._entries.slice();
  }

  clear() {
    this._entries = [];
    return this._owner;
  }

  async start(events = null, contexts = null) {
    await this.stop();
    this._events = [...(events || DEFAULT_EVENTS)];
    const ctxs = contexts != null
      ? (Array.isArray(contexts) ? contexts : [contexts])
      : [this._owner.tab_id];
    try {
      const r = await bidiSession.subscribe(
        this._owner._driver._browser_driver,
        this._events,
        ctxs
      );
      this._subscriptionId = r.subscription;
    } catch (_) {
      this._subscriptionId = null;
      this._events = [];
      this._listening = false;
      return false;
    }
    for (const ev of this._events) {
      const h = (params) => {
        if (params.context && params.context !== this._owner._context_id) return;
        this._entries.push(new NavigationEvent(ev, params));
      };
      this._handlers.push([ev, h]);
      this._owner._driver.set_global_callback(ev, h, false);
    }
    this._listening = true;
    return true;
  }

  async stop() {
    for (const [ev] of this._handlers) {
      try {
        this._owner._driver.remove_global_callback(ev, false);
      } catch (_) { /* ignore */ }
    }
    this._handlers = [];
    if (this._subscriptionId) {
      try {
        await bidiSession.unsubscribe(this._owner._driver._browser_driver, {
          subscription: this._subscriptionId,
        });
      } catch (_) { /* ignore */ }
    }
    this._subscriptionId = null;
    this._events = [];
    this._listening = false;
    return this._owner;
  }

  async wait(event = null, timeout = 5) {
    const end = Date.now() + timeout * 1000;
    let start = this._entries.length;
    while (Date.now() < end) {
      for (let j = start; j < this._entries.length; j++) {
        const item = this._entries[j];
        if (!event || item.method === event) return item;
      }
      await sleep(50);
    }
    return null;
  }

  async wait_for_load(timeout = 5) {
    return this.wait('browsingContext.load', timeout);
  }

  toString() {
    return '<NavigationTracker>';
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toString();
  }
}

module.exports = { NavigationTracker, NavigationEvent, DEFAULT_EVENTS };
