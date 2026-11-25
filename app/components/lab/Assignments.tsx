import {useEffect, useMemo, useRef, useState} from 'react';
import {Check, ClipboardCopy, Clock, Download, Plus, RotateCcw, Trophy} from 'lucide-react';
import {
  answerQuestion, deleteAssignment, fetchAssignmentRekap, finishAttempt, getAssignmentByCode, listAssignments, saveAssignment, setAssignmentActive, startAttempt,
  type Assignment, type AssignmentInput, type AttemptRow, type AttemptStart, type Scoring,
} from '../../lib/labAuth';
import {ALL_KINDS, KIND_LABEL, SCOPE_OPTIONS, type Question} from '../../terminology/questions';
import type {Term} from '../../terminology/data';
import {btn, downloadCsv, fmtDate, RunQuestions, scopeLabel, type RunController} from './ui';

const nowSec = () => Math.floor(Date.now() / 1000);
const scoringLabel: Record<Scoring, string> = {best: 'Nilai terbaik', last: 'Percobaan terakhir', first: 'Percobaan pertama'};
const mmss = (s: number) => `${String(Math.floor(Math.max(0, s) / 60)).padStart(2, '0')}:${String(Math.max(0, s) % 60).padStart(2, '0')}`;
const pctOf = (score: number, total: number) => Math.round((score / total) * 100);
const toLocalInput = (t: number | null) => { if (!t) return ''; const d = new Date(t * 1000); const z = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`; };

function deadlineInfo(a: Assignment): {text: string; closed: boolean} {
  if (!a.deadline) return {text: 'Tanpa tenggat', closed: false};
  const over = nowSec() > a.deadline;
  return {text: `Tenggat ${fmtDate(a.deadline)}${over ? (a.allow_late ? ' (lewat, masih diterima & ditandai terlambat)' : ' — sudah lewat') : ''}`, closed: over && !a.allow_late};
}

function Msg({kind, children}: {kind: 'err' | 'ok' | 'info'; children: React.ReactNode}) {
  const c = {err: 'bg-rose-50 text-rose-700 border-rose-100', ok: 'bg-emerald-50 text-emerald-700 border-emerald-100', info: 'bg-blue-50 text-blue-800 border-blue-100'}[kind];
  return <div className={`text-xs rounded-xl border px-3 py-2 ${c}`}>{children}</div>;
}

// ═════════════════════════════ MAHASISWA ═════════════════════════════
function AssignmentRun({assignment, attempt, onClose}: {assignment: Assignment; attempt: AttemptStart; onClose: () => void}) {
  // Soal berasal dari server (tanpa kunci); jawaban disimpan ke server satu per satu; server yang menilai.
  const questions = useMemo<Question[]>(() => attempt.questions.map(q => ({
    kind: q.kind, prompt: q.prompt, focus: q.focus, hint: q.hint, options: q.options, hl: q.hl, answer: -1, ids: [], explain: '',
    term: q.parts ? ({id: '', parts: q.parts.map(t => ({t, m: ''}))} as unknown as Term) : undefined,
  })), [attempt]);
  const firstOpen = attempt.answers.findIndex(a => a === null);
  const ctrl = useRef<RunController | null>(null);
  const skew = useRef(attempt.server_now * 1000 - Date.now());
  const [left, setLeft] = useState<number | null>(attempt.ends_at ? Math.round((attempt.ends_at * 1000 - (Date.now() + skew.current)) / 1000) : null);
  const [result, setResult] = useState<null | {state: 'sending' | 'ok' | 'fail' | 'closed'; msg: string; score?: number; total?: number; late?: boolean; overtime?: boolean; counted?: number | null}>(null);

  const send = async () => {
    setResult({state: 'sending', msg: ''});
    const r = await finishAttempt(attempt.id);
    if (r.ok) setResult({state: 'ok', msg: '', score: r.data.score, total: r.data.total, late: r.data.late, overtime: r.data.overtime, counted: r.data.mine.counted_score});
    else if (r.message.includes('sudah dikirim')) setResult({state: 'closed', msg: 'Waktu pengerjaan habis dan jawaban Anda yang sudah tersimpan telah dinilai otomatis oleh server. Lihat nilai di daftar tugas.'});
    else setResult({state: 'fail', msg: r.message});
  };

  const onChoose = async (choice: number, index: number) => {
    const r = await answerQuestion(attempt.id, index, choice);
    if (r.ok) return true;
    if (/Waktu|selesai/.test(r.message)) { ctrl.current?.finish(); return true; }   // waktu habis di server
    return false;
  };

  useEffect(() => {
    if (left === null || result) return;
    const t = setInterval(() => {
      const s = Math.round((attempt.ends_at! * 1000 - (Date.now() + skew.current)) / 1000);
      setLeft(s);
      if (s <= 0) { clearInterval(t); ctrl.current?.finish(); }
    }, 1000);
    return () => clearInterval(t);
  }, [result]); // eslint-disable-line react-hooks/exhaustive-deps

  if (result) return <div className="text-center space-y-4 py-6">
    {result.state === 'sending' && <p className="text-sm text-gray-500">Mengirim dan menilai…</p>}
    {result.state === 'ok' && <>
      <Trophy size={40} className="mx-auto text-amber-500"/>
      <div className="text-3xl font-bold text-gray-900">{result.score} / {result.total}</div>
      <div className="text-sm text-gray-500">{pctOf(result.score!, result.total!)}%</div>
      <Msg kind="ok">✓ Dinilai oleh server dan tercatat.{result.counted != null && ` Nilai yang dihitung (${scoringLabel[assignment.scoring].toLowerCase()}): ${result.counted}/${result.total}.`}</Msg>
      {result.late && <Msg kind="info">Dikirim setelah tenggat — ditandai terlambat.</Msg>}
      {result.overtime && <Msg kind="info">Melebihi batas waktu — ditandai untuk ditinjau dosen.</Msg>}
    </>}
    {result.state === 'closed' && <Msg kind="info">{result.msg}</Msg>}
    {result.state === 'fail' && <div className="space-y-2">
      <Msg kind="err">{result.msg} Jawaban Anda tetap tersimpan di server.</Msg>
      <button {...btn} onClick={send} className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium inline-flex items-center gap-2"><RotateCcw size={14}/> Kirim ulang</button>
    </div>}
    {result.state !== 'sending' && <button {...btn} onClick={onClose} className="px-5 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">Kembali ke daftar tugas</button>}
  </div>;

  const header = <div className="flex items-center justify-between gap-2 text-xs">
    <span className="font-semibold text-gray-900 truncate">{assignment.title}</span>
    {left !== null && <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full border font-mono ${left < 60 ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-gray-50 text-gray-700 border-gray-200'}`}><Clock size={11}/>{mmss(left)}</span>}
  </div>;
  return <RunQuestions questions={questions} header={header} ctrl={ctrl} feedback={false} startIndex={firstOpen === -1 ? questions.length : firstOpen}
    onChoose={onChoose} onFinish={() => send()}/>;
}

