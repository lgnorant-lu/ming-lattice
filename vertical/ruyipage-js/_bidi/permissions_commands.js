'use strict';

async function safeRun(driver, method, params) {
  try {
    return await driver.run(method, params);
  } catch (e) {
    const err = String(e.message || e).toLowerCase();
    if (err.includes('unknown command') || err.includes('not supported')
      || err.includes('unknown method') || err.includes('invalid method')) {
      return null;
    }
    throw e;
  }
}

async function set_permission(driver, descriptor, state, origin = 'https://example.com', contexts = null) {
  const params = { descriptor, state, origin };
  if (contexts) params.contexts = Array.isArray(contexts) ? contexts : [contexts];
  const r = await safeRun(driver, 'permissions.setPermission', params);
  if (r != null) return r;
  const name = (descriptor && descriptor.name) || '';
  const prefMap = {
    geolocation: 'permissions.default.geo',
    notifications: 'permissions.default.desktop-notification',
    camera: 'permissions.default.camera',
    microphone: 'permissions.default.microphone',
  };
  const pref = prefMap[name];
  if (!pref) return null;
  const stateValue = { granted: 1, denied: 2, prompt: 0 }[state] ?? 0;
  return {
    fallback: 'prefs',
    pref,
    value: stateValue,
    note: '需通过 PrefsManager 或 user.js 手动应用',
  };
}

module.exports = { set_permission, safeRun };
