# SIM Cimahi Hotel Institute

Implementasi PRD v2.0 (`../PRD_SIM_Cimahi_Institute_Hotel.md`). Stack sesuai PRD: React (Vite) + Tailwind v4, Node.js (Express), MySQL.

## Menjalankan

Butuh Node 20+ dan MySQL 8 atau MariaDB 10.4+ (XAMPP cukup).

```
# 1. Database
mysql -u root -e "CREATE DATABASE cih_sim CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
mysql -u root cih_sim < server/schema.sql

# 2. Server
cd server
cp .env.example .env        # isi JWT_SECRET dan kredensial DB
npm install
npm run seed                # data demo, semua akun berpassword demo12345

# 3. Frontend dan API (satu perintah, satu port, dari folder chi-sim)
cd ..
npm install
npm run dev                 # http://localhost:4000 (aplikasi dan /api)
```

Frontend dan API berjalan di satu proses dan satu port (4000). Saat pengembangan, Express memasang Vite sebagai middleware sehingga hot reload tetap jalan. Tidak ada lagi server terpisah di 5173 (`npm run dev:vite` masih tersedia bila perlu).

Produksi: `npm run build` di folder frontend, lalu `NODE_ENV=production npm start` di `server`. Express menyajikan `dist/` sekaligus API. Seed demo menolak berjalan saat `NODE_ENV=production`.

Panduan uji lengkap dari pendaftaran sampai kelulusan: `PANDUAN_PENGGUNAAN.md`. Mengosongkan data peserta untuk mulai dari awal: `cd server && npm run reset:peserta` (data katalog, jadwal, staf, dan landing page tetap). Uji otomatis (setelah `npm run seed` dan server berjalan): `node server/test/e2e.mjs` (48 pemeriksaan alur, izin akses, unggahan, PDF, kuota bersamaan), `node server/test/jadwal.mjs` (60 pemeriksaan bank mapel, jadwal Akademik, dan pertemuan instruktur), `node server/test/profile.mjs` (48 pemeriksaan registrasi, data diri, dan pemisahan Pendaftar/Peserta), `node server/test/media.mjs`. Jalankan `npm run seed` lagi setelahnya untuk membersihkan data uji.

## Isi

| Area | Yang ada |
|---|---|
| Publik | Landing page dari CMS, detail program, pendaftaran dengan pilihan pelatihan dan angkatan (email 2x, deteksi typo, honeypot), lupa dan atur ulang password, verifikasi email, cek status peserta dengan NIP `/cek-status` (tautan lama `/verifikasi` diarahkan ke sini) |
| Peserta | Katalog, tagihan dengan kode unik, unggah bukti, form data diri lengkap (wajib setelah bayar dikonfirmasi; ruang belajar terkunci sebelum itu), ruang belajar (jadwal, materi, tugas, nilai), transkrip PDF |
| Keuangan | Antrean verifikasi dengan selisih nominal, setujui atau tolak (alasan wajib), kwitansi lewat antrean email |
| Pendaftaran | Program, angkatan, **Pendaftar** (belum melengkapi data diri, ada tombol pengingat) dan **Peserta** (data diri lengkap, detail dan berkas),  pengumuman email per segmen |
| Akademik | Bank mata pelajaran per kurikulum pelatihan (tiap angkatan memakai satu kurikulum, jadi mata pelajarannya bisa berbeda), jadwal angkatan (pilih pelatihan, lalu instruktur, hari, jam, lokasi, dan mata pelajaran dari bank beserta jumlah pertemuannya), validasi nilai dengan penimpaan beralasan |
| Instruktur | Pertemuan per angkatan dari mata pelajaran yang dipilih Akademik (ada jatah per mapel), materi (PDF atau tautan) per pertemuan, absensi, nilai teori dan praktik, tugas dan penilaiannya |
| CMS (Super Admin dan Admin Pendaftaran; hapus media hanya Super Admin) | Section terstruktur, draf, pratinjau desktop dan mobile, terbit, riwayat dan rollback, pustaka media (alt wajib, WebP dua ukuran) |
| Super Admin | Pengguna staf (paksa ganti password), pengaturan, audit log |

## Keputusan teknis yang perlu diketahui

- **Sesi:** satu cookie JWT httpOnly (7 hari, SameSite Lax), bukan pasangan access dan refresh token seperti PRD T21. Lebih sederhana dan tidak bisa dibaca JavaScript, tetapi tidak ada pencabutan token per perangkat.
- **Hak akses** dipaksa di server: `server/src/actions.js` (tabel role per aksi) dan `server/src/state.js` (data apa yang dikirim ke tiap role). Frontend hanya menyembunyikan menu.
- **Atomik:** verifikasi pembayaran, pendaftaran (kunci baris angkatan, mencegah oversell), dan penomoran NIP memakai transaksi.

