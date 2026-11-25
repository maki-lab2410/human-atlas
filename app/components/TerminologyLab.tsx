import {useEffect, useMemo, useRef, useState} from 'react';
import {BookOpen, ChevronLeft, ClipboardList, Crosshair, Eye, Layers, Lightbulb, ListChecks, LogIn, LogOut, Check, Puzzle, RotateCcw, SkipForward, Settings2, Trophy, X} from 'lucide-react';
import {fetchMe, loadProgress, loginUrl, logout as labLogout, saveProgress, type LabUser} from '../lib/labAuth';
import type {Atlas} from '../anatomy';
import type {MedicalDb} from './DataManager';
import {
  ABBREVIATIONS, CATEGORY_LABEL, MORPHEMES, MORPHEME_BY_ID, SYSTEMS, SYSTEM_LABEL, TERMS, TYPE_LABEL,
  baseWord, displayWord, literalMeaning, totalItems, unvalidatedCount,
  type Abbreviation, type Category, type Morpheme, type MorphemeType, type Term,
} from '../terminology/data';
import {makeQuestion, pick, sample, shuffle, type Question, type Scope} from '../terminology/questions';
import {btn, Chips, Legend, MorphChips, RunQuestions, StatusChip, TYPE_STYLE} from './lab/ui';
import {ManageAssignments, StudentAssignments} from './lab/Assignments';

// ─────────────────────────────── progres (localStorage + sinkron server bila login)
const STORE = 'termLab.v2';
interface Progress { answered: number; correct: number; streak: number; best: number; items: Record<string, [number, number]>; ts?: number; owner?: string; }
const EMPTY: Progress = {answered: 0, correct: 0, streak: 0, best: 0, items: {}};

