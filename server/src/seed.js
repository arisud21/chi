// Mengisi data demo. Aman dijalankan ulang: mengosongkan tabel data lalu mengisi kembali. HANYA untuk pengembangan.
import bcrypt from 'bcryptjs'
import { DEFAULT_CONFIG } from './pdf.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import { UPLOAD_DIR, pool, q, uid } from './lib.js'

if (process.env.NODE_ENV === 'production') throw new Error('Seed demo tidak boleh dijalankan di produksi.')

const day = 86_400_000
const at = (n) => new Date(Date.now() + n * day)
const dateOnly = (n) => at(n).toISOString().slice(0, 10)

const tables = ['batch_subjects', 'participant_profiles', 'submissions', 'assignments', 'attendances', 'grades', 'certificates', 'certificate_sequences', 'certificate_templates', 'payments', 'materials', 'class_sessions', 'subjects',
  'registrations', 'batches', 'programs', 'email_tokens', 'email_queue', 'audit_logs', 'landing_revisions', 'settings', 'files', 'users']
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
const batchSubjects = {
  fo0: [['Pengantar Industri Perhotelan', 1], ['Reservasi dan Front Desk', 4], ['Check-in dan Check-out', 4], ['Penanganan Keluhan Tamu', 2], ['Bahasa Inggris Perhotelan', 1]],
  fo1: [['Pengantar Industri Perhotelan', 1], ['Reservasi dan Front Desk', 3], ['Check-in dan Check-out', 3], ['Penanganan Keluhan Tamu', 2], ['Etika dan Standar Pelayanan', 1]],
}
for (const [bk, list] of Object.entries(batchSubjects)) for (const [name, n] of list) await q('INSERT INTO batch_subjects (batch_id, subject_id, sessions_planned) VALUES (?,?,?)', [B[bk], SJ[name], n])

const R = {}
const regs = [
  ['r1', 'p1', 'fo0', 'active', 2500000, 214, 'REG-202610-001', 'INV-202610-001', -35, -45], ['r2', 'p2', 'fo1', 'pending_payment', 2500000, 387, 'REG-202611-002', 'INV-202611-002', 2, 0],
  ['r5', 'p4', 'fo0', 'active', 2500000, 331, 'REG-202610-005', 'INV-202610-005', -30, -42], ['r3', 'p3', 'hk1', 'waiting_verification', 1900000, 142, 'REG-202611-003', 'INV-202611-003', 1, -1], ['r4', 'p3', 'fo0', 'active', 2500000, 56, 'REG-202609-004', 'INV-202609-004', -40, -50],
]
for (const [k, u, b, st, price, uc, code, inv, due, created] of regs) {
  R[k] = uid()
  await q('INSERT INTO registrations (id, code, user_id, batch_id, status, price_snapshot, unique_code, invoice_no, due_at, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)', [R[k], code, U[u], B[b], st, price, uc, inv, at(due), at(created)])
}
// Catatan: berkas bukti transfer demo tidak ada di disk (proof_file_id NULL); unggahan nyata lewat aplikasi.
await q("INSERT INTO payments (id, registration_id, amount_due, amount_paid, payer_name, transfer_date, status, receipt_no, verified_by, created_at) VALUES (?,?,?,?,?,?,'verified',?,?,?)", [uid(), R.r1, 2500214, 2500214, 'Peserta Aktif', dateOnly(-44), 'KWT-202610-001', U.uang, at(-44)])
await q("INSERT INTO payments (id, registration_id, amount_due, amount_paid, payer_name, transfer_date, status, created_at) VALUES (?,?,?,?,?,?,'submitted',?)", [uid(), R.r3, 1900142, 1900142, 'Peserta Lulus', dateOnly(-1), at(-1)])
await q("INSERT INTO payments (id, registration_id, amount_due, amount_paid, payer_name, transfer_date, status, receipt_no, verified_by, created_at) VALUES (?,?,?,?,?,?,'verified',?,?,?)", [uid(), R.r4, 2500056, 2500056, 'Peserta Lulus', dateOnly(-49), 'KWT-202609-004', U.uang, at(-49)])

await q('INSERT INTO grades (registration_id) VALUES (?), (?)', [R.r1, R.r5])
await q("INSERT INTO payments (id, registration_id, amount_due, amount_paid, payer_name, transfer_date, status, receipt_no, verified_by, created_at) VALUES (?,?,?,?,?,?,'verified',?,?,?)", [uid(), R.r5, 2500331, 2500331, 'Peserta Belum Isi Data', dateOnly(-41), 'KWT-202610-005', U.uang, at(-41)])
for (const [k, nik, tp, gender] of [['p1', '3277010101000001', 'Cimahi', 'L'], ['p3', '3277010101000003', 'Bandung', 'P']]) {
  await q("INSERT INTO participant_profiles (user_id, nik, birth_place, birth_date, gender, address, rt, rw, district_id, district, city_id, city, province_id, province, postal_code, education, occupation, emergency_name, emergency_relation, emergency_phone, completed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", [U[k], nik, tp, '2000-01-01', gender, 'Jl. Contoh No. 1', '01', '02', '3277010', 'Cimahi Selatan', '3277', 'Kota Cimahi', '32', 'Jawa Barat', '40511', 'SMA/SMK', 'Belum bekerja', 'Wali Contoh', 'Orang tua', '081200009999', new Date()])
}
await q("INSERT INTO grades (registration_id, theory, practical, attendance_pct, status) VALUES (?,88,92,96,'submitted')", [R.r4])

