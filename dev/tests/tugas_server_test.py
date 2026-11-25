import json, sqlite3, time, urllib.request, urllib.parse, http.cookiejar, sys, os
"""Uji server tugas (penilaian oleh server). Prasyarat: `npm run dev:php` berjalan (port 8081).
Jalankan:  python3 dev/tests/tugas_server_test.py
"""
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
B = 'http://127.0.0.1:8081/3d-anatomy/3d-anatomy/lab'
DB = ROOT + '/dev/data/lab.sqlite'

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None

class Client:
    def __init__(self, user):
        self.jar = http.cookiejar.CookieJar()
        self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar), NoRedirect)
        loc = self._loc(f'{B}/api.php?action=login')
        state = urllib.parse.parse_qs(urllib.parse.urlparse(loc).query)['state'][0]
        data = urllib.parse.urlencode({'client_id': 'atlas', 'redirect_uri': f'{B}/sso.php', 'state': state, 'user': user}).encode()
        cb = self._loc('http://127.0.0.1:8081/sopan/authorize.php', data)
        self._loc(cb)
    def _loc(self, url, data=None):
        try: self.op.open(url, data)
        except urllib.error.HTTPError as e:
            if e.code in (301, 302): return e.headers['Location']
            raise
        return None
    def call(self, action, body=None, method=None):
        url = f'{B}/tugas.php?action={action}'
        h = {'Content-Type': 'application/json', 'X-Lab-Request': '1'}
        req = urllib.request.Request(url, json.dumps(body).encode() if body is not None else None, h, method=method)
        try:
            r = self.op.open(req); return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())

ok = fails = 0
def check(name, cond, extra=''):
    global ok, fails
    if cond: ok += 1; print('  ✓', name)
    else: fails += 1; print('  ✗', name, extra)

def keys_in(o, banned=('answer', 'key', 'ans', 'correct', 'wrong')):
    found = []
    def walk(x, path=''):
        if isinstance(x, dict):
            for k, v in x.items():
                if k in banned: found.append(path + '/' + k)
                walk(v, path + '/' + k)
        elif isinstance(x, list):
            for i, v in enumerate(x): walk(v, f'{path}[{i}]')
    walk(o); return found

def stored(attempt_id):
    c = sqlite3.connect(DB); r = c.execute('select questions, answers from attempts where id=?', (attempt_id,)).fetchone(); c.close()
    return json.loads(r[0]), json.loads(r[1])

budi, sinta, dosen = Client('budi'), Client('sinta'), Client('dosen')
now = int(time.time())

print('1. Pembuatan tugas')
st, r = dosen.call('save', {'title': 'Tahap2 Campuran', 'scopes': ['pernapasan', 'morfem', 'singkatan'], 'total': 20, 'time_limit_min': 10, 'max_attempts': 3, 'scoring': 'best', 'shuffle': 'student'})
check('tugas dibuat', st == 200, r); A = r['assignment']['id']

print('2. Mulai percobaan: soal tanpa kunci')
st, r = budi.call('attempt_start', {'id': A})
check('200', st == 200, r)
att = r['attempt']; aid = att['id']
check('20 soal', len(att['questions']) == 20)
check('tidak ada bidang kunci (answer/key) di respons', not keys_in(r), keys_in(r))
check('jawaban awal kosong', att['answers'] == [None] * 20)
check('tidak ada seed/skor di respons', 'seed' not in att)
uniq = {(q['kind'], q['prompt'], q.get('focus', '')) for q in att['questions']}
check('soal unik (>=18 dari 20)', len(uniq) >= 18, len(uniq))
check('opsi >=2 dan tanpa duplikat teks', all(len(q['options']) >= 2 and len(set(q['options'])) == len(q['options']) for q in att['questions']))
kinds = {q['kind'] for q in att['questions']}; print('     jenis muncul:', sorted(kinds))

print('3. Menjawab dan menilai di server')
sq, _ = stored(aid)
for i in range(20):
    right = sq[i]['answer']; choice = right if i < 15 else (right + 1) % len(sq[i]['options'])
    st, r = budi.call('attempt_answer', {'attempt_id': aid, 'index': i, 'choice': choice})
    if st != 200: check(f'jawab {i}', False, r); break
else: check('20 jawaban tersimpan', True)
st, r = budi.call('attempt_answer', {'attempt_id': aid, 'index': 0, 'choice': (sq[0]['answer'] + 1) % len(sq[0]['options'])})
check('mengubah jawaban ditolak (409)', st == 409, r)
st, r = budi.call('attempt_answer', {'attempt_id': aid, 'index': 0, 'choice': sq[0]['answer']})
check('mengirim jawaban sama = idempoten (200)', st == 200, r)
st, r = budi.call('attempt_answer', {'attempt_id': aid, 'index': 99, 'choice': 0}); check('indeks di luar rentang (400)', st == 400)
st, r = budi.call('attempt_answer', {'attempt_id': aid, 'index': 1, 'choice': 99}); check('opsi di luar rentang (400)', st == 400)
st, r = budi.call('attempt_answer', {'attempt_id': aid, 'index': '1', 'choice': 0}); check('tipe tidak valid (400)', st == 400)
st, r = sinta.call('attempt_answer', {'attempt_id': aid, 'index': 1, 'choice': 0}); check('peserta lain tak bisa menjawab (404)', st == 404)
st, r = budi.call('attempt_finish', {'attempt_id': aid, 'score': 20})
check('selesai; skor klien (20) diabaikan → server menilai 15', st == 200 and r['score'] == 15, r)
st, r = budi.call('attempt_finish', {'attempt_id': aid}); check('kirim ulang ditolak (409)', st == 409)
st, r = budi.call('attempt_answer', {'attempt_id': aid, 'index': 2, 'choice': 0}); check('menjawab setelah selesai ditolak (409)', st == 409)

