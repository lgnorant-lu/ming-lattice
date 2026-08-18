'use strict';

/**
 * 定位器解析 - 将定位器字符串转换为 BiDi locator 字典
 */

const { LocatorError } = require('../errors');

/**
 * 解析定位器字符串为 BiDi locator 字典
 *
 * 支持的格式:
 *   '#id'                   -> CSS: #id
 *   '.class'                -> CSS: .class
 *   '@attr=val'             -> CSS: [attr='val']
 *   '@attr'                 -> CSS: [attr]
 *   '@@attr1=v1@@attr2=v2'  -> CSS: [attr1='v1'][attr2='v2']
 *   'tag:div'               -> CSS: div
 *   'tag:div@class=foo'     -> CSS: div[class='foo']
 *   'tag:div@@a=1@@b=2'     -> CSS: div[a='1'][b='2']
 *   'text:hello'            -> innerText 包含匹配
 *   'text=exact'            -> innerText 精确匹配
 *   'xpath://...'           -> XPath
 *   'x://...'               -> XPath (简写)
 *   'css:selector'          -> CSS
 *   'c:selector'            -> CSS (简写)
 *   ['css', 'selector']     -> CSS (数组形式)
 *   ['xpath', '//...']      -> XPath (数组形式)
 *   纯文字 'hello world'    -> innerText 包含匹配
 *
 * @param {string|Array} locator - 定位器字符串或数组
 * @returns {object} BiDi locator 字典, 如 { type: 'css', value: '#myid' }
 */
function parse_locator(locator) {
  // 数组形式 [type, value]
  if (Array.isArray(locator)) {
    if (locator.length !== 2) {
      throw new LocatorError(`数组定位器必须是 [type, value] 格式: ${locator}`);
    }
    const [loc_type, loc_value] = locator;
    const type_map = {
      'css': 'css', 'cssselector': 'css',
      'xpath': 'xpath',
      'text': 'innerText', 'inner_text': 'innerText', 'innertext': 'innerText',
      'accessibility': 'accessibility',
    };
    const bidi_type = type_map[loc_type.toLowerCase().replace(/\s+/g, '')];
    if (bidi_type == null) {
      throw new LocatorError(`不支持的定位器类型: ${loc_type}`);
    }
    if (bidi_type === 'accessibility') {
      if (typeof loc_value === 'object' && loc_value !== null) {
        return { type: 'accessibility', value: loc_value };
      }
      return { type: 'accessibility', value: { name: loc_value } };
    }
    return { type: bidi_type, value: loc_value };
  }

  if (typeof locator !== 'string') {
    throw new LocatorError(`定位器必须是字符串或数组: ${typeof locator}`);
  }

  locator = locator.trim();
  if (!locator) {
    throw new LocatorError('定位器不能为空');
  }

  // CSS 前缀
  if (locator.startsWith('css:')) {
    return { type: 'css', value: locator.slice(4).trim() };
  }
  if (locator.startsWith('c:')) {
    return { type: 'css', value: locator.slice(2).trim() };
  }

  // XPath 前缀
  if (locator.startsWith('xpath:')) {
    return { type: 'xpath', value: locator.slice(6).trim() };
  }
  if (locator.startsWith('x:')) {
    return { type: 'xpath', value: locator.slice(2).trim() };
  }

  // XPath 自动检测: 以 / 或 ./ 或 ( 开头
  if (locator.startsWith('/') || locator.startsWith('./') || locator.startsWith('(')) {
    return { type: 'xpath', value: locator };
  }

  // text 精确匹配
  if (locator.startsWith('text=')) {
    return { type: 'innerText', value: locator.slice(5), matchType: 'full' };
  }

  // text 包含匹配
  if (locator.startsWith('text:')) {
    return { type: 'innerText', value: locator.slice(5) };
  }

  // CSS ID
  if (locator.startsWith('#')) {
    return { type: 'css', value: locator };
  }

  // CSS class
  if (locator.startsWith('.') && !locator.startsWith('./')) {
    return { type: 'css', value: locator };
  }

  // tag 标签名
  if (locator.startsWith('tag:')) {
    return _parse_tag_locator(locator.slice(4));
  }

  // 多属性 @@attr1=v1@@attr2=v2
  if (locator.startsWith('@@')) {
    return _parse_multi_attr(locator, '');
  }

  // 单属性 @attr=val 或 @attr
  if (locator.startsWith('@')) {
    return _parse_single_attr(locator.slice(1), '');
  }

  // 已经是 CSS 选择器的复杂形式
  if (_looks_like_css_selector(locator)) {
    return { type: 'css', value: locator };
  }

  // 默认：当作文本包含匹配
  return { type: 'innerText', value: locator };
}

