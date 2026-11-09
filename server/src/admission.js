import PDFDocument from 'pdfkit'
import fs from 'node:fs'
import path from 'node:path'
import { UPLOAD_DIR, audit, cq, dt, fail, getSettings, mail, q, tx, uid } from './lib.js'

/*
 * Penerimaan peserta: data diri, bayar pendaftaran, ujian tulis, keputusan lulus, registrasi ulang.
 * Tahapan disimpan di registrations.stage. Nilai ujian hanya terlihat staf, tidak pernah dikirim ke peserta.
 */

export const REG_FEE_DEFAULT = 200_000
export const MIN_REENROLL_DEFAULT = 1_000_000
const EXAM_STAFF = ['super_admin', 'admin_pendaftaran', 'akademik']
const FINANCE = ['super_admin', 'admin_keuangan']
const PAY_STAFF = ['super_admin', 'admin_keuangan', 'admin_pendaftaran']
const REMIND_GAP_HOURS = 6
const num = (v, min = 0, max = Infinity) => { const n = Number(v); if (!Number.isFinite(n) || n < min || n > max) fail('Nilai angka tidak valid.'); return n }
const str = (v, max = 255, req = true) => { const s = String(v ?? '').trim(); if (req && !s) fail('Ada isian wajib yang kosong.'); return s.slice(0, max) }
const day = (v, label, req = true) => { const s = String(v ?? ''); if (!s && !req) return ''; if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(new Date(s).getTime())) fail(`Tanggal ${label} tidak valid.`); return s }

/** Notifikasi dalam aplikasi, ditambah email ke alamat akun. Dipanggil di dalam transaksi. */
export async function notify(c, userId, title, body, link = null) {
  await cq(c, 'INSERT INTO notifications (id, user_id, title, body, link) VALUES (?,?,?,?,?)', [uid(), userId, title.slice(0, 160), body.slice(0, 500), link])
  const [u] = await cq(c, 'SELECT email FROM users WHERE id = ?', [userId])
  if (u?.email) await mail(c, u.email, title, body)
}

const rp = (n) => 'Rp' + Number(n).toLocaleString('id-ID')

/** Pindah ke tahap pembayaran setelah data diri lengkap. Dipanggil dari unggah data diri. */
export async function afterProfileDone(c, userId) {
  const regs = await cq(c, "SELECT id FROM registrations WHERE user_id = ? AND stage = 'data' FOR UPDATE", [userId])
  if (!regs.length) return
  const s = await getSettings(c)
  await cq(c, "UPDATE registrations SET stage = 'bayar_daftar' WHERE user_id = ? AND stage = 'data'", [userId])
  await notify(c, userId, 'Data diri lengkap: bayar biaya pendaftaran',
    `Transfer ${rp(s.regFee ?? REG_FEE_DEFAULT)} ke ${s.bankName ?? 'BNI'} ${s.bankAccount ?? ''} a.n. ${s.bankHolder ?? ''}, lalu unggah bukti pembayaran. Ujian tulis terbuka setelah pembayaran dikonfirmasi.`, '/app')
}

/** Jadwal cicilan dari paket: cicilan pertama sebesar uang muka, sisanya dibagi rata sampai tanggal pelunasan. */
function buildSchedule(total, plan, firstDue, lastDue) {
  const n = Math.max(1, plan.installments)
  if (n === 1 || plan.down_payment >= total) return [{ seq: 1, amount: total, due: firstDue }]
  const dp = plan.down_payment
  const rest = total - dp
  const each = Math.floor(rest / (n - 1))
  const a = new Date(firstDue).getTime(), b = Math.max(a, new Date(lastDue).getTime())
  const out = [{ seq: 1, amount: dp, due: firstDue }]
  for (let k = 1; k < n; k++) {
    const due = new Date(a + ((b - a) * k) / (n - 1)).toISOString().slice(0, 10)
    out.push({ seq: k + 1, amount: k === n - 1 ? rest - each * (n - 2) : each, due })
  }
  return out
}

/** Memberi skor dari jawaban tersimpan. Nilai disimpan untuk staf saja. */
async function scoreAttempt(c, attempt) {
  const ids = JSON.parse(attempt.question_ids)
  const answers = JSON.parse(attempt.answers || '{}')
  const rows = ids.length ? await cq(c, 'SELECT id, correct_idx FROM questions WHERE id IN (?)', [ids]) : []
  const right = rows.filter((r) => Number(answers[r.id]) === r.correct_idx).length
  return ids.length ? Math.round((right / ids.length) * 10000) / 100 : 0
}

async function closeAttempt(c, attempt, answers) {
  if (answers) await cq(c, 'UPDATE exam_attempts SET answers = ? WHERE id = ?', [JSON.stringify(answers), attempt.id])
  const [fresh] = await cq(c, 'SELECT * FROM exam_attempts WHERE id = ?', [attempt.id])
  const score = await scoreAttempt(c, fresh)
  await cq(c, 'UPDATE exam_attempts SET finished_at = ?, score = ? WHERE id = ?', [dt(), score, attempt.id])
  const [r] = await cq(c, 'SELECT * FROM registrations WHERE id = ? FOR UPDATE', [attempt.registration_id])
  if (r.stage === 'ujian') {
    await cq(c, "UPDATE registrations SET stage = 'menunggu_hasil' WHERE id = ?", [r.id])
    await notify(c, r.user_id, 'Ujian tulis selesai', 'Jawaban Anda sudah tersimpan. Hasil seleksi diumumkan oleh admin lewat aplikasi dan email.', '/app')
  }
}

