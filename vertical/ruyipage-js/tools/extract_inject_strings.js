'use strict';

const fs = require('fs');
const path = require('path');

const pyPath = path.join(__dirname, '..', '..', 'ruyipage', 'ruyipage', '_pages', 'firefox_base.py');
const t = fs.readFileSync(pyPath, 'utf8');

function grab(re) {
  const m = t.match(re);
  if (!m) throw new Error(`no match: ${re}`);
  return m[1];
}

const actionVisual = grab(
  /def _get_action_visual_script\(\):[\s\S]*?return r"""([\s\S]*?)"""\s*\n\s*@staticmethod\s*\n\s*def _is_expected_navigation_abort/s
);
const xpathFrameBridge = grab(
  /def _get_xpath_picker_frame_bridge_script\(\):\s*\n\s*return r"""([\s\S]*?)"""\s*\n\s*@staticmethod\s*\n\s*def _get_xpath_picker_script/s
);
const xpathPicker = grab(
  /def _get_xpath_picker_script\(\):\s*\n\s*return r"""([\s\S]*?)"""\s*\n\s*# ===== __call__/s
);

const out = `'use strict';

module.exports = {
  actionVisual: ${JSON.stringify(actionVisual)},
  xpathFrameBridge: ${JSON.stringify(xpathFrameBridge)},
  xpathPicker: ${JSON.stringify(xpathPicker)},
};
`;
const dest = path.join(__dirname, '..', '_pages', '_inject_strings.js');
fs.writeFileSync(dest, out);
console.log('written', dest, out.length);
