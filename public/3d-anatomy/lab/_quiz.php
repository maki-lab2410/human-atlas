<?php
/**
 * Pembangkit soal tugas di SERVER (port dari app/terminology/questions.ts).
 * Kunci jawaban hanya disimpan di server; peserta hanya menerima soal tanpa kunci.
 * Tidak boleh diakses langsung (lihat .htaccess).
 */

declare(strict_types=1);

const TYPE_LABEL = ['prefix' => 'Prefiks', 'root' => 'Akar kata', 'cv' => 'Vokal penghubung', 'suffix' => 'Sufiks'];
const CATEGORY_LABEL = [
    'anatomi' => 'Anatomi', 'diagnosis' => 'Diagnosis', 'tindakan' => 'Tindakan', 'gejala' => 'Gejala', 'ilmu' => 'Ilmu/profesi',
    'fisiologi' => 'Fisiologi', 'alat' => 'Alat', 'obat' => 'Obat', 'umum' => 'Umum',
];
const QUIZ_KINDS = ['morfem', 'istilah', 'definisi', 'bagian', 'benarsalah', 'rekam', 'singkatan'];

/** Data terminologi (salinan dari app/terminology/data/terminologi.json, dibuat oleh scripts/build-terminologi.py). */
function quiz_data(): array {
    static $d = null;
    if ($d !== null) return $d;
    $path = __DIR__ . '/terminologi.json';
    $json = is_file($path) ? json_decode((string)file_get_contents($path), true) : null;
    if (!is_array($json) || empty($json['terms'])) json_out(['error' => 'Data soal belum tersedia di server (terminologi.json).'], 500);
    $d = [
        'terms' => $json['terms'], 'abbr' => $json['abbreviations'],
        'morphs' => $json['morphemes'], 'morphById' => array_column($json['morphemes'], null, 'id'),
    ];
    return $d;
}

function quiz_systems(): array {
    $s = array_values(array_unique(array_column(quiz_data()['terms'], 'system')));
    return $s;
}
function quiz_valid_scopes(): array { return array_merge(['morfem', 'singkatan'], quiz_systems()); }

// ─── Acak (MT19937 berbenih; hasil disimpan sehingga tidak perlu identik antar versi PHP) ───
function q_shuffle(array $a): array {
    $a = array_values($a);
    for ($i = count($a) - 1; $i > 0; $i--) { $j = mt_rand(0, $i); [$a[$i], $a[$j]] = [$a[$j], $a[$i]]; }
    return $a;
}
function q_pick(array $a) { return $a[mt_rand(0, count($a) - 1)]; }
function q_sample(array $a, int $n): array { return array_slice(q_shuffle($a), 0, $n); }

function q_terms(string $scope): array {
    $t = quiz_data()['terms'];
    if (in_array($scope, ['campuran', 'morfem', 'singkatan'], true)) return $t;
    return array_values(array_filter($t, static fn($x) => $x['system'] === $scope));
}
function q_morphs(string $scope): array {
    $all = array_values(array_filter(quiz_data()['morphs'], static fn($m) => $m['type'] !== 'cv'));
    if (in_array($scope, ['campuran', 'morfem', 'singkatan'], true)) return $all;
    $ids = [];
    foreach (q_terms($scope) as $t) foreach ($t['parts'] as $p) $ids[$p['m']] = true;
    return array_values(array_filter($all, static fn($m) => isset($ids[$m['id']])));
}
function q_base(array $t): string { return explode(' (', $t['term'])[0]; }
function q_display(array $t): string { return str_replace(['(', ')'], '', $t['term']); }

/** Susun opsi: jawaban benar + pengecoh yang teks opsinya berbeda, diacak. Mengembalikan [opsi[], indeksBenar]. */
function q_options(array $correct, array $distractPool, int $n, callable $text): array {
    $ct = $text($correct);
    $seen = [$ct => true]; $dis = [];
    foreach (q_shuffle($distractPool) as $x) {
        $tx = $text($x);
        if (isset($seen[$tx])) continue;
        $seen[$tx] = true; $dis[] = $x;
        if (count($dis) >= $n) break;
    }
    $opts = q_shuffle(array_merge([$correct], $dis));
    $idx = 0; foreach ($opts as $i => $o) if ($text($o) === $ct) $idx = $i;
    return [array_map($text, $opts), $idx];
}

