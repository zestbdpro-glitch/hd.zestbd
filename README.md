# Home Decor Store: Namecheap PHP + MySQL

Single-product COD storefront with a PHP API, MySQL/MariaDB database, and an authenticated admin panel.

## Admin Panel

Open `/admin/` after deployment. The first visit offers administrator creation using the setup token in your private PHP configuration. After setup, sign in with your email and password.

- **Orders:** search/filter orders, view customer details, update status, export CSV.
- **Product:** name, description, price, stock, availability, specifications, FAQ, offer.
- **Media:** manage product images, an optional MP4 video/poster, and the lifestyle image. Image-only galleries are supported.
- **Website Content:** brand/contact details, main-store home URL, section text, benefits, three buyer-review slots, three featured-product slots, and policies.
- **Delivery:** inside/outside Dhaka names, fees, and availability.
- **Account:** change your password.

Use the Save button in the corresponding editor. Uploading a file alone does not publish it. Website changes appear on the next page load without rebuilding.

Header/footer logos open the configured main-store home URL (initially `https://zestbd.com/`). The promotional Bangladesh-delivery block is removed; checkout delivery areas and charges are unchanged.

In **Website Content > Customer Reviews**, fill any of the three slots with real buyer names/text, select a 1-5 star rating, and optionally upload one product photo per review. Check **Publish review** and save. In **Featured Products**, configure up to three names, images, optional prices, and HTTPS product URLs on the configured main-store domain; check **Publish product** and save. Only published records are returned by the public API. Empty sections are hidden. No fictional reviews or catalog items are seeded. Legacy reviews beyond the first three are retained but not displayed.

These controls use the existing JSON site settings, so updating an already-configured site requires only the new website ZIP, not another schema/content SQL import. Keep existing configuration and uploads. Do not reimport `update-zestbd.sql` just to enable reviews or featured products, since that separate earlier update replaces product descriptive text/media.

Images accept JPEG, PNG, or WebP up to 8 MB and 24 megapixels. Videos accept MP4 up to 30 MB. Set PHP `upload_max_filesize` to `32M` and `post_max_size` to `40M` for video uploads. Files remain in `uploads/`; keep this folder when redeploying.

## Namecheap Deployment

1. Select PHP **8.2 or later** for `hd.zestbd.com`, with `pdo_mysql`, `mbstring`, `fileinfo`, `dom`, and `curl` enabled.
2. In cPanel **Manage My Databases**, create a MySQL database and a dedicated database user. Add the user to the database with the privileges needed for the imported tables.
3. In phpMyAdmin, select that database and import `database/schema.sql`, then `database/seed.sql`. Initial Bengali zestbd content preserves existing rows. Confirm pricing and contact details in admin before taking orders.
4. Run `npm run build` locally. Upload the **contents** of `dist/` to the document root assigned to `hd.zestbd.com`. Include hidden `.htaccess` files and the `api/`, `admin/`, `private/`, and `uploads/` directories.
5. On hosting only, copy `private/config.example.php` to `private/config.local.php`. Set the database host/name/user/password, site URL, and a random setup token of at least 32 characters. The database host is usually `localhost`; use your hosting account's actual values.
6. Open `https://hd.zestbd.com/admin/`. Enter the setup token, your email, and a password of at least 12 characters to create the administrator. First-time setup becomes unavailable after an administrator exists.
7. Check product media, prices, delivery fees, Bengali content, contact details, and policies in the admin panel. Prices, specifications, media and website text remain editable there.
8. Submit a test COD order from the HTTPS storefront and confirm the stored order and total in admin. Check stock, cancellation, and customer details before taking real orders.

Do not put database credentials in frontend `.env` variables. The build never copies `server/config.local.php` or `.local/` into `dist/`. A fresh build contains only the example PHP configuration. Preserve hosting's `private/config.local.php` on future uploads. Never delete and recreate the remote `uploads/` folder during a deployment.

The `private/` directory is denied by Apache `.htaccess`; configuration files contain PHP only. If hosting supports server environment variables, use `DECOR_CONFIG_FILE` to point to a config file **outside the document root** instead. Preserve HTTPS and do not enable PHP error display in production.

To generate a setup token locally:

```bash
php -r "echo bin2hex(random_bytes(32));"
```

