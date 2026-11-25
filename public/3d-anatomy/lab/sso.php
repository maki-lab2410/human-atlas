<?php
/**
 * Callback SSO SOPAN.
 * SOPAN mengarahkan ke sini dengan ?code=...&state=...; kode ditukar ke SOPAN (server-ke-server),
 * lalu sesi Lab dibuat. URL ini harus diizinkan sebagai redirect_uri untuk client 'atlas' di SOPAN.
 */

declare(strict_types=1);
require __DIR__ . '/_lib.php';

$cfg = lab_config();
$back = static function (string $err = '') use ($cfg): never {
    $sep = str_contains($cfg['app_url'], '?') ? '&' : '?';
    header('Location: ' . $cfg['app_url'] . $sep . ($err === '' ? 'lab=1' : 'lab_error=' . urlencode($err)));
    exit;
};

$code = trim((string)($_GET['code'] ?? ''));
$state = (string)($_GET['state'] ?? '');
$cookieState = (string)($_COOKIE[STATE_COOKIE] ?? '');
set_cookie(STATE_COOKIE, '', 0); // sekali pakai

if (isset($_GET['error'])) $back('akses_ditolak');
if ($code === '' || !preg_match('/^[a-f0-9]{16,128}$/i', $code)) $back('kode_tidak_valid');
if ($state === '' || $cookieState === '' || !hash_equals($cookieState, $state)) $back('state_tidak_cocok');

// Tukar kode → profil pengguna
$ch = curl_init($cfg['sopan_verify_url']);
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => http_build_query(['client_id' => $cfg['client_id'], 'client_secret' => $cfg['client_secret'], 'code' => $code]),
    CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10, CURLOPT_CONNECTTIMEOUT => 5,
    CURLOPT_SSL_VERIFYPEER => !($cfg['insecure_tls'] ?? false), CURLOPT_SSL_VERIFYHOST => ($cfg['insecure_tls'] ?? false) ? 0 : 2,
]);
$resp = curl_exec($ch);
$http = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

$data = is_string($resp) ? json_decode($resp, true) : null;
if ($http !== 200 || !is_array($data) || ($data['status'] ?? '') !== 'success' || empty($data['user']['id'])) $back('verifikasi_gagal');

$u = $data['user'];
session_issue([
    'uid' => 'sopan:' . (int)$u['id'],
    'name' => mb_substr((string)($u['name'] ?? $u['username'] ?? ''), 0, 100),
    'role' => in_array($u['role'] ?? '', ['mahasiswa', 'laboran', 'dosen', 'admin'], true) ? $u['role'] : 'mahasiswa',
    'nim' => mb_substr((string)($u['nim'] ?? ''), 0, 30),
    'angkatan' => (string)($u['angkatan'] ?? ''),
]);
$back();