const S = []
for (const [title, n, mapel] of [['Simulasi check-in tamu grup', 1, 'Check-in dan Check-out'], ['Penanganan keluhan tamu', 3, 'Penanganan Keluhan Tamu'], ['Ujian praktik akhir', 6, 'Reservasi dan Front Desk']]) {
  const id = uid(); S.push(id)
  await q('INSERT INTO class_sessions (id, batch_id, subject_id, title, start_at, location) VALUES (?,?,?,?,?,?)', [id, B.fo0, SJ[mapel], title, at(n), 'Ruang Simulasi Lt. 2'])
}
await q('INSERT INTO materials (id, batch_id, session_id, title, kind, url) VALUES (?,?,?,?,?,?)', [uid(), B.fo0, S[1], 'Rekaman praktik penanganan keluhan', 'Tautan', 'https://example.com/rekaman'])
await q('INSERT INTO assignments (id, batch_id, title, description, due_at) VALUES (?,?,?,?,?)', [uid(), B.fo0, 'Laporan simulasi check-in', 'Tulis refleksi singkat dari simulasi check-in tamu grup.', at(5)])

await q('INSERT INTO certificate_templates (id, version, config, is_active) VALUES (?,?,?,1)', [uid(), 1, JSON.stringify(DEFAULT_CONFIG)])

const site = {
  name: 'Cimahi Institute Hotel', bankName: 'Bank (isi di Pengaturan)', bankAccount: '0000000000', bankHolder: 'Cimahi Institute Hotel', payDueHours: 48,
  phone: '(isi nomor telepon)', whatsapp: '6280000000000', address: 'Cimahi, Jawa Barat (isi alamat lengkap di Pengaturan)', hours: 'Senin sampai Jumat, 08.00 sampai 16.00',
  signerName: '(isi nama penanda tangan)', signerTitle: 'Kepala Akademik',
}
let n = 0
const sec = (type, content) => ({ id: `sec-${++n}`, type, visible: true, content })
const sections = [
  sec('hero', { title: 'Belajar perhotelan langsung dari ruang praktiknya.', subtitle: 'Pelatihan kerja di Cimahi untuk front office, housekeeping, layanan restoran, dan tata boga. Sertifikat diterbitkan sistem dan bisa dicek keasliannya oleh siapa saja.', ctaLabel: 'Lihat program', ctaHref: '#program', secondaryLabel: 'Cek sertifikat', secondaryHref: '/verifikasi' }),
  sec('stats', { note: 'Dihitung langsung dari data sistem.' }),
  sec('programs', { title: 'Program pelatihan', limit: 4 }),
  sec('upcoming_batches', { title: 'Angkatan yang sedang dibuka', limit: 4 }),
  sec('benefits', { title: 'Cara kami melatih', items: [
    { title: 'Praktik di ruang simulasi', body: 'Sebagian besar jam pelatihan dipakai untuk praktik, bukan ceramah.' },
    { title: 'Penilaian terbuka', body: 'Bobot nilai, batas lulus, dan syarat kehadiran ditetapkan per program dan bisa dilihat peserta.' },
    { title: 'Sertifikat dengan kode verifikasi', body: 'Setiap sertifikat memuat kode yang bisa dicek perusahaan atau pemberi kerja.' } ] }),
  sec('faq', { title: 'Pertanyaan yang sering diajukan', items: [
    { q: 'Bagaimana cara membayar?', a: 'Transfer ke rekening yang tertera di tagihan, lalu unggah bukti. Kode unik tiga digit membantu kami mencocokkan pembayaran.' },
    { q: 'Berapa lama batas pembayaran?', a: 'Default 48 jam sejak mendaftar. Setelah itu pendaftaran kedaluwarsa dan kuota dilepas.' },
    { q: 'Kapan sertifikat terbit?', a: 'Setelah Akademik memvalidasi nilai dan Anda dinyatakan lulus.' } ] }),
  sec('cta', { title: 'Siap mulai angkatan berikutnya?', body: 'Buat akun, pilih angkatan, dan terima tagihan dalam beberapa menit.', label: 'Daftar sekarang', href: '/daftar' }),
  sec('contact', { title: 'Hubungi kami' }),
]
const rev = uid()
await q("INSERT INTO settings (k, v) VALUES ('site', ?), ('draft_sections', ?), ('published_revision', ?)", [JSON.stringify(site), JSON.stringify(sections), rev])
await q('INSERT INTO landing_revisions (id, snapshot, note, created_by) VALUES (?,?,?,?)', [rev, JSON.stringify(sections), 'Versi awal', U.super])

console.log('Seed selesai. Semua akun demo memakai password: demo12345')
await pool.end()
