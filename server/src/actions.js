import bcrypt from 'bcryptjs'
import { audit, cq, dt, fail, getSettings, mail, q, randomCode, tx, uid } from './lib.js'
import { renderCertificatePdf } from './pdf.js'

const ALL_STAFF = ['super_admin', 'admin_pendaftaran', 'admin_keuangan', 'akademik', 'instruktur']
const CMS = ['super_admin', 'admin_pendaftaran']
const LIVE = ['pending_payment', 'waiting_verification', 'active']
void ALL_STAFF

const num = (v, min = 0, max = Infinity) => { const n = Number(v); if (!Number.isFinite(n) || n < min || n > max) fail('Nilai angka tidak valid.'); return n }
const str = (v, max = 255, req = true) => { const s = String(v ?? '').trim(); if (req && !s) fail('Ada isian wajib yang kosong.'); return s.slice(0, max) }
const okHref = (h) => !h || h.startsWith('/') || h.startsWith('#') || /^https:\/\//.test(h)

async function seats(conn, batchId) {
  const [r] = await cq(conn, "SELECT COUNT(*) n FROM registrations WHERE batch_id = ? AND status IN ('pending_payment','waiting_verification','active')", [batchId])
  return Number(r.n)
}
const finalScore = (g, p) => Math.round(((g.theory * p.theory_weight + g.practical * p.practical_weight) / (p.theory_weight + p.practical_weight)) * 10) / 10
const recommend = (g, p) => finalScore(g, p) >= p.passing_score && Number(g.attendance_pct) >= p.min_attendance

/** Kedaluwarsa otomatis (PAY-6). Dipanggil oleh job berkala dan saat state diminta. */
export async function expireOverdue() {
  return tx(async (c) => {
    const due = await cq(c, "SELECT id, code FROM registrations WHERE status = 'pending_payment' AND due_at < ? FOR UPDATE", [dt()])
    for (const r of due) {
      await cq(c, "UPDATE registrations SET status = 'expired' WHERE id = ?", [r.id])
      await audit(c, null, 'registrasi.kedaluwarsa', 'registrations', r.code)
    }
    return due.length
  })
}

/** Membuat registrasi + tagihan untuk satu peserta di dalam transaksi yang sudah berjalan. */
export async function registerForBatch(c, user, batchId) {
      const [b] = await cq(c, 'SELECT * FROM batches WHERE id = ? FOR UPDATE', [batchId]) // kunci baris angkatan: cegah oversell (REG-2)
      if (!b) fail('Angkatan tidak ditemukan.')
      if (b.status !== 'open') fail('Pendaftaran angkatan ini belum atau sudah tidak dibuka.')
      const [p] = await cq(c, 'SELECT * FROM programs WHERE id = ?', [b.program_id])
      const live = await cq(c, `SELECT r.batch_id, b.program_id FROM registrations r JOIN batches b ON b.id = r.batch_id WHERE r.user_id = ? AND r.status IN (${LIVE.map(() => '?').join(',')})`, [user.id, ...LIVE])
      if (live.some((x) => x.batch_id === batchId)) fail('Anda sudah terdaftar di angkatan ini.')
      if (live.some((x) => x.program_id === p.id)) fail('Anda masih punya pendaftaran aktif pada program yang sama.')
      if ((await seats(c, batchId)) >= b.quota) fail('Kuota angkatan penuh.')
      const settings = await getSettings(c)
      const ym = new Date().toISOString().slice(0, 7).replace('-', '')
      const [{ n }] = await cq(c, 'SELECT COUNT(*) n FROM registrations')
      const seq = String(Number(n) + 1).padStart(3, '0')
      const due = new Date(Date.now() + (settings.payDueHours ?? 48) * 3_600_000)
      const id = uid()
      await cq(c, 'INSERT INTO registrations (id, code, user_id, batch_id, status, price_snapshot, unique_code, invoice_no, due_at) VALUES (?,?,?,?,?,?,?,?,?)',
        [id, `REG-${ym}-${seq}`, user.id, batchId, 'pending_payment', p.price, 100 + Math.floor(Math.random() * 900), `INV-${ym}-${seq}`, due])
      await mail(c, user.email, `Tagihan ${p.title}`, `Halo ${user.name}, tagihan ${p.title} (${b.code}) sudah terbit. Buka portal peserta untuk detail pembayaran.`)
      await audit(c, user.id, 'registrasi.buat', 'registrations', `${user.name} memilih ${b.code}`)
}

/**
 * Daftar aksi RPC. Setiap aksi: roles yang boleh, lalu fungsi (ctx, ...args).
 * Kegagalan bisnis dilempar lewat fail() dan menjadi {ok:false,error}.
 */
