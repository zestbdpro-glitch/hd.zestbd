import { expect, test } from '@playwright/test';
import { getPublicProductFallback } from '../src/js/config.js';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/product.php', (route) => route.fulfill({ json: getPublicProductFallback() }));
  await page.route('**/api/order.php', (route) => route.fulfill({ json: { orderReference: 'ZB-TEST', totalAmount: 7060 } }));
});

const viewports = [
  [320, 720],
  [360, 760],
  [375, 780],
  [390, 820],
  [414, 860],
  [768, 900],
  [1024, 900],
  [1440, 1000]
];

test.describe('landing page responsiveness', () => {
  for (const [width, height] of viewports) {
    test(`has no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto('/');
      await expect(page.getByRole('heading', { name: getPublicProductFallback().product.headline, exact: true })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});

test('gallery shows four distinct product images without a demo video', async ({ page }) => {
  await page.goto('/');
  const thumbs = page.locator('.thumb');
  await expect(thumbs).toHaveCount(4);
  const media = getPublicProductFallback().product.media;
  expect(media.every((item) => item.type === 'image')).toBe(true);
  expect(new Set(media.map((item) => item.src)).size).toBe(4);
  expect(media.map((item) => item.src)).toEqual([
    './assets/images/wall-decor-front.webp',
    './assets/images/wall-decor-right.webp',
    './assets/images/wall-decor-left.webp',
    './assets/images/wall-decor-close.webp'
  ]);
  for (const [index, item] of media.entries()) {
    await thumbs.nth(index).click();
    const image = page.locator('[data-gallery-stage] img');
    await expect(image).toHaveAttribute('alt', item.alt);
    await expect(image).toHaveJSProperty('currentSrc', new URL(item.src, page.url()).href);
    await expect.poll(() => image.evaluate((element) => element.complete && element.naturalWidth > 0)).toBe(true);
    await expect(thumbs.nth(index)).toHaveAttribute('aria-selected', 'true');
  }
  await expect(page.locator('[data-gallery-stage] video, [data-gallery-stage] .video-play, .play-dot')).toHaveCount(0);
});

for (const count of [1, 3, 5]) {
  test(`gallery supports ${count} images`, async ({ page }) => {
    const data = getPublicProductFallback();
    const media = Array.from({ length: count }, (_, index) => ({
      ...data.product.media[index % data.product.media.length],
      id: `test-image-${index}`
    }));
    await page.route('**/api/product.php', (route) => route.fulfill({ json: {
      ...data,
      product: { ...data.product, media }
    } }));
    await page.goto('/');
    const thumbs = page.locator('.thumb');
    await expect(thumbs).toHaveCount(count);
    await thumbs.last().click();
    await expect(page.locator('[data-gallery-stage] img')).toHaveAttribute('alt', media[count - 1].alt);
    await expect(thumbs.last()).toHaveAttribute('aria-selected', 'true');
  });
}

test('storefront uses Bengali content, zestbd branding and relative icons', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'bn');
  await expect(page).toHaveTitle(`zestbd - ${getPublicProductFallback().product.headline}`);
  await expect(page.locator('[data-brand-name], [data-brand-name-footer], [data-brand-name-copy]')).toHaveText(['zestbd', 'zestbd', 'zestbd']);
  await expect(page.locator('.brand-symbol')).toHaveCount(2);
  for (const logo of await page.locator('.brand-symbol').all()) {
    await expect(logo).toHaveAttribute('src', './assets/brand/zestbd-mark.svg');
    await expect.poll(() => logo.evaluate((element) => element.complete && element.naturalWidth > 0)).toBe(true);
  }
  await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveAttribute('href', './favicon.svg');
  await expect(page.locator('link[rel="icon"][type="image/png"]')).toHaveAttribute('href', './favicon-32.png');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', './apple-touch-icon.png');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', './site.webmanifest');
  await expect(page.locator('[data-product-description]')).toHaveText(getPublicProductFallback().product.description);
  await expect(page.locator('[data-product-description]')).toContainText(/[অ-হ]/);
});

test('mobile navigation opens and anchor links scroll', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 780 });
  await page.goto('/');
  await page.getByRole('button', { name: 'মেনু খুলুন' }).click();
  await expect(page.locator('[data-nav]')).toHaveClass(/is-open/);
  await page.getByRole('link', { name: 'সাধারণ প্রশ্ন', exact: true }).click();
  await expect(page.locator('[data-nav]')).not.toHaveClass(/is-open/);
});

test('order form validates in Bengali and submits normalized Bengali digits', async ({ page }) => {
  await page.goto('/#order');
  await page.getByRole('button', { name: 'অর্ডার নিশ্চিত করুন' }).click();
  await expect(page.getByText('চিহ্নিত ঘরগুলোর তথ্য ঠিক করে আবার চেষ্টা করুন।')).toBeVisible();
  await expect(page.locator('[data-error-for="customerPhone"]')).toHaveText('বাংলাদেশের একটি সঠিক মোবাইল নম্বর লিখুন।');

  await page.getByLabel('পুরো নাম').fill('পরীক্ষার ক্রেতা');
  await page.getByLabel('মোবাইল নম্বর').fill('+৮৮০ ১৭১২-৩৪৫৬৭৮');
  await page.getByLabel('ডেলিভারির সম্পূর্ণ ঠিকানা').fill('বাড়ি ১২, রোড ৪, ধানমন্ডি, ঢাকা');
  await page.getByLabel('পরিমাণ', { exact: true }).fill('২');
  await expect(page.locator('[data-summary-quantity]')).toHaveText('২');
  const request = page.waitForRequest('**/api/order.php');
  await page.getByRole('button', { name: 'অর্ডার নিশ্চিত করুন' }).click();
  const payload = (await request).postDataJSON();
  expect(payload.productSlug).toBe('zestbd-green-wall-decor');
  expect(payload.customerName).toBe('পরীক্ষার ক্রেতা');
  expect(payload.customerPhone).toBe('01712345678');
  expect(payload.quantity).toBe(2);
  await expect(page.getByText(/আপনার অর্ডার পাওয়া গেছে। অর্ডার নম্বর: ZB-TEST/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'অর্ডার নিশ্চিত করুন' })).toBeEnabled();
});

test('invalid Bengali quantity is rejected before sending an order', async ({ page }) => {
  let submitted = false;
  await page.route('**/api/order.php', (route) => {
    submitted = true;
    return route.fulfill({ json: { orderReference: 'ZB-TEST', totalAmount: 7060 } });
  });
  await page.goto('/#order');
  await page.getByLabel('পুরো নাম').fill('পরীক্ষার ক্রেতা');
  await page.getByLabel('মোবাইল নম্বর').fill('০১৭১২৩৪৫৬৭৮');
  await page.getByLabel('ডেলিভারির সম্পূর্ণ ঠিকানা').fill('বাড়ি ১২, রোড ৪, ধানমন্ডি, ঢাকা');
  await page.getByLabel('পরিমাণ', { exact: true }).fill('১.৫');
  await page.getByRole('button', { name: 'অর্ডার নিশ্চিত করুন' }).click();
  await expect(page.locator('[data-error-for="quantity"]')).toHaveText('পরিমাণ ১ থেকে ১০-এর মধ্যে পূর্ণসংখ্যা হতে হবে।');
  expect(submitted).toBe(false);
});

test('order failure fallback and restored submit button are Bengali', async ({ page }) => {
  await page.route('**/api/order.php', (route) => route.fulfill({ status: 500, contentType: 'text/plain', body: 'Server error' }));
  await page.goto('/#order');
  await page.getByLabel('পুরো নাম').fill('পরীক্ষার ক্রেতা');
  await page.getByLabel('মোবাইল নম্বর').fill('০১৭১২৩৪৫৬৭৮');
  await page.getByLabel('ডেলিভারির সম্পূর্ণ ঠিকানা').fill('বাড়ি ১২, রোড ৪, ধানমন্ডি, ঢাকা');
  await page.getByRole('button', { name: 'অর্ডার নিশ্চিত করুন' }).click();
  await expect(page.locator('[data-form-status]')).toHaveText('অর্ডার পাঠানো যায়নি। আবার চেষ্টা করুন।');
  await expect(page.getByRole('button', { name: 'অর্ডার নিশ্চিত করুন' })).toBeEnabled();
});

for (const [serverError, translatedError] of [
  ['There is not enough stock for this quantity.', 'এই পরিমাণ পণ্য স্টকে নেই। পরিমাণ কমিয়ে আবার চেষ্টা করুন।'],
  ['Unknown internal server details', 'অর্ডার পাঠানো যায়নি। আবার চেষ্টা করুন।']
]) {
  test(`order error is localized: ${serverError}`, async ({ page }) => {
    await page.route('**/api/order.php', (route) => route.fulfill({ status: 409, json: { error: serverError } }));
    await page.goto('/#order');
    await page.getByLabel('পুরো নাম').fill('পরীক্ষার ক্রেতা');
    await page.getByLabel('মোবাইল নম্বর').fill('০১৭১২৩৪৫৬৭৮');
    await page.getByLabel('ডেলিভারির সম্পূর্ণ ঠিকানা').fill('বাড়ি ১২, রোড ৪, ধানমন্ডি, ঢাকা');
    await page.getByRole('button', { name: 'অর্ডার নিশ্চিত করুন' }).click();
    await expect(page.locator('[data-form-status]')).toHaveText(translatedError);
    await expect(page.getByText(serverError, { exact: true })).toHaveCount(0);
  });
}

function siteCardsFixture() {
  const data = getPublicProductFallback();
  data.site = {
    ...data.site, mainSiteUrl: 'https://zestbd.com/', reviewsText: 'পরীক্ষার review fixture',
    reviews: [0, 1, 2].map((index) => ({ name: `পরীক্ষার ক্রেতা ${index + 1}`, text: `পরীক্ষার মতামত ${index + 1}`, rating: 5, active: true, image: index === 0 ? data.product.media[index].src : '', imageAlt: 'পরীক্ষার ক্রেতার ছবি' })),
    featuredProducts: [0, 1, 2].map((index) => ({ name: `পরীক্ষার পণ্য ${index + 1}`, price: index === 1 ? null : 499 + index, image: data.product.media[index].src, imageAlt: 'পরীক্ষার পণ্যের ছবি', url: `https://zestbd.com/product/test-${index + 1}`, active: true }))
  };
  return data;
}

test('logos navigate to the main store and the Bangladesh delivery promo is removed', async ({ page }) => {
  await page.route('https://zestbd.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<h1>Main Store Test</h1>' }));
  await page.goto('/');
  await expect(page.locator('.trust-list li')).toHaveCount(2);
  await expect(page.getByText('বাংলাদেশে ডেলিভারি', { exact: true })).toHaveCount(0);
  await expect(page.locator('[data-main-site-link]')).toHaveCount(2);
  for (const link of await page.locator('[data-main-site-link]').all()) await expect(link).toHaveAttribute('href', 'https://zestbd.com/');
  await page.locator('header [data-main-site-link]').click();
  await expect(page).toHaveURL('https://zestbd.com/');
});

