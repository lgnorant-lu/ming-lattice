'use strict';

const bidiScript = require('./script');

async function safeRun(driver, method, params, description = '') {
  try {
    return await driver.run(method, params);
  } catch (e) {
    const err = String((e && e.message) || e).toLowerCase();
    if (err.includes('unknown command') || err.includes('not supported')
      || err.includes('unknown method') || err.includes('invalid method')) {
      return null;
    }
    throw e;
  }
}

function ctxList(contexts) {
  if (!contexts) return null;
  return Array.isArray(contexts) ? contexts : [contexts];
}

async function setUserAgentOverride(driver, userAgent, platform = null, contexts = null) {
  const params = { userAgent };
  if (platform) params.platform = platform;
  const cl = ctxList(contexts);
  if (cl) params.contexts = cl;
  return safeRun(driver, 'emulation.setUserAgentOverride', params, 'setUserAgentOverride');
}

async function setGeolocationOverride(driver, {
  latitude = null, longitude = null, accuracy = null, contexts = null,
} = {}) {
  const params = {};
  if (latitude != null && longitude != null) {
    const coords = { latitude, longitude };
    if (accuracy != null) coords.accuracy = accuracy;
    params.coordinates = coords;
  }
  const cl = ctxList(contexts);
  if (cl) params.contexts = cl;
  return safeRun(driver, 'emulation.setGeolocationOverride', params, 'setGeolocationOverride');
}

async function setTimezoneOverride(driver, timezoneId, contexts = null) {
  if (!timezoneId) return null;
  const params = { timezone: timezoneId };
  const cl = ctxList(contexts);
  if (cl) params.contexts = cl;
  return safeRun(driver, 'emulation.setTimezoneOverride', params, 'setTimezoneOverride');
}

async function setLocaleOverride(driver, locales, contexts = null) {
  const locale = Array.isArray(locales) ? locales[0] : locales;
  const params = { locale };
  const cl = ctxList(contexts);
  if (cl) params.contexts = cl;
  return safeRun(driver, 'emulation.setLocaleOverride', params, 'setLocaleOverride');
}

async function setScreenOrientationOverride(driver, orientationType, angle = 0, contexts = null) {
  const natural = String(orientationType).includes('portrait') ? 'portrait' : 'landscape';
  const params = {
    screenOrientation: { type: orientationType, angle, natural },
  };
  const cl = ctxList(contexts);
  if (cl) params.contexts = cl;
  return safeRun(driver, 'emulation.setScreenOrientationOverride', params, 'setScreenOrientationOverride');
}

async function setScreenSettingsOverride(driver, {
  width = null, height = null, device_pixel_ratio: dpr = null, contexts = null,
} = {}) {
  const params = {};
  if (width != null || height != null) {
    const screenArea = {};
    if (width != null) screenArea.width = width;
    if (height != null) screenArea.height = height;
    params.screenArea = screenArea;
  }
  if (dpr != null) params.devicePixelRatio = dpr;
  const cl = ctxList(contexts);
  if (cl) params.contexts = cl;
  return safeRun(driver, 'emulation.setScreenSettingsOverride', params, 'setScreenSettingsOverride');
}

async function setViewportOverride(driver, {
  viewport = null, device_pixel_ratio: dpr = null, contexts = null,
} = {}) {
  const params = {};
  if (viewport) params.viewport = viewport;
  if (dpr != null) params.devicePixelRatio = dpr;
  const cl = ctxList(contexts);
  if (cl) params.contexts = cl;
  return safeRun(driver, 'emulation.setViewportOverride', params, 'setViewportOverride');
}

async function setNetworkConditions(driver, offline = false, contexts = null) {
  const params = { networkConditions: { type: offline ? 'offline' : 'online' } };
  const cl = ctxList(contexts);
  if (cl) params.contexts = cl;
  return safeRun(driver, 'emulation.setNetworkConditions', params, 'setNetworkConditions');
}

