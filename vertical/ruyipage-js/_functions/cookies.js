'use strict';

/**
 * Cookie 格式转换工具
 */

/**
 * 将 Cookie 列表转为字典
 * @param {Array} cookies - [{ name: 'a', value: '1' }, ...]
 * @returns {object} { a: '1', ... }
 */
function cookies_to_dict(cookies) {
  const result = {};
  for (const c of cookies) {
    const name = c.name || '';
    if (name) {
      result[name] = c.value ?? '';
    }
  }
  return result;
}

/**
 * 将字典转为 Cookie 列表
 * @param {object} cookie_dict - { name: 'value', ... }
 * @param {string} [domain=''] - 所属域名
 * @returns {Array} [{ name, value, domain }, ...]
 */
function dict_to_cookies(cookie_dict, domain = '') {
  return Object.entries(cookie_dict).map(([k, v]) => ({
    name: k,
    value: String(v),
    domain,
  }));
}

/**
 * 将 Cookie 字符串解析为列表
 * @param {string} cookie_str - 'name1=value1; name2=value2'
 * @returns {Array} [{ name: 'name1', value: 'value1' }, ...]
 */
function cookie_str_to_list(cookie_str) {
  const cookies = [];
  for (const pair of cookie_str.split(';')) {
    const trimmed = pair.trim();
    if (trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      cookies.push({
        name: trimmed.slice(0, idx).trim(),
        value: trimmed.slice(idx + 1).trim(),
      });
    }
  }
  return cookies;
}

module.exports = { cookies_to_dict, dict_to_cookies, cookie_str_to_list };
