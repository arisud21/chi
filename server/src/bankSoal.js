// Bank soal seleksi masuk: 50 soal hospitality/perhotelan + 50 soal tes potensi akademik (TPA/psikotes).
// Format tiap soal: [pertanyaan, [pilihan A, B, C, D], indeks kunci (0 = A)].
// Dipakai oleh `npm run bank-soal` (database yang sudah berjalan) dan oleh seed demo.
import { q, uid } from './lib.js'

export const BANK_NAME = 'Seleksi masuk: Hospitality dan TPA'

/** 50 soal pengetahuan perhotelan: front office, housekeeping, food and beverage, kebersihan dan keselamatan, istilah bahasa Inggris. */
export const HOSPITALITY = [
  // Front office
  ['Bagian hotel yang pertama kali berhubungan langsung dengan tamu saat tiba adalah...', ['Housekeeping', 'Front office', 'Engineering', 'Accounting'], 1],
  ['Tamu yang datang ke hotel tanpa melakukan reservasi terlebih dahulu disebut...', ['Walk-in guest', 'No-show guest', 'Early arrival', 'Over stay'], 0],
  ['Tamu yang sudah melakukan reservasi tetapi tidak datang dan tidak membatalkan disebut...', ['Walk-in', 'Cancellation', 'No-show', 'Late check-out'], 2],
  ['Kamar dengan satu tempat tidur besar untuk dua orang disebut...', ['Single room', 'Twin room', 'Triple room', 'Double room'], 3],
  ['Kamar dengan dua tempat tidur terpisah untuk dua orang disebut...', ['Twin room', 'Double room', 'Suite room', 'Single room'], 0],
  ['Status kamar "VC" (vacant clean) berarti...', ['Kamar terisi dan sudah dibersihkan', 'Kamar kosong, bersih, dan siap dijual', 'Kamar kosong tetapi masih kotor', 'Kamar sedang diperbaiki'], 1],
  ['Status kamar "OOO" (out of order) berarti...', ['Kamar kosong dan siap dijual', 'Kamar ditempati tamu VIP', 'Kamar tidak dapat dijual karena sedang diperbaiki', 'Tamu kamar tersebut sudah check-out'], 2],
  ['Proses ketika tamu menyelesaikan pembayaran dan meninggalkan hotel disebut...', ['Check-in', 'Registration', 'Reservation', 'Check-out'], 3],
  ['Formulir yang diisi tamu saat check-in berisi data diri tamu disebut...', ['Registration card', 'Guest bill', 'Room rack', 'Key card'], 0],
  ['Petugas yang membawakan barang bawaan tamu ke kamar adalah...', ['Doorman', 'Bellboy (bellman)', 'Operator', 'Cashier'], 1],
  ['Bagian yang menangani panggilan telepon masuk ke hotel adalah...', ['Concierge', 'Bell desk', 'Telephone operator', 'Reservation'], 2],
  ['Tugas utama concierge adalah...', ['Membersihkan kamar tamu', 'Memasak di dapur utama', 'Memperbaiki AC dan listrik', 'Memberi informasi dan membantu kebutuhan tamu, seperti tiket dan tur'], 3],
  ['Langkah pertama yang tepat saat menangani keluhan tamu adalah...', ['Mendengarkan keluhan dengan penuh perhatian', 'Membela diri dan menjelaskan kesalahan tamu', 'Langsung memanggil manajer tanpa mendengarkan', 'Meminta tamu menulis surat keluhan'], 0],
  ['Wake-up call adalah...', ['Panggilan darurat saat kebakaran', 'Layanan membangunkan tamu pada jam yang diminta', 'Panggilan dari restoran ke dapur', 'Panggilan untuk konfirmasi reservasi'], 1],
  ['Uang jaminan yang dibayarkan tamu di muka disebut...', ['Tip', 'Service charge', 'Deposit', 'Refund'], 2],
  ['Late check-out berarti...', ['Tamu check-in sebelum waktunya', 'Tamu membatalkan reservasi', 'Tamu pindah ke kamar lain', 'Tamu check-out melewati batas waktu yang ditentukan'], 3],
  ['Hotel memiliki 100 kamar dan 75 kamar terisi malam ini. Tingkat hunian (occupancy rate) hotel adalah...', ['75%', '25%', '50%', '100%'], 0],
  ['Sistem komputer untuk mengelola reservasi, check-in, kamar, dan tagihan tamu hotel disebut...', ['Point of Sale (POS)', 'Property Management System (PMS)', 'Spreadsheet', 'Antivirus'], 1],
  ['Petugas yang berjaga di pintu utama lobi untuk membukakan pintu dan menyambut tamu adalah...', ['Room attendant', 'Steward', 'Doorman', 'Cashier'], 2],

  // Housekeeping
  ['Kereta dorong berisi perlengkapan untuk membersihkan kamar disebut...', ['Luggage trolley', 'Banquet trolley', 'Room service trolley', 'Room attendant trolley (maid cart)'], 3],
  ['Tanda "Do Not Disturb" yang tergantung di pintu kamar berarti...', ['Tamu tidak ingin diganggu', 'Kamar boleh langsung dibersihkan', 'Tamu sudah check-out', 'Kamar perlu perbaikan'], 0],
  ['Layanan menyiapkan kamar untuk tidur malam, seperti membuka selimut dan merapikan kamar, disebut...', ['Make up room', 'Turn-down service', 'General cleaning', 'Room service'], 1],
  ['Barang tamu yang tertinggal dan ditemukan petugas dicatat lalu disimpan di bagian...', ['Laundry', 'Gudang dapur', 'Lost and found', 'Kasir restoran'], 2],
  ['Prinsip yang benar saat membersihkan permukaan di kamar adalah...', ['Dari bawah ke atas', 'Acak sesuai keinginan', 'Mulai dari lantai', 'Dari atas ke bawah'], 3],
  ['Guest amenities adalah...', ['Perlengkapan gratis untuk tamu, seperti sabun, sampo, dan sikat gigi', 'Tagihan tambahan di kamar', 'Daftar harga kamar', 'Jadwal kerja karyawan'], 0],
  ['Dalam istilah hotel, "bed sheet" adalah...', ['Sarung bantal', 'Sprei', 'Keset kamar mandi', 'Selimut'], 1],
  ['Departemen yang bertanggung jawab atas kebersihan kamar dan area umum hotel adalah...', ['Front office', 'Food and beverage', 'Housekeeping', 'Security'], 2],
  ['Sebelum masuk kamar tamu, room attendant yang benar akan...', ['Langsung membuka pintu dengan kunci master', 'Menelepon kamar dari lobi', 'Menunggu tamu keluar kamar', 'Mengetuk pintu dan menyebut "Housekeeping"'], 3],

  // Food and beverage
  ['Sistem pelayanan ketika tamu mengambil sendiri makanan dari meja hidang disebut...', ['Buffet service', 'American service', 'Russian service', 'Room service'], 0],
  ['Pada American service, makanan...', ['Disajikan dari mangkuk besar oleh pelayan', 'Sudah ditata di piring dari dapur lalu dibawa ke meja tamu', 'Diambil sendiri oleh tamu', 'Dimasak di depan tamu'], 1],
  ['Layanan makanan dan minuman yang diantar ke kamar tamu disebut...', ['Banquet', 'Buffet', 'Room service', 'Take away'], 2],
  ['Minuman umumnya disajikan kepada tamu dari sisi...', ['Kiri tamu', 'Depan tamu', 'Belakang tamu', 'Kanan tamu'], 3],
  ['Menu dengan harga yang tercantum untuk setiap hidangan secara terpisah disebut...', ['A la carte', 'Table d\'hote', 'Set menu', 'Buffet menu'], 0],
  ['Table d\'hote menu adalah...', ['Menu yang dipilih satu per satu dengan harga masing-masing', 'Menu lengkap beberapa hidangan dengan satu harga', 'Menu khusus minuman', 'Menu khusus anak-anak'], 1],
  ['Urutan hidangan western (menu kontinental) yang benar adalah...', ['Main course, appetizer, soup, dessert', 'Soup, dessert, appetizer, main course', 'Appetizer, soup, main course, dessert', 'Dessert, main course, soup, appetizer'], 2],
  ['Banquet adalah...', ['Restoran yang buka 24 jam', 'Bar di pinggir kolam renang', 'Dapur khusus kue', 'Pelayanan makan untuk acara kelompok besar, seperti pernikahan dan rapat'], 3],
  ['Peralatan makan seperti sendok, garpu, dan pisau disebut...', ['Cutlery (silverware)', 'Glassware', 'Chinaware', 'Linen'], 0],
  ['Mise en place berarti...', ['Penutupan restoran', 'Persiapan peralatan dan bahan sebelum operasional dimulai', 'Pencucian piring kotor', 'Penyajian hidangan penutup'], 1],
  ['Bagian dapur hotel yang membuat roti dan kue adalah...', ['Butcher', 'Steward', 'Pastry and bakery', 'Banquet'], 2],
  ['Tugas utama steward department adalah...', ['Menerima tamu restoran', 'Menyusun menu', 'Melayani tamu di bar', 'Mencuci dan menjaga kebersihan peralatan dapur dan makan'], 3],
  ['Mocktail adalah...', ['Minuman campuran tanpa alkohol', 'Koktail berkadar alkohol tinggi', 'Kopi tubruk', 'Air mineral'], 0],
  ['Juru masak yang memimpin seluruh dapur hotel disebut...', ['Commis', 'Executive chef', 'Cook helper', 'Steward'], 1],

  // Kebersihan, keamanan pangan, dan keselamatan
  ['Rentang suhu "danger zone" tempat bakteri pada makanan berkembang cepat adalah...', ['-18°C sampai 0°C', '0°C sampai 4°C', '5°C sampai 60°C', 'Di atas 75°C'], 2],
  ['Dalam penyimpanan bahan makanan, FIFO berarti...', ['Fast in, fast out', 'Fresh in, fresh out', 'Food in, food out', 'First in, first out'], 3],
  ['Mencuci tangan dengan sabun sebaiknya dilakukan minimal selama...', ['20 detik', '3 detik', '5 detik', '10 menit'], 0],
  ['APAR adalah singkatan dari...', ['Alat Pengukur Air Rendah', 'Alat Pemadam Api Ringan', 'Alat Pengaman Arus Rumah', 'Alat Panggil Area Resepsionis'], 1],
  ['Saat terjadi kebakaran, tamu harus diarahkan keluar melalui...', ['Lift', 'Jendela kamar', 'Tangga darurat menuju titik kumpul', 'Atap gedung'], 2],

  // Sikap kerja dan bahasa Inggris
  ['Grooming bagi karyawan hotel berarti...', ['Pelatihan memasak', 'Pembersihan kamar', 'Teknik menjawab telepon', 'Kerapian dan kebersihan penampilan diri'], 3],
  ['Ungkapan "May I help you?" digunakan untuk...', ['Menawarkan bantuan', 'Meminta maaf', 'Mengucapkan selamat tinggal', 'Menolak permintaan'], 0],
  ['Bahasa Inggris dari "handuk" adalah...', ['Pillow', 'Towel', 'Blanket', 'Curtain'], 1],
]