function q_morph(string $scope): array {
    $m = q_pick(q_morphs($scope));
    $pool = array_filter(quiz_data()['morphs'], static fn($x) => $x['type'] === $m['type'] && $x['id'] !== $m['id'] && $x['meaning'] !== $m['meaning']);
    [$opts, $ans] = q_options($m, $pool, 3, static fn($x) => $x['meaning']);
    return ['kind' => 'morph', 'prompt' => 'Apa arti ' . mb_strtolower(TYPE_LABEL[$m['type']]) . ' berikut?', 'focus' => $m['form'], 'options' => $opts, 'answer' => $ans, 'key' => $m['id']];
}
function q_term_meaning(string $scope, bool $reverse): array {
    $pool = q_terms($scope);
    $t = q_pick($pool);
    $same = array_values(array_filter($pool, static fn($x) => $x['id'] !== $t['id'] && $x['category'] === $t['category']));
    $dpool = count($same) >= 3 ? $same : array_values(array_filter($pool, static fn($x) => $x['id'] !== $t['id']));
    if ($reverse) {
        [$opts, $ans] = q_options($t, $dpool, 3, 'q_display');
        return ['kind' => 'termFromDef', 'prompt' => 'Istilah medis yang tepat untuk definisi berikut adalah…', 'focus' => $t['definition'], 'options' => $opts, 'answer' => $ans, 'key' => $t['id']];
    }
    [$opts, $ans] = q_options($t, $dpool, 3, static fn($x) => $x['definition']);
    return ['kind' => 'termMeaning', 'prompt' => 'Apa arti istilah berikut?', 'focus' => q_display($t), 'options' => $opts, 'answer' => $ans, 'key' => $t['id']];
}
function q_part_type(string $scope): array {
    $cands = array_values(array_filter(q_terms($scope), static fn($x) => count($x['parts']) >= 3));
    $t = q_pick($cands ?: q_terms($scope));
    $hl = mt_rand(0, count($t['parts']) - 1);
    $m = quiz_data()['morphById'][$t['parts'][$hl]['m']];
    $types = array_keys(TYPE_LABEL);
    return ['kind' => 'partType', 'prompt' => 'Pada istilah "' . q_base($t) . '", bagian yang disorot termasuk…', 'focus' => $t['parts'][$hl]['t'],
        'options' => array_values(TYPE_LABEL), 'answer' => (int)array_search($m['type'], $types, true), 'key' => $m['id'],
        'parts' => array_map(static fn($p) => $p['t'], $t['parts']), 'hl' => $hl];
}
function q_true_false(string $scope): array {
    $m = q_pick(q_morphs($scope));
    $truth = mt_rand(0, 1) === 0;
    $others = array_values(array_filter(quiz_data()['morphs'], static fn($x) => $x['type'] === $m['type'] && $x['id'] !== $m['id'] && $x['meaning'] !== $m['meaning']));
    $shown = $truth ? $m['meaning'] : q_pick($others)['meaning'];
    return ['kind' => 'tf', 'prompt' => 'Benar atau salah?', 'focus' => $m['form'] . ' berarti “' . $shown . '”', 'options' => ['Benar', 'Salah'], 'answer' => $truth ? 0 : 1, 'key' => $m['id']];
}
function q_record_read(string $scope): array {
    $pool = array_values(array_filter(q_terms($scope), static fn($t) => $t['category'] !== 'anatomi' && $t['category'] !== 'ilmu'));
    $base = $pool ?: q_terms($scope);
    $t = q_pick($base);
    $same = array_values(array_filter($base, static fn($x) => $x['id'] !== $t['id'] && $x['category'] === $t['category']));
    $dpool = count($same) >= 3 ? $same : array_values(array_filter($base, static fn($x) => $x['id'] !== $t['id']));
    [$opts, $ans] = q_options($t, $dpool, 3, static fn($x) => $x['definition']);
    return ['kind' => 'record', 'prompt' => 'Dalam rekam medis tertulis berikut. Apa maksudnya?', 'focus' => '“' . $t['indonesian'] . '”',
        'hint' => 'Kategori: ' . (CATEGORY_LABEL[$t['category']] ?? $t['category']), 'options' => $opts, 'answer' => $ans, 'key' => $t['id']];
}
function q_abbr(bool $reverse): array {
    $all = quiz_data()['abbr'];
    $a = q_pick($all);
    $same = array_values(array_filter($all, static fn($x) => $x['id'] !== $a['id'] && $x['abbr'] !== $a['abbr'] && $x['full'] !== $a['full']));
    $sameCat = array_values(array_filter($same, static fn($x) => $x['category'] === $a['category']));
    $dpool = count($sameCat) >= 3 ? $sameCat : $same;
    if ($reverse) {
        [$opts, $ans] = q_options($a, $dpool, 3, static fn($x) => $x['abbr']);
        return ['kind' => 'abbrRev', 'prompt' => 'Singkatan untuk “' . $a['full'] . '” adalah…', 'hint' => 'Kategori: ' . $a['category'], 'options' => $opts, 'answer' => $ans, 'key' => 'ab:' . $a['id']];
    }
    [$opts, $ans] = q_options($a, $dpool, 3, static fn($x) => $x['full']);
    return ['kind' => 'abbr', 'prompt' => 'Apa kepanjangan singkatan berikut?', 'focus' => $a['abbr'], 'hint' => 'Kategori: ' . $a['category'], 'options' => $opts, 'answer' => $ans, 'key' => 'ab:' . $a['id']];
}

