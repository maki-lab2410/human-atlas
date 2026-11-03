<?php
/**
 * db.php — API sederhana untuk membaca/menulis anatomy_db.json
 * Deploy ke: public_html/3d-anatomy/db.php (cPanel)
 *
 * GET  db.php?action=get            → kembalikan seluruh database JSON
 * POST db.php?action=save           → simpan database (perlu password admin)
 * POST db.php?action=change_password → ganti password admin
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// Tangani preflight OPTIONS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// ─── Konfigurasi ────────────────────────────────────────────────────────────
define('DB_FILE',    __DIR__ . '/anatomy_db.json');
define('PASS_FILE',  __DIR__ . '/.admin_pass');     // file tersembunyi
define('DEFAULT_PASS', 'admin123');

// ─── Helper ─────────────────────────────────────────────────────────────────
function getAdminPassword(): string {
    if (file_exists(PASS_FILE)) {
        $p = trim(file_get_contents(PASS_FILE));
        if ($p) return $p;
    }
    return DEFAULT_PASS;
}

function sendError(int $code, string $msg): void {
    http_response_code($code);
    echo json_encode(['error' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

function sendOk(array $payload = []): void {
    echo json_encode(array_merge(['success' => true], $payload), JSON_UNESCAPED_UNICODE);
    exit;
}

// ─── Routing ────────────────────────────────────────────────────────────────
$action = $_GET['action'] ?? 'get';

// ── GET: baca database ───────────────────────────────────────────────────────
if ($action === 'get') {
    if (!file_exists(DB_FILE)) {
        echo '{}';
        exit;
    }
    // Set cache header: 5 menit (browser/CDN cache)
    header('Cache-Control: public, max-age=300');
    echo file_get_contents(DB_FILE);
    exit;
}

// ── POST actions: butuh body JSON ────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendError(405, 'Method Not Allowed');
}

$body = json_decode(file_get_contents('php://input'), true);
if (json_last_error() !== JSON_ERROR_NONE) {
    sendError(400, 'Invalid JSON body');
}

// ── SAVE: simpan database baru ───────────────────────────────────────────────
if ($action === 'save') {
    $password = $body['password'] ?? '';
    $data     = $body['data']     ?? null;

    if ($password !== getAdminPassword()) {
        sendError(401, 'Password admin salah.');
    }
    if (!is_array($data)) {
        sendError(400, 'Data tidak valid.');
    }

    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        sendError(500, 'Gagal encode JSON.');
    }

    // Tulis atomik: ke file temp dulu, lalu rename
    $tmp = DB_FILE . '.tmp';
    if (file_put_contents($tmp, $json) === false) {
        sendError(500, 'Gagal menulis file. Periksa permission folder.');
    }
    rename($tmp, DB_FILE);

    sendOk(['entries' => count($data)]);
}

// ── CHANGE_PASSWORD ──────────────────────────────────────────────────────────
if ($action === 'change_password') {
    $current  = $body['current']  ?? '';
    $newPass  = $body['new']      ?? '';

    if ($current !== getAdminPassword()) {
        sendError(401, 'Password saat ini salah.');
    }
    if (strlen($newPass) < 6) {
        sendError(400, 'Password baru minimal 6 karakter.');
    }

    file_put_contents(PASS_FILE, $newPass);
    sendOk(['message' => 'Password berhasil diubah.']);
}

// ── SAVE_FAVICON ─────────────────────────────────────────────────────────────
if ($action === 'save_favicon') {
    $base64 = $body['base64'] ?? '';
    if ($base64) {
        $data = $base64;
        if (strpos($base64, ',') !== false) {
            $data = substr($base64, strpos($base64, ',') + 1);
        }
        $decoded = base64_decode($data);
        if ($decoded !== false) {
            file_put_contents(__DIR__ . '/custom-favicon.png', $decoded);
            sendOk(['timestamp' => time()]);
        }
    }
    sendError(400, 'Invalid base64 image');
}

// ── RESET_FAVICON ────────────────────────────────────────────────────────────
if ($action === 'reset_favicon') {
    $fav = __DIR__ . '/custom-favicon.png';
    if (file_exists($fav)) unlink($fav);
    sendOk();
}

// ── PING: cek apakah PHP tersedia ────────────────────────────────────────────
if ($action === 'ping') {
    sendOk(['php' => true, 'version' => PHP_VERSION]);
}

sendError(400, "Aksi tidak dikenal: $action");
