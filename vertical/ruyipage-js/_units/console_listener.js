'use strict';

const bidiSession = require('../_bidi/session');
const { LogEntry } = require('../_bidi/log');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 控制台日志监听（Python ``console_listener.py`` 行为对齐）。
 * 通过 BiDi ``log.entryAdded``；按 ``source.context`` 过滤当前页。
 */
class ConsoleListener {
  constructor(owner) {
    this._owner = owner;
    this._listening = false;
    /** @type {LogEntry[]} */
    this._queue = [];
    /** @type {LogEntry[]} */
    this._entries = [];
    this._subscriptionId = null;
    this._levelFilter = null;
    /** @type {((e: LogEntry) => void)|null} */
    this._realtimeCb = null;
    this._handler = null;
  }

  get listening() {
    return this._listening;
  }

  /** Python: ``entries`` — 已捕获条目（会先 ``_drain``） */
  get entries() {
    this._drain();
    return this._entries.slice();
  }

  /**
   * Python: ``start(level=None)``
   * @param {'debug'|'info'|'warn'|'error'|null} [level]
   * @returns {Promise<this>}
   */
  async start(level = null) {
    if (!this._owner || !this._owner._context_id || !this._owner._driver) return this;
    if (this._listening) await this.stop();

    this._levelFilter = level;
    this._queue = [];
    this._entries = [];

    const drv = this._owner._driver._browser_driver;
    try {
      const r = await bidiSession.subscribe(drv, ['log.entryAdded'], [this._owner._context_id]);
      const sid = r && r.subscription;
      if (sid == null || sid === '') {
        this._subscriptionId = null;
        return this;
      }
      this._subscriptionId = sid;
    } catch (e) {
      this._subscriptionId = null;
      console.warn('订阅 log.entryAdded 失败:', e);
      return this;
    }

    this._handler = (params) => {
      this._onEntry(params);
    };
    this._owner._driver.set_global_callback('log.entryAdded', this._handler, false);
    this._listening = true;
    return this;
  }

  /**
   * Python: ``stop()`` → ``self``
   * @returns {Promise<this>}
   */
  async stop() {
    if (!this._listening) {
      return this;
    }
    this._listening = false;

    const drv = this._owner._driver._browser_driver;
    if (this._subscriptionId) {
      try {
        await bidiSession.unsubscribe(drv, { subscription: this._subscriptionId });
      } catch (_) { /* ignore */ }
      this._subscriptionId = null;
    }

    try {
      this._owner._driver.set_global_callback('log.entryAdded', null);
    } catch (_) { /* ignore */ }
    this._handler = null;
    return this;
  }

  /**
   * Python: ``wait(level=None, text=None, timeout=10)``
   * @returns {Promise<LogEntry|null>}
   */
  async wait(level = null, text = null, timeout = 10) {
    let t = Number(timeout);
    if (!Number.isFinite(t) || t < 0) t = 0;
    const end = Date.now() + t * 1000;
    while (Date.now() < end) {
      const remaining = end - Date.now();
      if (remaining <= 0) break;
      const step = Math.min(remaining, 500);
      const sliceEnd = Date.now() + step;
      while (Date.now() < sliceEnd) {
        if (this._queue.length) {
          const entry = this._queue.shift();
          if (this._match(entry, level, text)) return entry;
        } else {
          const ms = Math.min(50, sliceEnd - Date.now());
          if (ms > 0) await sleep(ms);
        }
      }
    }
    return null;
  }

  /**
   * Python: ``get(level=None, text=None)``
   * @returns {LogEntry[]}
   */
  get(level = null, text = null) {
    this._drain();
    let result = this._entries.slice();
    if (level) result = result.filter((e) => e.level === level);
    if (text) result = result.filter((e) => (e.text || '').includes(text));
    return result;
  }

  /** Python: ``clear()`` */
  clear() {
    this._queue = [];
    this._entries.length = 0;
    return this;
  }

  /**
   * Python: ``on_entry(callback)``
   * @param {((e: LogEntry) => void)|null} callback
   */
  on_entry(callback) {
    this._realtimeCb = callback || null;
    return this;
  }

  /** 与 ``on_entry`` 相同；便于从旧代码迁移（Python 仅 ``on_entry``）。 */
  on_message(fn) {
    return this.on_entry(fn);
  }

  _onEntry(params) {
    if (!this._owner || !this._owner._context_id) return;
    let entry;
    try {
      const p = params && typeof params === 'object' ? params : {};
      const ctx = (p.source && p.source.context) || '';
      if (ctx && String(ctx) !== String(this._owner._context_id)) return;

      entry = LogEntry.fromParams(p);
      if (this._levelFilter && entry.level !== this._levelFilter) return;
    } catch (_) {
      return;
    }

    this._queue.push(entry);
    this._entries.push(entry);

    const cb = this._realtimeCb;
    if (cb) {
      try {
        cb(entry);
      } catch (_) { /* ignore */ }
    }
  }

  _drain() {
    while (this._queue.length) {
      const e = this._queue.shift();
      if (!this._entries.includes(e)) this._entries.push(e);
    }
  }

  _match(entry, level, text) {
    if (level && entry.level !== level) return false;
    if (text && !(entry.text || '').includes(text)) return false;
    return true;
  }

  toString() {
    return '<ConsoleListener>';
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toString();
  }
}

module.exports = { ConsoleListener };
