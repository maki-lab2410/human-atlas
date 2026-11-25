'use client';
import { useState } from 'react';
import { RefreshCw, Download, RotateCcw, CheckCircle2, AlertTriangle, ExternalLink, Lock } from 'lucide-react';
import { getAdminPassword, isAdminLoggedIn } from './AdminAuth';

const BASE = ((import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/');
const UPDATER_URL = `${BASE}3d-anatomy/updater.php`;
const VERSION_URL = `${BASE}3d-anatomy/version.json`;
const btn = { 'data-slot': 'update-button' } as const;

interface CheckResult {
  current_version: string;
  latest_version?: string;
  tag?: string;
  repo: string;
  has_update: boolean;
  can_auto_update: boolean;
  has_rollback?: boolean;
  published_at?: string;
  release_url?: string;
  notes?: string;
  app_size?: number;
  issues?: string[];
  check_error?: string;
}

export default function UpdatePanel() {
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [info, setInfo] = useState<CheckResult | null>(null);
  const [passInput, setPassInput] = useState('');
  const [needPass, setNeedPass] = useState(false);
  const [status, setStatus] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const checkUpdate = async () => {
    setChecking(true);
    setStatus(null);
    try {
      const res = await fetch(`${UPDATER_URL}?action=check`, { cache: 'no-store' });
      const ct = res.headers.get('content-type') || '';
      if (!res.ok || !ct.includes('application/json')) {
        // Fallback statis (dev / Vercel tanpa PHP): baca version.json lokal
        const vRes = await fetch(VERSION_URL, { cache: 'no-store' });
        const vJson = (vRes.ok ? await vRes.json() : {}) as { version?: string; repo?: string };
        setInfo({
          current_version: vJson.version ?? '1.0.0',
          repo: vJson.repo ?? 'maki-lab2410/human-atlas',
          has_update: false,
          can_auto_update: false,
          issues: ['Pembaruan 1-klik hanya tersedia pada server hosting PHP.'],
        });
        return;
      }
      const data = (await res.json()) as CheckResult;
      setInfo(data);
    } catch {
      setStatus({ type: 'err', text: 'Gagal memeriksa pembaruan.' });
    } finally {
      setChecking(false);
    }
  };

  const runAction = async (action: 'apply' | 'rollback') => {
    const pw = getAdminPassword() || passInput;
    if (!pw) {
      setNeedPass(true);
      return;
    }
    setApplying(true);
    setStatus(null);
    try {
      const res = await fetch(`${UPDATER_URL}?action=${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      });
      const json = (await res.json()) as { success?: boolean; error?: string; message?: string; version?: string };
      if (!res.ok || !json.success) {
        setStatus({ type: 'err', text: json.error ?? `Gagal (${res.status})` });
        return;
      }
      setNeedPass(false);
      setPassInput('');
      setStatus({ type: 'ok', text: json.message ?? 'Pembaruan selesai.' });
      await checkUpdate();
    } catch (err) {
      setStatus({ type: 'err', text: `Gagal menghubungi server: ${err}` });
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <RefreshCw size={14} className={checking ? 'animate-spin text-blue-600' : ''} /> Pembaruan Aplikasi
          </h3>
          <p className="text-[10px] text-gray-400">
            {info ? `Versi terpasang: v${info.current_version}` : 'Cek rilis terbaru dari repositori GitHub'}
          </p>
        </div>
        <button
          {...btn}
          type="button"
          onClick={checkUpdate}
          disabled={checking || applying}
          className="px-3 py-1.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-xs font-medium text-gray-700 whitespace-nowrap disabled:opacity-50"
        >
          {checking ? 'Memeriksa...' : 'Cek Pembaruan'}
        </button>
      </div>

      {info && (
        <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl space-y-2 text-xs">
          {info.check_error && (
            <p className="text-amber-700 flex items-start gap-1.5">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>{info.check_error}</span>
            </p>
          )}

          {!info.check_error && !info.has_update && (
            <p className="text-emerald-700 flex items-center gap-1.5 font-medium">
              <CheckCircle2 size={14} /> Sudah memakai versi terbaru (v{info.current_version}).
            </p>
          )}

          {info.has_update && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-blue-800">Tersedia versi v{info.latest_version}</span>
                {info.app_size ? <span className="text-[10px] text-gray-500">{(info.app_size / (1024 * 1024)).toFixed(2)} MB</span> : null}
              </div>
              {info.notes && <p className="text-[11px] text-gray-600 whitespace-pre-line line-clamp-4">{info.notes}</p>}
              <p className="text-[10px] text-gray-500">
                File instansi (<code>config.php</code>, <code>lab.sqlite</code>, <code>.htadmin_pass</code>, dan editan <code>anatomy_db.json</code>) otomatis dilindungi.
              </p>
              {info.can_auto_update ? (
                <button
                  {...btn}
                  type="button"
                  onClick={() => runAction('apply')}
                  disabled={applying}
                  className="w-full py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Download size={14} /> {applying ? 'Memasang pembaruan...' : `Pasang Update v${info.latest_version}`}
                </button>
              ) : (
                info.release_url && (
                  <a
                    href={info.release_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-blue-600 hover:underline font-medium"
                  >
                    Unduh rilis manual <ExternalLink size={12} />
                  </a>
                )
              )}
            </div>
          )}

          {info.issues && info.issues.length > 0 && (
            <ul className="text-[10px] text-amber-700 space-y-0.5 list-disc pl-4">
              {info.issues.map((msg, i) => <li key={i}>{msg}</li>)}
            </ul>
          )}

          {info.has_rollback && (
            <button
              {...btn}
              type="button"
              onClick={() => runAction('rollback')}
              disabled={applying}
              className="w-full py-1.5 px-3 rounded-lg border border-gray-300 bg-white hover:bg-gray-100 text-[11px] font-medium text-gray-700 flex items-center justify-center gap-1.5"
            >
              <RotateCcw size={12} /> Kembalikan ke Versi Sebelumnya (Rollback)
            </button>
          )}
        </div>
      )}

      {needPass && !isAdminLoggedIn() && (
        <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl space-y-2">
          <p className="text-[11px] text-blue-900 font-medium flex items-center gap-1.5">
            <Lock size={12} /> Masukkan password Administrator server untuk melanjutkan:
          </p>
          <div className="flex gap-2">
            <input
              type="password"
              value={passInput}
              onChange={(e) => setPassInput(e.target.value)}
              placeholder="Password admin"
              className="flex-1 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs"
            />
            <button
              {...btn}
              type="button"
              onClick={() => runAction('apply')}
              disabled={!passInput || applying}
              className="px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-medium disabled:opacity-40"
            >
              Lanjut
            </button>
          </div>
        </div>
      )}

      {status && (
        <div className={`text-xs rounded-xl px-3 py-2 font-medium flex items-center justify-between gap-2 ${status.type === 'ok' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
          <span>{status.text}</span>
          {status.type === 'ok' && (
            <button
              {...btn}
              type="button"
              onClick={() => location.reload()}
              className="px-2.5 py-1 rounded-lg bg-emerald-700 text-white text-[11px] shrink-0"
            >
              Muat Ulang
            </button>
          )}
        </div>
      )}
    </div>
  );
}
