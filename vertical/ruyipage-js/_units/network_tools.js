'use strict';

const bidiNetwork = require('../_bidi/network');

class NetworkData {
  constructor(data) {
    this.raw = { ...(data || {}) };
    this.bytes = this.raw.bytes;
    this.base64 = this.raw.base64;
  }

  get has_data() {
    return this.bytes != null || this.base64 != null;
  }

  toString() {
    return `<NetworkData has_data=${this.has_data}>`;
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toString();
  }
}

class DataCollector {
  constructor(manager, collectorId) {
    this._manager = manager;
    this.id = collectorId;
  }

  get(requestId, dataType = 'response') {
    return this._manager.get_data(this.id, requestId, dataType);
  }

  disown(requestId, dataType = 'response') {
    return this._manager.disown_data(this.id, requestId, dataType);
  }

  remove() {
    return this._manager.remove_data_collector(this.id);
  }

  toString() {
    return `<DataCollector ${this.id}>`;
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toString();
  }
}

class NetworkManager {
  constructor(owner) {
    this._owner = owner;
  }

  _ctx() {
    return [this._owner._context_id];
  }

  async set_extra_headers(headers) {
    const bidiHeaders = Object.entries(headers || {}).map(([name, value]) => ({
      name,
      value: { type: 'string', value: String(value) },
    }));
    await bidiNetwork.set_extra_headers(this._owner._driver, bidiHeaders, this._ctx());
    return this._owner;
  }

  async clear_extra_headers() {
    await bidiNetwork.set_extra_headers(this._owner._driver, [], this._ctx());
    return this._owner;
  }

  async set_cache_behavior(behavior = 'default') {
    await bidiNetwork.set_cache_behavior(this._owner._driver, behavior, this._ctx());
    return this._owner;
  }

  async add_data_collector(events, {
    data_types: dataTypes = null,
    max_encoded_data_size: maxEncodedDataSize = 10485760,
  } = {}) {
    const result = await bidiNetwork.add_data_collector(this._owner._driver, events, {
      contexts: this._ctx(),
      max_encoded_data_size: maxEncodedDataSize,
      data_types: dataTypes,
    });
    return new DataCollector(this, result.collector || '');
  }

  async remove_data_collector(collectorId) {
    await bidiNetwork.remove_data_collector(this._owner._driver, collectorId);
    return this._owner;
  }

  async get_data(collectorId, requestId, dataType = 'response') {
    const result = await bidiNetwork.get_data(
      this._owner._driver,
      collectorId,
      requestId,
      dataType
    );
    return new NetworkData(result);
  }

  async disown_data(collectorId, requestId, dataType = 'response') {
    return bidiNetwork.disown_data(this._owner._driver, collectorId, requestId, dataType);
  }

  toString() {
    return '<NetworkManager>';
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toString();
  }
}

module.exports = { NetworkManager, DataCollector, NetworkData };
