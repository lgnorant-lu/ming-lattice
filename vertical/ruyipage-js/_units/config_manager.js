'use strict';

const fs = require('fs');
const path = require('path');

class ConfigManager {
  constructor(owner) {
    this._owner = owner;
  }

  _file() {
    const profile = this._owner._browser && this._owner._browser.options
      ? this._owner._browser.options.profile_path
      : null;
    if (!profile) return null;
    return path.join(profile, '.ruyipage_config.json');
  }

  read() {
    const f = this._file();
    if (!f || !fs.existsSync(f)) return {};
    try {
      return JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch (_) {
      return {};
    }
  }

  write(data) {
    const f = this._file();
    if (!f) throw new Error('无法获取 profile 路径');
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify(data, null, 2), 'utf8');
    return this._owner;
  }

  get(key, defaultValue = null) {
    const d = this.read();
    return Object.prototype.hasOwnProperty.call(d, key) ? d[key] : defaultValue;
  }

  set(key, value) {
    const d = this.read();
    d[key] = value;
    return this.write(d);
  }

  toString() {
    return '<ConfigManager>';
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toString();
  }
}

module.exports = { ConfigManager };