for (const width of [320, 375, 768, 1440]) {
  test(`three review and featured product cards fit at ${width}px`, async ({ page }) => {
    const data = siteCardsFixture();
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/api/product.php', (route) => route.fulfill({ json: data }));
    await page.goto('/');
    await expect(page.locator('.review-card')).toHaveCount(3);
    await expect(page.locator('.review-stars svg')).toHaveCount(15);
    await expect(page.locator('.review-photo')).toHaveCount(1);
    await expect(page.locator('.featured-product')).toHaveCount(3);
    await expect(page.locator('#featured-products')).toBeVisible();
    await expect(page.locator('.review-stars').first()).toHaveAttribute('aria-label', '৫ / ৫ স্টার');
    await page.locator('#featured-products').scrollIntoViewIfNeeded();
    for (const image of await page.locator('.review-photo, .featured-product > img').all()) {
      await image.scrollIntoViewIfNeeded();
      await expect.poll(() => image.evaluate((node) => node.complete && node.naturalWidth > 0)).toBe(true);
      await expect(image).toHaveCSS('object-fit', 'contain');
    }
    const layout = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth + 1, footerAfterFeatured: document.querySelector('#featured-products').compareDocumentPosition(document.querySelector('footer')) & Node.DOCUMENT_POSITION_FOLLOWING }));
    expect(layout.overflow).toBe(false); expect(layout.footerAfterFeatured).toBeTruthy();
    await expect(page.locator('.featured-product').nth(1)).not.toContainText('৳');
  });
}

