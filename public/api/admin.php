<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';

runApi(function (): array {
    startSession();
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET') {
        $resource = $_GET['resource'] ?? 'session';
        if ($resource === 'session') {
            $admin = currentAdmin();
            return ['authenticated' => $admin !== null, 'email' => $admin['email'] ?? null, 'csrfToken' => $_SESSION['csrf'], 'setupRequired' => !query('SELECT COUNT(*) FROM admins')->fetchColumn()];
        }
        requireAdmin();
        if ($resource === 'store') return ['product' => publicProduct(productRow(false)), 'site' => siteContent(), 'deliveryZones' => deliveryZones(false)];
        if ($resource === 'orders') return listOrders($_GET);
        throw new HttpError(404, 'Unknown admin resource.');
    }

    requireMethod('POST');
    requireCsrf();
    $input = readJson();
    $action = $input['action'] ?? '';
    if ($action === 'setup' || $action === 'login') {
        rateLimit('login', 10, 900);
        $email = strtolower(textValue($input['email'] ?? '', 'Email', 3, 190));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) throw new HttpError(422, 'Enter a valid email address.');
        $password = passwordValue($input['password'] ?? '', 'Password', $action === 'setup' ? 12 : 1);
        if ($action === 'setup') {
            if (query('SELECT COUNT(*) FROM admins')->fetchColumn()) throw new HttpError(409, 'An administrator already exists. Please sign in.');
            $token = config()['setup_token'] ?? '';
            if (strlen($token) < 32 || str_starts_with($token, 'REPLACE_') || !is_string($input['setupToken'] ?? null) || !hash_equals($token, $input['setupToken'])) throw new HttpError(403, 'Invalid setup token.');
            try {
                query('INSERT INTO admins (id, email, password_hash) VALUES (1, ?, ?)', [$email, password_hash($password, PASSWORD_DEFAULT)]);
            } catch (PDOException $error) {
                if ($error->getCode() === '23000') throw new HttpError(409, 'An administrator already exists. Please sign in.');
                throw $error;
            }
        }
        $admin = query('SELECT * FROM admins WHERE email = ?', [$email])->fetch();
        $hash = $admin['password_hash'] ?? '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi';
        if (!password_verify($password, $hash) || !$admin) throw new HttpError(401, 'Email or password is incorrect.');
        return signInAdmin($admin);
    }

    $admin = requireAdmin();
    if ($action === 'logout') {
        $_SESSION = [];
        session_destroy();
        return ['signedOut' => true];
    }
    if ($action === 'save-product') return saveProduct($input['product'] ?? []);
    if ($action === 'save-media') return saveMedia($input);
    if ($action === 'save-site') return saveSite($input);
    if ($action === 'save-delivery') return saveDelivery($input);
    if ($action === 'update-order') return updateOrderStatus($input);
    if ($action === 'change-password') {
        rateLimit('password', 10, 900);
        $old = passwordValue($input['currentPassword'] ?? '', 'Current password', 1);
        $new = passwordValue($input['newPassword'] ?? '', 'New password', 12);
        $row = query('SELECT * FROM admins WHERE id = ?', [$admin['id']])->fetch();
        if (!password_verify($old, $row['password_hash'])) throw new HttpError(422, 'Current password is incorrect.');
        query('UPDATE admins SET password_hash = ?, session_version = session_version + 1 WHERE id = ?', [password_hash($new, PASSWORD_DEFAULT), $admin['id']]);
        return signInAdmin(query('SELECT * FROM admins WHERE id = ?', [$admin['id']])->fetch());
    }
    throw new HttpError(404, 'Unknown admin action.');
});
