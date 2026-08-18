'use strict';

/**
 * Firefox Remote Agent：HTTP /json 探测与 BiDi WebSocket URL 解析。
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');
const WebSocket = require('ws');

function probeWsUrl(wsUrl, timeoutMs = 3000) {
  return new Promise((resolve) => {
    let ws;
    const t = setTimeout(() => {
      try {
        if (ws) ws.terminate();
      } catch (_) { /* ignore */ }
      resolve(false);
    }, timeoutMs);
    try {
      ws = new WebSocket(wsUrl);
      ws.on('open', () => {
        clearTimeout(t);
        try {
          ws.close();
        } catch (_) { /* ignore */ }
        resolve(true);
      });
      ws.on('error', () => {
        clearTimeout(t);
        resolve(false);
      });
    } catch (_) {
      clearTimeout(t);
      resolve(false);
    }
  });
}

function httpGetJson(urlStr, timeoutMs = 3000) {
  return new Promise((resolve) => {
    let done = false;
    const u = new URL(urlStr);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        method: 'GET',
        timeout: timeoutMs,
      },
      (res) => {
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => {
          if (done) return;
          done = true;
          try {
            resolve(JSON.parse(body));
          } catch (_) {
            resolve(null);
          }
        });
      }
    );
    req.on('error', () => {
      if (done) return;
      done = true;
      resolve(null);
    });
    req.on('timeout', () => {
      req.destroy();
      if (done) return;
      done = true;
      resolve(null);
    });
    req.end();
  });
}

/**
 * 从 Firefox 调试端口解析可用的 BiDi WebSocket URL。
 * @param {string} host
 * @param {number} port
 * @param {number} [timeoutSec=30]
 * @returns {Promise<string>}
 */
async function getBidiWsUrl(host, port, timeoutSec = 30) {
  const directWs = `ws://${host}:${port}`;
  const sessionWs = `ws://${host}:${port}/session`;

  if (await probeWsUrl(directWs, 3000)) {
    return directWs;
  }

  const deadline = Date.now() + timeoutSec * 1000;
  const jsonUrl = `http://${host}:${port}/json`;

  while (Date.now() < deadline) {
    const data = await httpGetJson(jsonUrl, 3000);
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const ws = data.webSocketDebuggerUrl;
      if (ws) return ws;
    }
    if (Array.isArray(data) && data.length && data[0].webSocketDebuggerUrl) {
      return data[0].webSocketDebuggerUrl;
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  if (await probeWsUrl(sessionWs, 3000)) {
    return sessionWs;
  }
  return directWs;
}

function isPortOpen(host, port, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const net = require('net');
    const sock = net.createConnection({ host, port }, () => {
      sock.end();
      resolve(true);
    });
    sock.setTimeout(timeoutMs);
    sock.on('timeout', () => {
      sock.destroy();
      resolve(false);
    });
    sock.on('error', () => resolve(false));
  });
}

module.exports = { getBidiWsUrl, probeWsUrl, isPortOpen };
