<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/server/bootstrap.php';
if ((config()['environment'] ?? '') !== 'development' || config()['db']['name'] !== 'decor_local' || config()['db']['host'] !== '127.0.0.1' || (int)config()['db']['port'] !== 3307) throw new RuntimeException('This command is only for the isolated local preview.');
if (!query('SELECT COUNT(*) FROM admins')->fetchColumn()) {
    $access = json_decode(file_get_contents(dirname(__DIR__) . '/.local/preview-access.json'), true, 32, JSON_THROW_ON_ERROR);
    query('INSERT INTO admins (id, email, password_hash) VALUES (1, ?, ?)', [$access['email'], password_hash($access['password'], PASSWORD_DEFAULT)]);
    echo 'Local preview administrator created.' . PHP_EOL;
}
