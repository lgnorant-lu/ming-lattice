'use strict';

/**
 * W3C WebDriver BiDi input 模块 — 与 Python ``ruyipage._bidi.input_`` 行为对齐的完整移植。
 * @see ruyipage/ruyipage/_bidi/input_.py
 */

// ── 随机（对齐 CPython random 的用法，非比特级相同）────────────────────────

function _random() {
  return Math.random();
}

function _uniform(a, b) {
  return _random() * (b - a) + a;
}

function _randint(a, b) {
  return Math.floor(_random() * (b - a + 1)) + a;
}

function _choice(arr) {
  return arr[Math.floor(_random() * arr.length)];
}

let _gaussSpare = null;

/** 近似 ``random.gauss(mu, sigma)``（Box–Muller） */
function _gauss(mu, sigma) {
  if (_gaussSpare != null) {
    const z = _gaussSpare;
    _gaussSpare = null;
    return mu + sigma * z;
  }
  let u = 0;
  let v = 0;
  while (u === 0) u = _random();
  while (v === 0) v = _random();
  const mag = Math.sqrt(-2.0 * Math.log(u));
  const z0 = mag * Math.cos(2.0 * Math.PI * v);
  const z1 = mag * Math.sin(2.0 * Math.PI * v);
  _gaussSpare = z1;
  return mu + sigma * z0;
}

// ── 轨迹算法（与 Python 同名函数一致）────────────────────────────────────

function _easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

function _easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function _lerp(a, b, t) {
  return a + (b - a) * t;
}

function _lerpPt(p0, p1, t) {
  return [_lerp(p0[0], p1[0], t), _lerp(p0[1], p1[1], t)];
}

function _bezierQ(p0, p1, p2, t) {
  const u = 1 - t;
  return [
    u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
    u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
  ];
}

function _ctrlArc(start, end, curvature = 0.75) {
  const [sx, sy] = start;
  const [ex, ey] = end;
  const dx = ex - sx;
  const dy = ey - sy;
  const dist = Math.hypot(dx, dy) || 1.0;
  const mx = (sx + ex) * 0.5;
  const my = (sy + ey) * 0.5;
  const nx = -dy / dist;
  const ny = dx / dist;
  const side = _choice([-1.0, 1.0]);
  const offset = Math.max(
    60.0,
    Math.min(dist * curvature + _uniform(-0.12, 0.12) * dist * curvature, 520.0)
  );
  return [mx + nx * offset * side, my + ny * offset * side];
}

function _arcPath(start, end, steps, curvature = 0.75, oversample = 4, ctrl = null) {
  const c = ctrl || _ctrlArc(start, end, curvature);
  const total = Math.max(steps * oversample, steps);
  const out = [];
  for (let i = 1; i <= total; i += 1) {
    out.push(_bezierQ(start, c, end, _easeOutCubic(i / total)));
  }
  return out;
}

function _linePath(start, end, steps, oversample = 4, ease = null) {
  const e = ease || _easeInOutQuad;
  const total = Math.max(steps * oversample, steps);
  const out = [];
  for (let i = 1; i <= total; i += 1) {
    out.push(_lerpPt(start, end, e(i / total)));
  }
  return out;
}

function _smoothSeries(n, sigma, smoothK) {
  let x = 0.0;
  const raw = [];
  for (let i = 0; i < n; i += 1) {
    x += _gauss(0, sigma);
    raw.push(x);
  }
  if (smoothK <= 1) return raw;
  const win = Math.max(1, Math.floor(smoothK));
  let acc = 0;
  for (let i = 0; i < win && i < n; i += 1) acc += raw[i];
  const out = [acc / win];
  for (let i = win; i < n; i += 1) {
    acc += raw[i] - raw[i - win];
    out.push(acc / win);
  }
  const pad = n - out.length;
  return [...Array(pad).fill(out[0]), ...out];
}

