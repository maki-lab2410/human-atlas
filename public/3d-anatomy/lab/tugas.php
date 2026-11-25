<?php
/**
 * API Tugas (assignment) Lab Terminologi.
 *   GET  ?action=list                 → daftar tugas (dosen: semua + statistik; mahasiswa: yang berlaku + riwayat sendiri)
 *   GET  ?action=get&code=TGS-XXXX    → ambil tugas lewat kode
 *   POST ?action=save                 → (dosen/laboran/admin) buat atau ubah tugas
 *   POST ?action=set_active           → (staf) buka/tutup tugas
 *   POST ?action=delete               → (staf) hapus tugas yang belum dikerjakan siapa pun
 *   POST ?action=attempt_start        → mulai/lanjutkan satu percobaan (soal TANPA kunci dari server)
 *   POST ?action=attempt_answer       → simpan jawaban satu soal (tidak dapat diubah)
 *   POST ?action=attempt_finish       → selesaikan; NILAI DIHITUNG SERVER dari jawaban tersimpan
 *   GET  ?action=rekap&id=N           → (staf) rekap satu tugas
 */

declare(strict_types=1);
require __DIR__ . '/_lib.php';
require __DIR__ . '/_quiz.php';

const KINDS = ['morfem', 'istilah', 'definisi', 'bagian', 'benarsalah', 'rekam', 'singkatan'];
const TIME_GRACE = 60;        // detik toleransi jaringan untuk batas waktu
const MAX_STARTS_PER_HOUR = 30;

$user = session_user() ?? json_out(['error' => 'Belum masuk.'], 401);
$staff = is_staff($user);
$action = (string)($_GET['action'] ?? 'list');
$method = $_SERVER['REQUEST_METHOD'];
$now = time();

function need_staff(bool $staff): void { if (!$staff) json_out(['error' => 'Khusus dosen/laboran.'], 403); }
function need_post(string $method): void { if ($method !== 'POST') json_out(['error' => 'Gunakan POST.'], 405); require_xhr(); }

function fetch_assignment(int $id): ?array {
    $st = db()->prepare('SELECT * FROM assignments WHERE id = ?'); $st->execute([$id]);
    return $st->fetch() ?: null;
}
function fetch_assignment_by_code(string $code): ?array {
    $st = db()->prepare('SELECT * FROM assignments WHERE code = ?'); $st->execute([strtoupper(trim($code))]);
    return $st->fetch() ?: null;
}
function pub(array $a): array {
    return [
        'id' => (int)$a['id'], 'code' => $a['code'], 'title' => $a['title'],
        'scopes' => json_decode($a['scopes'], true) ?: [], 'kinds' => json_decode($a['kinds'], true) ?: [],
        'total' => (int)$a['total'], 'time_limit_min' => (int)$a['time_limit_min'],
        'deadline' => $a['deadline'] === null ? null : (int)$a['deadline'], 'max_attempts' => (int)$a['max_attempts'],
        'scoring' => $a['scoring'], 'shuffle' => $a['shuffle'], 'allow_late' => (bool)$a['allow_late'],
        'angkatan' => $a['angkatan'], 'active' => (bool)$a['active'],
        'created_by_name' => $a['created_by_name'], 'created_at' => (int)$a['created_at'],
    ];
}
function visible_to(array $a, array $u): bool {
    return (int)$a['active'] === 1 && ($a['angkatan'] === '' || $a['angkatan'] === (string)$u['angkatan']);
}
/** Menutup percobaan yang waktunya habis. Dinilai dari jawaban yang sudah tersimpan (sisanya salah), ditandai lewat waktu. */
function finalize_expired(array $a, string $uid, int $now): void {
    if ((int)$a['time_limit_min'] <= 0) return;
    $limit = (int)$a['time_limit_min'] * 60 + TIME_GRACE;
    // Bandingkan kolom langsung dengan ambang (bukan ekspresi) agar afinitas INTEGER SQLite berlaku
    $st = db()->prepare('SELECT id, questions, answers FROM attempts WHERE assignment_id = ? AND uid = ? AND finished_at IS NULL AND started_at < ?');
    $st->execute([$a['id'], $uid, $now - $limit]);
    foreach ($st->fetchAll() as $r) {
        [$score, $wrong] = quiz_grade(json_decode((string)$r['questions'], true) ?: [], json_decode((string)$r['answers'], true) ?: []);
        db()->prepare('UPDATE attempts SET finished_at = ?, score = ?, duration_s = ?, wrong = ?, overtime = 1 WHERE id = ?')
            ->execute([$now, $score, $limit, json_encode($wrong), $r['id']]);
    }
}
function stats_for(int $aid, string $uid, string $scoring): array {
    $st = db()->prepare('SELECT id, score, total, finished_at, started_at, late, overtime FROM attempts WHERE assignment_id = ? AND uid = ? ORDER BY started_at ASC');
    $st->execute([$aid, $uid]);
    $rows = $st->fetchAll();
    $done = array_values(array_filter($rows, static fn($r) => $r['finished_at'] !== null));
    $counted = null;
    if ($done) $counted = match ($scoring) {
        'first' => $done[0], 'last' => $done[count($done) - 1],
        default => array_reduce($done, static fn($c, $r) => $c === null || (int)$r['score'] > (int)$c['score'] ? $r : $c),
    };
    return [
        'attempts_used' => count($rows), 'in_progress' => count($rows) > count($done),
        'counted_score' => $counted ? (int)$counted['score'] : null, 'total' => $counted ? (int)$counted['total'] : null,
        'history' => array_map(static fn($r) => ['score' => $r['score'] === null ? null : (int)$r['score'], 'total' => (int)$r['total'], 'at' => (int)($r['finished_at'] ?? $r['started_at']), 'done' => $r['finished_at'] !== null, 'late' => (bool)$r['late'], 'overtime' => (bool)$r['overtime']], $rows),
    ];
}
function gen_code(): string {
    $cs = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    for ($t = 0; $t < 50; $t++) {
        $c = 'TGS-'; for ($i = 0; $i < 4; $i++) $c .= $cs[random_int(0, strlen($cs) - 1)];
        if (!fetch_assignment_by_code($c)) return $c;
    }
    json_out(['error' => 'Gagal membuat kode tugas.'], 500);
}

