// Klien API Lab Terminologi (login SOPAN, sinkron progres, tugas dosen, rekap).
// Bila server PHP tidak tersedia (mis. hosting statis), semua fungsi gagal dengan tenang
// dan fitur akun disembunyikan — latihan lokal tetap berjalan.

const BASE = (import.meta as {env?: {BASE_URL?: string}}).env?.BASE_URL ?? '/';
export const LAB_API = `${BASE}3d-anatomy/lab/api.php`;
const TUGAS_API = `${BASE}3d-anatomy/lab/tugas.php`;

export interface LabUser { key: string; name: string; role: string; nim: string; angkatan: string; staff: boolean; }

export type Scoring = 'best' | 'last' | 'first';
export interface AttemptSummary { score: number | null; total: number; at: number; done: boolean; late: boolean; overtime: boolean; }
export interface MyStats { attempts_used: number; in_progress: boolean; counted_score: number | null; total: number | null; history: AttemptSummary[]; }
export interface Assignment {
  id: number; code: string; title: string; scopes: string[]; kinds: string[]; total: number; time_limit_min: number;
  deadline: number | null; max_attempts: number; scoring: Scoring; shuffle: 'student' | 'shared'; allow_late: boolean;
  angkatan: string; active: boolean; created_by_name: string | null; created_at: number;
  mine?: MyStats; n_attempts?: number; n_students?: number;
}
export type AssignmentInput = Partial<Pick<Assignment, 'id' | 'title' | 'scopes' | 'kinds' | 'total' | 'time_limit_min' | 'deadline' | 'max_attempts' | 'scoring' | 'shuffle' | 'allow_late' | 'angkatan' | 'active'>>;
export interface AttemptRow { id: number; uid: string; nim: string; name: string; angkatan: string; role: string; started_at: number; finished_at: number | null; score: number | null; total: number; duration_s: number | null; late: number; overtime: number; }
/** Soal dari server: tanpa kunci jawaban. */
export interface PublicQuestion { kind: string; prompt: string; focus?: string; hint?: string; options: string[]; parts?: string[]; hl?: number; }
export interface AttemptStart { id: number; started_at: number; server_now: number; ends_at: number | null; late: boolean; questions: PublicQuestion[]; answers: (number | null)[]; }

const HEADERS = {'Content-Type': 'application/json', 'X-Lab-Request': '1'};
export interface ApiErr { error: string; }

async function getJson<T>(url: string): Promise<T | ApiErr | null> {
  try {
    const r = await fetch(url, {credentials: 'same-origin', cache: 'no-store'});
    if (!(r.headers.get('content-type') ?? '').includes('json')) return null;
    return (await r.json()) as T | ApiErr;
  } catch { return null; }
}
async function postJson<T>(url: string, body: unknown): Promise<T | ApiErr | null> {
  try {
    const r = await fetch(url, {method: 'POST', headers: HEADERS, credentials: 'same-origin', body: JSON.stringify(body)});
    if (!(r.headers.get('content-type') ?? '').includes('json')) return null;
    return (await r.json()) as T | ApiErr;
  } catch { return null; }
}
export const isErr = (x: unknown): x is ApiErr => !!x && typeof x === 'object' && 'error' in (x as object);
/** Hasil sukses atau pesan galat siap tampil. */
export type Res<T> = {ok: true; data: T} | {ok: false; message: string};
function wrap<T>(x: T | ApiErr | null): Res<T> {
  if (x === null) return {ok: false, message: 'Tidak dapat terhubung ke server.'};
  if (isErr(x)) return {ok: false, message: x.error};
  return {ok: true, data: x};
}

/** available=false bila server PHP tidak ada; user=null bila belum masuk. */
export async function fetchMe(): Promise<{available: boolean; user: LabUser | null}> {
  const j = await getJson<{available: boolean; user: LabUser | null}>(`${LAB_API}?action=me`);
  return j && !isErr(j) && j.available ? j : {available: false, user: null};
}
export const loginUrl = () => `${LAB_API}?action=login`;
export async function logout(): Promise<void> { await postJson(`${LAB_API}?action=logout`, {}); }

export async function loadProgress<P>(): Promise<{progress: P | null; updated_at: number} | null> {
  const j = await getJson<{progress: P | null; updated_at: number}>(`${LAB_API}?action=progress`);
  return j && !isErr(j) ? j : null;
}
export async function saveProgress(progress: unknown): Promise<boolean> {
  const j = await postJson(`${LAB_API}?action=progress`, {progress});
  return !!j && !isErr(j);
}

// ─── Tugas ──────────────────────────────────────────────────────────────────
export const listAssignments = async (): Promise<Res<{assignments: Assignment[]}>> => wrap(await getJson(`${TUGAS_API}?action=list`));
export const getAssignmentByCode = async (code: string): Promise<Res<{assignment: Assignment}>> => wrap(await getJson(`${TUGAS_API}?action=get&code=${encodeURIComponent(code.trim())}`));
export const saveAssignment = async (a: AssignmentInput): Promise<Res<{assignment: Assignment}>> => wrap(await postJson(`${TUGAS_API}?action=save`, a));
export const setAssignmentActive = async (id: number, active: boolean): Promise<Res<{ok: true}>> => wrap(await postJson(`${TUGAS_API}?action=set_active`, {id, active}));
export const deleteAssignment = async (id: number): Promise<Res<{ok: true}>> => wrap(await postJson(`${TUGAS_API}?action=delete`, {id}));
export const startAttempt = async (id: number): Promise<Res<{attempt: AttemptStart; assignment: Assignment}>> => wrap(await postJson(`${TUGAS_API}?action=attempt_start`, {id}));
export const answerQuestion = async (attempt_id: number, index: number, choice: number): Promise<Res<{ok: true}>> =>
  wrap(await postJson(`${TUGAS_API}?action=attempt_answer`, {attempt_id, index, choice}));
/** Nilai dihitung server dari jawaban yang tersimpan; klien tidak mengirim skor. */
export const finishAttempt = async (attempt_id: number): Promise<Res<{ok: true; score: number; total: number; late: boolean; overtime: boolean; mine: MyStats}>> =>
  wrap(await postJson(`${TUGAS_API}?action=attempt_finish`, {attempt_id}));
export const fetchAssignmentRekap = async (id: number): Promise<Res<{assignment: Assignment; attempts: AttemptRow[]}>> => wrap(await getJson(`${TUGAS_API}?action=rekap&id=${id}`));