/** Tutup ujian yang waktunya habis dan kedaluwarsakan registrasi ulang yang lewat batas. Dipanggil berkala. */
export async function sweepAdmissions() {
  return tx(async (c) => {
    const late = await cq(c, `SELECT a.*, e.duration_min FROM exam_attempts a JOIN exams e ON e.id = a.exam_id WHERE a.finished_at IS NULL AND DATE_ADD(a.started_at, INTERVAL e.duration_min MINUTE) < ? FOR UPDATE`, [dt()])
    for (const a of late) await closeAttempt(c, a, null)
    const s = await getSettings(c)
    if (s.reenrollDue && new Date(s.reenrollDue + 'T23:59:59Z') < new Date()) {
      const lost = await cq(c, `SELECT r.id, r.code, r.user_id FROM registrations r WHERE r.stage = 'registrasi_ulang' AND r.status = 'pending_payment'
        AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.registration_id = r.id AND p.kind = 'registrasi_ulang' AND p.status IN ('submitted','verified')) FOR UPDATE`)
      for (const r of lost) {
        await cq(c, "UPDATE registrations SET status = 'expired' WHERE id = ?", [r.id])
        await notify(c, r.user_id, 'Registrasi ulang melewati batas', 'Peserta yang tidak melakukan registrasi ulang dianggap mengundurkan diri.')
        await audit(c, null, 'registrasi.kedaluwarsa', 'registrations', r.code)
      }
    }
    return late.length
  })
}

/** Pilihan masa aktif token (menit): 15, 30, 1 sampai 4 jam, lalu 6, 8, 12, dan 24 jam. */
export const TOKEN_MINUTES = [15, 30, 60, 120, 180, 240, 360, 480, 720, 1440]
const TOKEN_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // tanpa huruf dan angka yang mirip (I, O, 0, 1)
const questionView = (q2) => ({ id: q2.id, body: q2.body, options: JSON.parse(q2.options) })

/**
 * Nomor Induk Peserta, 9 digit: tahun masuk (4) + angkatan (1) + kode program (1) + nomor urut (3).
 * Contoh 202611004 = masuk 2026, angkatan 1, program kode 1, urutan ke-4. Nomor urut berjalan per kombinasi tahun, angkatan, dan program.
 * Mengembalikan NIP, atau null bila data angkatan atau program belum lengkap (admin menerbitkan lewat issueNip).
 */
export async function issueNip(c, r) {
  if (r.nip) return r.nip
  if (!r.batch_id) return null
  const [b] = await cq(c, 'SELECT id, angkatan, start_date FROM batches WHERE id = ? FOR UPDATE', [r.batch_id]) // kunci angkatan: nomor urut tidak ganda
  const [p] = await cq(c, 'SELECT nip_code FROM programs WHERE id = ?', [r.program_id])
  if (!b?.angkatan || !p?.nip_code) return null
  const prefix = `${new Date(b.start_date).getUTCFullYear()}${b.angkatan}${p.nip_code}`
  const rows = await cq(c, 'SELECT nip FROM registrations WHERE nip LIKE ? AND LENGTH(nip) = ?', [prefix + '%', prefix.length + 3])
  const next = rows.reduce((m, x) => Math.max(m, Number(x.nip.slice(prefix.length))), 0) + 1
  if (next > 999) fail('Nomor urut NIP untuk angkatan ini sudah melebihi 999.')
  const nip = prefix + String(next).padStart(3, '0')
  await cq(c, 'UPDATE registrations SET nip = ? WHERE id = ?', [nip, r.id])
  return nip
}

/** Kekurangan terhadap minimal registrasi ulang: minimal (atau termin pertama bila lebih kecil) dikurangi semua pembayaran terkonfirmasi untuk termin. */
export async function reenrollShortfall(c, regId, s) {
  const [first] = await cq(c, 'SELECT amount FROM installments WHERE registration_id = ? AND seq = 1', [regId])
  if (!first) return 0
  const [{ got }] = await cq(c, "SELECT COALESCE(SUM(amount_paid), 0) got FROM payments WHERE registration_id = ? AND status = 'verified' AND kind IN ('registrasi_ulang','cicilan')", [regId])
  const min = Math.min(Number(s.minReenroll ?? MIN_REENROLL_DEFAULT), Number(first.amount))
  return Math.max(0, min - Number(got))
}

/** Sisa seluruh termin yang belum terbayar. */
export async function remainingTotal(c, regId) {
  const sql = 'SELECT COALESCE(SUM(amount - paid_amount), 0) rest FROM installments WHERE registration_id = ?'
  const [{ rest }] = c ? await cq(c, sql, [regId]) : await q(sql, [regId])
  return Number(rest)
}

/**
 * Membagi pembayaran ke termin: mulai dari termin yang dituju, kelebihan langsung memotong termin berikutnya,
 * lalu termin sebelumnya yang masih kurang. Pembayaran kurang menjadi sebagian (partial).
 */
export async function allocatePayment(c, p) {
  const insts = await cq(c, 'SELECT * FROM installments WHERE registration_id = ? ORDER BY seq FOR UPDATE', [p.registration_id])
  const start = Math.max(0, insts.findIndex((i) => i.id === p.installment_id))
  let left = Number(p.amount_paid)
  for (const i of [...insts.slice(start), ...insts.slice(0, start)]) {
    if (left <= 0) break
    const need = Number(i.amount) - Number(i.paid_amount)
    if (need <= 0) continue
    const take = Math.min(left, need)
    const next = Number(i.paid_amount) + take
    await cq(c, 'UPDATE installments SET paid_amount = ?, status = ? WHERE id = ?', [next, next >= Number(i.amount) ? 'paid' : 'partial', i.id])
    left -= take
  }
  return { leftover: left }
}