export const actions = {
  /* ---------- registrasi dan pembayaran ---------- */
  createRegistration: {
    roles: ['peserta'],
    fn: (ctx, batchId) => tx((c) => registerForBatch(c, ctx.user, batchId)),
  },

  cancelRegistration: {
    roles: ['peserta', 'admin_pendaftaran', 'super_admin'],
    fn: (ctx, id, reason) => tx(async (c) => {
      const [r] = await cq(c, 'SELECT * FROM registrations WHERE id = ? FOR UPDATE', [id])
      if (!r) fail('Registrasi tidak ditemukan.')
      if (ctx.user.role === 'peserta') {
        if (r.user_id !== ctx.user.id) fail('Registrasi bukan milik Anda.', 403)
        if (r.status !== 'pending_payment') fail('Registrasi yang sudah dibayar dibatalkan lewat admin.')
        reason = 'Dibatalkan peserta'
      } else {
        if (!['pending_payment', 'active'].includes(r.status)) fail('Registrasi ini tidak bisa dibatalkan.')
        reason = str(reason, 200)
      }
      await cq(c, "UPDATE registrations SET status = 'cancelled', cancelled_reason = ? WHERE id = ?", [reason, id])
      await audit(c, ctx.user.id, 'registrasi.batal', 'registrations', `${r.code}: ${reason}`)
    }),
  },

  verifyPayment: {
    roles: ['admin_keuangan', 'super_admin'],
    fn: (ctx, id) => tx(async (c) => {
      const [p] = await cq(c, "SELECT * FROM payments WHERE id = ? AND status = 'submitted' FOR UPDATE", [id])
      if (!p) fail('Pembayaran tidak dalam antrean.')
      const [r] = await cq(c, 'SELECT * FROM registrations WHERE id = ? FOR UPDATE', [p.registration_id])
      const receipt = `KWT-${new Date().toISOString().slice(0, 7).replace('-', '')}-${r.code.slice(-3)}`
      await cq(c, "UPDATE payments SET status = 'verified', verified_by = ?, receipt_no = ? WHERE id = ?", [ctx.user.id, receipt, id])
      await cq(c, "UPDATE registrations SET status = 'active' WHERE id = ?", [r.id])
      await cq(c, 'INSERT IGNORE INTO grades (registration_id) VALUES (?)', [r.id])
      const [u] = await cq(c, 'SELECT email, name FROM users WHERE id = ?', [r.user_id])
      await mail(c, u.email, `Kwitansi ${receipt}`, `Pembayaran ${r.invoice_no} sebesar Rp${Number(p.amount_paid).toLocaleString('id-ID')} telah diverifikasi. Pendaftaran Anda aktif. Sebelum kelas dimulai, lengkapi data diri di portal peserta (menu Data diri).`)
      await audit(c, ctx.user.id, 'pembayaran.setujui', 'payments', `${r.invoice_no} Rp${p.amount_paid}`)
    }),
  },

  rejectPayment: {
    roles: ['admin_keuangan', 'super_admin'],
    fn: (ctx, id, reason) => tx(async (c) => {
      const why = str(reason, 200)
      const [p] = await cq(c, "SELECT * FROM payments WHERE id = ? AND status = 'submitted' FOR UPDATE", [id])
      if (!p) fail('Pembayaran tidak dalam antrean.')
      const [r] = await cq(c, 'SELECT * FROM registrations WHERE id = ? FOR UPDATE', [p.registration_id])
      await cq(c, "UPDATE payments SET status = 'rejected', reject_reason = ?, verified_by = ? WHERE id = ?", [why, ctx.user.id, id])
      await cq(c, "UPDATE registrations SET status = 'pending_payment' WHERE id = ?", [r.id])
      const [u] = await cq(c, 'SELECT email FROM users WHERE id = ?', [r.user_id])
      await mail(c, u.email, 'Pembayaran ditolak: unggah ulang bukti', `Alasan: ${why}`)
      await audit(c, ctx.user.id, 'pembayaran.tolak', 'payments', `${r.invoice_no}: ${why}`)
    }),
  },

  /* ---------- katalog ---------- */
  saveProgram: {
    roles: ['admin_pendaftaran', 'super_admin'],
    fn: (ctx, p) => tx(async (c) => {
      const title = str(p.title, 160)
      const slug = str(p.slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), 160)
      const r = p.rules ?? {}
      const vals = [slug, title, str(p.category, 80), str(p.shortDesc, 255, false), str(p.description, 5000, false), num(p.durationHours, 1), num(p.price, 0), p.active ? 1 : 0,
        num(r.theoryWeight, 0, 100), num(r.practicalWeight, 0, 100), num(r.passingScore, 0, 100), num(r.minAttendance, 0, 100)]
      const [ex] = await cq(c, 'SELECT id FROM programs WHERE id = ?', [p.id])
      if (ex) await cq(c, 'UPDATE programs SET slug=?, title=?, category=?, short_desc=?, description=?, duration_hours=?, price=?, is_active=?, theory_weight=?, practical_weight=?, passing_score=?, min_attendance=? WHERE id = ?', [...vals, p.id])
      else await cq(c, 'INSERT INTO programs (slug, title, category, short_desc, description, duration_hours, price, is_active, theory_weight, practical_weight, passing_score, min_attendance, id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', [...vals, p.id || uid()])
      await audit(c, ctx.user.id, ex ? 'program.ubah' : 'program.buat', 'programs', title)
    }),
  },
  deleteProgram: {
    roles: ['admin_pendaftaran', 'super_admin'],
    fn: (ctx, id) => tx(async (c) => {
      const [p] = await cq(c, 'SELECT * FROM programs WHERE id = ? FOR UPDATE', [id])
      if (!p) fail('Program tidak ditemukan.')
      const [{ n }] = await cq(c, 'SELECT COUNT(*) n FROM batches WHERE program_id = ?', [id])
      if (Number(n)) fail(`Program ini punya ${n} angkatan sehingga tidak bisa dihapus permanen. Gunakan Arsip agar riwayatnya tetap utuh.`)
      await cq(c, 'DELETE FROM programs WHERE id = ?', [id])
      await audit(c, ctx.user.id, 'program.hapus', 'programs', p.title)
    }),
  },
  deleteBatch: {
    roles: ['admin_pendaftaran', 'super_admin'],
    fn: (ctx, id) => tx(async (c) => {
      const [b] = await cq(c, 'SELECT * FROM batches WHERE id = ? FOR UPDATE', [id])
      if (!b) fail('Angkatan tidak ditemukan.')
      const [{ r }] = await cq(c, 'SELECT COUNT(*) r FROM registrations WHERE batch_id = ?', [id])
      if (Number(r)) fail(`Angkatan ini sudah punya ${r} pendaftaran sehingga tidak bisa dihapus. Ubah statusnya menjadi cancelled atau finished.`)
      const [{ s: ses }] = await cq(c, 'SELECT COUNT(*) s FROM class_sessions WHERE batch_id = ?', [id])
      const [{ a }] = await cq(c, 'SELECT COUNT(*) a FROM assignments WHERE batch_id = ?', [id])
      if (Number(ses) || Number(a)) fail('Angkatan ini sudah punya pertemuan atau tugas. Hapus dulu isinya, atau ubah statusnya menjadi cancelled.')
      await cq(c, 'DELETE FROM materials WHERE batch_id = ?', [id])
      await cq(c, 'DELETE FROM batches WHERE id = ?', [id])
      await audit(c, ctx.user.id, 'batch.hapus', 'batches', b.code)
    }),
  },
  remindProfile: {
    roles: ['admin_pendaftaran', 'super_admin'],
    fn: (ctx, userId) => tx(async (c) => {
      const [u] = await cq(c, "SELECT u.* FROM users u WHERE u.id = ? AND u.role = 'peserta'", [userId])
      if (!u) fail('Peserta tidak ditemukan.')
      const [done] = await cq(c, 'SELECT user_id FROM participant_profiles WHERE user_id = ? AND completed_at IS NOT NULL', [userId])
      if (done) fail('Peserta ini sudah melengkapi data diri.')
      const [reg] = await cq(c, "SELECT id FROM registrations WHERE user_id = ? AND status IN ('active','completed') LIMIT 1", [userId])
      if (!reg) fail('Pengingat hanya untuk peserta yang pembayarannya sudah dikonfirmasi.')
      await mail(c, u.email, 'Lengkapi data diri Anda', `Halo ${u.name}, pembayaran Anda sudah dikonfirmasi. Lengkapi data diri di portal peserta (menu Data diri) agar kelas dapat dimulai.`)
      await audit(c, ctx.user.id, 'pengingat.data-diri', 'users', u.email)
    }),
  },
  archiveProgram: {
    roles: ['admin_pendaftaran', 'super_admin'],
    fn: (ctx, id) => tx(async (c) => {
      await cq(c, 'UPDATE programs SET deleted_at = ?, is_active = 0 WHERE id = ?', [dt(), id])
      await audit(c, ctx.user.id, 'program.arsip', 'programs', id)
    }),
  },
  saveBatch: {
    roles: ['admin_pendaftaran', 'super_admin'],
    fn: (ctx, b) => tx(async (c) => {
      if (!b.startDate || !b.endDate || b.endDate < b.startDate) fail('Tanggal selesai sebelum tanggal mulai.')
      if (!['draft', 'open', 'running', 'finished', 'cancelled'].includes(b.status)) fail('Status tidak valid.')
      // Instruktur, lokasi, dan jadwal diatur Akademik lewat saveBatchSchedule.
      const vals = [b.programId, str(b.code, 40), b.startDate, b.endDate, num(b.quota, 1), b.status]
      const [ex] = await cq(c, 'SELECT id FROM batches WHERE id = ?', [b.id])
      if (ex) await cq(c, 'UPDATE batches SET program_id=?, code=?, start_date=?, end_date=?, quota=?, status=? WHERE id = ?', [...vals, b.id])
      else await cq(c, 'INSERT INTO batches (program_id, code, start_date, end_date, quota, status, id) VALUES (?,?,?,?,?,?,?)', [...vals, b.id || uid()])
      await audit(c, ctx.user.id, ex ? 'batch.ubah' : 'batch.buat', 'batches', b.code)
    }),
  },

  /* ---------- pembelajaran ---------- */
  /* Akademik menetapkan jadwal angkatan; instruktur mengisi pertemuan dan materinya. */
  /* Bank mata pelajaran per pelatihan (Akademik). */
  saveSubject: {
    roles: ['akademik', 'super_admin'],
    fn: (ctx, x) => tx(async (c) => {
      const [p] = await cq(c, 'SELECT id FROM programs WHERE id = ? AND deleted_at IS NULL', [x.programId])
      if (!p) fail('Pilih pelatihan.')
      if (!['teori', 'praktik'].includes(x.kind)) fail('Jenis harus teori atau praktik.')
      const name = str(x.name, 120)
      const [ex] = x.id ? await cq(c, 'SELECT * FROM subjects WHERE id = ? FOR UPDATE', [x.id]) : []
      if (ex && ex.program_id !== x.programId) fail('Mata pelajaran tidak bisa dipindah ke pelatihan lain.')
      const [dup] = await cq(c, 'SELECT id FROM subjects WHERE program_id = ? AND name = ? AND id <> ?', [x.programId, name, x.id ?? ''])
      if (dup) fail('Mata pelajaran dengan nama itu sudah ada di pelatihan ini.')
      const vals = [x.programId, name, x.kind, num(x.hours, 1, 500), str(x.description, 255, false), x.active === false ? 0 : 1]
      if (ex) await cq(c, 'UPDATE subjects SET program_id=?, name=?, kind=?, hours=?, description=?, is_active=? WHERE id = ?', [...vals, x.id])
      else await cq(c, 'INSERT INTO subjects (program_id, name, kind, hours, description, is_active, id) VALUES (?,?,?,?,?,?,?)', [...vals, x.id || uid()])
      await audit(c, ctx.user.id, ex ? 'mapel.ubah' : 'mapel.tambah', 'subjects', name)
    }),
  },
  deleteSubject: {
    roles: ['akademik', 'super_admin'],
    fn: (ctx, id) => tx(async (c) => {
      const [sj] = await cq(c, 'SELECT * FROM subjects WHERE id = ? FOR UPDATE', [id])
      if (!sj) fail('Mata pelajaran tidak ditemukan.')
      const [{ n }] = await cq(c, 'SELECT (SELECT COUNT(*) FROM batch_subjects WHERE subject_id = ?) + (SELECT COUNT(*) FROM class_sessions WHERE subject_id = ?) n', [id, id])
      if (Number(n)) fail('Mata pelajaran ini sudah dipakai di jadwal angkatan, jadi tidak bisa dihapus. Nonaktifkan saja agar tidak muncul lagi di pilihan.')
      await cq(c, 'DELETE FROM subjects WHERE id = ?', [id])
      await audit(c, ctx.user.id, 'mapel.hapus', 'subjects', sj.name)
    }),
  },

  /* Akademik menetapkan jadwal angkatan: instruktur, hari, jam, lokasi, dan mata pelajaran (dari bank) beserta jumlah pertemuannya. */
  saveBatchSchedule: {
    roles: ['akademik', 'super_admin'],
    fn: (ctx, b) => tx(async (c) => {
      const [bt] = await cq(c, 'SELECT * FROM batches WHERE id = ? FOR UPDATE', [b.batchId])
      if (!bt) fail('Angkatan tidak ditemukan.')
      const days = (Array.isArray(b.days) ? b.days : []).filter((d) => ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].includes(d))
      const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/
      if (!hhmm.test(b.startTime ?? '') || !hhmm.test(b.endTime ?? '')) fail('Jam mulai dan selesai wajib diisi (HH:MM).')
      if (b.endTime <= b.startTime) fail('Jam selesai harus setelah jam mulai.')
      if (!days.length) fail('Pilih minimal satu hari kelas.')
      if (b.instructorId) {
        const [ins] = await cq(c, "SELECT id FROM users WHERE id = ? AND role = 'instruktur' AND is_active = 1", [b.instructorId])
        if (!ins) fail('Instruktur tidak valid.')
      }
      const subs = Array.isArray(b.subjects) ? b.subjects : []
      if (!subs.length) fail('Pilih minimal satu mata pelajaran dari bank mata pelajaran.')
      const seen = new Set(); let total = 0
      for (const x of subs) {
        const n = num(x.sessions, 1, 50)
        if (seen.has(x.subjectId)) fail('Mata pelajaran terpilih dua kali.')
        seen.add(x.subjectId)
        const [sj] = await cq(c, 'SELECT id FROM subjects WHERE id = ? AND program_id = ? AND is_active = 1', [x.subjectId, bt.program_id])
        if (!sj) fail('Mata pelajaran tidak valid untuk pelatihan angkatan ini.')
        total += n
      }
      // Mata pelajaran yang sudah punya pertemuan tidak boleh dilepas, dan jumlahnya tidak boleh di bawah pertemuan yang ada.
      const used = await cq(c, 'SELECT cs.subject_id, sj.name, COUNT(*) n FROM class_sessions cs JOIN subjects sj ON sj.id = cs.subject_id WHERE cs.batch_id = ? GROUP BY cs.subject_id, sj.name', [b.batchId])
      for (const u of used) {
        const keep = subs.find((x) => x.subjectId === u.subject_id)
        if (!keep) fail(`Mata pelajaran "${u.name}" sudah punya pertemuan sehingga tidak bisa dilepas dari jadwal.`)
        if (Number(keep.sessions) < Number(u.n)) fail(`"${u.name}" sudah punya ${u.n} pertemuan, jadi jumlahnya tidak bisa di bawah itu.`)
      }
      await cq(c, 'UPDATE batches SET instructor_id = ?, location = ?, schedule_days = ?, start_time = ?, end_time = ?, planned_sessions = ? WHERE id = ?',
        [b.instructorId || null, str(b.location, 160, false), days.join(','), b.startTime, b.endTime, total, b.batchId])
      await cq(c, 'DELETE FROM batch_subjects WHERE batch_id = ?', [b.batchId])
      for (const x of subs) await cq(c, 'INSERT INTO batch_subjects (batch_id, subject_id, sessions_planned) VALUES (?,?,?)', [b.batchId, x.subjectId, Number(x.sessions)])
      await audit(c, ctx.user.id, 'jadwal.simpan', 'batches', `${bt.code}: ${days.join('/')} ${b.startTime}-${b.endTime}, ${subs.length} mapel, ${total} pertemuan`)
    }),
  },
  savePertemuan: {
    roles: ['instruktur', 'super_admin'],
    fn: (ctx, p) => tx(async (c) => {
      const [b] = await cq(c, 'SELECT * FROM batches WHERE id = ? FOR UPDATE', [p.batchId])
      if (!b) fail('Angkatan tidak ditemukan.')
      await assertOwnBatch(c, ctx.user, p.batchId)
      if (!b.start_time) fail('Akademik belum menetapkan jadwal angkatan ini (hari dan jam).')
      const [bs] = await cq(c, 'SELECT bs.*, sj.name FROM batch_subjects bs JOIN subjects sj ON sj.id = bs.subject_id WHERE bs.batch_id = ? AND bs.subject_id = ?', [p.batchId, p.subjectId ?? ''])
      if (!bs) fail('Pilih mata pelajaran dari jadwal angkatan ini.')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date ?? '')) fail('Tanggal pertemuan tidak valid.')
      if (p.date < b.start_date || p.date > b.end_date) fail(`Tanggal harus di antara ${b.start_date} dan ${b.end_date}.`)
      const startAt = new Date(`${p.date}T${String(b.start_time).slice(0, 5)}:00+07:00`) // jam kelas dalam WIB
      if (p.meetingUrl && !/^https:\/\//.test(p.meetingUrl)) fail('Tautan pertemuan online harus diawali https://.')
      const [ex] = p.id ? await cq(c, 'SELECT id, batch_id, subject_id FROM class_sessions WHERE id = ?', [p.id]) : []
      if (ex && ex.batch_id !== p.batchId) fail('Pertemuan bukan milik angkatan ini.', 403)
      if (!ex || ex.subject_id !== p.subjectId) {
        const [{ n }] = await cq(c, 'SELECT COUNT(*) n FROM class_sessions WHERE batch_id = ? AND subject_id = ?', [p.batchId, p.subjectId])
        if (Number(n) >= bs.sessions_planned) fail(`Jatah pertemuan "${bs.name}" sudah penuh (${bs.sessions_planned}). Minta Akademik menambah jumlah pertemuannya bila perlu.`)
      }
      const vals = [p.batchId, p.subjectId, str(p.title, 160), startAt, b.location, p.meetingUrl || null]
      if (ex) await cq(c, 'UPDATE class_sessions SET batch_id=?, subject_id=?, title=?, start_at=?, location=?, meeting_url=? WHERE id = ?', [...vals, p.id])
      else await cq(c, 'INSERT INTO class_sessions (batch_id, subject_id, title, start_at, location, meeting_url, id) VALUES (?,?,?,?,?,?,?)', [...vals, p.id || uid()])
      await audit(c, ctx.user.id, ex ? 'pertemuan.ubah' : 'pertemuan.tambah', 'class_sessions', `${b.code} ${bs.name}: ${p.title}`)
    }),
  },
  deletePertemuan: {
    roles: ['instruktur', 'super_admin'],
    fn: (ctx, id) => tx(async (c) => {
      const [s] = await cq(c, 'SELECT * FROM class_sessions WHERE id = ?', [id])
      if (!s) fail('Pertemuan tidak ditemukan.')
      await assertOwnBatch(c, ctx.user, s.batch_id)
      const [{ n }] = await cq(c, 'SELECT COUNT(*) n FROM attendances WHERE session_id = ?', [id])
      if (Number(n)) fail('Pertemuan sudah punya data absensi dan tidak dapat dihapus.')
      await cq(c, 'DELETE FROM class_sessions WHERE id = ?', [id]) // materi pertemuan ikut terhapus (ON DELETE CASCADE)
      await audit(c, ctx.user.id, 'pertemuan.hapus', 'class_sessions', s.title)
    }),
  },
  saveMaterialLink: {
    roles: ['instruktur', 'akademik', 'super_admin'],
    fn: (ctx, m) => tx(async (c) => {
      if (!m.url || !/^https:\/\//.test(m.url)) fail('Tautan harus diawali https://.')
      const [ses] = await cq(c, 'SELECT * FROM class_sessions WHERE id = ?', [m.sessionId])
      if (!ses) fail('Pilih pertemuan untuk materi ini.')
      await assertOwnBatch(c, ctx.user, ses.batch_id)
      await cq(c, 'INSERT INTO materials (id, batch_id, session_id, title, kind, url) VALUES (?,?,?,?,?,?)', [uid(), ses.batch_id, ses.id, str(m.title, 160), 'Tautan', m.url])
      await audit(c, ctx.user.id, 'materi.tambah', 'materials', m.title)
    }),
  },
  deleteMaterial: {
    roles: ['instruktur', 'akademik', 'super_admin'],
    fn: (ctx, id) => tx(async (c) => {
      const [m] = await cq(c, 'SELECT * FROM materials WHERE id = ?', [id])
      if (!m) fail('Materi tidak ditemukan.')
      await assertOwnBatch(c, ctx.user, m.batch_id)
      await cq(c, 'DELETE FROM materials WHERE id = ?', [id])
    }),
  },
  saveAssignment: {
    roles: ['instruktur', 'super_admin'],
    fn: (ctx, a) => tx(async (c) => {
      await assertOwnBatch(c, ctx.user, a.batchId)
      await cq(c, 'INSERT INTO assignments (id, batch_id, title, description, due_at) VALUES (?,?,?,?,?)', [uid(), a.batchId, str(a.title, 160), str(a.description, 2000, false), dt(a.dueAt)])
      await audit(c, ctx.user.id, 'tugas.buat', 'assignments', a.title)
    }),
  },
  gradeSubmission: {
    roles: ['instruktur', 'super_admin'],
    fn: (ctx, id, score, feedback) => tx(async (c) => {
      const [s] = await cq(c, 'SELECT s.*, a.batch_id FROM submissions s JOIN assignments a ON a.id = s.assignment_id WHERE s.id = ?', [id])
      if (!s) fail('Pengumpulan tidak ditemukan.')
      await assertOwnBatch(c, ctx.user, s.batch_id)
      await cq(c, 'UPDATE submissions SET score = ?, feedback = ? WHERE id = ?', [num(score, 0, 100), str(feedback, 500, false), id])
    }),
  },
  saveAttendance: {
    roles: ['instruktur', 'super_admin'],
    fn: (ctx, sessionId, marks) => tx(async (c) => {
      const [s] = await cq(c, 'SELECT * FROM class_sessions WHERE id = ?', [sessionId])
      if (!s) fail('Sesi tidak ditemukan.')
      await assertOwnBatch(c, ctx.user, s.batch_id)
      const accepted = []
      for (const [regId, status] of Object.entries(marks ?? {})) {
        if (!['hadir', 'izin', 'sakit', 'alpa'].includes(status)) fail('Status kehadiran tidak valid.')
        const [r] = await cq(c, "SELECT id FROM registrations WHERE id = ? AND batch_id = ? AND status = 'active'", [regId, s.batch_id])
        if (!r) continue
        accepted.push(regId)
        await cq(c, 'INSERT INTO attendances (session_id, registration_id, status) VALUES (?,?,?) ON DUPLICATE KEY UPDATE status = VALUES(status)', [sessionId, regId, status])
      }
      // persentase hadir dihitung sistem dari sesi yang sudah punya absensi
      const [{ total }] = await cq(c, 'SELECT COUNT(DISTINCT a.session_id) total FROM attendances a JOIN class_sessions cs ON cs.id = a.session_id WHERE cs.batch_id = ?', [s.batch_id])
      if (!accepted.length || !Number(total)) return // tidak ada peserta aktif yang dicatat: tidak ada persentase untuk dihitung
      for (const regId of accepted) {
        const [{ hadir }] = await cq(c, "SELECT COUNT(*) hadir FROM attendances a JOIN class_sessions cs ON cs.id = a.session_id WHERE a.registration_id = ? AND cs.batch_id = ? AND a.status = 'hadir'", [regId, s.batch_id])
        await cq(c, "UPDATE grades SET attendance_pct = ? WHERE registration_id = ? AND status = 'draft'", [Math.round((Number(hadir) / Number(total)) * 100), regId])
      }
      await audit(c, ctx.user.id, 'absensi.simpan', 'attendances', s.title)
    }),
  },

  /* ---------- nilai dan sertifikat ---------- */
  saveGrade: {
    roles: ['instruktur', 'super_admin'],
    fn: (ctx, regId, patch) => tx(async (c) => {
      const g = await ownedGrade(c, ctx.user, regId)
      if (g.status !== 'draft') fail('Nilai sudah dikirim dan terkunci.')
      const set = []; const vals = []
      for (const [k, col] of [['theory', 'theory'], ['practical', 'practical'], ['attendancePct', 'attendance_pct']]) {
        if (patch[k] !== undefined) { set.push(`${col} = ?`); vals.push(num(patch[k], 0, 100)) }
      }
      if (set.length) await cq(c, `UPDATE grades SET ${set.join(', ')} WHERE registration_id = ?`, [...vals, regId])
    }),
  },
  submitGrade: {
    roles: ['instruktur', 'super_admin'],
    fn: (ctx, regId) => tx(async (c) => {
      const g = await ownedGrade(c, ctx.user, regId)
      if (g.status !== 'draft') fail('Nilai tidak dalam status draf.')
      await cq(c, "UPDATE grades SET status = 'submitted' WHERE registration_id = ?", [regId])
      await audit(c, ctx.user.id, 'nilai.kirim', 'grades', regId)
    }),
  },
  returnGrade: {
    roles: ['akademik', 'super_admin'],
    fn: (ctx, regId) => tx(async (c) => {
      await cq(c, "UPDATE grades SET status = 'draft' WHERE registration_id = ? AND status = 'submitted'", [regId])
      await audit(c, ctx.user.id, 'nilai.kembalikan', 'grades', regId)
    }),
  },
  validateGrade: {
    roles: ['akademik', 'super_admin'],
    fn: (ctx, regId, passed, overrideReason) => tx(async (c) => {
      const [g] = await cq(c, "SELECT * FROM grades WHERE registration_id = ? AND status = 'submitted' FOR UPDATE", [regId])
      if (!g) fail('Nilai belum dikirim instruktur.')
      const [r] = await cq(c, 'SELECT r.*, b.program_id FROM registrations r JOIN batches b ON b.id = r.batch_id WHERE r.id = ? FOR UPDATE', [regId])
      const [p] = await cq(c, 'SELECT * FROM programs WHERE id = ?', [r.program_id])
      const rec = recommend(g, p)
      if (rec !== !!passed && !String(overrideReason ?? '').trim()) fail('Menimpa rekomendasi sistem wajib disertai alasan.')
      await cq(c, "UPDATE grades SET status = 'validated', passed = ?, override_reason = ?, validated_by = ?, validated_at = ? WHERE registration_id = ?",
        [passed ? 1 : 0, rec !== !!passed ? str(overrideReason, 200) : null, ctx.user.id, dt(), regId])
      await cq(c, "UPDATE registrations SET status = 'completed' WHERE id = ?", [regId])
      await audit(c, ctx.user.id, 'nilai.validasi', 'grades', `${r.code} ${passed ? 'lulus' : 'tidak lulus'}${rec !== !!passed ? ' (override)' : ''}`)
    }),
  },
  issueCertificate: {
    roles: ['akademik', 'super_admin'],
    fn: async (ctx, regId) => {
      const result = await tx(async (c) => {
        const [g] = await cq(c, 'SELECT * FROM grades WHERE registration_id = ?', [regId])
        if (!g || g.status !== 'validated' || !g.passed) fail('Hanya peserta lulus dengan nilai tervalidasi yang dapat menerima sertifikat.')
        const [ex] = await cq(c, "SELECT id FROM certificates WHERE registration_id = ? AND status = 'issued'", [regId])
        if (ex) fail('Sertifikat sudah terbit.')
        const year = new Date().getFullYear()
        await cq(c, 'INSERT IGNORE INTO certificate_sequences (year, last_number) VALUES (?, 0)', [year])
        const [seq] = await cq(c, 'SELECT last_number FROM certificate_sequences WHERE year = ? FOR UPDATE', [year]) // baris dikunci: nomor tidak kembar (T14)
        const n = seq.last_number + 1
        await cq(c, 'UPDATE certificate_sequences SET last_number = ? WHERE year = ?', [n, year])
        const [tpl] = await cq(c, 'SELECT id FROM certificate_templates WHERE is_active = 1 LIMIT 1')
        const id = uid()
        await cq(c, 'INSERT INTO certificates (id, registration_id, template_id, number, verification_code) VALUES (?,?,?,?,?)', [id, regId, tpl?.id ?? null, `CERT/CIH/${year}/${String(n).padStart(4, '0')}`, randomCode(10)])
        const [u] = await cq(c, 'SELECT u.email, u.name, u.email_verified_at FROM users u JOIN registrations r ON r.user_id = u.id WHERE r.id = ?', [regId])
        if (u.email_verified_at) await mail(c, u.email, 'Sertifikat dan transkrip Anda', 'Sertifikat dan transkrip dapat diunduh dari portal peserta.')
        await audit(c, ctx.user.id, 'sertifikat.terbit', 'certificates', `${regId}`)
        return id
      })
      await renderCertificatePdf(result) // render sekali, disimpan sebagai berkas (T17)
    },
  },
  revokeCertificate: {
    roles: ['akademik', 'super_admin'],
    fn: (ctx, id, reason) => tx(async (c) => {
      const why = str(reason, 200)
      await cq(c, "UPDATE certificates SET status = 'revoked', revoked_reason = ? WHERE id = ?", [why, id])
      await audit(c, ctx.user.id, 'sertifikat.cabut', 'certificates', `${id}: ${why}`)
    }),
  },
  saveTemplate: {
    roles: ['akademik', 'super_admin'],
    fn: (ctx, id, config, activate) => tx(async (c) => {
      const [t] = await cq(c, 'SELECT * FROM certificate_templates WHERE id = ?', [id])
      if (!t) fail('Template tidak ditemukan.')
      await cq(c, 'UPDATE certificate_templates SET config = ? WHERE id = ?', [JSON.stringify(config), id])
      if (activate) {
        await cq(c, 'UPDATE certificate_templates SET is_active = 0')
        await cq(c, 'UPDATE certificate_templates SET is_active = 1 WHERE id = ?', [id])
      }
      await audit(c, ctx.user.id, activate ? 'template.aktifkan' : 'template.simpan', 'certificate_templates', `v${t.version}`)
    }),
  },

  /* ---------- landing page (CMS) ---------- */
  saveDraft: {
    roles: CMS,
    fn: (ctx, sections) => tx(async (c) => {
      checkSections(sections)
      await cq(c, "INSERT INTO settings (k, v) VALUES ('draft_sections', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)", [JSON.stringify(sections)])
      await audit(c, ctx.user.id, 'landing.draf', 'landing', `${sections.length} section`)
    }),
  },
  publishDraft: {
    roles: CMS,
    fn: (ctx, sections, note) => tx(async (c) => {
      checkSections(sections)
      const id = uid()
      await cq(c, "INSERT INTO settings (k, v) VALUES ('draft_sections', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)", [JSON.stringify(sections)])
      await cq(c, 'INSERT INTO landing_revisions (id, snapshot, note, created_by) VALUES (?,?,?,?)', [id, JSON.stringify(sections), str(note, 200, false) || 'Tanpa catatan', ctx.user.id])
      await cq(c, "INSERT INTO settings (k, v) VALUES ('published_revision', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)", [id])
      await audit(c, ctx.user.id, 'landing.terbit', 'landing', note)
    }),
  },
  restoreRevision: {
    roles: CMS,
    fn: (ctx, id) => tx(async (c) => {
      const [r] = await cq(c, 'SELECT * FROM landing_revisions WHERE id = ?', [id])
      if (!r) fail('Versi tidak ditemukan.')
      await cq(c, "INSERT INTO settings (k, v) VALUES ('published_revision', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)", [id]) // rollback = ganti penunjuk (PRD §8.6)
      await cq(c, "INSERT INTO settings (k, v) VALUES ('draft_sections', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)", [r.snapshot])
      await audit(c, ctx.user.id, 'landing.rollback', 'landing', r.note)
    }),
  },
  deleteMedia: {
    roles: ['super_admin'],
    fn: (ctx, id) => tx(async (c) => {
      const [{ n }] = await cq(c, "SELECT COUNT(*) n FROM settings WHERE k IN ('draft_sections') AND v LIKE ?", [`%${id}%`])
      const [{ m }] = await cq(c, 'SELECT COUNT(*) m FROM landing_revisions WHERE snapshot LIKE ?', [`%${id}%`])
      if (Number(n) || Number(m)) fail('Gambar masih dipakai di landing page atau riwayat versi.')
      await cq(c, "DELETE FROM files WHERE id = ? AND kind = 'media'", [id])
    }),
  },

  /* ---------- pengaturan, pengguna, email ---------- */
  saveSettings: {
    roles: ['super_admin'],
    fn: (ctx, s) => tx(async (c) => {
      const clean = {
        name: str(s.name, 120), bankName: str(s.bankName, 80), bankAccount: str(s.bankAccount, 40), bankHolder: str(s.bankHolder, 80),
        payDueHours: num(s.payDueHours, 1, 720), phone: str(s.phone, 40, false), whatsapp: str(s.whatsapp, 20, false), address: str(s.address, 255, false),
        hours: str(s.hours, 120, false), signerName: str(s.signerName, 80, false), signerTitle: str(s.signerTitle, 80, false),
      }
      await cq(c, "INSERT INTO settings (k, v) VALUES ('site', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)", [JSON.stringify(clean)])
      await audit(c, ctx.user.id, 'pengaturan.ubah', 'settings', clean.name)
    }),
  },
  saveUser: {
    roles: ['super_admin'],
    fn: (ctx, u, password) => tx(async (c) => {
      if (u.role === 'peserta') fail('Akun peserta mendaftar sendiri.')
      const email = str(u.email, 160).toLowerCase()
      const [ex] = await cq(c, 'SELECT id FROM users WHERE id = ?', [u.id])
      if (ex) {
        await cq(c, 'UPDATE users SET name=?, email=?, role=?, is_active=? WHERE id = ?', [str(u.name, 120), email, u.role, u.active ? 1 : 0, u.id])
        if (u.id === ctx.user.id && !u.active) fail('Anda tidak dapat menonaktifkan akun sendiri.')
      } else {
        if (String(password ?? '').length < 8) fail('Password awal minimal 8 karakter.')
        const [dup] = await cq(c, 'SELECT id FROM users WHERE email = ?', [email])
        if (dup) fail('Email sudah terdaftar.')
        await cq(c, 'INSERT INTO users (id, name, email, password_hash, role, is_active, must_change_password, email_verified_at) VALUES (?,?,?,?,?,?,1,?)', [uid(), str(u.name, 120), email, await bcrypt.hash(password, 10), u.role, 1, dt()])
      }
      await audit(c, ctx.user.id, ex ? 'user.ubah' : 'user.buat', 'users', `${email} (${u.role})`)
    }),
  },
  sendAnnouncement: {
    roles: ['admin_pendaftaran', 'super_admin', 'instruktur'],
    fn: (ctx, scope, scopeId, subject, body) => tx(async (c) => {
      let rows
      if (scope === 'all') rows = await cq(c, "SELECT DISTINCT u.email FROM users u JOIN registrations r ON r.user_id = u.id WHERE r.status IN ('active','pending_payment','waiting_verification') AND u.email_verified_at IS NOT NULL")
      else if (scope === 'program') rows = await cq(c, "SELECT DISTINCT u.email FROM users u JOIN registrations r ON r.user_id = u.id JOIN batches b ON b.id = r.batch_id WHERE b.program_id = ? AND r.status IN ('active','pending_payment','waiting_verification')", [scopeId])
      else if (scope === 'batch') { await assertOwnBatch(c, ctx.user, scopeId); rows = await cq(c, "SELECT DISTINCT u.email FROM users u JOIN registrations r ON r.user_id = u.id WHERE r.batch_id = ? AND r.status IN ('active','pending_payment','waiting_verification')", [scopeId]) }
      else fail('Segmen tidak dikenal.')
      if (ctx.user.role === 'instruktur' && scope !== 'batch') fail('Instruktur hanya dapat mengumumkan ke angkatannya.', 403)
      const sub = str(subject, 200), text = str(body, 4000)
      for (const r of rows) await mail(c, r.email, sub, text)
      await audit(c, ctx.user.id, 'pengumuman.kirim', 'email_queue', `${scope}: ${rows.length} penerima`)
      return rows.length
    }),
  },
  verifyEmailDev: {
    roles: ['peserta'],
    fn: async (ctx) => {
      if (process.env.NODE_ENV === 'production') fail('Tidak tersedia.', 403)
      await q('UPDATE users SET email_verified_at = ? WHERE id = ?', [dt(), ctx.user.id])
    },
  },
}

