<?php
declare(strict_types=1);

function mediaPath($value): string
{
    $value = textValue($value, 'Media path', 1, 1000);
    if (preg_match('~^(?:\./)?(?:assets|uploads)/[a-zA-Z0-9_./-]+$~D', $value) && !str_contains($value, '..')) return $value;
    if (filter_var($value, FILTER_VALIDATE_URL) && parse_url($value, PHP_URL_SCHEME) === 'https' && !parse_url($value, PHP_URL_USER)) return $value;
    throw new HttpError(422, 'Use a local assets/uploads path or an HTTPS media URL.');
}

function storeUrl($value, ?string $mainUrl = null): string
{
    $url = textValue($value, 'Store URL', 1, 1000);
    $parts = parse_url($url);
    if (!filter_var($url, FILTER_VALIDATE_URL) || !$parts || ($parts['scheme'] ?? '') !== 'https' || empty($parts['host']) || isset($parts['user']) || isset($parts['pass'])) throw new HttpError(422, 'Use a complete HTTPS store URL without login details.');
    if ($mainUrl !== null) {
        $host = fn(string $value): string => preg_replace('/^www\./', '', strtolower($value));
        if ($host($parts['host']) !== $host(parse_url($mainUrl, PHP_URL_HOST))) throw new HttpError(422, 'Featured product links must use the main store domain.');
    }
    return $url;
}

function optionalContentImage(array $item): array
{
    $image = textValue($item['image'] ?? '', 'Image path', 0, 1000);
    return ['image' => $image === '' ? '' : mediaPath($image), 'imageAlt' => textValue($item['imageAlt'] ?? '', 'Image description', 0, 300)];
}

