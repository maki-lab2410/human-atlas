'use client';
import { useState, useEffect } from 'react';
import { Lock, Eye, EyeOff, ShieldCheck, KeyRound, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { verifyAdminPassword, changePasswordViaServer } from '../lib/dbService';

// Keys (disimpan di sessionStorage: hilang saat tab ditutup; TIDAK pernah di localStorage)
const SESSION_KEY = 'anatomy_admin_session';
const PASSWORD_KEY = 'anatomy_admin_password';

// Password admin yang sah hanya ada di server (hash di .htadmin_pass; atur lewat `php set-admin-pass.php`).
// Hanya pada mode pengembangan lokal tanpa server PHP, dipakai kata sandi uji ini.
const DEV_ONLY_PASSWORD = 'admin123';
const IS_DEV = Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV);

/** Password admin untuk sesi tab ini (dikirim ke server setiap simpan). Kosong bila belum login. */
export function getAdminPassword(): string {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem(PASSWORD_KEY) || '';
}

export function isAdminLoggedIn(): boolean {
  if (typeof window === 'undefined') return false;
  return sessionStorage.getItem(SESSION_KEY) === 'true';
}

export async function adminLogin(password: string): Promise<{ ok: boolean; message: string }> {
  const r = await verifyAdminPassword(password);
  let ok = r.ok;
  let message = r.message;
  if (!ok && r.noServer) {
    ok = IS_DEV && password === DEV_ONLY_PASSWORD;
    message = IS_DEV ? 'Password salah. Coba lagi.' : 'Editor database hanya tersedia di server dengan PHP (cPanel).';
  }
  if (ok) {
    sessionStorage.setItem(SESSION_KEY, 'true');
    sessionStorage.setItem(PASSWORD_KEY, password);
  }
  return { ok, message };
}

export function adminLogout() {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(PASSWORD_KEY);
}

// ─── Login Modal Component ────────────────────────────────────────────────────

interface AdminAuthModalProps {
  onSuccess: () => void;
  onClose: () => void;
}

export default function AdminAuthModal({ onSuccess, onClose }: AdminAuthModalProps) {
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const r = await adminLogin(password);
    setBusy(false);
    if (r.ok) {
      setError('');
      onSuccess();
    } else {
      setError(r.message);
      setShake(true);
      setPassword('');
      setTimeout(() => setShake(false), 500);
    }
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="admin-auth-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`admin-auth-card ${shake ? 'shake' : ''}`}>
        {/* Close */}
        <button className="admin-auth-close" onClick={onClose} aria-label="Tutup">
          <X size={16} />
        </button>

        {/* Icon */}
        <div className="admin-auth-icon">
          <ShieldCheck size={32} strokeWidth={1.5} />
        </div>

        {/* Heading */}
        <h2 className="admin-auth-title">Login Administrator</h2>
        <p className="admin-auth-sub">
          Akses Editor Database dilindungi. Masukkan password admin untuk melanjutkan.
        </p>

        {/* Form */}
        <form onSubmit={handleSubmit} className="admin-auth-form">
          <div className="admin-auth-input-wrap">
            <KeyRound size={16} className="admin-auth-input-icon" />
            <input
              type={showPass ? 'text' : 'password'}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              placeholder="Masukkan password"
              autoFocus
              className="admin-auth-input"
              autoComplete="current-password"
            />
            <button
              type="button"
              className="admin-auth-eye"
              onClick={() => setShowPass(!showPass)}
              aria-label={showPass ? 'Sembunyikan password' : 'Tampilkan password'}
            >
              {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>

          {error && (
            <p className="admin-auth-error">{error}</p>
          )}

          <button type="submit" className="admin-auth-submit">
            <Lock size={15} />
            Masuk ke Editor Database
          </button>
        </form>

        <p className="admin-auth-hint">
          Password admin diatur di server (<code>php set-admin-pass.php</code>) · dapat diubah di Settings
        </p>
      </div>
    </div>
  );
}

// ─── Change Password Form (used inside Settings panel) ───────────────────────

interface ChangePasswordFormProps {
  onChanged?: () => void;
}

export function ChangePasswordForm({ onChanged }: ChangePasswordFormProps) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next.length < 10) {
      setMsg({ type: 'err', text: 'Password baru minimal 10 karakter.' });
      return;
    }
    if (next !== confirm) {
      setMsg({ type: 'err', text: 'Konfirmasi password tidak cocok.' });
      return;
    }
    const r = await changePasswordViaServer(current, next);
    if (!r.ok) {
      setMsg({ type: 'err', text: r.message });
      return;
    }
    if (isAdminLoggedIn()) sessionStorage.setItem(PASSWORD_KEY, next);
    setCurrent(''); setNext(''); setConfirm('');
    setMsg({ type: 'ok', text: 'Password berhasil diubah di server!' });
    onChanged?.();
  };

  return (
    <form onSubmit={handleSave} className="change-pass-form">
      <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
        <Lock size={14} /> Password Administrator
      </h3>
      <input
        type="password"
        value={current}
        onChange={e => { setCurrent(e.target.value); setMsg(null); }}
        placeholder="Password saat ini"
        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
        autoComplete="current-password"
      />
      <input
        type="password"
        value={next}
        onChange={e => { setNext(e.target.value); setMsg(null); }}
        placeholder="Password baru (min. 10 karakter)"
        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
        autoComplete="new-password"
      />
      <input
        type="password"
        value={confirm}
        onChange={e => { setConfirm(e.target.value); setMsg(null); }}
        placeholder="Konfirmasi password baru"
        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
        autoComplete="new-password"
      />
      {msg && (
        <p className={`text-xs mb-2 font-medium ${msg.type === 'ok' ? 'text-green-600' : 'text-red-500'}`}>{msg.text}</p>
      )}
      <button type="submit" className="w-full py-2 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-700 transition-colors">
        Simpan Password Baru
      </button>
    </form>
  );
}
