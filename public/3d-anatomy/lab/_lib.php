<?php
/**
 * Lab Terminologi — pustaka bersama (sesi bertanda tangan, SQLite, bantu JSON).
 * Tidak boleh diakses langsung (lihat .htaccess).
 */

declare(strict_types=1);

// ─── Konfigurasi ───────────────────────────────────────────────────────────
// Produksi : letakkan config.php di folder ini (salin dari config.example.php, JANGAN di-commit).
// Dev lokal: dev/config.dev.php melalui variabel lingkungan ATLAS_LAB_CONFIG (diatur oleh dev/php-router.php).
function lab_config(): array {
    static $cfg = null;
    if ($cfg !== null) return $cfg;
    $path = getenv('ATLAS_LAB_CONFIG') ?: (__DIR__ . '/config.php');
    if (!is_file($path)) json_out(['error' => 'Konfigurasi Lab belum dibuat (config.php).'], 500);
    $cfg = require $path;
    foreach (['sopan_url', 'sopan_verify_url', 'client_id', 'client_secret', 'session_secret', 'app_url', 'callback_url'] as $k) {
        if (empty($cfg[$k])) json_out(['error' => "Konfigurasi '$k' kosong."], 500);
    }
    if (strlen($cfg['session_secret']) < 32) json_out(['error' => 'session_secret minimal 32 karakter.'], 500);
    $cfg += ['staff_roles' => ['dosen', 'laboran', 'admin'], 'session_ttl' => 7200, 'db_path' => __DIR__ . '/data/lab.sqlite'];
    return $cfg;
}

function json_out(array $data, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function is_https(): bool {
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
}

// ─── Sesi: cookie bertanda tangan HMAC (tanpa penyimpanan sisi server) ──────
const SESSION_COOKIE = 'ATLAS_LAB';
const STATE_COOKIE = 'ATLAS_LAB_STATE';

function b64u(string $s): string { return rtrim(strtr(base64_encode($s), '+/', '-_'), '='); }
function b64u_dec(string $s): string|false { return base64_decode(strtr($s, '-_', '+/'), true); }

function set_cookie(string $name, string $value, int $ttl): void {
    setcookie($name, $value, [
        'expires' => $ttl > 0 ? time() + $ttl : time() - 3600,
        'path' => '/', 'secure' => is_https(), 'httponly' => true, 'samesite' => 'Lax',
    ]);
}

function session_issue(array $user): void {
    $cfg = lab_config();
    $payload = b64u(json_encode($user + ['exp' => time() + (int)$cfg['session_ttl']], JSON_UNESCAPED_UNICODE));
    $sig = b64u(hash_hmac('sha256', $payload, $cfg['session_secret'], true));
    set_cookie(SESSION_COOKIE, "$payload.$sig", (int)$cfg['session_ttl']);
}

function session_user(): ?array {
    $raw = $_COOKIE[SESSION_COOKIE] ?? '';
    if (!$raw || substr_count($raw, '.') !== 1) return null;
    [$payload, $sig] = explode('.', $raw);
    $expect = b64u(hash_hmac('sha256', $payload, lab_config()['session_secret'], true));
    if (!hash_equals($expect, $sig)) return null;
    $json = b64u_dec($payload);
    $u = $json === false ? null : json_decode($json, true);
    if (!is_array($u) || ($u['exp'] ?? 0) < time() || empty($u['uid'])) return null;
    return $u;
}

function is_staff(?array $u): bool {
    return $u !== null && in_array($u['role'] ?? '', lab_config()['staff_roles'], true);
}

/** Permintaan yang mengubah data wajib membawa header kustom (tidak dapat dikirim lintas-situs tanpa preflight). */
function require_xhr(): void {
    if (($_SERVER['HTTP_X_LAB_REQUEST'] ?? '') !== '1') json_out(['error' => 'Permintaan tidak valid.'], 400);
}

function read_json_body(int $maxBytes = 65536): array {
    $raw = file_get_contents('php://input', false, null, 0, $maxBytes + 1);
    if ($raw === false || strlen($raw) > $maxBytes) json_out(['error' => 'Data terlalu besar.'], 413);
    $d = json_decode($raw, true);
    if (!is_array($d)) json_out(['error' => 'JSON tidak valid.'], 400);
    return $d;
}

// ─── SQLite ────────────────────────────────────────────────────────────────
function db(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    $path = lab_config()['db_path'];
    $dir = dirname($path);
    if (!is_dir($dir)) {
        mkdir($dir, 0750, true);
        file_put_contents($dir . '/.htaccess', "Require all denied\nDeny from all\n");
    }
    $pdo = new PDO('sqlite:' . $path, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
    $pdo->exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;');
    $pdo->exec('CREATE TABLE IF NOT EXISTS progress (uid TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS assignments (
        id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
        scopes TEXT NOT NULL, kinds TEXT NOT NULL, total INTEGER NOT NULL,
        time_limit_min INTEGER NOT NULL DEFAULT 0, deadline INTEGER, max_attempts INTEGER NOT NULL DEFAULT 1,
        scoring TEXT NOT NULL DEFAULT \'best\', shuffle TEXT NOT NULL DEFAULT \'student\', shared_seed INTEGER NOT NULL,
        allow_late INTEGER NOT NULL DEFAULT 0, angkatan TEXT NOT NULL DEFAULT \'\', active INTEGER NOT NULL DEFAULT 1,
        created_by TEXT NOT NULL, created_by_name TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT, assignment_id INTEGER NOT NULL, uid TEXT NOT NULL, nim TEXT, name TEXT,
        angkatan TEXT, role TEXT NOT NULL DEFAULT \'mahasiswa\', seed INTEGER NOT NULL, started_at INTEGER NOT NULL,
        finished_at INTEGER, score INTEGER, total INTEGER NOT NULL, duration_s INTEGER, wrong TEXT,
        late INTEGER NOT NULL DEFAULT 0, overtime INTEGER NOT NULL DEFAULT 0)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_attempts_a ON attempts(assignment_id, uid)');
    // Migrasi ringan (penilaian oleh server): soal+kunci disimpan di server
    foreach ([['assignments', 'shared_questions'], ['attempts', 'questions'], ['attempts', 'answers']] as [$t, $c]) {
        $cols = array_column($pdo->query("PRAGMA table_info($t)")->fetchAll(), 'name');
        if (!in_array($c, $cols, true)) $pdo->exec("ALTER TABLE $t ADD COLUMN $c TEXT");
    }
    return $pdo;
}
