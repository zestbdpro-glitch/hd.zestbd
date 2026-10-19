<?php
declare(strict_types=1);
require_once __DIR__ . '/api/bootstrap.php';
$file = __DIR__ . '/index.html';
if (!is_file($file)) {
    http_response_code(503);
    exit('Run the production build or use the Vite development URL.');
}
$html = file_get_contents($file);
try {
    $product = publicProduct(productRow(false));
    $site = publicSiteContent();
    $doc = new DOMDocument('1.0', 'UTF-8');
    $doc->loadHTML('<?xml encoding="UTF-8">' . $html, LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING);
    foreach (iterator_to_array($doc->childNodes) as $node) if ($node->nodeType === XML_PI_NODE) $doc->removeChild($node);
    $xpath = new DOMXPath($doc);
    $title = $site['brandName'] . ' - ' . ($product['headline'] ?: $product['name']);
    $text = [
        '//title' => $title,
        '//*[@data-product-heading]' => $product['headline'],
        '//*[@data-product-description]' => $product['description'],
        '//*[@data-brand-name or @data-brand-name-footer or @data-brand-name-copy]' => $site['brandName'],
        '//*[@data-summary-product]' => $product['name'],
        '//*[@data-product-price or @data-summary-unit]' => strtr(number_format($product['price'], $product['price'] == floor($product['price']) ? 0 : 2), ['0'=>'০', '1'=>'১', '2'=>'২', '3'=>'৩', '4'=>'৪', '5'=>'৫', '6'=>'৬', '7'=>'৭', '8'=>'৮', '9'=>'৯']) . '৳',
    ];
    foreach ($text as $selector => $value) foreach ($xpath->query($selector) as $node) $node->textContent = $value;
    try { $mainUrl = storeUrl($site['mainSiteUrl']); } catch (HttpError $error) { $mainUrl = 'https://zestbd.com/'; }
    foreach ($xpath->query('//*[@data-main-site-link]') as $node) $node->setAttribute('href', $mainUrl);
    foreach ($xpath->query('//*[@data-content]') as $node) $node->textContent = $site[$node->getAttribute('data-content')] ?? '';
    $imageUrl = function (string $path) use ($site): string {
        return str_starts_with($path, 'https://') ? $path : rtrim($site['canonicalUrl'], '/') . '/' . ltrim($path, './');
    };
    $firstImage = $product['media'][0]['fallback'] ?? $product['media'][0]['src'];
    foreach ($xpath->query('//link[@rel="preload" and @as="image"]') as $node) {
        $node->setAttribute('href', $imageUrl($product['media'][0]['src']));
        $node->removeAttribute('type');
    }
    foreach ([
        'description' => $product['description'], 'og:title' => $site['brandName'] . ' - ' . $product['name'],
        'og:description' => $product['description'], 'og:image' => $imageUrl($firstImage),
    ] as $key => $value) foreach ($xpath->query('//meta[@name="' . $key . '" or @property="' . $key . '"]') as $node) $node->setAttribute('content', $value);
    foreach ($xpath->query('//link[@rel="canonical"]') as $node) $node->setAttribute('href', $site['canonicalUrl']);
    $schema = $doc->createElement('script');
    $schema->setAttribute('type', 'application/ld+json');
    $schema->setAttribute('id', 'product-jsonld');
    $schema->textContent = json_encode([
        '@context' => 'https://schema.org', '@type' => 'Product', 'name' => $product['name'],
        'description' => $product['description'], 'image' => array_map(fn($item) => $imageUrl($item['fallback'] ?? $item['src']), array_values(array_filter($product['media'], fn($item) => $item['type'] === 'image'))),
        'offers' => ['@type' => 'Offer', 'priceCurrency' => 'BDT', 'price' => $product['price'], 'availability' => !$product['active'] || $product['stockQuantity'] === 0 ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock', 'url' => $site['canonicalUrl']],
    ], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    $doc->getElementsByTagName('head')->item(0)->appendChild($schema);
    $html = $doc->saveHTML();
} catch (Throwable $error) {
    error_log('Decor storefront metadata: ' . ($error instanceof HttpError ? $error->getMessage() : get_class($error)));
}
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
echo $html;
