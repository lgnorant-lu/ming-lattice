'use strict';

/**
 * URL 验证和 Web 工具
 */

/**
 * 检查是否是合法 URL
 * @param {string} url
 * @returns {boolean}
 */
function is_valid_url(url) {
  const pattern = /^https?:\/\/(?:(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,6}\.?|localhost|\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(?::\d+)?(?:\/?|[/?]\S+)$/i;
  return pattern.test(url);
}

/**
 * 确保 URL 有协议前缀
 * @param {string} url
 * @returns {string}
 */
function ensure_url(url) {
  if (!url) return url;
  if (!/^https?:\/\//i.test(url)) {
    if (url.startsWith('//')) {
      return 'https:' + url;
    }
    return 'https://' + url;
  }
  return url;
}

module.exports = { is_valid_url, ensure_url };
