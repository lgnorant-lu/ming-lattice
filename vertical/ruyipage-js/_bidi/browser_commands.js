'use strict';

function close(driver) {
  return driver.run('browser.close');
}

function create_user_context(driver) {
  return driver.run('browser.createUserContext');
}

function get_user_contexts(driver) {
  return driver.run('browser.getUserContexts');
}

function remove_user_context(driver, userContext) {
  return driver.run('browser.removeUserContext', { userContext });
}

function get_client_windows(driver) {
  return driver.run('browser.getClientWindows');
}

function set_client_window_state(driver, clientWindow, {
  state = null,
  width = null,
  height = null,
  x = null,
  y = null,
} = {}) {
  const params = { clientWindow };
  if (state) params.state = state;
  if (width != null) params.width = width;
  if (height != null) params.height = height;
  if (x != null) params.x = x;
  if (y != null) params.y = y;
  return driver.run('browser.setClientWindowState', params);
}

function set_download_behavior(driver, behavior = 'allow', {
  download_path: downloadPath = null,
  contexts = null,
  user_contexts: userContexts = null,
} = {}) {
  if (contexts != null && userContexts != null) {
    throw new Error('contexts 与 user_contexts 不能同时设置');
  }
  const behaviorType = ['allow', 'allowAndOpen'].includes(behavior) ? 'allowed' : 'denied';
  const downloadBehavior = { type: behaviorType, behavior };
  if (downloadPath) downloadBehavior.downloadPath = downloadPath;
  const params = { downloadBehavior };
  if (contexts) params.contexts = Array.isArray(contexts) ? contexts : [contexts];
  if (userContexts) params.userContexts = Array.isArray(userContexts) ? userContexts : [userContexts];
  return driver.run('browser.setDownloadBehavior', params);
}

module.exports = {
  close,
  create_user_context,
  get_user_contexts,
  remove_user_context,
  get_client_windows,
  set_client_window_state,
  set_download_behavior,
};
