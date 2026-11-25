<?php
/** SOPAN TIRUAN (hanya untuk uji lokal) — meniru /sopan/authorize.php: pilih pengguna, terbitkan kode, redirect. */
$codes = __DIR__ . '/.codes';
if (!is_dir($codes)) mkdir($codes, 0700, true);
$USERS = [
    'budi'  => ['id' => 101, 'username' => 'budi', 'name' => 'Budi Santoso', 'email' => 'budi@mhs.test', 'role' => 'mahasiswa', 'nim' => 'A12.2024.00123', 'angkatan' => 2024],
    'sinta' => ['id' => 102, 'username' => 'sinta', 'name' => 'Sinta Lestari', 'email' => 'sinta@mhs.test', 'role' => 'mahasiswa', 'nim' => 'A12.2023.00456', 'angkatan' => 2023],
    'dosen' => ['id' => 201, 'username' => 'dosen', 'name' => 'Dr. Ratna (Dosen)', 'email' => 'ratna@example.test', 'role' => 'dosen', 'nim' => '0686.11.1999.001', 'angkatan' => null],
    'laboran' => ['id' => 301, 'username' => 'laboran', 'name' => 'Rina (Laboran)', 'email' => 'rina@example.test', 'role' => 'laboran', 'nim' => '', 'angkatan' => null],
];
$clientId = $_GET['client_id'] ?? $_POST['client_id'] ?? '';
$redirect = $_GET['redirect_uri'] ?? $_POST['redirect_uri'] ?? '';
$state = $_GET['state'] ?? $_POST['state'] ?? '';
if ($clientId !== 'atlas') { http_response_code(400); die('Client ID tidak dikenal (tiruan).'); }
$host = parse_url($redirect, PHP_URL_HOST);
$reqHost = parse_url('http://' . ($_SERVER['HTTP_HOST'] ?? ''), PHP_URL_HOST);
if ($host === null || $host !== $reqHost) { http_response_code(403); die('Redirect URI tidak diizinkan (tiruan).'); }
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($USERS[$_POST['user'] ?? ''])) {
    $code = bin2hex(random_bytes(32));
    file_put_contents("$codes/$code.json", json_encode(['user' => $USERS[$_POST['user']], 'exp' => time() + 300]));
    header('Location: ' . $redirect . (str_contains($redirect, '?') ? '&' : '?') . 'code=' . urlencode($code) . ($state !== '' ? '&state=' . urlencode($state) : ''));
    exit;
}
?><!doctype html><meta charset="utf-8"><title>SOPAN (tiruan lokal)</title>
<body style="font-family:system-ui;max-width:420px;margin:60px auto;padding:0 16px">
<h2>SOPAN <small style="color:#b45309">tiruan lokal</small></h2>
<p>Pilih pengguna untuk masuk ke <b>Atlas Lab</b>:</p>
<form method="post">
<input type="hidden" name="client_id" value="<?= htmlspecialchars($clientId) ?>">
<input type="hidden" name="redirect_uri" value="<?= htmlspecialchars($redirect) ?>">
<input type="hidden" name="state" value="<?= htmlspecialchars($state) ?>">
<?php foreach ($USERS as $k => $u): ?>
<button name="user" value="<?= $k ?>" style="display:block;width:100%;text-align:left;padding:12px;margin:8px 0;border:1px solid #ccc;border-radius:10px;background:#fff;cursor:pointer">
<b><?= htmlspecialchars($u['name']) ?></b><br><small><?= $u['role'] ?><?= $u['nim'] ? ' · ' . htmlspecialchars($u['nim']) : '' ?></small></button>
<?php endforeach; ?>
</form></body>