function _applyJitter(path, maxNorm = 6.0, maxTan = 3.0, keepEnd = 6, keepStart = 6) {
  const n = path.length;
  if (n < 3) return path;
  const tangents = [];
  for (let i = 0; i < n; i += 1) {
    let d;
    if (i === 0) {
      d = [path[1][0] - path[0][0], path[1][1] - path[0][1]];
    } else if (i === n - 1) {
      d = [path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]];
    } else {
      d = [path[i + 1][0] - path[i - 1][0], path[i + 1][1] - path[i - 1][1]];
    }
    const dl = Math.hypot(d[0], d[1]) || 1.0;
    const tx = d[0] / dl;
    const ty = d[1] / dl;
    tangents.push([tx, ty, -ty, tx]);
  }
  const tanN = _smoothSeries(n, 0.55, Math.max(5, Math.floor(n / 30)));
  const norN = _smoothSeries(n, 0.9, Math.max(6, Math.floor(n / 28)));
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const [px, py] = path[i];
    const t = i / (n - 1);
    const edge = (0.5 - Math.abs(t - 0.5)) / 0.5;
    let w;
    if (i < keepStart) w = i / keepStart;
    else if (i > n - keepEnd - 1) w = (n - 1 - i) / keepEnd;
    else w = 1.0;
    w = Math.max(0.0, Math.min(1.0, 0.35 + 0.65 * edge)) * w;
    const [tx, ty, nx, ny] = tangents[i];
    out.push([
      px + tx * tanN[i] * maxTan * w + nx * norN[i] * maxNorm * w,
      py + ty * tanN[i] * maxTan * w + ny * norN[i] * maxNorm * w,
    ]);
  }
  return out;
}

function _overshootPt(start, end) {
  const [sx, sy] = start;
  const [ex, ey] = end;
  const dx = ex - sx;
  const dy = ey - sy;
  const dist = Math.hypot(dx, dy) || 1.0;
  const ux = dx / dist;
  const uy = dy / dist;
  const px = Math.max(24.0, Math.min(dist * _uniform(0.10, 0.25), 180.0));
  return [ex + ux * px, ey + uy * px];
}

function _concat(...segs) {
  const out = [];
  for (const seg of segs) {
    if (!seg || !seg.length) continue;
    if (out.length && seg.length && out[out.length - 1][0] === seg[0][0] && out[out.length - 1][1] === seg[0][1]) {
      out.push(...seg.slice(1));
    } else {
      out.push(...seg);
    }
  }
  return out;
}

// ── 公开 API ─────────────────────────────────────────────────────────────

function buildHumanMousePath(start, end) {
  const [sx, sy] = start;
  const [ex, ey] = end;
  const dist = Math.hypot(ex - sx, ey - sy) || 1.0;
  const steps = Math.floor(Math.max(12, Math.min(52, Math.round(dist / _uniform(10, 22)))));
  const oversample = _randint(3, 4);
  const curvature = _uniform(0.55, 0.82);

  const styles = ['line_then_arc', 'line', 'arc', 'line_overshoot_arc_back'];
  const weights = [0.40, 0.22, 0.28, 0.10];
  const r = _random();
  let acc = 0.0;
  let style = styles[styles.length - 1];
  for (let i = 0; i < styles.length; i += 1) {
    acc += weights[i];
    if (r <= acc) {
      style = styles[i];
      break;
    }
  }

  let raw;
  if (style === 'line_then_arc') {
    const ratio = _uniform(0.45, 0.75);
    const mid = _lerpPt(start, end, ratio);
    raw = _concat(
      _linePath(start, mid, Math.max(2, Math.floor(steps * ratio)), oversample),
      _arcPath(mid, end, Math.max(2, steps - Math.floor(steps * ratio)), curvature, oversample)
    );
  } else if (style === 'line') {
    raw = _linePath(start, end, steps, oversample);
  } else if (style === 'arc') {
    raw = _arcPath(start, end, steps, curvature, oversample);
  } else {
    const ovp = _overshootPt(start, end);
    const ctrl = _ctrlArc(ovp, end, 0.9);
    raw = _concat(
      _linePath(start, ovp, Math.max(2, Math.floor(steps * 0.55)), oversample),
      _arcPath(ovp, end, Math.max(2, steps - Math.floor(steps * 0.55)), curvature, oversample, ctrl)
    );
  }

  const maxNorm = Math.min(7.5, Math.max(2.5, dist * _uniform(0.006, 0.011)));
  const maxTan = Math.min(4.0, Math.max(1.2, dist * _uniform(0.003, 0.008)));
  return _random() < 0.75 ? _applyJitter(raw, maxNorm, maxTan) : raw;
}

