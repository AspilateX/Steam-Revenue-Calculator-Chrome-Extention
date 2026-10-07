import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, expect, test, type BrowserContext, type Worker } from '@playwright/test';

let context: BrowserContext;
let worker: Worker;
let html: string;
let profile: string;

test.beforeEach(async ({}, testInfo) => {
  const extension = resolve('.output/chrome-mv3');
  profile = testInfo.outputPath('profile');
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  html = await readFile('tests/fixtures/steam-english.html', 'utf8');
  const meta = JSON.parse(await readFile('tests/fixtures/appdetails-live.json', 'utf8'));
  meta['413150'].data.price_overview.initial = 2000;
  meta['413150'].data.price_overview.final = 1000;
  await worker.evaluate(({ meta }) => {
    const state = globalThis as typeof globalThis & { requests: string[] };
    state.requests = [];
    globalThis.fetch = async input => {
      const url = String(input); state.requests.push(url);
      return Response.json(url.includes('/api/appdetails') ? meta : { success: 1, query_summary: { total_reviews: 100 } });
    };
  }, { meta });
  await context.route('https://store.steampowered.com/**', async route => {
    if (route.request().isNavigationRequest()) await route.fulfill({ contentType: 'text/html', body: html });
    else await route.abort();
  });
});
test.afterEach(async () => { await context?.close(); });

test('renders one block after publisher and saves/reset assumptions without fetching again', async () => {
  const page = await context.newPage();
  await page.goto('https://store.steampowered.com/app/413150/Game/');
  const host = page.locator('#steam-revenue-estimate');
  await expect(host).toHaveAttribute('data-state', 'estimated');
  await expect(page.locator('#glanceMidCtn .glance_ctn_responsive_left > #steam-revenue-estimate:last-child')).toHaveCount(1);
  await expect(host.locator('summary')).toHaveText('Details');
  await expect(host.locator('.settings-panel')).toBeHidden();
  await expect(host.locator('.range').first()).not.toContainText('Scenario range');
  await host.locator('summary').click();
  await expect(host.locator('.details > dl')).toContainText('USD 40,000.00');
  await expect(host.locator('.legend')).toContainText('USD 11,800.00');
  await host.getByRole('button', { name: 'Settings' }).click();
  await expect(host.getByLabel('Automatic multiplier')).toBeChecked();
  await expect(host.getByLabel('Multiplier', { exact: true })).toBeDisabled();
  await host.getByLabel('Steam commission (%)').fill('20');
  await host.getByRole('button', { name: 'Apply & save' }).click();
  await expect(host.locator('.legend')).toContainText('USD 14,160.00');
  expect(await worker.evaluate(() => (globalThis as typeof globalThis & { requests: string[] }).requests.length)).toBe(2);
  await page.reload();
  await expect(host).toHaveAttribute('data-state', 'estimated');
  await host.locator('summary').click();
  await host.getByRole('button', { name: 'Settings' }).click();
  await expect(host.getByLabel('Steam commission (%)')).toHaveValue('20');
  await expect(host.locator('.legend')).toContainText('USD 14,160.00');
  await host.getByRole('button', { name: 'Reset defaults' }).click();
  await expect(host.getByLabel('Steam commission (%)')).toHaveValue('30');
  await host.getByLabel('Steam commission (%)').focus();
  await page.keyboard.press('Escape');
  await expect(host.locator('.settings-panel')).toBeHidden();
  await expect(host.getByRole('button', { name: 'Settings' })).toBeFocused();
  await page.evaluate(() => document.getElementById('steam-revenue-estimate')?.remove());
  await expect(host).toHaveCount(1); await expect(host).toHaveAttribute('data-state', 'estimated');
  expect(await worker.evaluate(() => (globalThis as typeof globalThis & { requests: string[] }).requests.length)).toBe(2);
});

test('supports Russian pages and keyboard details', async () => {
  html = await readFile('tests/fixtures/steam-russian.html', 'utf8');
  const page = await context.newPage(); await page.goto('https://store.steampowered.com/app/413150/Game/?l=russian');
  const host = page.locator('#steam-revenue-estimate');
  await expect(host).toHaveAttribute('data-state', 'estimated');
  await expect(host).toContainText('Приблизительная выручка');
  await host.locator('summary').focus(); await page.keyboard.press('Enter');
  await expect(host.locator('details')).toHaveAttribute('open', '');
  await host.getByRole('button', { name: 'Настройки' }).click();
  await expect(host.getByLabel('Комиссия Steam (%)')).toHaveValue('30');
});

