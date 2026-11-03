import React, { useState, useRef, useEffect } from 'react';
import { GEMINI_MODELS, GEMINI_KEY_STORAGE, GEMINI_MODEL_STORAGE } from '../../app/lib/geminiConfig';

// Helper: baca API key (localStorage > .env fallback)
function getApiKey(): string {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(GEMINI_KEY_STORAGE);
    if (stored && stored.trim()) return stored.trim();
  }
  return (import.meta as Record<string, any>).env?.VITE_GEMINI_API_KEY || '';
}

function getModel(): string {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(GEMINI_MODEL_STORAGE);
    if (stored && stored.trim()) return stored.trim();
  }
  return GEMINI_MODELS[0].id; // Default: gemini-3.5-flash-lite
}

export default function AnatomyChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { sender: 'ai', text: 'Halo! Saya asisten anatomi Anda. Ada bagian organ atau istilah medis yang ingin ditanyakan?' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasKey, setHasKey] = useState(false);

  // Cek API key saat mount dan saat window focus
  useEffect(() => {
    const check = () => setHasKey(!!getApiKey());
    check();
    window.addEventListener('focus', check);
    window.addEventListener('storage', check);
    return () => {
      window.removeEventListener('focus', check);
      window.removeEventListener('storage', check);
    };
  }, []);

  // State untuk posisi draggable
  const [position, setPosition] = useState({ x: 20, y: 100 });
  const draggingRef = useRef(false);
  const offsetRef = useRef({ x: 0, y: 0 });
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPosition({ x: window.innerWidth - 340, y: window.innerHeight - 520 });
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      setPosition({
        x: Math.max(0, Math.min(window.innerWidth - 320, e.clientX - offsetRef.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 100, e.clientY - offsetRef.current.y))
      });
    };
    const handleGlobalMouseUp = () => { draggingRef.current = false; };
    if (isOpen) {
      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isOpen]);

  const handleMouseDown = (e: React.MouseEvent) => {
    draggingRef.current = true;
    offsetRef.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const apiKey = getApiKey();
    if (!apiKey) {
      setMessages(prev => [...prev, {
        sender: 'ai',
        text: '⚠️ API Key Gemini belum diatur. Silakan masukkan API Key di menu Settings → Konfigurasi AI.'
      }]);
      return;
    }

    const userText = input;
    setInput('');
    setMessages(prev => [...prev, { sender: 'user', text: userText }]);
    setLoading(true);

    try {
      const model = getModel();
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: `Kamu adalah asisten AI ahli anatomi medis. Jawab dalam Bahasa Indonesia dengan singkat, akurat, dan mudah dipahami oleh mahasiswa kedokteran. Gunakan teks biasa tanpa markdown. Pertanyaan: ${userText}`
              }]
            }]
          })
        }
      );

      if (!response.ok) {
        const errorData: any = await response.json();
        const msg = errorData?.error?.message || `Error ${response.status}`;
        if (response.status === 400 && msg.includes('API_KEY')) {
          throw new Error('API Key tidak valid. Periksa kembali di Settings → Konfigurasi AI.');
        }
        throw new Error(msg);
      }

      const data: any = await response.json();
      const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text
        || 'Maaf, saya tidak memiliki respons untuk itu.';
      setMessages(prev => [...prev, { sender: 'ai', text: aiResponse }]);

    } catch (error: any) {
      setMessages(prev => [...prev, { sender: 'ai', text: `❌ ${error.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const formatMarkdown = (text: string) => {
    const htmlText = text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br />');
    return { __html: htmlText };
  };

  return (
    <>
      {/* Tombol Melayang */}
      {!isOpen && (
        <button
          className="fixed bottom-24 md:bottom-6 right-6 z-[80] bg-blue-600 text-white px-5 py-3 rounded-full shadow-lg hover:bg-blue-700 transition flex items-center gap-2 font-medium"
          onClick={() => setIsOpen(true)}
        >
          💬 Tanya Maki
          {!hasKey && (
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 rounded-full border-2 border-white" title="API Key belum diatur"/>
          )}
        </button>
      )}

      {/* Jendela Chat */}
      {isOpen && (
        <div
          className="fixed z-[80] w-80 bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden"
          style={{ left: `${position.x}px`, top: `${position.y}px` }}
        >
          {/* Header */}
          <div
            className="bg-blue-600 text-white p-3 cursor-move flex justify-between items-center select-none"
            onMouseDown={handleMouseDown}
          >
            <span className="font-semibold text-sm tracking-wide">🤖 Asisten 3D Anatomy</span>
            <button
              onClick={() => setIsOpen(false)}
              className="text-white hover:bg-blue-700 rounded-full h-7 w-7 flex items-center justify-center font-bold text-lg transition-colors"
            >
              &times;
            </button>
          </div>

          {/* Warning jika API key belum diatur */}
          {!hasKey && (
            <div className="bg-amber-50 border-b border-amber-200 px-3 py-2 text-[11px] text-amber-800 flex items-center gap-2">
              ⚠️ API Key belum diatur.{' '}
              <button
                onClick={() => {
                  setIsOpen(false);
                  // Trigger buka panel Settings di app utama
                  window.dispatchEvent(new CustomEvent('open-settings-panel'));
                }}
                className="underline font-semibold hover:text-amber-900"
              >
                Buka Settings
              </button>
            </div>
          )}

          {/* Area Percakapan */}
          <div className="h-72 p-4 overflow-y-auto flex flex-col gap-3 bg-gray-50/50 text-[13px]">
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`p-2.5 rounded-xl max-w-[85%] leading-relaxed ${
                  msg.sender === 'user'
                    ? 'bg-blue-500 text-white self-end rounded-br-sm shadow-sm'
                    : 'bg-white text-gray-800 border border-gray-100 self-start rounded-bl-sm shadow-sm'
                }`}
                dangerouslySetInnerHTML={formatMarkdown(msg.text)}
              />
            ))}
            {loading && (
              <div className="text-gray-400 text-xs italic self-start bg-white p-2 rounded-lg border border-gray-100 shadow-sm animate-pulse">
                Mengetik respons...
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form onSubmit={sendMessage} className="p-3 border-t border-gray-100 bg-white flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={hasKey ? "Tanya tentang organ..." : "Atur API Key dulu di Settings..."}
              className="flex-1 bg-gray-100 border border-transparent rounded-xl px-3 py-2 text-[13px] focus:outline-none focus:border-blue-500 focus:bg-white transition-all text-gray-700"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="bg-blue-600 text-white px-4 py-2 rounded-xl text-[13px] font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Kirim
            </button>
          </form>
        </div>
      )}
    </>
  );
}