async function setTouchOverride(driver, {
  max_touch_points: maxTouchPoints = 1, contexts = null, user_contexts: userContexts = null,
} = {}) {
  if (contexts && userContexts) {
    throw new Error('contexts 和 user_contexts 不能同时传入');
  }
  const params = { maxTouchPoints };
  const cl = ctxList(contexts);
  if (cl) params.contexts = cl;
  if (userContexts) {
    params.userContexts = Array.isArray(userContexts) ? userContexts : [userContexts];
  }
  return safeRun(driver, 'emulation.setTouchOverride', params, 'setTouchOverride');
}

async function injectUaOverride(driver, context, userAgent) {
  const escapedUa = String(userAgent).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const injectJs = `() => { Object.defineProperty(navigator, 'userAgent', {get: () => '${escapedUa}'}); }`;
  const result = await bidiScript.add_preload_script(driver, injectJs, { contexts: [context] });
  const scriptId = (result && result.script) || '';
  try {
    await bidiScript.callFunction(driver, context, injectJs, { arguments: [] });
  } catch (_) { /* preload 仍然生效 */ }
  return scriptId;
}

async function setMediaFeaturesOverride(driver, features, contexts = null) {
  const params = { features };
  const cl = ctxList(contexts);
  if (cl) params.contexts = cl;
  return safeRun(driver, 'emulation.setMediaFeaturesOverride', params, 'setMediaFeaturesOverride');
}

async function setDocumentCookieDisabled(driver, disabled = true, contexts = null) {
  const params = { disabled };
  const cl = ctxList(contexts);
  if (cl) params.contexts = cl;
  return safeRun(driver, 'emulation.setDocumentCookieDisabled', params, 'setDocumentCookieDisabled');
}

async function setBypassCspEmulation(driver, enabled = true, contexts = null) {
  const params = { enabled };
  const cl = ctxList(contexts);
  if (cl) params.contexts = cl;
  return safeRun(driver, 'emulation.setBypassCSP', params, 'emulation.setBypassCSP');
}

async function setFocusEmulation(driver, enabled = true, contexts = null) {
  const params = { enabled };
  const cl = ctxList(contexts);
  if (cl) params.contexts = cl;
  return safeRun(driver, 'emulation.setFocusEmulation', params, 'setFocusEmulation');
}

async function setHardwareConcurrency(driver, concurrency, contexts = null) {
  const params = { hardwareConcurrency: concurrency };
  const cl = ctxList(contexts);
  if (cl) params.contexts = cl;
  return safeRun(driver, 'emulation.setHardwareConcurrency', params, 'setHardwareConcurrency');
}

async function setScriptingEnabled(driver, enabled = true, contexts = null) {
  const params = { enabled };
  const cl = ctxList(contexts);
  if (cl) params.contexts = cl;
  return safeRun(driver, 'emulation.setScriptingEnabled', params, 'setScriptingEnabled');
}

async function setScrollbarTypeOverride(driver, scrollbarType = 'default', contexts = null) {
  const params = { type: scrollbarType };
  const cl = ctxList(contexts);
  if (cl) params.contexts = cl;
  return safeRun(driver, 'emulation.setScrollbarTypeOverride', params, 'setScrollbarTypeOverride');
}

async function setForcedColorsModeThemeOverride(driver, mode = 'none', contexts = null) {
  const params = { mode };
  const cl = ctxList(contexts);
  if (cl) params.contexts = cl;
  return safeRun(driver, 'emulation.setForcedColorsModeThemeOverride', params, 'setForcedColorsModeThemeOverride');
}

module.exports = {
  safeRun,
  setUserAgentOverride,
  setGeolocationOverride,
  setTimezoneOverride,
  setLocaleOverride,
  setScreenOrientationOverride,
  setScreenSettingsOverride,
  setViewportOverride,
  setNetworkConditions,
  setTouchOverride,
  injectUaOverride,
  setMediaFeaturesOverride,
  setDocumentCookieDisabled,
  setBypassCspEmulation,
  setFocusEmulation,
  setHardwareConcurrency,
  setScriptingEnabled,
  setScrollbarTypeOverride,
  setForcedColorsModeThemeOverride,
};
