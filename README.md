# 3D Human Atlas Explorer (Indonesian Edition & Tanya Maki AI)

An interactive 3D human anatomy explorer built with React 19, Three.js, Vite, and shadcn/ui. Explore the human body reference with **2,234 individually selectable meshes**, **15 anatomical systems**, and **3,432 named concepts** with Indonesian medical terminology, an interactive **Medical Terminology Lab**, and integrated AI assistance.

---

## Fitur Utama / Key Features

- **Eksplorasi Anatomi 3D Interaktif**: Rotasi 360°, zoom, seleksi struktur organ, dan eksplorasi per sistem tubuh (Rangka, Otot, Jantung, Organ Sensorik, Arteri, dll.).
- **Tampilan Rakit & Terurai (Exploded View)**: Berpindah dari bentuk tubuh utuh ke inventaris visual setiap komponen anatomi yang sedang aktif.
- **Lokalisasi Medis Bahasa Indonesia**: Nama struktur, definisi organ, dan terminologi medis yang telah disesuaikan dengan standar terminologi medis Indonesia dan SNOMED CT.
- **Tanya Maki (Asisten AI Cerdas)**: Chatbot pintar bertenaga Google Gemini API untuk konsultasi dan tanya-jawab anatomi manusia secara interaktif. Kunci API dan pemilihan model Gemini dapat diatur langsung melalui menu Pengaturan (Settings) di antarmuka web.
- **Kustomisasi Branding Fleksibel**: Pengaturan judul aplikasi, logo header, dan favicon tab browser dinamis yang tersimpan secara lokal dan di server.
- **Manajer Data Anatomi**: Manajemen basis data anatomi terintegrasi (`anatomy_db.json`) dengan opsi sinkronisasi ke server cPanel (`db.php`).
- **Lab Terminologi Medis & Tugas Dosen**: Modul belajar morfem (prefiks, akar kata, sufiks), istilah medis, singkatan klinis/RMIK, kuis pilihan ganda, jodoh kata, rakit istilah, Kuis 3D interaktif, serta sistem tugas bernilai di server PHP/SQLite (`public/3d-anatomy/lab/`) dengan dukungan autentikasi OAuth2/SSO opsional (termasuk mock SSO untuk uji lokal).

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

## Deployment & Instalasi Server Produksi

> **Penting (Aturan Subfolder `/3d-anatomy/`):**  
> Aplikasi dikonfigurasi dengan base path **`/3d-anatomy/`**. Untuk server web (Apache, Nginx, XAMPP, Laragon, cPanel, IIS), seluruh isi hasil build atau arsip rilis **harus diletakkan di dalam subfolder `3d-anatomy/`** di bawah document root (sehingga diakses melalui `https://domain-anda/3d-anatomy/`).

```text
<document_root>/                 (mis. public_html/ atau C:\xampp\htdocs\)
└── 3d-anatomy/
    ├── index.html
    ├── .htaccess                (proteksi file rahasia & routing Apache)
    ├── assets/
    ├── models/                  (dari human-atlas-models.zip)
    └── 3d-anatomy/
        ├── db.php, updater.php, _admin_auth.php, set-admin-pass.php
        ├── .htadmin_pass        (dibuat saat setup awal)
        └── lab/                 (backend Lab Terminologi & Tugas Dosen)
```

---

### Opsi A: Instalasi Cepat dari GitHub Releases (Linux / cPanel — Tanpa Node.js)

Cocok untuk shared hosting cPanel atau VPS Linux dengan Apache + PHP 8.1+:

1. **Unduh paket rilis terbaru** dari halaman **GitHub Releases**:
   - `human-atlas-app.zip` (~1,2 MB)
   - `human-atlas-models.zip` (~145 MB — aset model 3D, hanya perlu diunduh sekali saat instalasi awal)
