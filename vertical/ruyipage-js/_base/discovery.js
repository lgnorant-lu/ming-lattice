'use strict';

const { execFileSync } = require('child_process');
const { BrowserBiDiDriver } = require('./driver');
const { getBidiWsUrl, isPortOpen } = require('../_adapter/remote_agent');
const bidiSession = require('../_bidi/session');
const bidiContext = require('../_bidi/browsing_context');

const DEFAULT_FIREFOX_PROCESS_NAME_PATTERNS = [
  'firefox.exe',
  'flowerbrowser.exe',
  'adsbrowser.exe',
];

const DEFAULT_FIREFOX_COMMANDLINE_PATTERNS = [
  '--remote-debugging-port',
  '--marionette',
  '-contentproc',
  '-isforbrowser',
  'adspower',
  'flower',
  'firefox',
];

function _occupiedResult(address, host, port, statusMessage = '', errorMessage = '', wsUrl = '') {
  return {
    address,
    host,
    port,
    ready: false,
    message: statusMessage,
    status_message: statusMessage,
    error_message: errorMessage,
    probe_state: 'occupied',
    ws_url: wsUrl,
    driver: null,
    session_id: '',
    window_count: 0,
    tab_count: 0,
    client_windows: [],
    contexts: [],
    session_owned: false,
  };
}

async function _releaseProbeSession(driver, ownsSession) {
  if (!driver || !ownsSession) return;
  try {
    await bidiSession.end(driver);
  } catch (_) { /* ignore */ }
}

async function probeBidiAddress(address, timeout = 1.0, keepDriver = false) {
  const li = address.lastIndexOf(':');
  if (li < 0) return null;
  const host = address.slice(0, li);
  const port = parseInt(address.slice(li + 1), 10);
  if (!Number.isFinite(port)) return null;

  const open = await isPortOpen(host, port, Math.max(200, timeout * 1000));
  if (!open) return null;

  let driver = null;
  let sessionOwned = false;
  let wsUrl = '';

  try {
    wsUrl = await getBidiWsUrl(host, port, Math.max(1, timeout));
    driver = BrowserBiDiDriver.getInstance(address);
    await driver.start(wsUrl);

    let status = { ready: true, message: '' };
    try {
      status = await bidiSession.status(driver);
    } catch (_) { /* ignore */ }

    if (!status.ready) {
      const occ = _occupiedResult(address, host, port, status.message || '', '', wsUrl);
      if (driver) {
        try {
          driver.stop();
        } catch (_) { /* ignore */ }
      }
      return occ;
    }

    let sessionId = '';
    try {
      const result = await bidiSession.sessionNew(driver, {});
      sessionId = result.sessionId || '';
      driver.session_id = sessionId;
      sessionOwned = true;
    } catch (e) {
      const errLower = String(e.message || e).toLowerCase();
      if (errLower.includes('maximum number of active sessions')
        || (errLower.includes('session not created') && errLower.includes('maximum'))) {
        const occ = _occupiedResult(address, host, port, status.message || '', String(e), wsUrl);
        if (driver) {
          try {
            driver.stop();
          } catch (_) { /* ignore */ }
        }
        return occ;
      }
      throw e;
    }

    let windows = [];
    try {
      const wr = await driver.run('browser.getClientWindows');
      windows = wr.clientWindows || [];
    } catch (_) { /* ignore */ }

    let contexts = [];
    try {
      const tr = await bidiContext.getTree(driver, { maxDepth: 0 });
      contexts = (tr.contexts || []).map((c) => ({
        context: c.context || '',
        url: c.url || '',
        user_context: c.userContext || 'default',
        original_opener: c.originalOpener != null ? c.originalOpener : null,
      }));
    } catch (_) { /* ignore */ }

    const info = {
      address,
      host,
      port,
      ready: true,
      message: status.message || '',
      ws_url: wsUrl,
      driver: keepDriver ? driver : null,
      session_id: sessionId,
      window_count: windows.length,
      tab_count: contexts.length,
      probe_state: 'attachable',
      status_message: status.message || '',
      error_message: '',
      session_owned: sessionOwned,
      client_windows: windows,
      contexts,
    };

    if (!keepDriver) {
      await _releaseProbeSession(driver, sessionOwned);
      sessionOwned = false;
      try {
        driver.stop();
      } catch (_) { /* ignore */ }
    }

    return info;
  } catch (_) {
    if (driver) {
      try {
        await _releaseProbeSession(driver, sessionOwned);
      } catch (_) { /* ignore */ }
      try {
        driver.stop();
      } catch (_) { /* ignore */ }
    }
    return null;
  }
}

async function scanLiveProbes(host, startPort, endPort, timeout = 0.2, maxWorkers = 64) {
  const ports = [];
  for (let p = parseInt(startPort, 10); p <= parseInt(endPort, 10); p += 1) ports.push(p);
  if (!ports.length) return [];

  const workers = Math.max(1, Math.min(parseInt(maxWorkers, 10), ports.length));
  const results = [];
  let next = 0;

  async function worker() {
    while (true) {
      const i = next;
      next += 1;
      if (i >= ports.length) break;
      const port = ports[i];
      try {
        const info = await probeBidiAddress(`${host}:${port}`, timeout, true);
        if (info && info.probe_state === 'attachable') results.push(info);
      } catch (_) { /* ignore */ }
    }
  }

  await Promise.all(Array.from({ length: workers }, () => worker()));
  results.sort((a, b) => parseInt(a.port, 10) - parseInt(b.port, 10));
  return results;
}

