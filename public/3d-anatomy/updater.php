<?php
/**
 * updater.php — Cek & pasang pembaruan aplikasi dari GitHub Releases (khusus Admin).
 *
 * GET  updater.php?action=check     → cek versi lokal vs rilis terbaru di GitHub
 * POST updater.php?action=apply     → unduh human-atlas-app.zip, verifikasi SHA-256, backup, lalu ekstrak aman
 * POST updater.php?action=rollback  → kembalikan file dari backup pembaruan terakhir
 *
 * File instansi yang SELALU dilindungi (tidak pernah ditimpa):
 *   - 3d-anatomy/.htadmin_pass, 3d-anatomy/.admin_pass
 *   - 3d-anatomy/custom-favicon.png
 *   - 3d-anatomy/anatomy_db.json (bila sudah ada di server)
 *   - 3d-anatomy/lab/config.php
 *   - 3d-anatomy/lab/data/ (SQLite tugas & progres)
 *   - models/ (aset model 3D tetap utuh)
 */

declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

require_once __DIR__ . '/_admin_auth.php';

$rootDir    = rtrim(getenv('ATLAS_ROOT_DIR') ?: dirname(__DIR__), '/\\');
$versionUrl = __DIR__ . '/version.json';
$tmpDir     = __DIR__ . '/.update_tmp';
$backupDir  = __DIR__ . '/.update_backup';

function local_meta(string $versionFile): array {
    $def = ['version' => '1.0.0', 'repo' => 'maki-lab2410/human-atlas'];
    if (!is_file($versionFile)) return $def;
    $d = json_decode((string)file_get_contents($versionFile), true);
    if (!is_array($d)) return $def;
    return [
        'version' => ltrim((string)($d['version'] ?? $def['version']), 'v'),
        'repo'    => (string)($d['repo'] ?? $def['repo']),
    ];
}

function http_get(string $url, int $timeout = 15, ?string $saveTo = null): array {
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        $opts = [
            CURLOPT_RETURNTRANSFER => $saveTo === null,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS      => 5,
            CURLOPT_TIMEOUT        => $timeout,
            CURLOPT_CONNECTTIMEOUT => 8,
            CURLOPT_USERAGENT      => 'HumanAtlas-Updater/1.0',
            CURLOPT_HTTPHEADER     => ['Accept: application/vnd.github+json'],
        ];
        $fp = null;
        if ($saveTo !== null) {
            $fp = fopen($saveTo, 'wb');
            if (!$fp) return ['ok' => false, 'status' => 0, 'error' => 'Gagal membuat file sementara.'];
            $opts[CURLOPT_FILE] = $fp;
        }
        curl_setopt_array($ch, $opts);
        $body = curl_exec($ch);
        $err  = curl_error($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($fp !== null) fclose($fp);
        if ($body === false || $code >= 400) {
            return ['ok' => false, 'status' => $code, 'error' => $err ?: "HTTP $code"];
        }
        return ['ok' => true, 'status' => $code, 'body' => is_string($body) ? $body : ''];
    }

    if (!ini_get('allow_url_fopen')) {
        return ['ok' => false, 'status' => 0, 'error' => 'Ekstensi cURL dan allow_url_fopen tidak tersedia.'];
    }
    $ctx = stream_context_create([
        'http' => [
            'method'  => 'GET',
            'timeout' => $timeout,
            'header'  => "User-Agent: HumanAtlas-Updater/1.0\r\nAccept: application/vnd.github+json\r\n",
        ],
    ]);
    $raw = @file_get_contents($url, false, $ctx);
    if ($raw === false) return ['ok' => false, 'status' => 0, 'error' => 'Gagal mengunduh dari GitHub.'];
    if ($saveTo !== null && @file_put_contents($saveTo, $raw) === false) {
        return ['ok' => false, 'status' => 0, 'error' => 'Gagal menyimpan file sementara.'];
    }
    return ['ok' => true, 'status' => 200, 'body' => $saveTo === null ? $raw : ''];
}

