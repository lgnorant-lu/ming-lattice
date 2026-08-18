'use strict';

const emulation = require('../_bidi/emulation_commands');
const bidiContext = require('../_bidi/browsing_context');

class EmulationManager {
  constructor(owner) {
    this._owner = owner;
  }

  _ctx() {
    return [this._owner._context_id];
  }

  _supported(result) {
    return result != null;
  }

  async set_geolocation(latitude, longitude, accuracy = 100) {
    await emulation.setGeolocationOverride(this._owner._driver._browser_driver, {
      latitude,
      longitude,
      accuracy,
      contexts: this._ctx(),
    });
    return this._owner;
  }

  async clear_geolocation() {
    await emulation.setGeolocationOverride(this._owner._driver._browser_driver, {
      contexts: this._ctx(),
    });
    return this._owner;
  }

  async set_timezone(timezoneId) {
    await emulation.setTimezoneOverride(
      this._owner._driver._browser_driver,
      timezoneId,
      this._ctx()
    );
    return this._owner;
  }

  async set_locale(locales) {
    await emulation.setLocaleOverride(
      this._owner._driver._browser_driver,
      locales,
      this._ctx()
    );
    return this._owner;
  }

  async set_screen_orientation(orientationType, angle = 0) {
    await emulation.setScreenOrientationOverride(
      this._owner._driver._browser_driver,
      orientationType,
      angle,
      this._ctx()
    );
    return this._owner;
  }

  async set_screen_size(width, height, devicePixelRatio = null) {
    await emulation.setScreenSettingsOverride(this._owner._driver._browser_driver, {
      width,
      height,
      device_pixel_ratio: devicePixelRatio,
      contexts: this._ctx(),
    });
    return this._owner;
  }

  async set_screen_settings({ width = null, height = null, device_pixel_ratio: dpr = null } = {}) {
    await emulation.setScreenSettingsOverride(this._owner._driver._browser_driver, {
      width,
      height,
      device_pixel_ratio: dpr,
      contexts: this._ctx(),
    });
    return this._owner;
  }

  async set_user_agent(userAgent, platform = null) {
    const result = await emulation.setUserAgentOverride(
      this._owner._driver._browser_driver,
      userAgent,
      platform,
      this._ctx()
    );
    if (result == null) {
      await this._owner.set_useragent(userAgent);
    }
    return this._owner;
  }

  async set_network_offline(enabled = true) {
    const result = await emulation.setNetworkConditions(
      this._owner._driver._browser_driver,
      enabled,
      this._ctx()
    );
    return this._supported(result);
  }

  async set_touch_enabled(enabled = true, maxTouchPoints = 1, scope = 'context') {
    const value = enabled ? maxTouchPoints : null;
    const bd = this._owner._driver._browser_driver;
    let result;
    if (scope === 'global') {
      result = await emulation.setTouchOverride(bd, { max_touch_points: value });
    } else if (scope === 'user_context') {
      const userContext = this._owner.browser && this._owner.browser.options
        ? this._owner.browser.options.user_context
        : null;
      result = await emulation.setTouchOverride(bd, {
        max_touch_points: value,
        user_contexts: userContext || null,
      });
    } else {
      result = await emulation.setTouchOverride(bd, {
        max_touch_points: value,
        contexts: this._ctx(),
      });
    }
    return this._supported(result);
  }

  async set_javascript_enabled(enabled = true) {
    const result = await emulation.setScriptingEnabled(
      this._owner._driver._browser_driver,
      enabled,
      this._ctx()
    );
    return this._supported(result);
  }

  async set_scrollbar_type(scrollbarType = 'overlay') {
    const result = await emulation.setScrollbarTypeOverride(
      this._owner._driver._browser_driver,
      scrollbarType,
      this._ctx()
    );
    return this._supported(result);
  }

  async set_forced_colors_mode(mode = 'dark') {
    const result = await emulation.setForcedColorsModeThemeOverride(
      this._owner._driver._browser_driver,
      mode,
      this._ctx()
    );
    return this._supported(result);
  }

  async set_bypass_csp(enabled = true) {
    const result = await bidiContext.set_bypass_csp(
      this._owner._driver._browser_driver,
      this._owner._context_id,
      !!enabled
    );
    return this._supported(result);
  }

  async set_viewport_override(viewport, devicePixelRatio = null) {
    await emulation.setViewportOverride(this._owner._driver._browser_driver, {
      viewport,
      device_pixel_ratio: devicePixelRatio,
      contexts: this._ctx(),
    });
    return this._owner;
  }

  async apply_mobile_preset(userAgent, {
    width = 390,
    height = 844,
    device_pixel_ratio: devicePixelRatio = 3.0,
    orientation_type: orientationType = 'portrait-primary',
    angle = 0,
    locale = null,
    timezone_id: timezoneId = null,
    touch = true,
  } = {}) {
    const support = {
      user_agent: true,
      screen: true,
      orientation: true,
      touch: touch != null ? await this.set_touch_enabled(touch) : null,
      locale: null,
      timezone: null,
    };
    try {
      await this.set_user_agent(userAgent);
    } catch (_) {
      support.user_agent = false;
    }
    try {
      await this.set_screen_size(width, height, devicePixelRatio);
      await this._owner.set_viewport(width, height, devicePixelRatio);
    } catch (_) {
      support.screen = false;
    }
    try {
      await this.set_screen_orientation(orientationType, angle);
    } catch (_) {
      support.orientation = false;
    }
    if (locale) {
      try {
        await this.set_locale(locale);
        support.locale = true;
      } catch (_) {
        support.locale = false;
      }
    }
    if (timezoneId) {
      try {
        await this.set_timezone(timezoneId);
        support.timezone = true;
      } catch (_) {
        support.timezone = false;
      }
    }
    return support;
  }

  toString() {
    return '<EmulationManager>';
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toString();
  }
}

module.exports = { EmulationManager };