/** Tagihan yang belum dibayar satu registrasi, dalam bentuk daftar teks. Kosong bila tidak ada yang perlu dibayar sekarang. */
async function outstanding(c, r, s) {
  const lines = []
  const rpTxt = (n) => 'Rp' + Number(n).toLocaleString('id-ID')
  const dayTxt = (d) => new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
  if (r.stage === 'bayar_daftar') {
    const [sub] = await cq(c, "SELECT id FROM payments WHERE registration_id = ? AND kind = 'pendaftaran' AND status = 'submitted' LIMIT 1", [r.id])
    if (!sub) lines.push(`Biaya pendaftaran ${rpTxt(s.regFee ?? REG_FEE_DEFAULT)}`)
  }
  if (r.stage === 'registrasi_ulang') {
    const insts = await cq(c, "SELECT * FROM installments WHERE registration_id = ? AND status = 'unpaid' ORDER BY seq", [r.id])
    if (!insts.length) {
      const [paid] = await cq(c, "SELECT id FROM installments WHERE registration_id = ? LIMIT 1", [r.id])
      if (!paid) lines.push('Pilih paket pembayaran dan bayar registrasi ulang' + (s.reenrollDue ? ` sebelum ${dayTxt(s.reenrollDue)}` : ''))
    } else lines.push(`Registrasi ulang ${rpTxt(insts[0].amount)}` + (s.reenrollDue ? `, paling lambat ${dayTxt(s.reenrollDue)}` : ''))
  }
  if (r.stage === 'aktif') {
    const short = await reenrollShortfall(c, r.id, s)
    if (short > 0) lines.push(`Kekurangan registrasi ulang ${rpTxt(short)} (minimal ${rpTxt(s.minReenroll ?? MIN_REENROLL_DEFAULT)}), segera lunasi`)
    const insts = await cq(c, "SELECT * FROM installments WHERE registration_id = ? AND status IN ('unpaid','partial') ORDER BY seq", [r.id])
    for (const i of insts) lines.push(`${i.seq === 1 ? 'Sisa registrasi ulang' : `Cicilan ${i.seq - 1}`} ${rpTxt(Number(i.amount) - Number(i.paid_amount))}, jatuh tempo ${dayTxt(i.due_date)}`)
  }
  return lines
}

const DOC_NAMES = { ktp: 'KTP', ijazah: 'Ijazah', foto: 'Pas foto 3x4', kk: 'Kartu Keluarga', buta_warna: 'Surat keterangan tidak buta warna' }

