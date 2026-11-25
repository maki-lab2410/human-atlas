// Data Lab Terminologi — dibaca dari JSON hasil `python3 scripts/build-terminologi.py`
// (sumber kebenaran: data/terminologi/*.csv). Jangan edit JSON secara manual.
import raw from './data/terminologi.json';

export type MorphemeType = 'prefix' | 'root' | 'cv' | 'suffix';
export type Status = 'belum' | 'valid' | 'revisi';
export type Category = 'anatomi' | 'diagnosis' | 'tindakan' | 'gejala' | 'ilmu' | 'fisiologi' | 'alat' | 'obat' | 'umum';
export type AbbrCategory = 'tanda vital' | 'diagnosis' | 'laboratorium' | 'pemeriksaan penunjang' | 'resep' | 'unit layanan' | 'administrasi' | 'statistik rumah sakit' | 'umum';

export interface Morpheme { id: string; form: string; type: MorphemeType; meaning: string; origin: string | null; status: Status; }
export interface TermPart { t: string; m: string; }
export interface Term {
  id: string; term: string; parts: TermPart[]; indonesian: string; definition: string;
  category: Category; system: string; conceptId: string | null; quiz3d: boolean; status: Status;
}
export interface Abbreviation { id: string; abbr: string; full: string; meaning: string; category: AbbrCategory; status: Status; }

const data = raw as unknown as {morphemes: Morpheme[]; terms: Term[]; abbreviations: Abbreviation[]};
export const MORPHEMES = data.morphemes;
export const TERMS = data.terms;
export const ABBREVIATIONS = data.abbreviations;
export const MORPHEME_BY_ID: Record<string, Morpheme> = Object.fromEntries(MORPHEMES.map(m => [m.id, m]));

export const TYPE_LABEL: Record<MorphemeType, string> = {prefix: 'Prefiks', root: 'Akar kata', cv: 'Vokal penghubung', suffix: 'Sufiks'};
export const CATEGORY_LABEL: Record<Category, string> = {
  anatomi: 'Anatomi', diagnosis: 'Diagnosis', tindakan: 'Tindakan', gejala: 'Gejala', ilmu: 'Ilmu/profesi',
  fisiologi: 'Fisiologi', alat: 'Alat', obat: 'Obat', umum: 'Umum',
};
export const SYSTEM_LABEL: Record<string, string> = {
  kardiovaskular: 'Kardiovaskular', pernapasan: 'Pernapasan', pencernaan: 'Pencernaan', saraf: 'Saraf', muskuloskeletal: 'Muskuloskeletal',
  kemih: 'Kemih', reproduksi: 'Reproduksi', endokrin: 'Endokrin', kulit: 'Kulit', indera: 'Mata & telinga', darah: 'Darah & imun', umum: 'Lintas sistem',
};
const ORDER = Object.keys(SYSTEM_LABEL);
export const SYSTEMS = Array.from(new Set(TERMS.map(t => t.system))).sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99));

export const baseWord = (t: Term) => t.term.split(' (')[0];
export const displayWord = (t: Term) => t.term.replace(/[()]/g, '');

/** Arti harfiah gabungan dari morfem (tanpa vokal penghubung). */
export function literalMeaning(term: Term): string {
  return term.parts
    .filter(x => MORPHEME_BY_ID[x.m]?.type !== 'cv')
    .map(x => MORPHEME_BY_ID[x.m]?.meaning.split(' (')[0].split(' / ')[0])
    .join(' + ');
}

export const unvalidatedCount = () =>
  [...MORPHEMES, ...TERMS, ...ABBREVIATIONS].filter(x => x.status !== 'valid').length;
export const totalItems = () => MORPHEMES.length + TERMS.length + ABBREVIATIONS.length;