test('keeps publisher and later metadata above the estimate without refetching', async () => {
  html = html.replace(/<a href="https:\/\/store\.steampowered\.com\/publisher\/[^\"]+">([^<]+)<\/a>/, '<span>$1</span>');
  const page = await context.newPage();
  await page.goto('https://store.steampowered.com/app/413150/Game/');
  const host = page.locator('#steam-revenue-estimate');
  const lastHost = page.locator('#glanceMidCtn .glance_ctn_responsive_left > #steam-revenue-estimate:last-child');
  await expect(host).toHaveAttribute('data-state', 'estimated');
  await expect(lastHost).toHaveCount(1);
  await expect(page.locator('#glanceMidCtn .dev_row + .dev_row')).toContainText('Publisher:');
  await page.evaluate(() => {
    const row = document.createElement('div'); row.className = 'dev_row'; row.textContent = 'Franchise: Test';
    document.querySelector('#glanceMidCtn .glance_ctn_responsive_left')!.append(row);
  });
  await expect(lastHost).toHaveCount(1);
  await expect(page.locator('#glanceMidCtn .dev_row + #steam-revenue-estimate')).toHaveCount(1);
  expect(await worker.evaluate(() => (globalThis as typeof globalThis & { requests: string[] }).requests.length)).toBe(2);
});

test('full billion-dollar amounts remain readable in narrow English and Russian columns', async () => {
  await worker.evaluate(() => {
    globalThis.fetch = async input => Response.json(String(input).includes('appdetails') ? {
      '413150': { success: true, data: { steam_appid: 413150, type: 'game', is_free: false, release_date: { coming_soon: false }, price_overview: { currency: 'USD', initial: 9999 } } },
    } : { success: 1, query_summary: { total_reviews: 1000000 } });
  });
  for (const language of ['english', 'russian']) {
    html = await readFile(`tests/fixtures/steam-${language}.html`, 'utf8');
    const page = await context.newPage();
    await page.goto('https://store.steampowered.com/app/413150/Game/');
    const host = page.locator('#steam-revenue-estimate');
    await expect(host).toHaveAttribute('data-state', 'estimated');
    for (const width of [366, 280]) {
      await page.locator('#glanceMidCtn .glance_ctn_responsive_left').evaluate((container, width) => { (container as HTMLElement).style.width = `${width}px`; }, width);
      const layout = await host.evaluate(element => {
        const section = element.shadowRoot!.querySelector('section')!;
        const title = element.shadowRoot!.querySelector('h3')!;
        const range = element.shadowRoot!.querySelector('.range')!;
        return { fits: section.scrollWidth <= section.clientWidth, titleSize: getComputedStyle(title).fontSize, rangeSize: getComputedStyle(range).fontSize };
      });
      expect(layout).toEqual({ fits: true, titleSize: '12px', rangeSize: '12px' });
    }
    await expect(host.locator('.amount strong').first()).toContainText(language === 'english' ? '4,799,520,000' : '4 799 520 000');
    await page.close();
  }
});

test('waits for late metadata and omits unrelated pages', async () => {
  const normal = html; html = '<html lang="en"><body><main id="late"></main></body></html>';
  const page = await context.newPage(); await page.goto('https://store.steampowered.com/app/413150/Game/');
  await expect(page.locator('#steam-revenue-estimate')).toHaveCount(0);
  await page.evaluate(body => { document.querySelector('#late')!.innerHTML = new DOMParser().parseFromString(body, 'text/html').body.innerHTML; }, normal);
  await expect(page.locator('#steam-revenue-estimate')).toHaveAttribute('data-state', 'estimated');
  await page.evaluate(() => history.pushState({}, '', '/search/'));
  await expect(page.locator('#steam-revenue-estimate')).toHaveCount(0);
});

test('shows unavailable for non-USD API and ambiguous page currency', async () => {
  html = html.replace('content="USD"', 'content="CAD"');
  await worker.evaluate(() => {
    globalThis.fetch = async input => Response.json(String(input).includes('appdetails') ? {
      '413150': { success: true, data: { steam_appid: 413150, type: 'game', is_free: false, release_date: { coming_soon: false }, price_overview: { currency: 'CAD', initial: 2000 } } },
    } : { success: 1, query_summary: { total_reviews: 100 } });
  });
  const page = await context.newPage(); await page.goto('https://store.steampowered.com/app/413150/Game/');
  const host = page.locator('#steam-revenue-estimate');
  await expect(host).toHaveAttribute('data-state', 'unavailable');
  await expect(host).toContainText('No trustworthy ordinary USD price');
  await expect(host.locator('.amount')).toHaveCount(0);
});