async function cleanupLiveProbeInfos(infos, keepAddress = null) {
  for (const item of infos) {
    if (item.address === keepAddress) continue;
    const d = item.driver;
    if (d) {
      try {
        await _releaseProbeSession(d, !!item.session_owned);
      } catch (_) { /* ignore */ }
      try {
        d.stop();
      } catch (_) { /* ignore */ }
    }
  }
}

async function findExistBrowsers(host = '127.0.0.1', startPort = 9222, endPort = 9322, timeout = 0.5, maxWorkers = 32) {
  const ports = [];
  for (let p = parseInt(startPort, 10); p <= parseInt(endPort, 10); p += 1) ports.push(p);
  if (!ports.length) return [];

  const workers = Math.max(1, Math.min(parseInt(maxWorkers, 10), ports.length));
  const results = [];
  let next = 0;

  async function worker() {
    while (true) {
      const i = next;
      next += 1;
      if (i >= ports.length) break;
      const port = ports[i];
      try {
        const info = await probeBidiAddress(`${host}:${port}`, timeout, false);
        if (info && info.probe_state === 'attachable') results.push(info);
      } catch (_) { /* ignore */ }
    }
  }

  await Promise.all(Array.from({ length: workers }, () => worker()));
  results.sort((a, b) => parseInt(a.port, 10) - parseInt(b.port, 10));
  return results;
}

function _powershellJson(cmd) {
  try {
    const out = execFileSync('powershell', ['-NoProfile', '-Command', cmd], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let data = JSON.parse(out || '[]');
    if (typeof data === 'object' && data && !Array.isArray(data)) data = [data];
    return Array.isArray(data) ? data : [];
  } catch (_) {
    return [];
  }
}

function findCandidatePortsByProcess({
  process_name_patterns: processNamePatterns = null,
  commandline_patterns: commandlinePatterns = null,
} = {}) {
  if (process.platform !== 'win32') return [];

  const namePats = processNamePatterns || DEFAULT_FIREFOX_PROCESS_NAME_PATTERNS;
  const cmdPats = commandlinePatterns || DEFAULT_FIREFOX_COMMANDLINE_PATTERNS;

  const pids = new Set();
  const procs = _powershellJson(
    'Get-CimInstance Win32_Process | Select-Object ProcessId, Name, CommandLine | ConvertTo-Json -Compress'
  );
  for (const item of procs) {
    const name = String(item.Name || '').toLowerCase();
    const cmd = String(item.CommandLine || '').toLowerCase();
    const pid = parseInt(item.ProcessId, 10);
    if (!pid) continue;
    const nameOk = namePats.some((p) => name.includes(String(p).toLowerCase()));
    const cmdOk = cmdPats.some((p) => cmd.includes(String(p).toLowerCase()));
    if (nameOk || cmdOk) pids.add(pid);
  }

  const ports = new Set();
  if (pids.size) {
    const nets = _powershellJson(
      'Get-NetTCPConnection -State Listen | Select-Object LocalAddress, LocalPort, OwningProcess | ConvertTo-Json -Compress'
    );
    for (const item of nets) {
      const pid = parseInt(item.OwningProcess, 10);
      const addr = String(item.LocalAddress || '');
      const port = parseInt(item.LocalPort, 10);
      if (pids.has(pid) && port > 0 && ['127.0.0.1', '::1', '0.0.0.0'].includes(addr)) {
        ports.add(port);
      }
    }
  }

  return [...ports].sort((a, b) => a - b);
}

async function findExistBrowsersByProcess({
  host = '127.0.0.1',
  timeout = 0.5,
  max_workers: maxWorkers = 32,
  keep_driver: keepDriver = false,
  process_name_patterns: processNamePatterns = null,
  commandline_patterns: commandlinePatterns = null,
} = {}) {
  const ports = findCandidatePortsByProcess({
    process_name_patterns: processNamePatterns,
    commandline_patterns: commandlinePatterns,
  });
  if (!ports.length) return [];

  const workers = Math.max(1, Math.min(parseInt(maxWorkers, 10), ports.length));
  const results = [];
  let next = 0;

  async function worker() {
    while (true) {
      const i = next;
      next += 1;
      if (i >= ports.length) break;
      const port = ports[i];
      try {
        const info = await probeBidiAddress(`${host}:${port}`, timeout, keepDriver);
        if (info && info.probe_state === 'attachable') {
          info.scanned_ports = ports;
          results.push(info);
        }
      } catch (_) { /* ignore */ }
    }
  }

  await Promise.all(Array.from({ length: workers }, () => worker()));
  results.sort((a, b) => parseInt(a.port, 10) - parseInt(b.port, 10));
  return results;
}

module.exports = {
  probeBidiAddress,
  scanLiveProbes,
  cleanupLiveProbeInfos,
  findExistBrowsers,
  findExistBrowsersByProcess,
  findCandidatePortsByProcess,
};
