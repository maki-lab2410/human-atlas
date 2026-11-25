// Generator soal Lab Terminologi untuk LATIHAN mandiri (di browser).
// Soal TUGAS dibuat dan dinilai di server (public/3d-anatomy/lab/_quiz.php) agar kunci jawaban tidak sampai ke peserta.
import {
  ABBREVIATIONS, CATEGORY_LABEL, MORPHEMES, MORPHEME_BY_ID, SYSTEMS, TERMS, TYPE_LABEL,
  baseWord, displayWord, literalMeaning,
  type Morpheme, type MorphemeType, type Term,
} from './data';

// ─── Acak ───────────────────────────────────────────────────────────────────
const rnd: () => number = Math.random;
export const shuffle = <T,>(a: T[]): T[] => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };
export const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];
export const sample = <T,>(a: T[], n: number): T[] => shuffle(a).slice(0, n);

export type Scope = 'campuran' | 'morfem' | 'singkatan' | string; // string = id sistem
export interface Question { kind: string; prompt: string; focus?: string; hint?: string; options: string[]; answer: number; term?: Term; ids: string[]; explain: string; hl?: number; }

export function termsOf(scope: Scope): Term[] {
  if (scope === 'campuran' || scope === 'morfem' || scope === 'singkatan') return TERMS;
  return TERMS.filter(t => t.system === scope);
}
export function morphemesOf(scope: Scope): Morpheme[] {
  const all = MORPHEMES.filter(m => m.type !== 'cv');
  if (scope === 'campuran' || scope === 'morfem' || scope === 'singkatan') return all;
  const ids = new Set(termsOf(scope).flatMap(t => t.parts.map(p => p.m)));
  return all.filter(m => ids.has(m.id));
}

