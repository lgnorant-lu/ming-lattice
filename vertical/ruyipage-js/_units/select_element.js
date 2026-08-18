'use strict';

const { Keys } = require('../_functions/keys');
const { make_shared_ref: makeSharedRef } = require('../_functions/bidi_values');

class SelectElement {
  constructor(element) {
    this._ele = element;
  }

  _resolveMode(mode) {
    const m = (mode || 'compat').toLowerCase();
    if (!['native_only', 'native_first', 'compat'].includes(m)) {
      throw new Error('mode must be one of: native_only, native_first, compat');
    }
    return m;
  }

  async _readState() {
    return (await this._ele._runSafe(`(el) => {
      const opts = Array.from(el.options).map(o => ({
        text: o.text,
        value: o.value,
        selected: o.selected,
        index: o.index,
        disabled: o.disabled
      }));
      const r = el.getBoundingClientRect();
      return {
        selectedIndex: el.selectedIndex,
        value: el.value,
        multiple: !!el.multiple,
        size: Number(el.size || 0),
        disabled: !!el.disabled,
        focused: document.activeElement === el,
        rect: { x: r.x, y: r.y, width: r.width, height: r.height },
        options: opts,
      };
    }`)) || {};
  }

  _findTargetIndex(matcher, options) {
    for (const opt of options || []) {
      if (matcher(opt)) return opt.index;
    }
    return null;
  }

  async _nativeClickSelect() {
    const driver = this._ele._owner._driver._browser_driver;
    const contextId = this._ele._owner._context_id;
    try {
      await driver.run('browsingContext.activate', { context: contextId });
    } catch (_) { /* ignore */ }
    await driver.run('input.performActions', {
      context: contextId,
      actions: [
        {
          type: 'pointer',
          id: 'mouse0',
          parameters: { pointerType: 'mouse' },
          actions: [
            {
              type: 'pointerMove',
              x: 0,
              y: 0,
              duration: 0,
              origin: {
                type: 'element',
                element: makeSharedRef(this._ele._shared_id, this._ele._handle),
              },
            },
            { type: 'pointerDown', button: 0 },
            { type: 'pause', duration: 50 },
            { type: 'pointerUp', button: 0 },
          ],
        },
      ],
    });
  }

  async _focusSelectNative() {
    if (this._ele._owner.scroll && typeof this._ele._owner.scroll.to_see === 'function') {
      await this._ele._owner.scroll.to_see(this._ele, true);
    } else {
      await this._ele._runSafe('(el) => el.scrollIntoView({block:"center",inline:"nearest"})');
    }
    await this._nativeClickSelect();
    await this._ele._owner.actions.wait(0.06).perform();
    let state = await this._readState();
    if (state.focused) return true;
    await this._nativeClickSelect();
    await this._ele._owner.actions.wait(0.06).perform();
    state = await this._readState();
    return !!state.focused;
  }

  async _nudgeWithKey(key) {
    await this._ele._owner.actions.key_down(key).key_up(key).wait(0.02).perform();
  }

  async _commitWithEnter() {
    await this._ele._owner.actions.key_down(Keys.ENTER).key_up(Keys.ENTER).wait(0.03).perform();
  }

  async _nativeSelectStepwise(targetIndex) {
    let state = await this._readState();
    if (!state || state.disabled) return false;
    if (state.multiple) return false;
    const options = state.options || [];
    if (targetIndex < 0 || targetIndex >= options.length) return false;
    if (options[targetIndex].disabled) return false;
    if (state.selectedIndex === targetIndex) return true;
    if (!(await this._focusSelectNative())) return false;
    state = await this._readState();
    let currentIndex = state.selectedIndex || 0;
    const maxSteps = Math.max(1, options.length + 3);
    for (let s = 0; s < maxSteps; s += 1) {
      if (currentIndex === targetIndex) break;
      const key = currentIndex < targetIndex ? Keys.DOWN : Keys.UP;
      await this._nudgeWithKey(key);
      state = await this._readState();
      let newIndex = state.selectedIndex != null ? state.selectedIndex : currentIndex;
      if (newIndex === currentIndex) {
        await this._nudgeWithKey(Keys.HOME);
        state = await this._readState();
        newIndex = state.selectedIndex != null ? state.selectedIndex : currentIndex;
      }
      currentIndex = newIndex;
    }
    if (currentIndex !== targetIndex) return false;
    await this._commitWithEnter();
    const finalState = await this._readState();
    return finalState.selectedIndex === targetIndex;
  }

  async _jsSelectText(text) {
    return !!(await this._ele._runSafe(`(el, text) => {
      for (let opt of el.options) {
        if (opt.text === text || opt.textContent.trim() === text) {
          opt.selected = true;
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
      }
      for (let opt of el.options) {
        if (opt.text.includes(text) || opt.textContent.includes(text)) {
          opt.selected = true;
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
      }
      return false;
    }`, text));
  }

