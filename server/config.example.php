<?php
declare(strict_types=1);

return [
    'environment' => 'production',
    'site_url' => 'https://hd.zestbd.com',
    'db' => [
        'host' => 'localhost',
        'port' => 3306,
        'name' => 'CPANELUSER_decor',
        'user' => 'CPANELUSER_decoruser',
        'password' => 'REPLACE_WITH_DATABASE_PASSWORD',
    ],
    // Generate once with: php -r "echo bin2hex(random_bytes(32));"
    'setup_token' => 'REPLACE_WITH_A_RANDOM_64_CHARACTER_TOKEN',
    'turnstile_site_key' => '',
    'turnstile_secret_key' => '',
    'require_turnstile' => false,
    'rate_limit_max_orders' => 5,
    'rate_limit_window_seconds' => 3600,
];
