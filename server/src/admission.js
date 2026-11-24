import PDFDocument from 'pdfkit'
import fs from 'node:fs'
import path from 'node:path'
import { AUTO_WITHDRAW_DAYS, AUTO_WITHDRAW_REASON, UPLOAD_DIR, audit, cq, dt, fail, getSettings, iso, mail, onCommit, q, tx, uid } from './lib.js'
import { push } from './realtime.js'

/*
 * Penerimaan peserta: data diri, bayar pendaftaran, ujian tulis, keputusan lulus, registrasi ulang.
 * Tahapan disimpan di registrations.stage. Nilai ujian hanya terlihat staf, tidak pernah dikirim ke peserta.
 */

export const REG_FEE_DEFAULT = 200_000
export const MIN_REENROLL_DEFAULT = 1_000_000
const EXAM_STAFF = ['super_admin', 'admin_pendaftaran'] // Akademik tidak lagi mengelola ujian tulis
const LETTER_ROLES = ['super_admin', 'admin_pendaftaran']
const FINANCE = ['super_admin', 'admin_keuangan']
const PAY_STAFF = ['super_admin', 'admin_keuangan'] // admin pendaftaran tidak mengurus pembayaran
const REMIND_GAP_HOURS = 6
const num = (v, min = 0, max = Infinity) => { const n = Number(v); if (!Number.isFinite(n) || n < min || n > max) fail('Nilai angka tidak valid.'); return n }
const str = (v, max = 255, req = true) => { const s = String(v ?? '').trim(); if (req && !s) fail('Ada isian wajib yang kosong.'); return s.slice(0, max) }
const day = (v, label, req = true) => { const s = String(v ?? ''); if (!s && !req) return ''; if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(new Date(s).getTime())) fail(`Tanggal ${label} tidak valid.`); return s }

/** Notifikasi dalam aplikasi, ditambah email ke alamat akun. Dipanggil di dalam transaksi. */
export async function notify(c, userId, title, body, link = null) {
  await cq(c, 'INSERT INTO notifications (id, user_id, title, body, link) VALUES (?,?,?,?,?)', [uid(), userId, title.slice(0, 160), body.slice(0, 500), link])
  onCommit(c, () => push('notify', { users: [userId] }))
  const [u] = await cq(c, 'SELECT email FROM users WHERE id = ?', [userId])
  if (u?.email) await mail(c, u.email, title, body)
}

const rp = (n) => 'Rp' + Number(n).toLocaleString('id-ID')

/** Pindah ke tahap pembayaran setelah data diri lengkap. Dipanggil dari unggah data diri. */
export async function afterProfileDone(c, userId) {
  const regs = await cq(c, "SELECT id FROM registrations WHERE user_id = ? AND stage = 'data' FOR UPDATE", [userId])
  if (!regs.length) return
  // Biaya pendaftaran yang sudah dicatat keuangan sebelum data diri lengkap: tahap pembayaran dilewati, langsung ke ujian tulis.
  const prepaid = await cq(c, "SELECT DISTINCT registration_id id FROM payments WHERE registration_id IN (?) AND kind = 'pendaftaran' AND status = 'verified'", [regs.map((r) => r.id)])
  if (prepaid.length) {
    await cq(c, "UPDATE registrations SET stage = 'ujian' WHERE id IN (?)", [prepaid.map((r) => r.id)])
    await notify(c, userId, 'Data diri lengkap: ujian online terbuka', 'Biaya pendaftaran Anda sudah tercatat lunas. Buka menu Ujian online; token diberikan otomatis oleh sistem saat jadwal ujian dibuka dan berlaku 1 hari.', '/app/ujian')
    if (prepaid.length === regs.length) return
  }
  const s = await getSettings(c)
  await cq(c, "UPDATE registrations SET stage = 'bayar_daftar' WHERE user_id = ? AND stage = 'data'", [userId])
  await notify(c, userId, 'Data diri lengkap: bayar biaya pendaftaran',
    `Transfer ${rp(s.regFee ?? REG_FEE_DEFAULT)} ke ${s.bankName ?? 'BNI'} ${s.bankAccount ?? ''} a.n. ${s.bankHolder ?? ''}, lalu unggah bukti pembayaran. Ujian online terbuka setelah pembayaran dikonfirmasi.`, '/app')
}

/** Jadwal cicilan dari paket: cicilan pertama sebesar uang muka, sisanya dibagi rata sampai tanggal pelunasan. */
export function buildSchedule(total, plan, firstDue, lastDue) {
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
    await notify(c, r.user_id, 'Ujian online selesai', 'Jawaban Anda sudah tersimpan. Hasil seleksi diumumkan oleh admin lewat aplikasi dan email.', '/app')
  }
}

/** Notifikasi yang sudah dibaca berlaku 3 hari sejak dibaca. Yang belum dibaca tetap ada sampai dibuka. */
export const NOTIF_READ_TTL_DAYS = 3
export const notifCutoff = () => new Date(Date.now() - NOTIF_READ_TTL_DAYS * 86_400_000)

/**
 * Pengingat otomatis sekali sehari untuk pendaftar yang masih di tahap ujian online dan belum mengerjakannya, selama ada jadwal ujian yang terbuka.
 * Pengingat dikirim bila notifikasi bertautan /app/ujian terakhir (pembuka ujian atau pengingat sebelumnya) sudah lebih dari 24 jam.
 */
const REMIND_EVERY_MS = 24 * 3_600_000
async function remindExams(c) {
  const now = new Date()
  const exams = await cq(c, 'SELECT program_id, close_at FROM exams WHERE is_active = 1 AND open_at <= ? AND close_at > ?', [now, now])
  if (!exams.length) return
  const due = await cq(c, `SELECT r.id, r.user_id, r.program_id FROM registrations r
    WHERE r.stage = 'ujian' AND r.status IN ('pending_payment','active')
    AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.user_id = r.user_id AND n.link = '/app/ujian' AND n.created_at > ?) FOR UPDATE`, [new Date(now.getTime() - REMIND_EVERY_MS)])
  for (const r of due) {
    const mine = exams.filter((x) => !x.program_id || x.program_id === r.program_id)
    if (!mine.length) continue
    const [att] = await cq(c, `SELECT 1 FROM exam_attempts a WHERE a.registration_id = ? AND a.finished_at IS NOT NULL LIMIT 1`, [r.id])
    if (att) continue
    const close = new Date(Math.min(...mine.map((x) => new Date(x.close_at).getTime())))
    await notify(c, r.user_id, 'Pengingat: selesaikan ujian online',
      `Ujian online Anda belum dikerjakan. Selesaikan sebelum ${close.toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Jakarta' })} WIB agar bisa lanjut ke tahap berikutnya. Token diberikan otomatis di menu Ujian online.`, '/app/ujian')
  }
}

/**
 * Mundur otomatis: pendaftar yang tidak melanjutkan proses lebih dari 2 minggu dinyatakan mengundurkan diri oleh sistem.
 * Dihitung sejak pendaftaran (tahap data diri, pembayaran pendaftaran, dan ujian online) atau sejak dinyatakan lulus (registrasi ulang
 * yang belum ada pembayarannya), dan dimulai ulang bila pendaftar menekan Lanjutkan proses. Yang sedang menunggu verifikasi bukti bayar,
 * sedang mengerjakan ujian, atau menunggu keputusan admin tidak dihitung.
 */