/**
 * 解析 tag:tagname@attr=val 或 tag:tagname@@a=1@@b=2 格式
 */
function _parse_tag_locator(tag_and_rest) {
  const double_at = tag_and_rest.indexOf('@@');
  const single_at = tag_and_rest.indexOf('@');

  if (double_at >= 0 && (single_at < 0 || double_at <= single_at)) {
    const tag = tag_and_rest.slice(0, double_at).trim();
    return _parse_multi_attr(tag_and_rest.slice(double_at), tag);
  } else if (single_at >= 0) {
    const tag = tag_and_rest.slice(0, single_at).trim();
    return _parse_single_attr(tag_and_rest.slice(single_at + 1), tag);
  } else {
    const tag = tag_and_rest.trim();
    return { type: 'css', value: tag };
  }
}

/**
 * 解析 attr=val 或 attr 格式
 */
function _parse_single_attr(attr_str, tag = '') {
  if (attr_str.includes('=')) {
    const idx = attr_str.indexOf('=');
    const attr = attr_str.slice(0, idx).trim();
    const val = attr_str.slice(idx + 1).trim();

    if (attr === 'text()') {
      if (tag) {
        return {
          type: 'xpath',
          value: `//${tag || '*'}[contains(text(), "${val}")]`,
        };
      }
      return { type: 'innerText', value: val };
    }

    const css = `${tag}[${attr}='${_css_escape_value(val)}']`;
    return { type: 'css', value: css };
  } else {
    const attr = attr_str.trim();
    const css = `${tag}[${attr}]`;
    return { type: 'css', value: css };
  }
}

/**
 * 解析 @@attr1=v1@@attr2=v2 格式
 */
function _parse_multi_attr(locator_str, tag = '') {
  const parts = locator_str.split('@@').filter(p => p);

  const css_attrs = [];
  let has_text = false;
  let text_val = '';

  for (const part of parts) {
    if (part.includes('=')) {
      const idx = part.indexOf('=');
      const attr = part.slice(0, idx).trim();
      const val = part.slice(idx + 1).trim();

      if (attr === 'text()') {
        has_text = true;
        text_val = val;
      } else {
        css_attrs.push(`[${attr}='${_css_escape_value(val)}']`);
      }
    } else {
      css_attrs.push(`[${part.trim()}]`);
    }
  }

  if (has_text) {
    const xpath_parts = [];
    for (const part of parts) {
      if (part.includes('=')) {
        const idx = part.indexOf('=');
        const attr = part.slice(0, idx).trim();
        const val = part.slice(idx + 1).trim();
        if (attr === 'text()') {
          xpath_parts.push(`contains(text(), "${val}")`);
        } else {
          xpath_parts.push(`@${attr}="${val}"`);
        }
      } else {
        xpath_parts.push(`@${part.trim()}`);
      }
    }

    const xpath = `//${tag || '*'}[${xpath_parts.join(' and ')}]`;
    return { type: 'xpath', value: xpath };
  }

  const css = `${tag}${css_attrs.join('')}`;
  return { type: 'css', value: css };
}

/**
 * 转义 CSS 属性值中的特殊字符
 */
function _css_escape_value(val) {
  return val.replace(/'/g, "\\'").replace(/"/g, '\\"');
}

/**
 * 判断字符串是否看起来像 CSS 选择器
 */
function _looks_like_css_selector(s) {
  const css_patterns = [
    /^\[/,          // [attr] 或 [attr="value"]
    /^\w+\[/,       // tag[attr]
    /^\w+\s*>/,     // tag >
    /^\w+\s*\+/,    // tag +
    /^\w+\s*~/,     // tag ~
    /^\*/,          // *
    /^\w+:/,        // tag:pseudo (但不是我们的 tag: 前缀)
  ];
  for (const pattern of css_patterns) {
    if (pattern.test(s)) {
      return true;
    }
  }
  return false;
}

module.exports = { parse_locator };
