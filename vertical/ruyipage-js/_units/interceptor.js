'use strict';

const bidiNetwork = require('../_bidi/network');
const bidiSession = require('../_bidi/session');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function _isPlainObject(x) {
  return x != null && typeof x === 'object' && !Array.isArray(x);
}

function _normalize_headers(headers) {
  if (headers == null) return null;
  if (typeof headers === 'object' && !Array.isArray(headers)) {
    return Object.entries(headers).map(([name, value]) => ({
      name,
      value: { type: 'string', value: String(value) },
    }));
  }
  return headers;
}

/** 与 Python 文档示例一致：``str`` / ``bytes`` → BiDi ``{ type, value }``；已是 BiDi 形态则原样传递。 */
function _normalize_continue_request_body(body) {
  if (body == null) return null;
  if (typeof body === 'string') {
    return { type: 'string', value: body };
  }
  if (Buffer.isBuffer(body) || body instanceof Uint8Array) {
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
    return { type: 'base64', value: buf.toString('base64') };
  }
  if (_isPlainObject(body) && body.type != null && 'value' in body) {
    return body;
  }
  return body;
}

/** BiDi 网络事件上解析 browsing context id（用于全局回调下的过滤）。 */
function _networkEventContext(params) {
  if (!params || typeof params !== 'object') return '';
  const p = params;
  if (p.context != null && p.context !== '') return String(p.context);
  const req = p.request;
  if (req && typeof req === 'object' && req.context != null && req.context !== '') {
    return String(req.context);
  }
  return '';
}

function _header_dict(headersList) {
  const out = {};
  for (const h of headersList || []) {
    const name = h.name || '';
    const vo = h.value || {};
    const v = typeof vo === 'object' && vo && 'value' in vo ? vo.value : String(vo);
    out[name] = v;
  }
  return out;
}

class InterceptedRequest {
  constructor(params, browserDriver, requestCollector = null, responseCollector = null) {
    this._driver = browserDriver;
    this._params = params || {};
    this._request = this._params.request || {};
    this._collector = requestCollector;
    this._response_collector = responseCollector;
    this._handled = false;
    this._bodyMemo = { done: false, value: null };

    this._request_id = this._request.request || '';
    this._url = this._request.url || '';
    this._method = this._request.method || '';
    this._headers = _header_dict(this._request.headers);
    const ints = this._params.intercepts;
    this._phase = ints && ints.length ? ints[0] : null;

    this._response_raw = this._params.response || {};
    this._response_status = this._response_raw.status != null ? this._response_raw.status : null;
    this._response_headers = null;
    if (this._response_raw && this._response_raw.headers) {
      this._response_headers = _header_dict(this._response_raw.headers);
    }

  }

  toString() {
    return `<InterceptedRequest ${this._method} ${String(this._url || '').slice(0, 60)}>`;
  }