async function assertOwnBatch(c, user, batchId) {
  const [b] = await cq(c, 'SELECT instructor_id FROM batches WHERE id = ?', [batchId])
  if (!b) fail('Angkatan tidak ditemukan.')
  if (user.role === 'instruktur' && b.instructor_id !== user.id) fail('Bukan angkatan yang Anda ajar.', 403)
}
async function ownedGrade(c, user, regId) {
  const [g] = await cq(c, 'SELECT g.*, b.instructor_id FROM grades g JOIN registrations r ON r.id = g.registration_id JOIN batches b ON b.id = r.batch_id WHERE g.registration_id = ? FOR UPDATE', [regId])
  if (!g) fail('Data nilai tidak ada.')
  if (user.role === 'instruktur' && g.instructor_id !== user.id) fail('Bukan angkatan yang Anda ajar.', 403)
  return g
}
const TYPES = ['announcement_bar', 'hero', 'about', 'programs', 'upcoming_batches', 'benefits', 'testimonials', 'stats', 'faq', 'cta', 'contact']
function checkSections(sections) {
  if (!Array.isArray(sections) || sections.length > 40) fail('Susunan section tidak valid.')
  for (const s of sections) {
    if (!TYPES.includes(s.type)) fail(`Tipe section tidak dikenal: ${s.type}`)
    const c = s.content ?? {}
    for (const k of ['ctaHref', 'secondaryHref', 'href']) if (c[k] && !okHref(c[k])) fail('Tautan harus https:// atau path internal.')
    if (JSON.stringify(c).length > 20000) fail('Isi section terlalu panjang.')
  }
}
export { seats }