- **Sertifikat dihapus:** fitur sertifikat dan template sertifikat sudah dihapus dari aplikasi. Tabel `certificates`, `certificate_sequences`, dan `certificate_templates` dibiarkan di database agar data lama tidak hilang; tidak ada kode yang membacanya lagi, kecuali saat peserta dihapus (baris sertifikat lamanya ikut dibersihkan).
- **Berkas:** tipe diperiksa dari magic bytes, maksimal 2 MB, nama diacak, disimpan di `server/uploads` (di luar web root) dan disajikan lewat endpoint yang memeriksa pemilik.
- **Waktu:** semua kolom waktu UTC. Koneksi diset `time_zone = '+00:00'`.
- **Email:** antrean `email_queue` diproses tiap menit (20 per tick, retry 1, 5, 30 menit). Tanpa `SMTP_HOST`, email hanya dicatat sebagai terkirim dengan catatan "mode dev".
- **Database:** JSON disimpan sebagai TEXT agar jalan di MySQL 8 maupun MariaDB. Indeks unik parsial tidak ada di MySQL, jadi aturan "satu pendaftaran hidup per angkatan" dijaga di kode dalam transaksi.

## Bank soal seleksi

`server/src/bankSoal.js` berisi bank soal "Seleksi masuk: Hospitality dan TPA": 50 soal perhotelan (front office, housekeeping, food and beverage, kebersihan dan keselamatan, istilah bahasa Inggris) dan 50 soal tes potensi akademik (sinonim, antonim, analogi, pengelompokan kata, deret, hitungan, soal cerita, penalaran logis). Setiap soal punya 4 pilihan. Bank ini ikut dibuat oleh `npm run seed`. Untuk database yang sudah berjalan: `cd server && npm run bank-soal`. Skrip ini aman dijalankan berulang (dilewati bila bank dengan nama yang sama sudah ada) dan tidak mengubah bank soal lain.

## Data wilayah

Alamat peserta memakai pilihan berjenjang provinsi, kota/kabupaten, kecamatan dari `server/data/wilayah.json` (34 provinsi, 514 kota/kabupaten, 7.215 kecamatan, sumber: github.com/emsifa/api-wilayah-indonesia). Server menyajikannya di `/api/wilayah/*` dan memvalidasi rantai wilayah saat data diri disimpan, nama wilayah selalu diambil dari dataset. Untuk membangun ulang: `node server/scripts/fetch-wilayah.mjs`. Kelurahan atau desa belum ada di dataset ini, jadi ditulis di kolom alamat jalan.

## Belum ada

- CAPTCHA sungguhan (PRD AUTH-2). Yang ada: honeypot, rate-limit per IP, dan penguncian 15 menit setelah 5 kali salah password. Menambah hCaptcha atau Turnstile butuh kunci situs dari Anda.
- Pengirim SMTP produksi, SPF/DKIM/DMARC: isi `SMTP_*` di `server/.env`.
- Penjadwalan terbit landing page otomatis (LP-9), halaman dinamis tambahan (LP-10), berita (LP-11), pelacakan klik CTA (LP-14).
- Laporan keuangan CSV/XLSX (PAY-7), template email yang bisa diedit (EML-2), berhenti berlangganan (EML-5), backup terjadwal (ADM-4).
- Integrasi payment gateway, cicilan, dan pengembalian dana (sesuai PRD, rilis 2).
- Berkas bukti transfer pada data seed tidak ada di disk; unggahan lewat aplikasi bekerja normal.

## Hosting gratis dengan Cloudflare Tunnel

Server, MySQL, dan unggahan tetap berjalan di komputer atau VPS sendiri. Cloudflare Tunnel hanya membuka alamat `https://` publik ke port 4000.

```bash
# 1. Build frontend (tombol login demo disembunyikan). Untuk uji coba dengan tombol demo: VITE_SHOW_DEMO=1 npm run build
npm run build

# 2. Jalankan server produksi (di server/.env: JWT_SECRET acak panjang, APP_URL diisi alamat tunnel)
cd server
NODE_ENV=production npm start        # PowerShell: $env:NODE_ENV='production'; npm start

# 3. Terminal lain: buka tunnel sementara (alamat acak *.trycloudflare.com)
cloudflared tunnel --url http://localhost:4000
```

Alamat tetap dengan domain sendiri: `cloudflared tunnel login`, `cloudflared tunnel create cih`, arahkan hostname ke `http://localhost:4000`, lalu `cloudflared tunnel run cih`. Aplikasi hanya hidup selama komputer, MySQL, dan tunnel menyala. Sebelum dibuka ke publik, ganti password akun staf yang masih `demo12345`.