function release_api_url(string $repo): string {
    $override = getenv('ATLAS_RELEASE_API_URL');
    if ($override) return $override;
    return 'https://api.github.com/repos/' . $repo . '/releases/latest';
}

function env_issues(string $rootDir): array {
    $issues = [];
    if (!class_exists('ZipArchive')) $issues[] = 'Ekstensi PHP ZipArchive belum aktif di server.';
    if (!function_exists('curl_init') && !ini_get('allow_url_fopen')) $issues[] = 'PHP cURL / allow_url_fopen tidak aktif.';
    if (!is_writable($rootDir) || !is_writable(__DIR__)) $issues[] = 'Folder aplikasi tidak memiliki izin tulis untuk PHP.';
    return $issues;
}

function fetch_latest_release(string $repo): array {
    $res = http_get(release_api_url($repo), 10);
    if (!$res['ok']) {
        $msg = $res['status'] === 404
            ? 'Belum ada rilis resmi di GitHub Releases.'
            : ('Gagal memeriksa rilis GitHub: ' . $res['error']);
        return ['ok' => false, 'error' => $msg];
    }
    $rel = json_decode($res['body'], true);
    if (!is_array($rel) || empty($rel['tag_name'])) {
        return ['ok' => false, 'error' => 'Respons rilis GitHub tidak valid.'];
    }

    $tag = (string)$rel['tag_name'];
    $ver = ltrim($tag, 'v');
    $assets = is_array($rel['assets'] ?? null) ? $rel['assets'] : [];
    $appAsset = null;
    $manifestAsset = null;
    foreach ($assets as $a) {
        $name = (string)($a['name'] ?? '');
        if ($name === 'human-atlas-app.zip') $appAsset = $a;
        if ($name === 'release-manifest.json') $manifestAsset = $a;
    }

    $manifest = null;
    if ($manifestAsset && !empty($manifestAsset['browser_download_url'])) {
        $mRes = http_get((string)$manifestAsset['browser_download_url'], 10);
        if ($mRes['ok']) {
            $parsed = json_decode($mRes['body'], true);
            if (is_array($parsed)) $manifest = $parsed;
        }
    }

    return [
        'ok'           => true,
        'tag'          => $tag,
        'version'      => $ver,
        'published_at' => (string)($rel['published_at'] ?? ''),
        'release_url'  => (string)($rel['html_url'] ?? ''),
        'notes'        => (string)($rel['body'] ?? ''),
        'app_url'      => (string)($appAsset['browser_download_url'] ?? ''),
        'app_size'     => (int)($appAsset['size'] ?? ($manifest['app_size'] ?? 0)),
        'app_sha256'   => (string)($manifest['app_sha256'] ?? ''),
    ];
}

function is_preserved_path(string $rel, string $rootDir): bool {
    $norm = ltrim(str_replace('\\', '/', $rel), '/');
    if ($norm === '' || str_ends_with($norm, '/')) return true;

    $neverOverwrite = [
        '3d-anatomy/.htadmin_pass',
        '3d-anatomy/.admin_pass',
        '3d-anatomy/custom-favicon.png',
        '3d-anatomy/lab/config.php',
    ];
    if (in_array($norm, $neverOverwrite, true)) return true;

    foreach (['3d-anatomy/lab/data/', '3d-anatomy/.update_tmp/', '3d-anatomy/.update_backup/', 'models/'] as $prefix) {
        if (str_starts_with($norm, $prefix)) return true;
    }

    // Lindungi hasil edit database anatomi lokal jika file sudah ada di server
    if ($norm === '3d-anatomy/anatomy_db.json' && is_file($rootDir . '/3d-anatomy/anatomy_db.json')) {
        return true;
    }
    return false;
}

function rrmdir(string $dir): void {
    if (!is_dir($dir)) return;
    $it = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST
    );
    foreach ($it as $item) {
        $item->isDir() ? @rmdir($item->getPathname()) : @unlink($item->getPathname());
    }
    @rmdir($dir);
}

$action = $_GET['action'] ?? 'check';
$meta   = local_meta($versionUrl);

