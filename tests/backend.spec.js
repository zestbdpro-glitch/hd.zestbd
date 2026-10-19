import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { SITE_CONFIG } from '../src/js/config.js';

test.describe.configure({ mode: 'serial' });
const credentials = { email: 'test-admin@example.com', password: 'Test-only-password-2026' };
let admin; let csrf; let product; let site; let zones; let forgedOrder; let limitedOrder;
const worker = (input) => new Promise((resolve, reject) => {
  const child = spawn(process.env.PHP_BINARY, ['tests/backend-worker.php'], { env: process.env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let output = ''; let errors = '';
  child.stdout.on('data', (chunk) => { output += chunk; }); child.stderr.on('data', (chunk) => { errors += chunk; });
  child.on('error', reject); child.on('exit', (code) => { try { if (code !== 0) throw new Error(errors); resolve(JSON.parse(output)); } catch (error) { reject(error); } });
  child.stdin.end(JSON.stringify(input));
});
const adminPost = (body, headers = {}) => admin.post('/api/admin.php', { data: body, headers: { 'X-CSRF-Token': csrf, ...headers } });
const orderPayload = (overrides = {}) => ({ productSlug: product.slug, customerName: 'Test Customer', customerPhone: '01712345678', deliveryAddress: 'House 12, Road 4, Dhanmondi, Dhaka', deliveryZoneId: zones[0].id, quantity: 1, customerNote: '', clientRequestId: randomUUID(), honeypot: '', ...overrides });

test.beforeAll(async ({ playwright }) => {
  admin = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:8082' });
  const session = await (await admin.get('/api/admin.php?resource=session')).json(); csrf = session.csrfToken;
  expect(session.setupRequired).toBe(true);
  expect((await admin.get('/api/admin.php?resource=store')).status()).toBe(401);
  const invalidSetup = await adminPost({ action: 'setup', ...credentials, setupToken: 'invalid-token' }); expect(invalidSetup.status()).toBe(403);
  const setup = await adminPost({ action: 'setup', ...credentials, setupToken: process.env.DECOR_TEST_SETUP_TOKEN }); expect(setup.ok()).toBe(true);
  const auth = await setup.json(); csrf = auth.csrfToken;
  expect(auth.authenticated).toBe(true); expect(auth).not.toHaveProperty('password_hash');
  const store = await (await admin.get('/api/admin.php?resource=store')).json(); product = store.product; site = store.site; zones = store.deliveryZones;
});
test.afterAll(async () => { await admin?.dispose(); });

test('admin authentication, CSRF, origin, private files, and one-time setup are enforced', async ({ request }) => {
  expect((await request.get('/api/admin.php?resource=orders')).status()).toBe(401);
  expect((await request.get('/api/export.php')).status()).toBe(401);
  expect((await admin.post('/api/admin.php', { data: { action: 'save-product', product } })).status()).toBe(403);
  expect((await adminPost({ action: 'save-product', product }, { Origin: 'https://other.example' })).status()).toBe(403);
  expect((await adminPost({ action: 'setup', ...credentials, setupToken: process.env.DECOR_TEST_SETUP_TOKEN })).status()).toBe(409);
  expect((await request.get('/private/config.example.php')).status()).toBe(403);
  expect(existsSync('dist/private/config.local.php')).toBe(false);
});

test('product, website content, and delivery charges are saved to MySQL', async ({ request }) => {
  const updated = { ...product, name: 'Test Luxury Lamp', headline: 'Test Luxury Lamp', price: '1299.50', compareAtPrice: '1599.50', stockQuantity: 6, specifications: { Material: 'Ceramic', Height: '40 cm' }, faq: [{ question: 'Is COD available?', answer: 'Cash on Delivery is available.' }], offer: { title: 'Order Your Lamp', copy: 'Pay on delivery.' } };
  const response = await adminPost({ action: 'save-product', product: updated }); expect(response.ok()).toBe(true); product = (await response.json()).product;
  site = { ...site, brandName: 'Zest Home Test', brandInitials: 'ZH', supportPhone: '01712345678', supportEmail: 'support@example.com', whyTitle: 'Verified Test Benefits', policies: { delivery: 'Test delivery policy.', privacy: 'Test customer privacy policy.', returns: 'Test return policy.', terms: 'Test terms.' } };
  expect((await adminPost({ action: 'save-site', site })).ok()).toBe(true);
  zones[0].deliveryFee = 80.25;
  expect((await adminPost({ action: 'save-delivery', deliveryZones: zones })).ok()).toBe(true);
  const publicData = await (await request.get('/api/product.php')).json();
  expect(publicData.product.price).toBe(1299.5); expect(publicData.site.brandName).toBe('Zest Home Test'); expect(publicData.deliveryZones[0].deliveryFee).toBe(80.25);
  expect(publicData).not.toHaveProperty('db'); expect(publicData.site).not.toHaveProperty('setup_token');
  const html = await (await request.get('/')).text(); expect(html).toContain('<title>Zest Home Test - Test Luxury Lamp</title>'); expect(html).toContain('"price":1299.5');
  expect((await adminPost({ action: 'save-product', product: { ...product, price: '-1' } })).status()).toBe(422);
  const unavailable = await adminPost({ action: 'save-product', product: { ...product, active: false } }); expect(unavailable.ok()).toBe(true); product = (await unavailable.json()).product;
  const inactiveData = await (await request.get('/api/product.php')).json(); expect(inactiveData.product.name).toBe('Test Luxury Lamp'); expect(inactiveData.product.active).toBe(false);
  expect((await request.post('/api/order.php', { data: orderPayload() })).status()).toBe(409);
  const restored = await adminPost({ action: 'save-product', product: { ...product, active: true } }); expect(restored.ok()).toBe(true); product = (await restored.json()).product;
});

test('image-only galleries with one to eight images save without adding a video', async ({ request }) => {
  const image = product.media.find((item) => item.type === 'image');
  const gallery = ['front', 'right', 'left', 'close'].map((view) => ({
    ...image, id: `wall-${view}`, type: 'image',
    src: `./assets/images/wall-decor-${view}.webp`, fallback: `./assets/images/wall-decor-${view}.jpg`, thumb: `./assets/images/thumb-wall-decor-${view}.webp`,
  }));
  for (let count = 1; count <= 8; count++) {
    const media = Array.from({ length: count }, (_, index) => ({ ...gallery[index % 4], id: index < 4 ? gallery[index].id : `extra-${index}` }));
    const response = await adminPost({ action: 'save-product', product: { ...product, media } });
    expect(response.ok(), `save-product with ${count} images`).toBe(true); product = (await response.json()).product;
    expect(product.media).toHaveLength(count); expect(product.media.every((item) => item.type === 'image')).toBe(true);
    expect(product.media.map((item) => item.id)).toEqual(media.map((item) => item.id));
  }
  const response = await adminPost({ action: 'save-media', media: gallery, lifestyleImage: site.lifestyleImage, lifestyleImageAlt: site.lifestyleImageAlt });
  expect(response.ok()).toBe(true); product = (await response.json()).product;
  const publicData = await (await request.get('/api/product.php')).json();
  expect(publicData.product.media.map((item) => item.id)).toEqual(gallery.map((item) => item.id));
  expect(publicData.product.media.every((item) => item.type === 'image' && !Object.hasOwn(item, 'poster'))).toBe(true);
  const generated = await worker({ action: 'validate-product', product: { ...product, media: gallery.map(({ id, ...item }) => item) } });
  expect(generated.status).toBe(200); expect(JSON.parse(generated.product.media).map((item) => item.id)).toEqual(['main', 'detail', 'angle', 'extra']);
  const collision = await worker({ action: 'validate-product', product: { ...product, media: [{ ...gallery[0], id: 'detail' }, ...gallery.slice(1).map(({ id, ...item }) => item)] } });
  expect(collision.status).toBe(200); expect(JSON.parse(collision.product.media).map((item) => item.id)).toEqual(['detail', 'detail-2', 'angle', 'extra']);
});

test('media types, IDs, dimensions, and every media path are validated', async () => {
  const image = product.media[0];
  const video = { ...image, id: 'demo', type: 'video', src: 'https://media.example.com/product.mp4', poster: image.src, posterFallback: image.fallback };
  const invalidGalleries = [
    [], Array.from({ length: 9 }, (_, index) => ({ ...image, id: `image-${index}` })),
    [video, image], [image, video, { ...video, id: 'second-video' }],
    [null], [{ ...image, type: 'audio' }], [{ ...image, type: null }],
    [{ ...image, id: '../main' }], [{ ...image, id: '' }], [{ ...image, id: 1 }], [{ ...image, id: 'x'.repeat(65) }],
    [image, { ...image }], [{ ...image, width: 0 }], [{ ...image, height: 10001 }], [{ ...image, width: 1.5 }],
  ];
  const { type, ...withoutType } = image; invalidGalleries.push([withoutType]);
  for (const media of invalidGalleries) {
    const response = await adminPost({ action: 'save-product', product: { ...product, media } }); expect(response.status()).toBe(422);
  }
  const unsafePaths = ['../uploads/image.webp', './uploads/../config.local.php', '/private/config.local.php', './private/config.local.php', 'javascript:alert(1)', 'data:image/png;base64,AA==', 'http://example.com/image.webp', 'https://user:secret@example.com/image.webp'];
  for (const path of unsafePaths) {
    for (const key of ['src', 'thumb', 'fallback']) {
      const response = await adminPost({ action: 'save-media', media: [{ ...image, [key]: path }], lifestyleImage: site.lifestyleImage, lifestyleImageAlt: site.lifestyleImageAlt }); expect(response.status(), `${key}: ${path}`).toBe(422);
    }
    for (const key of ['src', 'thumb', 'poster', 'posterFallback']) {
      const response = await adminPost({ action: 'save-media', media: [image, { ...video, [key]: path }], lifestyleImage: site.lifestyleImage, lifestyleImageAlt: site.lifestyleImageAlt }); expect(response.status(), `video ${key}: ${path}`).toBe(422);
    }
  }
  const unchanged = (await (await admin.get('/api/admin.php?resource=store')).json()).product;
  expect(unchanged.media).toEqual(product.media); expect(unchanged.version).toBe(product.version);
});

test('image/video uploads and saved media work; unsafe files are rejected', async ({ request, page }) => {
  const image = await readFile('public/assets/images/wall-decor-front.jpg');
  expect((await request.post('/api/upload.php', { multipart: { file: { name: 'image.jpg', mimeType: 'image/jpeg', buffer: image } } })).status()).toBe(401);
  const upload = await admin.post('/api/upload.php', { headers: { 'X-CSRF-Token': csrf }, multipart: { kind: 'image', file: { name: 'original-name.php', mimeType: 'image/jpeg', buffer: image } } });
  expect(upload.ok()).toBe(true); const saved = await upload.json(); expect(saved.path).toMatch(/^\.\/uploads\/[a-f0-9]{32}\.jpg$/);
  Object.assign(product.media[0], { src: saved.path, fallback: saved.path, thumb: saved.path, width: saved.width, height: saved.height, alt: 'Test uploaded product' });
  const video = await admin.post('/api/upload.php', { headers: { 'X-CSRF-Token': csrf }, multipart: { kind: 'video', file: { name: 'demo.mp4', mimeType: 'video/mp4', buffer: await readFile('.local/upload-fixture.mp4') } } });
  expect(video.ok()).toBe(true); const uploadedVideo = await video.json();
  const videoItem = { id: 'demo', type: 'video', label: 'Test upload', src: uploadedVideo.path, thumb: saved.path, poster: saved.path, posterFallback: saved.path, alt: 'Test video poster', width: uploadedVideo.width, height: uploadedVideo.height };
  const bad = await admin.post('/api/upload.php', { headers: { 'X-CSRF-Token': csrf }, multipart: { file: { name: 'image.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg><script>alert(1)</script></svg>') } } }); expect(bad.status()).toBe(422);
  const withVideo = await adminPost({ action: 'save-media', media: [product.media[0], videoItem, ...product.media.slice(1)], lifestyleImage: site.lifestyleImage, lifestyleImageAlt: site.lifestyleImageAlt });
  expect(withVideo.ok()).toBe(true); const mixedMedia = (await withVideo.json()).product.media;
  expect(mixedMedia[1].type).toBe('video'); expect(mixedMedia[4].type).toBe('image');
  const imageOnly = await adminPost({ action: 'save-media', media: product.media, lifestyleImage: site.lifestyleImage, lifestyleImageAlt: site.lifestyleImageAlt });
  expect(imageOnly.ok()).toBe(true); product = (await imageOnly.json()).product;
  await page.goto('/'); await expect(page.locator('[data-gallery-stage] img')).toHaveAttribute('alt', 'Test uploaded product');
  await expect.poll(() => page.locator('[data-gallery-stage] img').evaluate((element) => element.naturalWidth)).toBeGreaterThan(0);
});

test('browser checkout stores a real order and shows database prices and policies', async ({ page }) => {
  await worker({ action: 'reset-rates' }); await page.goto('/#order');
  await expect(page.getByRole('heading', { name: 'Test Luxury Lamp', exact: true })).toBeVisible();
  await expect(page.locator('[data-product-price]')).toContainText('১,২৯৯.৫০');
  await page.locator('[name="customerName"]').fill('Browser Customer'); await page.locator('[name="customerPhone"]').fill('01712345678');
  await page.locator('[name="deliveryAddress"]').fill('House 12, Road 4, Dhanmondi, Dhaka'); await page.locator('[name="quantity"]').fill('2');
  await page.locator('[data-submit-order]').click();
  await expect(page.locator('[data-form-status]')).toContainText('ZB-');
  expect((await worker({ action: 'stock' })).stock).toBe(4);
  await page.locator('[data-policy="privacy"]').click(); await expect(page.locator('[data-policy-body]')).toHaveText('Test customer privacy policy.');
});

test('server ignores submitted prices, rejects changed retries, and reserves stock once', async ({ request }) => {
  await worker({ action: 'reset-rates' });
  const payload = orderPayload({ customerName: '=2+3', unitPrice: 1, deliveryFee: 0, totalAmount: 1 });
  const response = await request.post('/api/order.php', { data: payload }); expect(response.ok()).toBe(true); forgedOrder = await response.json();
  expect(forgedOrder.unitPrice).toBe(1299.5); expect(forgedOrder.deliveryFee).toBe(80.25); expect(forgedOrder.totalAmount).toBe(1379.75);
  expect((await worker({ action: 'stock' })).stock).toBe(3);
  const staleSave = await adminPost({ action: 'save-product', product: { ...product, stockQuantity: 6 } }); expect(staleSave.status()).toBe(409);
  expect((await worker({ action: 'stock' })).stock).toBe(3);
  const retry = await request.post('/api/order.php', { data: payload }); expect(await retry.json()).toEqual(forgedOrder); expect((await worker({ action: 'stock' })).stock).toBe(3);
  expect((await request.post('/api/order.php', { data: { ...payload, quantity: 2 } })).status()).toBe(409);
  expect((await request.post('/api/order.php', { data: orderPayload({ quantity: 1.5 }) })).status()).toBe(422);
  expect((await request.post('/api/order.php', { data: orderPayload({ honeypot: 'bot' }) })).status()).toBe(422);
  expect((await request.post('/api/order.php', { data: orderPayload(), headers: { Origin: 'https://other.example' } })).status()).toBe(403);
});

test('concurrent database transactions cannot oversell the final unit', async () => {
  await worker({ action: 'reset-rates' }); await worker({ action: 'set-stock', stock: 1 });
  const responses = await Promise.all([worker({ action: 'order', order: orderPayload({ customerName: 'Last Unit A' }) }), worker({ action: 'order', order: orderPayload({ customerName: 'Last Unit B' }) })]);
  expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
  limitedOrder = responses.find((response) => response.status === 200).receipt;
  expect((await worker({ action: 'stock' })).stock).toBe(0);
});

test('cancellation returns stock once; valid status transitions and safe CSV export work', async () => {
  const orders = (await (await admin.get('/api/admin.php?resource=orders')).json()).orders;
  const limited = orders.find((order) => order.order_reference === limitedOrder.orderReference);
  expect((await adminPost({ action: 'update-order', id: limited.id, status: 'cancelled' })).ok()).toBe(true);
  expect((await worker({ action: 'stock' })).stock).toBe(1);
  expect((await adminPost({ action: 'update-order', id: limited.id, status: 'cancelled' })).ok()).toBe(true);
  expect((await worker({ action: 'stock' })).stock).toBe(1);
  expect((await adminPost({ action: 'update-order', id: limited.id, status: 'delivered' })).status()).toBe(409);
  const forged = orders.find((order) => order.order_reference === forgedOrder.orderReference);
  for (const status of ['confirmed', 'shipped', 'delivered']) expect((await adminPost({ action: 'update-order', id: forged.id, status })).ok()).toBe(true);
  expect((await adminPost({ action: 'update-order', id: forged.id, status: 'cancelled' })).status()).toBe(409);
  const csv = await (await admin.get('/api/export.php')).text(); expect(csv).toContain(forgedOrder.orderReference); expect(csv).toContain("'=2+3");
});

test('admin edits all four images and adds or removes an optional video without publishing drafts', async ({ page }) => {
  await page.goto('/admin/');
  await expect(page).toHaveTitle('zestbd | Store Admin');
  await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveAttribute('href', '../favicon.svg');
  await expect(page.locator('.auth-brand img')).toHaveAttribute('src', '../assets/brand/zestbd-mark.svg');
  await page.getByLabel('Email', { exact: true }).fill(credentials.email); await page.getByLabel('Password', { exact: true }).fill(credentials.password); await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page.locator('[data-app]')).toBeVisible();
  await page.getByRole('button', { name: 'Media', exact: true }).click();
  const imageSlots = page.locator('[data-media-slot]').filter({ has: page.locator('[data-file="0"], [data-file="1"], [data-file="2"], [data-file="3"]') });
  await expect(imageSlots).toHaveCount(4); await expect(page.locator('[data-media-slot="video"]')).toHaveCount(0); await expect(page.locator('[data-media-slot="poster"]')).toHaveCount(0);
  const fourth = page.locator('[data-media-slot="3"]');
  await fourth.locator('[data-media-alt]').fill('Fourth product image');
  await fourth.locator('[data-file]').setInputFiles('public/assets/images/wall-decor-close.jpg');
  await expect(fourth.locator('[data-upload-message]')).toHaveText('Uploaded');
  await page.getByRole('button', { name: 'Add Video', exact: true }).click();
  await expect(page.locator('[data-media-slot="video"]')).toHaveCount(1); await expect(page.locator('[data-media-slot="poster"]')).toHaveCount(1);
  await expect(page.locator('[name="videoSrc"]')).toHaveValue('');
  await page.getByRole('button', { name: 'Product', exact: true }).click();
  await page.getByRole('button', { name: 'Save Product', exact: true }).click();
  await expect(page.locator('[data-message]')).toHaveText('Product saved.');
  const beforeSave = (await (await admin.get('/api/admin.php?resource=store')).json()).product;
  expect(beforeSave.media).toHaveLength(4); expect(beforeSave.media.every((item) => item.type === 'image')).toBe(true);
  expect(beforeSave.media[3].alt).not.toBe('Fourth product image');
  await page.getByRole('button', { name: 'Media', exact: true }).click();
  await expect(fourth.locator('[data-media-alt]')).toHaveValue('Fourth product image');
  await page.locator('[data-file="video"]').setInputFiles('.local/upload-fixture.mp4');
  await expect(page.locator('[data-media-slot="video"] [data-upload-message]')).toHaveText('Uploaded');
  await page.getByRole('button', { name: 'Save Media', exact: true }).click();
  await expect(page.locator('[data-message]')).toHaveText('Media saved.');
  const withVideo = (await (await admin.get('/api/admin.php?resource=store')).json()).product;
  expect(withVideo.media).toHaveLength(5); expect(withVideo.media[3].alt).toBe('Fourth product image');
  const video = withVideo.media.find((item) => item.type === 'video');
  const images = withVideo.media.filter((item) => item.type === 'image');
  const reordered = await adminPost({ action: 'save-media', media: [images[0], video, ...images.slice(1)], lifestyleImage: site.lifestyleImage, lifestyleImageAlt: site.lifestyleImageAlt });
  expect(reordered.ok()).toBe(true);
  await page.reload(); await page.getByRole('button', { name: 'Media', exact: true }).click();
  await expect(page.locator('[data-media-slot="video"] video')).toHaveAttribute('src', new URL(video.src, 'http://127.0.0.1:8082/').href);
  await expect(page.locator('[data-media-slot="4"] [data-media-alt]')).toHaveValue('Fourth product image');
  await page.getByRole('button', { name: 'Remove video', exact: true }).click();
  await expect(page.locator('[name="videoSrc"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Save Media', exact: true }).click();
  await expect(page.locator('[data-message]')).toHaveText('Media saved.');
  const imageOnly = (await (await admin.get('/api/admin.php?resource=store')).json()).product;
  expect(imageOnly.media.map((item) => item.id)).toEqual(images.map((item) => item.id)); expect(imageOnly.media.every((item) => item.type === 'image')).toBe(true);
  await page.getByRole('button', { name: 'Product', exact: true }).click(); await page.getByRole('button', { name: 'Save Product', exact: true }).click();
  await expect(page.locator('[data-message]')).toHaveText('Product saved.');
});

