# Panduan Uji: Dari Pendaftaran sampai Sertifikat

Urutan ini menjalankan satu peserta melewati seluruh siklus: **daftar, bayar, verifikasi, data diri, belajar, nilai, sertifikat, cek keaslian**. Ikuti berurutan, karena tiap langkah bergantung pada langkah sebelumnya.

## Sebelum mulai

Jalankan (dua terminal, XAMPP MySQL harus menyala):

```
cd server && npm start        # API di http://localhost:4000
npm run dev                   # aplikasi di http://localhost:5173  (folder cih-sim)
```

Buka **http://localhost:5173**. Gunakan satu jendela browser biasa untuk peserta dan satu jendela **penyamaran (incognito)** untuk staf, supaya tidak perlu keluar-masuk akun.

Akun staf (password semua: `demo12345`):

| Peran | Email | Dipakai untuk |
|---|---|---|
| Super Admin | `super@cih.demo` | Pengaturan, landing page, audit log, pengguna |
| Admin Pendaftaran | `pendaftaran@cih.demo` | Program, angkatan, Pendaftar, Peserta, landing page |
| Admin Keuangan | `keuangan@cih.demo` | Verifikasi pembayaran |
| Akademik | `akademik@cih.demo` | Jadwal angkatan, validasi nilai, sertifikat, template |
| Instruktur Front Office | `instruktur@cih.demo` | Pertemuan, materi, absensi, nilai (angkatan Front Office dan Housekeeping) |
| Instruktur Tata Boga | `instruktur2@cih.demo` | Angkatan Food & Beverage dan Tata Boga |

Tidak ada akun peserta. Peserta dibuat di langkah 3.

Jalur uji ini memakai angkatan **FO-2026-B3 (Front Office Hotel)**, karena jadwalnya sudah ditetapkan: Selasa dan Kamis 13.00 sampai 16.00, instruktur `instruktur@cih.demo`, dengan 5 mata pelajaran dari bank (total 10 pertemuan): Pengantar Industri Perhotelan (1), Reservasi dan Front Desk (3), Check-in dan Check-out (3), Penanganan Keluhan Tamu (2), Etika dan Standar Pelayanan (1). Angkatan lain belum punya jadwal, jadi instruktur belum bisa menambah pertemuan di sana (ini bagian dari uji, lihat langkah 2).

---

## A. Persiapan (staf)

### 1. Pengaturan dan tampilan (Super Admin)
1. Masuk sebagai `super@cih.demo` → **Pengaturan**.
2. Isi **rekening bank** (bank, nomor, atas nama). Ini yang tampil di tagihan peserta. Isi juga alamat, telepon, WhatsApp, nama dan jabatan penanda tangan sertifikat. Simpan.
3. (Opsional) **Landing page**: ubah judul hero, **Pustaka media** untuk mengunggah gambar (teks alternatif wajib), **Pratinjau**, lalu **Terbitkan**. Buka `/` di jendela lain untuk melihat hasilnya. Coba **Kembalikan** versi lama di panel Riwayat.

### 2. Cek program, angkatan, dan jadwal
1. Masuk sebagai `pendaftaran@cih.demo` → **Program dan angkatan**. Pastikan FO-2026-B3 berstatus `open` dengan kuota 20. Coba **Angkatan** untuk membuat angkatan baru (status `draft`), lalu **Hapus** (angkatan kosong boleh dihapus).
2. Masuk sebagai `akademik@cih.demo`. Penyusunan jadwal dua tahap:
   - **Bank mata pelajaran**: pilih pelatihan **Front Office Hotel**. Terlihat 6 mata pelajaran (teori atau praktik, dengan jumlah jam). Coba **Mata pelajaran** untuk menambah satu, ubah, nonaktifkan (hilang dari pilihan jadwal tetapi tidak terhapus), dan **Hapus** (hanya bisa bila belum dipakai jadwal).
   - **Jadwal angkatan**: **1. Pilih pelatihan** (Front Office Hotel) → **2.** daftar angkatan pelatihan itu. FO-2026-B3 sudah berjadwal dan menampilkan mata pelajaran terpilih dengan jumlah pertemuan. Klik **Ubah jadwal** untuk melihat bentuk formulirnya: instruktur, hari, jam, lokasi, lalu centang mata pelajaran dari bank dan isi jumlah pertemuan tiap mapel. Pilih pelatihan lain (misalnya Housekeeping): angkatannya bertanda "belum ditetapkan", dan hanya mata pelajaran milik pelatihan itu yang muncul.
3. (Opsional) Akademik → **Template sertifikat**: seret elemen ke posisi baru, **Pratinjau PDF**, lalu **Simpan dan aktifkan**.

---

## B. Peserta mendaftar

