<?php
/**
 * Router server PHP bawaan untuk uji LOKAL Lab Terminologi + SOPAN tiruan.
 * Jalankan:  npm run dev:php   (lalu npm run dev di terminal lain)
 * Vite (port 3016) meneruskan /sopan dan /3d-anatomy/3d-anatomy/lab ke server ini (port 8081).
 */
$root = dirname(__DIR__);
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

$cfgPath = $root . '/dev/config.dev.php';
if (!is_file($cfgPath)) {
    // Konfigurasi dev mengikuti host yang dipakai browser (localhost, IP LAN, atau Tailscale) agar bisa dicoba dari HP.
    $secret = bin2hex(random_bytes(32));
    file_put_contents($cfgPath, "<?php\n\$origin = 'http://' . (\$_SERVER['HTTP_HOST'] ?? 'localhost:3016');\nreturn [\n"
        . "    'sopan_url' => \$origin . '/sopan',\n"
        . "    'sopan_verify_url' => 'http://127.0.0.1:8081/sopan/api/verify.php',\n"
        . "    'client_id' => 'atlas',\n    'client_secret' => 'dev-secret-atlas',\n"
        . "    'session_secret' => '$secret',\n"
        . "    'app_url' => \$origin . '/3d-anatomy/',\n"
        . "    'callback_url' => \$origin . '/3d-anatomy/3d-anatomy/lab/sso.php',\n"
        . "    'db_path' => '$root/dev/data/lab.sqlite',\n];\n");
}
putenv('ATLAS_LAB_CONFIG=' . $cfgPath);

if (preg_match('#^/3d-anatomy/3d-anatomy/lab/(api|sso|tugas)\.php$#', $uri, $m)) { require "$root/public/3d-anatomy/lab/{$m[1]}.php"; return true; }
if ($uri === '/sopan/authorize.php') { require "$root/dev/mock-sopan/authorize.php"; return true; }
if ($uri === '/sopan/api/verify.php') { require "$root/dev/mock-sopan/api/verify.php"; return true; }

http_response_code(404);
header('Content-Type: text/plain');
echo "Tidak ada rute lokal untuk $uri\n";
return true;