async function withdrawIdle(c) {
  const cutoff = new Date(Date.now() - AUTO_WITHDRAW_DAYS * 86_400_000)
  const idle = await cq(c, `SELECT r.id, r.code, r.user_id FROM registrations r WHERE r.status = 'pending_payment'
    AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.registration_id = r.id AND p.status = 'submitted')
    AND ((r.stage IN ('data','bayar_daftar','ujian') AND GREATEST(r.created_at, COALESCE(r.resumed_at, r.created_at)) < ?
          AND NOT EXISTS (SELECT 1 FROM exam_attempts a WHERE a.registration_id = r.id AND a.finished_at IS NULL))
      OR (r.stage = 'registrasi_ulang' AND GREATEST(COALESCE(r.admission_at, r.created_at), COALESCE(r.resumed_at, r.created_at)) < ?
          AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.registration_id = r.id AND p.kind = 'registrasi_ulang' AND p.status IN ('submitted','verified'))))
    FOR UPDATE`, [cutoff, cutoff])
  for (const r of idle) {
    await cq(c, "UPDATE registrations SET status = 'expired', cancelled_reason = ?, followup_at = NULL, followup_by = NULL WHERE id = ?", [AUTO_WITHDRAW_REASON, r.id])
    await notify(c, r.user_id, 'Anda dinyatakan mengundurkan diri',
      'Anda telah dinyatakan mengundurkan diri karena tidak melanjutkan proses pendaftaran atau registrasi selama 2 minggu. Anda tetap dapat melanjutkan prosesnya dengan menekan tombol Lanjutkan proses di dashboard.', '/app')
    await audit(c, null, 'registrasi.mundur-otomatis', 'registrations', r.code)
  }
  if (idle.length) onCommit(c, () => push('notify', { roles: ['super_admin', 'admin_pendaftaran', 'admin_keuangan'] })) // daftar pendaftar di halaman admin langsung diperbarui
}

/** Calon peserta didik yang mundur (kedaluwarsa atau dibatalkan) bisa melanjutkan prosesnya, kecuali yang tidak lulus seleksi atau sudah aktif belajar. */
export const RESUMABLE_STAGES = ['data', 'bayar_daftar', 'ujian', 'menunggu_hasil', 'registrasi_ulang']
export const canResumeReg = (r) => ['expired', 'cancelled'].includes(r.status) && RESUMABLE_STAGES.includes(r.stage)

/** Menjalankan lagi pendaftaran yang mundur, oleh pendaftar sendiri atau staf. Hitungan 2 minggu dimulai ulang. */
async function resumeReg(c, r, actorId, byStaff) {
  const who = byStaff ? 'Pendaftar ini' : 'Anda'
  const [prog] = await cq(c, 'SELECT title FROM programs WHERE id = ? AND is_active = 1 AND deleted_at IS NULL', [r.program_id])
  if (!prog) fail('Jenis pelatihan ini tidak dibuka lagi.' + (byStaff ? '' : ' Hubungi admin pendaftaran.'))
  const [other] = await cq(c, "SELECT id FROM registrations WHERE user_id = ? AND program_id = ? AND id <> ? AND status IN ('pending_payment','waiting_verification','active') LIMIT 1", [r.user_id, r.program_id, r.id])
  if (other) fail(`${who} sudah punya pendaftaran aktif pada jenis pelatihan yang sama.`)
  if (r.stage === 'registrasi_ulang' && r.batch_id) {
    const [b] = await cq(c, 'SELECT code, quota, status FROM batches WHERE id = ? FOR UPDATE', [r.batch_id])
    if (!b || !['open', 'running'].includes(b.status)) fail('Angkatan sudah tidak menerima peserta.' + (byStaff ? ' Ubah angkatannya dulu.' : ' Hubungi admin pendaftaran.'))
    const [{ n }] = await cq(c, "SELECT COUNT(*) n FROM registrations WHERE batch_id = ? AND stage IN ('registrasi_ulang','aktif') AND status IN ('pending_payment','active')", [r.batch_id])
    if (Number(n) >= b.quota) fail(`Kuota angkatan ${b.code} sudah penuh.` + (byStaff ? '' : ' Hubungi admin pendaftaran.'))
  }
  await cq(c, "UPDATE registrations SET status = 'pending_payment', cancelled_reason = NULL, resumed_at = ?, followup_at = NULL, followup_by = NULL WHERE id = ?", [dt(), r.id])
  if (byStaff) await notify(c, r.user_id, 'Proses pendaftaran Anda dilanjutkan', 'Admin melanjutkan proses pendaftaran Anda. Selesaikan tahapan berikutnya dalam 2 minggu agar tidak dinyatakan mundur lagi.', '/app')
  await audit(c, actorId, byStaff ? 'registrasi.lanjut-admin' : 'registrasi.lanjut', 'registrations', r.code)
  onCommit(c, () => push('notify', { roles: ['super_admin', 'admin_pendaftaran', 'admin_keuangan'] }))
}

/**
 * Pertemuan yang sudah dimulai tetapi absensinya belum diisi, untuk satu instruktur (pengampu mata pelajarannya menurut jadwal). Hanya angkatan yang sudah punya peserta didik aktif yang dihitung, karena tanpa peserta
 * aktif absensi tidak bisa diisi. graceHours menunda penghitungan agar pertemuan yang baru dimulai belum dianggap tertunggak.
 * batchId kosong = semua angkatan.
 */
export async function unattendedSessions(c, instructorId, batchId = null, graceHours = 0) {
  // graceHours = null: semua pertemuan tanpa absensi dihitung, termasuk yang belum dimulai (dipakai saat menambah pertemuan baru).
  const before = graceHours == null ? new Date('9999-12-31') : new Date(Date.now() - graceHours * 3_600_000)
  return cq(c, `SELECT cs.id, cs.batch_id, cs.title, cs.start_at, b.code batch_code, sj.name subject
    FROM class_sessions cs
    JOIN batches b ON b.id = cs.batch_id
    LEFT JOIN batch_subjects bs ON bs.batch_id = cs.batch_id AND bs.subject_id = cs.subject_id
    LEFT JOIN subjects sj ON sj.id = cs.subject_id
    WHERE bs.instructor_id = ? ${batchId ? 'AND cs.batch_id = ?' : ''} AND cs.start_at <= ?
      AND NOT EXISTS (SELECT 1 FROM attendances a WHERE a.session_id = cs.id)
      AND EXISTS (SELECT 1 FROM registrations r WHERE r.batch_id = cs.batch_id AND r.status = 'active')
    ORDER BY cs.start_at`, batchId ? [instructorId, batchId, before] : [instructorId, before])
}

