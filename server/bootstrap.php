<?php
declare(strict_types=1);

final class HttpError extends RuntimeException
{
    public int $status;
    public function __construct(int $status, string $message)
    {
        parent::__construct($message);
        $this->status = $status;
    }
}

function config(): array
{
    static $config;
    if ($config === null) {
        $path = getenv('DECOR_CONFIG_FILE') ?: __DIR__ . '/config.local.php';
        if (!is_file($path)) {
            throw new HttpError(503, 'The store database is not configured yet.');
        }
        $config = require $path;
        if (!is_array($config)) throw new HttpError(503, 'The store configuration is invalid.');
    }
    return $config;
}

function db(): PDO
{
    static $pdo;
    if ($pdo === null) {
        $settings = config()['db'];
        try {
            $pdo = new PDO(
                'mysql:host=' . $settings['host'] . ';port=' . ($settings['port'] ?? 3306) . ';dbname=' . $settings['name'] . ';charset=utf8mb4',
                $settings['user'], $settings['password'],
                [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false]
            );
            $pdo->exec("SET time_zone = '+00:00'");
        } catch (PDOException $error) {
            error_log('Decor database connection failed: ' . $error->getCode());
            throw new HttpError(503, 'The store database is temporarily unavailable.');
        }
    }
    return $pdo;
}

function query(string $sql, array $values = []): PDOStatement
{
    $statement = db()->prepare($sql);
    $statement->execute($values);
    return $statement;
}

function runApi(callable $handler): void
{
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    try {
        $result = $handler();
        echo json_encode($result, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    } catch (Throwable $error) {
        http_response_code($error instanceof HttpError ? $error->status : 500);
        if (!$error instanceof HttpError) error_log('Decor API: ' . $error->getMessage());
        echo json_encode(['error' => $error instanceof HttpError ? $error->getMessage() : 'The request could not be completed. Please try again.']);
    }
}

function requireMethod(string $method): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== $method) {
        header('Allow: ' . $method);
        throw new HttpError(405, 'Method not allowed.');
    }
}

function readJson(): array
{
    if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== 0) throw new HttpError(415, 'Send a JSON request.');
    $raw = file_get_contents('php://input', false, null, 0, 131073);
    if ($raw === false || strlen($raw) > 131072) throw new HttpError(413, 'The request is too large.');
    try {
        $data = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
    } catch (JsonException $error) {
        throw new HttpError(400, 'Invalid JSON request.');
    }
    if (!is_array($data) || array_is_list($data)) throw new HttpError(400, 'A JSON object is required.');
    return $data;
}

function assertOrigin(): void
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin === '') return;
    $allowed = [rtrim(config()['site_url'], '/')];
    if ((config()['environment'] ?? 'production') === 'development') {
        $allowed = array_merge($allowed, ['http://127.0.0.1:5173', 'http://localhost:5173', 'http://127.0.0.1:5174', 'http://localhost:5174', 'http://127.0.0.1:8081']);
    }
    if (!in_array($origin, $allowed, true)) throw new HttpError(403, 'This request origin is not allowed.');
}

function textValue($value, string $label, int $min = 0, int $max = 500): string
{
    if (!is_string($value)) throw new HttpError(422, "$label must be text.");
    $value = trim($value);
    $length = mb_strlen($value);
    if ($length < $min || $length > $max) throw new HttpError(422, "$label must contain $min to $max characters.");
    return $value;
}

function integerValue($value, string $label, int $min, int $max): int
{
    if (filter_var($value, FILTER_VALIDATE_INT) === false || (int)$value < $min || (int)$value > $max) {
        throw new HttpError(422, "$label must be between $min and $max.");
    }
    return (int)$value;
}

function passwordValue($value, string $label, int $minimum): string
{
    if (!is_string($value) || mb_strlen($value) < $minimum || strlen($value) > 72 || trim($value) === '') {
        throw new HttpError(422, "$label must contain at least $minimum characters and at most 72 bytes.");
    }
    return $value;
}

function moneyCents($value, string $label): int
{
    if (!is_string($value) && !is_int($value) && !is_float($value)) throw new HttpError(422, "$label must be a valid amount.");
    $text = (string)$value;
    if (!preg_match('/^\d{1,7}(?:\.\d{1,2})?$/D', $text)) throw new HttpError(422, "$label must be a non-negative amount with at most two decimal places.");
    $parts = explode('.', $text);
    return (int)$parts[0] * 100 + (int)str_pad($parts[1] ?? '', 2, '0');
}

function decimalMoney(int $cents): string
{
    return intdiv($cents, 100) . '.' . str_pad((string)($cents % 100), 2, '0', STR_PAD_LEFT);
}

function uuid(): string
{
    $bytes = random_bytes(16);
    $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
    $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($bytes), 4));
}

function validateUuid($value): string
{
    if (!is_string($value) || !preg_match('/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iD', $value)) throw new HttpError(422, 'Invalid request identifier.');
    return strtolower($value);
}

