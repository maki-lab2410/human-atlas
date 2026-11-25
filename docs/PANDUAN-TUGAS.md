# Panduan Tugas Terminologi (Dosen/Laboran)

Perlu login SOPAN dengan peran **dosen**, **laboran**, atau **admin**. Di Atlas: tombol **Istilah** → **Masuk dengan SOPAN** → tab **Kelola**.

## Membuat tugas
Klik **Buat tugas baru**, lalu isi:

| Isian | Keterangan |
|---|---|
| Judul | Nama tugas yang dilihat mahasiswa |
| Fokus materi | Satu atau beberapa: Morfem, Singkatan RMIK, atau sistem tubuh (mis. Pernapasan) |
| Jenis soal | Arti morfem, arti istilah, istilah dari definisi, jenis bagian kata, benar/salah, membaca catatan rekam medis, singkatan |
| Jumlah soal | 5–50 (mis. 20) |
| Waktu (menit) | 0 = tanpa batas. Waktu berjalan sejak mahasiswa menekan Mulai dan tetap berjalan bila halaman ditutup |
| Tenggat | Opsional. Setelah tenggat, tugas ditolak kecuali "terima pengerjaan setelah tenggat" dicentang (ditandai terlambat) |
| Maksimal percobaan | 1, 2, 3, 5, atau tanpa batas |
| Nilai yang dipakai | Terbaik, terakhir, atau pertama |
| Soal | **Diacak per mahasiswa** (susunan berbeda) atau **sama untuk semua** |
| Angkatan | Opsional. Bila diisi, hanya angkatan itu yang dapat melihat dan mengerjakan |

Setelah dibuat, muncul **kode tugas** (mis. `TGS-6GM2`). Bagikan kode itu; mahasiswa juga akan melihat tugas di tab **Tugas** bila angkatannya sesuai.

## Mengelola
- **Rekap**: nilai per mahasiswa (sesuai aturan nilai yang dipilih), rata-rata/tertinggi/terendah, penanda *terlambat*, *lewat waktu*, *belum selesai*; unduh **CSV nilai** dan **CSV semua percobaan**.
- **Ubah**: judul, tenggat, waktu, percobaan, dan aturan nilai selalu bisa diubah. **Materi, jenis soal, jumlah soal, dan pengacakan terkunci** setelah ada yang mengerjakan.
- **Tutup/Buka**: menutup tugas agar tidak bisa dimulai lagi (data tetap ada).
- **Hapus**: hanya untuk tugas yang belum dikerjakan siapa pun.

## Cara kerja untuk mahasiswa
Memasukkan kode atau memilih tugas → melihat ringkasan aturan → **Mulai sekarang**. Selama mengerjakan tidak ada penanda benar/salah.
- **Soal dan kunci jawaban ada di server.** Browser mahasiswa hanya menerima soal tanpa kunci; tiap jawaban langsung disimpan ke server dan **tidak dapat diubah**.
- **Server yang menilai.** Skor tidak dikirim dari browser, jadi tidak dapat dimanipulasi dari sisi mahasiswa.
- Kemajuan tersimpan di server: bila halaman ditutup atau pindah perangkat, soal yang sama dilanjutkan dari nomor berikutnya (waktu tetap berjalan).
- Bila waktu habis, jawaban yang sudah tersimpan dinilai otomatis (soal yang belum dijawab dihitung salah) dan percobaan ditandai *lewat waktu*.

## Hal yang perlu diketahui
- **Fokus "Morfem"** mengambil morfem dari seluruh sistem (bukan hanya satu sistem). Pilih nama sistem (mis. Pernapasan) bila ingin soal terbatas pada sistem itu.
- **Soal "sama untuk semua"** dibuat sekali lalu disimpan di tugas; mengubah data terminologi sesudahnya tidak mengubah soal tugas itu. Pada mode "diacak per mahasiswa", tiap percobaan mendapat susunan baru.
- Rekap hanya menampilkan mahasiswa yang **sudah memulai** (server tidak punya daftar kelas), jadi yang belum mengerjakan tidak muncul.
- Pengacakan per mahasiswa membuat soal tiap orang berbeda; pilih **Sama untuk semua** bila perbandingan antar mahasiswa penting.
- Tidak ada pembahasan jawaban setelah selesai (agar kunci tidak bocor ke percobaan berikutnya atau ke teman).
- Soal tugas dibangun dari data terminologi di server. Setelah mengubah CSV, jalankan `python3 scripts/build-terminologi.py` lalu unggah ulang (salinan untuk server ikut diperbarui).
