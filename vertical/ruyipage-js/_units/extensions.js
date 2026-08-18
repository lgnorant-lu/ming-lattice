'use strict';

const bidiExt = require('../_bidi/web_extension');

class ExtensionManager {
  constructor(driver) {
    this._driver = driver;
    this._installed = Object.create(null);
  }

  async install(path) {
    const result = await bidiExt.install(this._driver, path);
    const extId = result.extension || '';
    if (extId) this._installed[extId] = path;
    return extId;
  }

  install_dir(path) {
    return this.install(path);
  }

  install_archive(path) {
    return this.install(path);
  }

  async uninstall(extensionId) {
    await bidiExt.uninstall(this._driver, extensionId);
    delete this._installed[extensionId];
  }

  async uninstall_all() {
    await Promise.all(Object.keys(this._installed).map((id) => this.uninstall(id)));
  }

  get installed_extensions() {
    return { ...this._installed };
  }

  toString() {
    return '<ExtensionManager>';
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toString();
  }
}

module.exports = { ExtensionManager };
