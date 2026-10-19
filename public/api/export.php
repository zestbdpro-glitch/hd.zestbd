<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';
try {
    requireMethod('GET');
    requireAdmin();
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="decor-orders-' . gmdate('Y-m-d') . '.csv"');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    $output = fopen('php://output', 'w');
    fwrite($output, "\xEF\xBB\xBF");
    $fields = ['order_reference', 'created_at', 'customer_name', 'customer_phone', 'delivery_address', 'product_name', 'quantity', 'unit_price', 'delivery_zone_name', 'delivery_fee', 'total_amount', 'order_status', 'customer_note'];
    fputcsv($output, $fields);
    $statement = query('SELECT ' . implode(', ', $fields) . ' FROM orders ORDER BY created_at DESC');
    while ($row = $statement->fetch(PDO::FETCH_NUM)) {
        $row = array_map(fn($value) => preg_match('/^[\s]*[=+@-]/', (string)$value) ? "'" . $value : $value, $row);
        fputcsv($output, $row);
    }
    fclose($output);
} catch (Throwable $error) {
    http_response_code($error instanceof HttpError ? $error->status : 500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => $error instanceof HttpError ? $error->getMessage() : 'Export failed.']);
}
