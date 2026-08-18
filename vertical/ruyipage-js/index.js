'use strict';

const { FirefoxPage, normalizePageOptions } = require('./_pages/firefox_page');
const { wrapPageInvoke } = require('./_pages/firefox_base');
const { FirefoxTab } = require('./_pages/firefox_tab');
const { FirefoxFrame } = require('./_pages/firefox_frame');
const { Firefox } = require('./_base/browser');
const {
  probeBidiAddress,
  scanLiveProbes,
  cleanupLiveProbeInfos,
  findExistBrowsers,
  findExistBrowsersByProcess,
  findCandidatePortsByProcess,
} = require('./_base/discovery');
const { ContextDriver } = require('./_base/driver');
const { LogEntry } = require('./_bidi/log');
const { FirefoxOptions } = require('./_configs/firefox_options');
const { FirefoxElement, wrapElementInvoke } = require('./_elements/firefox_element');
const { NoneElement } = require('./_elements/none_element');
const { StaticElement } = require('./_elements/static_element');
const { Settings } = require('./_functions/settings');
const { Keys } = require('./_functions/keys');
const { By } = require('./_functions/by');
const { Clicker } = require('./_units/clicker');
const { SelectElement } = require('./_units/select_element');
const { ExtensionManager } = require('./_units/extensions');
const { BidiEvent, EventTracker } = require('./_units/events');
const { Interceptor, InterceptedRequest } = require('./_units/interceptor');
const { Listener, DataPacket } = require('./_units/listener');
const { NetworkManager, DataCollector, NetworkData } = require('./_units/network_tools');
const { NavigationTracker, NavigationEvent } = require('./_units/navigation_tracker');
const { RealmTracker } = require('./_units/realm_tracker');
const { DownloadsManager, DownloadEvent } = require('./_units/downloads_manager');
const { CookieInfo } = require('./_units/cookies');
const {
  RealmInfo,
  ScriptRemoteValue,
  ScriptResult,
  PreloadScript,
} = require('./_units/script_tools');
const {
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
  NetworkInterceptError,
  IncorrectURLError,
} = require('./errors');

/**
 * Python: ``launch(...)`` — 参数名与 Python 版一致（对象字面量传入）。
 */
async function launch(opts = {}) {
  const {
    headless = false,
    private: privateMode = false,
    xpath_picker: xpathPicker = false,
    action_visual: actionVisual = false,
    port = 9222,
    browser_path: browserPath = null,
    user_dir: userDir = null,
    window_size: windowSize = [1280, 800],
    timeout_base: timeoutBase = 10,
    timeout_page_load: timeoutPageLoad = 30,
    timeout_script: timeoutScript = 30,
  } = opts;

  const o = new FirefoxOptions();
  o.set_port(port).quick_start({
    browser_path: browserPath,
    user_dir: userDir,
    private: privateMode,
    headless,
    xpath_picker: xpathPicker,
    action_visual: actionVisual,
    window_size: windowSize,
    timeout_base: timeoutBase,
    timeout_page_load: timeoutPageLoad,
    timeout_script: timeoutScript,
  });
  return FirefoxPage.create(o);
}

/** Python: ``attach(address)`` */
async function attach(address = '127.0.0.1:9222') {
  const opts = new FirefoxOptions().set_address(address).existing_only(true);
  return FirefoxPage.create(opts);
}

/** Python: ``attach_exist_browser(...)`` */
async function attach_exist_browser(address = '127.0.0.1:9222', tabIndex = 1, latestTab = false) {
  const page = await attach(address);
  let targetTab = null;
  if (latestTab) targetTab = await page.browser.latest_tab;
  else if (tabIndex != null) targetTab = await page.browser.get_tab(tabIndex);
  if (targetTab) {
    await page.browser.activate_tab(targetTab);
    page._context_id = targetTab.tab_id;
    page._driver = new ContextDriver(page.browser.driver, targetTab.tab_id);
  }
  return page;
}

