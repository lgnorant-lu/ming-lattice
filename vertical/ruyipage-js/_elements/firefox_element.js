'use strict';

const fs = require('fs');
const path = require('path');
const { BaseElement } = require('../_base/base');
const {
  parse_value: parseValue,
  make_shared_ref: makeSharedRef,
  serialize_value: serializeValue,
} = require('../_functions/bidi_values');
const bidiScript = require('../_bidi/script');
const bidiContext = require('../_bidi/browsing_context');
const { ElementRect } = require('../_units/element_rect');
const { ElementScroller } = require('../_units/element_scroller');
const { ElementStates } = require('../_units/element_states');
const { ElementSetter } = require('../_units/element_setter');
const { create_element_wait: createElementWait } = require('../_units/page_waiter');
const { createElementClick } = require('../_units/clicker');
const { createSelectAccess } = require('../_units/select_element');
const { NoneElement } = require('./none_element');
const { make_static_ele: makeStaticEle } = require('./static_element');
const { wrapCallableInvoke } = require('../_functions/callable_proxy');
const { ElementLostError, JavaScriptError } = require('../errors');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isNodeLostError(errText) {
  const lower = String(errText || '').toLowerCase();
  return lower.includes('no such node') || lower.includes('stale');
}

class FirefoxElement extends BaseElement {
  static _fromNode(owner, nodeData, locatorInfo = null) {
    if (!nodeData || typeof nodeData !== 'object') return null;
    const nodeType = nodeData.type || '';
    if (nodeType === 'node') {
      const sharedId = nodeData.sharedId || '';
      const handle = nodeData.handle;
      const value = nodeData.value || {};
      if (sharedId) return new FirefoxElement(owner, sharedId, handle, value, locatorInfo);
    }
    const sid = nodeData.sharedId || '';
    if (sid) {
      return new FirefoxElement(owner, sid, nodeData.handle, nodeData.value || {}, locatorInfo);
    }
    return null;
  }

  constructor(owner, sharedId, handle = null, nodeInfo = null, locatorInfo = null) {
    super();
    this._type = 'FirefoxElement';
    this._owner = owner;
    this._shared_id = sharedId;
    this._handle = handle;
    this._node_info = nodeInfo || {};
    this._locator_info = locatorInfo;
    this.isNoneElement = false;
    this._scroll = null;
    this._rect = null;
    this._states = null;
    this._setter = null;
    this._wait = null;
    this._clickHandle = null;
    this._selectHandle = null;
  }

  /** Python: ``ele('loc')`` → JS: ``await ele.invoke('loc')`` */
  async invoke(locator, index = 1, timeout = null) {
    return this.ele(locator, index, timeout);
  }

  get scroll() {
    if (!this._scroll) this._scroll = new ElementScroller(this);
    return this._scroll;
  }

  get rect() {
    if (!this._rect) this._rect = new ElementRect(this);
    return this._rect;
  }

  get states() {
    if (!this._states) this._states = new ElementStates(this);
    return this._states;
  }

  get set() {
    if (!this._setter) this._setter = new ElementSetter(this);
    return this._setter;
  }

  get wait() {
    if (!this._wait) this._wait = createElementWait(this._owner, this);
    return this._wait;
  }

  /**
   * Python: ``click`` 返回可调用的 ``Clicker``（``ele.click()`` 默认左键）。
   * JS: **可调**对象，``await ele.click()`` / ``await ele.click(true)``（``by_js``），并带 ``.left`` / ``.right`` 等。
   */
  get click() {
    if (!this._clickHandle) this._clickHandle = createElementClick(this);
    return this._clickHandle;
  }

  /**
   * Python: ``select`` → ``SelectElement``（可 ``ele.select('文本')`` / ``ele.select(0)``）。
   * JS: **``const sel = await ele.select; await sel('选项');``** 与 ``await sel.invoke(...)`` 等价。
   */
  get select() {
    return (async () => {
      const tag = await this._tagAsync();
      if (tag !== 'select') throw new TypeError('select 属性仅适用于 <select> 元素');
      if (!this._selectHandle) this._selectHandle = createSelectAccess(this);
      return this._selectHandle;
    })();
  }

  get location() {
    return (async () => this._runSafe(`(el) => {
      const r = el.getBoundingClientRect();
      return {
        x: Math.round(r.left + window.scrollX),
        y: Math.round(r.top + window.scrollY),
        width: Math.round(r.width),
        height: Math.round(r.height),
      };
    }`))();
  }