export function qMorph(scope: Scope): Question {
  const pool = morphemesOf(scope);
  const m = pick(pool);
  const distract = sample(MORPHEMES.filter(x => x.type === m.type && x.id !== m.id && x.meaning !== m.meaning), 3);
  const opts = shuffle([m, ...distract]);
  const examples = TERMS.filter(t => t.parts.some(x => x.m === m.id)).slice(0, 3).map(baseWord);
  return {kind: 'morph', prompt: `Apa arti ${TYPE_LABEL[m.type].toLowerCase()} berikut?`, focus: m.form, options: opts.map(o => o.meaning), answer: opts.indexOf(m), ids: [m.id],
    explain: `${m.form} = ${m.meaning}${m.origin ? ` (${m.origin})` : ''}.${examples.length ? ` Contoh: ${examples.join(', ')}.` : ''}`};
}
export function qTermMeaning(scope: Scope, reverse: boolean): Question {
  const pool = termsOf(scope);
  const t = pick(pool);
  const same = pool.filter(x => x.id !== t.id && x.category === t.category);
  const distract = sample(same.length >= 3 ? same : pool.filter(x => x.id !== t.id), 3);
  const opts = shuffle([t, ...distract]);
  const explain = `${baseWord(t)} → ${literalMeaning(t)}. ${t.definition}`;
  return reverse
    ? {kind: 'termFromDef', prompt: 'Istilah medis yang tepat untuk definisi berikut adalah…', focus: t.definition, options: opts.map(displayWord), answer: opts.indexOf(t), term: t, ids: t.parts.map(x => x.m), explain}
    : {kind: 'termMeaning', prompt: 'Apa arti istilah berikut?', focus: displayWord(t), options: opts.map(o => o.definition), answer: opts.indexOf(t), term: t, ids: t.parts.map(x => x.m), explain};
}
export function qPartType(scope: Scope): Question {
  const t = pick(termsOf(scope).filter(x => x.parts.length >= 3));
  const part = pick(t.parts);
  const m = MORPHEME_BY_ID[part.m];
  const types = Object.keys(TYPE_LABEL) as MorphemeType[];
  return {kind: 'partType', prompt: `Pada istilah "${baseWord(t)}", bagian yang disorot termasuk…`, focus: part.t, options: types.map(x => TYPE_LABEL[x]), answer: types.indexOf(m.type), term: t, ids: [m.id],
    explain: `"${part.t}" adalah ${TYPE_LABEL[m.type].toLowerCase()}${m.type === 'cv' ? '' : ` (${m.form}) yang berarti ${m.meaning}`}.`};
}
export function qTrueFalse(scope: Scope): Question {
  const pool = morphemesOf(scope);
  const m = pick(pool);
  const truth = rnd() < 0.5;
  const other = pick(MORPHEMES.filter(x => x.type === m.type && x.id !== m.id && x.meaning !== m.meaning));
  const shown = truth ? m.meaning : other.meaning;
  return {kind: 'tf', prompt: 'Benar atau salah?', focus: `${m.form} berarti “${shown}”`, options: ['Benar', 'Salah'], answer: truth ? 0 : 1, ids: [m.id],
    explain: truth ? `Benar: ${m.form} = ${m.meaning}.` : `Salah: ${m.form} = ${m.meaning} (bukan “${other.meaning}”).`};
}
export function qRecordRead(scope: Scope): Question {
  const pool = termsOf(scope).filter(t => t.category !== 'anatomi' && t.category !== 'ilmu');
  const base = pool.length ? pool : termsOf(scope);
  const t = pick(base);
  const distract = sample(base.filter(x => x.id !== t.id && x.category === t.category), 3);
  const opts = shuffle([t, ...(distract.length === 3 ? distract : sample(base.filter(x => x.id !== t.id), 3))]);
  return {kind: 'record', prompt: 'Dalam rekam medis tertulis berikut. Apa maksudnya?', focus: `“${t.indonesian}”`, hint: `Kategori: ${CATEGORY_LABEL[t.category]}`, options: opts.map(o => o.definition), answer: opts.indexOf(t), term: t, ids: t.parts.map(x => x.m),
    explain: `${t.indonesian} (${baseWord(t)}) → ${literalMeaning(t)}. ${t.definition}`};
}
export function qAbbr(reverse: boolean): Question {
  const a = pick(ABBREVIATIONS);
  const same = ABBREVIATIONS.filter(x => x.id !== a.id && x.abbr !== a.abbr && x.full !== a.full);
  const sameCat = same.filter(x => x.category === a.category);
  const distract = sample(sameCat.length >= 3 ? sameCat : same, 3);
  const opts = shuffle([a, ...distract]);
  const explain = `${a.abbr} = ${a.full}. ${a.meaning}`;
  return reverse
    ? {kind: 'abbrRev', prompt: `Singkatan untuk “${a.full}” adalah…`, hint: `Kategori: ${a.category}`, options: opts.map(o => o.abbr), answer: opts.indexOf(a), ids: ['ab:' + a.id], explain}
    : {kind: 'abbr', prompt: 'Apa kepanjangan singkatan berikut?', focus: a.abbr, hint: `Kategori: ${a.category}`, options: opts.map(o => o.full), answer: opts.indexOf(a), ids: ['ab:' + a.id], explain};
}

export function makeQuestion(scope: Scope): Question {
  if (scope === 'singkatan') return qAbbr(rnd() < 0.4);
  if (scope === 'morfem') return pick([() => qMorph(scope), () => qMorph(scope), () => qTrueFalse(scope), () => qPartType(scope)])();
  const kinds: (() => Question)[] = [
    () => qMorph(scope), () => qTermMeaning(scope, false), () => qTermMeaning(scope, true), () => qPartType(scope),
    () => qTrueFalse(scope), () => qRecordRead(scope),
  ];
  if (scope === 'campuran') kinds.push(() => qAbbr(false), () => qAbbr(true));
  return pick(kinds)();
}


// ─── Soal untuk tugas dosen ─────────────────────────────────────────────────
export const KIND_LABEL: Record<string, string> = {
  morfem: 'Arti morfem', istilah: 'Arti istilah', definisi: 'Istilah dari definisi', bagian: 'Jenis bagian kata',
  benarsalah: 'Benar/salah morfem', rekam: 'Membaca catatan rekam medis', singkatan: 'Singkatan',
};
export const ALL_KINDS = Object.keys(KIND_LABEL);

/** Fokus yang dapat dipilih dosen: morfem, singkatan, dan semua sistem yang punya istilah. */
export const SCOPE_OPTIONS: string[] = ['morfem', 'singkatan', ...SYSTEMS];
