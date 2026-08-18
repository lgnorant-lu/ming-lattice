'use strict';

/**
 * 与 Python ``ruyipage._units.downloads.DownloadsManager`` 行为对齐。
 * @see ruyipage/ruyipage/_units/downloads.py
 */

const fs = require('fs');
const path = require('path');
const bidiBrowser = require('../_bidi/browser_commands');
const bidiSession = require('../_bidi/session');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class DownloadEvent {
  constructor(method, params) {
    this.method = method;
    this.params = { ...(params || {}) };
    this.context = this.params.context;
    this.navigation = this.params.navigation;
    this.timestamp = this.params.timestamp;
    this.url = this.params.url;
    this.suggested_filename = this.params.suggestedFilename
      || this.params.filename
      || this.params.downloadFileName;
    this.status = this.params.status;
  }

  toString() {
    return `<DownloadEvent ${this.method} ${this.status || ''} ${(this.suggested_filename || this.url || '').slice(0, 60)}>`;
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toString();
  }
}

const EVENTS = [
  'browsingContext.downloadWillBegin',
  'browsingContext.downloadEnd',
];

class DownloadsManager {
  constructor(owner) {
    this._owner = owner;
    this._queue = [];
    this._events = [];
    this._subscriptionId = null;
    this._listening = false;
    this._onWillBegin = (params) => this._onDownloadWillBegin(params);
    this._onEnd = (params) => this._onDownloadEnd(params);
  }

  get events() {
    return this._events.slice();
  }

  /** 旧代码兼容别名，等价于 ``events``。 */
  get entries() {
    return this.events;
  }

  get listening() {
    return this._listening;
  }

  async set_behavior(behavior = 'allow', {
    path: downloadPath = null,
    contexts = null,
    user_contexts: userContexts = null,
  } = {}) {
    if (contexts != null && userContexts != null) {
      throw new Error('contexts 与 user_contexts 不能同时设置');
    }
    let ctx = contexts;
    let uctx = userContexts;
    if (ctx == null && uctx == null) {
      ctx = [this._owner._context_id];
    }
    return bidiBrowser.set_download_behavior(
      this._owner._driver._browser_driver,
      behavior,
      { download_path: downloadPath, contexts: ctx, user_contexts: uctx }
    );
  }

  async set_path(dirPath) {
    await this.set_behavior('allow', { path: dirPath });
    if (this._owner._browser && this._owner._browser.options) {
      this._owner._browser.options._download_path = path.resolve(String(dirPath));
      try {
        this._owner._browser.options.write_prefs_to_profile();
      } catch (_) { /* ignore */ }
    }
    return this._owner;
  }

  async start() {
    if (this._listening) await this.stop();

    this.clear();

    const bd = this._owner._driver._browser_driver;
    try {
      const result = await bidiSession.subscribe(bd, EVENTS, [this._owner._context_id]);
      this._subscriptionId = result.subscription;
    } catch (_) {
      this._subscriptionId = null;
      this._listening = false;
      return false;
    }

    bd.set_callback('browsingContext.downloadWillBegin', this._onWillBegin, null, false);
    bd.set_callback('browsingContext.downloadEnd', this._onEnd, null, false);
    this._listening = true;
    return true;
  }

  async stop() {
    const bd = this._owner._driver._browser_driver;

    if (this._subscriptionId) {
      try {
        await bidiSession.unsubscribe(bd, { subscription: this._subscriptionId });
      } catch (_) { /* ignore */ }
    }

    try {
      bd.remove_callback('browsingContext.downloadWillBegin', null, false);
      bd.remove_callback('browsingContext.downloadEnd', null, false);
    } catch (_) { /* ignore */ }

    this._subscriptionId = null;
    this._listening = false;
    return this._owner;
  }

  clear() {
    this._queue = [];
    this._events = [];
    return this._owner;
  }

  _push(method, params) {
    const context = (params || {}).context;
    if (context != null && context !== this._owner._context_id) return;
    const event = new DownloadEvent(method, params);
    this._events.push(event);
    this._queue.push(event);
  }

  _onDownloadWillBegin(params) {
    this._push('browsingContext.downloadWillBegin', params);
  }

  _onDownloadEnd(params) {
    this._push('browsingContext.downloadEnd', params);
  }

  static _match(event, { method = null, filename = null, status = null } = {}) {
    if (method && event.method !== method) return false;
    if (filename && event.suggested_filename !== filename) return false;
    if (status && event.status !== status) return false;
    return true;
  }

  /**
   * 与 Python ``wait(method=None, timeout=5, filename=None, status=None)`` 一致：
   * 从内部队列取事件，不匹配则丢弃并继续（与 CPython Queue 消费语义一致）。
   */
  async wait(method = null, timeout = 5, filename = null, status = null) {
    const end = Date.now() + timeout * 1000;
    while (Date.now() < end) {
      const remaining = end - Date.now();
      if (remaining <= 0) break;
      if (!this._queue.length) {
        await sleep(Math.min(200, Math.max(1, remaining)));
        continue;
      }
      const event = this._queue.shift();
      if (DownloadsManager._match(event, { method, filename, status })) {
        return event;
      }
    }
    return null;
  }

  async wait_chain(filename = null, timeout = 5) {
    const begin = await this.wait('browsingContext.downloadWillBegin', timeout, filename, null);
    if (!begin) return [null, null];
    const remaining = Math.max(0.1, timeout);
    const end = await this.wait('browsingContext.downloadEnd', remaining, filename, null);
    return [begin, end];
  }

  file_exists(filePath, minSize = 1) {
    try {
      return fs.existsSync(filePath) && fs.statSync(filePath).size >= minSize;
    } catch (_) {
      return false;
    }
  }

  async wait_file(filePath, timeout = 5, minSize = 1) {
    const end = Date.now() + timeout * 1000;
    while (Date.now() < end) {
      if (this.file_exists(filePath, minSize)) return true;
      await sleep(100);
    }
    return false;
  }

  toString() {
    return '<DownloadsManager>';
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toString();
  }
}

module.exports = { DownloadsManager, DownloadEvent, EVENTS };
