<?php
declare(strict_types=1);

function validateOrder(array $input): array
{
    $phone = preg_replace('/\D/', '', textValue($input['customerPhone'] ?? '', 'Phone number', 1, 30));
    if (str_starts_with($phone, '8801') && strlen($phone) === 13) $phone = '0' . substr($phone, 3);
    if (!preg_match('/^01[3-9][0-9]{8}$/D', $phone)) throw new HttpError(422, 'Enter a valid Bangladesh mobile number.');
    $slug = textValue($input['productSlug'] ?? '', 'Product slug', 3, 100);
    if (!preg_match('/^[a-z0-9-]+$/D', $slug)) throw new HttpError(422, 'Invalid product slug.');
    if (!empty($input['honeypot'])) throw new HttpError(422, 'Submission blocked.');
    return [
        'productSlug' => $slug,
        'customerName' => textValue($input['customerName'] ?? '', 'Full name', 2, 120),
        'customerPhone' => $phone,
        'deliveryAddress' => textValue($input['deliveryAddress'] ?? '', 'Delivery address', 10, 800),
        'deliveryZoneId' => validateUuid($input['deliveryZoneId'] ?? ''),
        'quantity' => integerValue($input['quantity'] ?? null, 'Quantity', 1, 10),
        'customerNote' => textValue($input['customerNote'] ?? '', 'Order note', 0, 500),
        'clientRequestId' => validateUuid($input['clientRequestId'] ?? ''),
    ];
}

