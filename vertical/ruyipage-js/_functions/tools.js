'use strict';

/**
 * 杂项工具函数
 */

const net = require('net');

/**
 * 等待条件满足
 * @param {Function} condition - 条件函数（可以是 async）
 * @param {number} [timeout=10] - 超时（秒）
 * @param {number} [interval=0.3] - 检查间隔（秒）
 * @returns {Promise<*>} 条件函数的返回值，超时返回 null
 */
async function wait_until(condition, timeout = 10, interval = 0.3) {
  const end_time = Date.now() + timeout * 1000;
  while (Date.now() < end_time) {
    try {
      const result = await condition();
      if (result) {
        return result;
      }
    } catch (e) {
      // 忽略异常
    }
    await new Promise(resolve => setTimeout(resolve, interval * 1000));
  }
  return null;
}

/**
 * 检查端口是否开放
 * @param {string} host
 * @param {number} port
 * @param {number} [timeout=2] - 超时（秒）
 * @returns {Promise<boolean>}
 */
function is_port_open(host, port, timeout = 2) {
  return new Promise(resolve => {
    const sock = new net.Socket();
    sock.setTimeout(timeout * 1000);
    sock.on('connect', () => {
      sock.destroy();
      resolve(true);
    });
    sock.on('timeout', () => {
      sock.destroy();
      resolve(false);
    });
    sock.on('error', () => {
      sock.destroy();
      resolve(false);
    });
    sock.connect(parseInt(port), host);
  });
}

/**
 * 查找可用端口
 * @param {number} [start=9222]
 * @param {number} [end=9322]
 * @returns {Promise<number>}
 */
async function find_free_port(start = 9222, end = 9322) {
  for (let port = start; port < end; port++) {
    const available = await new Promise(resolve => {
      const server = net.createServer();
      server.on('error', () => resolve(false));
      server.listen(port, '127.0.0.1', () => {
        server.close(() => resolve(true));
      });
    });
    if (available) {
      return port;
    }
  }
  throw new Error(`在端口范围 ${start}-${end} 中找不到可用端口`);
}

/**
 * 清理文本（去除多余空白）
 * @param {string} text
 * @returns {string}
 */
function clean_text(text) {
  if (!text) return '';
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * 生成合法文件名
 * @param {string} name
 * @param {number} [max_length=50]
 * @returns {string}
 */
function make_valid_filename(name, max_length = 50) {
  name = name.replace(/[\\/:*?"<>|]/g, '');
  return name.slice(0, max_length);
}

/**
 * Promise 形式的 sleep
 * @param {number} seconds
 * @returns {Promise<void>}
 */
function sleep(seconds) {
  return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

module.exports = {
  wait_until,
  is_port_open,
  find_free_port,
  clean_text,
  make_valid_filename,
  sleep,
};
