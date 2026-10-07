import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const output = resolve('.cache/live-smoke');
await mkdir(output, { recursive: true });
const extension = resolve('.output/chrome-mv3');
const context = await chromium.launchPersistentContext(resolve(output, `profile-${Date.now()}`), {
  channel: 'chromium', headless: true, viewport: { width: 1440, height: 1050 },
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
});
const results = [];
try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  for (const [id, language, expected] of [[413150, 'english', 'estimated'], [413150, 'russian', 'estimated'], [105600, 'english', 'estimated'], [570, 'english', 'unsupported'], [553280, 'english', 'unsupported']]) {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const url = `https://store.steampowered.com/app/${id}/?cc=us&l=${language}`;
    const result = { id, language, url, expected };
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      const host = page.locator('#steam-revenue-estimate');
      await host.waitFor({ timeout: 20_000 });
      await page.waitForFunction(() => document.getElementById('steam-revenue-estimate')?.dataset.state !== 'loading', undefined, { timeout: 25_000 });
      result.actual = await host.getAttribute('data-state');
      result.text = await host.locator('section').innerText();
      result.correctPlacement = await page.locator('#glanceMidCtn .glance_ctn_responsive_left > #steam-revenue-estimate:last-child').count() === 1;
      result.spacing = await host.evaluate(element => {
        const panel = element.shadowRoot.querySelector('section').getBoundingClientRect();
        const anchor = element.previousElementSibling.getBoundingClientRect();
        const parent = element.parentElement.getBoundingClientRect();
        return { topGap: panel.top - anchor.bottom, rightInset: parent.right - panel.right };
      });
      result.passed = result.actual === expected && result.correctPlacement && result.spacing.topGap >= 12 && result.spacing.rightInset >= 7;
      if (id === 413150 || id === 105600) {
        const prefix = id === 105600 ? 'terraria' : language;
        await page.screenshot({ path: resolve(output, `${prefix}.png`) });
        await host.locator('summary').click();
        await host.screenshot({ path: resolve(output, `${prefix}-details.png`) });
        await host.getByRole('button', { name: language === 'russian' ? 'Настройки' : 'Settings' }).click();
        await host.screenshot({ path: resolve(output, `${prefix}-settings.png`) });
      }
    } catch (error) { result.passed = false; result.error = String(error); }
    result.pageErrors = errors;
    results.push(result);
    console.log(JSON.stringify({ id, language, state: result.actual, passed: result.passed, error: result.error }));
    await page.close();
  }
  const cached = await worker.evaluate(async () => await chrome.storage.local.get(null));
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ checkedAt: new Date().toISOString(), results, cached }, null, 2));
  if (results.some(result => !result.passed)) process.exitCode = 1;
} finally { await context.close(); }
