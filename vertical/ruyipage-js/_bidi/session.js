'use strict';

function status(driver) {
  return driver.run('session.status');
}

function sessionNew(driver, capabilities = {}, userPromptHandler = null) {
  const caps = { ...capabilities };
  if (userPromptHandler) {
    const alwaysMatch = { ...(caps.alwaysMatch || {}) };
    alwaysMatch.unhandledPromptBehavior = { ...userPromptHandler };
    caps.alwaysMatch = alwaysMatch;
  }
  return driver.run('session.new', { capabilities: caps });
}

function end(driver) {
  return driver.run('session.end');
}

function subscribe(driver, events, contexts = null) {
  const params = { events: Array.isArray(events) ? events : [events] };
  if (contexts) {
    params.contexts = Array.isArray(contexts) ? contexts : [contexts];
  }
  return driver.run('session.subscribe', params);
}

function unsubscribe(driver, { events = null, contexts = null, subscription = null } = {}) {
  const params = {};
  if (subscription) {
    params.subscriptions = Array.isArray(subscription) ? subscription : [subscription];
  } else {
    if (events) params.events = Array.isArray(events) ? events : [events];
    if (contexts) params.contexts = Array.isArray(contexts) ? contexts : [contexts];
  }
  return driver.run('session.unsubscribe', params);
}

module.exports = { status, sessionNew, end, subscribe, unsubscribe };
