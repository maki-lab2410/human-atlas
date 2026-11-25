<?php
// Uji konsistensi 1.200 soal buatan server (kunci cocok dengan data). Jalankan:  php dev/tests/quiz_consistency.php
require __DIR__ . '/../../public/3d-anatomy/lab/_lib.php';
require __DIR__ . '/../../public/3d-anatomy/lab/_quiz.php';
$d = quiz_data(); $terms = array_column($d['terms'], null, 'id'); $abbr = array_column($d['abbr'], null, 'id'); $mor = $d['morphById'];
$scopes = quiz_valid_scopes(); $bad = 0; $n = 0; $kinds = [];
for ($s = 1; $s <= 60; $s++) {
    $pick = array_slice($scopes, ($s * 3) % count($scopes), 1 + $s % 3);
    $qs = quiz_build($pick, [], 20, $s * 7919);
    foreach ($qs as $q) {
        $n++; $kinds[$q['kind']] = ($kinds[$q['kind']] ?? 0) + 1;
        $o = $q['options']; $a = (int)$q['answer']; $err = null;
        if ($a < 0 || $a >= count($o)) $err = 'indeks jawaban di luar opsi';
        elseif (count(array_unique($o)) !== count($o)) $err = 'opsi duplikat';
        elseif (count($o) < 2) $err = 'opsi < 2';
        else switch ($q['kind']) {
            case 'morph': $m = $mor[$q['key']]; if ($o[$a] !== $m['meaning'] || $q['focus'] !== $m['form']) $err = 'morph salah'; break;
            case 'termMeaning': $t = $terms[$q['key']]; if ($o[$a] !== $t['definition'] || $q['focus'] !== q_display($t)) $err = 'termMeaning salah'; break;
            case 'termFromDef': $t = $terms[$q['key']]; if ($o[$a] !== q_display($t) || $q['focus'] !== $t['definition']) $err = 'termFromDef salah'; break;
            case 'partType': $m = $mor[$q['key']]; if ($o[$a] !== TYPE_LABEL[$m['type']] || $q['parts'][$q['hl']] !== $q['focus']) $err = 'partType salah'; break;
            case 'tf': $m = $mor[$q['key']]; $truth = $q['focus'] === $m['form'] . ' berarti “' . $m['meaning'] . '”'; if (($a === 0) !== $truth) $err = 'tf salah'; break;
            case 'record': $t = $terms[$q['key']]; if ($o[$a] !== $t['definition'] || $q['focus'] !== '“' . $t['indonesian'] . '”') $err = 'record salah'; break;
            case 'abbr': $x = $abbr[substr($q['key'], 3)]; if ($o[$a] !== $x['full'] || $q['focus'] !== $x['abbr']) $err = 'abbr salah'; break;
            case 'abbrRev': $x = $abbr[substr($q['key'], 3)]; if ($o[$a] !== $x['abbr']) $err = 'abbrRev salah'; break;
            default: $err = 'jenis tak dikenal ' . $q['kind'];
        }
        if ($err) { $bad++; if ($bad < 6) echo "GALAT [$err] " . json_encode($q, JSON_UNESCAPED_UNICODE) . "\n"; }
    }
}
echo "soal diperiksa: $n | galat: $bad\n"; ksort($kinds); echo 'sebaran jenis: ' . json_encode($kinds) . "\n";