export function StudentAssignments() {
  const [list, setList] = useState<Assignment[] | null>(null);
  const [err, setErr] = useState('');
  const [code, setCode] = useState('');
  const [codeMsg, setCodeMsg] = useState('');
  const [pending, setPending] = useState<Assignment | null>(null);
  const [run, setRun] = useState<{assignment: Assignment; attempt: AttemptStart} | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => listAssignments().then(r => { if (r.ok) { setList(r.data.assignments); setErr(''); } else setErr(r.message); });
  useEffect(() => { load(); }, []);

  const open = async () => {
    if (!code.trim()) return;
    setCodeMsg('');
    const r = await getAssignmentByCode(code);
    if (r.ok) { setPending(r.data.assignment); setCode(''); } else setCodeMsg(r.message);
  };
  const begin = async (a: Assignment) => {
    setBusy(true);
    const r = await startAttempt(a.id);
    setBusy(false);
    if (r.ok) { setRun({assignment: r.data.assignment, attempt: r.data.attempt}); setPending(null); } else { setErr(r.message); setPending(null); load(); }
  };

  if (run) return <AssignmentRun assignment={run.assignment} attempt={run.attempt} onClose={() => { setRun(null); load(); }}/>;

  if (pending) {
    const m = pending.mine; const used = m?.attempts_used ?? 0; const dl = deadlineInfo(pending);
    const canStart = !dl.closed && (pending.max_attempts === 0 || used < pending.max_attempts || m?.in_progress);
    return <div className="space-y-3">
      <button {...btn} onClick={() => setPending(null)} className="text-xs text-blue-600 font-medium">← Kembali</button>
      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 space-y-2">
        <div className="text-lg font-bold text-gray-900">{pending.title}</div>
        <ul className="text-sm text-gray-700 space-y-1">
          <li>• {pending.total} soal · {pending.scopes.map(scopeLabel).join(', ')}</li>
          <li>• {pending.time_limit_min > 0 ? `Waktu ${pending.time_limit_min} menit (berjalan sejak dimulai)` : 'Tanpa batas waktu'}</li>
          <li>• {dl.text}</li>
          <li>• {pending.max_attempts === 0 ? 'Percobaan tanpa batas' : `Percobaan ${used}/${pending.max_attempts} terpakai`} · {scoringLabel[pending.scoring]} yang dihitung</li>
          <li>• Jawaban tersimpan di server setiap kali Anda memilih dan tidak dapat diubah; benar/salah tidak ditampilkan selama pengerjaan.</li>
        </ul>
        {m?.in_progress && <Msg kind="info">Anda punya percobaan yang belum selesai — akan dilanjutkan (waktu tetap berjalan).</Msg>}
      </div>
      <button {...btn} disabled={!canStart || busy} onClick={() => begin(pending)} className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium disabled:opacity-40">{busy ? 'Memulai…' : m?.in_progress ? 'Lanjutkan' : 'Mulai sekarang'}</button>
      {!canStart && <p className="text-xs text-rose-600 text-center">{dl.closed ? 'Tenggat sudah lewat.' : 'Batas percobaan sudah habis.'}</p>}
    </div>;
  }

  return <div className="space-y-3">
    <div className="flex gap-2">
      <input value={code} onChange={e => { setCode(e.target.value.toUpperCase()); setCodeMsg(''); }} onKeyDown={e => e.key === 'Enter' && open()} placeholder="Kode tugas, mis. TGS-AB12" maxLength={12}
        className="flex-1 px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"/>
      <button {...btn} onClick={open} className="px-4 rounded-xl bg-gray-900 text-white text-sm font-medium">Buka</button>
    </div>
    {codeMsg && <Msg kind="err">{codeMsg}</Msg>}
    {err && <Msg kind="err">{err}</Msg>}
    {list === null && !err && <p className="text-sm text-gray-400 text-center py-6">Memuat tugas…</p>}
    {list?.length === 0 && <p className="text-xs text-gray-400 text-center py-6">Belum ada tugas untuk Anda. Masukkan kode tugas dari dosen di atas.</p>}
    <div className="space-y-2">
      {list?.map(a => {
        const m = a.mine; const used = m?.attempts_used ?? 0; const dl = deadlineInfo(a);
        const exhausted = a.max_attempts > 0 && used >= a.max_attempts && !m?.in_progress;
        const label = dl.closed ? 'Tenggat lewat' : exhausted ? 'Percobaan habis' : m?.in_progress ? 'Lanjutkan' : used > 0 ? 'Coba lagi' : 'Kerjakan';
        return <div key={a.id} className="rounded-xl border border-gray-200 bg-white p-3.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0"><div className="text-sm font-semibold text-gray-900 truncate">{a.title}</div>
              <div className="text-[11px] text-gray-500">{a.total} soal · {a.time_limit_min > 0 ? `${a.time_limit_min} menit` : 'tanpa batas waktu'} · {a.scopes.map(scopeLabel).join(', ')}</div></div>
            {m?.counted_score != null && <div className="text-right shrink-0"><div className="text-lg font-bold text-gray-900 leading-none">{m.counted_score}<span className="text-xs text-gray-400">/{m.total}</span></div><div className="text-[10px] text-gray-400">nilai</div></div>}
          </div>
          <div className="text-[11px] text-gray-500 mt-1">{dl.text} · {a.max_attempts === 0 ? `${used} percobaan` : `percobaan ${used}/${a.max_attempts}`}</div>
          <button {...btn} disabled={dl.closed || exhausted} onClick={() => setPending(a)} className="mt-2 w-full py-2 rounded-lg bg-blue-600 text-white text-xs font-medium disabled:bg-gray-100 disabled:text-gray-400">{label}</button>
        </div>;
      })}
    </div>
  </div>;
}