  /** Node ``util.inspect`` / 调试时对齐 Python ``__repr__`` 可读串。 */
  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toString();
  }

  get request_id() {
    return this._request_id;
  }

  get url() {
    return this._url;
  }

  get method() {
    return this._method;
  }

  get headers() {
    return this._headers;
  }

  get phase() {
    return this._phase;
  }

  get is_response_phase() {
    return !!this._response_raw && Object.keys(this._response_raw).length > 0;
  }

  get response_status() {
    return this._response_status;
  }

  get response_headers() {
    return this._response_headers;
  }

  get handled() {
    return this._handled;
  }

  _decode_body_value(body) {
    if (body == null) return null;
    if (typeof body === 'string') return body;
    if (typeof body !== 'object') return String(body);
    const bodyType = body.type;
    const value = body.value;
    if (value == null) return null;
    if (bodyType === 'string') return String(value);
    if (bodyType === 'base64') {
      try {
        return Buffer.from(String(value), 'base64').toString('utf8');
      } catch (_) {
        return String(value);
      }
    }
    return String(value);
  }

  async _load_body() {
    let body = this._decode_body_value(this._request.body);
    if (body == null) body = this._decode_body_value(this._params.body);
    if (body != null) return body;

    if (!this._collector || !this._request_id) return null;

    try {
      const data = await this._collector.get(this._request_id, 'request');
      let decoded = this._decode_body_value(data.bytes);
      if (decoded != null) return decoded;
      decoded = this._decode_body_value(data.base64);
      if (decoded != null) return decoded;
      const raw = data.raw;
      if (_isPlainObject(raw)) {
        for (const key of ['data', 'body', 'value']) {
          decoded = this._decode_body_value(raw[key]);
          if (decoded != null) return decoded;
        }
        decoded = this._decode_body_value(raw);
        if (decoded != null) return decoded;
      } else if (raw != null) {
        return String(raw);
      }
    } catch (_) { /* ignore */ }

    return null;
  }

  /**
   * 请求体（与 Python ``InterceptedRequest.body`` 语义一致）。请 ``await req.getBody()``。
   */
  async getBody() {
    if (!this._bodyMemo.done) {
      this._bodyMemo.value = await this._load_body();
      this._bodyMemo.done = true;
    }
    return this._bodyMemo.value;
  }

  /** 与 ``getBody()`` 相同；推荐新代码写 ``await req.getBody()``。 */
  get body() {
    return this.getBody();
  }

  /**
   * 响应体（与 Python ``response_body`` 一致）。请 ``await req.getResponseBody()``。
   */
  async getResponseBody() {
    return this._load_response_body();
  }

  /** 与 ``getResponseBody()`` 相同；推荐新代码写 ``await req.getResponseBody()``。 */
  get response_body() {
    return this.getResponseBody();
  }

  async _load_response_body() {
    if (!this._response_collector || !this._request_id) return null;
    for (let i = 0; i < 10; i += 1) {
      try {
        const data = await this._response_collector.get(this._request_id, 'response');
        if (data.has_data) {
          return this._decode_body_value(data.base64) || this._decode_body_value(data.bytes);
        }
      } catch (_) { /* ignore */ }
      await sleep(300);
    }
    return null;
  }

  async continue_request(url = null, method = null, headers = null, body = null) {
    if (this._handled) return;
    this._handled = true;
    const opts = {};
    if (url != null) opts.url = url;
    if (method != null) opts.method = method;
    const nh = _normalize_headers(headers);
    if (nh != null) opts.headers = nh;
    const nb = _normalize_continue_request_body(body);
    if (nb != null) opts.body = nb;
    await bidiNetwork.continue_request(this._driver, this._request_id, opts);
  }

  async fail() {
    if (this._handled) return;
    this._handled = true;
    await bidiNetwork.fail_request(this._driver, this._request_id);
  }

  /**
   * 与 Python ``mock(body='', status_code=200, headers=None, reason_phrase='OK')`` 对齐。
   * 支持：``mock(body, { status_code, headers, reason_phrase })`` 或
   * ``mock(body, status_code)`` / ``mock(body, status_code, headers)`` / ``mock(body, status_code, headers, reason_phrase)``。
   */
  async mock(body = '', ...rest) {
    let statusCode = 200;
    let headers = null;
    let reasonPhrase = 'OK';
    if (rest.length === 1 && _isPlainObject(rest[0])) {
      const o = rest[0];
      if (o.status_code != null) statusCode = Number(o.status_code);
      else if (o.statusCode != null) statusCode = Number(o.statusCode);
      if (o.headers != null) headers = o.headers;
      if (o.reason_phrase != null) reasonPhrase = String(o.reason_phrase);
      else if (o.reasonPhrase != null) reasonPhrase = String(o.reasonPhrase);
    } else if (rest.length) {
      const a0 = rest[0];
      if (typeof a0 === 'number' && !Number.isNaN(a0)) statusCode = a0;
      if (rest.length >= 2) headers = rest[1];
      if (rest.length >= 3) reasonPhrase = String(rest[2]);
    }

    if (this._handled) return;
    this._handled = true;
    const bodyBytes = typeof body === 'string' ? Buffer.from(body, 'utf8') : Buffer.from(body);
    const encoded = bodyBytes.toString('base64');
    let respHeaders = _normalize_headers(headers);
    if (respHeaders == null) {
      respHeaders = [{ name: 'content-type', value: { type: 'string', value: 'text/plain' } }];
    }
    await bidiNetwork.provide_response(this._driver, this._request_id, {
      body: { type: 'base64', value: encoded },
      headers: respHeaders,
      status_code: statusCode,
      reason_phrase: reasonPhrase,
    });
  }

  /** 与 Python 位置参数 ``continue_response(headers, reason_phrase, status_code)`` 对齐。 */
  async continue_response(headers = null, reasonPhrase = null, statusCode = null) {
    if (this._handled) return;
    this._handled = true;
    await bidiNetwork.continue_response(this._driver, this._request_id, {
      headers: _normalize_headers(headers),
      reason_phrase: reasonPhrase,
      status_code: statusCode,
    });
  }

  /**
   * 与 Python ``continue_with_auth(action='default', username=None, password=None)`` 对齐。
   */
  async continue_with_auth(action = 'default', username = null, password = null) {
    if (this._handled) return;
    this._handled = true;
    let credentials = null;
    if (action === 'provideCredentials') {
      credentials = {
        type: 'password',
        username: username || '',
        password: password || '',
      };
    }
    await bidiNetwork.continue_with_auth(this._driver, this._request_id, action, credentials);
  }
}

