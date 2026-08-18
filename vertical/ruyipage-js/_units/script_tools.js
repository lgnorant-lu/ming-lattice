'use strict';

class RealmInfo {
  constructor(data) {
    this.raw = { ...(data || {}) };
    this.realm = this.raw.realm;
    this.type = this.raw.type;
    this.context = this.raw.context;
    this.origin = this.raw.origin;
  }

  toString() {
    const r = this.realm != null ? String(this.realm).slice(0, 40) : '';
    return `<RealmInfo ${r}>`;
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toString();
  }
}

class ScriptRemoteValue {
  constructor(data) {
    this.raw = { ...(data || {}) };
    this.type = this.raw.type;
    this.handle = this.raw.handle;
    this.shared_id = this.raw.sharedId;
    this.value = this.raw.value;
  }

  toString() {
    const t = this.type || '';
    return `<ScriptRemoteValue ${t}>`;
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toString();
  }
}

class ScriptResult {
  constructor(data) {
    this.raw = { ...(data || {}) };
    this.type = this.raw.type;
    this.result = new ScriptRemoteValue(this.raw.result || {});
    this.exception_details = this.raw.exceptionDetails;
  }

  get success() {
    return this.type === 'success';
  }

  toString() {
    return `<ScriptResult success=${this.success}>`;
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toString();
  }
}

class PreloadScript {
  constructor(scriptId) {
    this.id = scriptId || '';
  }

  toString() {
    const id = (this.id || '').slice(0, 40);
    return `<PreloadScript ${id}>`;
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toString();
  }
}

module.exports = { RealmInfo, ScriptRemoteValue, ScriptResult, PreloadScript };