test('admin editor saves changes and stays usable at desktop and mobile sizes', async ({ page }) => {
  await page.goto('/admin/'); await page.getByLabel('Email', { exact: true }).fill(credentials.email); await page.getByLabel('Password', { exact: true }).fill(credentials.password); await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page.locator('[data-app]')).toBeVisible(); await expect(page.locator('[data-orders] tr')).toHaveCount(3);
  await page.screenshot({ path: 'test-results/admin-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Product', exact: true }).click();
  await page.getByLabel('Product name', { exact: true }).fill('Edited Through Admin'); await page.getByRole('button', { name: 'Save Product', exact: true }).click();
  await expect(page.locator('[data-message]')).toHaveText('Product saved.');
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 850 });
    for (const tab of ['Orders', 'Product', 'Media', 'Website Content', 'Delivery', 'Account']) {
      await page.getByRole('button', { name: tab, exact: true }).click();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); expect(overflow, `${tab} at ${width}`).toBeLessThanOrEqual(1);
    }
  }
  await page.setViewportSize({ width: 375, height: 850 }); await page.getByRole('button', { name: 'Media', exact: true }).click();
  await page.screenshot({ path: 'test-results/admin-mobile.png', fullPage: true });
});

test('saving Media preserves unsaved Product edits and their optimistic conflict guard', async ({ page }) => {
  const current = (await (await admin.get('/api/admin.php?resource=store')).json()).product;
  await page.goto('/admin/'); await page.getByLabel('Email', { exact: true }).fill(credentials.email); await page.getByLabel('Password', { exact: true }).fill(credentials.password); await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page.locator('[data-app]')).toBeVisible();
  await page.getByRole('button', { name: 'Product', exact: true }).click();
  const draft = `${current.description} Unsaved product details.`;
  await page.locator('[data-product-form] [name="description"]').fill(draft);
  await page.getByRole('button', { name: 'Media', exact: true }).click();
  await page.locator('[data-media-slot="0"] [data-media-alt]').fill('Saved media description');
  await page.getByRole('button', { name: 'Save Media', exact: true }).click(); await expect(page.locator('[data-message]')).toHaveText('Media saved.');
  await page.getByRole('button', { name: 'Product', exact: true }).click();
  await expect(page.locator('[data-product-form] [name="description"]')).toHaveValue(draft);
  await expect(page.locator('[data-product-form]')).toHaveAttribute('data-version', String(current.version));
  await page.getByRole('button', { name: 'Save Product', exact: true }).click();
  await expect(page.locator('[data-message]')).toContainText('Product or stock changed');
  const stored = (await (await admin.get('/api/admin.php?resource=store')).json()).product;
  expect(stored.description).toBe(current.description); expect(stored.version).toBe(current.version + 1); expect(stored.media[0].alt).toBe('Saved media description');
});