class Interceptor {
  constructor(owner) {
    this._owner = owner;
    this._active = false;
    this._intercept_id = null;
    this._subscription_id = null;
    this._request_collector = null;
    this._response_collector = null;
    this._handler = null;
    this._queue = [];
    this._phases = [];
  }

  /** 与 Python ``threading.Queue`` 语义对应的 FIFO 缓冲（队列模式）。 */
  _resetQueue() {
    this._queue = [];
  }

  get active() {
    return this._active;
  }

  /**
   * ``start`` 中途失败（如 ``session.subscribe``）时撤销 ``addIntercept`` 与 DataCollector，避免请求永久挂起。
   */
  async _rollbackInterceptSetup() {
    if (this._intercept_id) {
      try {
        await bidiNetwork.remove_intercept(this._owner._driver._browser_driver, this._intercept_id);
      } catch (_) { /* ignore */ }
      this._intercept_id = null;
    }
    if (this._request_collector) {
      try {
        await this._request_collector.remove();
      } catch (_) { /* ignore */ }
      this._request_collector = null;
    }
    if (this._response_collector) {
      try {
        await this._response_collector.remove();
      } catch (_) { /* ignore */ }
      this._response_collector = null;
    }
    this._subscription_id = null;
  }

  /**
   * 队列模式：与 Python ``Queue.get(timeout=...)`` 类似的阻塞等待（JS 为 async）。
   */
  async wait(timeout = 10) {
    const deadline = Date.now() + timeout * 1000;
    while (Date.now() < deadline) {
      if (this._queue.length) return this._queue.shift();
      await sleep(Math.min(200, Math.max(1, deadline - Date.now())));
    }
    return null;
  }

  async start(handler = null, {
    url_patterns: urlPatterns = null,
    phases = null,
    collect_response: collectResponse = false,
  } = {}) {
    if (!this._owner || !this._owner._context_id || !this._owner._driver) return this;
    if (this._active) await this.stop();

    const ph = phases == null ? ['beforeRequestSent'] : phases;
    this._phases = ph;
    this._handler = handler;
    this._resetQueue();
    this._request_collector = null;
    this._response_collector = null;

    if (ph.includes('beforeRequestSent')) {
      try {
        this._request_collector = await this._owner.network.add_data_collector(
          ['beforeRequestSent'],
          { data_types: ['request'] }
        );
      } catch (_) { /* ignore */ }
    }

    if (collectResponse) {
      try {
        this._response_collector = await this._owner.network.add_data_collector(
          ['responseCompleted'],
          { data_types: ['response'] }
        );
      } catch (_) { /* ignore */ }
    }

    let addRes = null;
    try {
      addRes = await bidiNetwork.add_intercept(
        this._owner._driver._browser_driver,
        ph,
        urlPatterns,
        [this._owner._context_id]
      );
      this._intercept_id = addRes.intercept || '';
    } catch (e) {
      await this._rollbackInterceptSetup();
      throw e;
    }

    if (!this._intercept_id) {
      console.warn('network.addIntercept 未返回 intercept id:', addRes);
      await this._rollbackInterceptSetup();
      return this;
    }

    const events = [];
    if (ph.includes('beforeRequestSent')) events.push('network.beforeRequestSent');
    if (ph.includes('responseStarted')) events.push('network.responseStarted');
    if (ph.includes('authRequired')) events.push('network.authRequired');

    if (events.length) {
      try {
        const sub = await bidiSession.subscribe(
          this._owner._driver._browser_driver,
          events,
          [this._owner._context_id]
        );
        const sid = sub && sub.subscription != null && sub.subscription !== '' ? String(sub.subscription) : '';
        if (!sid) {
          throw new Error('session.subscribe returned empty subscription id');
        }
        this._subscription_id = sid;
      } catch (e) {
        console.warn('订阅网络事件失败:', e);
        await this._rollbackInterceptSetup();
        return this;
      }
    }

    const drv = this._owner._driver;
    if (ph.includes('beforeRequestSent')) {
      drv.set_global_callback('network.beforeRequestSent', (p) => this._on_intercept(p));
    }
    if (ph.includes('responseStarted')) {
      drv.set_global_callback('network.responseStarted', (p) => this._on_response_intercept(p));
    }
    if (ph.includes('authRequired')) {
      drv.set_global_callback('network.authRequired', (p) => this._on_auth(p));
    }

    this._active = true;
    return this;
  }

