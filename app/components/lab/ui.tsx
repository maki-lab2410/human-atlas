import {useEffect, useRef, useState, type MutableRefObject, type ReactNode} from 'react';
import {MORPHEME_BY_ID, SYSTEM_LABEL, TYPE_LABEL, type MorphemeType, type Status, type Term} from '../../terminology/data';
import type {Question} from '../../terminology/questions';

export const btn = {'data-slot': 'lab-button'} as const; // lolos dari reset CSS global tombol

export const TYPE_STYLE: Record<MorphemeType, string> = {
  prefix: 'bg-sky-50 text-sky-800 border-sky-200',
  root: 'bg-rose-50 text-rose-800 border-rose-200',
  cv: 'bg-gray-50 text-gray-500 border-gray-200',
  suffix: 'bg-emerald-50 text-emerald-800 border-emerald-200',
};

export const fmtDate = (t: number) => new Date(t * 1000).toLocaleString('id-ID', {day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'});
export const scopeLabel = (s: string) => ({campuran: 'Campuran', morfem: 'Morfem', singkatan: 'Singkatan RMIK'} as Record<string, string>)[s] ?? SYSTEM_LABEL[s] ?? s;

const csvCell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
export function downloadCsv(name: string, header: string[], rows: (string | number)[][]) {
  const text = '\ufeff' + [header, ...rows].map(r => r.map(csvCell).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], {type: 'text/csv;charset=utf-8'}));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

export function StatusChip({status, compact}: {status: Status; compact?: boolean}) {
  if (status === 'valid') return compact ? null : <span className="px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-semibold">divalidasi</span>;
  const label = status === 'revisi' ? 'perlu revisi' : 'belum divalidasi';
  return compact
    ? <span title={label} className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"/>
    : <span className="px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-semibold">{label}</span>;
}

export function MorphChips({term, showMeaning = true}: {term: Term; showMeaning?: boolean}) {
  return <div className="flex flex-wrap items-start gap-1.5">
    {term.parts.map((x, i) => {
      const m = MORPHEME_BY_ID[x.m];
      return <div key={i} className="flex flex-col items-center gap-1">
        <span className={`px-2.5 py-1.5 rounded-lg border font-mono text-lg font-semibold ${TYPE_STYLE[m.type]}`}>{x.t}</span>
        {showMeaning && <span className="text-[10px] text-gray-500 text-center max-w-[96px] leading-tight">{m.type === 'cv' ? 'penghubung' : m.meaning.split(' (')[0]}</span>}
      </div>;
    })}
  </div>;
}

export function Legend() {
  return <div className="flex flex-wrap gap-1.5 text-[10px]">
    {(Object.keys(TYPE_LABEL) as MorphemeType[]).map(t => <span key={t} className={`px-2 py-0.5 rounded-full border ${TYPE_STYLE[t]}`}>{TYPE_LABEL[t]}</span>)}
  </div>;
}

export function Chips<T extends string>({items, value, onChange, label}: {items: T[]; value: T; onChange: (v: T) => void; label: (v: T) => string}) {
  return <div className="flex flex-wrap gap-1.5 text-xs">
    {items.map(c => <button {...btn} key={c} onClick={() => onChange(c)} className={`px-3 py-1 rounded-full border ${value === c ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600'}`}>{label(c)}</button>)}
  </div>;
}

export function Choice({label, state, onClick}: {label: string; state: 'idle' | 'right' | 'wrong' | 'dim' | 'picked'; onClick: () => void}) {
  const cls = {picked: 'bg-blue-50 border-blue-400 text-blue-900', idle: 'bg-white border-gray-200 hover:border-blue-400 hover:bg-blue-50/40', right: 'bg-emerald-50 border-emerald-400 text-emerald-900', wrong: 'bg-rose-50 border-rose-400 text-rose-900', dim: 'bg-white border-gray-100 text-gray-400'}[state];
  return <button {...btn} onClick={() => { if (state === 'idle') onClick(); }} aria-disabled={state !== 'idle'} className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-colors ${cls}`}>{label}</button>;
}


// ─── Pengerjaan soal berurutan (dipakai Kuis latihan dan Tugas) ────────────────
export interface RunController { finish: () => void; }
export function RunQuestions({questions, onAnswered, onFinish, storageKey, header, ctrl, feedback = true, startIndex, onChoose}: {
  questions: Question[];
  onAnswered?: (ok: boolean, q: Question) => void;
  onFinish: (score: number, wrong: string[]) => void;
  /** bila diisi, kemajuan disimpan agar dapat dilanjutkan setelah halaman dimuat ulang */
  storageKey?: string;
  header?: ReactNode;
  ctrl?: MutableRefObject<RunController | null>;
  /** false = mode ujian: tidak menampilkan benar/salah dan pembahasan per soal */
  feedback?: boolean;
  /** mode tugas (dinilai server): mulai dari nomor ini (soal sebelumnya sudah dijawab) */
  startIndex?: number;
  /** mode tugas: simpan pilihan ke server; true = tersimpan. Tombol lanjut aktif setelah tersimpan. */
  onChoose?: (choice: number, index: number) => Promise<boolean>;
}) {
  const restore = () => { try { const j = storageKey ? JSON.parse(localStorage.getItem(storageKey) || 'null') : null; return j && j.i <= questions.length ? j as {i: number; score: number; wrong: string[]} : null; } catch { return null; } };
  const init = useRef(restore());
  const [i, setI] = useState(startIndex ?? init.current?.i ?? 0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [save, setSave] = useState<'idle' | 'saving' | 'ok' | 'fail'>('idle');
  const score = useRef(init.current?.score ?? 0);
  const wrong = useRef<string[]>(init.current?.wrong ?? []);
  const done = useRef(false);
  const N = questions.length;

  const finish = () => { if (done.current) return; done.current = true; if (storageKey) localStorage.removeItem(storageKey); onFinish(score.current, wrong.current); };
  useEffect(() => { if (ctrl) ctrl.current = {finish}; return () => { if (ctrl) ctrl.current = null; }; }); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (i >= N) finish(); }, [i]); // eslint-disable-line react-hooks/exhaustive-deps

  if (i >= N) return null;
  const q = questions[i];
  const persist = async (k: number) => {
    setSave('saving');
    const saved = await onChoose!(k, i);
    setSave(saved ? 'ok' : 'fail');
  };
  const answer = (k: number) => {
    if (chosen !== null) return;
    setChosen(k);
    if (onChoose) { persist(k); return; }
    const ok = k === q.answer;
    if (ok) score.current += 1; else wrong.current.push(q.term?.id ?? q.ids[0]);
    onAnswered?.(ok, q);
  };
  const next = () => {
    const ni = i + 1;
    if (storageKey && ni < N) localStorage.setItem(storageKey, JSON.stringify({i: ni, score: score.current, wrong: wrong.current}));
    setChosen(null); setSave('idle'); setI(ni);
  };
  return <div className="space-y-4">
    {header}
    <div className="flex items-center gap-2"><div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-blue-500 transition-all" style={{width: `${(i / N) * 100}%`}}/></div><span className="text-[11px] text-gray-400">{i + 1}/{N}</span></div>
    <div>
      <p className="text-sm text-gray-600 mb-2">{q.prompt}</p>
      {q.term && q.kind === 'partType'
        ? <div className="flex flex-wrap gap-0.5 font-mono text-2xl font-bold">{q.term.parts.map((x, k) => <span key={k} className={(q.hl !== undefined ? k === q.hl : x.t === q.focus) ? 'px-1 rounded bg-amber-100 text-amber-900 ring-2 ring-amber-300' : 'text-gray-300'}>{x.t}</span>)}</div>
        : <div className={`${q.focus && q.focus.length > 40 ? 'text-base' : 'text-2xl font-mono'} font-bold text-gray-900`}>{q.focus}</div>}
      {q.hint && <div className="text-[11px] text-gray-400 mt-1">{q.hint}</div>}
    </div>
    <div className="space-y-2">{q.options.map((o, k) => <Choice key={k} label={o} onClick={() => answer(k)} state={chosen === null ? 'idle' : !feedback ? (k === chosen ? 'picked' : 'dim') : k === q.answer ? 'right' : k === chosen ? 'wrong' : 'dim'}/>)}</div>
    {chosen !== null && !feedback && <div className="space-y-2">
      {save === 'saving' && <p className="text-xs text-gray-400 text-center">Menyimpan jawaban…</p>}
      {save === 'fail' && <div className="text-xs rounded-xl border border-rose-100 bg-rose-50 text-rose-700 px-3 py-2 flex items-center justify-between gap-2"><span>Jawaban belum tersimpan di server.</span><button {...btn} onClick={() => persist(chosen)} className="px-2.5 py-1 rounded-lg bg-rose-600 text-white">Coba lagi</button></div>}
      <button {...btn} disabled={onChoose ? save !== 'ok' : false} onClick={next} className="w-full py-2 rounded-lg bg-gray-900 text-white text-sm font-medium disabled:opacity-40">{i + 1 === N ? 'Selesai & kirim' : 'Soal berikutnya'}</button>
    </div>}
    {chosen !== null && feedback && <div className={`rounded-xl p-3 text-sm ${chosen === q.answer ? 'bg-emerald-50 text-emerald-900' : 'bg-rose-50 text-rose-900'}`}>
      <div className="font-semibold mb-1">{chosen === q.answer ? '✓ Benar!' : '✗ Kurang tepat'}</div>
      <p className="text-[13px] leading-relaxed">{q.explain}</p>
      {q.term && <div className="mt-3"><MorphChips term={q.term}/></div>}
      <button {...btn} onClick={next} className="mt-3 w-full py-2 rounded-lg bg-gray-900 text-white text-sm font-medium">{i + 1 === N ? 'Lihat hasil' : 'Soal berikutnya'}</button>
    </div>}
  </div>;
}