print('4. Soal yang tak dijawab dihitung salah')
st, r = budi.call('attempt_start', {'id': A}); aid2 = r['attempt']['id']; sq2, _ = stored(aid2)
check('percobaan 2 punya soal berbeda dari percobaan 1', [q['prompt']+q.get('focus','') for q in sq2] != [q['prompt']+q.get('focus','') for q in sq])
for i in range(3): budi.call('attempt_answer', {'attempt_id': aid2, 'index': i, 'choice': sq2[i]['answer']})
st, r = budi.call('attempt_finish', {'attempt_id': aid2}); check('3 benar dari 20', r.get('score') == 3, r)
check('nilai dihitung (terbaik) = 15', r['mine']['counted_score'] == 15, r['mine'])

print('5. Resume lintas muat-ulang: jawaban tersimpan di server')
st, r = budi.call('attempt_start', {'id': A}); aid3 = r['attempt']['id']; sq3, _ = stored(aid3)
for i in range(5): budi.call('attempt_answer', {'attempt_id': aid3, 'index': i, 'choice': sq3[i]['answer']})
st, r = budi.call('attempt_start', {'id': A})
check('mulai lagi = melanjutkan percobaan sama dengan jawaban awal', r['attempt']['id'] == aid3 and r['attempt']['answers'][:5] == [sq3[i]['answer'] for i in range(5)] and r['attempt']['answers'][5] is None, r['attempt']['answers'])

print('6. Waktu habis: dinilai dari jawaban tersimpan')
c = sqlite3.connect(DB); c.execute('update attempts set started_at = started_at - 700 where id=?', (aid3,)); c.commit(); c.close()
st, r = budi.call('attempt_answer', {'attempt_id': aid3, 'index': 6, 'choice': 0}); check('menjawab setelah waktu habis ditolak (409)', st == 409, r)
c = sqlite3.connect(DB); row = c.execute('select finished_at, score, overtime from attempts where id=?', (aid3,)).fetchone(); c.close()
check('percobaan otomatis ditutup dengan skor 5 dan ditandai lewat waktu', row[0] is not None and row[1] == 5 and row[2] == 1, row)
st, r = budi.call('attempt_start', {'id': A}); check('percobaan ke-4 ditolak (batas 3)', st == 403, r)

print('7. Mode soal sama untuk semua (shared)')
st, r = dosen.call('save', {'title': 'Tahap2 Bersama', 'scopes': ['singkatan'], 'kinds': ['singkatan'], 'total': 10, 'shuffle': 'shared', 'max_attempts': 0})
Sid = r['assignment']['id']
_, r1 = budi.call('attempt_start', {'id': Sid}); _, r2 = sinta.call('attempt_start', {'id': Sid})
q1, q2 = r1['attempt']['questions'], r2['attempt']['questions']
check('soal & urutan opsi identik antar mahasiswa', q1 == q2)
check('hanya jenis singkatan', {q['kind'] for q in q1} <= {'abbr', 'abbrRev'}, {q['kind'] for q in q1})
st, r3 = dosen.call('save', {'title': 'Tahap2 Acak', 'scopes': ['singkatan'], 'kinds': ['singkatan'], 'total': 10, 'shuffle': 'student', 'max_attempts': 0})
Tid = r3['assignment']['id']
_, a1 = budi.call('attempt_start', {'id': Tid}); _, a2 = sinta.call('attempt_start', {'id': Tid})
check('mode acak: susunan berbeda antar mahasiswa', a1['attempt']['questions'] != a2['attempt']['questions'])

print('8. Sistem tubuh & jenis tertentu')
st, r = dosen.call('save', {'title': 'Tahap2 Kemih', 'scopes': ['kemih'], 'kinds': ['istilah', 'bagian'], 'total': 12, 'max_attempts': 0})
_, k = budi.call('attempt_start', {'id': r['assignment']['id']})
check('hanya jenis termMeaning/partType', {q['kind'] for q in k['attempt']['questions']} <= {'termMeaning', 'partType'}, {q['kind'] for q in k['attempt']['questions']})
pt = [q for q in k['attempt']['questions'] if q['kind'] == 'partType']
check('soal jenis bagian membawa parts & hl', all(isinstance(q.get('parts'), list) and isinstance(q.get('hl'), int) for q in pt))

print(f'\nHASIL: {ok} lulus, {fails} gagal')
sys.exit(1 if fails else 0)
