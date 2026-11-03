'use client';
import { useState, useEffect } from 'react';
import { Lock, Eye, EyeOff, ShieldCheck, KeyRound, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Keys
const SESSION_KEY = 'anatomy_admin_session';
const PASSWORD_KEY = 'anatomy_admin_password';

// Default password (bisa diubah dari Settings)
const DEFAULT_PASSWORD = 'admin123';

export function getAdminPassword(): string {
  if (typeof window === 'undefined') return DEFAULT_PASSWORD;
  return localStorage.getItem(PASSWORD_KEY) || DEFAULT_PASSWORD;
}

export function setAdminPassword(newPass: string) {
  localStorage.setItem(PASSWORD_KEY, newPass);
}

export function isAdminLoggedIn(): boolean {
  if (typeof window === 'undefined') return false;
  return sessionStorage.getItem(SESSION_KEY) === 'true';
}

export function adminLogin(password: string): boolean {
  const correct = getAdminPassword();
  if (password === correct) {
    sessionStorage.setItem(SESSION_KEY, 'true');
    return true;
  }
  return false;
}

export function adminLogout() {
  sessionStorage.removeItem(SESSION_KEY);
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminLogin(password)) {
      setError('');
      onSuccess();
    } else {
      setError('Password salah. Coba lagi.');
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
          Password default: <code>admin123</code> · Dapat diubah di Settings
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

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (current !== getAdminPassword()) {
      setMsg({ type: 'err', text: 'Password saat ini salah.' });
      return;
    }
    if (next.length < 6) {
      setMsg({ type: 'err', text: 'Password baru minimal 6 karakter.' });
      return;
    }
    if (next !== confirm) {
      setMsg({ type: 'err', text: 'Konfirmasi password tidak cocok.' });
      return;
    }
    setAdminPassword(next);
    setCurrent(''); setNext(''); setConfirm('');
    setMsg({ type: 'ok', text: 'Password berhasil diubah!' });
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
        placeholder="Password baru (min. 6 karakter)"
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
