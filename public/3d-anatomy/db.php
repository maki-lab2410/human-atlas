<?php
/**
 * db.php — API sederhana untuk membaca/menulis anatomy_db.json
 * Deploy ke: 3d-anatomy/db.php
 *
 * GET  db.php?action=get             → kembalikan seluruh database JSON (publik)
 * GET  db.php?action=ping            → cek PHP tersedia (publik)
 * POST db.php?action=verify          → cek password admin
 * POST db.php?action=save            → simpan database           (password admin)
 * POST db.php?action=change_password → ganti password admin      (password admin)
 * POST db.php?action=save_favicon    → simpan favicon             (password admin)
 * POST db.php?action=reset_favicon   → hapus favicon              (password admin)
 */

declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

require_once __DIR__ . '/_admin_auth.php';

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

$body = read_json_post(25 * 1024 * 1024);

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
    $tmp = DB_FILE . '.tmp';
    if (file_put_contents($tmp, $json, LOCK_EX) === false) sendError(500, 'Gagal menulis file. Periksa permission folder.');
    rename($tmp, DB_FILE);
    sendOk(['entries' => count($data)]);
}

if ($action === 'change_password') {
    require_admin($body);
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
