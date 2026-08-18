'use strict';

/**
 * Python: ``_bidi/log.py`` — ``log.entryAdded`` 载荷的规范化表示。
 * 实际订阅与回调仍在 ``ConsoleListener`` / ``Listener`` 等模块中。
 */
class LogEntry {
  /**
   * @param {object} [opts]
   * @param {string} [opts.level]
   * @param {string} [opts.text]
   * @param {number} [opts.timestamp]
   * @param {object} [opts.source]
   * @param {string} [opts.log_type]
   * @param {string} [opts.method]
   * @param {unknown[]} [opts.args]
   * @param {unknown} [opts.stack_trace]
   */
  constructor({
    level = '',
    text = '',
    timestamp = 0,
    source = null,
    log_type: logType = '',
    method = '',
    args = null,
    stack_trace: stackTrace = null,
  } = {}) {
    this.level = level;
    this.text = text;
    this.timestamp = timestamp;
    this.source = source || {};
    this.log_type = logType;
    this.method = method;
    this.args = args || [];
    this.stack_trace = stackTrace;
  }

  /** Python: ``LogEntry.from_params`` */
  static fromParams(params) {
    if (params == null || typeof params !== 'object') {
      return new LogEntry({});
    }
    const p = params;
    return new LogEntry({
      level: p.level || '',
      text: p.text || '',
      timestamp: p.timestamp || 0,
      source: p.source || {},
      log_type: p.type || '',
      method: p.method || '',
      args: p.args || [],
      stack_trace: p.stackTrace,
    });
  }

  toString() {
    const t = (this.text || '').slice(0, 60);
    return `<LogEntry [${this.level}] ${t}>`;
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toString();
  }
}

module.exports = { LogEntry };
