'use strict';

/**
 * BiDi WebSocket 驱动核心
 *
 * 实现异步 API 的关键：
 * - BrowserBiDiDriver: 管理单一 WebSocket 连接，事件驱动接收消息
 * - ContextDriver: 轻量包装器，为每个 tab/frame 注入 context 参数
 */

const WebSocket = require('ws');
const { BiDiError, PageDisconnectedError } = require('../errors');
const { Settings } = require('../_functions/settings');

class BrowserBiDiDriver {
  /**
   * 浏览器级 BiDi 驱动
   *
   * 管理 ws://host:port/session 的 WebSocket 连接。
   * 所有 tab 共用此连接，通过 context 参数区分。
   */

  static _BROWSERS = new Map(); // address -> BrowserBiDiDriver

  /**
   * 获取或创建单例
   * @param {string} address - host:port
   * @returns {BrowserBiDiDriver}
   */
  static getInstance(address) {
    if (BrowserBiDiDriver._BROWSERS.has(address)) {
      return BrowserBiDiDriver._BROWSERS.get(address);
    }
    const instance = new BrowserBiDiDriver(address);
    BrowserBiDiDriver._BROWSERS.set(address, instance);
    return instance;
  }

  constructor(address) {
    this.address = address;
    this._ws = null;
    this._cur_id = 0;

    // 响应等待: Map<cmd_id, { resolve, reject, timer }>
    this._pending = new Map();

    // 事件处理
    // key = 'event_method|context_or_empty' -> callback
    this._event_handlers = new Map();
    this._immediate_event_handlers = new Map();

    this._is_running = false;
    this._closing = false;

    // 状态
    this.session_id = null;
    this.alert_flag = false;
  }

  get is_running() {
    return this._is_running;
  }

  toString() {
    return `<BrowserBiDiDriver ${this.address}>`;
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toString();
  }

  /**
   * 连接 WebSocket 并启动消息接收
   * @param {string} [ws_url] - 完整的 WebSocket URL
   */
  start(ws_url = null) {
    if (this._is_running) return;

    if (!ws_url) {
      ws_url = `ws://${this.address}/session`;
    }

    return new Promise((resolve, reject) => {
      this._ws = new WebSocket(ws_url);

      this._ws.on('open', () => {
        this._closing = false;
        this._is_running = true;
        resolve();
      });

      this._ws.on('message', (raw) => {
        this._on_message(raw.toString());
      });

      this._ws.on('close', () => {
        if (this._is_running && !this._closing) {
          this._is_running = false;
          // 唤醒所有等待中的 Promise
          this._wake_all();
        }
      });

      this._ws.on('error', (err) => {
        if (!this._is_running) {
          reject(new Error(`BiDi WebSocket 连接失败 ${ws_url}: ${err.message}`));
        }
      });
    });
  }

  /**
   * 关闭连接（公共方法）
   */
  stop() {
    this._stop();
    // 清理单例
    BrowserBiDiDriver._BROWSERS.delete(this.address);
  }

  mark_closing() {
    this._closing = true;
  }

  _stop() {
    this._closing = true;
    this._is_running = false;

    if (this._ws) {
      try {
        this._ws.close();
      } catch (e) {
        // 忽略
      }
      this._ws = null;
    }

    this._wake_all();
  }

  /**
   * 重新连接 WebSocket
   * @param {string} [ws_url]
   */
  async reconnect(ws_url = null) {
    this._stop();

    // 重置状态
    this._cur_id = 0;
    this._event_handlers.clear();
    this._immediate_event_handlers.clear();
    this.alert_flag = false;

    await this.start(ws_url);
  }