export const admissionActions = {
  /* ---------- staf: hapus berkas agar peserta bisa mengunggah ulang ---------- */
  removeDocument: {
    roles: ['super_admin', 'admin_pendaftaran'],
    fn: (ctx, userId, kind) => tx(async (c) => {
      if (!DOC_NAMES[kind]) fail('Jenis berkas tidak dikenal.')
      const [d] = await cq(c, 'SELECT id, file_id FROM registration_documents WHERE user_id = ? AND kind = ? FOR UPDATE', [userId, kind])
      if (!d) fail('Berkas ini belum diunggah.')
      const [f] = await cq(c, 'SELECT stored_name FROM files WHERE id = ?', [d.file_id])
      await cq(c, 'DELETE FROM registration_documents WHERE id = ?', [d.id])
      await cq(c, 'DELETE FROM files WHERE id = ?', [d.file_id])
      await notify(c, userId, `Unggah ulang ${DOC_NAMES[kind]}`, `Berkas ${DOC_NAMES[kind]} Anda dihapus admin. Silakan unggah berkas yang benar di halaman Beranda.`, '/app')
      await audit(c, ctx.user.id, 'berkas.hapus', 'registration_documents', `${userId}: ${kind}`)
      if (f) fs.promises.unlink(path.join(UPLOAD_DIR, f.stored_name)).catch(() => {})
    }),
  },

  /* ---------- staf: NIP ---------- */
  issueNip: {
    roles: ['super_admin', 'admin_pendaftaran'],
    fn: (ctx, regId) => tx(async (c) => {
      const [r] = await cq(c, 'SELECT * FROM registrations WHERE id = ? FOR UPDATE', [regId])
      if (!r || r.stage !== 'aktif') fail('NIP hanya diterbitkan untuk peserta yang sudah registrasi ulang.')
      if (r.nip) fail(`Peserta ini sudah punya NIP ${r.nip}.`)
      const nip = await issueNip(c, r)
      if (!nip) fail('Lengkapi dulu kode NIP program dan angkatan ke-berapa pada angkatan peserta ini.')
      await notify(c, r.user_id, 'NIP Anda terbit', `Nomor Induk Peserta Anda: ${nip}.`, '/app')
      await audit(c, ctx.user.id, 'nip.terbit', 'registrations', `${r.code}: ${nip}`)
      return nip
    }),
  },

  /* ---------- staf: pengumuman tagihan ke akun peserta ---------- */
  remindPayment: {
    roles: PAY_STAFF,
    fn: (ctx, regIds) => tx(async (c) => {
      const ids = [...new Set(Array.isArray(regIds) ? regIds.map(String) : [])].slice(0, 200)
      if (!ids.length) fail('Pilih peserta yang akan diingatkan.')
      const s = await getSettings(c)
      const out = { sent: 0, skipped: 0 }
      for (const id of ids) {
        const [r] = await cq(c, "SELECT * FROM registrations WHERE id = ? AND status IN ('pending_payment','active') FOR UPDATE", [id])
        if (!r) { out.skipped++; continue }
        const lines = await outstanding(c, r, s)
        const [recent] = await cq(c, "SELECT id FROM notifications WHERE user_id = ? AND title = 'Pengingat pembayaran' AND created_at > ? LIMIT 1", [r.user_id, new Date(Date.now() - REMIND_GAP_HOURS * 3_600_000)])
        if (!lines.length || recent) { out.skipped++; continue }
        await notify(c, r.user_id, 'Pengingat pembayaran', `Tagihan Anda: ${lines.join('; ')}. Transfer ke ${s.bankName ?? 'bank'} ${s.bankAccount ?? ''} a.n. ${s.bankHolder ?? ''}, lalu unggah bukti di aplikasi.`, '/app')
        out.sent++
      }
      await audit(c, ctx.user.id, 'pembayaran.pengingat', 'notifications', `${out.sent} terkirim, ${out.skipped} dilewati`)
      return out
    }),
  },

  /* ---------- peserta: paket cicilan ---------- */
  choosePlan: {
    roles: ['peserta'],
    fn: (ctx, regId, planId) => tx(async (c) => {
      const [r] = await cq(c, 'SELECT * FROM registrations WHERE id = ? FOR UPDATE', [regId])
      if (!r || r.user_id !== ctx.user.id) fail('Registrasi tidak ditemukan.', 404)
      if (r.stage !== 'registrasi_ulang') fail('Pilihan pembayaran dibuka setelah Anda dinyatakan lulus.')
      const [first] = await cq(c, 'SELECT * FROM installments WHERE registration_id = ? AND seq = 1', [r.id])
      if (first && first.status !== 'unpaid') fail('Pembayaran pertama sudah diunggah, pilihan tidak bisa diubah. Hubungi bagian keuangan.')
      const [plan] = await cq(c, 'SELECT * FROM payment_plans WHERE id = ? AND is_active = 1 AND (program_id IS NULL OR program_id = ?)', [planId, r.program_id])
      if (!plan) fail('Paket pembayaran tidak tersedia.')
      const [p] = await cq(c, 'SELECT price FROM programs WHERE id = ?', [r.program_id])
      const s = await getSettings(c)
      // Total = biaya program + biaya tambahan aktif, dikurangi biaya pendaftaran yang sudah dikonfirmasi.
      const [{ extra }] = await cq(c, 'SELECT COALESCE(SUM(amount), 0) extra FROM fee_items WHERE is_active = 1 AND (program_id IS NULL OR program_id = ?)', [r.program_id])
      const [{ credit }] = await cq(c, "SELECT COALESCE(SUM(amount_paid), 0) credit FROM payments WHERE registration_id = ? AND kind = 'pendaftaran' AND status = 'verified'", [r.id])
      const total = Math.max(0, Number(p.price) + Number(extra) - Number(credit))
      if (total <= 0) fail('Biaya pelatihan sudah tercukupi oleh biaya pendaftaran. Hubungi bagian keuangan.')
      const sched = buildSchedule(total, plan, s.reenrollDue || new Date().toISOString().slice(0, 10), s.pelunasanDue || s.reenrollDue || new Date().toISOString().slice(0, 10))
      await cq(c, 'DELETE FROM installments WHERE registration_id = ?', [r.id])
      for (const x of sched) await cq(c, 'INSERT INTO installments (id, registration_id, seq, amount, due_date) VALUES (?,?,?,?,?)', [uid(), r.id, x.seq, x.amount, x.due])
      await cq(c, 'UPDATE registrations SET plan_id = ? WHERE id = ?', [plan.id, r.id])
      await audit(c, ctx.user.id, 'registrasi-ulang.paket', 'registrations', `${r.code}: ${plan.name}`)
    }),
  },

  markNotificationsRead: {
    roles: ['peserta'],
    fn: (ctx) => q('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL', [dt(), ctx.user.id]),
  },

  /* ---------- peserta: ujian tulis ---------- */
  startExam: {
    roles: ['peserta'],
    fn: (ctx, examId, token) => tx(async (c) => {
      const [r] = await cq(c, "SELECT * FROM registrations WHERE user_id = ? AND stage IN ('ujian','menunggu_hasil') ORDER BY created_at DESC LIMIT 1 FOR UPDATE", [ctx.user.id])
      if (!r) fail('Ujian terbuka setelah pembayaran pendaftaran dikonfirmasi.', 403)
      const [e] = await cq(c, 'SELECT * FROM exams WHERE id = ? AND is_active = 1', [examId])
      if (!e || (e.program_id && e.program_id !== r.program_id)) fail('Ujian tidak tersedia untuk Anda.', 404)
      const [old] = await cq(c, 'SELECT * FROM exam_attempts WHERE exam_id = ? AND registration_id = ? FOR UPDATE', [e.id, r.id])
      if (old?.finished_at) fail('Anda sudah menyelesaikan ujian ini.')
      let attempt = old
      if (!attempt) { // token hanya diperlukan untuk memulai. Yang sudah mulai boleh melanjutkan walau token sudah kedaluwarsa.
        const code = String(token ?? '').trim().toUpperCase()
        const [tk] = code ? await cq(c, 'SELECT id, expires_at FROM exam_tokens WHERE exam_id = ? AND token = ? ORDER BY expires_at DESC LIMIT 1', [e.id, code]) : []
        if (!tk) fail('Token ujian salah.')
        if (new Date(tk.expires_at) < new Date()) fail('Token ujian sudah kedaluwarsa. Minta token baru kepada admin atau pengawas.')
        const now = new Date()
        if (now < new Date(e.open_at)) fail('Ujian belum dibuka.')
        if (now > new Date(e.close_at)) fail('Waktu ujian sudah ditutup.')
        const pool = await cq(c, 'SELECT id FROM questions WHERE bank_id = ? AND is_active = 1', [e.bank_id])
        if (!pool.length) fail('Bank soal ujian ini masih kosong. Hubungi admin.')
        const picked = pool.map((x) => x.id).sort(() => Math.random() - 0.5).slice(0, e.question_count)
        const id = uid()
        await cq(c, 'INSERT INTO exam_attempts (id, exam_id, registration_id, question_ids, answers, started_at) VALUES (?,?,?,?,?,?)', [id, e.id, r.id, JSON.stringify(picked), '{}', dt()])
        ;[attempt] = await cq(c, 'SELECT * FROM exam_attempts WHERE id = ?', [id])
      }
      const endsAt = new Date(new Date(attempt.started_at).getTime() + e.duration_min * 60_000)
      if (endsAt < new Date()) { await closeAttempt(c, attempt, null); fail('Waktu pengerjaan sudah habis. Jawaban Anda tersimpan.') }
      const ids = JSON.parse(attempt.question_ids)
      const rows = await cq(c, 'SELECT * FROM questions WHERE id IN (?)', [ids])
      const byId = Object.fromEntries(rows.map((x) => [x.id, x]))
      return { attemptId: attempt.id, endsAt: endsAt.toISOString(), title: e.title, answers: JSON.parse(attempt.answers || '{}'), questions: ids.map((i) => questionView(byId[i])) }
    }),
  },
  saveExamAnswers: {
    roles: ['peserta'],
    fn: (ctx, attemptId, answers) => tx(async (c) => {
      const [a] = await cq(c, `SELECT a.*, e.duration_min, r.user_id FROM exam_attempts a JOIN exams e ON e.id = a.exam_id JOIN registrations r ON r.id = a.registration_id WHERE a.id = ? FOR UPDATE`, [attemptId])
      if (!a || a.user_id !== ctx.user.id) fail('Data ujian tidak ditemukan.', 404)
      if (a.finished_at) return
      if (new Date(a.started_at).getTime() + a.duration_min * 60_000 + 30_000 < Date.now()) return
      await cq(c, 'UPDATE exam_attempts SET answers = ? WHERE id = ?', [JSON.stringify(cleanAnswers(answers, a)), a.id])
    }),
  },
  finishExam: {
    roles: ['peserta'],
    fn: (ctx, attemptId, answers) => tx(async (c) => {
      const [a] = await cq(c, `SELECT a.*, e.duration_min, r.user_id FROM exam_attempts a JOIN exams e ON e.id = a.exam_id JOIN registrations r ON r.id = a.registration_id WHERE a.id = ? FOR UPDATE`, [attemptId])
      if (!a || a.user_id !== ctx.user.id) fail('Data ujian tidak ditemukan.', 404)
      if (a.finished_at) return
      const inTime = new Date(a.started_at).getTime() + a.duration_min * 60_000 + 30_000 >= Date.now()
      await closeAttempt(c, a, inTime ? cleanAnswers(answers, a) : null)
      await audit(c, ctx.user.id, 'ujian.selesai', 'exam_attempts', a.id)
    }),
  },

  /* ---------- staf: bank soal dan jadwal ujian ---------- */
  saveBank: {
    roles: EXAM_STAFF,
    fn: (ctx, b) => tx(async (c) => {
      const name = str(b.name, 120)
      if (b.id) await cq(c, 'UPDATE question_banks SET name = ? WHERE id = ?', [name, b.id])
      else await cq(c, 'INSERT INTO question_banks (id, name) VALUES (?,?)', [uid(), name])
      await audit(c, ctx.user.id, 'bank-soal.simpan', 'question_banks', name)
    }),
  },
  deleteBank: {
    roles: EXAM_STAFF,
    fn: (ctx, id) => tx(async (c) => {
      const [{ n }] = await cq(c, 'SELECT COUNT(*) n FROM exams WHERE bank_id = ?', [id])
      if (Number(n)) fail('Bank soal ini dipakai ujian. Hapus ujiannya dulu.')
      await cq(c, 'DELETE FROM questions WHERE bank_id = ?', [id])
      await cq(c, 'DELETE FROM question_banks WHERE id = ?', [id])
      await audit(c, ctx.user.id, 'bank-soal.hapus', 'question_banks', id)
    }),
  },
  saveQuestions: {
    roles: EXAM_STAFF,
    fn: (ctx, bankId, list) => tx(async (c) => {
      const [b] = await cq(c, 'SELECT id FROM question_banks WHERE id = ?', [bankId])
      if (!b) fail('Bank soal tidak ditemukan.')
      if (!Array.isArray(list) || !list.length || list.length > 200) fail('Kirim 1 sampai 200 soal sekaligus.')
      for (const x of list) {
        const opts = (Array.isArray(x.options) ? x.options : []).map((o) => String(o ?? '').trim()).filter(Boolean)
        if (opts.length < 2 || opts.length > 5) fail('Setiap soal butuh 2 sampai 5 pilihan jawaban.')
        const ci = Number(x.correctIdx)
        if (!Number.isInteger(ci) || ci < 0 || ci >= opts.length) fail('Kunci jawaban harus salah satu pilihan.')
        const body = str(x.body, 2000)
        if (x.id) await cq(c, 'UPDATE questions SET body = ?, options = ?, correct_idx = ?, is_active = ? WHERE id = ? AND bank_id = ?', [body, JSON.stringify(opts), ci, x.active === false ? 0 : 1, x.id, bankId])
        else await cq(c, 'INSERT INTO questions (id, bank_id, body, options, correct_idx) VALUES (?,?,?,?,?)', [uid(), bankId, body, JSON.stringify(opts), ci])
      }
      await audit(c, ctx.user.id, 'soal.simpan', 'questions', `${list.length} soal`)
    }),
  },
  deleteQuestion: {
    roles: EXAM_STAFF,
    fn: (ctx, id) => tx(async (c) => {
      const [used] = await cq(c, "SELECT a.id FROM exam_attempts a WHERE a.question_ids LIKE ? LIMIT 1", [`%${id}%`])
      if (used) { await cq(c, 'UPDATE questions SET is_active = 0 WHERE id = ?', [id]); return 'nonaktif' } // soal yang sudah pernah dikerjakan dipertahankan untuk riwayat
      await cq(c, 'DELETE FROM questions WHERE id = ?', [id])
      return 'hapus'
    }),
  },
  saveExamConfig: {
    roles: EXAM_STAFF,
    fn: (ctx, e) => tx(async (c) => {
      const title = str(e.title, 160)
      const [bank] = await cq(c, 'SELECT id FROM question_banks WHERE id = ?', [e.bankId])
      if (!bank) fail('Pilih bank soal.')
      const open = new Date(e.openAt), close = new Date(e.closeAt)
      if (Number.isNaN(open.getTime()) || Number.isNaN(close.getTime()) || close <= open) fail('Waktu tutup harus setelah waktu buka.')
      const vals = [title, e.bankId, e.programId || null, open, close, num(e.durationMin, 5, 480), num(e.questionCount, 1, 200), e.active === false ? 0 : 1]
      if (e.id) await cq(c, 'UPDATE exams SET title=?, bank_id=?, program_id=?, open_at=?, close_at=?, duration_min=?, question_count=?, is_active=? WHERE id = ?', [...vals, e.id])
      else await cq(c, 'INSERT INTO exams (title, bank_id, program_id, open_at, close_at, duration_min, question_count, is_active, id) VALUES (?,?,?,?,?,?,?,?,?,?)', [...vals, uid()])
      await audit(c, ctx.user.id, e.id ? 'ujian.ubah' : 'ujian.buat', 'exams', title)
    }),
  },
  createExamToken: {
    roles: EXAM_STAFF,
    fn: (ctx, examId, minutes) => tx(async (c) => {
      const [e] = await cq(c, 'SELECT id, title FROM exams WHERE id = ? FOR UPDATE', [examId])
      if (!e) fail('Ujian tidak ditemukan.', 404)
      const mins = Number(minutes)
      if (!TOKEN_MINUTES.includes(mins)) fail('Pilih masa aktif token dari daftar.')
      await cq(c, 'UPDATE exam_tokens SET expires_at = ? WHERE exam_id = ? AND expires_at > ?', [dt(), e.id, dt()]) // satu token aktif per ujian
      let code = ''
      for (let i = 0; i < 20; i++) {
        code = Array.from({ length: 6 }, () => TOKEN_CHARS[Math.floor(Math.random() * TOKEN_CHARS.length)]).join('')
        const [dup] = await cq(c, 'SELECT id FROM exam_tokens WHERE token = ? AND expires_at > ?', [code, dt()])
        if (!dup) break
      }
      await cq(c, 'INSERT INTO exam_tokens (id, exam_id, token, expires_at, created_by) VALUES (?,?,?,?,?)', [uid(), e.id, code, new Date(Date.now() + mins * 60_000), ctx.user.id])
      await audit(c, ctx.user.id, 'token-ujian.buat', 'exam_tokens', `${e.title}: ${mins} menit`)
      return code
    }),
  },
  revokeExamToken: {
    roles: EXAM_STAFF,
    fn: (ctx, id) => tx(async (c) => {
      await cq(c, 'UPDATE exam_tokens SET expires_at = ? WHERE id = ? AND expires_at > ?', [dt(), id, dt()])
      await audit(c, ctx.user.id, 'token-ujian.cabut', 'exam_tokens', id)
    }),
  },
  deleteExam: {
    roles: EXAM_STAFF,
    fn: (ctx, id) => tx(async (c) => {
      const [{ n }] = await cq(c, 'SELECT COUNT(*) n FROM exam_attempts WHERE exam_id = ?', [id])
      if (Number(n)) fail('Ujian ini sudah dikerjakan peserta. Nonaktifkan saja agar riwayat tetap utuh.')
      await cq(c, 'DELETE FROM exam_tokens WHERE exam_id = ?', [id])
      await cq(c, 'DELETE FROM exams WHERE id = ?', [id])
      await audit(c, ctx.user.id, 'ujian.hapus', 'exams', id)
    }),
  },

  /* ---------- staf: keputusan penerimaan ---------- */
  decideAdmission: {
    roles: EXAM_STAFF,
    fn: (ctx, regId, passed, batchId) => tx(async (c) => {
      const [r] = await cq(c, 'SELECT * FROM registrations WHERE id = ? FOR UPDATE', [regId])
      if (!r) fail('Registrasi tidak ditemukan.')
      if (r.stage !== 'menunggu_hasil') fail('Keputusan hanya bisa diambil setelah peserta menyelesaikan ujian.')
      if (!passed) {
        await cq(c, "UPDATE registrations SET stage = 'tidak_lulus', status = 'cancelled', cancelled_reason = 'Tidak lulus seleksi' WHERE id = ?", [r.id])
        await notify(c, r.user_id, 'Hasil seleksi', 'Terima kasih sudah mengikuti seleksi. Anda belum dapat diterima pada batch ini. Biaya pendaftaran tidak dikembalikan.', '/app')
        await audit(c, ctx.user.id, 'seleksi.tidak-lulus', 'registrations', r.code)
        return
      }
      const [b] = await cq(c, 'SELECT * FROM batches WHERE id = ? FOR UPDATE', [batchId])
      if (!b) fail('Pilih angkatan untuk peserta yang lulus.')
      if (b.program_id !== r.program_id) fail('Angkatan harus dari jenis pelatihan yang dipilih peserta.')
      if (!['open', 'running'].includes(b.status)) fail('Angkatan ini sudah tidak menerima peserta.')
      const [{ n }] = await cq(c, "SELECT COUNT(*) n FROM registrations WHERE batch_id = ? AND stage IN ('registrasi_ulang','aktif') AND status IN ('pending_payment','active')", [b.id])
      if (Number(n) >= b.quota) fail('Kuota angkatan penuh.')
      const [{ m }] = await cq(c, 'SELECT COALESCE(MAX(admission_no), 0) + 1 m FROM registrations')
      await cq(c, "UPDATE registrations SET stage = 'registrasi_ulang', batch_id = ?, admission_no = ?, admission_at = ? WHERE id = ?", [b.id, Number(m), dt(), r.id])
      await notify(c, r.user_id, 'Selamat, Anda dinyatakan LULUS dan DITERIMA', 'Unduh surat kelulusan di aplikasi, pilih paket pembayaran, lalu lakukan registrasi ulang sebelum batas waktu pada surat.', '/app')
      await audit(c, ctx.user.id, 'seleksi.lulus', 'registrations', `${r.code} -> ${b.code}`)
    }),
  },

  /* ---------- staf: biaya dan surat ---------- */
  saveFees: {
    roles: FINANCE,
    fn: (ctx, f) => tx(async (c) => {
      const cur = await getSettings(c)
      const next = {
        ...cur,
        regFee: num(f.regFee, 0, 1_000_000_000), minReenroll: num(f.minReenroll, 0, 1_000_000_000),
        bankName: str(f.bankName, 80), bankAccount: str(f.bankAccount, 40), bankHolder: str(f.bankHolder, 80),
        reenrollDue: day(f.reenrollDue, 'batas registrasi ulang'), refundCutoff: day(f.refundCutoff, 'batas pengembalian dana'), pelunasanDue: day(f.pelunasanDue, 'pelunasan'),
      }
      await cq(c, "INSERT INTO settings (k, v) VALUES ('site', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)", [JSON.stringify(next)])
      await audit(c, ctx.user.id, 'biaya.ubah', 'settings', `pendaftaran ${next.regFee}`)
    }),
  },
  setProgramPrice: {
    roles: FINANCE,
    fn: (ctx, programId, price) => tx(async (c) => {
      const [p] = await cq(c, 'SELECT title FROM programs WHERE id = ?', [programId])
      if (!p) fail('Program tidak ditemukan.')
      await cq(c, 'UPDATE programs SET price = ? WHERE id = ?', [num(price, 0, 1_000_000_000), programId])
      await audit(c, ctx.user.id, 'biaya.program', 'programs', `${p.title}: ${price}`)
    }),
  },
  saveFeeItem: {
    roles: FINANCE,
    fn: (ctx, x) => tx(async (c) => {
      const name = str(x.name, 100)
      if (x.programId) { const [p] = await cq(c, 'SELECT id FROM programs WHERE id = ?', [x.programId]); if (!p) fail('Program tidak ditemukan.') }
      const vals = [name, num(x.amount, 0, 1_000_000_000), x.programId || null, x.active === false ? 0 : 1]
      if (x.id) await cq(c, 'UPDATE fee_items SET name=?, amount=?, program_id=?, is_active=? WHERE id = ?', [...vals, x.id])
      else await cq(c, 'INSERT INTO fee_items (name, amount, program_id, is_active, id) VALUES (?,?,?,?,?)', [...vals, uid()])
      await audit(c, ctx.user.id, 'biaya-tambahan.simpan', 'fee_items', `${name}: ${vals[1]}`)
    }),
  },
  deleteFeeItem: {
    roles: FINANCE,
    fn: (ctx, id) => tx(async (c) => {
      await cq(c, 'DELETE FROM fee_items WHERE id = ?', [id]) // jadwal cicilan yang sudah dibuat tidak berubah
      await audit(c, ctx.user.id, 'biaya-tambahan.hapus', 'fee_items', id)
    }),
  },
  savePlan: {
    roles: FINANCE,
    fn: (ctx, p) => tx(async (c) => {
      const vals = [str(p.name, 80), p.programId || null, num(p.downPayment, 0, 1_000_000_000), num(p.installments, 1, 36), p.active === false ? 0 : 1]
      if (p.id) await cq(c, 'UPDATE payment_plans SET name=?, program_id=?, down_payment=?, installments=?, is_active=? WHERE id = ?', [...vals, p.id])
      else await cq(c, 'INSERT INTO payment_plans (name, program_id, down_payment, installments, is_active, id) VALUES (?,?,?,?,?,?)', [...vals, uid()])
      await audit(c, ctx.user.id, 'paket-bayar.simpan', 'payment_plans', vals[0])
    }),
  },
  deletePlan: {
    roles: FINANCE,
    fn: (ctx, id) => tx(async (c) => {
      const [{ n }] = await cq(c, 'SELECT COUNT(*) n FROM registrations WHERE plan_id = ?', [id])
      if (Number(n)) { await cq(c, 'UPDATE payment_plans SET is_active = 0 WHERE id = ?', [id]); return 'nonaktif' }
      await cq(c, 'DELETE FROM payment_plans WHERE id = ?', [id])
      return 'hapus'
    }),
  },
  saveLetterSettings: {
    roles: EXAM_STAFF,
    fn: (ctx, f) => tx(async (c) => {
      const cur = await getSettings(c)
      const next = {
        ...cur,
        lpkRegNo: str(f.lpkRegNo, 60, false), ketuaName: str(f.ketuaName, 80), batchLabel: str(f.batchLabel, 80), email: str(f.email, 120, false), website: str(f.website, 120, false),
        hotline: str(f.hotline, 20, false), kuliahUmum: day(f.kuliahUmum, 'kuliah umum', false), trainingStart: day(f.trainingStart, 'mulai pelatihan', false),
      }
      await cq(c, "INSERT INTO settings (k, v) VALUES ('site', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)", [JSON.stringify(next)])
      await audit(c, ctx.user.id, 'surat.pengaturan', 'settings', next.batchLabel)
    }),
  },
}