  get value() {
    return (async () => this._runSafe('(el) => el.value'))();
  }

  get attrs() {
    return (async () => {
      const cached = this._node_info.attributes;
      if (cached && typeof cached === 'object' && Object.keys(cached).length) {
        return { ...cached };
      }
      const result = await this._runSafe(`(el) => {
        const attrs = {};
        for (let i = 0; i < el.attributes.length; i++) {
          const a = el.attributes[i];
          attrs[a.name] = a.value;
        }
        return attrs;
      }`);
      return result && typeof result === 'object' ? result : {};
    })();
  }

  get link() {
    return (async () => {
      const href = await this.attr('href');
      if (!href) return '';
      return (await this._runSafe('(el) => el.href')) || href;
    })();
  }

  get src() {
    return (async () => {
      const s = await this.attr('src');
      if (!s) return '';
      return (await this._runSafe('(el) => el.src')) || s;
    })();
  }

  get pseudo() {
    return (async () => ({
      before: await this.style('content', '::before'),
      after: await this.style('content', '::after'),
    }))();
  }

  get shadow_root() {
    return (async () => {
      const result = await this._callJsOnSelfRaw('(el) => el.shadowRoot');
      if (result && result.type === 'node') return FirefoxElement._fromNode(this._owner, result);
      return null;
    })();
  }

  get closed_shadow_root() {
    return (async () => {
      const result = await this._callJsOnSelfRaw(`(el) => {
        if (typeof window.__ruyiGetClosedShadowRoot !== 'function') return null;
        return window.__ruyiGetClosedShadowRoot(el);
      }`);
      if (result && result.type === 'node') return FirefoxElement._fromNode(this._owner, result);
      return null;
    })();
  }

  async *with_shadow(mode = 'open') {
    const m = String(mode || 'open').toLowerCase();
    if (m !== 'open' && m !== 'closed') throw new Error("mode must be 'open' or 'closed'");
    const root = m === 'open' ? await this.shadow_root : await this.closed_shadow_root;
    if (!root) throw new Error(`未找到 ${m} shadow root`);
    yield root;
  }

  async ele(locator, index = 1, timeout = null) {
    return this._owner._findElement(locator, index, timeout, this);
  }

  async eles(locator, timeout = null) {
    return this._owner._findElements(locator, timeout, this);
  }

  get tag() {
    const name = this._node_info.localName || '';
    return name ? String(name).toLowerCase() : '';
  }

  get text() {
    return (async () => {
      const t = await this._runSafe('(el) => el.textContent');
      return t || '';
    })();
  }

  get inner_html() {
    return (async () => {
      const t = await this._runSafe('(el) => el.innerHTML');
      return t || '';
    })();
  }

  get outer_html() {
    return (async () => {
      const t = await this._runSafe('(el) => el.outerHTML');
      return t || '';
    })();
  }

  get html() {
    return this.outer_html;
  }

  get is_displayed() {
    return (async () => {
      const v = await this._runSafe(`(el) => {
      const s = window.getComputedStyle(el);
      return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0'
        && el.offsetWidth > 0 && el.offsetHeight > 0;
    }`);
      return !!v;
    })();
  }

  get is_enabled() {
    return (async () => {
      const v = await this._runSafe('(el) => !el.disabled');
      return !!v;
    })();
  }

  get is_checked() {
    return (async () => {
      const v = await this._runSafe('(el) => !!el.checked');
      return !!v;
    })();
  }

  get size() {
    return (async () => this._runSafe(`(el) => {
      const r = el.getBoundingClientRect();
      return { width: Math.round(r.width), height: Math.round(r.height) };
    }`))();
  }

  async property(name) {
    return this._runSafe('(el, name) => el[name]', name);
  }

  async style(name, pseudo = '') {
    const v = await this._runSafe(
      '(el, name, pseudo) => window.getComputedStyle(el, pseudo || null).getPropertyValue(name)',
      name,
      pseudo
    );
    return v || '';
  }

  async _getCenter() {
    return this._runSafe(`(el) => {
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return null;
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    }`);
  }

