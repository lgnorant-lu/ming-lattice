'use strict';

/**
 * 与 ``quickstart_bing_search.py`` 对齐（异步使用 async/await）。
 */

const { FirefoxOptions, FirefoxPage, Keys } = require('./index');

async function main() {
  const opts = new FirefoxOptions();
  // opts.set_browser_path(String.raw`D:\Firefox\firefox.exe`);
  // opts.set_user_dir(String.raw`D:\ruyipage_userdir`);

  const page = await FirefoxPage.create(opts);

  try {
    await page.get('https://cn.bing.com/');
    await (await page.ele('#sb_form_q')).input('小肩膀教育');
    await page.actions.press(Keys.ENTER).perform();
    await page.wait(3);

    for (let pageNo = 1; pageNo <= 3; pageNo += 1) {
      console.log('='.repeat(80));
      console.log(`第 ${pageNo} 页`);
      console.log('='.repeat(80));

      const items = await page.eles('css:#b_results > li.b_algo');

      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        const titleEle = await item.ele('css:h2 a');
        if (titleEle.isNoneElement) continue;

        const title = ((await titleEle.text) || '').trim().split(/\s+/).join(' ');
        const url = (await titleEle.attr('href')) || '';

        const descEle = await item.ele('css:.b_caption p');
        const itemText = descEle.isNoneElement ? (await item.text) : (await descEle.text);
        const content = ((itemText) || '').trim().split(/\s+/).join(' ');

        console.log(`${i + 1}. ${title}`);
        console.log(`   URL: ${url}`);
        console.log(`   内容: ${content}`);
      }

      if (pageNo < 3) {
        const nextBtn = await page.ele('css:a.sb_pagN');
        if (nextBtn.isNoneElement) break;
        await nextBtn.click_self();
        await page.wait(2);
      }
    }
  } finally {
    await page.quit();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