/** Pengingat harian untuk instruktur yang masih punya pertemuan belum diabsen (lebih dari 3 jam sejak dimulai). */
async function remindAttendance(c) {
  const before = new Date(Date.now() - 3 * 3_600_000)
  const who = await cq(c, `SELECT DISTINCT bs.instructor_id uid
    FROM class_sessions cs JOIN batches b ON b.id = cs.batch_id
    JOIN batch_subjects bs ON bs.batch_id = cs.batch_id AND bs.subject_id = cs.subject_id
    WHERE cs.start_at <= ? AND NOT EXISTS (SELECT 1 FROM attendances a WHERE a.session_id = cs.id)
      AND EXISTS (SELECT 1 FROM registrations r WHERE r.batch_id = cs.batch_id AND r.status = 'active')`, [before])
  for (const { uid: instructor } of who) {
    if (!instructor) continue
    const [recent] = await cq(c, "SELECT id FROM notifications WHERE user_id = ? AND title = 'Pengingat: isi absensi peserta didik' AND created_at > ? LIMIT 1", [instructor, new Date(Date.now() - REMIND_EVERY_MS)])
    if (recent) continue
    const list = await unattendedSessions(c, instructor, null, 3)
    if (!list.length) continue
    const first = list.slice(0, 3).map((x) => `${x.subject ?? 'Pertemuan'}: ${x.title} (${x.batch_code})`).join('; ')
    await notify(c, instructor, 'Pengingat: isi absensi peserta didik',
      `${list.length} pertemuan belum diisi absensinya, antara lain ${first}${list.length > 3 ? ', dan lainnya' : ''}. Isi absensi di menu Absensi. Pertemuan baru tidak bisa ditambah sebelum absensi terisi.`, '/admin/absensi')
  }
}

