<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';
runApi(function (): array {
    requireMethod('GET');
    return ['product' => publicProduct(productRow(false)), 'deliveryZones' => deliveryZones(), 'site' => publicSiteContent()];
});
