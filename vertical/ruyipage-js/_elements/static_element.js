'use strict';

const cheerio = require('cheerio');
const { DOMParser } = require('@xmldom/xmldom');
const xpath = require('xpath');
const { parse_locator: parseLocator } = require('../_functions/locator');
const { NoneElement } = require('./none_element');

class StaticElement {
  constructor(tag, attrs, text = '', innerHtml = '', outerHtml = '') {
    this._type = 'StaticElement';
    this._tag = tag;
    this._attrs = attrs || {};
    this._text = text;
    this._inner_html = innerHtml;
    this._outer_html = outerHtml;
  }

  get tag() {
    return this._tag;
  }

  get text() {
    return this._text;
  }

  get html() {
    return this._outer_html;
  }

  get outer_html() {
    return this._outer_html;
  }

  get inner_html() {
    return this._inner_html;
  }

  get attrs() {
    return { ...this._attrs };
  }

  get link() {
    return this._attrs.href || '';
  }

  get src() {
    return this._attrs.src || '';
  }

  get value() {
    return this._attrs.value || '';
  }

  attr(name) {
    return this._attrs[name];
  }

  toString() {
    let t = this._text || '';
    if (t.length > 30) t = `${t.slice(0, 30)}...`;
    return `<StaticElement ${this._tag} "${t}">`;
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return this.toString();
  }
}

function _none() {
  return new NoneElement(null, 's_ele', {});
}

function _textOf($el) {
  return $el.text() || '';
}

function _attrsFromDom(node) {
  const out = {};
  if (node && node.attributes) {
    for (let i = 0; i < node.attributes.length; i += 1) {
      const a = node.attributes.item(i);
      if (a) out[a.name] = a.value;
    }
  }
  return out;
}

function _eleFromCheerio($, el) {
  const node = el[0];
  const tag = node && node.name ? node.name : '';
  const attrs = el.attr() || {};
  return new StaticElement(
    tag,
    attrs,
    _textOf(el),
    el.html() || '',
    $.html(el) || ''
  );
}

function make_static_ele(html, locator = null) {
  try {
    const $ = cheerio.load(html || '');
    if (locator == null) {
      const root = $.root().children().first().length ? $.root().children().first() : $.root();
      return _eleFromCheerio($, root);
    }

    const bidiLoc = parseLocator(locator);
    const locType = bidiLoc.type || '';
    const locValue = bidiLoc.value || '';

    if (locType === 'css') {
      const el = $(locValue).first();
      if (!el.length) return _none();
      return _eleFromCheerio($, el);
    }

    if (locType === 'innerText') {
      let found = null;
      $('*').each((_, node) => {
        const el = $(node);
        if (el.text().trim().includes(locValue)) {
          found = el;
          return false;
        }
        return undefined;
      });
      if (!found || !found.length) return _none();
      return _eleFromCheerio($, found);
    }

    if (locType === 'xpath') {
      const doc = new DOMParser().parseFromString(html || '', 'text/html');
      const nodes = xpath.select(locValue, doc);
      const n = Array.isArray(nodes) ? nodes[0] : nodes;
      if (!n || !n.nodeName) return _none();
      const tag = String(n.nodeName).toLowerCase();
      const attrs = _attrsFromDom(n);
      const inner = n.toString ? String(n.toString()) : '';
      return new StaticElement(tag, attrs, (n.textContent || '').trim(), inner, inner);
    }

    return _none();
  } catch (_) {
    return _none();
  }
}

function make_static_eles(html, locator) {
  const out = [];
  try {
    const $ = cheerio.load(html || '');
    const bidiLoc = parseLocator(locator);
    const locType = bidiLoc.type || '';
    const locValue = bidiLoc.value || '';

    if (locType === 'css') {
      $(locValue).each((_, node) => {
        const el = $(node);
        if (el.length) out.push(_eleFromCheerio($, el));
      });
    } else if (locType === 'innerText') {
      $('*').each((_, node) => {
        const el = $(node);
        if (el.text().trim().includes(locValue)) out.push(_eleFromCheerio($, el));
      });
    } else if (locType === 'xpath') {
      const doc = new DOMParser().parseFromString(html || '', 'text/html');
      const nodes = xpath.select(locValue, doc);
      const list = Array.isArray(nodes) ? nodes : [nodes];
      for (const n of list) {
        if (!n || !n.nodeName) continue;
        const tag = String(n.nodeName).toLowerCase();
        const attrs = _attrsFromDom(n);
        const inner = n.toString ? String(n.toString()) : '';
        out.push(new StaticElement(tag, attrs, (n.textContent || '').trim(), inner, inner));
      }
    }
  } catch (_) { /* ignore */ }
  return out;
}

module.exports = { StaticElement, make_static_ele, make_static_eles };
