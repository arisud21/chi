// Mengisi data demo. Aman dijalankan ulang: mengosongkan tabel data lalu mengisi kembali. HANYA untuk pengembangan.
import bcrypt from 'bcryptjs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { UPLOAD_DIR, pool, q, uid } from './lib.js'
import { ensureCurricula, migrate } from './migrate.js'
import { importBankSoal } from './bankSoal.js'

if (process.env.NODE_ENV === 'production') throw new Error('Seed demo tidak boleh dijalankan di produksi.')

const day = 86_400_000
const at = (n) => new Date(Date.now() + n * day)
const dateOnly = (n) => at(n).toISOString().slice(0, 10)

const tables = ['news_reads', 'news', 'logbook_entries', 'placements', 'companies', 'registration_documents', 'exam_tokens', 'fee_items', 'exam_attempts', 'exams', 'questions', 'question_banks', 'notifications', 'installments', 'payment_plans', 'batch_subjects', 'participant_profiles', 'submissions', 'assignments', 'attendances', 'subject_grades', 'grades', 'certificates', 'certificate_sequences', 'certificate_templates', 'payments', 'materials', 'class_sessions', 'subjects', 'curricula', 'registration_discounts',
  'registrations', 'batches', 'programs', 'email_tokens', 'email_queue', 'audit_logs', 'landing_revisions', 'settings', 'files', 'users']
await migrate()
await q('SET FOREIGN_KEY_CHECKS = 0')
for (const t of tables) await q(`TRUNCATE TABLE ${t}`)
await q('SET FOREIGN_KEY_CHECKS = 1')

// Tabel files dikosongkan, jadi berkas fisiknya ikut dibersihkan agar tidak ada berkas yatim.
for (const name of await fs.readdir(UPLOAD_DIR)) await fs.unlink(path.join(UPLOAD_DIR, name)).catch(() => {})

const hash = await bcrypt.hash('demo12345', 10)
const U = {}
const users = [
  ['super', 'Super Admin', 'super@cih.demo', 'super_admin'], ['daftar', 'Admin Pendaftaran', 'pendaftaran@cih.demo', 'admin_pendaftaran'],
  ['uang', 'Admin Keuangan', 'keuangan@cih.demo', 'admin_keuangan'], ['akad', 'Staf Akademik', 'akademik@cih.demo', 'akademik'],
  ['ins1', 'Instruktur Front Office', 'instruktur@cih.demo', 'instruktur'], ['ins2', 'Instruktur Tata Boga', 'instruktur2@cih.demo', 'instruktur'],
  ['p1', 'Peserta Aktif', 'peserta@cih.demo', 'peserta'], ['p4', 'Peserta Belum Isi Data', 'datadiri@cih.demo', 'peserta'], ['p2', 'Peserta Baru', 'baru@cih.demo', 'peserta'], ['p3', 'Peserta Lulus', 'lulus@cih.demo', 'peserta'],
]
for (const [k, name, email, role] of users) {
  U[k] = uid()
  await q('INSERT INTO users (id, name, email, phone, password_hash, role, email_verified_at) VALUES (?,?,?,?,?,?,?)', [U[k], name, email, role === 'peserta' ? '0812000000' + k.slice(1) : '', hash, role, k === 'p2' ? null : new Date()])
}