  async _jsSelectValue(value) {
    return !!(await this._ele._runSafe(`(el, value) => {
      for (let opt of el.options) {
        if (opt.value === value) {
          opt.selected = true;
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
      }
      return false;
    }`, String(value)));
  }

  async _jsSelectIndex(index) {
    return !!(await this._ele._runSafe(`(el, idx) => {
      if (idx >= 0 && idx < el.options.length) {
        el.selectedIndex = idx;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      return false;
    }`, index));
  }

  async invoke(textOrIndex, mode = 'compat') {
    if (typeof textOrIndex === 'number') return this.by_index(textOrIndex, mode);
    return this.by_text(String(textOrIndex), null, mode);
  }

  async by_text(text, _timeout = null, mode = 'compat') {
    const m = this._resolveMode(mode);
    const state = await this._readState();
    const targetIndex = this._findTargetIndex(
      (opt) => opt.text === text || String(opt.text || '').trim() === text || String(opt.text || '').includes(text),
      state.options
    );
    if (targetIndex == null) return false;
    if (await this._nativeSelectStepwise(targetIndex)) return true;
    if (m === 'native_only' || m === 'native_first') return false;
    return this._jsSelectText(text);
  }

  async by_value(value, mode = 'compat') {
    const m = this._resolveMode(mode);
    const state = await this._readState();
    const targetIndex = this._findTargetIndex(
      (opt) => String(opt.value || '') === String(value),
      state.options
    );
    if (targetIndex == null) return false;
    if (await this._nativeSelectStepwise(targetIndex)) return true;
    if (m === 'native_only' || m === 'native_first') return false;
    return this._jsSelectValue(value);
  }

  async by_index(index, mode = 'compat') {
    const m = this._resolveMode(mode);
    if (await this._nativeSelectStepwise(index)) return true;
    if (m === 'native_only' || m === 'native_first') return false;
    return this._jsSelectIndex(index);
  }

  async cancel_by_index(index) {
    return !!(await this._ele._runSafe(`(el, idx) => {
      if (idx >= 0 && idx < el.options.length) {
        el.options[idx].selected = false;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      return false;
    }`, index));
  }

  async cancel_by_text(text) {
    return !!(await this._ele._runSafe(`(el, text) => {
      for (let opt of el.options) {
        if (opt.text === text || opt.textContent.trim() === text) {
          opt.selected = false;
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
      }
      return false;
    }`, text));
  }

  async select_all() {
    await this._ele._runSafe(`(el) => {
      for (let opt of el.options) opt.selected = true;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }`);
    return this._ele;
  }

  async deselect_all() {
    await this._ele._runSafe(`(el) => {
      for (let opt of el.options) opt.selected = false;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }`);
    return this._ele;
  }

  get options() {
    return (async () => {
      const v = await this._ele._runSafe(`(el) => Array.from(el.options).map(o => ({
        text: o.text,
        value: o.value,
        selected: o.selected,
        index: o.index
      }))`);
      return v || [];
    })();
  }

  get selected_option() {
    return (async () => this._ele._runSafe(`(el) => {
      const o = el.options[el.selectedIndex];
      return o ? { text: o.text, value: o.value, index: o.index } : null;
    }`))();
  }

  get is_multi() {
    return (async () => !!(await this._ele._runSafe('(el) => el.multiple')))();
  }

  toString() {
    return '<SelectElement>';
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toString();
  }
}

/**
 * 与 Python ``SelectElement`` 一致：对象可调用，``sel('选项')`` / ``sel(2)`` → ``__call__``。
 * @param {import('../_elements/firefox_element').FirefoxElement} element
 */
function createSelectAccess(element) {
  const s = new SelectElement(element);
  const fn = async (textOrIndex, mode = 'compat') => s.invoke(textOrIndex, mode);
  fn.invoke = (textOrIndex, mode = 'compat') => s.invoke(textOrIndex, mode);
  fn.by_text = (text, timeout = null, mode = 'compat') => s.by_text(text, timeout, mode);
  fn.by_value = (value, mode = 'compat') => s.by_value(value, mode);
  fn.by_index = (index, mode = 'compat') => s.by_index(index, mode);
  fn.cancel_by_index = (index) => s.cancel_by_index(index);
  fn.cancel_by_text = (text) => s.cancel_by_text(text);
  fn.select_all = () => s.select_all();
  fn.deselect_all = () => s.deselect_all();
  Object.defineProperty(fn, 'options', { get: () => s.options, enumerable: true });
  Object.defineProperty(fn, 'selected_option', { get: () => s.selected_option, enumerable: true });
  Object.defineProperty(fn, 'is_multi', { get: () => s.is_multi, enumerable: true });
  return fn;
}

module.exports = { SelectElement, createSelectAccess };