function validateProductEdit(array $input): array
{
    $name = textValue($input['name'] ?? '', 'Product name', 2, 200);
    $slug = textValue($input['slug'] ?? '', 'Product slug', 3, 100);
    if (!preg_match('/^[a-z0-9-]+$/D', $slug)) throw new HttpError(422, 'Product slug may contain lowercase letters, numbers, and hyphens.');
    $price = moneyCents($input['price'] ?? '', 'Price');
    $compare = ($input['compareAtPrice'] ?? '') === '' || $input['compareAtPrice'] === null ? null : moneyCents($input['compareAtPrice'], 'Previous price');
    if ($compare !== null && $compare <= $price) throw new HttpError(422, 'Previous price must be greater than the selling price.');
    $stock = ($input['stockQuantity'] ?? '') === '' || $input['stockQuantity'] === null ? null : integerValue($input['stockQuantity'], 'Stock', 0, 1000000);
    $media = $input['media'] ?? [];
    if (!is_array($media) || count($media) < 1 || count($media) > 8) throw new HttpError(422, 'Add between one and eight media items, starting with a product image.');
    $media = array_values($media);
    $usedIds = [];
    $videos = 0;
    foreach ($media as $index => $item) {
        if (!is_array($item) || !in_array($item['type'] ?? null, ['image', 'video'], true)) throw new HttpError(422, 'Media type must be image or video.');
        if ($index === 0 && $item['type'] !== 'image') throw new HttpError(422, 'The first media item must be a product image.');
        if ($item['type'] === 'video' && ++$videos > 1) throw new HttpError(422, 'Use at most one product video.');
        if (array_key_exists('id', $item)) {
            $id = $item['id'];
            if (!is_string($id) || !preg_match('/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/D', $id) || isset($usedIds[$id])) throw new HttpError(422, 'Media IDs must be unique and contain only letters, numbers, underscores, and hyphens.');
            $usedIds[$id] = true;
        }
    }
    $cleanMedia = [];
    $imageIndex = 0;
    foreach ($media as $item) {
        $type = $item['type'];
        $base = $type === 'video' ? 'demo' : (['main', 'detail', 'angle', 'extra'][$imageIndex] ?? 'extra-' . ($imageIndex - 2));
        if ($type === 'image') $imageIndex++;
        $id = $item['id'] ?? $base;
        if (!array_key_exists('id', $item)) {
            for ($suffix = 2; isset($usedIds[$id]); $suffix++) $id = $base . '-' . $suffix;
            $usedIds[$id] = true;
        }
        $clean = [
            'id' => $id, 'type' => $type,
            'label' => textValue($item['label'] ?? ($type === 'video' ? 'Product video' : 'Product image'), 'Media label', 1, 150),
            'src' => mediaPath($item['src'] ?? ''), 'thumb' => mediaPath($item['thumb'] ?? ''),
            'width' => integerValue($item['width'] ?? 960, 'Image width', 1, 10000),
            'height' => integerValue($item['height'] ?? 960, 'Image height', 1, 10000),
            'alt' => textValue($item['alt'] ?? $name, 'Image description', 1, 300),
        ];
        if ($type === 'image') $clean['fallback'] = mediaPath($item['fallback'] ?? $clean['src']);
        else {
            $clean['poster'] = mediaPath($item['poster'] ?? '');
            $clean['posterFallback'] = mediaPath($item['posterFallback'] ?? $clean['poster']);
        }
        $cleanMedia[] = $clean;
    }
    $specs = $input['specifications'] ?? [];
    if (!is_array($specs) || count($specs) > 30) throw new HttpError(422, 'Use up to 30 specifications.');
    $cleanSpecs = [];
    foreach ($specs as $key => $value) $cleanSpecs[textValue((string)$key, 'Specification label', 1, 100)] = textValue($value, 'Specification value', 1, 1000);
    $faq = $input['faq'] ?? [];
    if (!is_array($faq) || count($faq) > 30) throw new HttpError(422, 'Use up to 30 FAQ entries.');
    $cleanFaq = [];
    foreach ($faq as $item) {
        if (!is_array($item)) throw new HttpError(422, 'Invalid FAQ entry.');
        $cleanFaq[] = ['question' => textValue($item['question'] ?? '', 'Question', 2, 300), 'answer' => textValue($item['answer'] ?? '', 'Answer', 2, 3000)];
    }
    $offer = null;
    if (!empty($input['offer'])) $offer = ['title' => textValue($input['offer']['title'] ?? '', 'Offer title', 2, 240), 'copy' => textValue($input['offer']['copy'] ?? '', 'Offer text', 2, 2000)];
    return [
        'slug' => $slug, 'name' => $name, 'headline' => textValue($input['headline'] ?? '', 'Headline', 2, 240),
        'description' => textValue($input['description'] ?? '', 'Description', 2, 3000),
        'price' => decimalMoney($price), 'compare_at_price' => $compare === null ? null : decimalMoney($compare),
        'active' => !empty($input['active']) ? 1 : 0, 'stock_quantity' => $stock,
        'media' => json_encode($cleanMedia, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR),
        'specifications' => json_encode((object)$cleanSpecs, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
        'faq' => json_encode($cleanFaq, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
        'delivery_note' => textValue($input['deliveryNote'] ?? '', 'Delivery note', 0, 500),
        'offer' => $offer ? json_encode($offer, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) : null,
    ];
}

function saveProduct(array $input): array
{
    $values = validateProductEdit($input);
    $product = productRow(false);
    $version = integerValue($input['version'] ?? 0, 'Product version', 1, 2147483647);
    $assignments = implode(', ', array_map(fn($key) => "$key = ?", array_keys($values)));
    $changed = query("UPDATE products SET $assignments, version = version + 1 WHERE id = ? AND version = ?", [...array_values($values), $product['id'], $version]);
    if ($changed->rowCount() === 0) throw new HttpError(409, 'Product or stock changed since this editor was opened. Reload the editor before saving.');
    return ['saved' => true, 'product' => publicProduct(productRow(false))];
}

function saveSite(array $input): array
{
    $site = $input['site'] ?? [];
    if (!is_array($site)) throw new HttpError(422, 'Invalid website content.');
    $clean = [];
    $existing = siteContent();
    foreach (['brandName', 'brandInitials', 'tagline', 'supportPhone', 'supportEmail'] as $key) $clean[$key] = textValue($site[$key] ?? '', $key, 1, $key === 'brandInitials' ? 4 : 150);
    if (!filter_var($clean['supportEmail'], FILTER_VALIDATE_EMAIL)) throw new HttpError(422, 'Enter a valid support email.');
    $clean['mainSiteUrl'] = storeUrl($site['mainSiteUrl'] ?? $existing['mainSiteUrl']);
    $keys = ['heroEyebrow', 'qualityTitle', 'qualityNote', 'whyEyebrow', 'whyTitle', 'lifestyleEyebrow', 'lifestyleTitle', 'lifestyleText', 'detailsTitle', 'detailsText', 'reviewsTitle', 'reviewsText', 'orderTitle', 'orderText', 'faqTitle', 'footerDescription', 'featuredTitle', 'featuredText'];
    foreach ($keys as $key) $clean[$key] = textValue($site[$key] ?? $existing[$key] ?? '', $key, 0, 3000);
    $clean['lifestyleImage'] = mediaPath($site['lifestyleImage'] ?? '');
    $clean['lifestyleImageAlt'] = textValue($site['lifestyleImageAlt'] ?? '', 'Lifestyle image description', 1, 300);
    $features = $site['features'] ?? [];
    if (!is_array($features) || count($features) !== 4) throw new HttpError(422, 'Add four product benefits.');
    $clean['features'] = [];
    foreach ($features as $item) $clean['features'][] = ['title' => textValue($item['title'] ?? '', 'Benefit title', 2, 100), 'text' => textValue($item['text'] ?? '', 'Benefit text', 2, 1000)];
    $reviews = $site['reviews'] ?? [];
    if (!is_array($reviews) || count($reviews) > 20) throw new HttpError(422, 'Use up to 20 customer reviews.');
    $clean['reviews'] = [];
    foreach ($reviews as $index => $item) {
        if (!is_array($item)) throw new HttpError(422, 'Invalid customer review.');
        $item += array_intersect_key($existing['reviews'][$index] ?? [], array_flip(['active', 'rating', 'image', 'imageAlt']));
        if (isset($item['active']) && !is_bool($item['active'])) throw new HttpError(422, 'Review publication must be true or false.');
        $active = $item['active'] ?? true;
        $clean['reviews'][] = [
            'name' => textValue($item['name'] ?? '', 'Review author', $active ? 1 : 0, 120),
            'text' => textValue($item['text'] ?? '', 'Review text', $active ? 2 : 0, 2000),
            'rating' => integerValue($item['rating'] ?? 5, 'Star rating', 1, 5),
            'active' => $active,
        ] + optionalContentImage($item);
    }
    $featured = $site['featuredProducts'] ?? $existing['featuredProducts'];
    if (!is_array($featured) || count($featured) > 3) throw new HttpError(422, 'Use up to three featured products.');
    $clean['featuredProducts'] = [];
    foreach ($featured as $item) {
        if (!is_array($item)) throw new HttpError(422, 'Invalid featured product.');
        if (isset($item['active']) && !is_bool($item['active'])) throw new HttpError(422, 'Product publication must be true or false.');
        $active = $item['active'] ?? false;
        $image = optionalContentImage($item);
        if ($active && $image['image'] === '') throw new HttpError(422, 'Add an image before publishing a featured product.');
        $url = textValue($item['url'] ?? '', 'Product URL', $active ? 1 : 0, 1000);
        $price = $item['price'] ?? null;
        $clean['featuredProducts'][] = [
            'name' => textValue($item['name'] ?? '', 'Featured product name', $active ? 2 : 0, 200),
            'url' => $url === '' ? '' : storeUrl($url, $clean['mainSiteUrl']),
            'price' => $price === '' || $price === null ? null : (float)decimalMoney(moneyCents($price, 'Featured product price')),
            'active' => $active,
        ] + $image;
    }
    $clean['policies'] = [];
    foreach (['delivery', 'privacy', 'returns', 'terms'] as $key) $clean['policies'][$key] = textValue($site['policies'][$key] ?? '', "$key policy", 0, 10000);
    query('INSERT INTO site_settings (id, content) VALUES (1, ?) ON DUPLICATE KEY UPDATE content = VALUES(content)', [json_encode($clean, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR)]);
    return ['saved' => true, 'site' => siteContent()];
}

function saveMedia(array $input): array
{
    $product = publicProduct(productRow(false));
    $product['media'] = $input['media'] ?? [];
    $media = validateProductEdit($product)['media'];
    $image = mediaPath($input['lifestyleImage'] ?? '');
    $alt = textValue($input['lifestyleImageAlt'] ?? '', 'Lifestyle image description', 1, 300);
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $site = query('SELECT content FROM site_settings WHERE id = 1 FOR UPDATE')->fetchColumn();
        $site = $site ? json_decode($site, true) : [];
        $site['lifestyleImage'] = $image;
        $site['lifestyleImageAlt'] = $alt;
        query('UPDATE products SET media = ?, version = version + 1 WHERE id = ?', [$media, $product['id']]);
        query('UPDATE site_settings SET content = ? WHERE id = 1', [json_encode($site, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR)]);
        $pdo->commit();
        return ['saved' => true, 'product' => publicProduct(productRow(false)), 'site' => siteContent()];
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
}

function saveDelivery(array $input): array
{
    $zones = $input['deliveryZones'] ?? [];
    $existing = deliveryZones(false);
    if (!is_array($zones) || count($zones) !== count($existing)) throw new HttpError(422, 'Both delivery areas are required.');
    $known = array_column($existing, 'id');
    $clean = [];
    foreach ($zones as $zone) {
        $id = validateUuid($zone['id'] ?? '');
        if (!in_array($id, $known, true) || isset($clean[$id])) throw new HttpError(422, 'Invalid delivery area.');
        $clean[$id] = [textValue($zone['zoneName'] ?? '', 'Area name', 2, 100), decimalMoney(moneyCents($zone['deliveryFee'] ?? '', 'Delivery charge')), !empty($zone['active']) ? 1 : 0, $id];
    }
    $pdo = db();
    $pdo->beginTransaction();
    try {
        foreach ($clean as $values) query('UPDATE delivery_zones SET zone_name = ?, delivery_fee = ?, active = ? WHERE id = ?', $values);
        $pdo->commit();
        return ['saved' => true, 'deliveryZones' => deliveryZones(false)];
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
}