test('discards a response after navigation to another AppID', async () => {
  await worker.evaluate(() => {
    globalThis.fetch = async input => {
      await new Promise(resolve => setTimeout(resolve, 700));
      const url = new URL(String(input));
      if (url.pathname.includes('appdetails')) {
        const id = Number(url.searchParams.get('appids'));
        return Response.json({ [id]: { success: true, data: { steam_appid: id, type: id === 123 ? 'dlc' : 'game', is_free: false, release_date: { coming_soon: false }, price_overview: { currency: 'USD', initial: 2000 } } } });
      }
      return Response.json({ success: 1, query_summary: { total_reviews: 100 } });
    };
  });
  const page = await context.newPage(); await page.goto('https://store.steampowered.com/app/413150/Game/');
  await expect(page.locator('#steam-revenue-estimate')).toHaveAttribute('data-state', 'loading');
  await page.evaluate(() => history.pushState({}, '', '/app/123/Other/'));
  await expect(page.locator('#steam-revenue-estimate')).toHaveAttribute('data-state', 'unsupported');
  await expect(page.locator('#steam-revenue-estimate')).toContainText('Only base games are supported');
});

test('rejects F2P, DLC, demo, unreleased games and zero reviews', async () => {
  const page = await context.newPage();
  for (const option of [
    { type: 'game', isFree: true, comingSoon: false, reviews: 100 },
    { type: 'dlc', isFree: false, comingSoon: false, reviews: 100 },
    { type: 'demo', isFree: true, comingSoon: false, reviews: 100 },
    { type: 'game', isFree: false, comingSoon: true, reviews: 100 },
    { type: 'game', isFree: false, comingSoon: false, reviews: 0 },
  ]) {
    await worker.evaluate(async config => {
      await chrome.storage.local.clear();
      globalThis.fetch = async input => Response.json(String(input).includes('appdetails') ? {
        '413150': { success: true, data: { steam_appid: 413150, type: config.type, is_free: config.isFree, release_date: { coming_soon: config.comingSoon }, price_overview: { currency: 'USD', initial: 2000 } } },
      } : { success: 1, query_summary: { total_reviews: config.reviews } });
    }, option);
    await page.goto('https://store.steampowered.com/app/413150/Game/');
    await expect(page.locator('#steam-revenue-estimate')).toHaveAttribute('data-state', 'unsupported');
    await expect(page.locator('#steam-revenue-estimate .amount')).toHaveCount(0);
  }
});

test('uses stale cache while offline and refuses unsupported fallback counts', async () => {
  await worker.evaluate(async () => {
    const timestamp = Date.now() - 48 * 60 * 60 * 1000;
    await chrome.storage.local.set({ 'revenue:facts:v1:US:USD:all:steam:offtopic:413150': {
      updatedAt: timestamp,
      metadata: { value: { type: 'game', isFree: false, comingSoon: false, earlyAccess: false, priceCents: 2000 }, source: 'steam-api', stale: false, fetchedAt: timestamp },
      reviews: { value: 100, source: 'steam-api', stale: false, fetchedAt: timestamp },
    } });
    globalThis.fetch = async () => { throw new Error('offline'); };
  });
  const page = await context.newPage(); await page.goto('https://store.steampowered.com/app/413150/Game/');
  await expect(page.locator('#steam-revenue-estimate')).toHaveAttribute('data-state', 'estimated');
  await expect(page.locator('#steam-revenue-estimate')).toContainText('Using older cached data');
  await worker.evaluate(async () => { await chrome.storage.local.clear(); });
  await page.reload();
  await expect(page.locator('#steam-revenue-estimate')).toHaveAttribute('data-state', 'unavailable');
  await expect(page.locator('#steam-revenue-estimate')).toContainText('No compatible global lifetime review count');
});

test('does not bypass an age gate or fetch without a reliable anchor', async () => {
  html = '<html lang="en"><body><h1>Age verification</h1></body></html>';
  const page = await context.newPage(); await page.goto('https://store.steampowered.com/app/413150/Game/');
  await expect(page.locator('h1')).toHaveText('Age verification');
  await expect(page.locator('#steam-revenue-estimate')).toHaveCount(0);
  expect(await worker.evaluate(() => (globalThis as typeof globalThis & { requests: string[] }).requests.length)).toBe(0);
});

test('recovers cached facts after browser and service worker restart', async () => {
  const page = await context.newPage(); await page.goto('https://store.steampowered.com/app/413150/Game/');
  await expect(page.locator('#steam-revenue-estimate')).toHaveAttribute('data-state', 'estimated');
  await context.close();
  const extension = resolve('.output/chrome-mv3');
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  // No worker fetch patch is restored: the estimate must survive using storage.
  await context.route('https://store.steampowered.com/**', async route => {
    if (route.request().isNavigationRequest()) await route.fulfill({ contentType: 'text/html', body: html });
    else await route.abort();
  });
  const reopened = await context.newPage();
  await reopened.goto('https://store.steampowered.com/app/413150/Game/');
  await expect(reopened.locator('#steam-revenue-estimate')).toHaveAttribute('data-state', 'estimated');
  await reopened.locator('#steam-revenue-estimate summary').click();
  await expect(reopened.locator('#steam-revenue-estimate .legend')).toContainText('USD 11,800.00');
});
