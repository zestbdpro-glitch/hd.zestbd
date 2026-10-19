<?php
declare(strict_types=1);
// PHP's development server does not read Apache access rules.
$path = rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/');
if (preg_match('~^/(?:private|server|database)(?:/|$)~', $path) || str_contains($path, '/.')) {
    http_response_code(403);
    exit('Forbidden');
}
return false;
