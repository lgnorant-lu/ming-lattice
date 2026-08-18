'use strict';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Clicker {
  constructor(element) {
    this._ele = element;
  }

  async _perform(pointerActions) {
    await this._ele._owner._driver._browser_driver.run('input.performActions', {
      context: this._ele._owner._context_id,
      actions: [
        {
          type: 'pointer',
          id: 'mouse0',
          parameters: { pointerType: 'mouse' },
          actions: pointerActions,
        },
      ],
    });
    await this._sendVisual(pointerActions);
  }

  async _sendVisual(pointerActions) {
    const browser = this._ele._owner._browser;
    if (!browser || !browser.options || !browser.options.action_visual_enabled) return;
    try {
      let lastX = 0;
      let lastY = 0;
      const clicks = [];
      const movePoints = [];
      for (const a of pointerActions) {
        if (a.type === 'pointerMove') {
          lastX = Math.trunc(a.x != null ? a.x : lastX);
          lastY = Math.trunc(a.y != null ? a.y : lastY);
          movePoints.push([lastX, lastY]);
        } else if (a.type === 'pointerDown') {
          clicks.push([lastX, lastY, a.button != null ? a.button : 0]);
        }
      }
      const parts = [];
      if (movePoints.length) {
        parts.push(`if(window.__ruyiAV)window.__ruyiAV.moves(${JSON.stringify(movePoints)})`);
      }
      for (const [cx, cy, btn] of clicks) {
        parts.push(`if(window.__ruyiAV)window.__ruyiAV.click(${cx},${cy},${btn})`);
      }
      const rect = await this._getEleRect();
      if (rect) {
        parts.push(`if(window.__ruyiAV)window.__ruyiAV.highlight(${JSON.stringify(rect)},${JSON.stringify(await this._getEleLabel())})`);
      }
      if (parts.length) {
        await this._ele._owner.run_js(parts.join(';'), { as_expr: true });
      }
    } catch (_) { /* ignore */ }
  }

  async _sendJsClickVisual() {
    const browser = this._ele._owner._browser;
    if (!browser || !browser.options || !browser.options.action_visual_enabled) return;
    try {
      const rect = await this._getEleRect();
      const center = (await this._ele._getCenter()) || { x: 0, y: 0 };
      const parts = [
        `if(window.__ruyiAV)window.__ruyiAV.moves([[${Math.trunc(center.x)},${Math.trunc(center.y)}]])`,
        `if(window.__ruyiAV)window.__ruyiAV.click(${Math.trunc(center.x)},${Math.trunc(center.y)},0)`,
      ];
      if (rect) {
        parts.push(`if(window.__ruyiAV)window.__ruyiAV.highlight(${JSON.stringify(rect)},${JSON.stringify(await this._getEleLabel())})`);
      }
      await this._ele._owner.run_js(parts.join(';'), { as_expr: true });
    } catch (_) { /* ignore */ }
  }

  async _getEleRect() {
    try {
      const loc = await this._ele.location;
      const size = await this._ele.size;
      return {
        x: Math.trunc(loc.x || 0),
        y: Math.trunc(loc.y || 0),
        width: Math.trunc(size.width || 0),
        height: Math.trunc(size.height || 0),
      };
    } catch (_) {
      return null;
    }
  }

  async _getEleLabel() {
    try {
      const tag = (await this._ele._tagAsync()) || 'element';
      const eleId = await this._ele.attr('id');
      if (eleId) return `${tag}#${eleId}`;
      return tag;
    } catch (_) {
      return 'element';
    }
  }

  /** Python: ``click(by_js=False)`` */
  async call(byJs = false) {
    return byJs ? this.by_js() : this.left();
  }

  async left(times = 1) {
    const pos = await this._ele._getCenter();
    if (!pos) return this.by_js();
    const actions = [{ type: 'pointerMove', x: pos.x, y: pos.y, duration: 50 }];
    for (let i = 0; i < times; i += 1) {
      actions.push({ type: 'pointerDown', button: 0 });
      actions.push({ type: 'pause', duration: 50 });
      actions.push({ type: 'pointerUp', button: 0 });
    }
    await this._perform(actions);
    return this._ele;
  }

  async right() {
    const pos = await this._ele._getCenter();
    if (!pos) return this._ele;
    await this._perform([
      { type: 'pointerMove', x: pos.x, y: pos.y, duration: 50 },
      { type: 'pointerDown', button: 2 },
      { type: 'pause', duration: 50 },
      { type: 'pointerUp', button: 2 },
    ]);
    return this._ele;
  }

  async middle() {
    const pos = await this._ele._getCenter();
    if (!pos) return this._ele;
    await this._perform([
      { type: 'pointerMove', x: pos.x, y: pos.y, duration: 50 },
      { type: 'pointerDown', button: 1 },
      { type: 'pause', duration: 50 },
      { type: 'pointerUp', button: 1 },
    ]);
    return this._ele;
  }

  async by_js() {
    await this._sendJsClickVisual();
    await this._ele._runSafe('(el) => el.click()');
    return this._ele;
  }

  async at(offsetX = 0, offsetY = 0) {
    const loc = await this._ele.location;
    const x = (loc.x || 0) + offsetX;
    const y = (loc.y || 0) + offsetY;
    await this._perform([
      { type: 'pointerMove', x, y, duration: 50 },
      { type: 'pointerDown', button: 0 },
      { type: 'pause', duration: 50 },
      { type: 'pointerUp', button: 0 },
    ]);
    return this._ele;
  }

  async for_new_tab() {
    const browser = this._ele._owner._browser;
    if (!browser) return null;
    const oldTabs = new Set(await browser.tab_ids);
    await this.left();
    for (let i = 0; i < 20; i += 1) {
      await sleep(300);
      const newTabs = [...(await browser.tab_ids)].filter((id) => !oldTabs.has(id));
      if (newTabs.length) return await browser.get_tab(newTabs[0]);
    }
    return null;
  }

  toString() {
    return '<Clicker>';
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toString();
  }
}

/**
 * 与 Python ``Clicker`` 一致：对象本身可调用，``ele.click()`` 等价 ``ele.click(False)`` → 左键。
 * @param {import('../_elements/firefox_element').FirefoxElement} element
 */
function createElementClick(element) {
  const c = new Clicker(element);
  const fn = async (byJs = false) => c.call(byJs);
  fn.left = (...args) => c.left(...args);
  fn.right = () => c.right();
  fn.middle = () => c.middle();
  fn.by_js = () => c.by_js();
  fn.at = (ox, oy) => c.at(ox, oy);
  fn.for_new_tab = () => c.for_new_tab();
  return fn;
}

module.exports = { Clicker, createElementClick };