/** 50 soal tes potensi akademik: verbal, numerik, dan penalaran logis. */
export const TPA = [
  // Verbal: sinonim
  ['Sinonim kata "efisien" adalah...', ['Boros', 'Lambat', 'Tepat guna', 'Rumit'], 2],
  ['Sinonim kata "kendala" adalah...', ['Hambatan', 'Tujuan', 'Kemudahan', 'Hasil'], 0],
  ['Sinonim kata "akurat" adalah...', ['Kira-kira', 'Teliti', 'Cepat', 'Kasar'], 1],
  ['Sinonim kata "prioritas" adalah...', ['Tambahan', 'Pilihan terakhir', 'Kebiasaan', 'Yang diutamakan'], 3],
  ['Sinonim kata "ramah" adalah...', ['Kasar', 'Bersahabat', 'Pendiam', 'Galak'], 1],
  ['Sinonim kata "rasional" adalah...', ['Masuk akal', 'Emosional', 'Mustahil', 'Khayalan'], 0],
  // Verbal: antonim
  ['Antonim kata "optimis" adalah...', ['Yakin', 'Semangat', 'Pesimis', 'Percaya'], 2],
  ['Antonim kata "statis" adalah...', ['Diam', 'Tetap', 'Kaku', 'Dinamis'], 3],
  ['Antonim kata "sementara" adalah...', ['Permanen', 'Sebentar', 'Singkat', 'Sejenak'], 0],
  ['Antonim kata "ekspor" adalah...', ['Produksi', 'Impor', 'Distribusi', 'Konsumsi'], 1],
  ['Antonim kata "mayoritas" adalah...', ['Seluruh', 'Sebagian besar', 'Minoritas', 'Banyak'], 2],
  ['Antonim kata "rajin" adalah...', ['Tekun', 'Giat', 'Ulet', 'Malas'], 3],
  // Verbal: analogi
  ['Dokter : Rumah sakit = Koki : ...', ['Dapur', 'Pasar', 'Kebun', 'Sekolah'], 0],
  ['Pena : Menulis = Gunting : ...', ['Kertas', 'Memotong', 'Tajam', 'Menjahit'], 1],
  ['Air : Haus = Makanan : ...', ['Kenyang', 'Minum', 'Lapar', 'Piring'], 2],
  ['Telur : Ayam = Susu : ...', ['Putih', 'Gelas', 'Minum', 'Sapi'], 3],
  ['Kunci : Pintu = Kata sandi : ...', ['Akun', 'Angka', 'Rahasia', 'Huruf'], 0],
  ['Panas : Api = Dingin : ...', ['Air', 'Es', 'Angin', 'Malam'], 1],
  // Verbal: pengelompokan kata
  ['Kata yang tidak termasuk kelompoknya adalah...', ['Sendok', 'Garpu', 'Piring', 'Pisau'], 2],
  ['Kata yang tidak termasuk kelompoknya adalah...', ['Mawar', 'Melati', 'Anggrek', 'Bayam'], 3],

  // Numerik: deret angka
  ['Lanjutan deret 2, 4, 8, 16, ... adalah...', ['32', '24', '20', '30'], 0],
  ['Lanjutan deret 3, 6, 9, 12, ... adalah...', ['14', '15', '16', '18'], 1],
  ['Lanjutan deret 1, 4, 9, 16, 25, ... adalah...', ['30', '35', '36', '49'], 2],
  ['Lanjutan deret 100, 95, 85, 70, 50, ... adalah...', ['40', '35', '30', '25'], 3],
  ['Lanjutan deret 2, 3, 5, 8, 12, 17, ... adalah...', ['23', '22', '24', '25'], 0],
  ['Lanjutan deret 1, 1, 2, 3, 5, 8, ... adalah...', ['11', '13', '12', '15'], 1],
  ['Lanjutan deret 5, 10, 7, 14, 11, ... adalah...', ['17', '15', '22', '8'], 2],
  // Numerik: hitungan dan soal cerita
  ['25% dari 240 adalah...', ['48', '50', '54', '60'], 3],
  ['3/4 + 1/8 = ...', ['7/8', '4/12', '1/2', '5/8'], 0],
  ['Harga kamar Rp800.000 mendapat diskon 15%. Harga setelah diskon adalah...', ['Rp720.000', 'Rp680.000', 'Rp650.000', 'Rp785.000'], 1],
  ['12 × 15 − 30 = ...', ['140', '160', '150', '170'], 2],
  ['Rata-rata dari 70, 80, 90, dan 60 adalah...', ['70', '72,5', '80', '75'], 3],
  ['Seorang room attendant membersihkan 1 kamar dalam 30 menit. Waktu yang dibutuhkan untuk membersihkan 14 kamar adalah...', ['7 jam', '6 jam', '8 jam', '7,5 jam'], 0],
  ['Restoran memiliki 12 meja, masing-masing 4 kursi. Jika 75% kursi terisi, jumlah tamu adalah...', ['32 orang', '36 orang', '40 orang', '44 orang'], 1],
  ['Jika 1 USD = Rp16.000, maka 50 USD sama dengan...', ['Rp80.000', 'Rp8.000.000', 'Rp800.000', 'Rp160.000'], 2],
  ['0,25 × 0,4 = ...', ['1', '0,01', '0,001', '0,1'], 3],
  ['Jika 2x + 5 = 17, maka nilai x adalah...', ['6', '7', '5', '11'], 0],
  ['Perbandingan karyawan pria dan wanita adalah 3 : 5. Jika jumlah seluruh karyawan 64 orang, jumlah karyawan wanita adalah...', ['24 orang', '40 orang', '35 orang', '30 orang'], 1],
  ['Sebuah mobil melaju 60 km/jam. Waktu yang dibutuhkan untuk menempuh 150 km adalah...', ['2 jam', '3 jam', '2,5 jam', '2 jam 15 menit'], 2],

  // Penalaran logis
  ['Semua karyawan hotel memakai seragam. Budi adalah karyawan hotel. Kesimpulan yang tepat adalah...', ['Budi tidak memakai seragam', 'Budi mungkin memakai seragam', 'Semua yang berseragam adalah karyawan hotel', 'Budi memakai seragam'], 3],
  ['Semua koki pandai memasak. Sebagian koki suka menyanyi. Kesimpulan yang tepat adalah...', ['Sebagian yang pandai memasak suka menyanyi', 'Semua yang suka menyanyi adalah koki', 'Tidak ada koki yang suka menyanyi', 'Semua yang pandai memasak adalah koki'], 0],
  ['Jika hujan, maka jalan basah. Ternyata jalan tidak basah. Kesimpulan yang tepat adalah...', ['Hujan', 'Tidak hujan', 'Mungkin hujan', 'Tidak dapat disimpulkan'], 1],
  ['Jika tamu puas, maka tamu akan kembali. Tamu tidak kembali. Kesimpulan yang tepat adalah...', ['Tamu puas', 'Tamu kembali', 'Tamu tidak puas', 'Tidak dapat disimpulkan'], 2],
  ['Tidak ada pegawai yang datang terlambat. Rina adalah pegawai. Kesimpulan yang tepat adalah...', ['Rina datang terlambat', 'Rina mungkin terlambat', 'Rina bukan pegawai', 'Rina tidak datang terlambat'], 3],
  ['Andi lebih tinggi dari Budi. Budi lebih tinggi dari Citra. Siapa yang paling pendek?', ['Citra', 'Budi', 'Andi', 'Tidak dapat ditentukan'], 0],
  ['Dina lahir sebelum Eka. Fajar lahir setelah Eka. Siapa yang paling muda?', ['Dina', 'Fajar', 'Eka', 'Tidak dapat ditentukan'], 1],
  ['Lima tamu mengantre. Eko paling depan, Ani tepat di belakang Eko, Beni tepat di belakang Ani, Caca tepat di belakang Beni, dan Dodi paling belakang. Siapa yang berada di urutan ketiga dari depan?', ['Ani', 'Caca', 'Beni', 'Dodi'], 2],
  ['Hari ini hari Rabu. Sepuluh hari lagi adalah hari...', ['Jumat', 'Minggu', 'Senin', 'Sabtu'], 3],
  ['Jika semua A adalah B dan semua B adalah C, maka...', ['Semua A adalah C', 'Semua C adalah A', 'Sebagian C bukan B', 'Tidak ada A yang C'], 0],
  ['Lanjutan deret huruf A, C, E, G, ... adalah...', ['H', 'I', 'J', 'K'], 1],
]

/**
 * Buat bank soal bila belum ada (dicek dari namanya), lalu isi 100 soalnya. Aman dijalankan berulang.
 * Mengembalikan { created, bankId, count }.
 */
export async function importBankSoal() {
  const [ex] = await q('SELECT id FROM question_banks WHERE name = ?', [BANK_NAME])
  if (ex) return { created: false, bankId: ex.id, count: 0 }
  const bankId = uid()
  await q('INSERT INTO question_banks (id, name) VALUES (?,?)', [bankId, BANK_NAME])
  const all = [...HOSPITALITY, ...TPA]
  for (const [body, opts, ci] of all) await q('INSERT INTO questions (id, bank_id, body, options, correct_idx) VALUES (?,?,?,?,?)', [uid(), bankId, body, JSON.stringify(opts), ci])
  return { created: true, bankId, count: all.length }
}
