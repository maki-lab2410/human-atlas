<?php
/** SOPAN TIRUAN — meniru /sopan/api/verify.php (tukar kode sekali pakai → profil pengguna). */
header('Content-Type: application/json; charset=utf-8');
$cfg = require getenv('ATLAS_LAB_CONFIG');
$cid = $_POST['client_id'] ?? ''; $sec = $_POST['client_secret'] ?? ''; $code = $_POST['code'] ?? '';
if ($cid !== 'atlas' || !hash_equals($cfg['client_secret'], $sec)) { http_response_code(401); echo json_encode(['status' => 'error', 'message' => 'Client tidak valid.']); exit; }
if (!preg_match('/^[a-f0-9]{64}$/', $code)) { http_response_code(400); echo json_encode(['status' => 'error', 'message' => 'Code tidak valid.']); exit; }
$f = dirname(__DIR__) . "/.codes/$code.json";
if (!is_file($f)) { http_response_code(400); echo json_encode(['status' => 'error', 'message' => 'Authorization code tidak valid atau sudah digunakan.']); exit; }
$d = json_decode(file_get_contents($f), true); unlink($f);
if (($d['exp'] ?? 0) < time()) { http_response_code(400); echo json_encode(['status' => 'error', 'message' => 'Kedaluwarsa.']); exit; }
$u = $d['user'];
echo json_encode(['status' => 'success', 'user' => [
    'id' => $u['id'], 'username' => $u['username'], 'name' => $u['name'], 'email' => $u['email'], 'role' => $u['role'],
    'nim' => $u['nim'], 'angkatan' => $u['angkatan'], 'five_digit_nim' => substr($u['nim'], -5),
]], JSON_UNESCAPED_UNICODE);