2. **Ekstrak kedua arsip** ke dalam folder `public_html/3d-anatomy/`.
3. **Pastikan ekstensi PHP aktif** di cPanel (*Select PHP Version*): `pdo_sqlite`, `sqlite3`, `zip`, `curl`, `openssl`, dan pastikan folder `3d-anatomy/` memiliki izin tulis bagi PHP.
4. **Atur Password Administrator (`.htadmin_pass`):**
   - **Jika hosting memiliki akses Terminal/SSH:**
     ```bash
     cd public_html/3d-anatomy/3d-anatomy
     php set-admin-pass.php
     ```
   - **Jika hosting cPanel TIDAK memiliki SSH/Terminal:** buat hash bcrypt di komputer lokal Anda dengan PHP:
     ```bash
     php -r "echo password_hash('PasswordAdminKuat123', PASSWORD_BCRYPT, ['cost'=>12]);"
     ```
     Salin 1 baris hash (`$2y$12$...`) ke file baru bernama **`.htadmin_pass`**, lalu unggah lewat File Manager ke `public_html/3d-anatomy/3d-anatomy/.htadmin_pass` (permission `0600`).
5. **Verifikasi keamanan di browser:** buka alamat berikut dan pastikan semuanya menghasilkan **403 Forbidden** (tidak dapat diunduh):
   - `/3d-anatomy/3d-anatomy/.htadmin_pass`
   - `/3d-anatomy/3d-anatomy/_admin_auth.php`
   - `/3d-anatomy/3d-anatomy/set-admin-pass.php`
   - `/3d-anatomy/3d-anatomy/lab/_lib.php`

---

### Opsi B: Instalasi di Server Windows 10 / Windows 11 (XAMPP, Laragon, atau Nginx/IIS)

Cocok untuk server lab lokal berbasis PC/mini-PC Windows 10 atau Windows 11:

#### 1. Menggunakan XAMPP atau Laragon (Apache + PHP 8.1+ — Disarankan)
1. Pasang **XAMPP** (versi PHP 8.1+) atau **Laragon**.
2. Buat folder `C:\xampp\htdocs\3d-anatomy\` (XAMPP) atau `C:\laragon\www\3d-anatomy\` (Laragon), lalu ekstrak **`human-atlas-app.zip`** dan **`human-atlas-models.zip`** ke dalam folder tersebut.
3. **Aktifkan ekstensi PHP wajib** di `php.ini` (mis. `C:\xampp\php\php.ini` — hapus tanda `;` di depan baris berikut):
   ```ini
   extension=pdo_sqlite
   extension=sqlite3
   extension=zip
   extension=curl
   extension=openssl
   ```
4. **Pastikan `mod_rewrite` & `.htaccess` aktif** di `httpd.conf` Apache (`C:\xampp\apache\conf\httpd.conf`):
   - Pastikan baris `LoadModule rewrite_module modules/mod_rewrite.so` tidak diberi `#`.
   - Di blok `<Directory "C:/xampp/htdocs">`, pastikan tertulis `AllowOverride All` agar `.htaccess` bekerja (melindungi `.htadmin_pass` dan `lab/`).
   - Restart Apache dari Control Panel XAMPP/Laragon.
5. **Atur Password Administrator** lewat Command Prompt / PowerShell:
   ```powershell
   cd C:\xampp\htdocs\3d-anatomy\3d-anatomy
   C:\xampp\php\php.exe set-admin-pass.php
   ```
   *(Di Windows, ketikan password tidak disembunyikan di layar — masukkan minimal 10 karakter lalu tekan Enter).*
6. **Buka akses jaringan lokal (LAN Lab):**
   - Buka **Windows Defender Firewall → Inbound Rules** dan izinkan port **80** (HTTP) atau **443** (HTTPS).
   - Akses dari komputer klien melalui `http://IP-PC-WINDOWS/3d-anatomy/`.
   - *Catatan:* Untuk fitur **Login SSO OAuth2** lintas komputer (selain `localhost`), browser modern mewajibkan HTTPS agar cookie sesi (`Secure`) tersimpan. Gunakan reverse proxy HTTPS lokal (mis. Caddy atau Laragon SSL) jika mengaktifkan SSO di jaringan LAN.