/** Bangun soal tugas (dengan kunci). $seed membuat hasil dapat diulang. */
function quiz_build(array $scopes, array $kinds, int $total, int $seed): array {
    mt_srand($seed);
    $valid = quiz_valid_scopes();
    $scopes = array_values(array_filter($scopes, static fn($s) => in_array($s, $valid, true)));
    $use = $scopes ?: ['campuran'];
    $kinds = $kinds ?: QUIZ_KINDS;
    $gen = static function (string $scope) use ($kinds): array {
        if ($scope === 'singkatan') return q_abbr(mt_rand(0, 1) === 0);
        $opts = [];
        if ($scope === 'morfem') {
            if (in_array('morfem', $kinds, true)) $opts[] = fn() => q_morph($scope);
            if (in_array('benarsalah', $kinds, true)) $opts[] = fn() => q_true_false($scope);
            if (in_array('bagian', $kinds, true)) $opts[] = fn() => q_part_type($scope);
            return ($opts ? q_pick($opts) : fn() => q_morph($scope))();
        }
        if (in_array('morfem', $kinds, true)) $opts[] = fn() => q_morph($scope);
        if (in_array('istilah', $kinds, true)) $opts[] = fn() => q_term_meaning($scope, false);
        if (in_array('definisi', $kinds, true)) $opts[] = fn() => q_term_meaning($scope, true);
        if (in_array('bagian', $kinds, true)) $opts[] = fn() => q_part_type($scope);
        if (in_array('benarsalah', $kinds, true)) $opts[] = fn() => q_true_false($scope);
        if (in_array('rekam', $kinds, true)) $opts[] = fn() => q_record_read($scope);
        return ($opts ? q_pick($opts) : fn() => q_term_meaning($scope, false))();
    };
    $out = []; $seen = [];
    for ($n = 0; $n < $total; $n++) {
        $q = null;
        for ($tries = 0; $tries < 40; $tries++) {
            $c = $gen(q_pick($use));
            $key = $c['kind'] . '|' . $c['prompt'] . '|' . ($c['focus'] ?? '');
            $q = $c;
            if (!isset($seen[$key])) { $seen[$key] = true; break; }
        }
        $out[] = $q;
    }
    return $out;
}

/** Versi untuk peserta: tanpa kunci jawaban dan tanpa id internal. */
function quiz_public(array $questions): array {
    return array_map(static function (array $q): array {
        $p = ['kind' => $q['kind'], 'prompt' => $q['prompt'], 'options' => $q['options']];
        foreach (['focus', 'hint', 'parts', 'hl'] as $k) if (isset($q[$k])) $p[$k] = $q[$k];
        return $p;
    }, $questions);
}

/** Nilai jawaban. $answers[i] = indeks opsi (atau null/tidak ada). Mengembalikan [skor, daftarKunciSalah]. */
function quiz_grade(array $questions, array $answers): array {
    $score = 0; $wrong = [];
    foreach ($questions as $i => $q) {
        $a = $answers[$i] ?? null;
        if (is_int($a) && $a === (int)$q['answer']) $score++; else $wrong[] = $q['key'];
    }
    return [$score, array_slice($wrong, 0, 100)];
}
