/**
 * dbService.ts — Abstraksi layer untuk membaca/menyimpan database anatomi
 *
 * Strategi:
 *  - Selalu fetch dari server (anatomy_db.json atau db.php jika tersedia)
 *  - Gunakan in-memory cache agar tidak fetch ulang tiap render
 *  - Hapus ketergantungan pada localStorage sebagai sumber data utama
 */

/// <reference types="vite/client" />

import type { MedicalDb } from '../components/DataManager';

const BASE = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
const JSON_URL  = `${BASE}3d-anatomy/anatomy_db.json`;
const PHP_URL   = `${BASE}3d-anatomy/db.php`;

interface PhpPingResponse { php: boolean; version?: string; }
interface PhpResponse { success?: boolean; error?: string; entries?: number; message?: string; }

// ─── In-memory cache ────────────────────────────────────────────────────────
let _cache: MedicalDb | null = null;
let _phpAvailable: boolean | null = null;

// Export helper untuk AdminAuth.tsx agar bisa ambil password yang tersimpan
export { getAdminPassword } from '../components/AdminAuth';

// ─── Deteksi apakah PHP endpoint tersedia (cPanel prod) ────────────────────
export async function detectPhpApi(): Promise<boolean> {
  if (_phpAvailable !== null) return _phpAvailable;
  try {
    const res = await fetch(`${PHP_URL}?action=ping`, { method: 'GET' });
    if (!res.ok) { _phpAvailable = false; return false; }
    const json = await res.json() as PhpPingResponse;
    _phpAvailable = json?.php === true;
  } catch {
    _phpAvailable = false;
  }
  return _phpAvailable;
}

// ─── Baca database dari server ──────────────────────────────────────────────
export async function fetchDb(): Promise<MedicalDb> {
  if (_cache) return _cache;

  // Coba via db.php dulu (agar selalu fresh di prod)
  const phpOk = await detectPhpApi();
  const url = phpOk ? `${PHP_URL}?action=get` : JSON_URL;

  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as MedicalDb;
    _cache = data;
    return data;
  } catch (err) {
    console.error('[dbService] Gagal fetch database:', err);
    _cache = {};
    return _cache;
  }
}

// ─── Simpan database ke server (butuh password admin) ──────────────────────
export interface SaveResult {
  ok: boolean;
  message: string;
}

export async function saveDb(db: MedicalDb, adminPassword: string): Promise<SaveResult> {
  const phpOk = await detectPhpApi();

  if (!phpOk) {
    _cache = db;
    return {
      ok: false,
      message: 'Mode pengembangan: server PHP tidak tersedia. Data tersimpan di sesi ini. Upload anatomy_db.json ke cPanel secara manual untuk produksi.',
    };
  }

  try {
    const res = await fetch(`${PHP_URL}?action=save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: adminPassword, data: db }),
    });
    const json = await res.json() as PhpResponse;

    if (!res.ok) {
      return { ok: false, message: json.error ?? `Error ${res.status}` };
    }

    _cache = db;
    return { ok: true, message: `Berhasil menyimpan ${json.entries?.toLocaleString() ?? ''} entri ke server.` };
  } catch (err) {
    return { ok: false, message: `Gagal terhubung ke server: ${err}` };
  }
}

// ─── Ganti password admin via server ────────────────────────────────────────
export async function changePasswordViaServer(current: string, newPass: string): Promise<SaveResult> {
  const phpOk = await detectPhpApi();
  if (!phpOk) {
    return { ok: false, message: 'Dev mode: ganti password di browser saja (tidak ada server PHP).' };
  }

  try {
    const res = await fetch(`${PHP_URL}?action=change_password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current, new: newPass }),
    });
    const json = await res.json() as PhpResponse;
    if (!res.ok) return { ok: false, message: json.error ?? `Error ${res.status}` };
    return { ok: true, message: json.message ?? 'Password berhasil diubah.' };
  } catch (err) {
    return { ok: false, message: `Gagal: ${err}` };
  }
}

// ─── Invalidate cache ────────────────────────────────────────────────────────
export function invalidateCache(): void {
  _cache = null;
}

