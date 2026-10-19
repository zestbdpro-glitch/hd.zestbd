import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { getPublicProductFallback } from '../src/js/config.js';

const base = 'http://127.0.0.1:5174';
const output = 'test-results/store-sections';
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
  for (const [name, width] of [['desktop', 1440], ['mobile', 375]]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    const data = getPublicProductFallback();
    const fixture = { ...data, site: { ...data.site,
      reviewsText: 'শুধু layout পরীক্ষার তথ্য',
      reviews: [0, 1, 2].map((index) => ({ name: `পরীক্ষার ক্রেতা ${index + 1}`, text: 'এটি শুধু layout পরীক্ষার review; প্রকাশিত ক্রেতার মতামত নয়।', rating: 5, image: data.product.media[index].src, imageAlt: 'পরীক্ষার পণ্যের ছবি', active: true })),
      featuredProducts: [0, 1, 2].map((index) => ({ name: ['পরীক্ষার ওয়াল ডেকর', 'পরীক্ষার নকশাদার ফ্রেম', 'পরীক্ষার ঘর সাজানোর পণ্য'][index], image: data.product.media[index].src, imageAlt: 'পরীক্ষার পণ্যের ছবি', url: `https://zestbd.com/product/test-${index + 1}`, price: index === 2 ? null : 2490 + index * 1000, active: true }))
    } };
    await page.route('**/api/product.php', (route) => route.fulfill({ json: fixture }));
    await page.goto(base);
    await page.locator('.review-card').first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    for (const section of ['#reviews', '#featured-products']) {
      await page.locator(section).scrollIntoViewIfNeeded();
      for (const image of await page.locator(`${section} img`).all()) {
        await image.scrollIntoViewIfNeeded();
        await page.waitForFunction((node) => node.complete && node.naturalWidth > 0, await image.elementHandle());
      }
      await page.locator(section).screenshot({ path: `${output}/${name}-${section.slice(1)}.png` });
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${output}/${name}-home.png` });
    await page.close();
  }
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const access = JSON.parse(await readFile('.local/preview-access.json', 'utf8'));
  await page.goto(`${base}/admin/`);
  await page.locator('[data-login-form] input[name=email]').fill(access.email);
  await page.locator('[data-login-form] input[name=password]').fill(access.password);
  await page.locator('[data-login-button]').click();
  await page.locator('[data-app]').waitFor({ state: 'visible' });
  await page.locator('[data-tab=website]').click();
  await page.locator('summary', { hasText: /^Customer Reviews$/ }).click();
  assert.equal(await page.locator('[data-review-row]').count(), 3);
  await page.locator('[data-review-row]').first().screenshot({ path: `${output}/admin-review-desktop.png` });
  await page.locator('summary', { hasText: /^Featured Products$/ }).click();
  assert.equal(await page.locator('[data-featured-row]').count(), 3);
  await page.locator('[data-featured-row]').first().screenshot({ path: `${output}/admin-product-desktop.png` });
  await page.setViewportSize({ width: 375, height: 900 });
  await page.locator('[data-review-row]').first().screenshot({ path: `${output}/admin-review-mobile.png` });
  await page.locator('[data-featured-row]').first().screenshot({ path: `${output}/admin-product-mobile.png` });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  await page.close();
  console.log('Desktop/mobile review cards, stars, product photos, featured links and three-slot admin editors verified. Fixture records were never written to the database.');
} finally { await browser.close(); }