Optional Cloudflare Turnstile settings are in the private PHP configuration. Register the actual domain, set both keys, and set `require_turnstile` to `true`. The public site key is delivered by the product API; the secret stays in PHP. Honeypot and database-backed rate limiting are present independently.

## Local Development

```bash
npm install
npm run setup:local
npm run dev:backend
# In another terminal:
npm run dev
```

Open `http://127.0.0.1:5173/` and `http://127.0.0.1:5173/admin/`. The Vite server proxies `/api` and `/uploads` to PHP at port 8081.

`setup:local` uses XAMPP at `C:/xampp` to create an isolated MariaDB instance at port 3307 inside `.local/mysql`. It does not modify XAMPP's existing databases. It creates a local preview administrator; login details are in `.local/preview-access.json`. Local configuration and data are ignored and excluded from production builds. Production has no preset administrator or password.

Set `PHP_BINARY` or `MYSQL_DIRECTORY` if XAMPP lives elsewhere. For other environments, create a database manually, import schema/seed, and use `server/config.local.php` or `DECOR_CONFIG_FILE` with your own database values. Set `environment` to `development` and `site_url` to the local origin.

On Windows, use `cmd /c npm ...` if PowerShell blocks `npm.ps1`.

## Build And Tests

```bash
npm run build
npm run test:unit
npm run test:e2e
npm run test:backend
```

`build` generates initial seed data and an explicit content update, optimizes supplied product images without cropping, generates logo/favicon icons, builds the storefront/admin, and packages PHP in `dist/private`. The database is authoritative after configuration; editing local configuration does not overwrite database products.

Apache serves `index.php`, which renders the product title, description, social image, and Product structured data from MySQL before sending the built HTML. Admin changes therefore update these values without another frontend build.

`test:backend` runs real PHP/MySQL tests against a disposable database and the production build at port 8082. It verifies authentication, CSRF, editing, uploads, order totals, retries, stock, cancellation, status transitions, exports, rate limiting, and mobile/desktop layouts. The test database and PHP test server are removed afterward.

The default storefront attempts the PHP API. If it is unavailable, orders are disabled. For explicit UI-only local demos, set `VITE_DEMO_MODE=true`; this is ignored outside localhost. Demo orders are never stored.

## Important Files

- `database/schema.sql`, `database/seed.sql`: phpMyAdmin imports.
- `server/config.example.php`: private hosting configuration template.
- `server/`: PDO connection, validation, authentication, order transactions, editing.
- `public/api/`: PHP endpoints.
- `src/admin/`, `admin/index.html`: admin interface.
- `src/js/`, `index.html`: storefront.
- `assets-source/wall-decor-*`: supplied product originals used during builds. Duplicate photos and old demonstration video are not published.

## Updating The Existing Namecheap Website

1. Back up the live database, `private/config.local.php`, and `uploads/`.
2. Build locally, then upload/extract the contents of the prepared `zestbd-website-update.zip` into the document root for `hd.zestbd.com`, overwriting matching build files only. The ZIP includes dotfiles but excludes local credentials and customer uploads. Preserve existing `private/config.local.php` and uploaded media.
3. In phpMyAdmin, select the existing database and import `database/update-zestbd.sql` once. Do not drop tables or reimport schema for this update. Merely uploading a frontend build does not change database content.
4. This replaces product descriptive text/gallery and website copy with Bengali zestbd content, preserving the current product price, previous price, stock, availability, slug, IDs, orders, administrator accounts, contacts, real customer reviews and already-published policies. Only empty policies are filled with the initial Bengali policy text. Delivery area names become Bengali; charges stay unchanged.
5. Open `/admin/` to verify Product, Media, Website Content and Delivery. Add the actual dimensions/materials/contact details when available. Hard refresh the storefront and test an order.

The original price of BDT 3,490 remains the initial seed price. Existing live database prices are not reset by the content update. Bengali fonts are self-hosted with their OFL license. Logo source: `public/assets/brand/zestbd-logo.svg`; mark: `public/assets/brand/zestbd-mark.svg`. SVG, ICO, PNG and Apple touch favicons are included in the build.

Order amounts are recalculated from the locked database product and delivery area. The server ignores client-submitted prices. Unique request IDs prevent duplicate inserts, and cancelled reserved stock is returned once. Admin sessions use password hashing, CSRF tokens, strict same-site cookies, and a two-hour inactivity limit. Customer records are accessible only through authenticated admin endpoints. Maintain regular database and upload backups through your hosting account.