  async start_requests(handler = null, urlPatterns = null, collectResponse = false) {
    return this.start(handler, {
      url_patterns: urlPatterns,
      phases: ['beforeRequestSent'],
      collect_response: collectResponse,
    });
  }

  async start_responses(handler = null, urlPatterns = null, collectResponse = true) {
    return this.start(handler, {
      url_patterns: urlPatterns,
      phases: ['responseStarted'],
      collect_response: collectResponse,
    });
  }

  async stop() {
    if (!this._active) return this;
    this._active = false;

    if (this._intercept_id) {
      try {
        await bidiNetwork.remove_intercept(this._owner._driver._browser_driver, this._intercept_id);
      } catch (_) { /* ignore */ }
      this._intercept_id = null;
    }

    if (this._subscription_id) {
      try {
        await bidiSession.unsubscribe(this._owner._driver._browser_driver, {
          subscription: this._subscription_id,
        });
      } catch (_) { /* ignore */ }
      this._subscription_id = null;
    }

    if (this._request_collector) {
      try {
        await this._request_collector.remove();
      } catch (_) { /* ignore */ }
      this._request_collector = null;
    }

    if (this._response_collector) {
      try {
        await this._response_collector.remove();
      } catch (_) { /* ignore */ }
      this._response_collector = null;
    }

    const drv = this._owner._driver;
    for (const ev of [
      'network.beforeRequestSent',
      'network.responseStarted',
      'network.authRequired',
    ]) {
      drv.remove_global_callback(ev);
    }

    return this;
  }

  /**
   * @param {'request'|'response'} phaseKind 与 Python ``_on_intercept`` / ``_on_response_intercept`` 的日志前缀一致。
   */
  _handle_req(req, phaseKind) {
    const warnPrefix = phaseKind === 'response' ? '响应拦截回调异常:' : '拦截回调异常:';
    const finish = async () => {
      if (this._handler) {
        try {
          await Promise.resolve(this._handler(req));
        } catch (e) {
          console.warn(warnPrefix, e);
        }
        if (!req.handled) {
          if (req.is_response_phase) await req.continue_response();
          else await req.continue_request();
        }
      } else {
        this._queue.push(req);
      }
    };
    void finish();
  }

  _on_intercept(params) {
    if (!this._active) return;
    const ctx = _networkEventContext(params);
    if (ctx && ctx !== String(this._owner._context_id)) return;
    const req = new InterceptedRequest(
      params,
      this._owner._driver._browser_driver,
      this._request_collector,
      this._response_collector
    );
    this._handle_req(req, 'request');
  }

  _on_response_intercept(params) {
    if (!this._active) return;
    const ctx = _networkEventContext(params);
    if (ctx && ctx !== String(this._owner._context_id)) return;
    const req = new InterceptedRequest(
      params,
      this._owner._driver._browser_driver,
      this._request_collector,
      this._response_collector
    );
    this._handle_req(req, 'response');
  }

  _on_auth(params) {
    if (!this._active) return;
    const ctx = _networkEventContext(params);
    if (ctx && ctx !== String(this._owner._context_id)) return;
    const req = new InterceptedRequest(
      params,
      this._owner._driver._browser_driver,
      this._request_collector,
      this._response_collector
    );
    const finish = async () => {
      if (this._handler) {
        try {
          await Promise.resolve(this._handler(req));
        } catch (e) {
          console.warn('认证拦截回调异常:', e);
        }
        if (!req.handled) {
          await bidiNetwork.continue_with_auth(
            this._owner._driver._browser_driver,
            req.request_id,
            'default'
          );
        }
      } else {
        this._queue.push(req);
      }
    };
    void finish();
  }

  toString() {
    return '<Interceptor>';
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toString();
  }
}

module.exports = { Interceptor, InterceptedRequest };
