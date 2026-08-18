'use strict';

function navigate(driver, context, url, wait = 'complete') {
  return driver.run('browsingContext.navigate', { context, url, wait });
}

function getTree(driver, { maxDepth = null, root = null } = {}) {
  const params = {};
  if (maxDepth != null) params.maxDepth = maxDepth;
  if (root) params.root = root;
  return driver.run('browsingContext.getTree', params);
}

function create(driver, {
  type = 'tab',
  referenceContext = null,
  background = false,
  userContext = null,
} = {}) {
  const params = { type };
  if (referenceContext) params.referenceContext = referenceContext;
  if (background) params.background = true;
  if (userContext) params.userContext = userContext;
  return driver.run('browsingContext.create', params);
}

function close(driver, context, promptUnload = false) {
  const params = { context };
  if (promptUnload) params.promptUnload = true;
  return driver.run('browsingContext.close', params);
}

function activate(driver, context) {
  return driver.run('browsingContext.activate', { context });
}

function reload(driver, context, ignore_cache = false, wait = 'complete') {
  const params = { context, wait };
  if (ignore_cache) params.ignoreCache = true;
  return driver.run('browsingContext.reload', params);
}

function traverse_history(driver, context, delta) {
  return driver.run('browsingContext.traverseHistory', { context, delta });
}

function print_(driver, context, {
  background = null,
  margin = null,
  orientation = null,
  page = null,
  page_ranges: pageRanges = null,
  scale = null,
  shrink_to_fit: shrinkToFit = null,
} = {}) {
  const params = { context };
  if (background != null) params.background = background;
  if (margin) params.margin = margin;
  if (orientation) params.orientation = orientation;
  if (page) params.page = page;
  if (pageRanges) params.pageRanges = pageRanges;
  if (scale != null) params.scale = scale;
  if (shrinkToFit != null) params.shrinkToFit = shrinkToFit;
  return driver.run('browsingContext.print', params);
}

function capture_screenshot(driver, context, {
  origin = 'viewport',
  format: format_ = null,
  clip = null,
} = {}) {
  const params = { context, origin };
  if (format_) params.format = format_;
  if (clip) params.clip = clip;
  return driver.run('browsingContext.captureScreenshot', params);
}

function handle_user_prompt(driver, context, accept = true, userText = null) {
  const params = { context, accept };
  if (userText != null) params.userText = userText;
  return driver.run('browsingContext.handleUserPrompt', params);
}

function locate_nodes(driver, context, locator, {
  max_node_count: maxNodeCount = null,
  serialization_options: serializationOptions = null,
  start_nodes: startNodes = null,
} = {}) {
  const params = { context, locator };
  if (maxNodeCount != null) params.maxNodeCount = maxNodeCount;
  if (serializationOptions) params.serializationOptions = serializationOptions;
  if (startNodes) params.startNodes = startNodes;
  return driver.run('browsingContext.locateNodes', params);
}

function set_viewport(driver, context, {
  width = null, height = null, device_pixel_ratio: devicePixelRatio = null,
} = {}) {
  const params = { context };
  if (width != null && height != null) params.viewport = { width, height };
  if (devicePixelRatio != null) params.devicePixelRatio = devicePixelRatio;
  return driver.run('browsingContext.setViewport', params);
}

function set_bypass_csp(driver, context, enabled = true) {
  return driver.run('browsingContext.setBypassCSP', { context, enabled });
}

module.exports = {
  navigate,
  getTree,
  create,
  close,
  activate,
  reload,
  traverse_history,
  print_,
  capture_screenshot,
  handle_user_prompt,
  locate_nodes,
  set_viewport,
  set_bypass_csp,
};

