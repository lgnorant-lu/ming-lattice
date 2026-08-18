'use strict';

const bidiBrowser = require('../_bidi/browser_commands');

class WindowManager {
  constructor(owner) {
    this._owner = owner;
  }

  async _window_id() {
    try {
      const r = await bidiBrowser.get_client_windows(this._owner._driver._browser_driver);
      const wins = r.clientWindows || [];
      return wins[0] && wins[0].clientWindow ? wins[0].clientWindow : null;
    } catch (_) {
      return null;
    }
  }

  async _bidi_state(wid, opts) {
    if (!wid) return false;
    try {
      await bidiBrowser.set_client_window_state(this._owner._driver._browser_driver, wid, opts);
      return true;
    } catch (_) {
      return false;
    }
  }

  async maximize() {
    const wid = await this._window_id();
    if (!(await this._bidi_state(wid, { state: 'maximized' }))) {
      await this._owner.run_js('window.moveTo(0,0);window.resizeTo(screen.width,screen.height)');
    }
    return this._owner;
  }

  async minimize() {
    const wid = await this._window_id();
    await this._bidi_state(wid, { state: 'minimized' });
    return this._owner;
  }

  async fullscreen() {
    const wid = await this._window_id();
    if (!(await this._bidi_state(wid, { state: 'fullscreen' }))) {
      await this._owner.run_js(
        'document.documentElement.requestFullscreen&&document.documentElement.requestFullscreen()'
      );
    }
    return this._owner;
  }

  async normal() {
    const wid = await this._window_id();
    if (!(await this._bidi_state(wid, { state: 'normal' }))) {
      await this._owner.run_js('window.resizeTo(1280,800)');
    }
    return this._owner;
  }

  async set_size(width, height) {
    const wid = await this._window_id();
    if (!(await this._bidi_state(wid, { state: 'normal', width, height }))) {
      await this._owner.run_js(`window.resizeTo(${Number(width)},${Number(height)})`);
    }
    return this._owner;
  }

  async set_position(x, y) {
    const wid = await this._window_id();
    if (!(await this._bidi_state(wid, { state: 'normal', x, y }))) {
      await this._owner.run_js(`window.moveTo(${Number(x)},${Number(y)})`);
    }
    return this._owner;
  }

  async center(width = null, height = null) {
    if (width != null && height != null) await this.set_size(width, height);
    const sw = await this._owner.run_js('screen.availWidth');
    const sh = await this._owner.run_js('screen.availHeight');
    const ww = await this._owner.run_js('window.outerWidth');
    const wh = await this._owner.run_js('window.outerHeight');
    const x = Math.max(0, Math.floor((Number(sw) - Number(ww)) / 2));
    const y = Math.max(0, Math.floor((Number(sh) - Number(wh)) / 2));
    return this.set_position(x, y);
  }

  toString() {
    return '<WindowManager>';
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toString();
  }
}

module.exports = { WindowManager };
