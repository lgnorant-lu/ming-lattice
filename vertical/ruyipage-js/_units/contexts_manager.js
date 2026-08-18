'use strict';

const bidiContext = require('../_bidi/browsing_context');

class ContextInfo {
  constructor(data) {
    this.raw = { ...(data || {}) };
    this.context = this.raw.context;
    this.url = this.raw.url;
    this.user_context = this.raw.userContext;
    this.parent = this.raw.parent;
    this.original_opener = this.raw.originalOpener;
    this.client_window = this.raw.clientWindow;
    this.children = (this.raw.children || []).map((c) => new ContextInfo(c));
  }

  toString() {
    return `<ContextInfo ${this.context || ''} ${String(this.url || '').slice(0, 80)}>`;
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toString();
  }
}

class ContextTree {
  constructor(data) {
    this.raw = { ...(data || {}) };
    this.contexts = (this.raw.contexts || []).map((c) => new ContextInfo(c));
  }

  toString() {
    return `<ContextTree contexts=${this.contexts.length}>`;
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toString();
  }
}

class ContextManager {
  constructor(owner) {
    this._owner = owner;
  }

  async get_tree(maxDepth = null, root = null) {
    const r = await bidiContext.getTree(this._owner._driver._browser_driver, {
      maxDepth: maxDepth,
      root: root || undefined,
    });
    return new ContextTree(r);
  }

  async reload(ignoreCache = false) {
    return this._owner.refresh(ignoreCache);
  }

  async set_viewport(width, height, devicePixelRatio = null) {
    return this._owner.set_viewport(width, height, devicePixelRatio);
  }

  async set_bypass_csp(enabled = true) {
    return this._owner.set_bypass_csp(enabled);
  }

  toString() {
    return '<ContextManager>';
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toString();
  }
}

module.exports = { ContextManager, ContextInfo, ContextTree };
