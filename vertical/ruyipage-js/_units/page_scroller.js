'use strict';

class PageScroller {
  constructor(owner) {
    this._owner = owner;
  }

  async to_top() {
    await this._owner.run_js('window.scrollTo(0,0)');
    return this._owner;
  }

  async to_bottom() {
    await this._owner.run_js('window.scrollTo(0, document.body.scrollHeight)');
    return this._owner;
  }

  async by(dx, dy) {
    await this._owner.run_js(`window.scrollBy(${Number(dx)}, ${Number(dy)})`);
    return this._owner;
  }

  /**
   * Python: ``scroll.to_see(ele_or_loc, center=False)``
   * @param {import('../_elements/firefox_element').FirefoxElement|string} eleOrLoc
   * @param {boolean} [center=false]
   */
  async to_see(eleOrLoc, center = false) {
    let el = eleOrLoc;
    if (typeof eleOrLoc === 'string') {
      el = await this._owner.ele(eleOrLoc);
    }
    if (!el || el.isNoneElement) return this._owner;
    const block = center ? 'center' : 'nearest';
    await el._runSafe(`(el) => el.scrollIntoView({ block: '${block}', inline: 'nearest' })`);
    return this._owner;
  }

  toString() {
    return '<PageScroller>';
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toString();
  }
}

module.exports = { PageScroller };