/** Tutup ujian yang waktunya habis dan kedaluwarsakan registrasi ulang yang lewat batas. Dipanggil berkala. */
export async function sweepAdmissions() {
  return tx(async (c) => {
    await cq(c, 'DELETE FROM notifications WHERE read_at IS NOT NULL AND read_at < ?', [notifCutoff()])
    const late = await cq(c, `SELECT a.*, e.duration_min FROM exam_attempts a JOIN exams e ON e.id = a.exam_id WHERE a.finished_at IS NULL AND DATE_ADD(a.started_at, INTERVAL e.duration_min MINUTE) < ? FOR UPDATE`, [dt()])
    for (const a of late) await closeAttempt(c, a, null)
    await remindExams(c)
    await withdrawIdle(c)
    await remindAttendance(c)
    await recalcAttendancePct(c) // nilai draf selalu mengikuti rekap absensi, termasuk data lama yang pernah diisi manual
    // Selaraskan kelulusan sempurna dengan pembayaran (juga untuk data lama yang divalidasi sebelum aturan pelunasan).
    for (const { registration_id } of await cq(c, "SELECT g.registration_id FROM grades g JOIN registrations r ON r.id = g.registration_id WHERE g.status = 'validated' AND g.passed = 1 AND r.status IN ('active','completed')")) await syncGraduation(c, registration_id)
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

/**
 * Registrasi yang sudah melunasi seluruh biaya: ada jadwal pembayaran, semua termin terbayar, dan biaya pendaftaran sudah tercatat
 * (peserta yang ditambahkan admin harus punya catatan biaya pendaftaran kecuali angkatannya dibebaskan). Tanpa jadwal pembayaran
 * dianggap belum lunas karena tagihannya belum ditetapkan.
 */
export async function paidOffIds(c, ids) {
  if (!ids.length) return new Set()
  const sql = `SELECT r.id, r.source, COALESCE(b.free_reg_fee, 0) free,
    (SELECT COUNT(*) FROM installments i WHERE i.registration_id = r.id) ni,
    (SELECT COALESCE(SUM(i.amount - i.paid_amount), 0) FROM installments i WHERE i.registration_id = r.id) rest,
    (SELECT COUNT(*) FROM payments p WHERE p.registration_id = r.id AND p.kind = 'pendaftaran' AND p.status = 'verified') regfee
    FROM registrations r LEFT JOIN batches b ON b.id = r.batch_id WHERE r.id IN (?)`
  const rows = c ? await cq(c, sql, [ids]) : await q(sql, [ids])
  return new Set(rows.filter((x) => Number(x.ni) > 0 && Number(x.rest) <= 0 && (x.source !== 'admin' || Number(x.free) || Number(x.regfee) > 0)).map((x) => x.id))
}
export const isFullyPaid = async (c, regId) => (await paidOffIds(c, [regId])).has(regId)

/**
 * Kelulusan sempurna: nilai akhir tervalidasi lulus DAN seluruh pembayaran lunas. Selama belum lunas, pendaftaran tetap berstatus
 * aktif (lulus pelatihan, menunggu pelunasan). Dipanggil setelah nilai divalidasi dan setiap kali pembayaran berubah.
 * Mengembalikan { passed, paid }; passed false bila nilai belum tervalidasi lulus.
 */
export async function syncGraduation(c, regId) {
  const [r] = await cq(c, 'SELECT * FROM registrations WHERE id = ? FOR UPDATE', [regId])
  if (!r || !['active', 'completed'].includes(r.status)) return { passed: false, paid: false }
  const [g] = await cq(c, "SELECT passed FROM grades WHERE registration_id = ? AND status = 'validated'", [regId])
  if (!g || !g.passed) return { passed: false, paid: false }
  const paid = await isFullyPaid(c, regId)
  // Kelulusan sempurna juga menunggu nilai magang yang diinput Akademik: tanpa nilai magang, peserta belum lulus dan belum bisa mengakses transkrip akhir.
  const [{ n: scoredN }] = await cq(c, "SELECT COUNT(*) n FROM placements WHERE registration_id = ? AND kind = 'magang' AND status <> 'batal' AND score IS NOT NULL", [regId])
  const scored = Number(scoredN) > 0
  if (paid && scored && r.status === 'active') {
    await cq(c, "UPDATE registrations SET status = 'completed' WHERE id = ?", [regId])
    await notify(c, r.user_id, 'Selamat atas kelulusan Anda', 'Seluruh pembayaran Anda lunas, nilai magang sudah diinput, dan nilai akhir dinyatakan lulus. Transkrip akhir pelatihan dapat dilihat dan diunduh di menu Transkrip akhir.', '/app/transkrip')
    await audit(c, null, 'kelulusan.sempurna', 'registrations', r.code)
  } else if (!(paid && scored) && r.status === 'completed') {
    await cq(c, "UPDATE registrations SET status = 'active' WHERE id = ?", [regId]) // pembayaran dibatalkan atau tagihan bertambah: kembali menunggu pelunasan
    await audit(c, null, 'kelulusan.ditunda', 'registrations', r.code)
  }
  return { passed: true, paid, scored }
}

/**
 * Persentase kehadiran di nilai dihitung otomatis dari rekap absensi per pertemuan: pertemuan yang hadir dibagi seluruh pertemuan
 * di angkatan yang sudah diabsen. Hanya untuk nilai berstatus draf milik peserta aktif; nilai yang sudah dikirim atau divalidasi terkunci.
 * Tanpa batchId = semua angkatan. Angkatan yang belum punya absensi sama sekali dihitung 0.
 */
export async function recalcAttendancePct(c, batchId = null) {
  const batches = batchId ? [{ id: batchId }] : await cq(c, "SELECT DISTINCT r.batch_id id FROM registrations r JOIN grades g ON g.registration_id = r.id WHERE r.batch_id IS NOT NULL AND g.status = 'draft'")
  for (const { id } of batches) {
    const [{ held }] = await cq(c, 'SELECT COUNT(DISTINCT a.session_id) held FROM attendances a JOIN class_sessions cs ON cs.id = a.session_id WHERE cs.batch_id = ?', [id])
    await cq(c, `UPDATE grades g JOIN registrations r ON r.id = g.registration_id
      SET g.attendance_pct = ${Number(held) ? `LEAST(100, ROUND(100 * (SELECT COUNT(*) FROM attendances a JOIN class_sessions cs ON cs.id = a.session_id
        WHERE a.registration_id = r.id AND cs.batch_id = r.batch_id AND a.status = 'hadir') / ?))` : '0'}
      WHERE r.batch_id = ? AND g.status = 'draft' AND r.status = 'active'`, Number(held) ? [Number(held), id] : [id])
    await syncFinal(c, id)
  }
}

/* ---------- bobot nilai per mata pelajaran ---------- */
export const BASE_WEIGHTS = { absensi: 10, tugas: 20, teori: 30, praktik: 40 }
const W_KEYS = ['absensi', 'tugas', 'teori', 'praktik']
/** Bobot sah: empat bilangan bulat 0 sampai 100 yang jumlahnya 100. */
export const validWeights = (w) => !!w && W_KEYS.every((k) => Number.isInteger(w[k]) && w[k] >= 0 && w[k] <= 100) && W_KEYS.reduce((t, k) => t + w[k], 0) === 100
/** Bobot default yang ditetapkan Akademik (settings.grade_weights); belum diatur = 10/20/30/40. */
export async function defaultWeights(c) {
  const [r] = await cq(c, "SELECT v FROM settings WHERE k = 'grade_weights'")
  try { const w = JSON.parse(r?.v); if (validWeights(w)) return w } catch { /* pakai bawaan */ }
  return { ...BASE_WEIGHTS }
}
/**
 * Bobot berlaku untuk satu mata pelajaran di satu angkatan: bobot yang diatur untuk mapel itu bila ada.
 * Bobot default sama untuk semua jenis mapel: mapel teori tetap bisa punya penilaian praktik (mis. Bahasa Inggris).
 */
export function weightsFor(bs, kind, def) {
  if (bs.w_absensi != null && bs.w_tugas != null && bs.w_teori != null && bs.w_praktik != null) return { absensi: Number(bs.w_absensi), tugas: Number(bs.w_tugas), teori: Number(bs.w_teori), praktik: Number(bs.w_praktik) }
  void kind // bobot default sama untuk semua jenis mapel
  return def
}
/**
 * Menghitung ulang nilai akhir program peserta draf di satu angkatan: rata-rata nilai akhir seluruh mata pelajaran
 * (absensi mapel, tugas, teori, praktik masing-masing dikali bobot mapel itu). Komponen yang belum diisi dihitung 0.
 * Angkatan tanpa mata pelajaran tidak diubah (memakai rumus bobot teori/praktik program).
 */
export async function syncFinal(c, batchId, regId = null) {
  const subs = await cq(c, 'SELECT bs.*, sj.kind FROM batch_subjects bs JOIN subjects sj ON sj.id = bs.subject_id WHERE bs.batch_id = ?', [batchId])
  if (!subs.length) return
  const def = await defaultWeights(c)
  const regs = await cq(c, `SELECT r.id FROM registrations r JOIN grades g ON g.registration_id = r.id WHERE r.batch_id = ? AND g.status = 'draft' AND r.status = 'active'${regId ? ' AND r.id = ?' : ''}`, regId ? [batchId, regId] : [batchId])
  if (!regs.length) return
  const sg = await cq(c, 'SELECT * FROM subject_grades WHERE registration_id IN (?)', [regs.map((r) => r.id)])
  const ses = await cq(c, 'SELECT DISTINCT cs.subject_id, a.session_id FROM attendances a JOIN class_sessions cs ON cs.id = a.session_id WHERE cs.batch_id = ?', [batchId])
  const present = await cq(c, "SELECT cs.subject_id, a.registration_id, COUNT(*) n FROM attendances a JOIN class_sessions cs ON cs.id = a.session_id WHERE cs.batch_id = ? AND a.status = 'hadir' GROUP BY cs.subject_id, a.registration_id", [batchId])
  const r2 = (n) => Math.round(n * 100) / 100
  for (const { id } of regs) {
    let total = 0
    for (const bs of subs) {
      const w = weightsFor(bs, bs.kind, def)
      const held = ses.filter((x) => x.subject_id === bs.subject_id).length
      const hadir = Number(present.find((x) => x.subject_id === bs.subject_id && x.registration_id === id)?.n ?? 0)
      const abs = held ? Math.min(100, Math.round((hadir / held) * 100)) : 0
      const g = sg.find((x) => x.registration_id === id && x.subject_id === bs.subject_id)
      total += r2((abs * w.absensi) / 100) + r2((Number(g?.task ?? 0) * w.tugas) / 100) + r2((Number(g?.theory ?? 0) * w.teori) / 100) + r2((Number(g?.practical ?? 0) * w.praktik) / 100)
    }
    await cq(c, 'UPDATE grades SET final_score = ROUND(?, 1) WHERE registration_id = ?', [total / subs.length, id])
  }
}

/**
 * Nilai per mata pelajaran yang sudah divalidasi Akademik untuk satu peserta (isi transkrip): absensi, tugas, teori, praktik,
 * nilai angka (terbobot) dan nilai huruf. c boleh null (di luar transaksi).
 */
export async function subjectResults(c, batchId, regId) {
  const Q = (sql, p) => (c ? cq(c, sql, p) : q(sql, p))
  const subs = await Q(`SELECT bs.*, sj.kind, sj.name, sj.hours FROM batch_subjects bs JOIN subjects sj ON sj.id = bs.subject_id
    JOIN subject_grades sg ON sg.subject_id = bs.subject_id AND sg.registration_id = ? AND sg.status = 'validated' WHERE bs.batch_id = ? ORDER BY sj.name`, [regId, batchId])
  if (!subs.length) return []
  const def = c ? await defaultWeights(c) : (await (async () => { const [r] = await q("SELECT v FROM settings WHERE k = 'grade_weights'"); try { const w = JSON.parse(r?.v); if (validWeights(w)) return w } catch { /* bawaan */ } return { ...BASE_WEIGHTS } })())
  let letters = [85, 80, 75, 70, 60, 50, 40]
  const [lr] = await Q("SELECT v FROM settings WHERE k = 'grade_letters'")
  try { const b = JSON.parse(lr?.v); if (Array.isArray(b) && b.length === 7 && b.every((n) => Number.isFinite(n))) letters = b } catch { /* bawaan */ }
  const HURUF = ['A', 'AB', 'B', 'BC', 'C', 'CD', 'D']
  const sg = await Q('SELECT * FROM subject_grades WHERE registration_id = ?', [regId])
  const held = await Q('SELECT cs.subject_id, COUNT(DISTINCT a.session_id) n FROM attendances a JOIN class_sessions cs ON cs.id = a.session_id WHERE cs.batch_id = ? GROUP BY cs.subject_id', [batchId])
  const present = await Q("SELECT cs.subject_id, COUNT(*) n FROM attendances a JOIN class_sessions cs ON cs.id = a.session_id WHERE cs.batch_id = ? AND a.registration_id = ? AND a.status = 'hadir' GROUP BY cs.subject_id", [batchId, regId])
  const r2 = (n) => Math.round(n * 100) / 100
  return subs.map((bs) => {
    const w = weightsFor(bs, bs.kind, def)
    const h = Number(held.find((x) => x.subject_id === bs.subject_id)?.n ?? 0)
    const hadir = Number(present.find((x) => x.subject_id === bs.subject_id)?.n ?? 0)
    const absensi = h ? Math.min(100, Math.round((hadir / h) * 100)) : 0
    const g = sg.find((x) => x.subject_id === bs.subject_id)
    const tugas = Number(g?.task ?? 0), teori = Number(g?.theory ?? 0), praktik = Number(g?.practical ?? 0)
    const akhir = r2((absensi * w.absensi) / 100 + (tugas * w.tugas) / 100 + (teori * w.teori) / 100 + (praktik * w.praktik) / 100)
    const idx = letters.findIndex((m) => akhir >= m)
    return { name: bs.name, hours: Number(bs.hours), absensi, tugas, teori, praktik, akhir, huruf: idx < 0 ? 'E' : HURUF[idx], w }
  })
}

/** Batas bawah nilai huruf A, AB, B, BC, C, CD, D yang berlaku (pengaturan Akademik; bawaan 85/80/75/70/60/50/40). */
export async function gradeLetterScale() {
  const [lr] = await q("SELECT v FROM settings WHERE k = 'grade_letters'")
  try { const b = JSON.parse(lr?.v); if (Array.isArray(b) && b.length === 7 && b.every((n) => Number.isFinite(n))) return b } catch { /* bawaan */ }
  return [85, 80, 75, 70, 60, 50, 40]
}
export const GRADE_LETTERS = ['A', 'AB', 'B', 'BC', 'C', 'CD', 'D']
export const letterOf = (score, scale) => { const i = scale.findIndex((m) => score >= m); return i < 0 ? 'E' : GRADE_LETTERS[i] }

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
    // Peserta didik yang ditambahkan admin: biaya pendaftaran ditagih kecuali angkatannya dibebaskan; paket ditetapkan keuangan.
    if (r.source === 'admin') {
      const [b] = r.batch_id ? await cq(c, 'SELECT free_reg_fee FROM batches WHERE id = ?', [r.batch_id]) : []
      const [paidReg] = await cq(c, "SELECT id FROM payments WHERE registration_id = ? AND kind = 'pendaftaran' AND status = 'verified' LIMIT 1", [r.id])
      if (!b?.free_reg_fee && !paidReg) lines.push(`Biaya pendaftaran ${rpTxt(s.regFee ?? REG_FEE_DEFAULT)}`)
      const [any] = await cq(c, 'SELECT id FROM installments WHERE registration_id = ? LIMIT 1', [r.id])
      if (!any) lines.push('Biaya registrasi (paket pembayaran sedang ditetapkan bagian keuangan)')
    }
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
      const [{ extra }] = await cq(c, 'SELECT COALESCE(SUM(amount), 0) extra FROM fee_items WHERE is_active = 1 AND ((user_id IS NULL AND (program_id IS NULL OR program_id = ?)) OR user_id = ?)', [r.program_id, r.user_id])
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
        const [tk] = code ? await cq(c, 'SELECT id, expires_at FROM exam_tokens WHERE exam_id = ? AND token = ? AND (registration_id IS NULL OR registration_id = ?) ORDER BY expires_at DESC LIMIT 1', [e.id, code, r.id]) : []
        if (!tk) fail('Token ujian salah.')
        if (new Date(tk.expires_at) < new Date()) fail('Token ujian sudah kedaluwarsa. Buka ulang ujian untuk mendapatkan token baru.')
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
  /**
   * Token ujian otomatis untuk pendaftar, tanpa menghubungi admin. Berlaku 1 hari (24 jam) dan tidak melewati jadwal tutup ujian
   * yang diatur admin; di luar jadwal buka sampai tutup, token tidak diberikan. Token yang masih berlaku dipakai ulang.
   * Pendaftar yang sudah mulai mengerjakan tidak perlu token (token = '').
   */
  requestExamToken: {
    roles: ['peserta'],
    fn: (ctx, examId) => tx(async (c) => {
      const [r] = await cq(c, "SELECT * FROM registrations WHERE user_id = ? AND stage IN ('ujian','menunggu_hasil') ORDER BY created_at DESC LIMIT 1 FOR UPDATE", [ctx.user.id])
      if (!r) fail('Ujian terbuka setelah pembayaran pendaftaran dikonfirmasi.', 403)
      const [e] = await cq(c, 'SELECT * FROM exams WHERE id = ? AND is_active = 1', [examId])
      if (!e || (e.program_id && e.program_id !== r.program_id)) fail('Ujian tidak tersedia untuk Anda.', 404)
      const [att] = await cq(c, 'SELECT id, finished_at FROM exam_attempts WHERE exam_id = ? AND registration_id = ?', [e.id, r.id])
      if (att?.finished_at) fail('Anda sudah menyelesaikan ujian ini.')
      if (att) return { token: '', expiresAt: null }
      const now = new Date()
      if (now < new Date(e.open_at)) fail('Ujian belum dibuka.')
      if (now > new Date(e.close_at)) fail('Waktu ujian sudah ditutup.')
      const [have] = await cq(c, 'SELECT token, expires_at FROM exam_tokens WHERE exam_id = ? AND registration_id = ? AND expires_at > ? ORDER BY expires_at DESC LIMIT 1', [e.id, r.id, dt()])
      if (have) return { token: have.token, expiresAt: iso(have.expires_at) }
      const expires = new Date(Math.min(now.getTime() + 86_400_000, new Date(e.close_at).getTime()))
      let code = ''
      for (let i = 0; i < 20; i++) {
        code = Array.from({ length: 6 }, () => TOKEN_CHARS[Math.floor(Math.random() * TOKEN_CHARS.length)]).join('')
        const [dup] = await cq(c, 'SELECT id FROM exam_tokens WHERE token = ? AND expires_at > ?', [code, dt()])
        if (!dup) break
      }
      await cq(c, 'INSERT INTO exam_tokens (id, exam_id, token, expires_at, created_by, registration_id) VALUES (?,?,?,?,?,?)', [uid(), e.id, code, expires, ctx.user.id, r.id])
      await audit(c, ctx.user.id, 'token-ujian.otomatis', 'exam_tokens', `${e.title}: ${r.code}`)
      return { token: code, expiresAt: expires.toISOString() }
    }),
  },
  /** Staf menandai pendaftar yang mundur (manual atau otomatis) sudah atau belum di-follow up lewat WhatsApp. */
  setFollowUp: {
    roles: EXAM_STAFF,
    fn: (ctx, regId, done) => tx(async (c) => {
      const [r] = await cq(c, 'SELECT id, code, status, stage FROM registrations WHERE id = ? FOR UPDATE', [regId])
      if (!r) fail('Registrasi tidak ditemukan.', 404)
      if (!['cancelled', 'expired'].includes(r.status) || r.stage === 'tidak_lulus') fail('Penanda follow up hanya untuk pendaftar yang mundur.')
      if (done) await cq(c, 'UPDATE registrations SET followup_at = ?, followup_by = ? WHERE id = ?', [dt(), ctx.user.id, r.id])
      else await cq(c, 'UPDATE registrations SET followup_at = NULL, followup_by = NULL WHERE id = ?', [r.id])
      await audit(c, ctx.user.id, done ? 'registrasi.followup' : 'registrasi.followup-batal', 'registrations', r.code)
    }),
  },
  /** Pendaftar yang dinyatakan mundur otomatis menekan Lanjutkan proses: pendaftaran berjalan lagi dan hitungan 2 minggu dimulai ulang. */
  resumeRegistration: {
    roles: ['peserta'],
    fn: (ctx, regId) => tx(async (c) => {
      const [r] = await cq(c, 'SELECT * FROM registrations WHERE id = ? FOR UPDATE', [regId])
      if (!r || r.user_id !== ctx.user.id) fail('Registrasi tidak ditemukan.', 404)
      if (!canResumeReg(r)) fail('Pendaftaran ini tidak bisa dilanjutkan sendiri. Hubungi admin pendaftaran.', 403)
      await resumeReg(c, r, ctx.user.id, false)
    }),
  },
  /** Staf melanjutkan proses calon peserta didik yang mundur (otomatis oleh sistem, atau ditandai mundur). */
  resumeRegistrationAdmin: {
    roles: EXAM_STAFF,
    fn: (ctx, regId) => tx(async (c) => {
      const [r] = await cq(c, 'SELECT * FROM registrations WHERE id = ? FOR UPDATE', [regId])
      if (!r) fail('Registrasi tidak ditemukan.', 404)
      if (!canResumeReg(r)) fail('Hanya calon peserta didik yang mundur (belum aktif belajar dan tidak dinyatakan tidak lulus) yang bisa dilanjutkan.')
      await resumeReg(c, r, ctx.user.id, true)
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
      else await cq(c, 'INSERT INTO exams (title, bank_id, program_id, open_at, close_at, duration_min, question_count, is_active, id) VALUES (?,?,?,?,?,?,?,?,?)', [...vals, uid()])
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
      await cq(c, 'UPDATE exam_tokens SET expires_at = ? WHERE exam_id = ? AND registration_id IS NULL AND expires_at > ?', [dt(), e.id, dt()]) // satu token umum aktif per ujian; token otomatis pendaftar tidak ikut dicabut
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
      if (b.status !== 'open') fail('Pilih angkatan yang sedang dibuka.')
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
      // Sasaran: semua program, satu program, atau satu peserta didik (peserta didik mengabaikan program).
      if (x.userId) { const [u] = await cq(c, "SELECT id FROM users WHERE id = ? AND role = 'peserta'", [x.userId]); if (!u) fail('Peserta didik tidak ditemukan.') }
      else if (x.programId) { const [p] = await cq(c, 'SELECT id FROM programs WHERE id = ?', [x.programId]); if (!p) fail('Program tidak ditemukan.') }
      const vals = [name, num(x.amount, 0, 1_000_000_000), x.userId ? null : (x.programId || null), x.userId || null, x.active === false ? 0 : 1]
      if (x.id) await cq(c, 'UPDATE fee_items SET name=?, amount=?, program_id=?, user_id=?, is_active=? WHERE id = ?', [...vals, x.id])
      else await cq(c, 'INSERT INTO fee_items (name, amount, program_id, user_id, is_active, id) VALUES (?,?,?,?,?,?)', [...vals, uid()])
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
      // Paket bisa berlaku untuk beberapa program sekaligus (centang): satu baris per program. Tanpa centang = semua program.
      const ids = [...new Set((Array.isArray(p.programIds) ? p.programIds : [p.programId]).map((x) => String(x ?? '')).filter(Boolean))]
      if (ids.length) {
        const found = await cq(c, 'SELECT id FROM programs WHERE id IN (?)', [ids])
        if (found.length !== ids.length) fail('Ada program yang tidak ditemukan.')
      }
      const targets = ids.length ? ids : [null]
      const rest = [str(p.name, 80), num(p.downPayment, 0, 1_000_000_000), num(p.installments, 1, 36), p.active === false ? 0 : 1]
      const [first, ...others] = targets
      if (p.id) await cq(c, 'UPDATE payment_plans SET name=?, down_payment=?, installments=?, is_active=?, program_id=? WHERE id = ?', [...rest, first, p.id])
      else await cq(c, 'INSERT INTO payment_plans (name, down_payment, installments, is_active, program_id, id) VALUES (?,?,?,?,?,?)', [...rest, first, uid()])
      for (const pid of others) await cq(c, 'INSERT INTO payment_plans (name, down_payment, installments, is_active, program_id, id) VALUES (?,?,?,?,?,?)', [...rest, pid, uid()])
      await audit(c, ctx.user.id, 'paket-bayar.simpan', 'payment_plans', rest[0])
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
    roles: LETTER_ROLES,
    fn: (ctx, f) => tx(async (c) => {
      const cur = await getSettings(c)
      const next = {
        ...cur, // termasuk signatureFileId, yang hanya diubah lewat unggah atau hapus tanda tangan
        lpkRegNo: str(f.lpkRegNo, 60, false), ketuaName: str(f.ketuaName, 80), batchLabel: str(f.batchLabel, 80), email: str(f.email, 120, false), website: str(f.website, 120, false),
        hotline: str(f.hotline, 20, false), kuliahUmum: day(f.kuliahUmum, 'kuliah umum', false), trainingStart: day(f.trainingStart, 'mulai pelatihan', false),
        campusNote: str(f.campusNote, 120, false),
      }
      await cq(c, "INSERT INTO settings (k, v) VALUES ('site', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)", [JSON.stringify(next)])
      await audit(c, ctx.user.id, 'surat.pengaturan', 'settings', next.batchLabel)
    }),
  },
  removeSignature: {
    roles: LETTER_ROLES,
    fn: (ctx) => tx(async (c) => {
      const cur = await getSettings(c)
      if (!cur.signatureFileId) return
      const [f] = await cq(c, 'SELECT stored_name FROM files WHERE id = ?', [cur.signatureFileId])
      const { signatureFileId, ...rest } = cur
      await cq(c, "INSERT INTO settings (k, v) VALUES ('site', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)", [JSON.stringify(rest)])
      await cq(c, 'DELETE FROM files WHERE id = ?', [signatureFileId])
      await audit(c, ctx.user.id, 'surat.tandatangan-hapus', 'settings', 'tanda tangan ketua LPK')
      if (f) await fs.promises.unlink(path.join(UPLOAD_DIR, f.stored_name)).catch(() => {})
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
const CAMPUS_DEFAULT = 'Area Kampus Politeknik TEDC Bandung'

const SATUAN = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas']
/** Angka ke kata bahasa Indonesia, huruf kecil. */
export function terbilang(n) {
  n = Math.floor(Math.abs(Number(n) || 0))
  if (n === 0) return 'nol'
  const t = (x) => {
    if (x < 12) return SATUAN[x]
    if (x < 20) return `${SATUAN[x - 10]} belas`
    if (x < 100) return `${SATUAN[Math.floor(x / 10)]} puluh${x % 10 ? ' ' + SATUAN[x % 10] : ''}`
    if (x < 200) return `seratus${x > 100 ? ' ' + t(x - 100) : ''}`
    if (x < 1000) return `${SATUAN[Math.floor(x / 100)]} ratus${x % 100 ? ' ' + t(x % 100) : ''}`
    if (x < 2000) return `seribu${x > 1000 ? ' ' + t(x - 1000) : ''}`
    if (x < 1e6) return `${t(Math.floor(x / 1000))} ribu${x % 1000 ? ' ' + t(x % 1000) : ''}`
    if (x < 1e9) return `${t(Math.floor(x / 1e6))} juta${x % 1e6 ? ' ' + t(x % 1e6) : ''}`
    return `${t(Math.floor(x / 1e9))} miliar${x % 1e9 ? ' ' + t(x % 1e9) : ''}`
  }
  return t(n)
}
const capWords = (t) => t.replace(/(^|\s)(\S)/g, (_, a, b) => a + b.toUpperCase())

/** Kumpulkan data surat untuk satu registrasi yang sudah dinyatakan lulus. */
async function letterData(regId) {
  const [r] = await q('SELECT * FROM registrations WHERE id = ?', [regId])
  if (!r || !r.admission_no) fail('Surat belum tersedia.', 404)
  const [u] = await q('SELECT name, birth_date FROM users WHERE id = ?', [r.user_id])
  const [pf] = await q('SELECT birth_place, birth_date, school FROM participant_profiles WHERE user_id = ?', [r.user_id])
  const [prog] = await q('SELECT title FROM programs WHERE id = ?', [r.program_id])
  const [b] = r.batch_id ? await q('SELECT code, start_date FROM batches WHERE id = ?', [r.batch_id]) : [null]
  return {
    no: String(r.admission_no), year: new Date(r.admission_at).getFullYear(), issuedAt: r.admission_at,
    name: u.name, birthPlace: pf?.birth_place, birthDate: pf?.birth_date ?? u.birth_date, school: pf?.school,
    program: prog?.title ?? '-', batchCode: b?.code ?? '', batchStart: b?.start_date,
  }
}

/** Surat kelulusan peserta. Isinya mengikuti format "CHI - Surat Kelulusan". */
export async function renderLetter(res, regId) {
  const s = await getSettings()
  drawLetter(res, await letterData(regId), s, await signaturePath(s))
}

/** Pratinjau dengan data contoh, untuk memeriksa pengaturan surat tanpa menunggu peserta lulus. */
export async function renderLetterPreview(res) {
  const s = await getSettings()
  const now = new Date()
  drawLetter(res, {
    no: '000', year: now.getFullYear(), issuedAt: now, name: 'Nama Lengkap Peserta (Contoh)', birthPlace: 'Cimahi', birthDate: '2005-01-01',
    school: 'Asal Sekolah (Contoh)', program: 'Nama Program Pelatihan (Contoh)', batchCode: 'Angkatan 1', batchStart: null,
  }, s, await signaturePath(s))
}

/** Lokasi berkas tanda tangan ketua LPK di disk, atau null bila belum diunggah. */
export async function signaturePath(s) {
  if (!s.signatureFileId) return null
  const [f] = await q("SELECT stored_name FROM files WHERE id = ? AND kind = 'signature'", [s.signatureFileId])
  const p = f ? path.join(UPLOAD_DIR, f.stored_name) : null
  return p && fs.existsSync(p) ? p : null
}

function drawLetter(res, d, s, sigPath) {
  const batchNo = Number(String(d.batchCode ?? '').match(/(\d+)\s*$/)?.[1] ?? 0)
  const min = s.minReenroll ?? MIN_REENROLL_DEFAULT
  const campus = s.address || 'Jalan Pasantren KM.2 Cibabat Cimahi Utara Kota Cimahi'
  const area = s.campusNote === undefined ? CAMPUS_DEFAULT : s.campusNote

  const doc = new PDFDocument({ size: 'A4', margins: { top: 36, bottom: 30, left: 56, right: 56 } })
  doc.pipe(res)
  const L = 56, W = 595.28 - 112
  const rich = (rawParts, x, y, opts = {}) => {
    // PDFKit membuang spasi di awal potongan teks yang disambung (continued), jadi spasi dipindah ke akhir potongan sebelumnya.
    const parts = rawParts.map((p) => [...p])
    for (let i = 1; i < parts.length; i++) {
      const lead = parts[i][0].match(/^\s+/)?.[0]
      if (lead) { parts[i - 1][0] += lead; parts[i][0] = parts[i][0].slice(lead.length) }
    }
    parts.forEach(([t, f], i) => {
      doc.font(f === 'b' ? 'Helvetica-Bold' : f === 'i' ? 'Helvetica-Oblique' : 'Helvetica')
      const o = { ...opts, continued: i < parts.length - 1 }
      if (i === 0 && x != null) doc.text(t, x, y, o); else doc.text(t, o)
    })
    doc.font('Helvetica')
  }

  // Kop surat
  // Meniru kop contoh: logo besar di kiri, judul serif condensed navy, baris keterangan serif, garis biru tebal.
  const NAVY = '#1f3a73', INK = '#1d2a3d', cx = L + 80, cw = W - 80
  try { doc.image(LOGO, L + 12, 18, { height: 68 }) } catch { /* logo opsional */ }
  doc.font('Times-Bold').fontSize(10.5).fillColor(INK).text('LEMBAGA PELATIHAN KERJA (LPK)', cx, 20, { width: cw, align: 'center', characterSpacing: 1.2 })
  // Judul dibuat condensed dengan menyempitkan sumbu x, lalu dipusatkan di antara logo dan tepi kanan.
  const title = 'CIMAHI HOTEL INSTITUTE'
  doc.font('Times-Bold').fontSize(29)
  const natural = doc.widthOfString(title, { characterSpacing: 0.6 }), target = 318, sx = target / natural
  doc.save().translate(cx + (cw - target) / 2, 0).scale(sx, 1).fillColor(NAVY).text(title, 0, 31, { lineBreak: false, characterSpacing: 0.6 }).restore()
  doc.font('Times-Roman').fontSize(9).fillColor(INK)
    .text(`No Registrasi : ${s.lpkRegNo || '-'}`, cx, 62, { width: cw, align: 'center' })
    .text(s.address || 'Jalan Pasantren KM.2, Cibabat, Cimahi Utara, Kota Cimahi 40513 Jawa Barat', cx, 73, { width: cw, align: 'center' })
    .text(`Telp : ${s.phone || '-'} Email : ${s.email || '-'} Website : ${s.website || '-'}`, cx, 84, { width: cw, align: 'center' })
  doc.moveTo(L, 99).lineTo(L + W, 99).lineWidth(3).strokeColor(NAVY).stroke()

  // Judul
  doc.y = 110
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#1d2a3d')
    .text('PENGUMUMAN PENERIMAAN CALON PESERTA DIDIK', L, doc.y, { width: W, align: 'center' })
    .text('LEMBAGA PELATIHAN KERJA (LPK) CIMAHI HOTEL INSTITUTE', { width: W, align: 'center' })
    .text((s.batchLabel || 'BATCH').toUpperCase(), { width: W, align: 'center' })
  doc.font('Helvetica').text(`Nomor : ${d.no}/PDB-CHI/${d.year}`, { width: W, align: 'center' })
  doc.moveDown(0.7).fontSize(10)
  doc.text('Berdasarkan hasil seleksi administrasi Penerimaan Peserta Didik Baru di Lembaga Pelatihan Kerja (LPK) Cimahi Hotel Institute' + (s.batchLabel ? ` ${s.batchLabel}` : '') + ', Peserta Didik dengan identitas sebagai berikut:', L, doc.y, { width: W, align: 'justify' })
  doc.moveDown(0.6)

  // Identitas
  const rows = [
    ['No Registrasi', d.no], ['Nama Lengkap', d.name],
    ['Tempat, Tanggal Lahir', `${d.birthPlace ?? '-'}, ${d.birthDate ? longDate(d.birthDate) : '-'}`], ['Asal Sekolah', d.school || '-'],
    ['Program Pelatihan', d.program], ['Angkatan', batchNo > 0 && ordinal[batchNo] ? `${batchNo} (${ordinal[batchNo]})` : (d.batchCode || '-')],
  ]
  for (const [k, v] of rows) {
    const y = doc.y
    doc.font('Helvetica').text(k, L + 8, y, { width: 130 }).text(':', L + 140, y)
    doc.font('Helvetica-Bold').text(v, L + 152, y, { width: W - 152 })
  }
  const bar = '='.repeat(66)
  doc.moveDown(0.4).font('Helvetica').text(bar, L, doc.y, { width: W, align: 'center' })
  doc.text('dinyatakan', { width: W, align: 'center' })
  doc.font('Helvetica-Bold').fontSize(16).text('LULUS dan DITERIMA', { width: W, align: 'center' })
  doc.font('Helvetica').fontSize(10).text('Sebagai Peserta Didik Baru LPK Cimahi Hotel Institute', { width: W, align: 'center' })
  doc.text(bar, { width: W, align: 'center' })
  doc.moveDown(0.5)

  // Ketentuan
  const rp2 = (n) => 'Rp. ' + Number(n).toLocaleString('id-ID')
  doc.text('Kepada Peserta Didik yang dinyatakan lulus seleksi agar memenuhi ketentuan sebagai berikut:', L, doc.y, { width: W })
  doc.moveDown(0.4)
  const IND = L + 20, IW = W - 20
  const item = (n, paras, after = 0.3) => {
    const y = doc.y
    doc.font('Helvetica').text(`${n})`, L, y, { width: 18 })
    paras.forEach((parts, i) => {
      if (i > 0) doc.moveDown(0.5)
      rich(parts, IND, i === 0 ? y : doc.y, { width: IW, align: 'justify' })
    })
    doc.moveDown(after)
  }
  item(1, [
    [['Melakukan '], ['REGISTRASI ULANG', 'b'], [` dengan membayar Biaya Registrasi minimal sebesar ${rp2(min)} (${capWords(terbilang(min))} Rupiah) dari total biaya pelatihan atau sesuai opsi pembayaran registrasi yang tersedia di aplikasi`], ...(s.reenrollDue ? [[', paling lambat tanggal '], [longDate(s.reenrollDue), 'b']] : []), ['.']],
    [[`Pembayaran Biaya Registrasi melalui transfer ${s.bankName ?? 'Bank BNI'} an. ${s.bankHolder ?? ''} Nomor Rekening `], [s.bankAccount ?? '', 'b'], ['. Unggah bukti pembayaran di aplikasi'], ...(s.hotline ? [[' atau kirim ke nomor '], [`HOTLINE ${s.hotline}.`, 'b']] : [['.']]), [' ('], ['Mohon waspada, Cimahi Hotel Institute hanya menerima pembayaran melalui Bank Transfer tertera', 'i'], [')']],
  ], 0.45)
  item(2, [[['Setelah melakukan pembayaran Biaya Registrasi, Peserta Didik mengunggah kelengkapan dokumen di aplikasi:']]], 0.1)
  for (const [i, t] of ['KTP', 'Ijazah SMA/SMK/Sederajat', 'Pas foto 3x4', 'Kartu Keluarga (KK)', 'Surat Keterangan Tidak Buta Warna (Klinik/Puskesmas)'].entries()) {
    const y = doc.y
    doc.font('Helvetica').text(`${'abcde'[i]})`, IND + 8, y, { width: 18 }).text(t, IND + 28, y, { width: IW - 28 })
  }
  doc.moveDown(0.3)
  item(3, [[['Bagi Peserta Didik yang tidak melakukan '], ['Registrasi Ulang', 'b'], [' dianggap mengundurkan diri.']]])
  item(4, [s.refundCutoff
    ? [['Bagi Peserta yang mengundurkan diri sebelum tanggal '], [`${longDate(s.refundCutoff)},`, 'b'], [' Biaya Registrasi akan dikembalikan dengan potongan sebesar 50% dari total biaya registrasi yang telah dibayarkan. Jika melewati tanggal tersebut, maka Biaya Registrasi tidak dapat dikembalikan.']]
    : [['Biaya Registrasi yang sudah dibayarkan tidak dapat dikembalikan.']]])
  const mulai = s.trainingStart || d.batchStart
  item(5, [[
    ...(s.kuliahUmum ? [['Pelaksanaan Kuliah Umum akan dilaksanakan pada tanggal '], [longDate(s.kuliahUmum), 'b'], [' dan ']] : []),
    [s.kuliahUmum ? 'Pelatihan akan dimulai' : 'Pelaksanaan Pelatihan akan dimulai'], ...(mulai ? [[' tanggal '], [longDate(mulai), 'b']] : []),
    [` secara luring/offline di Kampus Cimahi Hotel Institute, ${campus}${area ? ` (${area})` : ''}.`],
  ]])
  if (s.pelunasanDue) item(6, [[['Pelunasan Biaya Pelatihan sampai dengan tanggal '], [`${longDate(s.pelunasanDue)}.`, 'b']]])

  // Penutup dan tanda tangan. Blok tanda tangan dijaga tetap utuh pada halaman yang sama.
  doc.moveDown(0.2).font('Helvetica').text('Demikian pengumuman ini disampaikan. Atas perhatian Saudara, kami ucapkan terimakasih.', L, doc.y, { width: W })
  doc.moveDown(0.6)
  const x = L + W - 200
  if (doc.y + 118 > doc.page.height - doc.page.margins.bottom) doc.addPage()
  const y0 = doc.y
  doc.text(`Cimahi, ${longDate(d.issuedAt)}.`, x, y0, { width: 200 }).text('Ketua LPK', { width: 200 }).text('Cimahi Hotel Institute,', { width: 200 })
  const ySig = doc.y
  if (sigPath) { try { doc.image(sigPath, x, ySig + 2, { fit: [170, 64] }) } catch { /* tanda tangan rusak: kosongkan ruangnya */ } }
  doc.font('Helvetica-Bold').text(s.ketuaName || '', x, ySig + 66, { width: 200 })
  doc.end()
}
