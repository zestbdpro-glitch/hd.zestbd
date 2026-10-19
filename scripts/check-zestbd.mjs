import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const base = process.env.PREVIEW_URL || 'http://127.0.0.1:5174';
const directory = 'test-results/zestbd';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch();
try {
  for (const [name, width, height] of [['desktop', 1440, 1000], ['tablet', 768, 1024], ['mobile', 375, 812], ['small-mobile', 320, 720]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base);
    await page.locator('[data-gallery-thumbs] .thumb').first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator('html').getAttribute('lang'), 'bn');
    assert.equal(await page.locator('[data-brand-name]').textContent(), 'zestbd');
    assert.equal(await page.locator('[data-gallery-thumbs] .thumb').count(), 4);
    for (let index = 0; index < 4; index++) {
      await page.locator('[data-gallery-thumbs] .thumb').nth(index).click();
      await page.waitForFunction(() => { const image = document.querySelector('[data-gallery-stage] img'); return image?.complete && image.naturalWidth > 0; });
      const state = await page.locator('[data-gallery-stage] img').evaluate((image) => ({ width: image.naturalWidth, height: image.naturalHeight, fit: getComputedStyle(image).objectFit }));
      assert.equal(state.width / state.height, 4 / 3);
      assert.equal(state.fit, 'contain');
    }
    await page.locator('[data-gallery-thumbs] .thumb').first().click();
    await page.evaluate(() => window.scrollTo(0, 0));
    const layout = await page.evaluate(() => {
      const width = document.documentElement.clientWidth;
      const invalid = [...document.querySelectorAll('main *, header *, footer *')].filter((element) => {
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || style.position === 'absolute') return false;
        const box = element.getBoundingClientRect();
        return box.width > 0 && (box.left < -1 || box.right > width + 1);
      }).map((element) => element.tagName + '.' + element.className);
      return { overflow: document.documentElement.scrollWidth > width, invalid, font: document.fonts.check('400 16px "Noto Sans Bengali"') };
    });
    assert.equal(layout.overflow, false, name);
    assert.deepEqual(layout.invalid, [], name);
    assert.equal(layout.font, true);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `${directory}/${name}.png`, fullPage: true });
    await page.screenshot({ path: `${directory}/${name}-home.png` });
    console.log(`${name}: Bengali font, logo, 4 uncropped images, no overflow or page errors.`);
    await page.close();
  }
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const access = JSON.parse(await readFile('.local/preview-access.json', 'utf8'));
  await page.goto(`${base}/admin/`);
  await page.locator('[data-login-form] input[name=email]').fill(access.email);
  await page.locator('[data-login-form] input[name=password]').fill(access.password);
  await page.locator('[data-login-button]').click();
  await page.locator('[data-app]').waitFor({ state: 'visible' });
  await page.locator('[data-tab=media]').click();
  await page.locator('[data-media-form] .media-image').first().waitFor();
  assert.equal(await page.locator('[data-media-form] [data-media-slot]').count(), 5);
  assert.equal(await page.locator('[data-media-form] video').count(), 0);
  await page.locator('[data-media-form] button[type=submit]').click();
  await page.waitForFunction(() => document.querySelector('[data-message]').textContent.includes('Media saved'));
  await page.screenshot({ path: `${directory}/admin-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: `${directory}/admin-mobile.png`, fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
  await page.locator('[data-tab=product]').click();
  assert.equal(await page.locator('[data-product-form] input[name=price]').inputValue(), '3490');
  console.log('Admin: four editable images, optional video, save-media succeeds, product price remains 3490.');
  for (const resource of ['/favicon.svg', '/favicon.ico', '/favicon-32.png', '/apple-touch-icon.png', '/site.webmanifest']) {
    const response = await page.request.get(`${base}${resource}`);
    assert.equal(response.status(), 200, resource);
    assert.ok((await response.body()).length > 0);
  }
  await page.close();
} finally {
  await browser.close();
}
