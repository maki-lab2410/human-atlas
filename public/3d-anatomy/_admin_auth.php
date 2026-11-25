<?php
/**
 * _admin_auth.php — Helper autentikasi admin bersama untuk db.php dan updater.php.
 * Akses web langsung diblokir oleh .htaccess.
 */

declare(strict_types=1);

define('ATLAS_DATA_DIR', getenv('ATLAS_DATA_DIR') ?: __DIR__);
define('DB_FILE',        ATLAS_DATA_DIR . '/anatomy_db.json');
define('PASS_FILE',      ATLAS_DATA_DIR . '/.htadmin_pass');
define('LEGACY_PASS',    ATLAS_DATA_DIR . '/.admin_pass');
define('FAVICON',        ATLAS_DATA_DIR . '/custom-favicon.png');
define('MIN_PASS_LEN',   10);
define('MAX_FAILS',      5);
define('LOCK_SECONDS',   900);

function sendError(int $code, string $msg): never {
    http_response_code($code);
    echo json_encode(['error' => $msg], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function sendOk(array $payload = []): never {
    echo json_encode(array_merge(['success' => true], $payload), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function throttle_file(): string {
    return sys_get_temp_dir() . '/atlas_admin_' . md5($_SERVER['REMOTE_ADDR'] ?? 'cli') . '.json';
}

function throttle_fails(): array {
    $f = throttle_file();
    $d = is_file($f) ? json_decode((string)file_get_contents($f), true) : [];
    $now = time();
    return array_values(array_filter(is_array($d) ? $d : [], static fn($t) => is_int($t) && $t > $now - LOCK_SECONDS));
}

function throttle_guard(): void {
    $fails = throttle_fails();
    if (count($fails) >= MAX_FAILS) {
        header('Retry-After: ' . max(1, min($fails) + LOCK_SECONDS - time()));
        sendError(429, 'Terlalu banyak percobaan salah. Coba lagi beberapa menit lagi.');
    }
}

function throttle_fail(): void {
    $fails = throttle_fails();
    $fails[] = time();
    @file_put_contents(throttle_file(), json_encode($fails), LOCK_EX);
}

function throttle_clear(): void {
    @unlink(throttle_file());
}

function store_password(string $plain): void {
    $hash = password_hash($plain, PASSWORD_BCRYPT, ['cost' => 12]);
    if (@file_put_contents(PASS_FILE, $hash, LOCK_EX) === false) {
        sendError(500, 'Gagal menyimpan password. Periksa permission folder.');
    }
    @chmod(PASS_FILE, 0600);
    if (is_file(LEGACY_PASS)) @unlink(LEGACY_PASS);
}

function verify_admin(string $password): bool {
    if ($password === '') return false;
    if (is_file(PASS_FILE)) {
        return password_verify($password, trim((string)file_get_contents(PASS_FILE)));
    }
    if (is_file(LEGACY_PASS)) {
        $legacy = trim((string)file_get_contents(LEGACY_PASS));
        if ($legacy !== '' && hash_equals($legacy, $password)) {
            store_password($password);
            return true;
        }
        return false;
    }
    sendError(503, 'Password admin belum diatur di server. Jalankan di terminal: php set-admin-pass.php');
}

function require_admin(array $body): void {
    throttle_guard();
    if (!verify_admin((string)($body['password'] ?? $body['current'] ?? ''))) {
        throttle_fail();
        sendError(401, 'Password admin salah.');
    }
    throttle_clear();
}

function read_json_post(int $maxBytes = 1048576): array {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') sendError(405, 'Method Not Allowed');
    $raw = file_get_contents('php://input', false, null, 0, $maxBytes + 1);
    if ($raw === false || strlen($raw) > $maxBytes) sendError(413, 'Data terlalu besar.');
    $body = json_decode($raw, true);
    if (json_last_error() !== JSON_ERROR_NONE || !is_array($body)) sendError(400, 'Invalid JSON body');
    return $body;
}