  async _callJsOnSelfRaw(funcDeclaration, ...args) {
    const buildArgs = () => {
      const arguments_ = [makeSharedRef(this._shared_id, this._handle)];
      for (const arg of args) {
        if (arg === null || arg === undefined) {
          arguments_.push({ type: 'undefined' });
        } else if (arg && typeof arg === 'object' && (arg.sharedId || arg.type)) {
          arguments_.push(arg);
        } else {
          arguments_.push(serializeValue(arg));
        }
      }
      return arguments_;
    };

    const runOnce = async (arguments_) => {
      const raw = await bidiScript.callFunction(
        this._owner._driver._browser_driver,
        this._owner._context_id,
        funcDeclaration,
        {
          arguments: arguments_,
          serializationOptions: { maxDomDepth: 0, includeShadowTree: 'open' },
        }
      );
      if (!raw || raw.type === 'exception') {
        const details = (raw && raw.exceptionDetails) || {};
        const errText = details.text || '';
        if (isNodeLostError(errText)) {
          if (await this._refresh_id()) {
            const args2 = buildArgs();
            args2[0] = makeSharedRef(this._shared_id, this._handle);
            const raw2 = await bidiScript.callFunction(
              this._owner._driver._browser_driver,
              this._owner._context_id,
              funcDeclaration,
              {
                arguments: args2,
                serializationOptions: { maxDomDepth: 0, includeShadowTree: 'open' },
              }
            );
            if (!raw2 || raw2.type === 'exception') {
              throw new ElementLostError(`元素引用已失效（重试后仍然失败）: ${this._shared_id}`);
            }
            return raw2.result;
          }
          throw new ElementLostError(`元素引用已失效: ${this._shared_id}`);
        }
        return null;
      }
      return raw.result;
    };

    return runOnce(buildArgs());
  }

  async _runSafe(funcDeclaration, ...args) {
    let result = await this._callJsOnSelfRaw(funcDeclaration, ...args);
    if (result == null) {
      result = await this._callJsOnSelfRaw(funcDeclaration, ...args);
    }
    return typeof result === 'object' && result !== null ? parseValue(result) : result;
  }

  async _tagAsync() {
    const name = this._node_info.localName || '';
    if (name) return String(name).toLowerCase();
    const t = await this._runSafe('(el) => el.tagName');
    return String(t || '').toLowerCase();
  }

  async attr(name) {
    return (await this._runSafe('(el, name) => el.getAttribute(name)', name)) || '';
  }

  async click_self(by_js = false, timeout = 1.5) {
    void timeout;
    if (by_js) {
      await this._runSafe('(el) => el.click()');
      return this;
    }
    if (this._owner.scroll && typeof this._owner.scroll.to_see === 'function') {
      await this._owner.scroll.to_see(this, true);
    } else {
      await this._runSafe('(el) => { el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" }); }');
    }
    await sleep(100);
    const pos = await this._runSafe(`(el) => {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    }`);
    if (!pos || (pos.x === 0 && pos.y === 0)) {
      throw new Error('无法获取元素可点击坐标，请确认元素在视口内');
    }
    await this._owner._driver._browser_driver.run('input.performActions', {
      context: this._owner._context_id,
      actions: [
        {
          type: 'pointer',
          id: 'mouse0',
          parameters: { pointerType: 'mouse' },
          actions: [
            { type: 'pointerMove', x: pos.x, y: pos.y, duration: 50 },
            { type: 'pointerDown', button: 0 },
            { type: 'pause', duration: 50 },
            { type: 'pointerUp', button: 0 },
          ],
        },
      ],
    });
    return this;
  }

  async right_click() {
    const pos = await this._getCenter();
    if (!pos) return this;
    await this._owner._driver._browser_driver.run('input.performActions', {
      context: this._owner._context_id,
      actions: [
        {
          type: 'pointer',
          id: 'mouse0',
          parameters: { pointerType: 'mouse' },
          actions: [
            { type: 'pointerMove', x: pos.x, y: pos.y, duration: 50 },
            { type: 'pointerDown', button: 2 },
            { type: 'pause', duration: 50 },
            { type: 'pointerUp', button: 2 },
          ],
        },
      ],
    });
    return this;
  }

  async double_click() {
    const pos = await this._getCenter();
    if (!pos) return this;
    const clickSeq = [
      { type: 'pointerDown', button: 0 },
      { type: 'pause', duration: 50 },
      { type: 'pointerUp', button: 0 },
      { type: 'pause', duration: 30 },
      { type: 'pointerDown', button: 0 },
      { type: 'pause', duration: 50 },
      { type: 'pointerUp', button: 0 },
    ];
    await this._owner._driver._browser_driver.run('input.performActions', {
      context: this._owner._context_id,
      actions: [
        {
          type: 'pointer',
          id: 'mouse0',
          parameters: { pointerType: 'mouse' },
          actions: [
            { type: 'pointerMove', x: pos.x, y: pos.y, duration: 50 },
            ...clickSeq,
          ],
        },
      ],
    });
    return this;
  }