if ($action === 'check') {
    $issues = env_issues($rootDir);
    $rel    = fetch_latest_release($meta['repo']);
    if (!$rel['ok']) {
        sendOk([
            'current_version' => $meta['version'],
            'repo'            => $meta['repo'],
            'has_update'      => false,
            'can_auto_update' => false,
            'has_rollback'    => is_dir($backupDir) && is_file($backupDir . '/manifest.json'),
            'issues'          => $issues,
            'check_error'     => $rel['error'],
        ]);
    }
    $hasUpdate = version_compare($rel['version'], $meta['version'], '>');
    $canAuto   = empty($issues) && $rel['app_url'] !== '' && $rel['app_sha256'] !== '';
    if ($rel['app_url'] === '' || $rel['app_sha256'] === '') {
        $issues[] = 'Paket rilis human-atlas-app.zip / release-manifest.json tidak lengkap.';
    }
    sendOk([
        'current_version' => $meta['version'],
        'latest_version'  => $rel['version'],
        'tag'             => $rel['tag'],
        'repo'            => $meta['repo'],
        'has_update'      => $hasUpdate,
        'can_auto_update' => $canAuto,
        'has_rollback'    => is_dir($backupDir) && is_file($backupDir . '/manifest.json'),
        'published_at'    => $rel['published_at'],
        'release_url'     => $rel['release_url'],
        'notes'           => $rel['notes'],
        'app_size'        => $rel['app_size'],
        'issues'          => $issues,
    ]);
}

$body = read_json_post(65536);

