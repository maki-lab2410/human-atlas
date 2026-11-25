<?php
/**
 * Atur password admin (HANYA dari terminal):   php set-admin-pass.php
 * Disimpan sebagai hash bcrypt di .htadmin_pass (folder yang sama dengan db.php).
 */
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

$dir = getenv('ATLAS_DATA_DIR') ?: __DIR__;
function ask_hidden(string $prompt): string {
    fwrite(STDOUT, $prompt);
    $tty = stripos(PHP_OS, 'WIN') === false;
    if ($tty) shell_exec('stty -echo');
    $v = trim((string)fgets(STDIN));
    if ($tty) shell_exec('stty echo');
    fwrite(STDOUT, "\n");
    return $v;
}
$pw = ask_hidden('Password admin baru (min. 10 karakter): ');
if (strlen($pw) < 10) { fwrite(STDERR, "Terlalu pendek.\n"); exit(1); }
if ($pw !== ask_hidden('Ulangi password: ')) { fwrite(STDERR, "Tidak sama.\n"); exit(1); }
file_put_contents($dir . '/.htadmin_pass', password_hash($pw, PASSWORD_BCRYPT, ['cost' => 12]), LOCK_EX);
@chmod($dir . '/.htadmin_pass', 0600);
if (is_file($dir . '/.admin_pass')) { unlink($dir . '/.admin_pass'); echo "Berkas lama .admin_pass dihapus.\n"; }
echo "Password admin disimpan.\n";
