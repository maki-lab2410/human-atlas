# 3D Human Atlas Explorer (Indonesian Edition & Tanya Maki AI)

An interactive 3D human anatomy explorer built with React 19, Three.js, Vite, and shadcn/ui. Explore the human body reference with **2,234 individually selectable meshes**, **15 anatomical systems**, and **3,432 named concepts** with Indonesian medical terminology and integrated AI assistance.

🌐 **[Explore the Live Demo (Preview Hub)](http://43.173.41.238/preview-hub)**  
🔗 **[Direct Production Deployment](https://emr.dinus.id/3d-anatomy/)**

---

## Fitur Utama / Key Features

- **Eksplorasi Anatomi 3D Interaktif**: Rotasi 360°, zoom, seleksi struktur organ, dan eksplorasi per sistem tubuh (Rangka, Otot, Jantung, Organ Sensorik, Arteri, dll.).
- **Tampilan Rakit & Terurai (Exploded View)**: Berpindah dari bentuk tubuh utuh ke inventaris visual setiap komponen anatomi yang sedang aktif.
- **Lokalisasi Medis Bahasa Indonesia**: Nama struktur, definisi organ, dan terminologi medis yang telah disesuaikan dengan standar terminologi medis Indonesia dan SNOMED CT.
- **Tanya Maki (Asisten AI Cerdas)**: Chatbot pintar bertenaga Google Gemini API untuk konsultasi dan tanya-jawab anatomi manusia secara interaktif. Kunci API dan pemilihan model Gemini dapat diatur langsung melalui menu Pengaturan (Settings) di antarmuka web.
- **Kustomisasi Branding Fleksibel**: Pengaturan judul aplikasi, logo header, dan favicon tab browser dinamis yang tersimpan secara lokal dan di server.
- **Manajer Data Anatomi**: Manajemen basis data anatomi terintegrasi (`anatomy_db.json`) dengan opsi sinkronisasi ke server cPanel (`db.php`).

---

## Persyaratan Sistem / Prerequisites

- **Node.js**: Versi `22.13.0` atau yang lebih baru (disarankan Node.js 22 LTS atau 24).
- **npm**: Versi `10.x` atau yang lebih baru.
- **Python**: Versi `3.9+` (hanya jika ingin menjalankan script deployment FTP otomatis atau pemrosesan data).

---

## Panduan Instalasi & Menjalankan / Getting Started

### 1. Clone Repositori

```bash
git clone https://github.com/maki-lab2410/human-atlas.git
cd human-atlas
```

### 2. Instalasi Dependensi

Jalankan perintah berikut untuk menginstal seluruh dependensi:

```bash
npm install
```

> **Catatan**: Anda juga dapat menggunakan `npm ci` jika ingin menginstal persis sesuai `package-lock.json`.

### 3. Menjalankan Mode Pengembangan (Dev Server)

```bash
npm run dev
```

Buka peramban (browser) di alamat:
- **`http://localhost:3016/3d-anatomy/`** (atau `http://localhost:3016/`)

Aplikasi akan langsung berjalan tanpa memerlukan konfigurasi API eksternal di awal. Kunci API Gemini untuk fitur *Tanya Maki* dapat diinput langsung melalui tombol **Settings** di tampilan aplikasi.

---

## Build & Validasi / Build & Validation

### Build untuk Produksi

```bash
npm run build
```

Berkas keluaran statis siap rilis akan disimpan di dalam folder `dist/`.

### Pengecekan Tipe TypeScript

```bash
npm run check
```

### Validasi Model & Interaksi

Validasi struktur mesh, hierarki konsep anatomi, tata letak exploded view, dan simulasi interaksi pengguna:

```bash
node scripts/validate-atlas.mjs
node scripts/validate-interactions.mjs
```

---

## Deployment

### Opsi A: Deploy Otomatis ke cPanel via FTP/FTPS

Proyek ini telah dilengkapi script deploy otomatis via FTP/FTPS:

1. Salin template konfigurasi:
   ```bash
   cp .env.deploy.example .env.deploy
   ```
2. Isi informasi host, port, username, dan password FTP cPanel Anda pada file `.env.deploy` (file ini dilindungi `.gitignore` sehingga aman dan tidak akan terunggah ke repositori).
3. Jalankan perintah deploy:
   ```bash
   npm run deploy
   ```
   *(Gunakan `npm run deploy:force` jika ingin mengunggah ulang seluruh file tanpa skip cache).*

### Opsi B: Vercel / Static Hosting Lainnya

Konfigurasi `vercel.json` telah disertakan. Cukup impor repositori ke Vercel sebagai proyek Vite, atau unggah konten folder `dist/` ke web server statis pilihan Anda (Nginx, Apache, Netlify, Cloudflare Pages).

---

## Data Anatomi & Atribusi / Anatomy Data & Attribution

Model 3D viewer ini diadaptasi dari **BodyParts3D 4.0**, database referensi anatomi pria dewasa oleh *The Database Center for Life Science (DBCLS)*, berlisensi **Creative Commons Attribution 4.0 International (CC BY 4.0)**.

- **Lisensi Data**: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- **Sumber Data & Publikasi**: Mitsuhashi et al. (2009), *BodyParts3D: 3D structure database for anatomical concepts*. DOI: [10.1093/nar/gkn613](https://doi.org/10.1093/nar/gkn613)
- Informasi kredit, modifikasi geometri, dan rincian atribusi lengkap dapat dilihat di [ATTRIBUTION.md](public/ATTRIBUTION.md).

> *Aplikasi ini dirancang sebagai media edukasi dan eksplorasi anatomi interaktif, bukan sebagai perangkat diagnostik klinis atau pembedahan.*

---

## Lisensi / License

Kode sumber aplikasi ini dirilis di bawah lisensi [MIT License](LICENSE).  
Copyright (c) 2026 Maki (Mapping SNOMED CT & Indonesian Version)  
Copyright (c) 2026 ashemag (Original Framework)