// ═════════════════════════════ DOSEN / LABORAN ═════════════════════════════
function Field({label, hint, children}: {label: string; hint?: string; children: React.ReactNode}) {
  return <label className="block"><span className="block text-xs font-semibold text-gray-700 mb-1">{label}</span>{children}{hint && <span className="block text-[10px] text-gray-400 mt-1">{hint}</span>}</label>;
}
const inputCls = 'w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:opacity-50';

function AssignmentForm({initial, onDone, onCancel}: {initial: Assignment | null; onDone: (a: Assignment) => void; onCancel: () => void}) {
  const locked = !!initial && (initial.n_attempts ?? 0) > 0;
  const [f, setF] = useState({
    title: initial?.title ?? '', scopes: initial?.scopes ?? ['morfem'], kinds: initial?.kinds ?? [...ALL_KINDS], total: initial?.total ?? 20,
    time_limit_min: initial?.time_limit_min ?? 0, deadline: toLocalInput(initial?.deadline ?? null), max_attempts: initial?.max_attempts ?? 1,
    scoring: (initial?.scoring ?? 'best') as Scoring, shuffle: initial?.shuffle ?? 'student', allow_late: initial?.allow_late ?? false, angkatan: initial?.angkatan ?? '',
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(p => ({...p, [k]: v}));
  const toggle = (k: 'scopes' | 'kinds', v: string) => set(k, f[k].includes(v) ? f[k].filter(x => x !== v) : [...f[k], v]);

  const submit = async () => {
    setErr(''); setBusy(true);
    const body: AssignmentInput = {
      id: initial?.id, title: f.title, scopes: f.scopes, kinds: f.kinds, total: f.total, time_limit_min: f.time_limit_min,
      deadline: f.deadline ? Math.floor(new Date(f.deadline).getTime() / 1000) : null, max_attempts: f.max_attempts,
      scoring: f.scoring, shuffle: f.shuffle, allow_late: f.allow_late, angkatan: f.angkatan, active: initial?.active ?? true,
    };
    const r = await saveAssignment(body);
    setBusy(false);
    if (r.ok) onDone(r.data.assignment); else setErr(r.message);
  };

  const chip = (on: boolean) => `px-2.5 py-1 rounded-full border text-xs ${on ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600'} disabled:opacity-50`;
  return <div className="space-y-4">
    <button {...btn} onClick={onCancel} className="text-xs text-blue-600 font-medium">← Kembali</button>
    <h3 className="text-base font-semibold text-gray-900">{initial ? 'Ubah tugas' : 'Buat tugas baru'}</h3>
    {locked && <Msg kind="info">Sudah ada yang mengerjakan: materi, jenis soal, jumlah soal, dan pengacakan dikunci. Judul, tenggat, percobaan, dan pengaturan lain masih bisa diubah.</Msg>}
    <Field label="Judul tugas"><input className={inputCls} value={f.title} maxLength={120} onChange={e => set('title', e.target.value)} placeholder="mis. Kuis Terminologi Bab Pernapasan"/></Field>
    <Field label="Fokus materi (pilih satu atau lebih)" hint="“Morfem” mengambil morfem dari semua sistem; pilih nama sistem agar soal terbatas pada sistem itu.">
      <div className="flex flex-wrap gap-1.5">{SCOPE_OPTIONS.map(s => <button {...btn} key={s} disabled={locked} onClick={() => toggle('scopes', s)} className={chip(f.scopes.includes(s))}>{scopeLabel(s)}</button>)}</div>
    </Field>
    <Field label="Jenis soal">
      <div className="flex flex-wrap gap-1.5">{ALL_KINDS.map(k => <button {...btn} key={k} disabled={locked} onClick={() => toggle('kinds', k)} className={chip(f.kinds.includes(k))}>{KIND_LABEL[k]}</button>)}</div>
    </Field>
    <div className="grid grid-cols-2 gap-3">
      <Field label="Jumlah soal" hint="5–50"><input className={inputCls} type="number" min={5} max={50} disabled={locked} value={f.total} onChange={e => set('total', Number(e.target.value))}/></Field>
      <Field label="Waktu (menit)" hint="0 = tanpa batas"><input className={inputCls} type="number" min={0} max={240} value={f.time_limit_min} onChange={e => set('time_limit_min', Number(e.target.value))}/></Field>
    </div>
    <Field label="Tenggat (opsional)"><input className={inputCls} type="datetime-local" value={f.deadline} onChange={e => set('deadline', e.target.value)}/></Field>
    <div className="grid grid-cols-2 gap-3">
      <Field label="Maksimal percobaan"><select className={inputCls} value={f.max_attempts} onChange={e => set('max_attempts', Number(e.target.value))}>{[1, 2, 3, 5].map(n => <option key={n} value={n}>{n}×</option>)}<option value={0}>Tanpa batas</option></select></Field>
      <Field label="Nilai yang dipakai"><select className={inputCls} value={f.scoring} onChange={e => set('scoring', e.target.value as Scoring)}>{(Object.keys(scoringLabel) as Scoring[]).map(k => <option key={k} value={k}>{scoringLabel[k]}</option>)}</select></Field>
    </div>
    <Field label="Soal" hint="Diacak: tiap mahasiswa mendapat susunan berbeda (mengurangi menyontek). Sama: semua mendapat soal yang sama (mudah dibandingkan)."><select className={inputCls} disabled={locked} value={f.shuffle} onChange={e => set('shuffle', e.target.value as 'student' | 'shared')}><option value="student">Diacak per mahasiswa</option><option value="shared">Sama untuk semua</option></select></Field>
    <Field label="Angkatan (opsional)" hint="Kosongkan agar terbuka untuk semua yang memegang kode. Bila diisi (mis. 2024), hanya angkatan itu."><input className={inputCls} inputMode="numeric" maxLength={4} value={f.angkatan} onChange={e => set('angkatan', e.target.value.replace(/\D/g, ''))} placeholder="mis. 2024"/></Field>
    <button {...btn} onClick={() => set('allow_late', !f.allow_late)} className="flex items-center gap-2 text-sm text-gray-700"><span className={`w-4 h-4 rounded border flex items-center justify-center ${f.allow_late ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300'}`}>{f.allow_late && <Check size={12}/>}</span>Terima pengerjaan setelah tenggat (ditandai terlambat)</button>
    {err && <Msg kind="err">{err}</Msg>}
    <button {...btn} disabled={busy} onClick={submit} className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium disabled:opacity-50">{busy ? 'Menyimpan…' : initial ? 'Simpan perubahan' : 'Buat tugas'}</button>
  </div>;
}

function counted(rows: AttemptRow[], scoring: Scoring) {
  const done = rows.filter(r => r.finished_at !== null).sort((a, b) => a.started_at - b.started_at);
  if (!done.length) return null;
  if (scoring === 'first') return done[0];
  if (scoring === 'last') return done[done.length - 1];
  return done.reduce((best, r) => ((r.score ?? 0) > (best.score ?? 0) ? r : best), done[0]);
}

function AssignmentRekap({assignment, onBack}: {assignment: Assignment; onBack: () => void}) {
  const [data, setData] = useState<{assignment: Assignment; attempts: AttemptRow[]} | null | string>(null);
  const load = () => { setData(null); fetchAssignmentRekap(assignment.id).then(r => setData(r.ok ? r.data : r.message)); };
  useEffect(load, [assignment.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (data === null) return <p className="text-sm text-gray-400 text-center py-8">Memuat rekap…</p>;
  if (typeof data === 'string') return <div className="space-y-3"><button {...btn} onClick={onBack} className="text-xs text-blue-600 font-medium">← Kembali</button><Msg kind="err">{data}</Msg></div>;

  const a = data.assignment;
  const by = new Map<string, AttemptRow[]>();
  for (const r of data.attempts) by.set(r.uid, [...(by.get(r.uid) ?? []), r]);
  const rows = [...by.values()].map(rs => {
    const c = counted(rs, a.scoring); const f = rs[0];
    return {name: f.name, nim: f.nim, angkatan: f.angkatan, n: rs.length, score: c?.score ?? 0, total: a.total, finished: !!c, late: !!c?.late, overtime: !!c?.overtime, unfinished: rs.some(r => r.finished_at === null)};
  }).sort((x, y) => x.name.localeCompare(y.name));
  const fin = rows.filter(r => r.finished);
  const avg = fin.length ? Math.round(fin.reduce((t, r) => t + pctOf(r.score, r.total), 0) / fin.length) : 0;
  const hi = fin.length ? Math.max(...fin.map(r => pctOf(r.score, r.total))) : 0;
  const lo = fin.length ? Math.min(...fin.map(r => pctOf(r.score, r.total))) : 0;
  const status = (r: (typeof rows)[number]) => !r.finished ? 'belum selesai' : [r.late && 'terlambat', r.overtime && 'lewat waktu'].filter(Boolean).join(', ') || 'selesai';

  return <div className="space-y-3">
    <button {...btn} onClick={onBack} className="text-xs text-blue-600 font-medium">← Kembali ke daftar</button>
    <div><div className="text-base font-semibold text-gray-900">{a.title}</div><div className="text-[11px] text-gray-500">{a.code} · {a.total} soal · {scoringLabel[a.scoring]}</div></div>
    <div className="grid grid-cols-4 gap-2 text-center">
      {[['Peserta', rows.length], ['Rata-rata', `${avg}%`], ['Tertinggi', `${hi}%`], ['Terendah', `${lo}%`]].map(([l, v]) => <div key={l as string} className="bg-gray-50 rounded-xl py-2"><div className="text-base font-bold text-gray-900">{v}</div><div className="text-[10px] text-gray-500">{l}</div></div>)}
    </div>
    <div className="flex gap-2">
      <button {...btn} disabled={!rows.length} onClick={() => downloadCsv(`rekap-${a.code}-ringkasan.csv`, ['Nama', 'NIM', 'Angkatan', 'Percobaan', 'Skor', 'Total', 'Persen', 'Keterangan'], rows.map(r => [r.name, r.nim, r.angkatan, r.n, r.score, r.total, r.finished ? pctOf(r.score, r.total) : 0, status(r)]))} className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg bg-gray-900 text-white text-xs font-medium disabled:opacity-40"><Download size={13}/> CSV nilai</button>
      <button {...btn} disabled={!data.attempts.length} onClick={() => downloadCsv(`rekap-${a.code}-semua-percobaan.csv`, ['Nama', 'NIM', 'Angkatan', 'Mulai', 'Selesai', 'Skor', 'Total', 'Durasi (detik)', 'Terlambat', 'Lewat waktu'], data.attempts.map(r => [r.name, r.nim, r.angkatan, new Date(r.started_at * 1000).toLocaleString('id-ID'), r.finished_at ? new Date(r.finished_at * 1000).toLocaleString('id-ID') : 'belum selesai', r.score ?? '', r.total, r.duration_s ?? '', r.late ? 'ya' : '', r.overtime ? 'ya' : '']))} className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 disabled:opacity-40"><Download size={13}/> CSV semua percobaan</button>
      <button {...btn} onClick={load} className="px-2.5 rounded-lg border border-gray-200 text-gray-600" title="Muat ulang"><RotateCcw size={13}/></button>
    </div>
    {rows.length === 0 ? <p className="text-xs text-gray-400 text-center py-6">Belum ada mahasiswa yang mengerjakan.</p> : <div className="rounded-xl border border-gray-100 overflow-hidden">
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 px-3 py-1.5 bg-gray-50 text-[10px] font-bold uppercase tracking-wider text-gray-400"><span>Mahasiswa</span><span>Coba</span><span>Nilai</span></div>
      {rows.map(r => <div key={r.nim + r.name} className="grid grid-cols-[1fr_auto_auto] gap-x-3 px-3 py-2 text-xs border-t border-gray-100 items-center">
        <span className="min-w-0"><span className="block font-medium text-gray-900 truncate">{r.name}</span><span className="block text-[10px] text-gray-400">{r.nim}{r.angkatan ? ` · ${r.angkatan}` : ''}{status(r) !== 'selesai' ? ` · ${status(r)}` : ''}</span></span>
        <span className="text-gray-500 text-right">{r.n}</span><span className="font-semibold text-gray-800 text-right">{r.finished ? `${r.score}/${r.total}` : '—'}</span>
      </div>)}
    </div>}
    <p className="text-[10px] text-gray-400 leading-snug">Hanya mahasiswa yang sudah memulai yang tampil (server tidak memiliki daftar kelas). Nilai dihitung oleh server dari jawaban yang tersimpan.</p>
  </div>;
}

export function ManageAssignments() {
  const [list, setList] = useState<Assignment[] | null>(null);
  const [err, setErr] = useState('');
  const [view, setView] = useState<{k: 'list'} | {k: 'form'; a: Assignment | null} | {k: 'rekap'; a: Assignment}>({k: 'list'});
  const [created, setCreated] = useState<Assignment | null>(null);
  const [copied, setCopied] = useState('');

  const load = () => listAssignments().then(r => { if (r.ok) { setList(r.data.assignments); setErr(''); } else setErr(r.message); });
  useEffect(() => { load(); }, []);

  const copy = (code: string) => { navigator.clipboard?.writeText(code); setCopied(code); setTimeout(() => setCopied(''), 1500); };
  const toggleActive = async (a: Assignment) => { const r = await setAssignmentActive(a.id, !a.active); if (!r.ok) setErr(r.message); load(); };
  const remove = async (a: Assignment) => { if (!confirm(`Hapus tugas "${a.title}"?`)) return; const r = await deleteAssignment(a.id); if (!r.ok) setErr(r.message); load(); };

  if (view.k === 'form') return <AssignmentForm initial={view.a} onCancel={() => setView({k: 'list'})} onDone={a => { setCreated(view.a ? null : a); setView({k: 'list'}); load(); }}/>;
  if (view.k === 'rekap') return <AssignmentRekap assignment={view.a} onBack={() => { setView({k: 'list'}); load(); }}/>;

  return <div className="space-y-3">
    <button {...btn} onClick={() => { setCreated(null); setView({k: 'form', a: null}); }} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium"><Plus size={16}/> Buat tugas baru</button>
    {created && <Msg kind="ok"><div className="font-semibold mb-1">Tugas dibuat. Bagikan kode ini ke mahasiswa:</div>
      <button {...btn} onClick={() => copy(created.code)} className="inline-flex items-center gap-2 font-mono text-lg font-bold text-emerald-900">{created.code}<ClipboardCopy size={14}/>{copied === created.code && <span className="text-xs font-normal">tersalin</span>}</button></Msg>}
    {err && <Msg kind="err">{err}</Msg>}
    {list === null && !err && <p className="text-sm text-gray-400 text-center py-6">Memuat…</p>}
    {list?.length === 0 && <p className="text-xs text-gray-400 text-center py-6">Belum ada tugas. Buat tugas pertama Anda.</p>}
    {list?.map(a => {
      const dl = deadlineInfo(a);
      return <div key={a.id} className={`rounded-xl border p-3.5 ${a.active ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50'}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0"><div className="text-sm font-semibold text-gray-900 truncate">{a.title}</div>
            <div className="text-[11px] text-gray-500">{a.total} soal · {a.time_limit_min > 0 ? `${a.time_limit_min} menit` : 'tanpa batas waktu'} · {a.scopes.map(scopeLabel).join(', ')}</div></div>
          <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${a.active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>{a.active ? 'aktif' : 'ditutup'}</span>
        </div>
        <div className="text-[11px] text-gray-500 mt-1">{dl.text}{a.angkatan ? ` · angkatan ${a.angkatan}` : ''} · {a.n_students ?? 0} mahasiswa, {a.n_attempts ?? 0} percobaan</div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <button {...btn} onClick={() => copy(a.code)} className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-gray-200 font-mono text-[11px] text-gray-700 whitespace-nowrap"><ClipboardCopy size={11}/>{copied === a.code ? 'tersalin' : a.code}</button>
          <button {...btn} onClick={() => setView({k: 'rekap', a})} className="flex-1 min-w-[60px] py-1.5 rounded-lg bg-gray-900 text-white text-[11px] font-medium">Rekap</button>
          <button {...btn} onClick={() => setView({k: 'form', a})} className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-[11px] text-gray-700">Ubah</button>
          <button {...btn} onClick={() => toggleActive(a)} className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-[11px] text-gray-700">{a.active ? 'Tutup' : 'Buka'}</button>
          {(a.n_attempts ?? 0) === 0 && <button {...btn} onClick={() => remove(a)} className="px-2.5 py-1.5 rounded-lg border border-rose-200 text-[11px] text-rose-600">Hapus</button>}
        </div>
      </div>;
    })}
  </div>;
}
