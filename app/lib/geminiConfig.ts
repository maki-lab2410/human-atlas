export const GEMINI_KEY_STORAGE = 'anatomy_gemini_api_key';
export const GEMINI_MODEL_STORAGE = 'anatomy_gemini_model';

export interface GeminiModelOption {
  id: string;
  name: string;
  label: string;
  rpm: string;
  rpd: string;
  badge: string;
  isRecommended?: boolean;
  desc: string;
}

export const GEMINI_MODELS: GeminiModelOption[] = [
  {
    id: 'gemini-3.5-flash-lite',
    name: 'Gemini 3.5 Flash Lite',
    label: 'Gemini 3.5 Flash Lite (500 req/hari - Paling Direkomendasikan)',
    rpm: '15 RPM',
    rpd: '500 RPD',
    badge: '500 Req/Hari',
    isRecommended: true,
    desc: 'Paling ideal untuk Tanya Maki: kuota terbesar (500 request/hari, 15 request/menit), respon super cepat dan hemat token.'
  },
  {
    id: 'gemini-3.1-flash-lite',
    name: 'Gemini 3.1 Flash Lite',
    label: 'Gemini 3.1 Flash Lite (500 req/hari)',
    rpm: '15 RPM',
    rpd: '500 RPD',
    badge: '500 Req/Hari',
    desc: 'Pilihan cadangan kuota tinggi (500 request/hari, 15 request/menit).'
  },
  {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    label: 'Gemini 3.8 Flash (20 req/hari)',
    rpm: '5 RPM',
    rpd: '20 RPD',
    badge: '20 Req/Hari',
    desc: 'Model tercanggih generasi 3.8. Analisis lebih pintar, namun kuota harian terbatas (20 request/hari, 5 req/menit).'
  },
  {
    id: 'gemini-3.6-flash',
    name: 'Gemini 3.6 Flash',
    label: 'Gemini 3.6 Flash (20 req/hari)',
    rpm: '5 RPM',
    rpd: '20 RPD',
    badge: '20 Req/Hari',
    desc: 'Model cepat generasi 3.6 (20 request/hari, 5 req/menit).'
  },
  {
    id: 'gemini-3-flash',
    name: 'Gemini 3 Flash',
    label: 'Gemini 3 Flash (20 req/hari)',
    rpm: '5 RPM',
    rpd: '20 RPD',
    badge: '20 Req/Hari',
    desc: 'Model stabil generasi 3.0 (20 request/hari, 5 req/menit).'
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    label: 'Gemini 2.5 Flash (20 req/hari)',
    rpm: '5 RPM',
    rpd: '20 RPD',
    badge: '20 Req/Hari',
    desc: 'Generasi 2.5 seimbang (20 request/hari, 5 req/menit).'
  },
  {
    id: 'gemini-2.5-flash-lite',
    name: 'Gemini 2.5 Flash Lite',
    label: 'Gemini 2.5 Flash Lite (20 req/hari)',
    rpm: '10 RPM',
    rpd: '20 RPD',
    badge: '20 Req/Hari',
    desc: 'Model ringan generasi 2.5 (20 request/hari, 10 req/menit).'
  },
];
