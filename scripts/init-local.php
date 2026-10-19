<?php
declare(strict_types=1);
$path = getenv('DECOR_CONFIG_FILE');
if (!$path || !is_file($path)) throw new RuntimeException('A local configuration file is required.');
$config = require $path;
if (($config['environment'] ?? '') !== 'development' || $config['db']['host'] !== '127.0.0.1' || (int)$config['db']['port'] !== 3307 || !preg_match('/^decor_(local|test_[a-f0-9]+)$/D', $config['db']['name'])) throw new RuntimeException('Local initialization accepts only isolated decor databases.');
$credentialsFile = dirname(__DIR__) . '/.local/mysql.json';
$credentials = json_decode(file_get_contents($credentialsFile), true);
$db = $config['db'];
$needsPassword = !$credentials['initialized'];
try {
    $pdo = new PDO('mysql:host=127.0.0.1;port=3307;charset=utf8mb4', 'root', $credentials['initialized'] ? $db['password'] : '', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
} catch (PDOException $error) {
    if (($error->errorInfo[1] ?? 0) !== 1045) throw $error;
    $pdo = new PDO('mysql:host=127.0.0.1;port=3307;charset=utf8mb4', 'root', '', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $needsPassword = true;
}
$actualDirectory = strtolower(rtrim(str_replace('\\', '/', $pdo->query('SELECT @@datadir')->fetchColumn()), '/'));
$expectedDirectory = strtolower(str_replace('\\', '/', realpath(dirname(__DIR__) . '/.local/mysql')));
if ($actualDirectory !== $expectedDirectory) throw new RuntimeException('This is not the isolated project database server.');
$pdo->exec('CREATE DATABASE IF NOT EXISTS `' . $db['name'] . '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
$pdo->exec('USE `' . $db['name'] . '`');
$pdo->exec(file_get_contents(dirname(__DIR__) . '/database/schema.sql'));
if (!$pdo->query("SHOW COLUMNS FROM products LIKE 'version'")->fetch()) $pdo->exec('ALTER TABLE products ADD COLUMN version INT UNSIGNED NOT NULL DEFAULT 1');
$pdo->exec(file_get_contents(dirname(__DIR__) . '/database/seed.sql'));
if ($needsPassword) {
    foreach ($pdo->query("SELECT Host FROM mysql.user WHERE User = 'root' AND Host IN ('localhost', '127.0.0.1', '::1')")->fetchAll(PDO::FETCH_COLUMN) as $host) {
        $pdo->exec('ALTER USER ' . $pdo->quote('root') . '@' . $pdo->quote($host) . ' IDENTIFIED BY ' . $pdo->quote($db['password']));
    }
    $credentials['initialized'] = true;
    file_put_contents($credentialsFile, json_encode($credentials));
}
echo 'Local database initialized: ' . $db['name'] . PHP_EOL;
