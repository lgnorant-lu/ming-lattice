'use strict';

/**
 * By 定位器类型枚举
 */
const By = Object.freeze({
  CSS: 'css',
  XPATH: 'xpath',
  TEXT: 'text',
  INNER_TEXT: 'innerText',
  ACCESSIBILITY: 'accessibility',
  ID: 'id',
  CLASS_NAME: 'class name',
  TAG_NAME: 'tag name',
  NAME: 'name',
  LINK_TEXT: 'link text',
});

module.exports = { By };
