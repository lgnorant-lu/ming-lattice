'use strict';

const fs = require('fs');
const path = require('path');

class PrefsManager {
  constructor(owner) {
    this._owner = owner;
  }

  _profile() {
    const b = this._owner._browser;
    return b._auto_profile || (b.options && b.options.profile_path) || null;
  }

  get(key) {
    return this._readFromUserJs(key);
  }

  _readFromUserJs(key) {
    const profile = this._profile();
    if (!profile) return null;
    const userJs = path.join(profile, 'user.js');
    if (!fs.existsSync(userJs)) return null;
    const content = fs.readFileSync(userJs, 'utf8');
    const pattern = new RegExp(
      `user_pref\\s*\\(\\s*["']${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']\\s*,\\s*(.+?)\\s*\\)`,
      's'
    );
    const m = content.match(pattern);
    if (!m) return null;
    const val = m[1].trim();
    if (val === 'true') return true;
    if (val === 'false') return false;
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      return val.slice(1, -1);
    }
    const n = parseInt(val, 10);
    if (!Number.isNaN(n) && String(n) === val) return n;
    return val;
  }

  set_persistent(key, value) {
    const profile = this._profile();
    if (!profile) throw new Error('无法获取 profile 路径');
    const userJs = path.join(profile, 'user.js');
    let content = '';
    if (fs.existsSync(userJs)) content = fs.readFileSync(userJs, 'utf8');
    const escKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`user_pref\\s*\\(\\s*["']${escKey}["']\\s*,[^)]+\\)\\s*;?`, 'g');
    content = content.replace(re, '');
    let valStr;
    if (typeof value === 'boolean') valStr = value ? 'true' : 'false';
    else if (typeof value === 'number') valStr = String(value);
    else valStr = `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    content += `\nuser_pref("${key}", ${valStr});\n`;
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(userJs, content.trim() + '\n', 'utf8');
    return this._owner;
  }

  set(key, value) {
    return this.set_persistent(key, value);
  }

  get_user_prefs() {
    const profile = this._profile();
    if (!profile) return {};
    const userJs = path.join(profile, 'user.js');
    if (!fs.existsSync(userJs)) return {};
    const out = {};
    const re = /user_pref\s*\(\s*["']([^"']+)["']\s*,\s*([^)]+)\s*\)/g;
    const content = fs.readFileSync(userJs, 'utf8');
    let m;
    while ((m = re.exec(content)) !== null) {
      const k = m[1];
      let v = m[2].trim();
      if (v === 'true') out[k] = true;
      else if (v === 'false') out[k] = false;
      else if (v.startsWith('"')) out[k] = v.slice(1, -1);
      else if (/^-?\d+$/.test(v)) out[k] = parseInt(v, 10);
      else out[k] = v;
    }
    return out;
  }

  toString() {
    return '<PrefsManager>';
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toString();
  }
}

module.exports = { PrefsManager };
