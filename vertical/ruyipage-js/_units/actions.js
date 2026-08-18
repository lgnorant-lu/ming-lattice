'use strict';

/**
 * BiDi ``input.performActions`` 动作链（与 Python ``actions.py`` 对齐）。
 * 含指针 / 键盘 / 滚轮与拟人轨迹；``perform`` / ``release_all`` 为异步。
 */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function randInt(a, b) {
  return Math.floor(Math.random() * (b - a + 1)) + a;
}

function randUniform(a, b) {
  return a + Math.random() * (b - a);
}

class Actions {
  constructor(owner) {
    this._owner = owner;
    this._pointer_actions = [];
    this._key_actions = [];
    this._wheel_actions = [];
    this.curr_x = 0;
    this.curr_y = 0;
  }

  _isVisualEnabled() {
    const browser = this._owner && this._owner._browser;
    const options = browser && browser.options;
    return !!(options && options.action_visual_enabled);
  }

  /** @param {object[]} pointerCopy @param {object[]} _keyCopy */
  async _sendVisualData(pointerCopy, _keyCopy) {
    if (!this._isVisualEnabled()) return;
    try {
      const movePoints = [];
      for (const a of pointerCopy) {
        if (a && a.type === 'pointerMove') {
          movePoints.push([Math.trunc(a.x || 0), Math.trunc(a.y || 0)]);
        }
      }
      const clicks = [];
      let lastX = this.curr_x;
      let lastY = this.curr_y;
      for (const a of pointerCopy) {
        if (a && a.type === 'pointerMove') {
          lastX = Math.trunc(a.x != null ? a.x : lastX);
          lastY = Math.trunc(a.y != null ? a.y : lastY);
        } else if (a && a.type === 'pointerDown') {
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
      if (parts.length) await this._owner.run_js(parts.join(';'), { as_expr: true });
    } catch (_) { /* ignore */ }
  }

  /**
   * Python: ``_resolve_position``
   * @param {import('../_elements/firefox_element').FirefoxElement|{x:number,y:number}|number[]|null} eleOrLoc
   * @returns {Promise<[number, number]>}
   */
  async _resolvePosition(eleOrLoc) {
    if (eleOrLoc == null) return [this.curr_x, this.curr_y];
    if (typeof eleOrLoc === 'object' && !Array.isArray(eleOrLoc) && 'x' in eleOrLoc) {
      return [Number(eleOrLoc.x) || 0, Number(eleOrLoc.y) || 0];
    }
    if (Array.isArray(eleOrLoc)) {
      return [Number(eleOrLoc[0]) || 0, Number(eleOrLoc[1]) || 0];
    }
    if (eleOrLoc && typeof eleOrLoc._getCenter === 'function') {
      const pos = await eleOrLoc._getCenter();
      if (pos) return [Number(pos.x) || 0, Number(pos.y) || 0];
    }
    return [this.curr_x, this.curr_y];
  }

  /**
   * Python: ``move_to``
   * @param {import('../_elements/firefox_element').FirefoxElement|{x:number,y:number}|number[]|null} [ele_or_loc]
   * @param {number} [offset_x]
   * @param {number} [offset_y]
   * @param {number} [duration]
   * @param {string} [origin]
   */
  async move_to(ele_or_loc = null, offset_x = 0, offset_y = 0, duration = 100, origin = 'viewport') {
    let [x, y] = await this._resolvePosition(ele_or_loc);
    x += offset_x;
    y += offset_y;
    const action = { type: 'pointerMove', x: Math.trunc(x), y: Math.trunc(y), duration };
    if (origin !== 'viewport') action.origin = origin;
    this._pointer_actions.push(action);
    this.curr_x = x;
    this.curr_y = y;
    return this;
  }

  move(offset_x = 0, offset_y = 0, duration = 100) {
    this.curr_x += offset_x;
    this.curr_y += offset_y;
    this._pointer_actions.push({
      type: 'pointerMove',
      x: Math.trunc(this.curr_x),
      y: Math.trunc(this.curr_y),
      duration,
    });
    return this;
  }

  async click(on_ele = null, times = 1) {
    if (on_ele) await this.move_to(on_ele);
    for (let i = 0; i < times; i += 1) {
      this._pointer_actions.push({ type: 'pointerDown', button: 0 });
      this._pointer_actions.push({ type: 'pause', duration: 50 });
      this._pointer_actions.push({ type: 'pointerUp', button: 0 });
    }
    return this;
  }

  async double_click(on_ele = null) {
    await this.click(on_ele, 2);
    return this;
  }

  async right_click(on_ele = null) {
    if (on_ele) await this.move_to(on_ele);
    this._pointer_actions.push({ type: 'pointerDown', button: 2 });
    this._pointer_actions.push({ type: 'pause', duration: 50 });
    this._pointer_actions.push({ type: 'pointerUp', button: 2 });
    return this;
  }

  async middle_click(on_ele = null) {
    if (on_ele) await this.move_to(on_ele);
    this._pointer_actions.push({ type: 'pointerDown', button: 1 });
    this._pointer_actions.push({ type: 'pause', duration: 50 });
    this._pointer_actions.push({ type: 'pointerUp', button: 1 });
    return this;
  }

  async db_click(on_ele = null) {
    return this.double_click(on_ele);
  }

  async r_click(on_ele = null) {
    return this.right_click(on_ele);
  }

  async hold(on_ele = null, button = 0) {
    if (on_ele) await this.move_to(on_ele);
    this._pointer_actions.push({ type: 'pointerDown', button });
    return this;
  }

  async release(on_ele = null, button = 0) {
    if (on_ele) await this.move_to(on_ele);
    this._pointer_actions.push({ type: 'pointerUp', button });
    return this;
  }

  async drag_to(source, target, duration = 500, steps = 20) {
    const [sx, sy] = await this._resolvePosition(source);
    const [ex, ey] = await this._resolvePosition(target);
    const stepDur = Math.max(1, Math.trunc(duration / steps));

    this._pointer_actions.push({
      type: 'pointerMove',
      origin: 'viewport',
      x: Math.trunc(sx),
      y: Math.trunc(sy),
      duration: 0,
    });
    this._pointer_actions.push({ type: 'pointerDown', button: 0 });
    this._pointer_actions.push({ type: 'pause', duration: 120 });

    for (let i = 1; i <= steps; i += 1) {
      const px = Math.trunc(sx + ((ex - sx) * i) / steps);
      const py = Math.trunc(sy + ((ey - sy) * i) / steps);
      this._pointer_actions.push({
        type: 'pointerMove',
        origin: 'viewport',
        x: px,
        y: py,
        duration: stepDur,
      });
    }

    this._pointer_actions.push({ type: 'pause', duration: 120 });
    this._pointer_actions.push({ type: 'pointerUp', button: 0 });

    this.curr_x = Math.trunc(ex);
    this.curr_y = Math.trunc(ey);
    return this;
  }

  async drag(source, target, duration = 500, steps = 20) {
    return this.drag_to(source, target, duration, steps);
  }

  key_down(key) {
    this._key_actions.push({ type: 'keyDown', value: key });
    return this;
  }

  key_up(key) {
    this._key_actions.push({ type: 'keyUp', value: key });
    return this;
  }

  combo(...keys) {
    for (const k of keys) this._key_actions.push({ type: 'keyDown', value: k });
    for (let i = keys.length - 1; i >= 0; i -= 1) {
      this._key_actions.push({ type: 'keyUp', value: keys[i] });
    }
    return this;
  }

  type(text, interval = 0) {
    const s = String(text);
    for (let idx = 0; idx < s.length; idx += 1) {
      const char = s[idx];
      this._key_actions.push({ type: 'keyDown', value: char });
      if (interval) this._key_actions.push({ type: 'pause', duration: interval });
      this._key_actions.push({ type: 'keyUp', value: char });
    }
    return this;
  }

  press(key) {
    this._key_actions.push({ type: 'keyDown', value: key });
    this._key_actions.push({ type: 'keyUp', value: key });
    return this;
  }

  scroll(delta_x = 0, delta_y = 0, on_ele = null, origin = 'viewport') {
    if (on_ele != null) return this._scrollAsync(delta_x, delta_y, on_ele, origin);
    let x = this.curr_x;
    let y = this.curr_y;
    const action = {
      type: 'scroll',
      x: Math.trunc(x),
      y: Math.trunc(y),
      deltaX: Math.trunc(delta_x),
      deltaY: Math.trunc(delta_y),
    };
    if (origin !== 'viewport') action.origin = origin;
    this._wheel_actions.push(action);
    return this;
  }

  async _scrollAsync(delta_x, delta_y, on_ele, origin) {
    const [x, y] = await this._resolvePosition(on_ele);
    const action = {
      type: 'scroll',
      x: Math.trunc(x),
      y: Math.trunc(y),
      deltaX: Math.trunc(delta_x),
      deltaY: Math.trunc(delta_y),
    };
    if (origin !== 'viewport') action.origin = origin;
    this._wheel_actions.push(action);
    return this;
  }

  wait(seconds) {
    const ms = Math.max(0, Math.floor(Number(seconds) * 1000));
    this._pointer_actions.push({ type: 'pause', duration: ms });
    this._key_actions.push({ type: 'pause', duration: ms });
    return this;
  }

  async perform() {
    const pointerCopy = this._pointer_actions.slice();
    const keyCopy = this._key_actions.slice();

    const actions = [];
    if (this._pointer_actions.length) {
      actions.push({
        type: 'pointer',
        id: 'mouse0',
        parameters: { pointerType: 'mouse' },
        actions: this._pointer_actions.slice(),
      });
    }
    if (this._key_actions.length) {
      actions.push({
        type: 'key',
        id: 'keyboard0',
        actions: this._key_actions.slice(),
      });
    }
    if (this._wheel_actions.length) {
      actions.push({
        type: 'wheel',
        id: 'wheel0',
        actions: this._wheel_actions.slice(),
      });
    }

    if (actions.length) {
      await this._owner._driver._browser_driver.run('input.performActions', {
        context: this._owner._context_id,
        actions,
      });
    }

    this._pointer_actions = [];
    this._key_actions = [];
    this._wheel_actions = [];

    await this._sendVisualData(pointerCopy, keyCopy);
    return this._owner;
  }

  async release_all() {
    await this._owner._driver._browser_driver.run('input.releaseActions', {
      context: this._owner._context_id,
    });
    return this._owner;
  }

  // ---------- 拟人轨迹辅助（与 Python 同名算法对齐）----------

  _lerp(a, b, t) {
    return a + (b - a) * t;
  }

  _lerpPt(p0, p1, t) {
    return [this._lerp(p0[0], p1[0], t), this._lerp(p0[1], p1[1], t)];
  }

  _bezierQ(p0, p1, p2, t) {
    const s = 1 - t;
    const x = s * s * p0[0] + 2 * s * t * p1[0] + t * t * p2[0];
    const y = s * s * p0[1] + 2 * s * t * p1[1] + t * t * p2[1];
    return [x, y];
  }

  _controlPointArc(start, end, curvature = 0.75) {
    const mx = (start[0] + end[0]) / 2.0;
    const my = (start[1] + end[1]) / 2.0;
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const dist = Math.hypot(dx, dy) || 1.0;
    const nx = -dy / dist;
    const ny = dx / dist;
    const offset = dist * curvature * (Math.random() < 0.5 ? -1 : 1);
    return [mx + nx * offset, my + ny * offset];
  }

  _arcPath(start, end, steps, curvature, oversample, ctrl = null) {
    const c = ctrl == null ? this._controlPointArc(start, end, curvature) : ctrl;
    const path = [];
    for (let i = 0; i <= steps * oversample; i += 1) {
      const t = i / (steps * oversample);
      path.push(this._bezierQ(start, c, end, t));
    }
    return path;
  }

  _linePath(start, end, steps, oversample) {
    const path = [];
    for (let i = 0; i <= steps * oversample; i += 1) {
      const t = i / (steps * oversample);
      path.push(this._lerpPt(start, end, t));
    }
    return path;
  }

  _smoothSeries(n, sigma, smoothK) {
    const raw = [];
    for (let i = 0; i < n; i += 1) raw.push((Math.random() * 2 - 1) * sigma);
    if (smoothK <= 1) return raw;
    const smoothed = [];
    for (let i = 0; i < n; i += 1) {
      const window = [];
      for (let j = Math.max(0, i - smoothK + 1); j < Math.min(n, i + smoothK); j += 1) {
        window.push(raw[j]);
      }
      smoothed.push(window.reduce((a, b) => a + b, 0) / window.length);
    }
    return smoothed;
  }

  _applyJitter(path, maxNorm = 5.0, maxTan = 2.5) {
    if (path.length < 2) return path;
    const n = path.length;
    const normJitter = this._smoothSeries(n, maxNorm / 2.5, Math.max(1, Math.trunc(n / 8)));
    const tanJitter = this._smoothSeries(n, maxTan / 2.5, Math.max(1, Math.trunc(n / 8)));
    const result = [];
    for (let i = 0; i < n; i += 1) {
      const px = path[i][0];
      const py = path[i][1];
      if (i === 0 || i === n - 1) {
        result.push([px, py]);
        continue;
      }
      const dx = path[i][0] - path[i - 1][0];
      const dy = path[i][1] - path[i - 1][1];
      const dist = Math.hypot(dx, dy) || 1.0;
      const tx = -dy / dist;
      const ty = dx / dist;
      const nx = dx / dist;
      const ny = dy / dist;
      const jx = tx * normJitter[i] + nx * tanJitter[i];
      const jy = ty * normJitter[i] + ny * tanJitter[i];
      result.push([px + jx, py + jy]);
    }
    return result;
  }

  _concatPaths(seg1, seg2) {
    if (seg1.length && seg2.length) return seg1.slice(0, -1).concat(seg2);
    return seg1.length ? seg1 : seg2;
  }

  _overshootPoint(start, end) {
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const dist = Math.hypot(dx, dy) || 1.0;
    const overshootRatio = randUniform(0.08, 0.18);
    return [end[0] + (dx / dist) * dist * overshootRatio, end[1] + (dy / dist) * dist * overshootRatio];
  }

  _returnArcCtrl(overshoot, target) {
    const mx = (overshoot[0] + target[0]) / 2.0;
    const my = (overshoot[1] + target[1]) / 2.0;
    const dx = target[0] - overshoot[0];
    const dy = target[1] - overshoot[1];
    const dist = Math.hypot(dx, dy) || 1.0;
    const nx = -dy / dist;
    const ny = dx / dist;
    const offset = dist * randUniform(0.3, 0.6) * (Math.random() < 0.5 ? -1 : 1);
    return [mx + nx * offset, my + ny * offset];
  }

  /**
   * Python: ``human_move``
   * @param {import('../_elements/firefox_element').FirefoxElement|{x:number,y:number}|number[]} ele_or_loc
   * @param {'line'|'arc'|'line_then_arc'|'line_overshoot_arc_back'|null} [style]
   */
  async human_move(ele_or_loc, style = null) {
    const [targetX, targetY] = await this._resolvePosition(ele_or_loc);
    let startX = this.curr_x;
    let startY = this.curr_y;

    const states = ele_or_loc && typeof ele_or_loc === 'object' && ele_or_loc.states;
    if (states && 'is_whole_in_viewport' in states) {
      try {
        let inVp = /** @type {any} */ (states).is_whole_in_viewport;
        if (typeof inVp === 'object' && inVp != null && typeof inVp.then === 'function') inVp = await inVp;
        if (inVp === false) {
          await this._owner.scroll.to_see(ele_or_loc, true);
          await sleep(randUniform(100, 200));
        }
      } catch (_) { /* ignore */ }
    }

    const dist = Math.hypot(targetX - startX, targetY - startY) || 1.0;
    let path;

    if (dist <= 140) {
      const steps = Math.max(6, Math.min(14, Math.round(dist / randUniform(12.0, 20.0))));
      const oversample = randInt(2, 3);
      const slightCurve = Math.random() < 0.35;
      const curvature = randUniform(0.2, 0.45);
      let rawPath;
      if (slightCurve) {
        rawPath = this._arcPath([startX, startY], [targetX, targetY], steps, curvature, oversample);
      } else {
        rawPath = this._linePath([startX, startY], [targetX, targetY], steps, oversample);
      }
      path = this._applyJitter(
        rawPath,
        Math.min(2.2, Math.max(0.6, dist * 0.008)),
        Math.min(1.2, Math.max(0.3, dist * 0.004)),
      );
    } else {
      const steps = Math.max(12, Math.min(52, Math.round(dist / randUniform(10.0, 22.0))));
      const oversample = randInt(3, 4);
      const curvature = randUniform(0.55, 0.82);
      let sty = style;
      if (sty == null) {
        const styles = ['line_then_arc', 'line', 'arc', 'line_overshoot_arc_back'];
        const weights = [0.4, 0.22, 0.28, 0.1];
        const r = Math.random();
        let acc = 0;
        for (let i = 0; i < styles.length; i += 1) {
          acc += weights[i];
          if (r <= acc) {
            sty = /** @type {any} */ (styles[i]);
            break;
          }
        }
        if (sty == null) sty = 'line';
      }
      let rawPath;
      if (sty === 'line_then_arc') {
        const ratio = randUniform(0.45, 0.75);
        const mid = this._lerpPt([startX, startY], [targetX, targetY], ratio);
        const seg1 = this._linePath([startX, startY], mid, Math.max(2, Math.trunc(steps * ratio)), oversample);
        const seg2 = this._arcPath(
          mid,
          [targetX, targetY],
          Math.max(2, steps - Math.trunc(steps * ratio)),
          curvature,
          oversample,
        );
        rawPath = this._concatPaths(seg1, seg2);
      } else if (sty === 'line') {
        rawPath = this._linePath([startX, startY], [targetX, targetY], steps, oversample);
      } else if (sty === 'arc') {
        rawPath = this._arcPath([startX, startY], [targetX, targetY], steps, curvature, oversample);
      } else {
        const ovp = this._overshootPoint([startX, startY], [targetX, targetY]);
        const seg1 = this._linePath([startX, startY], ovp, Math.max(2, Math.trunc(steps * 0.55)), oversample);
        const ctrl = this._returnArcCtrl(ovp, [targetX, targetY]);
        const seg2 = this._arcPath(
          ovp,
          [targetX, targetY],
          Math.max(2, steps - Math.trunc(seg1.length / Math.max(1, oversample))),
          curvature,
          oversample,
          ctrl,
        );
        rawPath = this._concatPaths(seg1, seg2);
      }
      path = Math.random() < 0.75
        ? this._applyJitter(
          rawPath,
          Math.min(7.5, Math.max(2.5, dist * randUniform(0.006, 0.011))),
          Math.min(4.0, Math.max(1.2, dist * randUniform(0.003, 0.008))),
        )
        : rawPath;
    }

    for (const [px, py] of path) {
      this._pointer_actions.push({
        type: 'pointerMove',
        x: Math.trunc(px),
        y: Math.trunc(py),
        duration: randInt(8, 20),
      });
    }
    const hoverN = randInt(2, 4);
    for (let h = 0; h < hoverN; h += 1) {
      this._pointer_actions.push({
        type: 'pointerMove',
        x: Math.trunc(targetX + randInt(-2, 2)),
        y: Math.trunc(targetY + randInt(-1, 1)),
        duration: randInt(20, 50),
      });
    }
    this._pointer_actions.push({
      type: 'pointerMove',
      x: Math.trunc(targetX),
      y: Math.trunc(targetY),
      duration: randInt(15, 30),
    });

    this.curr_x = targetX;
    this.curr_y = targetY;
    return this;
  }

  /**
   * Python: ``human_click``
   * @param {import('../_elements/firefox_element').FirefoxElement|null} [on_ele]
   * @param {'left'|'middle'|'right'} [button]
   */
  async human_click(on_ele = null, button = 'left') {
    if (on_ele) await this.human_move(on_ele);
    this.wait(randUniform(0.05, 0.15));
    const buttonMap = { left: 0, middle: 1, right: 2 };
    const btn = buttonMap[button] != null ? buttonMap[button] : 0;
    this._pointer_actions.push({ type: 'pointerDown', button: btn });
    this._pointer_actions.push({ type: 'pause', duration: randInt(40, 90) });
    this._pointer_actions.push({ type: 'pointerUp', button: btn });
    return this;
  }

  /**
   * Python: ``human_type``
   * @param {string} text
   * @param {number} [min_delay] 秒
   * @param {number} [max_delay] 秒
   */
  human_type(text, min_delay = 0.045, max_delay = 0.24) {
    const s = String(text);
    for (let i = 0; i < s.length; i += 1) {
      const char = s[i];
      this._key_actions.push({ type: 'keyDown', value: char });
      const interval = Math.trunc(randUniform(min_delay, max_delay) * 1000);
      if (interval > 0) this._key_actions.push({ type: 'pause', duration: interval });
      this._key_actions.push({ type: 'keyUp', value: char });
    }
    return this;
  }

  toString() {
    return '<Actions>';
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toString();
  }
}

module.exports = { Actions };
