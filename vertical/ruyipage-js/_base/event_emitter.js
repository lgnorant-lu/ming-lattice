'use strict';

/**
 * 事件发布/订阅系统
 *
 * 支持:
 * - 按 (event, context) 精确匹配的事件回调
 * - context=null 表示匹配所有 context
 * - immediate 模式：回调在 nextTick 中立即执行（用于关键事件如 alert）
 */

class EventEmitter {
  constructor() {
    this._handlers = new Map();       // key='event|context' -> callback
    this._immediate_handlers = new Map();
    this._running = false;
  }

  /**
   * 注册事件回调
   * @param {string} event - 事件方法名
   * @param {Function} callback - 回调函数
   * @param {string|null} [context=null] - 限定 context
   * @param {boolean} [immediate=false] - 是否立即执行
   */
  on(event, callback, context = null, immediate = false) {
    const key = `${event}|${context || ''}`;
    const handlers = immediate ? this._immediate_handlers : this._handlers;
    if (callback === null) {
      handlers.delete(key);
    } else {
      handlers.set(key, callback);
    }
  }

  /**
   * 移除事件回调
   * @param {string} event
   * @param {string|null} [context=null]
   * @param {boolean} [immediate=false]
   */
  off(event, context = null, immediate = false) {
    const key = `${event}|${context || ''}`;
    const handlers = immediate ? this._immediate_handlers : this._handlers;
    handlers.delete(key);
  }

  /**
   * 触发事件
   * @param {string} event - 事件方法名
   * @param {string|null} context - 事件 context
   * @param {object} params - 事件参数
   */
  emit(event, context, params) {
    // 处理 immediate 回调
    for (const [key, handler] of this._immediate_handlers) {
      const [evt, ctx] = _parse_key(key);
      if (evt === event && (ctx === '' || ctx === context)) {
        // 在 nextTick 中执行，避免阻塞
        process.nextTick(() => {
          try {
            handler(params);
          } catch (e) {
            // Python: logger.error('Immediate 回调异常 %s: %s', event, e)
            console.error(`Immediate 回调异常 ${event}:`, e);
          }
        });
      }
    }

    // 处理普通回调
    for (const [key, handler] of this._handlers) {
      const [evt, ctx] = _parse_key(key);
      if (evt === event && (ctx === '' || ctx === context)) {
        try {
          handler(params);
        } catch (e) {
          // Python: logger.error('事件回调异常 %s: %s', event, e)
          console.error(`事件回调异常 ${event}:`, e);
        }
      }
    }
  }

  /**
   * 清除所有回调
   */
  clear() {
    this._handlers.clear();
    this._immediate_handlers.clear();
  }
}

function _parse_key(key) {
  const idx = key.indexOf('|');
  return [key.slice(0, idx), key.slice(idx + 1)];
}

module.exports = { EventEmitter };
