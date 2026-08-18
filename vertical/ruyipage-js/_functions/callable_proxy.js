'use strict';

/**
 * 将带 ``invoke(locator, index?, timeout?)`` 的对象包装为可调 Proxy（``await fn(...)``），
 * 其余属性透传 ``target``（方法已 ``bind``）。
 *
 * @param {{ invoke: Function } & Record<string, unknown>} target
 * @param {string} [invokeMethod='invoke']
 * @returns {Function & Record<string, unknown>}
 */
function wrapCallableInvoke(target, invokeMethod = 'invoke') {
  if (!target || typeof target[invokeMethod] !== 'function') {
    throw new TypeError('wrapCallableInvoke: target must expose invoke method');
  }
  const inv = target[invokeMethod].bind(target);
  async function main(locator, index = 1, timeout = null) {
    return inv(locator, index, timeout);
  }
  return new Proxy(main, {
    apply(_t, thisArg, args) {
      return Reflect.apply(main, thisArg, args);
    },
    get(_t, prop, receiver) {
      if (prop === 'then') return undefined;
      if (Object.prototype.hasOwnProperty.call(main, prop)) {
        return Reflect.get(main, prop, receiver);
      }
      const v = Reflect.get(target, prop, target);
      if (typeof v === 'function') return v.bind(target);
      return v;
    },
    has(_t, prop) {
      return prop in main || prop in target;
    },
    getOwnPropertyDescriptor(_t, prop) {
      if (Object.prototype.hasOwnProperty.call(main, prop)) {
        return Reflect.getOwnPropertyDescriptor(main, prop);
      }
      return Reflect.getOwnPropertyDescriptor(target, prop);
    },
  });
}

module.exports = { wrapCallableInvoke };
