<?php
declare(strict_types=1);
$path = getenv('DECOR_CONFIG_FILE');
if (!$path || !is_file($path)) throw new RuntimeException('A local config file is required.');
$config = require $path;
$settings = $config['db'];
if (($config['environment'] ?? '') !== 'development' || $settings['host'] !== '127.0.0.1' || (int)$settings['port'] !== 3307 || $settings['name'] !== 'decor_local') throw new RuntimeException('This helper only updates the isolated local preview database.');
$pdo = new PDO('mysql:host=127.0.0.1;port=3307;dbname=decor_local;charset=utf8mb4', $settings['user'], $settings['password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$actual = strtolower(rtrim(str_replace('\\', '/', $pdo->query('SELECT @@datadir')->fetchColumn()), '/'));
$expected = strtolower(str_replace('\\', '/', realpath(dirname(__DIR__) . '/.local/mysql')));
if ($actual !== $expected) throw new RuntimeException('This is not the isolated project database server.');
$pdo->exec(file_get_contents(dirname(__DIR__) . '/database/update-zestbd.sql'));
echo "Local preview content updated; existing prices, orders and accounts preserved.\n";
