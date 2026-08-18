'use strict';

const bidiSession = require('../_bidi/session');
const { Settings } = require('../_functions/settings');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class DataPacket {
  constructor({
    request = null,
    response = null,
    event_type: eventType = '',
    url = '',
    method = '',
    status = 0,
    headers = null,
    body = null,
    timestamp = 0,
  } = {}) {
    this.request = request || {};
    this.response = response || {};
    this.event_type = eventType;
    this.url = url;
    this.method = method;
    this.status = status;
    this.headers = headers || {};
    this.body = body;
    this.timestamp = timestamp;
  }

  get is_failed() {
    return this.event_type === 'fetchError';
  }

  toString() {
    return `<DataPacket ${this.method} ${this.status} ${String(this.url || '').slice(0, 60)}>`;
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toString();
  }
}

class Listener {
  constructor(owner) {
    this._owner = owner;
    this._listening = false;
    this._targets = null;
    this._is_regex = false;
    this._method_filter = null;
    this._caught = [];
    this._packets = [];
    this._subscription_id = null;
    this._subscribed_events = [];
  }

  get listening() {
    return this._listening;
  }

  _drainQueue() {
    while (this._caught.length) {
      const packet = this._caught.shift();
      if (!this._packets.includes(packet)) {
        this._packets.push(packet);
      }
    }
  }

  get steps() {
    this._drainQueue();
    return this._packets.slice();
  }

  /** 与 Python ``set``/``list``/``tuple``/子串 目标语义一致；非法或异常迭代器回退为「全部」。 */
  _normalizeTargets(targets) {
    if (targets === true) return true;
    if (typeof targets === 'string') return new Set([targets]);
    if (targets instanceof Set) {
      try {
        return new Set(targets);
      } catch (_) {
        return true;
      }
    }
    if (Array.isArray(targets)) return new Set(targets);
    if (targets != null && typeof targets === 'object' && typeof targets[Symbol.iterator] === 'function') {
      try {
        return new Set(targets);
      } catch (_) {
        return true;
      }
    }
    return true;
  }

  async start(targets = true, isRegex = false, method = null) {
    if (!this._owner || !this._owner._context_id || !this._owner._driver) return this;
    if (this._listening) await this.stop();

    this._is_regex = !!isRegex;
    this._method_filter = method ? String(method).toUpperCase() : null;

    this._targets = this._normalizeTargets(targets);

    this._caught = [];
    this._packets = [];

    const events = [
      'network.beforeRequestSent',
      'network.responseCompleted',
      'network.fetchError',
    ];

    try {
      const result = await bidiSession.subscribe(
        this._owner._driver._browser_driver,
        events,
        [this._owner._context_id]
      );
      const sub = result && result.subscription;
      if (sub == null || sub === '') {
        return this;
      }
      this._subscription_id = sub;
      this._subscribed_events = events;
    } catch (e) {
      console.warn('订阅网络事件失败:', e);
      return this;
    }

    const drv = this._owner._driver;
    drv.set_callback('network.responseCompleted', (p) => this._on_response(p));
    drv.set_callback('network.fetchError', (p) => this._on_fetch_error(p));
    this._listening = true;
    console.debug('开始监听网络事件');
    return this;
  }

  async stop() {
    if (!this._listening) return this;
    this._listening = false;

    if (this._subscription_id) {
      try {
        await bidiSession.unsubscribe(this._owner._driver._browser_driver, {
          subscription: this._subscription_id,
        });
      } catch (_) { /* ignore */ }
      this._subscription_id = null;
    }

    const drv = this._owner._driver;
    drv.remove_callback('network.responseCompleted');
    drv.remove_callback('network.fetchError');
    console.debug('停止监听网络事件');
    return this;
  }

  async wait(timeout = null, count = 1) {
    let t = timeout == null ? Settings.bidi_timeout : Number(timeout);
    if (!Number.isFinite(t) || t < 0) t = 0;
    let c = count == null ? 1 : Math.floor(Number(count));
    if (!Number.isFinite(c)) c = 1;
    if (c < 1) return [];

    const end = Date.now() + t * 1000;
    const results = [];

    while (results.length < c) {
      const remaining = end - Date.now();
      if (remaining <= 0) break;
      if (this._caught.length) {
        results.push(this._caught.shift());
        continue;
      }
      await sleep(Math.min(500, Math.max(1, remaining)));
    }

    if (c === 1) return results[0] || null;
    return results;
  }

  clear() {
    this._caught.length = 0;
    this._packets.length = 0;
  }

  _match(url, method) {
    const u = String(url ?? '');
    const m = String(method ?? '');
    if (this._method_filter && m.toUpperCase() !== this._method_filter) {
      return false;
    }
    if (this._targets === true) return true;
    for (const pattern of this._targets) {
      const pat = pattern == null ? '' : String(pattern);
      if (this._is_regex) {
        try {
          if (pat && new RegExp(pat).exec(u)) return true;
        } catch (_) { /* ignore */ }
      } else if (pat && u.includes(pat)) return true;
    }
    return false;
  }

  _on_response(params) {
    if (!this._listening) return;
    if (!params || typeof params !== 'object') return;
    const request = params.request || {};
    const response = params.response || {};
    const url = request.url;
    const method = request.method;
    if (!this._match(url, method)) return;

    const headers = {};
    for (const h of response.headers || []) {
      if (!h || typeof h !== 'object') continue;
      const name = h.name || '';
      const valueObj = h.value || {};
      const value = typeof valueObj === 'object' && valueObj && 'value' in valueObj
        ? valueObj.value
        : String(valueObj);
      headers[String(name).toLowerCase()] = value;
    }

    const packet = new DataPacket({
      request,
      response,
      event_type: 'responseCompleted',
      url: String(url ?? ''),
      method: String(method ?? ''),
      status: response.status || 0,
      headers,
      timestamp: params.timestamp || 0,
    });
    this._caught.push(packet);
    this._packets.push(packet);
  }

  _on_fetch_error(params) {
    if (!this._listening) return;
    if (!params || typeof params !== 'object') return;
    const request = params.request || {};
    const url = request.url;
    const method = request.method;
    if (!this._match(url, method)) return;

    const packet = new DataPacket({
      request,
      event_type: 'fetchError',
      url: String(url ?? ''),
      method: String(method ?? ''),
      timestamp: params.timestamp || 0,
    });
    this._caught.push(packet);
    this._packets.push(packet);
  }

  toString() {
    return '<Listener>';
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toString();
  }
}

module.exports = { Listener, DataPacket };