/** Hanya jawaban untuk soal yang memang diberikan, berupa indeks pilihan. */
function cleanAnswers(answers, attempt) {
  const ids = new Set(JSON.parse(attempt.question_ids))
  const out = {}
  for (const [k, v] of Object.entries(answers && typeof answers === 'object' ? answers : {})) {
    if (ids.has(k) && Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) < 6) out[k] = Number(v)
  }
  return out
}

/* ---------- Surat kelulusan (PDF, A4 portrait) ---------- */
const LOGO = path.resolve('../public/logo.jpg')
const longDate = (d) => new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
const ordinal = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh']

/** Tulis surat kelulusan ke aliran PDF. Isinya mengikuti format "CHI - Surat Kelulusan". */
export async function renderLetter(res, regId) {
  const [r] = await q('SELECT * FROM registrations WHERE id = ?', [regId])
  if (!r || !r.admission_no) fail('Surat belum tersedia.', 404)
  const [u] = await q('SELECT name FROM users WHERE id = ?', [r.user_id])
  const [pf] = await q('SELECT birth_place, birth_date, school FROM participant_profiles WHERE user_id = ?', [r.user_id])
  const [u2] = await q('SELECT birth_date FROM users WHERE id = ?', [r.user_id])
  const [prog] = await q('SELECT title FROM programs WHERE id = ?', [r.program_id])
  const [b] = r.batch_id ? await q('SELECT code, start_date FROM batches WHERE id = ?', [r.batch_id]) : [null]
  const s = await getSettings()
  const year = new Date(r.admission_at).getFullYear()
  const no = String(r.admission_no)
  const batchNo = Number(String(b?.code ?? '').match(/(\d+)\s*$/)?.[1] ?? 0)
  const min = s.minReenroll ?? MIN_REENROLL_DEFAULT
  const bd = pf?.birth_date ?? u2?.birth_date

  const doc = new PDFDocument({ size: 'A4', margins: { top: 40, bottom: 40, left: 56, right: 56 } })
  doc.pipe(res)
  const L = 56, W = 595.28 - 112
  try { doc.image(LOGO, L, 36, { height: 64 }) } catch { /* logo opsional */ }
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#395886').text('LEMBAGA PELATIHAN KERJA (LPK)', L + 80, 36, { width: W - 80, align: 'center' })
  doc.font('Helvetica-Bold').fontSize(24).fillColor('#1a2a44').text('CIMAHI HOTEL INSTITUTE', L + 80, 48, { width: W - 80, align: 'center' })
  doc.font('Helvetica').fontSize(8).fillColor('#1d2a3d')
    .text(`No Registrasi : ${s.lpkRegNo || '-'}`, L + 80, 76, { width: W - 80, align: 'center' })
    .text(s.address || 'Jalan Pasantren KM.2, Cibabat, Cimahi Utara, Kota Cimahi 40513 Jawa Barat', { width: W - 80, align: 'center' })
    .text(`Telp : ${s.phone || '-'}  Email : ${s.email || '-'}  Website : ${s.website || '-'}`, { width: W - 80, align: 'center' })
  doc.moveTo(L, 112).lineTo(L + W, 112).lineWidth(3).strokeColor('#395886').stroke()

  doc.y = 124
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#1d2a3d')
    .text('PENGUMUMAN PENERIMAAN CALON PESERTA DIDIK', L, doc.y, { width: W, align: 'center' })
    .text('LEMBAGA PELATIHAN KERJA (LPK) CIMAHI HOTEL INSTITUTE', { width: W, align: 'center' })
    .text((s.batchLabel || 'BATCH').toUpperCase(), { width: W, align: 'center' })
  doc.font('Helvetica').text(`Nomor : ${no}/PDB-CHI/${year}`, { width: W, align: 'center' })
  doc.moveDown(0.8).fontSize(10)
  doc.text('Berdasarkan hasil seleksi Penerimaan Peserta Didik Baru di Lembaga Pelatihan Kerja (LPK) Cimahi Hotel Institute' + (s.batchLabel ? ` ${s.batchLabel}` : '') + ', Peserta Didik dengan identitas sebagai berikut:', { width: W, align: 'justify' })
  doc.moveDown(0.6)
  const rows = [
    ['No Registrasi', no], ['Nama Lengkap', u.name],
    ['Tempat, Tanggal Lahir', `${pf?.birth_place ?? '-'}, ${bd ? longDate(bd) : '-'}`], ['Asal Sekolah', pf?.school || '-'],
    ['Program Pelatihan', prog.title], ['Angkatan', batchNo > 0 && ordinal[batchNo] ? `${batchNo} (${ordinal[batchNo]})` : (b?.code ?? '-')],
  ]
  for (const [k, v] of rows) {
    const y = doc.y
    doc.font('Helvetica').text(k, L + 8, y, { width: 130 }).text(':', L + 140, y)
    doc.font('Helvetica-Bold').text(v, L + 152, y, { width: W - 152 })
  }
  const bar = '='.repeat(66)
  doc.moveDown(0.5).font('Helvetica').text(bar, L, doc.y, { width: W, align: 'center' })
  doc.text('dinyatakan', { width: W, align: 'center' })
  doc.font('Helvetica-Bold').fontSize(16).text('LULUS dan DITERIMA', { width: W, align: 'center' })
  doc.font('Helvetica').fontSize(10).text('Sebagai Peserta Didik Baru LPK Cimahi Hotel Institute', { width: W, align: 'center' })
  doc.text(bar, { width: W, align: 'center' })
  doc.moveDown(0.6)

  const rp2 = (n) => 'Rp. ' + Number(n).toLocaleString('id-ID')
  doc.text('Kepada Peserta Didik yang dinyatakan lulus seleksi agar memenuhi ketentuan sebagai berikut:', { width: W })
  doc.moveDown(0.4)
  const item = (n, text) => { const y = doc.y; doc.text(`${n})`, L, y, { width: 18 }); doc.text(text, L + 20, y, { width: W - 20, align: 'justify' }); doc.moveDown(0.25) }
  item(1, `Melakukan REGISTRASI ULANG dengan membayar Biaya Registrasi minimal sebesar ${rp2(min)} dari total biaya pelatihan atau sesuai opsi pembayaran registrasi yang tersedia di aplikasi${s.reenrollDue ? `, paling lambat tanggal ${longDate(s.reenrollDue)}` : ''}. Pembayaran melalui transfer ${s.bankName ?? 'Bank BNI'} an. ${s.bankHolder ?? ''} Nomor Rekening ${s.bankAccount ?? ''}. Unggah bukti pembayaran di aplikasi${s.hotline ? ` atau kirim ke HOTLINE ${s.hotline}` : ''}. (Mohon waspada, Cimahi Hotel Institute hanya menerima pembayaran melalui Bank Transfer tertera)`)
  item(2, 'Setelah melakukan pembayaran Biaya Registrasi, Peserta Didik mengunggah berkas di aplikasi: a) KTP, b) Ijazah, c) Pas foto 3x4, d) Kartu Keluarga (KK), e) Surat Keterangan Tidak Buta Warna (Klinik/Puskesmas).')
  item(3, 'Bagi Peserta Didik yang tidak melakukan Registrasi Ulang dianggap mengundurkan diri.')
  item(4, s.refundCutoff ? `Bagi Peserta yang mengundurkan diri sebelum tanggal ${longDate(s.refundCutoff)}, Biaya Registrasi akan dikembalikan dengan potongan sebesar 50% dari total biaya registrasi yang telah dibayarkan. Jika melewati tanggal tersebut, maka Biaya Registrasi tidak dapat dikembalikan.` : 'Biaya Registrasi yang sudah dibayarkan tidak dapat dikembalikan.')
  const mulai = s.trainingStart || b?.start_date
  item(5, `${s.kuliahUmum ? `Pelaksanaan Kuliah Umum akan dilaksanakan pada tanggal ${longDate(s.kuliahUmum)} dan ` : ''}Pelatihan akan dimulai${mulai ? ` tanggal ${longDate(mulai)}` : ''} secara luring/offline di Kampus Cimahi Hotel Institute, ${s.address || 'Jalan Pasantren KM.2 Cibabat Cimahi Utara Kota Cimahi'}.`)
  if (s.pelunasanDue) item(6, `Pelunasan Biaya Pelatihan sampai dengan tanggal ${longDate(s.pelunasanDue)}.`)
  doc.moveDown(0.4).text('Demikian pengumuman ini disampaikan. Atas perhatian Saudara, kami ucapkan terimakasih.', L, doc.y, { width: W })
  doc.moveDown(0.8)
  const x = L + W - 200
  doc.text(`Cimahi, ${longDate(r.admission_at)}.`, x, doc.y, { width: 200 }).text('Ketua LPK', { width: 200 }).text('Cimahi Hotel Institute,', { width: 200 })
  doc.moveDown(3.2).font('Helvetica-Bold').text(s.ketuaName || '', x, doc.y, { width: 200 })
  doc.end()
}
