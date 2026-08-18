'use strict';

const bidiSession = require('../_bidi/session');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class BidiEvent {
  constructor(method, params) {
    this.method = method;
    this.params = { ...(params || {}) };
    this.context = this.params.context;
    this.navigation = this.params.navigation;
    this.timestamp = this.params.timestamp;
    this.url = this.params.url;
    this.request = this.params.request;
    this.response = this.params.response;
    this.is_blocked = this.params.isBlocked;
    this.error_text = this.params.errorText;
    this.auth_challenge = this.params.authChallenge;
    this.realm = this.params.realm;
    this.source = this.params.source;
    this.channel = this.params.channel;
    this.data = this.params.data;
    this.multiple = this.params.multiple;
    this.user_prompt_type = this.params.type;
    this.accepted = this.params.accepted;
    this.message = this.params.message;
  }

  toString() {
    const u = (this.url || '').slice(0, 80);
    return `<BidiEvent ${this.method} ${u}>`;
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toString();
  }
}

class EventTracker {
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

  get listening() {
    return this._listening;
  }

  clear() {
    this._entries = [];
    return this._owner;
  }

  async start(events, contexts = null) {
    await this.stop();
    this._events = [...(events || [])];
    if (!this._events.length) return false;

    const ctxs = contexts != null
      ? (Array.isArray(contexts) ? contexts : [contexts])
      : [this._owner.tab_id];

    try {
      const result = await bidiSession.subscribe(
        this._owner._driver._browser_driver,
        this._events,
        ctxs
      );
      this._subscriptionId = result.subscription;
    } catch (_) {
      this._subscriptionId = null;
      this._events = [];
      this._listening = false;
      return false;
    }

    for (const ev of this._events) {
      const h = (params) => {
        this._entries.push(new BidiEvent(ev, params));
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

  toString() {
    return '<EventTracker>';
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toString();
  }
}

module.exports = { BidiEvent, EventTracker };