### 3. Daftar dan pilih pelatihan
1. Di jendela peserta buka `/` → **Daftar angkatan ini**, atau langsung `/daftar`.
2. **Langkah 1**: pilih jenis pelatihan **Front Office Hotel**, lalu angkatan **FO-2026-B3**. Biaya dan sisa kursi tampil.
3. **Langkah 2**: isi nama, email (diketik dua kali; coba `@gmial.com` untuk melihat saran perbaikan), telepon, password minimal 8 karakter, centang persetujuan.
4. Klik **Daftar dan terbitkan tagihan**. Anda masuk ke **Pendaftaran saya**: ada nominal tagihan (harga + kode unik 3 digit), rekening tujuan, dan batas bayar 48 jam.

**Cek di sisi admin**: `pendaftaran@cih.demo` → **Pendaftar**. Peserta baru muncul dengan status "Menunggu pembayaran". Super Admin atau Admin Pendaftaran → **Pengumuman dan email** → antrean berisi email tagihan dan verifikasi.

### 4. Verifikasi email (boleh ditunda)
Di Beranda peserta ada peringatan "Email belum diverifikasi". Karena mode dev tidak mengirim email sungguhan, klik **Simulasikan klik tautan (mode dev)**. Email harus terverifikasi sebelum sertifikat dikirim lewat email, tetapi pembayaran tidak menunggu ini.

---

## C. Pembayaran

### 5. Peserta mengunggah bukti
**Pendaftaran saya** → **Unggah bukti**. Isi nama pengirim, tanggal, nominal sesuai tagihan, dan berkas JPG, PNG, atau PDF di bawah 2 MB. Status berubah menjadi "Menunggu verifikasi". (Coba unggah berkas `.txt` yang diganti nama menjadi `.png`: ditolak karena isinya dicek.)

### 6. Admin Keuangan memverifikasi
1. `keuangan@cih.demo` → **Verifikasi pembayaran**. Kartu menampilkan tagihan, nominal dibayar, selisih, dan tautan **lihat bukti**.
2. **Uji penolakan dulu**: klik **Tolak**, kosongkan alasan lalu kirim (ditolak, alasan wajib), isi alasan lalu kirim. Di sisi peserta, status kembali "Menunggu pembayaran" dengan alasan penolakan; unggah ulang bukti.
3. Kembali ke Keuangan → **Setujui**. Kwitansi masuk antrean email.

**Cek**: status registrasi peserta menjadi **Aktif**. Di **Pendaftar** (Admin Pendaftaran) kolom Data diri berubah menjadi **Menunggu diisi**, dashboard Admin Pendaftaran menampilkan tugas "peserta sudah bayar tetapi belum mengisi data diri", dan ada tombol **Kirim pengingat**.

---

## D. Data diri (wajib sebelum kelas)

### 7. Peserta melengkapi data diri
1. Beranda peserta menampilkan banner "Pembayaran dikonfirmasi". Buka **Ruang belajar**: terkunci dengan tombol **Lengkapi data diri**.
2. **Data diri**: isi identitas (NIK 16 digit), alamat berjenjang **Provinsi → Kota atau kabupaten → Kecamatan** (contoh: Jawa Barat → Kota Cimahi → Cimahi Selatan), kode pos, alamat jalan, **RT dan RW**, pendidikan, pekerjaan, kontak darurat, **pas foto** dan **scan KTP**.
3. Simpan. Ruang belajar terbuka.

**Cek di admin**: orang itu hilang dari **Pendaftar** dan muncul di **Peserta** (Admin Pendaftaran atau Akademik). **Detail** menampilkan semua data dan tautan foto dan KTP. Admin Keuangan tidak bisa melihat data ini.

---

## E. Pembelajaran

### 8. Instruktur menambah pertemuan dan materi
1. `instruktur@cih.demo` → **Pertemuan dan materi**, pilih **FO-2026-B3**. Bilah atas menampilkan jadwal dari Akademik.
2. **Pertemuan**: pilih **mata pelajaran** (hanya yang dipilih Akademik; yang jatahnya penuh tidak bisa dipilih), isi topik dan tanggal. Tanggal harus di antara tanggal mulai dan selesai angkatan (mulai 14 hari dari hari seeding); jam otomatis 13.00 mengikuti jadwal. Tambah 2 pertemuan, misalnya satu untuk Pengantar Industri Perhotelan dan satu untuk Reservasi dan Front Desk. Coba tambah pertemuan kedua untuk Pengantar (jatahnya 1): ditolak. Bilah atas menampilkan sisa jatah tiap mapel.
3. Pada tiap pertemuan, **Unggah berkas** (PDF) atau **Tautan** (harus `https://`) sebagai materi.
4. Bagian **Tugas** → **Tugas baru**.