function buildHumanClickActions(tx, ty, sx = null, sy = null) {
  let startX = sx;
  let startY = sy;
  if (startX == null) startX = _randint(100, 900);
  if (startY == null) startY = _randint(100, 600);

  const path = buildHumanMousePath([startX, startY], [tx, ty]);
  const acts = [{ type: 'pointerMove', x: Math.floor(startX), y: Math.floor(startY), duration: 0 }];

  let prevX = startX;
  let prevY = startY;
  for (const [px, py] of path) {
    const bx = Math.floor(px);
    const by = Math.floor(py);
    const d = Math.hypot(bx - prevX, by - prevY);
    acts.push({
      type: 'pointerMove',
      x: bx,
      y: by,
      duration: Math.max(8, Math.floor(d * _uniform(1.5, 3.0))),
    });
    prevX = bx;
    prevY = by;
  }

  for (let i = 0; i < _randint(2, 4); i += 1) {
    acts.push({
      type: 'pointerMove',
      x: tx + _randint(-2, 2),
      y: ty + _randint(-1, 1),
      duration: _randint(20, 50),
    });
  }
  acts.push({ type: 'pointerMove', x: tx, y: ty, duration: _randint(15, 30) });
  acts.push({ type: 'pause', duration: _randint(80, 300) });
  acts.push({ type: 'pointerDown', button: 0 });
  acts.push({ type: 'pause', duration: _randint(80, 180) });
  acts.push({ type: 'pointerUp', button: 0 });
  acts.push({
    type: 'pointerMove',
    x: tx + _randint(5, 20),
    y: ty + _randint(-5, 5),
    duration: _randint(80, 150),
  });

  return [{
    type: 'pointer',
    id: 'mouse0',
    parameters: { pointerType: 'mouse' },
    actions: acts,
  }];
}

function performActions(driver, context, actions) {
  return driver.run('input.performActions', { context, actions });
}

function releaseActions(driver, context) {
  return driver.run('input.releaseActions', { context });
}

function setFiles(driver, context, element, files) {
  return driver.run('input.setFiles', { context, element, files });
}

function buildPenAction(x, y, {
  pressure = 0.5,
  tilt_x: tiltX = 0,
  tilt_y: tiltY = 0,
  twist = 0,
  tangential_pressure: tangentialPressure = 0.0,
  button = 0,
  duration = 50,
  altitude_angle: altitudeAngle = null,
  azimuth_angle: azimuthAngle = null,
  width = null,
  height = null,
} = {}) {
  const moveAction = {
    type: 'pointerMove',
    x,
    y,
    duration,
    pressure,
    tiltX,
    tiltY,
    twist,
    tangentialPressure,
  };
  const downAction = {
    type: 'pointerDown',
    button,
    pressure,
    tiltX,
    tiltY,
  };
  if (altitudeAngle != null) {
    moveAction.altitudeAngle = altitudeAngle;
    downAction.altitudeAngle = altitudeAngle;
  }
  if (azimuthAngle != null) {
    moveAction.azimuthAngle = azimuthAngle;
    downAction.azimuthAngle = azimuthAngle;
  }
  if (width != null) moveAction.width = width;
  if (height != null) moveAction.height = height;

  return [{
    type: 'pointer',
    id: 'pen0',
    parameters: { pointerType: 'pen' },
    actions: [
      moveAction,
      downAction,
      { type: 'pointerUp', button },
    ],
  }];
}

function buildKeyAction(keys) {
  const acts = [];
  if (typeof keys === 'string') {
    for (const ch of keys) {
      acts.push({ type: 'keyDown', value: ch });
      acts.push({ type: 'keyUp', value: ch });
    }
  } else {
    for (const item of keys) {
      if (Array.isArray(item)) {
        const [mod, key] = item;
        acts.push({ type: 'keyDown', value: mod });
        acts.push({ type: 'keyDown', value: key });
        acts.push({ type: 'keyUp', value: key });
        acts.push({ type: 'keyUp', value: mod });
      } else {
        acts.push({ type: 'keyDown', value: item });
        acts.push({ type: 'keyUp', value: item });
      }
    }
  }
  return [{ type: 'key', id: 'kbd0', actions: acts }];
}

function buildWheelAction(x, y, {
  delta_x: deltaX = 0,
  delta_y: deltaY = 120,
  delta_z: deltaZ = 0,
  delta_mode: deltaMode = 0,
  duration = 0,
  origin = 'viewport',
} = {}) {
  const action = {
    type: 'scroll',
    x,
    y,
    deltaX,
    deltaY,
  };
  if (deltaZ !== 0) action.deltaZ = deltaZ;
  if (deltaMode !== 0) action.deltaMode = deltaMode;
  if (duration !== 0) action.duration = duration;
  if (origin !== 'viewport') action.origin = origin;

  return [{
    type: 'wheel',
    id: 'wheel0',
    actions: [action],
  }];
}

// 蛇形导出：兼容旧 ``input_commands`` 与 Python 命名习惯
module.exports = {
  build_human_mouse_path: buildHumanMousePath,
  build_human_click_actions: buildHumanClickActions,
  perform_actions: performActions,
  release_actions: releaseActions,
  set_files: setFiles,
  build_pen_action: buildPenAction,
  build_key_action: buildKeyAction,
  build_wheel_action: buildWheelAction,
  // camelCase 别名
  buildHumanMousePath,
  buildHumanClickActions,
  performActions,
  releaseActions,
  setFiles,
  buildPenAction,
  buildKeyAction,
  buildWheelAction,
};
