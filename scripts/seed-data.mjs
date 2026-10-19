import { writeFile, mkdir } from 'node:fs/promises';
import { SITE_CONFIG } from '../src/js/config.js';

const quote = (value) => value === null ? 'NULL' : `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
const json = (value) => quote(JSON.stringify(value));
const { product, deliveryZones, ...site } = SITE_CONFIG;
delete site.productSlug;
delete site.turnstileSiteKey;
delete site.canonicalUrl;
const fields = ['id', 'slug', 'name', 'headline', 'description', 'price', 'compare_at_price', 'active', 'stock_quantity', 'media', 'specifications', 'faq', 'delivery_note', 'offer'];
const values = [quote(product.id), quote(product.slug), quote(product.name), quote(product.headline), quote(product.description), product.price, product.compareAtPrice ?? 'NULL', product.active ? 1 : 0, product.stockQuantity ?? 'NULL', json(product.media), json(product.specifications), json(product.faq), quote(product.deliveryNote), product.offer ? json(product.offer) : 'NULL'];
const sql = [
  '-- Initial zestbd content. Existing products, prices, orders and settings are preserved.',
  'SET NAMES utf8mb4;',
  `INSERT IGNORE INTO products (${fields.join(', ')}) VALUES (${values.join(', ')});`,
  ...deliveryZones.map((zone) => `INSERT IGNORE INTO delivery_zones (id, zone_code, zone_name, delivery_fee, active) VALUES (${[quote(zone.id), quote(zone.zoneCode), quote(zone.zoneName), zone.deliveryFee, zone.active ? 1 : 0].join(', ')});`),
  `INSERT IGNORE INTO site_settings (id, content) VALUES (1, ${json(site)});`,
  ''
].join('\n');
await mkdir('database', { recursive: true });
await writeFile('database/seed.sql', sql);
console.log('database/seed.sql generated.');

// Existing databases need an explicit content update, not an INSERT IGNORE seed.
const contentUpdate = { ...site };
for (const key of ['supportPhone', 'supportEmail', 'reviews', 'reviewsText', 'policies', 'mainSiteUrl', 'featuredProducts', 'featuredTitle', 'featuredText']) delete contentUpdate[key];
const productFields = {
  name: quote(product.name), headline: quote(product.headline), description: quote(product.description),
  media: json(product.media), specifications: json(product.specifications), faq: json(product.faq),
  delivery_note: quote(product.deliveryNote)
};
const updateSql = [
  '-- Apply once after uploading the new build. Back up the selected database first.',
  '-- Replaces descriptive content/media only. Keeps product IDs, slug, price, stock, discounts, orders, admin accounts, contact details and existing policies/reviews.',
  'SET NAMES utf8mb4;',
  'START TRANSACTION;',
  'SET @zestbd_product_id = (SELECT id FROM products ORDER BY created_at, id LIMIT 1);',
  `UPDATE products SET ${Object.entries(productFields).map(([key, value]) => `${key} = ${value}`).join(', ')}, version = version + 1 WHERE id = @zestbd_product_id;`,
  `INSERT IGNORE INTO site_settings (id, content) VALUES (1, ${json(site)});`,
  `UPDATE site_settings SET content = JSON_MERGE_PATCH(content, ${json(contentUpdate)}) WHERE id = 1;`,
  `UPDATE site_settings SET content = JSON_SET(content, '$.reviewsText', ${quote(site.reviewsText)}) WHERE id = 1 AND COALESCE(JSON_LENGTH(JSON_EXTRACT(content, '$.reviews')), 0) = 0;`,
  ...Object.entries(site.policies).map(([key, value]) => `UPDATE site_settings SET content = JSON_SET(content, '$.policies.${key}', ${quote(value)}) WHERE id = 1 AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(content, '$.policies.${key}')), '') IN ('', 'null');`),
  ...deliveryZones.map((zone) => `UPDATE delivery_zones SET zone_name = ${quote(zone.zoneName)} WHERE zone_code = ${quote(zone.zoneCode)};`),
  'COMMIT;',
  ''
].join('\n');
await writeFile('database/update-zestbd.sql', updateSql);
console.log('database/update-zestbd.sql generated (preserves commerce and account data).');