  /**
   * 异步发送 BiDi 命令并等待响应
   * @param {string} method - BiDi 方法名
   * @param {object} [params={}] - 参数字典
   * @param {number} [timeout] - 超时（秒）
   * @returns {Promise<object>} 响应的 result 字典
   */
  run(method, params = {}, timeout = null) {
    if (!this._is_running) {
      return Promise.reject(new PageDisconnectedError('BiDiTransport 未连接，无法发送消息'));
    }

    if (timeout == null) {
      timeout = Settings.bidi_timeout;
    }

    const cmd_id = ++this._cur_id;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending.delete(cmd_id);
        reject(new BiDiError('timeout', `命令超时: ${method} (${timeout}s)`));
      }, timeout * 1000);

      this._pending.set(cmd_id, { resolve, reject, timer, method });

      const msg = JSON.stringify({ id: cmd_id, method, params });
      try {
        this._ws.send(msg);
      } catch (e) {
        clearTimeout(timer);
        this._pending.delete(cmd_id);
        const detail = e && e.message != null ? e.message : String(e);
        // Python: PageDisconnectedError('命令发送失败: {}'.format(e))
        reject(new PageDisconnectedError(`命令发送失败: ${detail}`));
      }
    });
  }

  /**
   * 注册事件回调
   * @param {string} event - 事件方法名
   * @param {Function|null} callback - 回调函数，null 为移除
   * @param {string|null} [context=null] - 限定 context
   * @param {boolean} [immediate=false] - 是否立即执行
   */
  set_callback(event, callback, context = null, immediate = false) {
    const key = `${event}|${context || ''}`;
    const handlers = immediate ? this._immediate_event_handlers : this._event_handlers;
    if (callback === null) {
      handlers.delete(key);
    } else {
      handlers.set(key, callback);
    }
  }

  /**
   * 移除事件回调
   */
  remove_callback(event, context = null, immediate = false) {
    this.set_callback(event, null, context, immediate);
  }

  /**
   * 处理收到的 WebSocket 消息
   * @param {string} raw - 原始 JSON 字符串
   */
  _on_message(raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (e) {
      return;
    }

    // 命令响应（兼容 WebDriver BiDi 的 { id, error } 与旧式 { type: 'error' }）
    if (msg.id != null) {
      const pending = this._pending.get(msg.id);
      if (pending) {
        clearTimeout(pending.timer);
        this._pending.delete(msg.id);

        if (msg.error) {
          const e = msg.error;
          const code = typeof e === 'object' && e
            ? String(e.error || e.code || 'unknown error')
            : String(msg.error);
          const message = typeof e === 'object' && e ? (e.message || '') : '';
          const stacktrace = typeof e === 'object' && e ? (e.stacktrace || '') : '';
          pending.reject(new BiDiError(code, message, stacktrace));
        } else if (msg.type === 'error') {
          pending.reject(new BiDiError(
            msg.error || 'unknown error',
            msg.message || '',
            msg.stacktrace || ''
          ));
        } else {
          pending.resolve(msg.result !== undefined ? msg.result : {});
        }
      } else {
        // Python: logger.debug("Dispatcher 收到未知 id=%d 的响应", cmd_id)
        console.debug(`Dispatcher 收到未知 id=${msg.id} 的响应`);
      }
      return;
    }

    // 事件消息
    const msg_type = msg.type;
    const has_method = 'method' in msg;

    if (msg_type === 'event' || has_method) {
      const event_method = msg.method || '';
      const event_params = msg.params || {};
      const event_context = event_params.context;

      // alert_flag 处理
      if (event_method === 'browsingContext.userPromptOpened') {
        this.alert_flag = true;
      } else if (event_method === 'browsingContext.userPromptClosed') {
        this.alert_flag = false;
      }

      // 处理 immediate 回调
      for (const [key, handler] of this._immediate_event_handlers) {
        const [evt, ctx] = _parse_key(key);
        if (evt === event_method && (ctx === '' || ctx === event_context)) {
          process.nextTick(() => {
            try {
              handler(event_params);
            } catch (e) {
              console.error(`Immediate 事件回调异常 ${event_method}:`, e);
            }
          });
        }
      }

      // 处理普通回调
      for (const [key, handler] of this._event_handlers) {
        const [evt, ctx] = _parse_key(key);
        if (evt === event_method && (ctx === '' || ctx === event_context)) {
          try {
            handler(event_params);
          } catch (e) {
            console.error(`事件回调异常 ${event_method}:`, e);
          }
        }
      }
    }
  }

  /**
   * 唤醒所有等待中的 Promise
   */
  _wake_all() {
    for (const [id, pending] of this._pending) {
      clearTimeout(pending.timer);
      const m = pending.method || '';
      // Python: PageDisconnectedError('连接已断开（命令 {} 未收到响应）'.format(method))
      pending.reject(new PageDisconnectedError(
        m ? `连接已断开（命令 ${m} 未收到响应）` : '连接已断开',
      ));
    }
    this._pending.clear();
  }
}

class ContextDriver {
  /**
   * 上下文级驱动包装器
   *
   * 为特定 tab/frame 的 BiDi 命令自动注入 context 参数。
   */

  constructor(browser_driver, context_id) {
    this._browser_driver = browser_driver;
    this.context_id = context_id;
  }

  get is_running() {
    return this._browser_driver.is_running;
  }

  get alert_flag() {
    return this._browser_driver.alert_flag;
  }

  /**
   * 发送命令，自动注入 context 参数
   * @param {string} method
   * @param {object} [params={}]
   * @param {number} [timeout]
   * @returns {Promise<object>}
   */
  run(method, params = {}, timeout = null) {
    // 深拷贝 params 避免修改原始对象
    params = { ...params };

    // 需要注入 context 的方法前缀
    const needs_context = ['browsingContext.', 'input.'];
    const needs_target_context = ['script.evaluate', 'script.callFunction'];
    const needs_partition_context = [
      'storage.getCookies', 'storage.setCookie', 'storage.deleteCookies',
    ];

    if (needs_context.some(prefix => method.startsWith(prefix)) && !params.context) {
      params.context = this.context_id;
    } else if (needs_target_context.includes(method)) {
      if (!params.target) {
        params.target = { context: this.context_id };
      } else if (!params.target.context) {
        params.target = { ...params.target, context: this.context_id };
      }
    } else if (needs_partition_context.includes(method)) {
      if (!params.partition) {
        params.partition = { type: 'context', context: this.context_id };
      } else if (!params.partition.context) {
        params.partition = {
          ...params.partition,
          type: 'context',
          context: this.context_id,
        };
      }
    }

    return this._browser_driver.run(method, params, timeout);
  }

  /**
   * 注册限定于当前 context 的事件回调
   */
  set_callback(event, callback, immediate = false) {
    this._browser_driver.set_callback(event, callback, this.context_id, immediate);
  }

  /**
   * 注册全局事件回调（不限 context）
   */
  set_global_callback(event, callback, immediate = false) {
    this._browser_driver.set_callback(event, callback, null, immediate);
  }

  /**
   * 移除当前 context 的事件回调
   */
  remove_callback(event, immediate = false) {
    this._browser_driver.remove_callback(event, this.context_id, immediate);
  }

  /** 移除全局事件回调（与 set_global_callback 配对） */
  remove_global_callback(event, immediate = false) {
    this._browser_driver.remove_callback(event, null, immediate);
  }

  toString() {
    const c = this.context_id != null ? String(this.context_id) : '';
    const s = c.length > 32 ? `${c.slice(0, 32)}...` : c;
    return `<ContextDriver ${s}>`;
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toString();
  }
}

function _parse_key(key) {
  const idx = key.indexOf('|');
  return [key.slice(0, idx), key.slice(idx + 1)];
}

module.exports = { BrowserBiDiDriver, ContextDriver };
