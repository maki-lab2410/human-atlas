'use client';

import React, { useState, useEffect } from 'react';
import { Bot, Key, Eye, EyeOff, Sparkles, CheckCircle2, AlertCircle, Loader2, ExternalLink, RotateCcw, Zap } from 'lucide-react';
import { GEMINI_MODELS, GEMINI_KEY_STORAGE, GEMINI_MODEL_STORAGE, type GeminiModelOption } from '../lib/geminiConfig';

export default function GeminiSettings() {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [model, setModel] = useState(GEMINI_MODELS[0].id);
  const [customModel, setCustomModel] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ status: 'ok' | 'err'; message: string } | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedKey = localStorage.getItem(GEMINI_KEY_STORAGE) || '';
      const storedModel = localStorage.getItem(GEMINI_MODEL_STORAGE) || GEMINI_MODELS[0].id;
      setApiKey(storedKey);

      const known = GEMINI_MODELS.find(m => m.id === storedModel);
      if (known) {
        setModel(storedModel);
        setUseCustom(false);
      } else {
        setUseCustom(true);
        setCustomModel(storedModel);
      }
    }
  }, []);

  const handleKeyChange = (val: string) => {
    setApiKey(val);
    setTestResult(null);
    if (typeof window !== 'undefined') {
      if (val.trim()) {
        localStorage.setItem(GEMINI_KEY_STORAGE, val.trim());
      } else {
        localStorage.removeItem(GEMINI_KEY_STORAGE);
      }
      window.dispatchEvent(new Event('storage'));
    }
  };

  const activeModelId = useCustom ? customModel.trim() || GEMINI_MODELS[0].id : model;

  const handleModelChange = (val: string) => {
    if (val === '__custom__') {
      setUseCustom(true);
      return;
    }
    setUseCustom(false);
    setModel(val);
    setTestResult(null);
    if (typeof window !== 'undefined') {
      localStorage.setItem(GEMINI_MODEL_STORAGE, val);
      window.dispatchEvent(new Event('storage'));
    }
  };

  const handleCustomModelChange = (val: string) => {
    setCustomModel(val);
    setTestResult(null);
    if (typeof window !== 'undefined') {
      localStorage.setItem(GEMINI_MODEL_STORAGE, val.trim() || GEMINI_MODELS[0].id);
      window.dispatchEvent(new Event('storage'));
    }
  };

  const handleReset = () => {
    if (confirm('Hapus konfigurasi API Key Gemini dari browser ini?')) {
      handleKeyChange('');
      handleModelChange(GEMINI_MODELS[0].id);
      setCustomModel('');
      setUseCustom(false);
      setTestResult(null);
    }
  };

  const handleTestConnection = async () => {
    const keyToTest = apiKey.trim();
    if (!keyToTest) {
      setTestResult({ status: 'err', message: 'Masukkan API Key terlebih dahulu.' });
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${activeModelId}:generateContent?key=${keyToTest}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Halo, ini tes singkat.' }] }]
          })
        }
      );

      if (!res.ok) {
        const errorData: any = await res.json().catch(() => ({}));
        const errorMsg = errorData?.error?.message || `HTTP ${res.status}`;
        throw new Error(errorMsg);
      }

      setTestResult({
        status: 'ok',
        message: `Koneksi Berhasil! Model "${activeModelId}" aktif dan siap digunakan untuk Tanya Maki.`
      });
    } catch (err: any) {
      setTestResult({
        status: 'err',
        message: `Koneksi Gagal: ${err.message || 'Periksa kembali API Key atau nama model Anda.'}`
      });
    } finally {
      setTesting(false);
    }
  };

  const selectedModelMeta = GEMINI_MODELS.find(m => m.id === model);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <Bot size={16} className="text-blue-600" />
          Konfigurasi AI (Tanya Maki)
        </h3>
        {apiKey && (
          <button
            type="button"
            onClick={handleReset}
            className="text-[11px] text-gray-400 hover:text-red-500 transition-colors flex items-center gap-1"
            title="Reset API Key"
          >
            <RotateCcw size={11} /> Reset
          </button>
        )}
      </div>

      {/* Input API Key */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">
          Gemini API Key
        </label>
        <div className="relative flex items-center">
          <div className="absolute left-3 text-gray-400 pointer-events-none">
            <Key size={14} />
          </div>
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => handleKeyChange(e.target.value)}
            placeholder="AIzaSy..."
            className="w-full pl-9 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:font-sans placeholder:text-gray-400"
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-2.5 p-1 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
            title={showKey ? 'Sembunyikan' : 'Tampilkan'}
          >
            {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        <div className="flex items-center justify-between mt-1.5 px-0.5">
          <span className="text-[10px] text-gray-400">
            Tersimpan lokal di browser ini.
          </span>
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-blue-600 hover:text-blue-700 font-medium inline-flex items-center gap-1"
          >
            Dapatkan Key Gratis <ExternalLink size={10} />
          </a>
        </div>
      </div>

      {/* Pilihan Model */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-medium text-gray-600">
            Pilihan Model Free Tier
          </label>
          <button
            type="button"
            onClick={() => {
              if (useCustom) {
                setUseCustom(false);
                handleModelChange(GEMINI_MODELS[0].id);
              } else {
                setUseCustom(true);
              }
            }}
            className="text-[10px] text-blue-600 hover:underline"
          >
            {useCustom ? 'Pilih dari List' : 'Input Manual'}
          </button>
        </div>

        {!useCustom ? (
          <select
            value={model}
            onChange={(e) => handleModelChange(e.target.value)}
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          >
            {GEMINI_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} · {m.rpd} ({m.rpm})
              </option>
            ))}
            <option value="__custom__">+ Model Lainnya (Input Manual)...</option>
          </select>
        ) : (
          <input
            type="text"
            value={customModel}
            onChange={(e) => handleCustomModelChange(e.target.value)}
            placeholder="Contoh: gemini-3.5-flash-lite"
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />
        )}

        {/* Info Box Kuota & Deskripsi */}
        {!useCustom && selectedModelMeta && (
          <div className="mt-2 p-2.5 bg-blue-50/60 border border-blue-100 rounded-xl text-[11px] text-gray-600 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded-md font-semibold text-[10px] flex items-center gap-1 ${
                selectedModelMeta.isRecommended
                  ? 'bg-emerald-500 text-white'
                  : 'bg-blue-600 text-white'
              }`}>
                <Zap size={10} /> {selectedModelMeta.badge}
              </span>
              <span className="text-gray-500 font-mono text-[10px]">
                {selectedModelMeta.rpm} · {selectedModelMeta.rpd}
              </span>
            </div>
            <p className="leading-relaxed text-gray-600">
              {selectedModelMeta.desc}
            </p>
          </div>
        )}
      </div>

      {/* Tombol Uji Koneksi */}
      <div className="pt-1">
        <button
          type="button"
          onClick={handleTestConnection}
          disabled={testing || !apiKey.trim()}
          className="w-full py-2.5 px-4 bg-blue-50 hover:bg-blue-100/80 active:bg-blue-100 text-blue-700 border border-blue-200/80 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          {testing ? (
            <>
              <Loader2 size={13} className="animate-spin" />
              Menguji Koneksi ke Google Gemini...
            </>
          ) : (
            <>
              <Sparkles size={13} />
              Uji Koneksi API Key ({activeModelId})
            </>
          )}
        </button>

        {testResult && (
          <div
            className={`mt-2.5 p-3 rounded-xl border text-xs flex items-start gap-2.5 leading-relaxed ${
              testResult.status === 'ok'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            {testResult.status === 'ok' ? (
              <CheckCircle2 size={15} className="text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle size={15} className="text-rose-600 shrink-0 mt-0.5" />
            )}
            <span>{testResult.message}</span>
          </div>
        )}
      </div>
    </div>
  );
}
