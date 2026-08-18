'use strict';

const { serialize_value: serializeValue } = require('../_functions/bidi_values');

function evaluate(driver, context, expression, {
  awaitPromise = true,
  resultOwnership = 'root',
  serializationOptions = null,
  userActivation = false,
  sandbox = null,
} = {}) {
  const target = { context };
  if (sandbox) target.sandbox = sandbox;
  const params = {
    expression,
    target,
    awaitPromise,
    resultOwnership,
  };
  if (serializationOptions) params.serializationOptions = serializationOptions;
  if (userActivation) params.userActivation = true;
  return driver.run('script.evaluate', params);
}

function callFunction(driver, context, functionDeclaration, {
  arguments: fnArgs = null,
  thisArg = null,
  awaitPromise = true,
  resultOwnership = 'root',
  serializationOptions = null,
  userActivation = false,
  sandbox = null,
} = {}) {
  const target = { context };
  if (sandbox) target.sandbox = sandbox;
  const params = {
    functionDeclaration,
    target,
    awaitPromise,
    resultOwnership,
  };

  if (fnArgs != null) {
    params.arguments = fnArgs.map((arg) => {
      if (arg && typeof arg === 'object' && ('sharedId' in arg || arg.type)) {
        return arg;
      }
      return serializeValue(arg);
    });
  }

  if (thisArg != null) {
    if (thisArg && typeof thisArg === 'object' && ('sharedId' in thisArg || thisArg.type)) {
      params.this = thisArg;
    } else {
      params.this = serializeValue(thisArg);
    }
  }

  if (serializationOptions) params.serializationOptions = serializationOptions;
  if (userActivation) params.userActivation = true;

  return driver.run('script.callFunction', params);
}

function add_preload_script(driver, functionDeclaration, {
  arguments: fnArgs = null,
  contexts = null,
  sandbox = null,
} = {}) {
  const params = { functionDeclaration };
  if (fnArgs && fnArgs.length) {
    params.arguments = fnArgs.map((a) => (a && typeof a === 'object' && ('sharedId' in a || a.type)
      ? a
      : serializeValue(a)));
  }
  if (contexts) params.contexts = Array.isArray(contexts) ? contexts : [contexts];
  if (sandbox) params.sandbox = sandbox;
  return driver.run('script.addPreloadScript', params);
}

function remove_preload_script(driver, scriptId) {
  return driver.run('script.removePreloadScript', { script: scriptId });
}

function get_realms(driver, { context = null, type: type_ = null } = {}) {
  const params = {};
  if (context) params.context = context;
  if (type_) params.type = type_;
  return driver.run('script.getRealms', params);
}

function disown(driver, handles, target) {
  return driver.run('script.disown', { handles, target });
}

module.exports = {
  evaluate,
  callFunction,
  add_preload_script,
  remove_preload_script,
  get_realms,
  disown,
};
