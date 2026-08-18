'use strict';

const fs = require('fs');

async function install(driver, path) {
  let params;
  if (fs.existsSync(path) && fs.statSync(path).isFile()) {
    params = { extensionData: { type: 'archivePath', path } };
  } else {
    params = { extensionData: { type: 'path', path } };
  }
  try {
    return await driver.run('webExtension.install', params);
  } catch (e) {
    const errStr = String(e.message || e).toLowerCase();
    if (errStr.includes('unknown command') || errStr.includes('not supported')) {
      return { extension: '' };
    }
    throw e;
  }
}

async function uninstall(driver, extension_id) {
  return driver.run('webExtension.uninstall', { extension: extension_id });
}

module.exports = { install, uninstall };