**Cek peserta**: **Ruang belajar** menampilkan pertemuan berurutan dengan nama mata pelajarannya, materi di bawah tiap pertemuan, dan tugas. Kumpulkan tugas (catatan atau berkas), lalu instruktur menilai lewat tombol **Nilai** di bawah tugas.

### 9. Absensi
Instruktur → **Absensi** → pilih pertemuan → tandai peserta hadir, izin, sakit, atau alpa → **Simpan absensi**. Persentase kehadiran peserta di menu Nilai dihitung otomatis dari sesi yang sudah diabsen. Absensi tetap bisa disimpan walau tanggal pertemuan masih di masa depan.

---

## F. Nilai dan sertifikat

### 10. Penilaian
1. Instruktur → **Nilai dan kelulusan**. Isi nilai **teori** dan **praktik** (tersimpan saat Anda keluar dari kolom). Nilai akhir dan rekomendasi dihitung sistem: bobot 40/60, lulus bila nilai akhir ≥ 70 dan kehadiran ≥ 80%.
2. Klik **Kirim**. Setelah itu nilai terkunci untuk instruktur.
3. `akademik@cih.demo` → **Nilai dan kelulusan**. Coba **Kembalikan** (kembali ke draf; instruktur mengisi dan mengirim lagi). Lalu **Validasi** sesuai rekomendasi. Untuk menguji penimpaan: **Timpa** menuntut alasan.

### 11. Sertifikat
1. Akademik → **Sertifikat** → **Terbitkan** (satu sertifikat). Nomor berformat `CERT/CIH/2026/0001`.
2. **Lihat** → **Buka PDF sertifikat**: ada QR dan kode verifikasi 10 karakter.
3. Peserta → **Sertifikat** → **Lihat** → unduh **sertifikat PDF** dan **transkrip PDF**. (Kelulusan sudah divalidasi, jadi transkrip tersedia dari Ruang belajar juga.)

---

(Halaman publik `/program/front-office` juga menampilkan daftar mata pelajaran pelatihan itu.)

---

## G. Pemeriksaan publik dan pencabutan

### 12. Cek keaslian
Buka `/verifikasi`, masukkan kode verifikasi (dari PDF atau tabel Akademik), atau pindai QR. Hasilnya "Sertifikat sah" dengan nama, program, nomor, dan tanggal. Coba kode asal: "Kode tidak ditemukan".

### 13. Mencabut
Akademik → **Sertifikat** → **Cabut** (alasan wajib). Muat ulang `/verifikasi/KODE`: berubah menjadi "Sertifikat telah dicabut". Peserta tidak lagi bisa mengunduh PDF-nya.

---

## H. Pemeriksaan tambahan (Super Admin)

| Menu | Yang dilihat |
|---|---|
| **Audit log** | Semua aksi penting: daftar, bayar, verifikasi, data diri, nilai, sertifikat, perubahan landing page |
| **Pengumuman dan email** | Antrean email berstatus `queued` lalu `sent` (mode dev: tidak benar-benar dikirim). Coba kirim pengumuman ke satu angkatan |
| **Pengguna** | Buat staf baru dengan password awal; saat staf itu masuk pertama kali, aplikasi memaksa ganti password |
| Halaman Masuk → **Lupa password** | Alur atur ulang password. Hanya jalan untuk email yang sudah terverifikasi; tautannya ada di isi email (mode dev tidak menampilkannya di layar) |

## Uji tambahan yang berguna
- **Kuota**: ubah kuota angkatan menjadi 1, daftarkan dua akun peserta; yang kedua ditolak "Kuota angkatan penuh".
- **Satu program satu pendaftaran aktif**: peserta yang sama tidak bisa mendaftar dua angkatan dari program yang sama.
- **Hak akses**: buka `/admin/pembayaran` sebagai Akademik atau `/admin` sebagai peserta; keduanya dialihkan.
- **Hapus**: program atau angkatan yang sudah punya pendaftar tidak bisa dihapus, dan pesan galat menyarankan Arsip atau status `cancelled`.

## Mengulang dari awal

```
cd server
npm run reset:peserta     # hapus semua data pendaftar dan peserta; katalog, jadwal, staf, landing page tetap
npm run seed              # (opsional) kembalikan SEMUA data demo ke kondisi awal, termasuk akun peserta demo
```

Setelah `npm run seed`, ada empat akun peserta demo (`peserta@`, `baru@`, `datadiri@`, `lulus@` di `@cih.demo`, password sama) untuk uji cepat. Jalankan `npm run reset:peserta` lagi bila ingin mulai kosong. Skrip uji otomatis di `server/test/` membutuhkan data hasil `npm run seed`.
