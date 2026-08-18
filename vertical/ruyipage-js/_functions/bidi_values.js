'use strict';

/**
 * BiDi 协议值序列化/反序列化工具
 */

/**
 * 将 BiDi RemoteValue 转换为 JS 原生对象
 * @param {object} node - BiDi 返回的序列化值字典
 * @returns {*} JS 原生对象
 */
function parse_value(node) {
  if (!node || typeof node !== 'object') {
    return node;
  }

  const t = node.type || '';

  if (t === 'null' || t === 'undefined') {
    return null;
  }

  if (t === 'string') {
    return node.value != null ? node.value : '';
  }

  if (t === 'number') {
    const val = node.value;
    if (typeof val === 'string') {
      if (val === 'NaN') return NaN;
      if (val === 'Infinity') return Infinity;
      if (val === '-Infinity') return -Infinity;
      if (val === '-0') return -0;
    }
    return val;
  }

  if (t === 'boolean') {
    return node.value != null ? node.value : false;
  }

  if (t === 'bigint') {
    return BigInt(node.value || '0');
  }

  if (t === 'array') {
    return (node.value || []).map(item => parse_value(item));
  }

  if (t === 'object') {
    const obj = {};
    for (const pair of (node.value || [])) {
      if (Array.isArray(pair) && pair.length === 2) {
        const k = typeof pair[0] === 'string' ? pair[0] : parse_value(pair[0]);
        obj[k] = parse_value(pair[1]);
      }
    }
    return obj;
  }

  if (t === 'map') {
    const result = {};
    for (const pair of (node.value || [])) {
      if (Array.isArray(pair) && pair.length === 2) {
        const k = parse_value(pair[0]);
        result[k] = parse_value(pair[1]);
      }
    }
    return result;
  }

  if (t === 'set') {
    return new Set((node.value || []).map(item => parse_value(item)));
  }

  if (t === 'date') {
    return node.value || '';
  }

  if (t === 'regexp') {
    return node.value || {};
  }

  if (t === 'node') {
    // DOM 节点，返回原始字典以便后续创建 FirefoxElement
    return node;
  }

  if (t === 'window') {
    return node;
  }

  if (t === 'error') {
    return node;
  }

  // 未知类型，返回 value 或原字典
  return node.value != null ? node.value : node;
}

/**
 * 将 JS 对象转换为 BiDi LocalValue
 * @param {*} value - JS 原生对象
 * @returns {object} BiDi 协议格式的字典
 */
function serialize_value(value) {
  if (value === null || value === undefined) {
    return { type: 'null' };
  }

  if (typeof value === 'boolean') {
    return { type: 'boolean', value };
  }

  if (typeof value === 'bigint') {
    return { type: 'bigint', value: value.toString() };
  }

  if (typeof value === 'number') {
    if (Number.isNaN(value)) {
      return { type: 'number', value: 'NaN' };
    }
    if (!Number.isFinite(value)) {
      return { type: 'number', value: value > 0 ? 'Infinity' : '-Infinity' };
    }
    if (Object.is(value, -0)) {
      return { type: 'number', value: '-0' };
    }
    // 检查是否超出安全整数范围
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
      return { type: 'bigint', value: value.toString() };
    }
    return { type: 'number', value };
  }

  if (typeof value === 'string') {
    return { type: 'string', value };
  }

  if (Array.isArray(value)) {
    return { type: 'array', value: value.map(v => serialize_value(v)) };
  }

  if (value instanceof Set) {
    return { type: 'set', value: [...value].map(v => serialize_value(v)) };
  }

  if (typeof value === 'object') {
    // 检查是否是 SharedReference（FirefoxElement 传入）
    if (value.sharedId) {
      return { type: 'sharedReference', sharedId: value.sharedId };
    }

    // 对于带有 _shared_id 属性的对象（FirefoxElement）
    if (value._shared_id) {
      return { type: 'sharedReference', sharedId: value._shared_id };
    }

    const pairs = [];
    for (const [k, v] of Object.entries(value)) {
      pairs.push([k, serialize_value(v)]);
    }
    return { type: 'object', value: pairs };
  }

  // 其他类型尝试转为字符串
  return { type: 'string', value: String(value) };
}

/**
 * 创建 BiDi SharedReference
 * @param {string} shared_id - 元素的 sharedId
 * @param {string} [handle] - 可选的 handle
 * @returns {object} SharedReference 字典
 */
function make_shared_ref(shared_id, handle = null) {
  const ref = { type: 'sharedReference', sharedId: shared_id };
  if (handle) {
    ref.handle = handle;
  }
  return ref;
}

module.exports = { parse_value, serialize_value, make_shared_ref };
