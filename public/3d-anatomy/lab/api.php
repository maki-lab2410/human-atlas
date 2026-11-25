<?php
/**
 * API Lab Terminologi.
 *   GET  ?action=login            → mulai SSO (redirect ke SOPAN)
 *   GET  ?action=me               → status login
 *   POST ?action=logout
 *   GET  ?action=progress         → progres tersimpan milik pengguna
 *   POST ?action=progress         → simpan progres
 *
 * Tugas dosen (buat, kerjakan, rekap) ada di tugas.php.
 */

declare(strict_types=1);
require __DIR__ . '/_lib.php';

$action = (string)($_GET['action'] ?? 'me');
$method = $_SERVER['REQUEST_METHOD'];
$user = session_user();

function need_login(?array $u): array { if (!$u) json_out(['error' => 'Belum masuk.'], 401); return $u; }
function public_user(?array $u): ?array {
    return $u ? ['key' => substr(hash_hmac('sha256', $u['uid'], lab_config()['session_secret']), 0, 16), 'name' => $u['name'], 'role' => $u['role'], 'nim' => $u['nim'], 'angkatan' => $u['angkatan'], 'staff' => is_staff($u)] : null;
}

switch ($action) {
    case 'login': {
        $cfg = lab_config();
        $state = bin2hex(random_bytes(16));
        set_cookie(STATE_COOKIE, $state, 600);
        $q = http_build_query(['client_id' => $cfg['client_id'], 'redirect_uri' => $cfg['callback_url'], 'state' => $state]);
        header('Location: ' . rtrim($cfg['sopan_url'], '/') . '/authorize.php?' . $q);
        exit;
    }

    case 'me':
        json_out(['available' => true, 'user' => public_user($user)]);

    case 'logout':
        require_xhr();
        if ($method !== 'POST') json_out(['error' => 'Gunakan POST.'], 405);
        set_cookie(SESSION_COOKIE, '', 0);
        json_out(['ok' => true]);

    case 'progress': {
        $u = need_login($user);
        if ($method === 'GET') {
            $st = db()->prepare('SELECT data, updated_at FROM progress WHERE uid = ?');
            $st->execute([$u['uid']]);
            $row = $st->fetch();
            json_out(['progress' => $row ? json_decode($row['data'], true) : null, 'updated_at' => $row ? (int)$row['updated_at'] : 0]);
        }
        if ($method !== 'POST') json_out(['error' => 'Metode tidak didukung.'], 405);
        require_xhr();
        $body = read_json_body();
        $p = $body['progress'] ?? null;
        if (!is_array($p) || !isset($p['items']) || !is_array($p['items']) || count($p['items']) > 3000) json_out(['error' => 'Data progres tidak valid.'], 400);
        // Simpan hanya bidang yang dikenal
        $clean = [
            'answered' => max(0, (int)($p['answered'] ?? 0)), 'correct' => max(0, (int)($p['correct'] ?? 0)),
            'streak' => max(0, (int)($p['streak'] ?? 0)), 'best' => max(0, (int)($p['best'] ?? 0)), 'items' => [],
        ];
        foreach ($p['items'] as $k => $v) {
            if (!is_string($k) || strlen($k) > 60 || !is_array($v) || count($v) !== 2) continue;
            $clean['items'][$k] = [max(0, (int)$v[0]), max(0, (int)$v[1])];
        }
        $now = time();
        db()->prepare('INSERT INTO progress (uid, data, updated_at) VALUES (?,?,?) ON CONFLICT(uid) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at')
            ->execute([$u['uid'], json_encode($clean), $now]);
        json_out(['ok' => true, 'updated_at' => $now]);
    }

    default:
        json_out(['error' => 'Aksi tidak dikenal.'], 404);
}
