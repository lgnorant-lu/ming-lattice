'use strict';

function add_intercept(driver, phases, url_patterns = null, contexts = null) {
  const params = { phases };
  if (url_patterns) params.urlPatterns = url_patterns;
  if (contexts) params.contexts = Array.isArray(contexts) ? contexts : [contexts];
  return driver.run('network.addIntercept', params);
}

function remove_intercept(driver, intercept_id) {
  return driver.run('network.removeIntercept', { intercept: intercept_id });
}

function continue_request(driver, request_id, {
  body = null, cookies = null, headers = null, method = null, url = null,
} = {}) {
  const params = { request: request_id };
  if (body != null) params.body = body;
  if (cookies != null) params.cookies = cookies;
  if (headers != null) params.headers = headers;
  if (method != null) params.method = method;
  if (url != null) params.url = url;
  return driver.run('network.continueRequest', params);
}

function continue_response(driver, request_id, opts = {}) {
  const cookies = opts.cookies ?? null;
  const credentials = opts.credentials ?? null;
  const headers = opts.headers ?? null;
  const reasonPhrase = opts.reason_phrase ?? null;
  const statusCode = opts.status_code ?? null;
  const params = { request: request_id };
  if (cookies != null) params.cookies = cookies;
  if (credentials != null) params.credentials = credentials;
  if (headers != null) params.headers = headers;
  if (reasonPhrase != null) params.reasonPhrase = reasonPhrase;
  if (statusCode != null) params.statusCode = statusCode;
  return driver.run('network.continueResponse', params);
}

function continue_with_auth(driver, request_id, action = 'default', credentials = null) {
  const params = { request: request_id, action };
  if (credentials) params.credentials = credentials;
  return driver.run('network.continueWithAuth', params);
}

function fail_request(driver, request_id) {
  return driver.run('network.failRequest', { request: request_id });
}

function provide_response(driver, request_id, opts = {}) {
  const body = opts.body ?? null;
  const cookies = opts.cookies ?? null;
  const headers = opts.headers ?? null;
  const reasonPhrase = opts.reason_phrase ?? null;
  const statusCode = opts.status_code ?? null;
  const params = { request: request_id };
  if (body != null) params.body = body;
  if (cookies != null) params.cookies = cookies;
  if (headers != null) params.headers = headers;
  if (reasonPhrase != null) params.reasonPhrase = reasonPhrase;
  if (statusCode != null) params.statusCode = statusCode;
  return driver.run('network.provideResponse', params);
}

function set_cache_behavior(driver, behavior, contexts = null) {
  const params = { cacheBehavior: behavior };
  if (contexts) params.contexts = Array.isArray(contexts) ? contexts : [contexts];
  return driver.run('network.setCacheBehavior', params);
}

function set_extra_headers(driver, headers, contexts = null) {
  const params = { headers };
  if (contexts) params.contexts = Array.isArray(contexts) ? contexts : [contexts];
  return driver.run('network.setExtraHeaders', params);
}

function add_data_collector(driver, events, opts = {}) {
  const contexts = opts.contexts ?? null;
  const maxEncodedDataSize = opts.max_encoded_data_size ?? 10485760;
  const dataTypes = opts.data_types ?? null;
  const params = {
    events,
    maxEncodedDataSize,
    dataTypes: dataTypes || ['request', 'response'],
  };
  if (contexts) params.contexts = Array.isArray(contexts) ? contexts : [contexts];
  return driver.run('network.addDataCollector', params);
}

function remove_data_collector(driver, collector_id) {
  return driver.run('network.removeDataCollector', { collector: collector_id });
}

function get_data(driver, collector_id, request_id, data_type = 'response') {
  return driver.run('network.getData', {
    collector: collector_id,
    request: request_id,
    dataType: data_type,
  });
}

function disown_data(driver, collector_id, request_id, data_type = 'response') {
  return driver.run('network.disownData', {
    collector: collector_id,
    request: request_id,
    dataType: data_type,
  });
}

module.exports = {
  add_intercept,
  remove_intercept,
  continue_request,
  continue_response,
  continue_with_auth,
  fail_request,
  provide_response,
  set_cache_behavior,
  set_extra_headers,
  add_data_collector,
  remove_data_collector,
  get_data,
  disown_data,
};