test('rate limiting and missing required verification fail without accepting orders', async ({ request }) => {
  await worker({ action: 'reset-rates' });
  for (let index = 0; index < 5; index++) expect((await request.post('/api/order.php', { data: orderPayload({ productSlug: 'not-a-product' }) })).status()).toBe(409);
  const limited = await request.post('/api/order.php', { data: orderPayload({ productSlug: 'not-a-product' }) }); expect(limited.status()).toBe(429); expect(limited.headers()['retry-after']).toBeTruthy();
  await worker({ action: 'reset-rates' }); await worker({ action: 'turnstile', enabled: true });
  try { expect((await request.post('/api/order.php', { data: orderPayload() })).status()).toBe(503); }
  finally { await worker({ action: 'turnstile', enabled: false }); }
  expect((await worker({ action: 'order-count' })).count).toBe(3);
});

test('review ratings, photos and featured product links round-trip through MySQL without publishing drafts', async ({ page, request }) => {
  const original = (await (await admin.get('/api/admin.php?resource=store')).json()).site;
  const image = './assets/images/wall-decor-front.webp';
  const updated = { ...original, mainSiteUrl: 'https://zestbd.com/', reviewsText: 'Test review records',
    reviews: [0, 1, 2].map((index) => ({ name: `Test Buyer ${index + 1}`, text: `Test buyer review ${index + 1}`, rating: 5, image: index === 0 ? image : '', imageAlt: 'Test buyer photo', active: true })),
    featuredProducts: [0, 1, 2].map((index) => ({ name: `Test Product ${index + 1}`, image, imageAlt: 'Test product image', url: `https://zestbd.com/product/test-${index + 1}`, price: index === 1 ? null : 499.5 + index, active: true }))
  };
  try {
    const response = await adminPost({ action: 'save-site', site: updated }); expect(response.ok()).toBe(true);
    const stored = (await response.json()).site;
    expect(stored.reviews).toEqual(updated.reviews); expect(stored.featuredProducts).toEqual(updated.featuredProducts);
    expect(stored.mainSiteUrl).toBe(updated.mainSiteUrl);
    await page.goto('/'); await expect(page.locator('.review-card')).toHaveCount(3); await expect(page.locator('.review-stars svg')).toHaveCount(15);
    await expect(page.locator('.review-photo')).toHaveCount(1); await expect(page.locator('.featured-product')).toHaveCount(3);
    await expect(page.locator('header [data-main-site-link]')).toHaveAttribute('href', 'https://zestbd.com/');
    expect(await (await request.get('/')).text()).toContain('href="https://zestbd.com/"');
    updated.reviews[0].active = false; updated.featuredProducts[0].active = false;
    expect((await adminPost({ action: 'save-site', site: updated })).ok()).toBe(true);
    const publicData = await (await request.get('/api/product.php')).json();
    expect(publicData.site.reviews).toHaveLength(2); expect(publicData.site.featuredProducts).toHaveLength(2);
    expect(JSON.stringify(publicData.site)).not.toContain('Test Buyer 1'); expect(JSON.stringify(publicData.site)).not.toContain('Test Product 1');
    const legacy = { ...updated }; delete legacy.mainSiteUrl; delete legacy.featuredProducts; delete legacy.featuredTitle; delete legacy.featuredText;
    legacy.reviews = updated.reviews.map(({ name, text }) => ({ name, text }));
    const legacySave = await adminPost({ action: 'save-site', site: legacy }); expect(legacySave.ok()).toBe(true);
    const legacyStored = (await legacySave.json()).site;
    expect(legacyStored.reviews).toEqual(updated.reviews); expect(legacyStored.featuredProducts).toEqual(updated.featuredProducts);
  } finally { expect((await adminPost({ action: 'save-site', site: original })).ok()).toBe(true); }
});