#### 2. Peringatan Jika Memakai Nginx atau IIS di Windows
`.htaccess` **hanya dibaca oleh Apache** (XAMPP/Laragon/cPanel), **bukan** oleh Nginx atau IIS. Jika memakai **Nginx**, tambahkan blok proteksi berikut di konfigurasi `server { ... }` sebelum dibuka ke jaringan:

```nginx
location ~* ^/3d-anatomy/(.*/)?(\.|set-admin-pass\.php|_admin_auth\.php|_lib\.php|_quiz\.php|terminologi\.json|config(\.[a-z]+)?\.php|config\.example\.php) {
    deny all;
    return 403;
}
location ~* ^/3d-anatomy/3d-anatomy/lab/data/ {
    deny all;
    return 403;
}
```
Jika memakai **IIS**, pasang aturan *Request Filtering / Authorization* di `web.config` untuk memblokir berkas dan folder yang sama.

---

### Opsi C: Aktivasi Fitur Tugas Dosen & SSO OAuth2 (Opsional)

1. Salin `3d-anatomy/3d-anatomy/lab/config.example.php` menjadi `config.php`.
2. Isi URL penyedia OAuth2/SSO Anda (`sopan_url`, `sopan_verify_url`), `client_id`, `client_secret`, `app_url`, `callback_url`, dan `session_secret` acak 64 karakter hex:
   ```bash
   php -r "echo bin2hex(random_bytes(32));"
   ```
3. Pastikan folder `3d-anatomy/3d-anatomy/lab/` dapat ditulis oleh PHP agar basis data `data/lab.sqlite` otomatis terbuat.

---

### Opsi D: Deploy Otomatis ke cPanel via FTP/FTPS (Untuk Developer / Maintainer)

Proyek ini dilengkapi script deploy otomatis via FTP/FTPS:

1. Salin template konfigurasi:
   ```bash
   cp .env.deploy.example .env.deploy
   ```
2. Isi `FTP_HOST`, `FTP_USER`, `FTP_PASS`, dan `APP_URL` pada `.env.deploy` (file ini dilindungi `.gitignore` sehingga tidak ikut terunggah ke GitHub).
3. Jalankan perintah deploy:
   ```bash
   npm run deploy
   ```
   *(Data produksi di server seperti `anatomy_db.json` yang sudah ada dilewati otomatis; gunakan `npm run deploy:force` bila ingin menimpa semua file).*

### Opsi E: Vercel / Static Hosting Lainnya

Konfigurasi `vercel.json` (beserta rewrite `/3d-anatomy/*`) telah disertakan. Cukup impor repositori ke Vercel sebagai proyek Vite untuk menjalankan mode statis (fitur 3D & latihan mandiri berjalan langsung tanpa PHP).

---

## Update Otomatis (Self-Hosted)

Untuk instansi atau pengguna lain yang memasang aplikasi ini di server PHP/Apache/Windows sendiri dan ingin mengikuti pembaruan resmi dari repositori ini:

1. Setiap rilis bertanda `v*` otomatis mempublikasikan dua arsip terpisah di **GitHub Releases** (via `.github/workflows/release.yml`):
   - **`human-atlas-app.zip` (~1,2 MB):** kode frontend hasil build, backend PHP, dan data terminologi.
   - **`human-atlas-models.zip` (~145 MB):** aset model 3D (cukup dipasang saat instalasi awal atau bila aset 3D berubah).
   - **`release-manifest.json`:** versi dan checksum **SHA-256**.
2. Di aplikasi Anda, buka **Settings → Pembaruan Aplikasi → Cek Pembaruan**, lalu klik **Pasang Update** (wajib password Administrator `.htadmin_pass`).
3. File lokal server (`3d-anatomy/lab/config.php`, `3d-anatomy/lab/data/lab.sqlite`, `3d-anatomy/.htadmin_pass`, `3d-anatomy/custom-favicon.png`, `models/`, serta `3d-anatomy/anatomy_db.json` bila sudah ada di server) **otomatis dilindungi dan tidak pernah ditimpa**, disertai opsi **Rollback** 1-klik ke versi sebelumnya.

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
