<?php
/**
 * Salin menjadi config.php di folder ini pada server (JANGAN di-commit, JANGAN diunggah dari komputer lain).
 * Nilai client_secret harus sama dengan yang didaftarkan di SSO_CLIENTS['atlas'] pada SOPAN.
 * Buat session_secret:  php -r "echo bin2hex(random_bytes(32));"
 */
return [
    // URL server SSO yang dibuka di browser pengguna
    'sopan_url'        => 'https://sso.example.com',
    // Endpoint penukaran kode (dipanggil dari server ke server)
    'sopan_verify_url' => 'https://sso.example.com/api/verify.php',
    'client_id'        => 'atlas',
    'client_secret'    => 'GANTI_DENGAN_RAHASIA_KLIEN',
    'session_secret'   => 'GANTI_DENGAN_64_HEX_ACAK_GANTI_DENGAN_64_HEX_ACAK',
    // Alamat aplikasi dan callback SSO (harus berhost sama dengan allowed_hosts server SSO)
    'app_url'          => 'https://your-domain.example/3d-anatomy/',
    'callback_url'     => 'https://your-domain.example/3d-anatomy/3d-anatomy/lab/sso.php',
    // Peran yang boleh melihat rekap
    'staff_roles'      => ['dosen', 'laboran', 'admin'],
    'session_ttl'      => 7200,
    // Lokasi basis data SQLite (pastikan folder tidak dapat diakses dari web)
    // 'db_path'       => __DIR__ . '/data/lab.sqlite',
];