test('invalid ratings, unsafe photos and off-domain links are rejected; blank unpublished slots are allowed', async ({ request }) => {
  const original = (await (await admin.get('/api/admin.php?resource=store')).json()).site;
  const review = { name: 'Test Buyer', text: 'Test review', rating: 5, image: '', imageAlt: '', active: true };
  const featured = { name: 'Test Product', image: './assets/images/wall-decor-front.webp', imageAlt: '', url: 'https://zestbd.com/product/test', price: 500, active: true };
  for (const rating of [0, 6, 1.5, 'five']) expect((await adminPost({ action: 'save-site', site: { ...original, reviews: [{ ...review, rating }] } })).status()).toBe(422);
  for (const image of ['javascript:alert(1)', 'data:image/png;base64,AA==', '../private/config.local.php', 'http://example.com/image.jpg']) {
    expect((await adminPost({ action: 'save-site', site: { ...original, reviews: [{ ...review, image }] } })).status()).toBe(422);
  }
  for (const url of ['javascript:alert(1)', 'https://zestbd.com.attacker.invalid/product', 'https://other.invalid/product', 'http://zestbd.com/product', 'https://user:pass@zestbd.com/product']) {
    expect((await adminPost({ action: 'save-site', site: { ...original, featuredProducts: [{ ...featured, url }] } })).status()).toBe(422);
  }
  expect((await adminPost({ action: 'save-site', site: { ...original, mainSiteUrl: 'javascript:alert(1)' } })).status()).toBe(422);
  expect((await adminPost({ action: 'save-site', site: { ...original, featuredProducts: Array(4).fill(featured) } })).status()).toBe(422);
  expect((await adminPost({ action: 'save-site', site: { ...original, featuredProducts: [{ ...featured, image: '' }] } })).status()).toBe(422);
  const blanks = { ...original,
    reviews: Array.from({ length: 3 }, () => ({ name: '', text: '', rating: 5, image: '', imageAlt: '', active: false })),
    featuredProducts: Array.from({ length: 3 }, () => ({ name: '', image: '', imageAlt: '', url: '', price: null, active: false }))
  };
  try {
    expect((await adminPost({ action: 'save-site', site: blanks })).ok()).toBe(true);
    const data = await (await request.get('/api/product.php')).json();
    expect(data.site.reviews).toEqual([]); expect(data.site.featuredProducts).toEqual([]);
    expect((await (await admin.get('/api/admin.php?resource=store')).json()).site.reviews).toHaveLength(3);
  } finally { expect((await adminPost({ action: 'save-site', site: original })).ok()).toBe(true); }
});