switch ($action) {
    case 'list': {
        if ($staff) {
            $rows = db()->query('SELECT a.*, (SELECT COUNT(*) FROM attempts t WHERE t.assignment_id = a.id AND t.role = \'mahasiswa\') n_attempts,
                (SELECT COUNT(DISTINCT t.uid) FROM attempts t WHERE t.assignment_id = a.id AND t.role = \'mahasiswa\') n_students
                FROM assignments a ORDER BY a.created_at DESC LIMIT 300')->fetchAll();
            json_out(['assignments' => array_map(static fn($r) => pub($r) + ['n_attempts' => (int)$r['n_attempts'], 'n_students' => (int)$r['n_students']], $rows)]);
        }
        $rows = db()->query('SELECT * FROM assignments WHERE active = 1 ORDER BY created_at DESC LIMIT 300')->fetchAll();
        $out = [];
        foreach ($rows as $r) {
            if (!visible_to($r, $user)) continue;
            finalize_expired($r, $user['uid'], $now);
            $out[] = pub($r) + ['mine' => stats_for((int)$r['id'], $user['uid'], $r['scoring'])];
        }
        json_out(['assignments' => $out]);
    }

    case 'get': {
        $a = fetch_assignment_by_code((string)($_GET['code'] ?? ''));
        if (!$a || (int)$a['active'] !== 1) json_out(['error' => 'Kode tugas tidak ditemukan atau sudah ditutup.'], 404);
        if (!$staff && !visible_to($a, $user)) json_out(['error' => 'Tugas ini untuk angkatan ' . $a['angkatan'] . '.'], 403);
        finalize_expired($a, $user['uid'], $now);
        json_out(['assignment' => pub($a) + ['mine' => stats_for((int)$a['id'], $user['uid'], $a['scoring'])]]);
    }

    case 'save': {
        need_staff($staff); need_post($method);
        $b = read_json_body();
        $title = trim(mb_substr((string)($b['title'] ?? ''), 0, 120));
        $scopes = array_values(array_unique(array_filter(array_map('strval', (array)($b['scopes'] ?? [])), static fn($x) => preg_match('/^[a-z]{3,20}$/', $x) === 1)));
        $kinds = array_values(array_unique(array_intersect(array_map('strval', (array)($b['kinds'] ?? [])), KINDS)));
        $total = (int)($b['total'] ?? 0);
        $limit = (int)($b['time_limit_min'] ?? 0);
        $deadline = isset($b['deadline']) && $b['deadline'] !== null && $b['deadline'] !== '' ? (int)$b['deadline'] : null;
        $maxAtt = (int)($b['max_attempts'] ?? 1);
        $scoring = in_array($b['scoring'] ?? '', ['best', 'last', 'first'], true) ? $b['scoring'] : 'best';
        $shuffle = in_array($b['shuffle'] ?? '', ['student', 'shared'], true) ? $b['shuffle'] : 'student';
        $angkatan = preg_match('/^\d{4}$/', (string)($b['angkatan'] ?? '')) ? (string)$b['angkatan'] : '';
        if ($title === '') json_out(['error' => 'Judul wajib diisi.'], 400);
        if (!$scopes || count($scopes) > 15) json_out(['error' => 'Pilih 1–15 fokus materi.'], 400);
        if ($total < 5 || $total > 50) json_out(['error' => 'Jumlah soal harus 5–50.'], 400);
        if ($limit < 0 || $limit > 240) json_out(['error' => 'Waktu pengerjaan 0–240 menit.'], 400);
        if ($maxAtt < 0 || $maxAtt > 10) json_out(['error' => 'Percobaan 0 (tanpa batas) sampai 10.'], 400);
        if ($deadline !== null && ($deadline < 946684800 || $deadline > 4102444800)) json_out(['error' => 'Tenggat tidak valid.'], 400);
        if (!$kinds) $kinds = KINDS;
        $row = [$title, json_encode($scopes), json_encode($kinds), $total, $limit, $deadline, $maxAtt, $scoring, $shuffle,
                !empty($b['allow_late']) ? 1 : 0, $angkatan, !array_key_exists('active', $b) || !empty($b['active']) ? 1 : 0];

        $id = (int)($b['id'] ?? 0);
        if ($id > 0) {
            $old = fetch_assignment($id) ?? json_out(['error' => 'Tugas tidak ditemukan.'], 404);
            $used = (int)db()->query('SELECT COUNT(*) FROM attempts WHERE assignment_id = ' . $id)->fetchColumn();
            if ($used > 0 && ($old['scopes'] !== $row[1] || $old['kinds'] !== $row[2] || (int)$old['total'] !== $total || $old['shuffle'] !== $shuffle)) {
                json_out(['error' => 'Materi, jenis soal, jumlah soal, dan pengacakan tidak dapat diubah setelah ada yang mengerjakan.'], 409);
            }
            db()->prepare('UPDATE assignments SET title=?, scopes=?, kinds=?, total=?, time_limit_min=?, deadline=?, max_attempts=?, scoring=?, shuffle=?, allow_late=?, angkatan=?, active=?, updated_at=? WHERE id=?')
                ->execute([...$row, $now, $id]);
            json_out(['ok' => true, 'assignment' => pub(fetch_assignment($id))]);
        }
        $code = gen_code();
        db()->prepare('INSERT INTO assignments (title, scopes, kinds, total, time_limit_min, deadline, max_attempts, scoring, shuffle, allow_late, angkatan, active, code, shared_seed, created_by, created_by_name, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
            ->execute([...$row, $code, random_int(1, 2147483646), $user['uid'], $user['name'], $now, $now]);
        json_out(['ok' => true, 'assignment' => pub(fetch_assignment((int)db()->lastInsertId()))]);
    }

    case 'set_active': {
        need_staff($staff); need_post($method);
        $b = read_json_body();
        $id = (int)($b['id'] ?? 0);
        fetch_assignment($id) ?? json_out(['error' => 'Tugas tidak ditemukan.'], 404);
        db()->prepare('UPDATE assignments SET active = ?, updated_at = ? WHERE id = ?')->execute([!empty($b['active']) ? 1 : 0, $now, $id]);
        json_out(['ok' => true]);
    }

    case 'delete': {
        need_staff($staff); need_post($method);
        $id = (int)(read_json_body()['id'] ?? 0);
        fetch_assignment($id) ?? json_out(['error' => 'Tugas tidak ditemukan.'], 404);
        if ((int)db()->query('SELECT COUNT(*) FROM attempts WHERE assignment_id = ' . $id)->fetchColumn() > 0) json_out(['error' => 'Tugas yang sudah dikerjakan tidak dapat dihapus; tutup saja.'], 409);
        db()->prepare('DELETE FROM assignments WHERE id = ?')->execute([$id]);
        json_out(['ok' => true]);
    }

    case 'attempt_start': {
        need_post($method);
        $a = fetch_assignment((int)(read_json_body()['id'] ?? 0)) ?? json_out(['error' => 'Tugas tidak ditemukan.'], 404);
        if (!$staff && !visible_to($a, $user)) json_out(['error' => 'Tugas tidak tersedia untuk Anda.'], 403);
        if ((int)$a['active'] !== 1) json_out(['error' => 'Tugas sudah ditutup.'], 403);
        $deadline = $a['deadline'] === null ? null : (int)$a['deadline'];
        $isLate = $deadline !== null && $now > $deadline;
        if ($isLate && !(int)$a['allow_late']) json_out(['error' => 'Tenggat tugas sudah lewat.'], 403);

        $st = db()->prepare('SELECT COUNT(*) FROM attempts WHERE uid = ? AND started_at > ?'); $st->execute([$user['uid'], $now - 3600]);
        if ((int)$st->fetchColumn() >= MAX_STARTS_PER_HOUR) json_out(['error' => 'Terlalu banyak percobaan dimulai. Coba lagi nanti.'], 429);

        finalize_expired($a, $user['uid'], $now);
        $st = db()->prepare('SELECT * FROM attempts WHERE assignment_id = ? AND uid = ? AND finished_at IS NULL ORDER BY started_at DESC LIMIT 1');
        $st->execute([$a['id'], $user['uid']]);
        $att = $st->fetch();
        if (!$att) {
            $st = db()->prepare('SELECT COUNT(*) FROM attempts WHERE assignment_id = ? AND uid = ?'); $st->execute([$a['id'], $user['uid']]);
            $max = (int)$a['max_attempts'];
            if ($max > 0 && (int)$st->fetchColumn() >= $max) json_out(['error' => 'Batas percobaan untuk tugas ini sudah habis.'], 403);
            $scopes = json_decode($a['scopes'], true) ?: []; $kinds = json_decode($a['kinds'], true) ?: [];
            if ($a['shuffle'] === 'shared') {
                // Soal sama untuk semua: dibuat sekali lalu disimpan di tugas (tetap identik walau data berubah)
                if (empty($a['shared_questions'])) {
                    $a['shared_questions'] = json_encode(quiz_build($scopes, $kinds, (int)$a['total'], (int)$a['shared_seed']), JSON_UNESCAPED_UNICODE);
                    db()->prepare('UPDATE assignments SET shared_questions = ? WHERE id = ? AND shared_questions IS NULL')->execute([$a['shared_questions'], $a['id']]);
                    $a = fetch_assignment((int)$a['id']);
                }
                $questions = $a['shared_questions']; $seed = (int)$a['shared_seed'];
            } else {
                $seed = random_int(1, 2147483646);
                $questions = json_encode(quiz_build($scopes, $kinds, (int)$a['total'], $seed), JSON_UNESCAPED_UNICODE);
            }
            db()->prepare('INSERT INTO attempts (assignment_id, uid, nim, name, angkatan, role, seed, started_at, total, late, questions, answers) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
                ->execute([$a['id'], $user['uid'], $user['nim'], $user['name'], $user['angkatan'], $user['role'], $seed, $now, $a['total'], $isLate ? 1 : 0, $questions, json_encode(array_fill(0, (int)$a['total'], null))]);
            $att = db()->query('SELECT * FROM attempts WHERE id = ' . (int)db()->lastInsertId())->fetch();
        }
        $qs = json_decode((string)$att['questions'], true);
        if (!$qs) {   // percobaan lama tanpa soal tersimpan → buat sekarang
            $qs = quiz_build(json_decode($a['scopes'], true) ?: [], json_decode($a['kinds'], true) ?: [], (int)$att['total'], (int)$att['seed']);
            db()->prepare('UPDATE attempts SET questions = ? WHERE id = ?')->execute([json_encode($qs, JSON_UNESCAPED_UNICODE), $att['id']]);
        }
        $limit = (int)$a['time_limit_min'];
        json_out(['attempt' => [
            'id' => (int)$att['id'], 'started_at' => (int)$att['started_at'], 'server_now' => $now,
            'ends_at' => $limit > 0 ? (int)$att['started_at'] + $limit * 60 : null, 'late' => (bool)$att['late'],
            'questions' => quiz_public($qs), 'answers' => json_decode((string)($att['answers'] ?: '[]'), true) ?: [],
        ], 'assignment' => pub($a)]);
    }

    case 'attempt_answer': {
        need_post($method);
        $b = read_json_body();
        $st = db()->prepare('SELECT * FROM attempts WHERE id = ? AND uid = ?'); $st->execute([(int)($b['attempt_id'] ?? 0), $user['uid']]);
        $att = $st->fetch() ?: json_out(['error' => 'Percobaan tidak ditemukan.'], 404);
        if ($att['finished_at'] !== null) json_out(['error' => 'Percobaan sudah selesai.'], 409);
        $a = fetch_assignment((int)$att['assignment_id']) ?? json_out(['error' => 'Tugas tidak ditemukan.'], 404);
        $limit = (int)$a['time_limit_min'];
        if ($limit > 0 && $now > (int)$att['started_at'] + $limit * 60 + TIME_GRACE) { finalize_expired($a, $user['uid'], $now); json_out(['error' => 'Waktu pengerjaan sudah habis.'], 409); }
        $qs = json_decode((string)$att['questions'], true) ?: [];
        $answers = json_decode((string)($att['answers'] ?: '[]'), true) ?: array_fill(0, count($qs), null);
        $idx = $b['index'] ?? null; $ch = $b['choice'] ?? null;
        if (!is_int($idx) || !is_int($ch) || $idx < 0 || $idx >= count($qs) || $ch < 0 || $ch >= count($qs[$idx]['options'])) json_out(['error' => 'Jawaban tidak valid.'], 400);
        if ($answers[$idx] !== null) {
            if ($answers[$idx] === $ch) json_out(['ok' => true]);
            json_out(['error' => 'Soal ini sudah dijawab dan tidak dapat diubah.'], 409);
        }
        $answers[$idx] = $ch;
        db()->prepare('UPDATE attempts SET answers = ? WHERE id = ? AND finished_at IS NULL')->execute([json_encode($answers), $att['id']]);
        json_out(['ok' => true]);
    }

    case 'attempt_finish': {
        need_post($method);
        $b = read_json_body();
        $st = db()->prepare('SELECT * FROM attempts WHERE id = ? AND uid = ?'); $st->execute([(int)($b['attempt_id'] ?? 0), $user['uid']]);
        $att = $st->fetch() ?: json_out(['error' => 'Percobaan tidak ditemukan.'], 404);
        if ($att['finished_at'] !== null) json_out(['error' => 'Percobaan ini sudah dikirim.'], 409);
        $a = fetch_assignment((int)$att['assignment_id']) ?? json_out(['error' => 'Tugas tidak ditemukan.'], 404);
        $limit = (int)$a['time_limit_min']; $deadline = $a['deadline'] === null ? null : (int)$a['deadline'];
        if ($deadline !== null && !(int)$a['allow_late'] && $now > $deadline + ($limit > 0 ? $limit * 60 : 0) + 120) json_out(['error' => 'Tenggat tugas sudah lewat.'], 403);
        // Nilai dihitung SERVER dari jawaban yang tersimpan; skor kiriman klien diabaikan.
        [$score, $wrong] = quiz_grade(json_decode((string)$att['questions'], true) ?: [], json_decode((string)($att['answers'] ?: '[]'), true) ?: []);
        $dur = max(0, $now - (int)$att['started_at']);
        $over = $limit > 0 && $dur > $limit * 60 + TIME_GRACE ? 1 : 0;
        $late = ($deadline !== null && $now > $deadline) || (int)$att['late'] === 1 ? 1 : 0;
        db()->prepare('UPDATE attempts SET finished_at = ?, score = ?, duration_s = ?, wrong = ?, late = ?, overtime = ? WHERE id = ?')
            ->execute([$now, $score, $dur, json_encode($wrong), $late, $over, $att['id']]);
        json_out(['ok' => true, 'score' => $score, 'total' => (int)$att['total'], 'late' => (bool)$late, 'overtime' => (bool)$over, 'mine' => stats_for((int)$a['id'], $user['uid'], $a['scoring'])]);
    }

    case 'rekap': {
        need_staff($staff);
        $a = fetch_assignment((int)($_GET['id'] ?? 0)) ?? json_out(['error' => 'Tugas tidak ditemukan.'], 404);
        $roleSql = ($_GET['semua'] ?? '') === '1' ? '' : " AND role = 'mahasiswa'";
        $st = db()->prepare('SELECT id, uid, nim, name, angkatan, role, started_at, finished_at, score, total, duration_s, late, overtime FROM attempts WHERE assignment_id = ?' . $roleSql . ' ORDER BY name COLLATE NOCASE, started_at ASC LIMIT 5000');
        $st->execute([$a['id']]);
        json_out(['assignment' => pub($a), 'attempts' => $st->fetchAll()]);
    }

    default:
        json_out(['error' => 'Aksi tidak dikenal.'], 404);
}