const P = {}
const programs = [
  ['fo', 'front-office', 'Front Office Hotel', 'Hospitality', 'Check-in, reservasi, dan layanan tamu di meja depan.', 'Pelatihan operasional meja depan: reservasi, check-in dan check-out, penanganan keluhan, serta simulasi sistem manajemen properti.', 80, 2500000, 40, 60, 70, 80],
  ['hk', 'housekeeping', 'Housekeeping Profesional', 'Hospitality', 'Standar kebersihan kamar dan area publik hotel.', 'Prosedur pembersihan kamar, linen, area publik, dan pengelolaan laundry sesuai standar hotel berbintang.', 60, 1900000, 30, 70, 70, 80],
  ['fb', 'food-beverage-service', 'Food & Beverage Service', 'Hospitality', 'Pelayanan restoran, banquet, dan dasar barista.', 'Table setting, teknik penyajian, penanganan tamu restoran, dan dasar pelayanan minuman.', 70, 2100000, 30, 70, 70, 80],
  ['tb', 'tata-boga-dasar', 'Tata Boga Dasar', 'Kuliner', 'Teknik dasar dapur, sanitasi, dan olahan hidangan.', 'Teknik pisau, metode memasak, sanitasi dapur, dan penyusunan menu dasar.', 90, 2800000, 30, 70, 75, 85],
]
for (const [k, slug, title, cat, sd, d, h, price, tw, pw, kkm, att] of programs) {
  P[k] = uid()
  await q('INSERT INTO programs (id, slug, title, category, short_desc, description, duration_hours, price, theory_weight, practical_weight, passing_score, min_attendance) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [P[k], slug, title, cat, sd, d, h, price, tw, pw, kkm, att])
}

const B = {}
const batches = [
  ['fo1', 'fo', 'FO-2026-B3', 14, 60, 20, 'open', 'ins1', 'Ruang Simulasi Lt. 2'], ['fo0', 'fo', 'FO-2026-B2', -40, -2, 20, 'running', 'ins1', 'Ruang Simulasi Lt. 2'],
  ['hk1', 'hk', 'HK-2026-B2', 21, 60, 16, 'open', 'ins1', 'Ruang Praktik Kamar'], ['fb1', 'fb', 'FB-2026-B1', 10, 55, 18, 'open', 'ins2', 'Restoran Latih'],
  ['tb1', 'tb', 'TB-2026-B1', 30, 90, 12, 'open', 'ins2', 'Dapur Praktik'],
]
for (const [k, p, code, s, e, quota, status, ins, loc] of batches) {
  B[k] = uid()
  const sched = k === 'fo0' ? ['Sen,Rab,Jum', '09:00', '12:00', 12] : k === 'fo1' ? ['Sel,Kam', '13:00', '16:00', 10] : ['', null, null, 0] // total pertemuan sama dengan jumlah di batch_subjects di bawah
  await q('INSERT INTO batches (id, program_id, code, start_date, end_date, quota, status, instructor_id, location, schedule_days, start_time, end_time, planned_sessions) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', [B[k], P[p], code, dateOnly(s), dateOnly(e), quota, status, U[ins], loc, ...sched])
}

// Bank mata pelajaran per pelatihan.
const SJ = {}
const subjects = {
  fo: [['Pengantar Industri Perhotelan', 'teori', 8], ['Reservasi dan Front Desk', 'praktik', 20], ['Check-in dan Check-out', 'praktik', 16], ['Penanganan Keluhan Tamu', 'praktik', 12], ['Bahasa Inggris Perhotelan', 'teori', 16], ['Etika dan Standar Pelayanan', 'teori', 8]],
  hk: [['Dasar Housekeeping', 'teori', 8], ['Pembersihan dan Penataan Kamar', 'praktik', 20], ['Linen dan Laundry', 'praktik', 12], ['Keselamatan dan Kesehatan Kerja', 'teori', 8]],
  fb: [['Dasar Food & Beverage Service', 'teori', 8], ['Table Setting dan Penyajian', 'praktik', 20], ['Pelayanan Banquet', 'praktik', 16], ['Dasar Barista', 'praktik', 12]],
  tb: [['Sanitasi dan Higiene Dapur', 'teori', 10], ['Teknik Pisau', 'praktik', 20], ['Metode Memasak', 'praktik', 30], ['Penyusunan Menu Dasar', 'teori', 10]],
}
for (const [pk, list] of Object.entries(subjects)) {
  for (const [name, kind, hours] of list) {
    SJ[name] = uid()
    await q('INSERT INTO subjects (id, program_id, name, kind, hours) VALUES (?,?,?,?,?)', [SJ[name], P[pk], name, kind, hours])
  }
}
await ensureCurricula() // mata pelajaran dan angkatan demo masuk ke "Kurikulum awal" pelatihannya
const batchSubjects = {
  fo0: [['Pengantar Industri Perhotelan', 1], ['Reservasi dan Front Desk', 4], ['Check-in dan Check-out', 4], ['Penanganan Keluhan Tamu', 2], ['Bahasa Inggris Perhotelan', 1]],
  fo1: [['Pengantar Industri Perhotelan', 1], ['Reservasi dan Front Desk', 3], ['Check-in dan Check-out', 3], ['Penanganan Keluhan Tamu', 2], ['Etika dan Standar Pelayanan', 1]],
}
// Jadwal per mata pelajaran: instruktur, hari, jam, dan ruang masing-masing. Bahasa Inggris di FO-2026-B2 diajar instruktur lain.
const slot = {
  fo0: (name) => name === 'Bahasa Inggris Perhotelan' ? ['ins2', 'Sab', '09:00', '11:00', 'Lab Bahasa'] : ['ins1', 'Sen,Rab,Jum', '09:00', '12:00', 'Ruang Simulasi Lt. 2'],
  fo1: () => ['ins1', 'Sel,Kam', '13:00', '16:00', 'Ruang Simulasi Lt. 2'],
}
for (const [bk, list] of Object.entries(batchSubjects)) for (const [name, n] of list) {
  const [ins, days, start, end, room] = slot[bk](name)
  await q('INSERT INTO batch_subjects (batch_id, subject_id, sessions_planned, instructor_id, schedule_days, start_time, end_time, room) VALUES (?,?,?,?,?,?,?,?)', [B[bk], SJ[name], n, U[ins], days, start, end, room])
}
await q('UPDATE users SET instructor_program = ? WHERE id = ?', [P.fo, U.ins1])
await q('UPDATE users SET instructor_program = ? WHERE id = ?', [P.tb, U.ins2])

const R = {}
const regs = [
  ['r1', 'p1', 'fo0', 'active', 2500000, 214, 'REG-202610-001', 'INV-202610-001', -35, -45], ['r2', 'p2', 'fo1', 'pending_payment', 2500000, 387, 'REG-202611-002', 'INV-202611-002', 2, 0],
  ['r5', 'p4', 'fo0', 'active', 2500000, 331, 'REG-202610-005', 'INV-202610-005', -30, -42], ['r3', 'p3', 'hk1', 'waiting_verification', 1900000, 142, 'REG-202611-003', 'INV-202611-003', 1, -1], ['r4', 'p3', 'fo0', 'active', 2500000, 56, 'REG-202609-004', 'INV-202609-004', -40, -50],
]
for (const [k, u, b, st, price, uc, code, inv, due, created] of regs) {
  R[k] = uid()
  await q('INSERT INTO registrations (id, code, user_id, program_id, batch_id, status, stage, price_snapshot, unique_code, invoice_no, due_at, created_at) VALUES (?,?,?,(SELECT program_id FROM batches WHERE id = ?),?,?,?,?,?,?,?,?)', [R[k], code, U[u], B[b], B[b], st, ['active', 'completed'].includes(st) ? 'aktif' : st === 'cancelled' || st === 'expired' ? 'data' : 'bayar_daftar', price, uc, inv, at(due), at(created)])
}
// Catatan: berkas bukti transfer demo tidak ada di disk (proof_file_id NULL); unggahan nyata lewat aplikasi.
await q("INSERT INTO payments (id, registration_id, amount_due, amount_paid, payer_name, transfer_date, status, receipt_no, verified_by, created_at) VALUES (?,?,?,?,?,?,'verified',?,?,?)", [uid(), R.r1, 2500214, 2500214, 'Peserta Aktif', dateOnly(-44), 'KWT-202610-001', U.uang, at(-44)])
await q("INSERT INTO payments (id, registration_id, amount_due, amount_paid, payer_name, transfer_date, status, created_at) VALUES (?,?,?,?,?,?,'submitted',?)", [uid(), R.r3, 1900142, 1900142, 'Peserta Lulus', dateOnly(-1), at(-1)])
await q("INSERT INTO payments (id, registration_id, amount_due, amount_paid, payer_name, transfer_date, status, receipt_no, verified_by, created_at) VALUES (?,?,?,?,?,?,'verified',?,?,?)", [uid(), R.r4, 2500056, 2500056, 'Peserta Lulus', dateOnly(-49), 'KWT-202609-004', U.uang, at(-49)])

await q('INSERT INTO grades (registration_id) VALUES (?), (?)', [R.r1, R.r5])
await q("INSERT INTO payments (id, registration_id, amount_due, amount_paid, payer_name, transfer_date, status, receipt_no, verified_by, created_at) VALUES (?,?,?,?,?,?,'verified',?,?,?)", [uid(), R.r5, 2500331, 2500331, 'Peserta Belum Isi Data', dateOnly(-41), 'KWT-202610-005', U.uang, at(-41)])
for (const [k, nik, tp, gender] of [['p1', '3277010101000001', 'Cimahi', 'L'], ['p3', '3277010101000003', 'Bandung', 'P']]) {
  await q("INSERT INTO participant_profiles (user_id, nik, birth_place, birth_date, gender, address, rt, rw, district_id, district, city_id, city, province_id, province, postal_code, education, occupation, completed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", [U[k], nik, tp, '2000-01-01', gender, 'Jl. Contoh No. 1', '01', '02', '3277010', 'Cimahi Selatan', '3277', 'Kota Cimahi', '32', 'Jawa Barat', '40511', 'SMA/SMK/MA', 'Belum bekerja', new Date()])
  await q('UPDATE users SET nik = ?, birth_date = ? WHERE id = ?', [nik, '2000-01-01', U[k]])
}
await q("INSERT INTO grades (registration_id, theory, practical, attendance_pct, status) VALUES (?,88,92,96,'submitted')", [R.r4])

const S = []
for (const [title, n, mapel] of [['Simulasi check-in tamu grup', 1, 'Check-in dan Check-out'], ['Penanganan keluhan tamu', 3, 'Penanganan Keluhan Tamu'], ['Ujian praktik akhir', 6, 'Reservasi dan Front Desk']]) {
  const id = uid(); S.push(id)
  await q('INSERT INTO class_sessions (id, batch_id, subject_id, title, start_at, location) VALUES (?,?,?,?,?,?)', [id, B.fo0, SJ[mapel], title, at(n), 'Ruang Simulasi Lt. 2'])
}
await q('INSERT INTO materials (id, batch_id, session_id, title, kind, url) VALUES (?,?,?,?,?,?)', [uid(), B.fo0, S[1], 'Rekaman praktik penanganan keluhan', 'Tautan', 'https://example.com/rekaman'])
await q('INSERT INTO assignments (id, batch_id, title, description, due_at) VALUES (?,?,?,?,?)', [uid(), B.fo0, 'Laporan simulasi check-in', 'Tulis refleksi singkat dari simulasi check-in tamu grup.', at(5)])

const site = {
  name: 'Cimahi Hotel Institute', bankName: 'Bank BNI', bankAccount: '2040792254', bankHolder: 'Daya Juang Bersama Yayasan', payDueHours: 48,
  regFee: 200000, minReenroll: 1000000, reenrollDue: dateOnly(30), refundCutoff: dateOnly(14), pelunasanDue: dateOnly(150),
  lpkRegNo: '32.77.03.1004.35.2024', ketuaName: 'Dr. Gerinata Ginting, M.M.', batchLabel: 'Batch Ganjil TA. 2026/2027', email: 'infolpk.chi@gmail.com', website: 'cimahihotelinstitute.org', hotline: '08216733273',
  phone: '0821 673 3273', whatsapp: '6280000000000', address: 'Jalan Pasantren KM.2, Cibabat, Cimahi Utara, Kota Cimahi 40513 Jawa Barat', hours: 'Senin sampai Jumat, 08.00 sampai 16.00',
}
await q('INSERT INTO payment_plans (id, program_id, name, down_payment, installments) VALUES (?,NULL,?,?,?), (?,NULL,?,?,?), (?,NULL,?,?,?)',
  [uid(), 'Lunas sekali bayar', 0, 1, uid(), 'Cicilan 3 kali (uang muka Rp1.000.000)', 1000000, 3, uid(), 'Cicilan 6 kali (uang muka Rp1.000.000)', 1000000, 6])
const bankId = uid()
await q('INSERT INTO question_banks (id, name) VALUES (?,?)', [bankId, 'Seleksi masuk (contoh)'])
const sampleQs = [
  ['Tamu datang ke meja resepsionis hotel. Apa yang dilakukan pertama kali?', ['Menyapa dan tersenyum', 'Menunggu tamu bicara', 'Melanjutkan pekerjaan', 'Meminta tamu antre'], 0],
  ['Bagian hotel yang bertanggung jawab atas kebersihan kamar adalah...', ['Front office', 'Housekeeping', 'Food and beverage', 'Security'], 1],
  ['Check-out adalah proses saat tamu...', ['Memesan kamar', 'Meninggalkan hotel dan menyelesaikan pembayaran', 'Mengganti kamar', 'Meminta makanan'], 1],
  ['Kata sapaan yang sopan pada pagi hari adalah...', ['Selamat malam', 'Selamat siang', 'Selamat pagi', 'Selamat tidur'], 2],
  ['Hasil dari 15 + 27 adalah...', ['42', '32', '43', '41'], 0],
]
for (const [body, opts, ci] of sampleQs) await q('INSERT INTO questions (id, bank_id, body, options, correct_idx) VALUES (?,?,?,?,?)', [uid(), bankId, body, JSON.stringify(opts), ci])
await q('INSERT INTO exams (id, title, bank_id, program_id, open_at, close_at, duration_min, question_count) VALUES (?,?,?,NULL,?,?,?,?)', [uid(), 'Ujian tulis seleksi (contoh)', bankId, at(0), at(14), 30, 5])
await importBankSoal() // 100 soal hospitality dan TPA, siap dipakai untuk ujian seleksi
let n = 0
const sec = (type, content) => ({ id: `sec-${++n}`, type, visible: true, content })
const sections = [
  sec('hero', { title: 'Siap kerja, siap mendunia', highlight: 'Room Division & Food and Beverage', subtitle: 'Pelatihan kerja 1 tahun di LPK Cimahi Hotel Institute. Tingkatkan keterampilan dan buka peluang karier di hotel, resort, restoran, dan kapal pesiar.', ctaLabel: 'Daftar sekarang', ctaHref: '/daftar', secondaryLabel: 'Lihat program', secondaryHref: '#program' }),
  sec('marquee', { items: ['Front Office', 'Housekeeping', 'Food & Beverage Service', 'Magang Hotel Bintang 5', 'Kerja di Resort, Hotel, Kapal Pesiar', 'Bahasa Asing', 'Personal Branding', 'Mock Up Room'].map((text) => ({ text })) }),
  sec('about', { tagline: 'Shaping Global Hospitality', title: 'LPK Cimahi Hotel Institute', body: 'Lembaga pelatihan kerja bidang perhotelan yang menyiapkan tenaga kerja siap pakai untuk hotel, resort, restoran, dan kapal pesiar. Program pelatihan kerja 1 tahun di bidang Room Division dan Food & Beverage memadukan pembelajaran di kelas, praktik di ruang simulasi, dan magang di industri.',
    items: ['Magang di hotel bintang 5', 'Penempatan kerja di resort, hotel, dan kapal pesiar', 'Pembekalan bahasa asing dan personal branding', 'Fasilitas mock up room, Room Division, dan Food Service', 'Biaya terjangkau dan bisa diangsur', 'Uang saku ketika magang'].map((text) => ({ text })) }),
  sec('programs', { title: 'Program pelatihan', limit: 4 }),
  sec('stats', { note: 'Dihitung langsung dari data sistem.' }),
  sec('organization', { title: 'Struktur organisasi', subtitle: 'Pengelola LPK Cimahi Hotel Institute.', items: [
    { position: 'Ketua LPK', name: site.ketuaName, imageId: '' }, ...['Kepala Akademik', 'Bagian Pendaftaran', 'Bagian Keuangan', 'Koordinator Instruktur'].map((position) => ({ position, name: '', imageId: '' })) ] }),
  sec('gallery', { title: 'Kegiatan peserta', subtitle: 'Peserta berlatih langsung di ruang praktik Room Division dan Food & Beverage, lengkap dengan seragam dan standar layanan hotel.', items: [
    { src: '/landing/tim-rd-fb.jpg', imageId: '', caption: 'Peserta Room Division dan Food & Beverage', tag: 'Cimahi Hotel Institute' },
    { src: '/landing/peserta-putra.jpg', imageId: '', caption: 'Grooming dan personal branding', tag: 'Pembekalan' },
    { src: '/landing/fb-service.jpg', imageId: '', caption: 'Praktik layanan minuman dan hidangan', tag: 'Food & Beverage' },
    { src: '/landing/siap-mendunia.jpg', imageId: '', caption: 'Siap berkarier di hotel, resort, dan kapal pesiar', tag: 'Karier' },
    { src: '/landing/peserta-putri.jpg', imageId: '', caption: 'Pelayanan tamu dan front office', tag: 'Room Division' },
    { src: '/landing/rd-housekeeping.jpg', imageId: '', caption: 'Praktik housekeeping dan penataan linen', tag: 'Room Division' } ] }),
  sec('upcoming_batches', { title: 'Angkatan yang sedang dibuka', limit: 4 }),
  sec('benefits', { title: 'Cara kami melatih', items: [
    { title: 'Praktik di ruang simulasi', body: 'Sebagian besar jam pelatihan dipakai untuk praktik, bukan ceramah.' },
    { title: 'Penilaian terbuka', body: 'Bobot nilai, batas lulus, dan syarat kehadiran ditetapkan per program dan bisa dilihat peserta.' },
    { title: 'Status peserta bisa dicek', body: 'Perusahaan atau pemberi kerja dapat mengecek status peserta dengan NIP (Nomor Induk Peserta).' } ] }),
  sec('faq', { title: 'Pertanyaan yang sering diajukan', items: [
    { q: 'Bagaimana cara membayar?', a: 'Transfer ke rekening yang tertera di tagihan, lalu unggah bukti. Kode unik tiga digit membantu kami mencocokkan pembayaran.' },
    { q: 'Berapa lama batas pembayaran?', a: 'Default 48 jam sejak mendaftar. Setelah itu pendaftaran kedaluwarsa dan kuota dilepas.' },
    { q: 'Kapan saya dinyatakan lulus?', a: 'Setelah Akademik memvalidasi nilai Anda. Status kelulusan bisa dicek di halaman Cek status peserta dengan NIP.' } ] }),
  sec('location', { title: 'Lokasi', subtitle: 'Kegiatan pelatihan berlangsung di Area Kampus Politeknik TEDC Bandung.', mapQuery: 'Politeknik TEDC Bandung' }),
  sec('social', { title: 'Media sosial', subtitle: 'Ikuti kegiatan peserta dan informasi pendaftaran terbaru.', items: [
    { platform: 'instagram', handle: '@cimahihotelinstitute', url: 'https://www.instagram.com/cimahihotelinstitute/' },
    { platform: 'tiktok', handle: '@cimahihotelinstitute', url: 'https://www.tiktok.com/@cimahihotelinstitute' },
    { platform: 'youtube', handle: '@cimahihotelinstitute', url: 'https://www.youtube.com/@cimahihotelinstitute' },
    { platform: 'website', handle: site.website, url: `https://${site.website}` },
    { platform: 'email', handle: site.email, url: `mailto:${site.email}` } ] }),
  sec('cta', { title: 'Siap mulai angkatan berikutnya?', body: 'Buat akun, pilih angkatan, dan terima tagihan dalam beberapa menit.', label: 'Daftar sekarang', href: '/daftar' }),
  { ...sec('contact', { title: 'Hubungi kami' }), visible: false }, // digantikan Lokasi dan Media sosial
]
const rev = uid()
await q("INSERT INTO settings (k, v) VALUES ('site', ?), ('draft_sections', ?), ('published_revision', ?)", [JSON.stringify(site), JSON.stringify(sections), rev])
await q('INSERT INTO landing_revisions (id, snapshot, note, created_by) VALUES (?,?,?,?)', [rev, JSON.stringify(sections), 'Versi awal', U.super])

console.log('Seed selesai. Semua akun demo memakai password: demo12345')
await pool.end()