  async hover() {
    await this._runSafe('(el) => el.scrollIntoView({block:"center", inline:"nearest"})');
    await sleep(100);
    const pos = await this._getCenter();
    if (pos) {
      await this._owner._driver._browser_driver.run('input.performActions', {
        context: this._owner._context_id,
        actions: [
          {
            type: 'pointer',
            id: 'mouse0',
            parameters: { pointerType: 'mouse' },
            actions: [{ type: 'pointerMove', x: pos.x, y: pos.y, duration: 100 }],
          },
        ],
      });
    }
    return this;
  }

  async drag_to(target, duration = 0.5) {
    let targetElem = null;
    let end = null;
    if (target && target._shared_id) {
      targetElem = target;
    } else if (target && typeof target === 'object' && 'x' in target && 'y' in target) {
      end = { x: Math.trunc(target.x), y: Math.trunc(target.y) };
    } else if (Array.isArray(target) && target.length >= 2) {
      end = { x: Math.trunc(target[0]), y: Math.trunc(target[1]) };
    } else {
      return this;
    }

    const durMs = Math.max(50, Math.floor(Number(duration) * 1000));

    const buildDrag = (sx, sy, ex, ey, totalMs) => {
      const steps = Math.max(8, Math.min(30, Math.floor(totalMs / 30)));
      const stepDur = Math.max(1, Math.floor(totalMs / steps));
      const actions = [
        { type: 'pointerMove', origin: 'viewport', x: sx, y: sy, duration: 0 },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration: 80 },
      ];
      for (let i = 1; i <= steps; i += 1) {
        const px = Math.trunc(sx + (ex - sx) * (i / steps));
        const py = Math.trunc(sy + (ey - sy) * (i / steps));
        actions.push({ type: 'pointerMove', origin: 'viewport', x: px, y: py, duration: stepDur });
      }
      actions.push({ type: 'pause', duration: 80 });
      actions.push({ type: 'pointerUp', button: 0 });
      return actions;
    };

    let pointerActions;
    if (targetElem) {
      await this._runSafe('(el) => el.scrollIntoView({block:"center", inline:"nearest"})');
      await targetElem._runSafe('(el) => el.scrollIntoView({block:"center", inline:"nearest"})');
      const start = await this._getCenter();
      const endPt = await targetElem._getCenter();
      if (!start || !endPt) return this;
      pointerActions = buildDrag(start.x, start.y, endPt.x, endPt.y, durMs);
    } else {
      const start = await this._runSafe(`(el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return null;
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
      }`);
      if (!start || !end) return this;
      pointerActions = buildDrag(start.x, start.y, end.x, end.y, durMs);
    }

