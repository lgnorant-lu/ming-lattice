'use strict';

class CookieInfo {
  constructor(data) {
    this.raw = { ...(data || {}) };
    this.name = this.raw.name || '';
    const rawValue = this.raw.value;
    if (rawValue && typeof rawValue === 'object' && 'value' in rawValue) {
      this.value = rawValue.value != null ? String(rawValue.value) : '';
    } else {
      this.value = rawValue != null ? String(rawValue) : '';
    }
    this.domain = this.raw.domain;
    this.path = this.raw.path;
    this.http_only = this.raw.httpOnly;
    this.secure = this.raw.secure;
    this.same_site = this.raw.sameSite;
    this.expiry = this.raw.expiry;
  }

  toString() {
    const n = (this.name || '').slice(0, 60);
    return `<CookieInfo ${n}>`;
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toString();
  }
}

module.exports = { CookieInfo };