if ($action === 'apply') {
    require_admin($body);
    $issues = env_issues($rootDir);
    if (!empty($issues)) sendError(400, implode(' ', $issues));

    $rel = fetch_latest_release($meta['repo']);
    if (!$rel['ok']) sendError(502, $rel['error']);
    if ($rel['app_url'] === '' || $rel['app_sha256'] === '') {
        sendError(422, 'Rilis GitHub tidak menyediakan human-atlas-app.zip atau checksum SHA-256.');
    }

    rrmdir($tmpDir);
    if (!@mkdir($tmpDir, 0700, true) && !is_dir($tmpDir)) {
        sendError(500, 'Gagal membuat folder sementara.');
    }
    $zipPath = $tmpDir . '/app.zip';

    $dl = http_get($rel['app_url'], 60, $zipPath);
    if (!$dl['ok'] || !is_file($zipPath)) {
        rrmdir($tmpDir);
        sendError(502, 'Gagal mengunduh paket pembaruan: ' . ($dl['error'] ?? 'unknown'));
    }

    $actualSha = strtolower((string)hash_file('sha256', $zipPath));
    if (!hash_equals(strtolower($rel['app_sha256']), $actualSha)) {
        rrmdir($tmpDir);
        sendError(422, 'Verifikasi SHA-256 paket pembaruan tidak cocok. Pembaruan dibatalkan demi keamanan.');
    }

    $zip = new ZipArchive();
    if ($zip->open($zipPath) !== true) {
        rrmdir($tmpDir);
        sendError(500, 'Gagal membuka arsip pembaruan.');
    }

    // Validasi seluruh path di ZIP dulu (anti Zip-Slip)
    $entries = [];
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $name = (string)$zip->getNameIndex($i);
        $norm = str_replace('\\', '/', $name);
        if (str_contains($norm, "\0") || str_starts_with($norm, '/') || preg_match('#(^|/)\.\.(/|$)#', $norm)) {
            $zip->close();
            rrmdir($tmpDir);
            sendError(422, 'Arsip pembaruan mengandung path tidak aman.');
        }
        $entries[] = [$i, $norm];
    }

    // Siapkan backup file yang akan ditimpa
    rrmdir($backupDir);
    @mkdir($backupDir, 0700, true);
    $backedUp = [];
    $added    = [];
    $updated  = 0;
    $skipped  = 0;

    foreach ($entries as [$idx, $norm]) {
        if (str_ends_with($norm, '/')) continue;
        if (is_preserved_path($norm, $rootDir)) {
            $skipped++;
            continue;
        }

        $target = $rootDir . '/' . $norm;
        $dir    = dirname($target);
        if (!is_dir($dir) && !@mkdir($dir, 0755, true)) {
            $zip->close();
            rrmdir($tmpDir);
            sendError(500, "Gagal membuat direktori: $norm");
        }

        if (is_file($target)) {
            $bakTarget = $backupDir . '/files/' . $norm;
            $bakDir    = dirname($bakTarget);
            if (!is_dir($bakDir)) @mkdir($bakDir, 0700, true);
            @copy($target, $bakTarget);
            $backedUp[] = $norm;
        } else {
            $added[] = $norm;
        }

        $stream = $zip->getStream($zip->getNameIndex($idx));
        if ($stream === false) {
            $zip->close();
            rrmdir($tmpDir);
            sendError(500, "Gagal membaca entri arsip: $norm");
        }
        $tmpFile = $target . '.upd.tmp';
        $out = @fopen($tmpFile, 'wb');
        if (!$out) {
            fclose($stream);
            $zip->close();
            rrmdir($tmpDir);
            sendError(500, "Gagal menulis file: $norm");
        }
        stream_copy_to_stream($stream, $out);
        fclose($stream);
        fclose($out);
        @rename($tmpFile, $target);
        $updated++;
    }
    $zip->close();
    rrmdir($tmpDir);

    // Pastikan version.json mencerminkan versi baru
    file_put_contents($versionUrl, json_encode([
        'version'    => $rel['version'],
        'repo'       => $meta['repo'],
        'channel'    => 'releases',
        'updated_at' => gmdate('c'),
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n", LOCK_EX);

    file_put_contents($backupDir . '/manifest.json', json_encode([
        'previous_version' => $meta['version'],
        'new_version'      => $rel['version'],
        'backed_up'        => $backedUp,
        'added'            => $added,
        'created_at'       => gmdate('c'),
    ], JSON_UNESCAPED_SLASHES), LOCK_EX);

    sendOk([
        'previous_version' => $meta['version'],
        'version'          => $rel['version'],
        'updated_files'    => $updated,
        'preserved_files'  => $skipped,
        'message'          => "Berhasil diperbarui ke v{$rel['version']}. Muat ulang halaman untuk memakai versi terbaru.",
    ]);
}

if ($action === 'rollback') {
    require_admin($body);
    $manifestFile = $backupDir . '/manifest.json';
    if (!is_file($manifestFile)) sendError(404, 'Tidak ada cadangan versi sebelumnya.');
    $m = json_decode((string)file_get_contents($manifestFile), true);
    if (!is_array($m)) sendError(500, 'Manifest cadangan rusak.');

    $restored = 0;
    foreach ((array)($m['backed_up'] ?? []) as $norm) {
        if (is_preserved_path((string)$norm, $rootDir) && $norm !== '3d-anatomy/version.json') continue;
        $src = $backupDir . '/files/' . $norm;
        $dst = $rootDir . '/' . $norm;
        if (is_file($src)) {
            if (!is_dir(dirname($dst))) @mkdir(dirname($dst), 0755, true);
            if (@copy($src, $dst)) $restored++;
        }
    }
    foreach ((array)($m['added'] ?? []) as $norm) {
        if (is_preserved_path((string)$norm, $rootDir)) continue;
        $dst = $rootDir . '/' . $norm;
        if (is_file($dst)) @unlink($dst);
    }

    $prev = (string)($m['previous_version'] ?? $meta['version']);
    file_put_contents($versionUrl, json_encode([
        'version' => $prev,
        'repo'    => $meta['repo'],
        'channel' => 'releases',
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n", LOCK_EX);
    rrmdir($backupDir);

    sendOk([
        'version'  => $prev,
        'restored' => $restored,
        'message'  => "Berhasil dikembalikan ke v{$prev}. Muat ulang halaman.",
    ]);
}

sendError(400, 'Aksi tidak dikenal.');