    await this._owner._driver._browser_driver.run('input.performActions', {
      context: this._owner._context_id,
      actions: [
        { type: 'pointer', id: 'mouse0', parameters: { pointerType: 'mouse' }, actions: pointerActions },
      ],
    });
    return this;
  }

  async screenshot(filePath = null, { as_bytes: asBytes = null, as_base64: asBase64 = null } = {}) {
    const r = await bidiContext.capture_screenshot(this._owner._driver._browser_driver, this._owner._context_id, {
      origin: 'viewport',
      clip: { type: 'element', element: makeSharedRef(this._shared_id, this._handle) },
    });
    const dataB64 = r.data || '';
    const buf = Buffer.from(dataB64, 'base64');
    if (filePath) {
      const dir = path.dirname(path.resolve(String(filePath)));
      if (dir) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, buf);
    }
    if (asBytes) return buf;
    if (asBase64) return dataB64;
    if (filePath) return filePath;
    return buf;
  }

  async focus() {
    await this._runSafe('(el) => el.focus()');
    return this;
  }

  async run_js(script, ...args) {
    const serializedArgs = args.length ? args.map((a) => serializeValue(a)) : null;
    const thisRef = makeSharedRef(this._shared_id, this._handle);
    const run = async (thisArg) => {
      const result = await bidiScript.callFunction(
        this._owner._driver._browser_driver,
        this._owner._context_id,
        script,
        {
          arguments: serializedArgs,
          thisArg,
          serializationOptions: { maxDomDepth: 0, includeShadowTree: 'open' },
        }
      );
      if (result.type === 'exception') {
        const details = result.exceptionDetails || {};
        const errText = details.text || '';
        if (isNodeLostError(errText)) {
          if (await this._refresh_id()) {
            return run(makeSharedRef(this._shared_id, this._handle));
          }
          throw new ElementLostError(`元素引用已失效: ${this._shared_id}`);
        }
        throw new JavaScriptError(errText || 'script error', details);
      }
      return parseValue(result.result || {});
    };
    return run(thisRef);
  }

  async parent(locator = null, index = 1) {
    let result;
    if (locator) {
      const sel = typeof locator === 'string' ? locator : '*';
      result = await this._callJsOnSelfRaw(`(el, sel, idx) => {
        let curr = el.parentElement;
        let count = 0;
        while (curr) {
          try {
            if (curr.matches && curr.matches(sel)) {
              count++;
              if (count >= idx) return curr;
            }
          } catch (e) { /* ignore */ }
          curr = curr.parentElement;
        }
        return null;
      }`, sel, index);
    } else {
      const js = `(el) => { let p = el; for (let i = 0; i < ${index}; i++) { p = p ? p.parentElement : null; } return p; }`;
      result = await this._callJsOnSelfRaw(js);
    }
    if (result && result.type === 'node') return FirefoxElement._fromNode(this._owner, result);
    return new NoneElement(this._owner);
  }

  async child(locator = null, index = 1, timeout = null) {
    if (locator) return this.ele(locator, index, timeout);
    const result = await this._callJsOnSelfRaw('(el, idx) => el.children[idx - 1] || null', index);
    if (result && result.type === 'node') return FirefoxElement._fromNode(this._owner, result);
    return new NoneElement(this._owner);
  }

  async children(locator = null, timeout = null) {
    if (locator) return this.eles(locator, timeout);
    const raw = await this._callJsOnSelfRaw('(el) => [...el.children]');
    if (!raw || raw.type !== 'array' || !raw.value) return [];
    const out = [];
    for (const cell of raw.value) {
      if (cell && cell.type === 'node') {
        const fe = FirefoxElement._fromNode(this._owner, cell);
        if (fe) out.push(fe);
      }
    }
    return out;
  }

  async next(locator = null, index = 1) {
    let result;
    if (locator) {
      result = await this._callJsOnSelfRaw(`(el, sel, idx) => {
        let curr = el.nextElementSibling;
        let count = 0;
        while (curr) {
          try {
            if (!sel || (curr.matches && curr.matches(sel))) {
              count++;
              if (count >= idx) return curr;
            }
          } catch (e) { /* ignore */ }
          curr = curr.nextElementSibling;
        }
        return null;
      }`, typeof locator === 'string' ? locator : null, index);
    } else {
      const js = `(el) => { let s = el; for (let i = 0; i < ${index}; i++) { s = s ? s.nextElementSibling : null; } return s; }`;
      result = await this._callJsOnSelfRaw(js);
    }
    if (result && result.type === 'node') return FirefoxElement._fromNode(this._owner, result);
    return new NoneElement(this._owner);
  }

  async prev(locator = null, index = 1) {
    let result;
    if (locator) {
      result = await this._callJsOnSelfRaw(`(el, sel, idx) => {
        let curr = el.previousElementSibling;
        let count = 0;
        while (curr) {
          try {
            if (!sel || (curr.matches && curr.matches(sel))) {
              count++;
              if (count >= idx) return curr;
            }
          } catch (e) { /* ignore */ }
          curr = curr.previousElementSibling;
        }
        return null;
      }`, typeof locator === 'string' ? locator : null, index);
    } else {
      const js = `(el) => { let s = el; for (let i = 0; i < ${index}; i++) { s = s ? s.previousElementSibling : null; } return s; }`;
      result = await this._callJsOnSelfRaw(js);
    }
    if (result && result.type === 'node') return FirefoxElement._fromNode(this._owner, result);
    return new NoneElement(this._owner);
  }

  async s_ele(locator = null) {
    const html = await this.inner_html;
    return makeStaticEle(html, locator);
  }

  async _refresh_id() {
    const attrs = this._node_info.attributes || {};
    const tag = this._node_info.localName || '';
    let css = null;
    if (!this._locator_info) {
      if (!tag) return false;
      if (typeof attrs === 'object' && attrs.id) {
        css = `#${attrs.id}`;
      } else if (typeof attrs === 'object' && attrs.class) {
        const cls = attrs.class.split(/\s+/).filter(Boolean).join('.');
        css = cls ? `${tag}.${cls}` : null;
      }
      if (!css) return false;
      try {
        const elements = await this._owner._doFind(css);
        if (elements && elements.length) {
          const n = elements[0];
          this._shared_id = n._shared_id;
          this._handle = n._handle;
          this._node_info = n._node_info;
          return true;
        }
      } catch (_) {
        return false;
      }
      return false;
    }
    try {
      const elements = await this._owner._doFind(this._locator_info);
      if (elements && elements.length) {
        const n = elements[0];
        this._shared_id = n._shared_id;
        this._handle = n._handle;
        this._node_info = n._node_info;
        return true;
      }
    } catch (_) {
      return false;
    }
    return false;
  }

  async input(text, clear = true, by_js = false) {
    const tag = this.tag || (await this._tagAsync());
    const typ = await this.attr('type');
    if (tag === 'input' && typ === 'file') {
      const files = typeof text === 'string' ? [text] : text;
      await this._owner._driver._browser_driver.run('input.setFiles', {
        context: this._owner._context_id,
        element: makeSharedRef(this._shared_id),
        files,
      });
      return this;
    }

    if (by_js) {
      if (clear) await this._runSafe('(el) => { el.value = ""; }');
      await this._runSafe(
        '(el, text) => { el.value = text; el.dispatchEvent(new Event("input", {bubbles:true})); el.dispatchEvent(new Event("change", {bubbles:true})); }',
        String(text)
      );
      return this;
    }

    await this._runSafe('(el) => el.focus()');
    if (clear) await this.clear();

    const s = String(text);
    const keyActions = [];
    for (const ch of s) {
      keyActions.push({ type: 'keyDown', value: ch });
      keyActions.push({ type: 'keyUp', value: ch });
    }
    if (keyActions.length) {
      await this._owner._driver._browser_driver.run('input.performActions', {
        context: this._owner._context_id,
        actions: [{ type: 'key', id: 'keyboard0', actions: keyActions }],
      });
    }
    return this;
  }

  async clear() {
    await this.click_self();
    const { Keys } = require('../_functions/keys');
    await this._owner._driver._browser_driver.run('input.performActions', {
      context: this._owner._context_id,
      actions: [
        {
          type: 'key',
          id: 'keyboard0',
          actions: [
            { type: 'keyDown', value: Keys.CONTROL },
            { type: 'keyDown', value: 'a' },
            { type: 'keyUp', value: 'a' },
            { type: 'keyUp', value: Keys.CONTROL },
            { type: 'keyDown', value: Keys.DELETE },
            { type: 'keyUp', value: Keys.DELETE },
          ],
        },
      ],
    });
    return this;
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toString();
  }

  toString() {
    const tag = this._node_info.localName || '?';
    const attrs = this._node_info.attributes || {};
    const idStr = typeof attrs === 'object' && attrs.id ? attrs.id : '';
    const clsStr = typeof attrs === 'object' && attrs.class ? String(attrs.class).split(/\s+/)[0] : '';
    const parts = [tag];
    if (idStr) parts.push(`#${idStr}`);
    if (clsStr) parts.push(`.${clsStr}`);
    return `<FirefoxElement ${parts.join('')}>`;
  }

  valueOf() {
    return this._shared_id;
  }

  /**
   * Python: ``__hash__`` — 基于 ``_shared_id`` 的稳定 32 位整数（与 CPython 进程内 ``hash(str)`` 数值不要求一致）。
   * @returns {number}
   */
  hashCode() {
    const str = String(this._shared_id || '');
    let h = 0;
    for (let i = 0; i < str.length; i += 1) {
      h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    }
    return h;
  }

  equals(other) {
    return other && other._shared_id === this._shared_id;
  }
}

/**
 * 与 Python ``ele(locator, ...)``（``__call__``）用法接近的可选包装。
 *
 * - ``await w('#sub')`` 等价 ``await element.invoke('#sub')``。
 * - 其它成员透传原元素。
 *
 * @param {{ invoke: Function } & Record<string, unknown>} element
 * @returns {Function & Record<string, unknown>}
 */
function wrapElementInvoke(element) {
  if (!element || typeof element.invoke !== 'function') {
    throw new TypeError('wrapElementInvoke: element must have invoke()');
  }
  return wrapCallableInvoke(element, 'invoke');
}

module.exports = { FirefoxElement, wrapElementInvoke };