function useProgress(ownerKey: string | null) {
  const loggedIn = !!ownerKey;
  const [prog, setProg] = useState<Progress>(() => {
    try { return {...EMPTY, ...JSON.parse(localStorage.getItem(STORE) || '{}')}; } catch { return EMPTY; }
  });
  const synced = useRef(false), dirty = useRef(false), latest = useRef(prog);
  latest.current = prog;
  useEffect(() => { localStorage.setItem(STORE, JSON.stringify(prog)); }, [prog]);

  // Saat login: ambil progres server; pakai yang lebih baru (server atau lokal)
  useEffect(() => {
    synced.current = false;
    if (!loggedIn) return;
    let off = false;
    loadProgress<Progress>().then(r => {
      if (off || !r) return;
      const local = latest.current;
      // Progres lokal milik akun lain (komputer bersama) tidak boleh bercampur dengan akun ini
      const foreign = !!local.owner && local.owner !== ownerKey;
      if (r.progress && (foreign || r.updated_at * 1000 > (local.ts ?? 0))) setProg({...EMPTY, ...r.progress, ts: r.updated_at * 1000, owner: ownerKey!});
      else if (foreign) setProg({...EMPTY, owner: ownerKey!});
      else if (local.answered > 0) { const mine = {...local, owner: ownerKey!}; setProg(mine); saveProgress(mine); }
      else setProg(p => ({...p, owner: ownerKey!}));
      synced.current = true;
    });
    return () => { off = true; };
  }, [ownerKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Simpan ke server (ditunda) setelah ada perubahan
  useEffect(() => {
    if (!loggedIn || !synced.current || !dirty.current) return;
    const t = setTimeout(() => { saveProgress(prog); dirty.current = false; }, 1500);
    return () => clearTimeout(t);
  }, [prog, loggedIn]);

  /** ids: id morfem, atau "ab:<id singkatan>" untuk singkatan */
  const record = (ok: boolean, ids: string[]) => { dirty.current = true; setProg(p => {
    const items = {...p.items};
    for (const id of new Set(ids.filter(m => m !== 'o' && m !== 'i' && m !== 'e'))) {
      const [s, c] = items[id] ?? [0, 0];
      items[id] = [s + 1, c + (ok ? 1 : 0)];
    }
    const streak = ok ? p.streak + 1 : 0;
    return {answered: p.answered + 1, correct: p.correct + (ok ? 1 : 0), streak, best: Math.max(p.best, streak), items, ts: Date.now(), owner: ownerKey ?? p.owner};
  }); };
  const reset = () => { dirty.current = true; setProg({...EMPTY, ts: Date.now(), owner: ownerKey ?? undefined}); };
  /** Sebelum keluar: kirim perubahan tertunda ke server lalu kosongkan data lokal (aman untuk komputer bersama). */
  const flushAndClear = async () => {
    if (loggedIn && synced.current && dirty.current) await saveProgress(latest.current);
    dirty.current = false; synced.current = false; setProg(EMPTY);
  };
  const isMastered = ([s, c]: [number, number]) => c >= 2 && c / s >= 0.7;
  const mastered = Object.entries(prog.items).filter(([id, v]) => MORPHEME_BY_ID[id] && isMastered(v)).length;
  const masteredAbbr = Object.entries(prog.items).filter(([id, v]) => id.startsWith('ab:') && isMastered(v)).length;
  return {prog, record, reset, flushAndClear, mastered, masteredAbbr};
}

// ─────────────────────────────── Tab: Belajar
type LearnMode = 'terms' | 'morphemes' | 'abbr';
function LearnTab({onShow, goTerm, setGoTerm}: {onShow: (t: Term) => void; goTerm: Term | null; setGoTerm: (t: Term | null) => void}) {
  const [mode, setMode] = useState<LearnMode>('terms');
  const [q, setQ] = useState('');
  const [sys, setSys] = useState<string>('semua');
  const [cat, setCat] = useState<Category | 'semua'>('semua');
  const [mType, setMType] = useState<MorphemeType | 'all'>('all');
  const [aCat, setACat] = useState<string>('semua');
  const [openM, setOpenM] = useState<string | null>(null);
  const sel = goTerm;
  const ql = q.toLowerCase();

  const cats = useMemo(() => ['semua', ...Array.from(new Set(TERMS.map(t => t.category)))] as (Category | 'semua')[], []);
  const aCats = useMemo(() => ['semua', ...Array.from(new Set(ABBREVIATIONS.map(a => a.category)))], []);
  const terms = TERMS.filter(t => (sys === 'semua' || t.system === sys) && (cat === 'semua' || t.category === cat) && (!q || (t.term + t.indonesian).toLowerCase().includes(ql)));
  const morphs = MORPHEMES.filter(m => m.type !== 'cv' && (mType === 'all' || m.type === mType) && (!q || (m.form + m.meaning).toLowerCase().includes(ql)));
  const abbrs = ABBREVIATIONS.filter(a => (aCat === 'semua' || a.category === aCat) && (!q || (a.abbr + a.full + a.meaning).toLowerCase().includes(ql)));

  if (sel) return <div className="space-y-4">
    <button {...btn} onClick={() => setGoTerm(null)} className="flex items-center gap-1 text-xs text-blue-600 font-medium"><ChevronLeft size={14}/> Kembali ke daftar</button>
    <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 space-y-4">
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">{CATEGORY_LABEL[sel.category]} · {SYSTEM_LABEL[sel.system] ?? sel.system}</span>
          <StatusChip status={sel.status}/>
        </div>
        <div className="text-2xl font-bold text-gray-900">{displayWord(sel)}</div>
        <div className="text-sm text-gray-500">🇮🇩 {sel.indonesian}</div>
      </div>
      <MorphChips term={sel}/>
      <div className="text-sm"><span className="text-gray-400">Arti harfiah: </span><span className="text-gray-800 font-medium">{literalMeaning(sel)}</span></div>
      <p className="text-sm text-gray-700 leading-relaxed">{sel.definition}</p>
      <div className="space-y-1.5">
        {sel.parts.filter(x => MORPHEME_BY_ID[x.m].type !== 'cv').map((x, i) => { const m = MORPHEME_BY_ID[x.m]; return <div key={i} className="flex gap-2 text-xs"><span className={`shrink-0 px-1.5 rounded border font-mono ${TYPE_STYLE[m.type]}`}>{m.form}</span><span className="text-gray-600">{TYPE_LABEL[m.type]} · {m.meaning}{m.origin ? ` · ${m.origin}` : ''}</span></div>; })}
      </div>
      {sel.conceptId && <button {...btn} onClick={() => onShow(sel)} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"><Eye size={16}/> Lihat di model 3D</button>}
    </div>
  </div>;

  const modeLabel: Record<LearnMode, string> = {terms: `Istilah (${TERMS.length})`, morphemes: `Morfem (${MORPHEMES.filter(m => m.type !== 'cv').length})`, abbr: `Singkatan (${ABBREVIATIONS.length})`};
  return <div className="space-y-3">
    <div className="flex gap-1 p-1 bg-gray-100 rounded-xl text-xs font-medium">
      {(['terms', 'morphemes', 'abbr'] as const).map(m => <button {...btn} key={m} onClick={() => setMode(m)} className={`flex-1 py-1.5 rounded-lg ${mode === m ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>{modeLabel[m]}</button>)}
    </div>
    <input value={q} onChange={e => setQ(e.target.value)} placeholder={mode === 'terms' ? 'Cari istilah, mis. cardi, flebitis…' : mode === 'morphemes' ? 'Cari morfem atau arti…' : 'Cari singkatan atau kepanjangan…'} className="w-full px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"/>
    {mode === 'terms' && <>
      <Chips items={['semua', ...SYSTEMS]} value={sys} onChange={setSys} label={v => v === 'semua' ? 'Semua sistem' : SYSTEM_LABEL[v] ?? v}/>
      <Chips items={cats} value={cat} onChange={setCat} label={v => v === 'semua' ? 'Semua jenis' : CATEGORY_LABEL[v]}/>
      <div className="text-[11px] text-gray-400">{terms.length} istilah</div>
      <div className="space-y-1">
        {terms.map(t => <button {...btn} key={t.id} onClick={() => setGoTerm(t)} className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-gray-50 border border-transparent hover:border-gray-100 flex items-center justify-between gap-2">
          <span className="font-mono text-sm flex items-center gap-1.5 min-w-0"><span className="truncate">{t.parts.map((x, i) => <span key={i} className={MORPHEME_BY_ID[x.m].type === 'prefix' ? 'text-sky-700' : MORPHEME_BY_ID[x.m].type === 'root' ? 'text-rose-700' : MORPHEME_BY_ID[x.m].type === 'suffix' ? 'text-emerald-700' : 'text-gray-400'}>{x.t}</span>)}<span className="text-gray-400">{t.term.slice(baseWord(t).length)}</span></span><StatusChip status={t.status} compact/></span>
          <span className="text-[11px] text-gray-400 truncate shrink-0 max-w-[40%]">{t.indonesian}</span>
        </button>)}
        {terms.length === 0 && <p className="text-xs text-gray-400 text-center py-6">Tidak ada istilah yang cocok.</p>}
      </div>
    </>}
    {mode === 'morphemes' && <>
      <Chips items={['all', 'prefix', 'root', 'suffix'] as (MorphemeType | 'all')[]} value={mType} onChange={setMType} label={v => v === 'all' ? 'Semua' : TYPE_LABEL[v]}/>
      <div className="text-[11px] text-gray-400">{morphs.length} morfem</div>
      <div className="space-y-1">
        {morphs.map((m: Morpheme) => {
          const used = TERMS.filter(t => t.parts.some(x => x.m === m.id));
          return <div key={m.id} className="rounded-xl border border-gray-100">
            <button {...btn} onClick={() => setOpenM(openM === m.id ? null : m.id)} className="w-full text-left px-3 py-2.5 flex items-center gap-3">
              <span className={`shrink-0 px-2 py-0.5 rounded-md border font-mono text-sm ${TYPE_STYLE[m.type]}`}>{m.form}</span>
              <span className="text-sm text-gray-700 flex-1">{m.meaning}</span>
              <StatusChip status={m.status} compact/>
              <span className="text-[10px] text-gray-400">{used.length}×</span>
            </button>
            {openM === m.id && <div className="px-3 pb-3 flex flex-wrap gap-1.5">
              {used.map(t => <button {...btn} key={t.id} onClick={() => setGoTerm(t)} className="px-2 py-1 text-xs rounded-lg bg-gray-50 border border-gray-200 hover:border-blue-400">{baseWord(t)}</button>)}
              {used.length === 0 && <span className="text-xs text-gray-400">Belum ada contoh istilah.</span>}
            </div>}
          </div>;
        })}
      </div>
    </>}
    {mode === 'abbr' && <>
      <Chips items={aCats} value={aCat} onChange={setACat} label={v => v === 'semua' ? 'Semua' : v}/>
      <div className="text-[11px] text-gray-400">{abbrs.length} singkatan</div>
      <div className="space-y-1">
        {abbrs.map((a: Abbreviation) => <div key={a.id} className="rounded-xl border border-gray-100 px-3 py-2.5">
          <div className="flex items-center gap-2"><span className="font-mono font-bold text-gray-900">{a.abbr}</span><StatusChip status={a.status} compact/><span className="text-[10px] text-gray-400 ml-auto">{a.category}</span></div>
          <div className="text-sm text-gray-800">{a.full}</div>
          <div className="text-xs text-gray-500 leading-snug">{a.meaning}</div>
        </div>)}
      </div>
    </>}
  </div>;
}

// ─────────────────────────────── Tab: Kuis pilihan ganda (latihan mandiri)
const SESSION = 10;
export type AuthState = {available: boolean; user: LabUser | null; loading: boolean};

function QuizTab({record}: {record: (ok: boolean, ids: string[]) => void}) {
  const [scope, setScope] = useState<Scope | null>(null);
  const [qs, setQs] = useState<Question[]>([]);
  const [run, setRun] = useState(0);
  const [result, setResult] = useState<number | null>(null);

  const start = (s: Scope) => { setScope(s); setQs(Array.from({length: SESSION}, () => makeQuestion(s))); setResult(null); setRun(r => r + 1); };

  if (!scope) {
    const opts: {id: Scope; title: string; desc: string}[] = [
      {id: 'campuran', title: 'Campuran', desc: 'Morfem, istilah, rekam medis, dan singkatan'},
      {id: 'morfem', title: 'Morfem saja', desc: 'Arti prefiks, akar kata, sufiks; benar/salah'},
      {id: 'singkatan', title: 'Singkatan RMIK', desc: 'Singkatan klinis, lab, resep, dan statistik RS'},
      ...SYSTEMS.map(s => ({id: s as Scope, title: SYSTEM_LABEL[s] ?? s, desc: `${TERMS.filter(t => t.system === s).length} istilah sistem ini`})),
    ];
    return <div className="space-y-3">
      <p className="text-sm text-gray-600">Latihan mandiri — pilih fokus (10 soal per sesi):</p>
      {opts.map(o => <button {...btn} key={o.id} onClick={() => start(o.id)} className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 bg-white hover:border-blue-400 hover:bg-blue-50/40">
        <div className="text-sm font-semibold text-gray-900">{o.title}</div><div className="text-xs text-gray-500">{o.desc}</div>
      </button>)}
    </div>;
  }

  if (result !== null) return <div className="text-center space-y-4 py-6">
    <Trophy size={40} className="mx-auto text-amber-500"/>
    <div className="text-3xl font-bold text-gray-900">{result} / {SESSION}</div>
    <p className="text-sm text-gray-500">{result >= 8 ? 'Luar biasa! Materi ini sudah dikuasai.' : result >= 5 ? 'Bagus, ulangi sekali lagi untuk memantapkan.' : 'Coba pelajari dulu di tab Belajar, lalu ulangi.'}</p>
    <div className="flex gap-2 justify-center">
      <button {...btn} onClick={() => start(scope)} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium"><RotateCcw size={15}/> Ulangi</button>
      <button {...btn} onClick={() => setScope(null)} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700"><Layers size={15}/> Ganti fokus</button>
    </div>
  </div>;

  return <RunQuestions key={run} questions={qs} onAnswered={(ok, q) => record(ok, q.ids)} onFinish={sc => setResult(sc)}/>;
}

// ─────────────────────────────── Tab: Jodohkan
interface Pair { id: string; left: string; right: string; ids: string[]; }
function makePairs(): {title: string; pairs: Pair[]} {
  if (Math.random() < 0.65) {
    const ms = sample(MORPHEMES.filter(m => m.type !== 'cv'), 12);
    const uniq: Morpheme[] = [];
    for (const m of ms) if (!uniq.some(u => u.meaning === m.meaning)) uniq.push(m);
    return {title: 'Jodohkan morfem dengan artinya', pairs: uniq.slice(0, 5).map(m => ({id: m.id, left: m.form, right: m.meaning.split(' (')[0], ids: [m.id]}))};
  }
  const as = sample(ABBREVIATIONS, 12);
  const uniq: Abbreviation[] = [];
  for (const a of as) if (!uniq.some(u => u.abbr === a.abbr || u.full === a.full)) uniq.push(a);
  return {title: 'Jodohkan singkatan dengan kepanjangannya', pairs: uniq.slice(0, 5).map(a => ({id: a.id, left: a.abbr, right: a.full, ids: ['ab:' + a.id]}))};
}
function MatchTab({record}: {record: (ok: boolean, ids: string[]) => void}) {
  const [round, setRound] = useState(makePairs);
  const rights = useMemo(() => shuffle(round.pairs.map(p => p.id)), [round]);
  const [selL, setSelL] = useState<string | null>(null);
  const [done, setDone] = useState<string[]>([]);
  const [wrong, setWrong] = useState<{l: string; r: string} | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const finished = done.length === round.pairs.length;

  const clickR = (rid: string) => {
    if (!selL || done.includes(rid)) return;
    const pair = round.pairs.find(p => p.id === selL)!;
    if (selL === rid) { setDone([...done, rid]); setSelL(null); record(true, pair.ids); }
    else { setWrong({l: selL, r: rid}); setMistakes(m => m + 1); record(false, pair.ids); setTimeout(() => setWrong(null), 600); setSelL(null); }
  };
  const next = () => { setRound(makePairs()); setSelL(null); setDone([]); setWrong(null); setMistakes(0); };

  return <div className="space-y-4">
    <p className="text-sm text-gray-600">{round.title}. Ketuk sisi kiri, lalu pasangannya di sisi kanan.</p>
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-2">{round.pairs.map(p => <button {...btn} key={p.id} disabled={done.includes(p.id)} onClick={() => setSelL(p.id)}
        className={`w-full px-3 py-3 rounded-xl border font-mono text-sm font-semibold ${done.includes(p.id) ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : wrong?.l === p.id ? 'bg-rose-50 border-rose-400' : selL === p.id ? 'bg-blue-50 border-blue-500 text-blue-800' : 'bg-white border-gray-200'}`}>{p.left}</button>)}</div>
      <div className="space-y-2">{rights.map(rid => { const p = round.pairs.find(x => x.id === rid)!; return <button {...btn} key={rid} disabled={done.includes(rid)} onClick={() => clickR(rid)}
        className={`w-full px-3 py-3 rounded-xl border text-xs leading-snug text-left ${done.includes(rid) ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : wrong?.r === rid ? 'bg-rose-50 border-rose-400' : 'bg-white border-gray-200 hover:border-blue-400'}`}>{p.right}</button>; })}</div>
    </div>
    {finished && <div className="rounded-xl bg-emerald-50 text-emerald-900 p-3 text-sm text-center">
      <div className="font-semibold">{mistakes === 0 ? '✓ Sempurna tanpa salah!' : `Selesai dengan ${mistakes} kesalahan`}</div>
      <button {...btn} onClick={next} className="mt-2 w-full py-2 rounded-lg bg-gray-900 text-white text-sm font-medium">Ronde berikutnya</button>
    </div>}
    {!finished && <button {...btn} onClick={next} className="w-full text-[11px] text-gray-400 hover:text-gray-600">Ganti soal</button>}
  </div>;
}

// ─────────────────────────────── Tab: Rakit istilah
function BuildTab({record}: {record: (ok: boolean, ids: string[]) => void}) {
  const make = () => {
    const t = pick(TERMS.filter(x => x.parts.length >= 2 && x.category !== 'anatomi' || x.parts.length >= 3));
    const own = new Set(t.parts.map(x => x.t));
    const distract = sample([...new Set(TERMS.flatMap(x => x.parts.map(y => y.t)))].filter(s => !own.has(s)), 3);
    return {t, tiles: shuffle([...t.parts.map(x => x.t), ...distract]).map((s, k) => ({s, k}))};
  };
  const [round, setRound] = useState(make);
  const [picked, setPicked] = useState<number[]>([]);
  const [result, setResult] = useState<null | boolean>(null);
  const [hint, setHint] = useState(false);
  const built = picked.map(k => round.tiles[k].s).join('');

  const check = () => { const ok = built === baseWord(round.t); setResult(ok); record(ok, round.t.parts.map(x => x.m)); };
  const next = () => { setRound(make()); setPicked([]); setResult(null); setHint(false); };

  return <div className="space-y-4">
    <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4">
      <div className="text-[10px] uppercase tracking-wider text-gray-400 font-bold mb-1">Susun istilah untuk</div>
      <p className="text-base font-semibold text-gray-900 leading-snug">{round.t.definition}</p>
      {hint && <p className="text-xs text-gray-500 mt-2">Petunjuk: {literalMeaning(round.t)}</p>}
    </div>
    <div className={`min-h-[56px] flex flex-wrap items-center gap-1.5 p-3 rounded-xl border-2 border-dashed ${result === null ? 'border-gray-200' : result ? 'border-emerald-400 bg-emerald-50' : 'border-rose-400 bg-rose-50'}`}>
      {picked.length === 0 && <span className="text-xs text-gray-400">Ketuk potongan kata di bawah sesuai urutan…</span>}
      {picked.map((k, idx) => <button {...btn} key={idx} onClick={() => { if (result === null) setPicked(picked.filter((_, j) => j !== idx)); }} className="px-2.5 py-1.5 rounded-lg bg-white border border-gray-300 font-mono font-semibold">{round.tiles[k].s}</button>)}
    </div>
    <div className="flex flex-wrap gap-2">
      {round.tiles.map(({s, k}) => <button {...btn} key={k} disabled={picked.includes(k) || result !== null} onClick={() => setPicked([...picked, k])} className="px-3 py-2 rounded-lg border border-gray-200 bg-white font-mono font-semibold text-gray-800 hover:border-blue-400 disabled:opacity-25">{s}</button>)}
    </div>
    {result === null ? <div className="flex gap-2">
      <button {...btn} onClick={() => setHint(true)} disabled={hint} className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 disabled:opacity-40"><Lightbulb size={15}/> Petunjuk</button>
      <button {...btn} onClick={check} disabled={picked.length === 0} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium disabled:opacity-40"><Check size={16}/> Periksa</button>
    </div> : <div className={`rounded-xl p-3 text-sm ${result ? 'bg-emerald-50 text-emerald-900' : 'bg-rose-50 text-rose-900'}`}>
      <div className="font-semibold mb-2">{result ? '✓ Tepat!' : `✗ Jawaban: ${baseWord(round.t)}`}</div>
      <MorphChips term={round.t}/>
      <p className="text-xs mt-2 opacity-80">🇮🇩 {round.t.indonesian}</p>
      <button {...btn} onClick={next} className="mt-3 w-full py-2 rounded-lg bg-gray-900 text-white text-sm font-medium">Istilah berikutnya</button>
    </div>}
  </div>;
}

// ─────────────────────────────── Tab: Kuis 3D (temukan di model)
function FindTab({atlas, db, lastPick, onShow, onNext, record}: {atlas: Atlas; db: MedicalDb; lastPick: {partId: string; n: number} | null; onShow: (t: Term) => void; onNext: () => void; record: (ok: boolean, ids: string[]) => void}) {
  const pool = useMemo(() => TERMS.filter(t => t.quiz3d && t.conceptId), []);
  const elements = useMemo(() => new Map(atlas.concepts.map(c => [c.id, new Set(c.elements)])), [atlas]);
  const parts = useMemo(() => new Map(atlas.parts.map(p => [p.id, p])), [atlas]);
  const [target, setTarget] = useState<Term>(() => pick(pool));
  const [status, setStatus] = useState<'ask' | 'right' | 'revealed'>('ask');
  const [wrong, setWrong] = useState<string | null>(null);
  const [hint, setHint] = useState(false);
  const [startN] = useState(() => lastPick?.n ?? 0);

  useEffect(() => {
    if (!lastPick || lastPick.n <= startN || status !== 'ask') return;
    const ok = elements.get(target.conceptId!)?.has(lastPick.partId);
    if (ok) { setStatus('right'); setWrong(null); record(true, target.parts.map(x => x.m)); onShow(target); }
    else { const p = parts.get(lastPick.partId); setWrong(p ? (db[p.conceptId]?.indonesianName || p.name) : 'struktur lain'); }
  }, [lastPick]); // eslint-disable-line react-hooks/exhaustive-deps

  const next = () => { const wasShown = status !== 'ask'; setTarget(pick(pool.filter(t => t.id !== target.id))); setStatus('ask'); setWrong(null); setHint(false); if (wasShown) onNext(); };
  const reveal = () => { setStatus('revealed'); record(false, target.parts.map(x => x.m)); onShow(target); };

  return <div className="space-y-3">
    <div>
      <div className="text-[10px] uppercase tracking-wider text-gray-400 font-bold flex items-center gap-1"><Crosshair size={12}/> Klik struktur ini pada model 3D</div>
      <div className="text-xl font-bold text-gray-900 font-mono mt-0.5">{displayWord(target)}</div>
    </div>
    {(hint || status !== 'ask') && <MorphChips term={target}/>}
    {status === 'ask' && wrong && <div className="text-xs bg-rose-50 text-rose-800 rounded-lg px-3 py-2">✗ Itu adalah <b>{wrong}</b>. Coba lagi — perhatikan arti morfemnya.</div>}
    {status === 'right' && <div className="text-xs bg-emerald-50 text-emerald-800 rounded-lg px-3 py-2">✓ Benar! {target.definition}</div>}
    {status === 'revealed' && <div className="text-xs bg-amber-50 text-amber-800 rounded-lg px-3 py-2">Struktur yang dimaksud kini disorot. {target.definition}</div>}
    {status === 'ask' ? <div className="grid grid-cols-3 gap-2">
      <button {...btn} onClick={() => setHint(true)} disabled={hint} className="flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-xs font-medium text-gray-700 whitespace-nowrap disabled:opacity-40"><Lightbulb size={14}/> Bedah kata</button>
      <button {...btn} onClick={reveal} className="flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-xs font-medium text-gray-700 whitespace-nowrap"><Eye size={14}/> Tunjukkan</button>
      <button {...btn} onClick={next} className="flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-xs font-medium text-gray-700 whitespace-nowrap"><SkipForward size={14}/> Lewati</button>
    </div> : <button {...btn} onClick={next} className="w-full py-2 rounded-lg bg-gray-900 text-white text-sm font-medium">Struktur berikutnya</button>}
  </div>;
}

// ─────────────────────────────── Panel utama
type Tab = 'learn' | 'quiz' | 'tugas' | 'match' | 'build' | 'find' | 'kelola';
const BASE_TABS: {id: Tab; label: string; icon: typeof BookOpen}[] = [
  {id: 'learn', label: 'Belajar', icon: BookOpen},
  {id: 'quiz', label: 'Kuis', icon: ListChecks},
  {id: 'match', label: 'Jodoh', icon: Layers},
  {id: 'build', label: 'Rakit', icon: Puzzle},
  {id: 'find', label: 'Kuis 3D', icon: Crosshair},
];
const TUGAS_TAB = {id: 'tugas' as Tab, label: 'Tugas', icon: ClipboardList};
const KELOLA_TAB = {id: 'kelola' as Tab, label: 'Kelola', icon: Settings2};

export interface TerminologyLabProps {
  atlas: Atlas;
  db: MedicalDb;
  lastPick: {partId: string; n: number} | null;
  /** Sorot struktur di model 3D */
  onShowConcept: (conceptId: string, isolate: boolean) => void;
  /** Siapkan model untuk Kuis 3D (tampilkan sistem kardiovaskular) */
  onPrepare3D: () => void;
  onClose: () => void;
}

export default function TerminologyLab({atlas, db, lastPick, onShowConcept, onPrepare3D, onClose}: TerminologyLabProps) {
  const [tab, setTab] = useState<Tab>('learn');
  const [goTerm, setGoTerm] = useState<Term | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [auth, setAuth] = useState<AuthState>({available: false, user: null, loading: true});
  const [labNote, setLabNote] = useState('');
  useEffect(() => {
    fetchMe().then(a => setAuth({...a, loading: false}));
    // Kembali dari SOPAN: tampilkan pesan galat (bila ada) lalu bersihkan parameter URL
    const q = new URLSearchParams(location.search), err = q.get('lab_error');
    if (err) setLabNote(({akses_ditolak: 'Akses SOPAN dibatalkan.', state_tidak_cocok: 'Sesi login kedaluwarsa, silakan coba masuk lagi.', verifikasi_gagal: 'Verifikasi SOPAN gagal. Hubungi admin.', kode_tidak_valid: 'Kode login tidak valid.'} as Record<string, string>)[err] ?? 'Login gagal.');
    if (q.has('lab') || err) { q.delete('lab'); q.delete('lab_error'); const qs = q.toString(); history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash); }
  }, []);
  const {prog, record, reset, flushAndClear, mastered, masteredAbbr} = useProgress(auth.user?.key ?? null);
  // Mahasiswa: tab Tugas; dosen/laboran/admin: tab Kelola (buat tugas & rekap). Tanpa server/login: tanpa keduanya.
  const TABS = !auth.user ? BASE_TABS : auth.user.staff ? [BASE_TABS[0], BASE_TABS[1], KELOLA_TAB, ...BASE_TABS.slice(2)] : [BASE_TABS[0], BASE_TABS[1], TUGAS_TAB, ...BASE_TABS.slice(2)];
  const totalMorph = MORPHEMES.filter(m => m.type !== 'cv').length;
  const pctValid = Math.round(((totalItems() - unvalidatedCount()) / totalItems()) * 100);

  const switchTab = (t: Tab) => { setTab(t); setMinimized(false); if (t === 'find') onPrepare3D(); };
  const showFromLearn = (t: Term) => { if (!t.conceptId) return; onShowConcept(t.conceptId, true); if (window.innerWidth < 768) setMinimized(true); };

  const doLogout = async () => { await flushAndClear(); await labLogout(); setAuth({available: true, user: null, loading: false}); if (tab === 'tugas' || tab === 'kelola') setTab('learn'); };
  const accountRow = auth.available && !auth.loading && (auth.user
    ? <div className="flex items-center justify-between gap-2 text-[11px] bg-blue-50 border border-blue-100 rounded-xl px-3 py-1.5">
        <span className="truncate text-blue-900"><b>{auth.user.name}</b> · {auth.user.role}{auth.user.nim ? ` · ${auth.user.nim}` : ''}</span>
        <button {...btn} onClick={doLogout} className="flex items-center gap-1 text-blue-700 shrink-0"><LogOut size={12}/> Keluar</button>
      </div>
    : <a href={loginUrl()} style={{color: '#fff'}} className="flex items-center justify-center gap-1.5 text-xs font-medium bg-gray-900 rounded-xl py-2 no-underline"><LogIn size={14}/> Masuk dengan SOPAN (simpan progres &amp; catat tugas)</a>);

  const tabBar = <div className="grid gap-1 p-1 bg-gray-100 rounded-xl" style={{gridTemplateColumns: `repeat(${TABS.length}, minmax(0, 1fr))`}}>
    {TABS.map(({id, label, icon: Icon}) => <button {...btn} key={id} onClick={() => switchTab(id)} className={`flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-lg text-[10px] leading-none font-medium whitespace-nowrap ${tab === id ? 'bg-white shadow-sm text-blue-700' : 'text-gray-500'}`}><Icon size={15}/>{label}</button>)}
  </div>;

  if (minimized) return <button {...btn} onClick={() => setMinimized(false)} className="fixed top-3 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/95 backdrop-blur-xl shadow-xl border border-gray-200 text-sm font-medium text-gray-800">
    <BookOpen size={16} className="text-blue-600"/> Kembali ke Lab Istilah{goTerm ? ` · ${baseWord(goTerm)}` : ''}
  </button>;

  // Kuis 3D memakai kartu ringkas agar model tetap bisa diklik
  if (tab === 'find') return <section className="fixed inset-x-3 bottom-[150px] md:bottom-auto md:inset-x-auto md:top-4 md:right-4 md:w-[380px] z-[60] bg-white/95 backdrop-blur-2xl border border-gray-200/60 rounded-3xl shadow-2xl p-4 space-y-3">
    <div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-gray-900">Lab Istilah · Kuis 3D</h2><button {...btn} onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-full text-gray-500"><X size={15}/></button></div>
    <div className="hidden md:block">{tabBar}</div>
    <FindTab atlas={atlas} db={db} lastPick={lastPick} record={record} onShow={t => onShowConcept(t.conceptId!, true)} onNext={onPrepare3D}/>
  </section>;

  return <section className="fixed inset-0 md:inset-auto md:top-4 md:right-4 md:bottom-4 w-full md:w-[440px] bg-white/95 backdrop-blur-2xl md:border md:border-gray-200/50 rounded-none md:rounded-3xl shadow-2xl flex flex-col z-[60] overflow-hidden">
    <div className="p-5 pb-3 space-y-3 shrink-0">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 tracking-tight">Lab Terminologi Medis</h2>
          <p className="text-xs text-gray-500">{MORPHEMES.filter(m => m.type !== 'cv').length} morfem · {TERMS.length} istilah · {ABBREVIATIONS.length} singkatan</p>
          <p className="text-[10px] mt-0.5"><span className={pctValid === 100 ? 'text-emerald-600' : 'text-amber-600'}>{pctValid}% isi sudah divalidasi</span><span className="text-gray-400"> · titik kuning = belum divalidasi</span></p>
        </div>
        <button {...btn} onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-500"><X size={16}/></button>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-gray-50 rounded-xl py-2"><div className="text-lg font-bold text-gray-900">{prog.answered ? Math.round((prog.correct / prog.answered) * 100) : 0}%</div><div className="text-[10px] text-gray-500">Akurasi</div></div>
        <div className="bg-gray-50 rounded-xl py-2"><div className="text-lg font-bold text-gray-900">{mastered}<span className="text-xs text-gray-400">/{totalMorph}</span></div><div className="text-[10px] text-gray-500">Morfem · {masteredAbbr} singkatan</div></div>
        <div className="bg-gray-50 rounded-xl py-2"><div className="text-lg font-bold text-gray-900">{prog.best}</div><div className="text-[10px] text-gray-500">Rekor beruntun</div></div>
      </div>
      {accountRow}
      {labNote && <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3 py-1.5 flex justify-between"><span>{labNote}</span><button {...btn} onClick={() => setLabNote('')}><X size={12}/></button></div>}
      {tabBar}
      {tab === 'learn' && <Legend/>}
    </div>
    <div className="flex-1 overflow-y-auto px-5 pb-20">
      {tab === 'learn' && <LearnTab onShow={showFromLearn} goTerm={goTerm} setGoTerm={setGoTerm}/>}
      {tab === 'quiz' && <QuizTab record={record}/>}
      {tab === 'tugas' && auth.user && !auth.user.staff && <StudentAssignments/>}
      {tab === 'kelola' && auth.user?.staff && <ManageAssignments/>}
      {tab === 'match' && <MatchTab record={record}/>}
      {tab === 'build' && <BuildTab record={record}/>}
      {prog.answered > 0 && <button {...btn} onClick={() => { if (confirm('Hapus seluruh progres latihan di perangkat ini?')) reset(); }} className="mt-6 w-full text-[11px] text-gray-400 hover:text-rose-500">Atur ulang progres</button>}
    </div>
  </section>;
}