function verifyTurnstile($token): void
{
    if (empty(config()['require_turnstile'])) return;
    $secret = config()['turnstile_secret_key'] ?? '';
    if ($secret === '' || empty(config()['turnstile_site_key'])) throw new HttpError(503, 'Order verification is not configured yet.');
    $token = textValue($token ?? '', 'Verification token', 1, 2048);
    $curl = curl_init('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    curl_setopt_array($curl, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => http_build_query(['secret' => $secret, 'response' => $token, 'remoteip' => $_SERVER['REMOTE_ADDR'] ?? '']), CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10]);
    $response = curl_exec($curl);
    $status = curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    curl_close($curl);
    $result = $response !== false ? json_decode($response, true) : null;
    if ($status !== 200 || empty($result['success'])) throw new HttpError(422, 'Verification failed. Please retry the verification.');
    if (($result['hostname'] ?? '') !== parse_url(config()['site_url'], PHP_URL_HOST)) throw new HttpError(422, 'Verification hostname does not match.');
}

function orderReceipt(array $order, string $requestHash): array
{
    if (!hash_equals($order['request_hash'], $requestHash)) throw new HttpError(409, 'This request identifier was already used for a different order.');
    return [
        'orderReference' => $order['order_reference'], 'status' => $order['order_status'],
        'productName' => $order['product_name'], 'quantity' => (int)$order['quantity'],
        'unitPrice' => (float)$order['unit_price'], 'deliveryFee' => (float)$order['delivery_fee'],
        'totalAmount' => (float)$order['total_amount'],
    ];
}

function createOrder(array $input): array
{
    $order = validateOrder($input);
    $hash = hash('sha256', json_encode($order, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    $existing = query('SELECT * FROM orders WHERE client_request_id = ?', [$order['clientRequestId']])->fetch();
    if ($existing) return orderReceipt($existing, $hash);

    rateLimit('order', max(1, (int)(config()['rate_limit_max_orders'] ?? 5)), max(60, (int)(config()['rate_limit_window_seconds'] ?? 3600)));
    verifyTurnstile($input['turnstileToken'] ?? '');

    $pdo = db();
    $pdo->beginTransaction();
    try {
        // Lock the product before checking retries so concurrent orders cannot oversell.
        $product = query('SELECT * FROM products WHERE slug = ? FOR UPDATE', [$order['productSlug']])->fetch();
        if (!$product || !$product['active']) throw new HttpError(409, 'Product is currently unavailable.');
        $existing = query('SELECT * FROM orders WHERE client_request_id = ? FOR UPDATE', [$order['clientRequestId']])->fetch();
        if ($existing) {
            $receipt = orderReceipt($existing, $hash);
            $pdo->commit();
            return $receipt;
        }
        if ($product['stock_quantity'] !== null && (int)$product['stock_quantity'] < $order['quantity']) throw new HttpError(409, 'There is not enough stock for this quantity.');
        $zone = query('SELECT * FROM delivery_zones WHERE id = ? AND active = 1 FOR UPDATE', [$order['deliveryZoneId']])->fetch();
        if (!$zone) throw new HttpError(422, 'This delivery area is unavailable.');
        $price = moneyCents($product['price'], 'Product price');
        $fee = moneyCents($zone['delivery_fee'], 'Delivery fee');
        $id = uuid();
        $reference = 'ZB-' . gmdate('Ymd') . '-' . strtoupper(bin2hex(random_bytes(6)));
        query('INSERT INTO orders (id, order_reference, client_request_id, request_hash, product_id, product_name, customer_name, customer_phone, delivery_address, delivery_zone_id, delivery_zone_name, quantity, unit_price, delivery_fee, total_amount, stock_reserved, customer_note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
            $id, $reference, $order['clientRequestId'], $hash, $product['id'], $product['name'],
            $order['customerName'], $order['customerPhone'], $order['deliveryAddress'], $zone['id'], $zone['zone_name'],
            $order['quantity'], decimalMoney($price), decimalMoney($fee), decimalMoney($price * $order['quantity'] + $fee),
            $product['stock_quantity'] === null ? 0 : 1, $order['customerNote'],
        ]);
        if ($product['stock_quantity'] !== null) query('UPDATE products SET stock_quantity = stock_quantity - ?, version = version + 1 WHERE id = ?', [$order['quantity'], $product['id']]);
        $saved = query('SELECT * FROM orders WHERE id = ?', [$id])->fetch();
        $pdo->commit();
        return orderReceipt($saved, $hash);
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        // A unique request identifier also protects retries spanning different products.
        if ($error instanceof PDOException && $error->getCode() === '23000') {
            $existing = query('SELECT * FROM orders WHERE client_request_id = ?', [$order['clientRequestId']])->fetch();
            if ($existing) return orderReceipt($existing, $hash);
        }
        throw $error;
    }
}

function listOrders(array $params): array
{
    $page = integerValue($params['page'] ?? 1, 'Page', 1, 1000000);
    $status = textValue($params['status'] ?? '', 'Status', 0, 20);
    $search = textValue($params['search'] ?? '', 'Search', 0, 120);
    $where = [];
    $values = [];
    if ($status !== '') {
        if (!in_array($status, ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'], true)) throw new HttpError(422, 'Invalid order status.');
        $where[] = 'order_status = ?';
        $values[] = $status;
    }
    if ($search !== '') {
        $where[] = '(order_reference LIKE ? OR customer_name LIKE ? OR customer_phone LIKE ?)';
        $like = '%' . $search . '%';
        array_push($values, $like, $like, $like);
    }
    $filter = $where ? ' WHERE ' . implode(' AND ', $where) : '';
    $total = (int)query('SELECT COUNT(*) FROM orders' . $filter, $values)->fetchColumn();
    $pages = max(1, (int)ceil($total / 20));
    $page = min($page, $pages);
    $offset = ($page - 1) * 20;
    $rows = query('SELECT * FROM orders' . $filter . " ORDER BY created_at DESC, id DESC LIMIT 20 OFFSET $offset", $values)->fetchAll();
    foreach ($rows as &$row) {
        unset($row['request_hash'], $row['client_request_id'], $row['stock_reserved']);
        $row['quantity'] = (int)$row['quantity'];
        foreach (['unit_price', 'delivery_fee', 'total_amount'] as $field) $row[$field] = (float)$row[$field];
    }
    $stats = query("SELECT COUNT(*) AS total, COALESCE(SUM(order_status = 'pending'), 0) AS pending, COALESCE(SUM(order_status = 'delivered'), 0) AS delivered, COALESCE(SUM(CASE WHEN order_status <> 'cancelled' THEN total_amount ELSE 0 END), 0) AS orderValue FROM orders")->fetch();
    return ['orders' => $rows, 'total' => $total, 'page' => $page, 'pages' => $pages, 'stats' => $stats];
}

function updateOrderStatus(array $input): array
{
    $id = validateUuid($input['id'] ?? '');
    $status = textValue($input['status'] ?? '', 'Status', 1, 20);
    $transitions = ['pending' => ['confirmed', 'cancelled'], 'confirmed' => ['shipped', 'cancelled'], 'shipped' => ['delivered'], 'delivered' => [], 'cancelled' => []];
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $productId = query('SELECT product_id FROM orders WHERE id = ?', [$id])->fetchColumn();
        if (!$productId) throw new HttpError(404, 'Order not found.');
        query('SELECT id FROM products WHERE id = ? FOR UPDATE', [$productId]);
        $order = query('SELECT * FROM orders WHERE id = ? FOR UPDATE', [$id])->fetch();
        if (!$order) throw new HttpError(404, 'Order not found.');
        if ($status !== $order['order_status']) {
            if (!in_array($status, $transitions[$order['order_status']], true)) throw new HttpError(409, 'This order status transition is not allowed.');
            if ($status === 'cancelled' && $order['stock_reserved']) {
                query('UPDATE products SET stock_quantity = stock_quantity + ?, version = version + 1 WHERE id = ? AND stock_quantity IS NOT NULL', [$order['quantity'], $order['product_id']]);
            }
            query('UPDATE orders SET order_status = ?, stock_reserved = CASE WHEN ? = \'cancelled\' THEN 0 ELSE stock_reserved END WHERE id = ?', [$status, $status, $id]);
        }
        $pdo->commit();
        return ['saved' => true, 'status' => $status];
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
}
