<?php
/**
 * db.php — API sederhana untuk membaca/menulis anatomy_db.json
 * Deploy ke: public_html/3d-anatomy/3d-anatomy/db.php (cPanel)
 *
 * GET  db.php?action=get             → kembalikan seluruh database JSON (publik)
 * GET  db.php?action=ping            → cek PHP tersedia (publik)
 * POST db.php?action=verify          → cek password admin
 * POST db.php?action=save            → simpan database           (password admin)
 * POST db.php?action=change_password → ganti password admin      (password admin)
 * POST db.php?action=save_favicon    → simpan favicon             (password admin)
 * POST db.php?action=reset_favicon   → hapus favicon              (password admin)
 *
 * Password admin disimpan sebagai HASH bcrypt di .htadmin_pass (berkas ".ht*" diblokir Apache).
 * Tidak ada password bawaan: buat pertama kali lewat terminal →  php set-admin-pass.php
 */

declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

// ─── Konfigurasi ────────────────────────────────────────────────────────────
$dataDir = getenv('ATLAS_DATA_DIR') ?: __DIR__;           // ATLAS_DATA_DIR hanya untuk pengujian
define('DB_FILE',     $dataDir . '/anatomy_db.json');
define('PASS_FILE',   $dataDir . '/.htadmin_pass');       // hash bcrypt
define('LEGACY_PASS', $dataDir . '/.admin_pass');         // format lama (teks biasa) — dimigrasi lalu dihapus
define('FAVICON',     $dataDir . '/custom-favicon.png');
define('MIN_PASS_LEN', 10);
define('MAX_FAILS', 5);
define('LOCK_SECONDS', 900);

// ─── Helper ─────────────────────────────────────────────────────────────────
function sendError(int $code, string $msg): never {
    http_response_code($code);
    echo json_encode(['error' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

function sendOk(array $payload = []): never {
    echo json_encode(array_merge(['success' => true], $payload), JSON_UNESCAPED_UNICODE);
    exit;
}

/** Pembatasan percobaan salah per alamat IP (berkas sementara; 5 gagal → kunci 15 menit). */
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
    $fails = throttle_fails(); $fails[] = time();
    @file_put_contents(throttle_file(), json_encode($fails), LOCK_EX);
}
function throttle_clear(): void { @unlink(throttle_file()); }

function store_password(string $plain): void {
    $hash = password_hash($plain, PASSWORD_BCRYPT, ['cost' => 12]);
    if (@file_put_contents(PASS_FILE, $hash, LOCK_EX) === false) sendError(500, 'Gagal menyimpan password. Periksa permission folder.');
    @chmod(PASS_FILE, 0600);
    if (is_file(LEGACY_PASS)) @unlink(LEGACY_PASS);
}

/** Cek password admin. Menolak bila password belum diatur di server. Migrasi otomatis dari berkas lama. */
function verify_admin(string $password): bool {
    if ($password === '') return false;
    if (is_file(PASS_FILE)) {
        return password_verify($password, trim((string)file_get_contents(PASS_FILE)));
    }
    if (is_file(LEGACY_PASS)) {                      // format lama: teks biasa
        $legacy = trim((string)file_get_contents(LEGACY_PASS));
        if ($legacy !== '' && hash_equals($legacy, $password)) { store_password($password); return true; }
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

// ─── Routing ────────────────────────────────────────────────────────────────
$action = $_GET['action'] ?? 'get';

if ($action === 'get') {
    if (!file_exists(DB_FILE)) { echo '{}'; exit; }
    header('Cache-Control: public, max-age=300');
    echo file_get_contents(DB_FILE);
    exit;
}

if ($action === 'ping') {
    sendOk(['php' => true, 'version' => PHP_VERSION]);
}

// ── Semua aksi lain: POST + JSON ────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] !== 'POST') sendError(405, 'Method Not Allowed');

$raw = file_get_contents('php://input', false, null, 0, 25 * 1024 * 1024 + 1);   // maks. 25 MB
if ($raw === false || strlen($raw) > 25 * 1024 * 1024) sendError(413, 'Data terlalu besar.');
$body = json_decode($raw, true);
if (json_last_error() !== JSON_ERROR_NONE || !is_array($body)) sendError(400, 'Invalid JSON body');

if ($action === 'verify') {
    require_admin($body);
    sendOk();
}

if ($action === 'save') {
    require_admin($body);
    $data = $body['data'] ?? null;
    if (!is_array($data)) sendError(400, 'Data tidak valid.');
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) sendError(500, 'Gagal encode JSON.');
    $tmp = DB_FILE . '.tmp';                                   // tulis atomik
    if (file_put_contents($tmp, $json, LOCK_EX) === false) sendError(500, 'Gagal menulis file. Periksa permission folder.');
    rename($tmp, DB_FILE);
    sendOk(['entries' => count($data)]);
}

if ($action === 'change_password') {
    require_admin($body);                                      // memakai field "current"
    $newPass = (string)($body['new'] ?? '');
    if (strlen($newPass) < MIN_PASS_LEN) sendError(400, 'Password baru minimal ' . MIN_PASS_LEN . ' karakter.');
    store_password($newPass);
    sendOk(['message' => 'Password berhasil diubah.']);
}

if ($action === 'save_favicon') {
    require_admin($body);
    $b64 = (string)($body['base64'] ?? '');
    if ($b64 !== '') {
        if (strpos($b64, ',') !== false) $b64 = substr($b64, strpos($b64, ',') + 1);
        $decoded = base64_decode($b64, true);
        // Hanya gambar yang benar-benar PNG/JPEG/GIF/WEBP/ICO dan maks. 1 MB
        $ok = $decoded !== false && strlen($decoded) <= 1048576
            && (str_starts_with($decoded, "\x89PNG") || str_starts_with($decoded, "\xFF\xD8\xFF") || str_starts_with($decoded, 'GIF8')
                || (str_starts_with($decoded, 'RIFF') && substr($decoded, 8, 4) === 'WEBP') || str_starts_with($decoded, "\x00\x00\x01\x00"));
        if ($ok) { file_put_contents(FAVICON, $decoded); sendOk(['timestamp' => time()]); }
    }
    sendError(400, 'Gambar tidak valid.');
}

if ($action === 'reset_favicon') {
    require_admin($body);
    if (file_exists(FAVICON)) unlink(FAVICON);
    sendOk();
}

sendError(400, 'Aksi tidak dikenal.');