test('admin controls three review/product slots, uploads photos and publishes only on Save', async ({ page, request }) => {
  const original = (await (await admin.get('/api/admin.php?resource=store')).json()).site;
  try {
    await page.goto('/admin/'); await page.getByLabel('Email').fill(credentials.email); await page.getByLabel('Password', { exact: true }).fill(credentials.password);
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await page.locator('[data-tab=website]').click();
    await page.locator('summary', { hasText: /^Customer Reviews$/ }).click();
    const reviews = page.locator('[data-review-row]'); await expect(reviews).toHaveCount(3);
    for (let index = 0; index < 3; index++) {
      const row = reviews.nth(index);
      await row.locator('[data-review-name]').fill(`UI Test Buyer ${index + 1}`); await row.locator('[data-review-text]').fill(`UI test review ${index + 1}`);
      await row.locator('[data-review-rating]').selectOption('5'); await row.locator('[data-review-active]').check();
    }
    await reviews.first().locator('[data-content-file]').setInputFiles('public/assets/images/wall-decor-front.jpg');
    await expect(reviews.first().locator('[data-content-upload-message]')).toHaveText('Uploaded');
    const uploadedReview = await reviews.first().locator('[data-content-image]').inputValue(); expect(uploadedReview).toMatch(/^\.\/uploads\/[a-f0-9]+\.jpg$/);
    await page.locator('summary', { hasText: /^Featured Products$/ }).click();
    const products = page.locator('[data-featured-row]'); await expect(products).toHaveCount(3);
    for (let index = 0; index < 3; index++) {
      const row = products.nth(index);
      await row.locator('[data-featured-name]').fill(`UI Test Product ${index + 1}`);
      await row.locator('[data-featured-price]').fill(index === 1 ? '' : '3490');
      await row.locator('[data-featured-url]').fill(`https://zestbd.com/product/ui-test-${index + 1}`);
      await row.locator('[data-content-image]').fill('./assets/images/wall-decor-left.webp'); await row.locator('[data-featured-active]').check();
    }
    await products.first().locator('[data-content-file]').setInputFiles('public/assets/images/wall-decor-left.jpg');
    await expect(products.first().locator('[data-content-upload-message]')).toHaveText('Uploaded');
    const beforeSave = await (await request.get('/api/product.php')).json(); expect(beforeSave.site.reviews).toEqual(original.reviews.filter((review) => review.active !== false).slice(0, 3));
    await page.getByRole('button', { name: 'Save Website Content', exact: true }).click(); await expect(page.locator('[data-message]')).toHaveText('Website content saved.');
    const published = await (await request.get('/api/product.php')).json(); expect(published.site.reviews).toHaveLength(3); expect(published.site.featuredProducts).toHaveLength(3);
    expect(published.site.reviews[0].image).toBe(uploadedReview);
    await page.setViewportSize({ width: 375, height: 812 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
    await reviews.first().getByRole('button', { name: 'Remove image', exact: true }).click(); await expect(reviews.first().locator('[data-content-image]')).toHaveValue('');
    await products.first().getByRole('button', { name: 'Clear product 1', exact: true }).click(); await expect(products.first().locator('[data-featured-active]')).not.toBeChecked();
    await expect(products.first().locator('[data-featured-name]')).toHaveValue('');
  } finally { expect((await adminPost({ action: 'save-site', site: original })).ok()).toBe(true); }
});

test('zestbd content update preserves commerce, accounts, orders, contact details, and published content', async ({ page, request }) => {
  const current = await (await admin.get('/api/admin.php?resource=store')).json();
  const savedProduct = await adminPost({ action: 'save-product', product: { ...current.product, slug: 'legacy-wall-decor', active: false } }); expect(savedProduct.ok()).toBe(true);
  const published = {
    ...current.site, supportPhone: '01812345678', supportEmail: 'merchant@example.com',
    reviews: [{ name: 'Published Customer', text: 'Existing customer review must stay published.' }],
    policies: { delivery: 'Published delivery policy.', privacy: 'Published privacy policy.', returns: '', terms: 'Published terms.' },
  };
  expect((await adminPost({ action: 'save-site', site: published })).ok()).toBe(true);
  const { before, after } = await worker({ action: 'apply-content-update' });
  const pick = (value, keys) => Object.fromEntries(keys.map((key) => [key, value[key]]));
  const commerce = ['id', 'slug', 'price', 'compare_at_price', 'stock_quantity', 'active', 'offer'];
  expect(pick(after.product, commerce)).toEqual(pick(before.product, commerce));
  expect(after.product.slug).toBe('legacy-wall-decor'); expect(Number(after.product.version)).toBe(Number(before.product.version) + 1);
  expect(after.product.name).toBe(SITE_CONFIG.product.name); expect(after.product.headline).toBe(SITE_CONFIG.product.headline); expect(after.product.description).toBe(SITE_CONFIG.product.description);
  expect(JSON.parse(after.product.media)).toEqual(SITE_CONFIG.product.media); expect(JSON.parse(after.product.specifications)).toEqual(SITE_CONFIG.product.specifications); expect(JSON.parse(after.product.faq)).toEqual(SITE_CONFIG.product.faq); expect(after.product.delivery_note).toBe(SITE_CONFIG.product.deliveryNote);
  expect(after.adminCount).toBe(1); expect(after.adminCount).toBe(before.adminCount); expect(after.admins).toEqual(before.admins);
  expect(after.orderCount).toBe(3); expect(after.orderCount).toBe(before.orderCount); expect(after.orders).toEqual(before.orders);
  expect(pick(after.site, ['supportPhone', 'supportEmail', 'reviews'])).toEqual(pick(before.site, ['supportPhone', 'supportEmail', 'reviews']));
  for (const key of ['delivery', 'privacy', 'terms']) expect(after.site.policies[key]).toBe(before.site.policies[key]);
  expect(before.site.policies.returns).toBe(''); expect(after.site.policies.returns).toBe(SITE_CONFIG.policies.returns);
  const zoneCommerce = ['id', 'zone_code', 'delivery_fee', 'active'];
  expect(after.deliveryZones.map((zone) => pick(zone, zoneCommerce))).toEqual(before.deliveryZones.map((zone) => pick(zone, zoneCommerce)));
  for (const zone of after.deliveryZones) expect(zone.zone_name).toBe(SITE_CONFIG.deliveryZones.find((item) => item.zoneCode === zone.zone_code).zoneName);
  expect((await admin.get('/api/admin.php?resource=store')).ok()).toBe(true);
  const publicData = await (await request.get('/api/product.php')).json(); expect(publicData.site.brandName).toBe('zestbd'); expect(publicData.product.media).toHaveLength(4); expect(publicData.product.media.every((item) => item.type === 'image')).toBe(true);
  await page.goto('/'); await expect(page).toHaveTitle(`zestbd - ${SITE_CONFIG.product.headline}`);
  const schema = JSON.parse(await page.locator('#product-jsonld').textContent());
  expect(schema['@type']).toBe('Product'); expect(schema.name).toBe(SITE_CONFIG.product.name); expect(schema.image).toHaveLength(4); expect(new Set(schema.image).size).toBe(4); expect(Number(schema.offers.price)).toBe(Number(before.product.price));
});

test('unavailable product API disables checkout and password changes invalidate other sessions', async ({ page, playwright }) => {
  await page.route('**/api/product.php', (route) => route.fulfill({ status: 503, json: { error: 'Unavailable' } }));
  await page.goto('/#order'); await expect(page.locator('[data-submit-order]')).toBeDisabled();
  const another = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:8082' });
  const session = await (await another.get('/api/admin.php?resource=session')).json();
  const login = await another.post('/api/admin.php', { data: { action: 'login', ...credentials }, headers: { 'X-CSRF-Token': session.csrfToken } }); expect(login.ok()).toBe(true);
  const newPassword = ' New-test-password-2026 ';
  const changed = await adminPost({ action: 'change-password', currentPassword: credentials.password, newPassword }); expect(changed.ok()).toBe(true); csrf = (await changed.json()).csrfToken;
  expect((await another.get('/api/admin.php?resource=orders')).status()).toBe(401); await another.dispose();
  const finalSession = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:8082' });
  const csrfState = await (await finalSession.get('/api/admin.php?resource=session')).json();
  const finalLogin = await finalSession.post('/api/admin.php', { data: { action: 'login', email: credentials.email, password: newPassword }, headers: { 'X-CSRF-Token': csrfState.csrfToken } }); expect(finalLogin.ok()).toBe(true); await finalSession.dispose();
});