function rateLimit(string $scope, int $maximum, int $seconds, string $extra = ''): void
{
    $identifier = hash_hmac('sha256', ($_SERVER['REMOTE_ADDR'] ?? 'unknown') . '|' . $extra, config()['setup_token']);
    $window = (int)(floor(time() / $seconds) * $seconds);
    query('INSERT INTO rate_limits (identifier, scope, window_start, request_count) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE request_count = request_count + 1', [$identifier, $scope, $window]);
    $count = query('SELECT request_count FROM rate_limits WHERE identifier = ? AND scope = ? AND window_start = ?', [$identifier, $scope, $window])->fetchColumn();
    if ((int)$count > $maximum) {
        header('Retry-After: ' . max(1, $window + $seconds - time()));
        throw new HttpError(429, 'Too many attempts. Please try again later.');
    }
    if (random_int(1, 100) === 1) query('DELETE FROM rate_limits WHERE window_start < ?', [time() - 86400]);
}

function startSession(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) return;
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    session_name('decor_admin');
    session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => str_starts_with(config()['site_url'], 'https://'), 'httponly' => true, 'samesite' => 'Strict']);
    session_start();
    if (isset($_SESSION['last_seen']) && time() - $_SESSION['last_seen'] > 7200) $_SESSION = [];
    $_SESSION['csrf'] ??= bin2hex(random_bytes(32));
    $_SESSION['last_seen'] = time();
}

function requireCsrf(): void
{
    startSession();
    assertOrigin();
    if (!hash_equals($_SESSION['csrf'], $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '')) throw new HttpError(403, 'Your session expired. Refresh and try again.');
}

function currentAdmin(): ?array
{
    startSession();
    if (empty($_SESSION['admin_id'])) return null;
    $admin = query('SELECT id, email, session_version FROM admins WHERE id = ?', [$_SESSION['admin_id']])->fetch();
    if (!$admin || (int)$admin['session_version'] !== ($_SESSION['session_version'] ?? 0)) {
        unset($_SESSION['admin_id']);
        return null;
    }
    return $admin;
}

function requireAdmin(): array
{
    $admin = currentAdmin();
    if (!$admin) throw new HttpError(401, 'Please sign in to continue.');
    return $admin;
}

function signInAdmin(array $admin): array
{
    session_regenerate_id(true);
    $_SESSION['admin_id'] = (int)$admin['id'];
    $_SESSION['session_version'] = (int)$admin['session_version'];
    $_SESSION['csrf'] = bin2hex(random_bytes(32));
    return ['authenticated' => true, 'email' => $admin['email'], 'csrfToken' => $_SESSION['csrf']];
}

function productRow(bool $onlyActive = true): array
{
    $row = query('SELECT * FROM products' . ($onlyActive ? ' WHERE active = 1' : '') . ' ORDER BY created_at, id LIMIT 1')->fetch();
    if (!$row) throw new HttpError(404, 'Product is unavailable.');
    return $row;
}

function publicProduct(array $row): array
{
    return [
        'id' => $row['id'], 'slug' => $row['slug'], 'name' => $row['name'], 'headline' => $row['headline'],
        'description' => $row['description'], 'price' => (float)$row['price'],
        'compareAtPrice' => $row['compare_at_price'] === null ? null : (float)$row['compare_at_price'],
        'active' => (bool)$row['active'], 'stockQuantity' => $row['stock_quantity'] === null ? null : (int)$row['stock_quantity'],
        'version' => (int)$row['version'],
        'media' => json_decode($row['media'], true), 'specifications' => json_decode($row['specifications'], true),
        'faq' => json_decode($row['faq'], true), 'deliveryNote' => $row['delivery_note'],
        'offer' => $row['offer'] === null ? null : json_decode($row['offer'], true),
    ];
}

function deliveryZones(bool $onlyActive = true): array
{
    return array_map(fn($zone) => [
        'id' => $zone['id'], 'zoneCode' => $zone['zone_code'], 'zoneName' => $zone['zone_name'],
        'deliveryFee' => (float)$zone['delivery_fee'], 'active' => (bool)$zone['active'],
    ], query('SELECT * FROM delivery_zones' . ($onlyActive ? ' WHERE active = 1' : '') . ' ORDER BY zone_code')->fetchAll());
}

function siteContent(): array
{
    $raw = query('SELECT content FROM site_settings WHERE id = 1')->fetchColumn();
    $site = $raw ? json_decode($raw, true) : [];
    $site += ['mainSiteUrl' => 'https://zestbd.com/', 'featuredTitle' => 'আরও পছন্দের পণ্য', 'featuredText' => 'zestbd-এর মূল দোকানে আরও পণ্য দেখুন।', 'featuredProducts' => []];
    $site['canonicalUrl'] = rtrim(config()['site_url'], '/') . '/';
    $site['turnstileSiteKey'] = config()['turnstile_site_key'] ?? '';
    return $site;
}

function publicSiteContent(): array
{
    $site = siteContent();
    $reviews = is_array($site['reviews'] ?? null) ? $site['reviews'] : [];
    $featured = is_array($site['featuredProducts'] ?? null) ? $site['featuredProducts'] : [];
    $site['reviews'] = array_values(array_filter(array_slice($reviews, 0, 3), fn($item) => is_array($item) && ($item['active'] ?? true) === true && !empty($item['name']) && !empty($item['text'])));
    $site['featuredProducts'] = array_values(array_filter(array_slice($featured, 0, 3), fn($item) => is_array($item) && ($item['active'] ?? false) === true && !empty($item['name']) && !empty($item['image']) && !empty($item['url'])));
    return $site;
}

require_once __DIR__ . '/orders.php';
require_once __DIR__ . '/editing.php';
