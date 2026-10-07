import { readFile, writeFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

for (const language of ['english', 'russian']) {
  const dom = new JSDOM(await readFile(`.cache/steam/${language}.html`, 'utf8'));
  const doc = dom.window.document;
  const propsElement = doc.querySelector('[data-featuretarget="appreviews"]');
  const props = JSON.parse(propsElement.getAttribute('data-props'));
  const compactProps = {
    appid: props.appid, app_type: props.app_type, appname: props.appname, app_release_date: props.app_release_date,
    summary_options: { summaryGlobalNoOutliers: props.summary_options.summaryGlobalNoOutliers },
    filter_options: { nReviewsSteamPurchase: props.filter_options.nReviewsSteamPurchase },
  };
  propsElement.setAttribute('data-props', JSON.stringify(compactProps));
  const selectorList = ['[itemprop="offers"]', '#glanceMidCtn', '#appDetailsUnderlinedLinks', '#game_area_purchase', '[data-featuretarget="appreviews"]'];
  const parts = selectorList.map(selector => {
    const fragment = doc.querySelector(selector).cloneNode(true);
    fragment.querySelectorAll('script, form, img, iframe, input[type="hidden"]').forEach(el => el.remove());
    for (const element of [fragment, ...fragment.querySelectorAll('*')]) {
      for (const attr of [...element.attributes]) {
        if (attr.name.startsWith('on') || attr.name === 'data-panel') element.removeAttribute(attr.name);
      }
    }
    return fragment.outerHTML.replace(/\s+</g, '<').replace(/>\s+/g, '>');
  });
  await writeFile(`tests/fixtures/steam-${language}.html`, `<!doctype html><html lang="${language === 'russian' ? 'ru' : 'en'}"><head><meta charset="utf-8"></head><body><main class="page_content_ctn" itemscope itemtype="http://schema.org/Product">${parts.join('\n')}</main></body></html>\n`);
}
const json = JSON.parse(await readFile('tests/fixtures/appdetails-live.json', 'utf8'));
const app = json['413150'].data;
await writeFile('tests/fixtures/appdetails-live.json', JSON.stringify({ '413150': { success: true, data: {
  steam_appid: app.steam_appid, type: app.type, is_free: app.is_free,
  price_overview: app.price_overview, release_date: app.release_date, genres: app.genres,
} } }, null, 2) + '\n');
