<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/server/bootstrap.php';

function contentUpdateSnapshot(): array
{
    $admins = query('SELECT id, email, password_hash, session_version FROM admins ORDER BY id')->fetchAll();
    $orders = query('SELECT * FROM orders ORDER BY id')->fetchAll();
    return [
        'product' => productRow(false),
        'site' => json_decode(query('SELECT content FROM site_settings WHERE id = 1')->fetchColumn(), true, 32, JSON_THROW_ON_ERROR),
        'deliveryZones' => query('SELECT * FROM delivery_zones ORDER BY zone_code')->fetchAll(),
        'admins' => $admins, 'adminCount' => count($admins), 'orders' => $orders, 'orderCount' => count($orders),
    ];
}

$input = getenv('DECOR_TEST_CLEANUP') === '1' ? [] : json_decode(stream_get_contents(STDIN), true, 32, JSON_THROW_ON_ERROR);
if (($input['action'] ?? '') !== 'validate-product' && !preg_match('/^decor_test_[a-f0-9]+$/D', config()['db']['name'])) throw new RuntimeException('A disposable test database is required.');
if (getenv('DECOR_TEST_CLEANUP') === '1') {
    db()->exec('DROP DATABASE `' . config()['db']['name'] . '`');
    echo 'Disposable test database removed.' . PHP_EOL;
    exit;
}
try {
    $action = $input['action'];
    if ($action === 'validate-product') { echo json_encode(['status' => 200, 'product' => validateProductEdit($input['product'])]); exit; }
    elseif ($action === 'set-stock') query('UPDATE products SET stock_quantity = ?, version = version + 1', [$input['stock']]);
    elseif ($action === 'reset-rates') query('DELETE FROM rate_limits');
    elseif ($action === 'stock') { echo json_encode(['stock' => (int)productRow(false)['stock_quantity']]); exit; }
    elseif ($action === 'order-count') { echo json_encode(['count' => (int)query('SELECT COUNT(*) FROM orders')->fetchColumn()]); exit; }
    elseif ($action === 'order') { $_SERVER['REMOTE_ADDR'] = '127.0.0.1'; echo json_encode(['status' => 200, 'receipt' => createOrder($input['order'])]); exit; }
    elseif ($action === 'apply-content-update') {
        $before = contentUpdateSnapshot();
        db()->exec(file_get_contents(dirname(__DIR__) . '/database/update-zestbd.sql'));
        echo json_encode(['before' => $before, 'after' => contentUpdateSnapshot()], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        exit;
    }
    elseif ($action === 'turnstile') {
        $config = config(); $config['require_turnstile'] = $input['enabled'];
        file_put_contents(getenv('DECOR_CONFIG_FILE'), '<?php return ' . var_export($config, true) . ';');
    }
    else throw new RuntimeException('Unknown fixture action.');
    echo json_encode(['ok' => true]);
} catch (HttpError $error) { echo json_encode(['status' => $error->status, 'error' => $error->getMessage()]); }
