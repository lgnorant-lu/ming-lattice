'use strict';

function _normalize_partition(partition) {
  if (!partition) return null;
  const p = { ...partition };
  if (p.type) return p;
  if (p.context) {
    p.type = 'context';
    return p;
  }
  if (p.userContext != null || p.sourceOrigin != null) {
    p.type = 'storageKey';
    return p;
  }
  return p;
}

function get_cookies(driver, { filter_ = null, partition = null } = {}) {
  const params = {};
  if (filter_) params.filter = filter_;
  const part = _normalize_partition(partition);
  if (part) params.partition = part;
  return driver.run('storage.getCookies', params);
}

function set_cookie(driver, cookie, partition = null) {
  const params = { cookie };
  const part = _normalize_partition(partition);
  if (part) params.partition = part;
  return driver.run('storage.setCookie', params);
}

function delete_cookies(driver, { filter_ = null, partition = null } = {}) {
  const params = {};
  if (filter_) params.filter = filter_;
  const part = _normalize_partition(partition);
  if (part) params.partition = part;
  return driver.run('storage.deleteCookies', params);
}

module.exports = {
  get_cookies,
  set_cookie,
  delete_cookies,
  _normalize_partition,
};
