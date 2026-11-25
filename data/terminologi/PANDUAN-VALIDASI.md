# Panduan Validasi Data Terminologi

Isi Lab Terminologi dibaca dari tiga file CSV di folder ini. Buka dengan Excel/Numbers/Google Sheets
(encoding UTF-8; kolom dipisah koma).

| File | Isi | Kolom penting |
|---|---|---|
| `morfem.csv` | prefiks, akar kata, sufiks | `bentuk`, `arti`, `status`, `catatan` |
| `istilah.csv` | istilah medis terurai | `istilah`, `bagian`, `indonesia`, `definisi`, `kategori`, `sistem`, `status`, `catatan` |
| `singkatan.csv` | singkatan klinis/RMIK | `singkatan`, `kepanjangan`, `arti`, `kategori`, `status`, `catatan` |

## Cara memeriksa
1. Baca tiap baris. Periksa **arti/definisi**, **padanan Indonesia**, dan (untuk istilah) **potongan kata**.
2. Isi kolom `status`:
   - `valid`   → sudah diperiksa dan benar
   - `revisi`  → ada yang salah/kurang tepat (tulis alasannya di kolom `catatan`)
   - `belum`   → belum diperiksa (bawaan)
3. Boleh langsung memperbaiki teks di kolom lain, lalu ubah `status` menjadi `valid`.

Di aplikasi, item berstatus selain `valid` ditandai titik kuning, dan header menampilkan persentase isi yang sudah divalidasi.

## Kolom `bagian` (hanya `istilah.csv`)
Potongan kata dipisah `|`, dalam urutan penulisan istilah. Bila potongan berbeda ejaan dengan id morfem,
tulis `potongan=id_morfem`.

- `peri|card=cardi|itis` → peri + card (morfem `cardi`) + itis → *pericarditis*
- Gabungan potongan **harus sama persis** dengan istilah (tanda kurung diabaikan).
- Vokal penghubung ditulis sebagai potongan sendiri: `cardi|o|megaly`.

## Menerapkan perubahan ke aplikasi
Setelah CSV disimpan, jalankan di terminal (dari folder proyek):

```bash
python3 scripts/build-terminologi.py
```

Skrip memeriksa otomatis (id ganda, potongan kata tidak cocok, morfem tidak ditemukan, kategori/status tidak valid,
`conceptId` tidak ada di model 3D). Bila ada kesalahan, skrip menampilkannya dan **tidak** menulis JSON.
Bila berhasil, muat ulang halaman aplikasi.

## Kategori yang diizinkan
- istilah: `anatomi`, `diagnosis`, `tindakan`, `gejala`, `ilmu`, `fisiologi`, `alat`, `obat`, `umum`
- singkatan: `tanda vital`, `diagnosis`, `laboratorium`, `pemeriksaan penunjang`, `resep`, `unit layanan`, `administrasi`, `statistik rumah sakit`, `umum`
- morfem `jenis`: `prefix`, `root`, `suffix`, `cv` (vokal penghubung)

## Hal yang perlu diperhatikan saat memeriksa
- Definisi sengaja singkat dan netral; jangan menambahkan dosis atau kriteria diagnosis.
- Singkatan yang sama dapat berarti lain (mis. **TB** = tuberkulosis / tinggi badan); keduanya sengaja ada, dibedakan kategori.
- Nomor kode ICD tidak dimasukkan (daftar judul ICD dimiliki WHO; periksa lisensi sebelum menyalin massal).

## File `prioritas-validasi.csv`
Ringkasan 131 item yang paling perlu dicermati lebih dulu (definisi ditulis manual, singkatan berarti ganda,
dan istilah lokal Indonesia). **File ini hanya daftar bantu**: tulis perbaikan dan ubah `status` di
`istilah.csv` / `singkatan.csv` (kolom `id` sama), lalu jalankan `python3 scripts/build-terminologi.py`.