/** Python: ``auto_attach_exist_browser(...)`` */
async function auto_attach_exist_browser({
  address = null,
  host = '127.0.0.1',
  start_port: startPort = 9222,
  end_port: endPort = 65535,
  timeout = 0.2,
  max_workers: maxWorkers = 64,
  tab_index: tabIndex = 1,
  latest_tab: latestTab = false,
} = {}) {
  const errors = [];
  if (address) {
    try {
      return await attach_exist_browser(address, tabIndex, latestTab);
    } catch (e) {
      errors.push(`${address} -> ${e}`);
    }
  }
  const browsers = await scanLiveProbes(host, startPort, endPort, timeout, maxWorkers);
  if (!browsers.length) {
    throw new Error(
      '没有发现可接管的 Firefox 浏览器，请检查调试端口是否开启，或扩大扫描端口范围。'
    );
  }
  for (const item of browsers) {
    try {
      const page = await FirefoxPage.fromLiveProbeInfo(item, tabIndex, latestTab);
      if (page) {
        await cleanupLiveProbeInfos(browsers, item.address);
        return page;
      }
    } catch (e) {
      errors.push(`${item.address} -> ${e}`);
    }
  }
  await cleanupLiveProbeInfos(browsers);
  const detail = errors.slice(0, 3).join('；');
  throw new Error(
    '发现了可探测端口，但没有可真正接管的 Firefox 会话。这通常表示指纹浏览器已被自身或其他客户端占用了唯一 BiDi session。'
    + (detail ? ` 失败详情: ${detail}` : '')
  );
}

/** Python: ``auto_attach_exist_browser_by_process(...)`` */
async function auto_attach_exist_browser_by_process({
  host = '127.0.0.1',
  timeout = 0.2,
  max_workers: maxWorkers = 32,
  tab_index: tabIndex = 1,
  latest_tab: latestTab = false,
} = {}) {
  const candidatePorts = findCandidatePortsByProcess();
  if (!candidatePorts.length) {
    throw new Error(
      '未从进程特征中发现 Firefox 调试端口，请确认浏览器已启动并启用 --remote-debugging-port。'
    );
  }

  const browsers = await findExistBrowsersByProcess({
    host,
    timeout,
    max_workers: maxWorkers,
    keep_driver: true,
  });

  if (!browsers.length) {
    const occupiedInfos = [];
    for (const port of candidatePorts) {
      // eslint-disable-next-line no-await-in-loop
      const info = await probeBidiAddress(`${host}:${port}`, timeout, false);
      if (info && info.probe_state === 'occupied') occupiedInfos.push(info);
    }
    if (occupiedInfos.length) {
      const detail = occupiedInfos.slice(0, 3).map((item) => {
        const em = item.error_message ? ` (${item.error_message})` : '';
        return `${item.address} -> ${item.status_message || 'Session already started'}${em}`;
      }).join('；');
      throw new Error(
        '已发现 Firefox 调试端口，但其唯一 BiDi session 已被占用，当前无法接管。'
        + (detail ? ` 失败详情: ${detail}` : '')
      );
    }
    throw new Error('已发现候选调试端口，但未检测到可接管的 Firefox BiDi 会话。');
  }

  const errors = [];
  for (const item of browsers) {
    try {
      return await FirefoxPage.fromLiveProbeInfo(item, tabIndex, latestTab);
    } catch (e) {
      errors.push(`${item.address} -> ${e}`);
    }
  }
  await cleanupLiveProbeInfos(browsers);
  const detail = errors.slice(0, 3).join('；');
  throw new Error(
    '按进程特征发现了候选端口，但未能完成接管。'
    + (detail ? ` 失败详情: ${detail}` : '')
  );
}

module.exports = {
  FirefoxPage,
  wrapPageInvoke,
  normalizePageOptions,
  FirefoxTab,
  FirefoxFrame,
  Firefox,
  FirefoxOptions,
  FirefoxElement,
  wrapElementInvoke,
  NoneElement,
  StaticElement,
  Settings,
  Keys,
  By,
  Clicker,
  SelectElement,
  ExtensionManager,
  BidiEvent,
  EventTracker,
  Interceptor,
  InterceptedRequest,
  Listener,
  DataPacket,
  NetworkManager,
  DataCollector,
  NetworkData,
  NavigationTracker,
  NavigationEvent,
  RealmTracker,
  DownloadsManager,
  DownloadEvent,
  CookieInfo,
  ContextDriver,
  LogEntry,
  RealmInfo,
  ScriptRemoteValue,
  ScriptResult,
  PreloadScript,
  launch,
  attach,
  attach_exist_browser,
  auto_attach_exist_browser,
  find_exist_browsers: findExistBrowsers,
  find_exist_browsers_by_process: findExistBrowsersByProcess,
  auto_attach_exist_browser_by_process: auto_attach_exist_browser_by_process,
  find_candidate_ports_from_process: findCandidatePortsByProcess,
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
  NetworkInterceptError,
  IncorrectURLError,
};