test('draft slots and unsafe featured URLs are not rendered', async ({ page }) => {
  const data = siteCardsFixture();
  data.site.reviews.forEach((review) => { review.active = false; });
  data.site.featuredProducts[0].active = false;
  data.site.featuredProducts[1].url = 'https://zestbd.com.attacker.invalid/product';
  data.site.featuredProducts[2].url = 'javascript:alert(1)';
  await page.route('**/api/product.php', (route) => route.fulfill({ json: data }));
  await page.goto('/');
  await expect(page.locator('#reviews')).toBeHidden();
  await expect(page.locator('#featured-products')).toBeHidden();
  await expect(page.locator('.review-card, .featured-product')).toHaveCount(0);
});

test('review ratings and image-free reviews render safely as text', async ({ page }) => {
  const data = siteCardsFixture();
  data.site.reviews[0] = { name: 'Test Author', text: '<img src=x onerror=alert(1)>', rating: 4, image: '', active: true };
  await page.route('**/api/product.php', (route) => route.fulfill({ json: data }));
  await page.goto('/');
  await expect(page.locator('.review-stars').first()).toHaveAttribute('aria-label', '৪ / ৫ স্টার');
  await expect(page.locator('.review-stars').first().locator('svg[fill="currentColor"]')).toHaveCount(4);
  await expect(page.locator('.review-card').first().locator('p')).toHaveText('<img src=x onerror=alert(1)>');
  await expect(page.locator('.review-card').first().locator('img')).toHaveCount(0);
});

test('featured cards navigate in the same tab to their configured main-store product', async ({ page }) => {
  const data = siteCardsFixture();
  await page.route('**/api/product.php', (route) => route.fulfill({ json: data }));
  await page.route('https://zestbd.com/product/test-2', (route) => route.fulfill({ contentType: 'text/html', body: '<h1>Product Link Test</h1>' }));
  await page.goto('/');
  await page.locator('.featured-product').nth(1).click();
  await expect(page).toHaveURL('https://zestbd.com/product/test-2');
});
