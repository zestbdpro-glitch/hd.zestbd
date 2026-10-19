<?php
declare(strict_types=1);
define('DECOR_PUBLIC_ROOT', dirname(__DIR__));
$bootstrap = dirname(__DIR__) . '/private/bootstrap.php';
if (!is_file($bootstrap)) $bootstrap = dirname(__DIR__, 2) . '/server/bootstrap.php';
require_once $bootstrap;
