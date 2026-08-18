'use strict';

/**
 * 键盘特殊键值常量。
 *
 * 定义 W3C WebDriver 规范中的所有特殊键值 Unicode 码点。
 * 这些常量用于 Actions 动作链中的键盘操作。
 *
 * 用法:
 *   const { Keys } = require('ruyipage-js');
 *
 *   // 组合键
 *   await page.actions.combo(Keys.CTRL, 'a').perform();       // Ctrl+A 全选
 *   await page.actions.combo(Keys.CTRL, 'c').perform();       // Ctrl+C 复制
 *
 *   // 单独按键
 *   await page.actions.press(Keys.ENTER).perform();           // 按 Enter
 */

const Keys = Object.freeze({
  NULL: '\uE000',
  CANCEL: '\uE001',
  HELP: '\uE002',
  BACKSPACE: '\uE003',
  BACK_SPACE: '\uE003',
  TAB: '\uE004',
  CLEAR: '\uE005',
  RETURN: '\uE006',
  ENTER: '\uE007',

  SHIFT: '\uE008',
  CONTROL: '\uE009',
  CTRL: '\uE009',
  ALT: '\uE00A',
  META: '\uE03D',
  COMMAND: '\uE03D',

  PAUSE: '\uE00B',
  ESCAPE: '\uE00C',
  ESC: '\uE00C',
  SPACE: '\uE00D',

  PAGE_UP: '\uE00E',
  PAGE_DOWN: '\uE00F',
  END: '\uE010',
  HOME: '\uE011',

  LEFT: '\uE012',
  ARROW_LEFT: '\uE012',
  UP: '\uE013',
  ARROW_UP: '\uE013',
  RIGHT: '\uE014',
  ARROW_RIGHT: '\uE014',
  DOWN: '\uE015',
  ARROW_DOWN: '\uE015',

  INSERT: '\uE016',
  DELETE: '\uE017',

  SEMICOLON: '\uE018',
  EQUALS: '\uE019',

  NUMPAD0: '\uE01A',
  NUMPAD1: '\uE01B',
  NUMPAD2: '\uE01C',
  NUMPAD3: '\uE01D',
  NUMPAD4: '\uE01E',
  NUMPAD5: '\uE01F',
  NUMPAD6: '\uE020',
  NUMPAD7: '\uE021',
  NUMPAD8: '\uE022',
  NUMPAD9: '\uE023',
  MULTIPLY: '\uE024',
  ADD: '\uE025',
  SEPARATOR: '\uE026',
  SUBTRACT: '\uE027',
  DECIMAL: '\uE028',
  DIVIDE: '\uE029',

  F1: '\uE031',
  F2: '\uE032',
  F3: '\uE033',
  F4: '\uE034',
  F5: '\uE035',
  F6: '\uE036',
  F7: '\uE037',
  F8: '\uE038',
  F9: '\uE039',
  F10: '\uE03A',
  F11: '\uE03B',
  F12: '\uE03C',
});

module.exports = { Keys };
