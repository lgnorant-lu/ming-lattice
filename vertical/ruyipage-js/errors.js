'use strict';

/**
 * RuyiPage 异常层次
 */

class RuyiPageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RuyiPageError';
  }
}

class ElementNotFoundError extends RuyiPageError {
  constructor(message) {
    super(message);
    this.name = 'ElementNotFoundError';
  }
}

class ElementLostError extends RuyiPageError {
  constructor(message) {
    super(message);
    this.name = 'ElementLostError';
  }
}

class ContextLostError extends RuyiPageError {
  constructor(message) {
    super(message);
    this.name = 'ContextLostError';
  }
}

class BiDiError extends RuyiPageError {
  constructor(error, message = '', stacktrace = '') {
    super(`${error}: ${message}`);
    this.name = 'BiDiError';
    this.error = error;
    this.bidi_message = message;
    this.stacktrace = stacktrace;
  }
}

class PageDisconnectedError extends RuyiPageError {
  constructor(message) {
    super(message);
    this.name = 'PageDisconnectedError';
  }
}

class JavaScriptError extends RuyiPageError {
  constructor(message = '', exception_details = null) {
    super(message);
    this.name = 'JavaScriptError';
    this.exception_details = exception_details;
  }
}

class BrowserConnectError extends RuyiPageError {
  constructor(message) {
    super(message);
    this.name = 'BrowserConnectError';
  }
}

class BrowserLaunchError extends RuyiPageError {
  constructor(message) {
    super(message);
    this.name = 'BrowserLaunchError';
  }
}

class AlertExistsError extends RuyiPageError {
  constructor(message) {
    super(message);
    this.name = 'AlertExistsError';
  }
}

class WaitTimeoutError extends RuyiPageError {
  constructor(message) {
    super(message);
    this.name = 'WaitTimeoutError';
  }
}

class NoRectError extends RuyiPageError {
  constructor(message) {
    super(message);
    this.name = 'NoRectError';
  }
}

class CanNotClickError extends RuyiPageError {
  constructor(message) {
    super(message);
    this.name = 'CanNotClickError';
  }
}

class LocatorError extends RuyiPageError {
  constructor(message) {
    super(message);
    this.name = 'LocatorError';
  }
}

class IncorrectURLError extends RuyiPageError {
  constructor(message) {
    super(message);
    this.name = 'IncorrectURLError';
  }
}

class NetworkInterceptError extends RuyiPageError {
  constructor(message) {
    super(message);
    this.name = 'NetworkInterceptError';
  }
}

module.exports = {
  RuyiPageError,
  ElementNotFoundError,
  ElementLostError,
  ContextLostError,
  BiDiError,
  PageDisconnectedError,
  JavaScriptError,
  BrowserConnectError,
  BrowserLaunchError,
  AlertExistsError,
  WaitTimeoutError,
  NoRectError,
  CanNotClickError,
  LocatorError,
  IncorrectURLError,
  NetworkInterceptError,
};
