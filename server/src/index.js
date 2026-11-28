import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import bcrypt from 'bcryptjs'
import cookieParser from 'cookie-parser'
import express from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import jwt from 'jsonwebtoken'
import multer from 'multer'
import sharp from 'sharp'
import { actions, assertOwnSession, expireOverdue, registerForProgram } from './actions.js'
import { beritaAcaraData, beritaAcaraDocx, beritaAcaraPdf } from './beritaAcara.js'
import { biodataData, biodataPdf } from './biodata.js'
import { logbookData, logbookDocx } from './logbookMagang.js'
import { migrate } from './migrate.js'
import { addClient } from './realtime.js'
import { afterProfileDone, regFeeDue, remainingTotal, renderLetter, renderLetterPreview } from './admission.js'
import { AUTO_WITHDRAW_REASON, HttpError, MAX_AGE, UPLOAD_DIR, ageOn, audit, cq, dt, fail, getSettings, iso, mail, q, saveUpload, tx, uid } from './lib.js'
import { processQueue } from './mailer.js'
import { transcriptPdf } from './pdf.js'
import { transkripData, transkripDocx, transkripPdf } from './transkripAkhir.js'
import { buildState } from './state.js'
import { STAFF_PROFILE_ROLES, saveStaffFile } from './staffProfile.js'
import * as wilayah from './wilayah.js'

const SECRET = process.env.JWT_SECRET
if (!SECRET) throw new Error('JWT_SECRET belum diatur di server/.env')
const IS_PROD = process.env.NODE_ENV === 'production'
const APP_URL = process.env.APP_URL || 'http://localhost:4000'

const app = express()
app.set('trust proxy', 1)
app.use(helmet({ contentSecurityPolicy: false }))
app.use(express.json({ limit: '300kb' }))
app.use(cookieParser())
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 2 } })

/* ---------- sesi ---------- */
app.use(async (req, _res, next) => {
  try {
    const t = req.cookies?.cih_session
    if (t) {
      const { sub, imp } = jwt.verify(t, SECRET)
      const [u] = await q('SELECT * FROM users WHERE id = ? AND is_active = 1', [sub])
      req.user = u
      // Sesi "masuk sebagai instruktur": hanya sah selama Super Admin asalnya masih aktif.
      if (u && imp) {
        const [boss] = await q("SELECT id, name FROM users WHERE id = ? AND role = 'super_admin' AND is_active = 1", [imp])
        if (boss) req.impersonator = boss; else req.user = undefined
      }
    }
  } catch { /* token tidak valid: anggap belum masuk */ }
  next()
})
const needUser = (req) => { if (!req.user) fail('Silakan masuk terlebih dahulu.', 401); return req.user }
const needRole = (req, roles) => { const u = needUser(req); if (!roles.includes(u.role)) fail('Anda tidak berhak melakukan ini.', 403); return u }
const setSession = (res, id) => res.cookie('cih_session', jwt.sign({ sub: id }, SECRET, { expiresIn: '7d' }), { httpOnly: true, sameSite: 'lax', secure: IS_PROD, maxAge: 7 * 86_400_000 })

// Hanya permintaan gagal yang dihitung, jadi login berulang yang berhasil (misalnya saat uji) tidak memicu blokir.
const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: true, skipSuccessfulRequests: true, message: { ok: false, error: 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.' } })
const publicLimiter = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, message: { ok: false, error: 'Terlalu banyak permintaan.' } })

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
const passwordOk = (p) => typeof p === 'string' && p.length >= 8 && p.length <= 100

/* ---------- auth ---------- */
app.post('/api/auth/register', authLimiter, wrap(async (req, res) => {
  const { name, email, nik, birthDate, password, website, programId } = req.body ?? {}
  if (website) fail('Registrasi tidak dapat diproses. Muat ulang halaman lalu coba lagi.') // honeypot untuk bot; error (bukan ok) agar pengisian otomatis browser tidak terlihat seolah berhasil
  const em = String(email ?? '').trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) fail('Format email tidak valid.')
  if (!String(name ?? '').trim()) fail('Nama wajib diisi.')
  const nikV = String(nik ?? '').trim()
  if (!/^\d{16}$/.test(nikV)) fail('NIK harus 16 digit angka.')
  const bd = String(birthDate ?? '')
  const age = ageOn(bd)
  if (age == null || age < 14) fail('Tanggal lahir tidak valid.')
  if (age > MAX_AGE) fail(`Pendaftaran hanya untuk usia maksimal ${MAX_AGE} tahun.`)
  if (!passwordOk(password)) fail('Password minimal 8 karakter.')
  if (!programId) fail('Pilih jenis pelatihan.')
  const id = uid()
  const pwHash = await bcrypt.hash(password, 10)
  // Dua pendaftar bersamaan bisa mendapat nomor registrasi yang sama; ulangi agar nomor berikutnya dipakai.
  for (let attempt = 1; ; attempt++) {
    try { await tx(async (c) => {
    const [dup] = await cq(c, 'SELECT id FROM users WHERE email = ?', [em])
    if (dup) fail('Email sudah terdaftar.')
    const [dupNik] = await cq(c, 'SELECT user_id FROM participant_profiles WHERE nik = ? UNION SELECT id FROM users WHERE nik = ?', [nikV, nikV])
    if (dupNik) fail('NIK ini sudah terdaftar. Satu NIK hanya dapat dipakai untuk satu akun.')
    await cq(c, 'INSERT INTO users (id, name, email, nik, birth_date, password_hash, role) VALUES (?,?,?,?,?,?,?)', [id, String(name).trim().slice(0, 120), em, nikV, bd, pwHash, 'peserta'])
    await audit(c, id, 'akun.daftar', 'users', em)
    await registerForProgram(c, { id, email: em, name: String(name).trim() }, programId) // pilihan pelatihan jadi tagihan saat itu juga
    }); break } catch (e) { if (e?.code !== 'ER_DUP_ENTRY' || attempt >= 3) throw e }
  }
  setSession(res, id)
  res.json({ ok: true })
}))

app.post('/api/auth/login', authLimiter, wrap(async (req, res) => {
  const em = String(req.body?.email ?? '').trim().toLowerCase()
  const [u] = await q('SELECT * FROM users WHERE email = ?', [em])
  const bad = () => fail('Email atau password salah.', 401)
  if (!u || !u.is_active) return bad()
  if (u.locked_until && new Date(u.locked_until) > new Date()) fail('Akun dikunci sementara karena terlalu banyak percobaan. Coba lagi nanti.', 423)
  if (!(await bcrypt.compare(String(req.body?.password ?? ''), u.password_hash))) {
    const n = u.failed_login_count + 1
    await q('UPDATE users SET failed_login_count = ?, locked_until = ? WHERE id = ?', [n >= 5 ? 0 : n, n >= 5 ? new Date(Date.now() + 15 * 60_000) : null, u.id])
    return bad()
  }
  await q('UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = ? WHERE id = ?', [dt(), u.id])
  setSession(res, u.id)
  res.json({ ok: true, role: u.role })
}))

app.post('/api/auth/logout', (_req, res) => { res.clearCookie('cih_session'); res.json({ ok: true }) })

/* Super Admin masuk sebagai instruktur (mis. untuk melengkapi pertemuan, absensi, dan nilai yang belum diisi). Tercatat di audit log. */
app.post('/api/auth/impersonate', wrap(async (req, res) => {
  const boss = needRole(req, ['super_admin'])
  if (req.impersonator) fail('Kembali ke akun Super Admin dulu sebelum berpindah instruktur.')
  const [target] = await q("SELECT id, name FROM users WHERE id = ? AND role = 'instruktur' AND is_active = 1", [String(req.body?.userId ?? '')])
  if (!target) fail('Instruktur tidak ditemukan atau tidak aktif.', 404)
  await q('INSERT INTO audit_logs (user_id, action, entity, detail) VALUES (?,?,?,?)', [boss.id, 'akun.masuk-sebagai', 'users', `Super Admin masuk sebagai instruktur ${target.name}`])
  res.cookie('cih_session', jwt.sign({ sub: target.id, imp: boss.id }, SECRET, { expiresIn: '4h' }), { httpOnly: true, sameSite: 'lax', secure: IS_PROD, maxAge: 4 * 3_600_000 })
  res.json({ ok: true })
}))
app.post('/api/auth/stop-impersonate', wrap(async (req, res) => {
  const boss = req.impersonator
  if (!boss) fail('Anda tidak sedang masuk sebagai instruktur.')
  await q('INSERT INTO audit_logs (user_id, action, entity, detail) VALUES (?,?,?,?)', [boss.id, 'akun.kembali', 'users', `Kembali dari akun instruktur ${req.user.name}`])
  setSession(res, boss.id)
  res.json({ ok: true })
}))

// Email hanya dipakai untuk reset password. Respons selalu sama agar email tidak bisa ditebak.
app.post('/api/auth/forgot', authLimiter, wrap(async (req, res) => {
  const [u] = await q('SELECT * FROM users WHERE email = ? AND is_active = 1', [String(req.body?.email ?? '').trim().toLowerCase()])
  if (u) {
    const token = crypto.randomBytes(32).toString('hex')
    await q("INSERT INTO email_tokens (token, user_id, kind, expires_at) VALUES (?,?,'reset',?)", [token, u.id, new Date(Date.now() + 3_600_000)])
    await q('INSERT INTO email_queue (to_email, subject, body) VALUES (?,?,?)', [u.email, 'Atur ulang password', `Tautan berlaku 1 jam: ${APP_URL}/atur-ulang?token=${token}`])
  }
  res.json({ ok: true })
}))
app.post('/api/auth/reset', authLimiter, wrap(async (req, res) => {
  if (!passwordOk(req.body?.password)) fail('Password minimal 8 karakter.')
  const [t] = await q("SELECT * FROM email_tokens WHERE token = ? AND kind = 'reset' AND used_at IS NULL AND expires_at > ?", [String(req.body?.token ?? ''), dt()])
  if (!t) fail('Tautan tidak valid atau sudah kedaluwarsa.')
  await q('UPDATE users SET password_hash = ?, must_change_password = 0, failed_login_count = 0, locked_until = NULL WHERE id = ?', [await bcrypt.hash(req.body.password, 10), t.user_id])
  await q('UPDATE email_tokens SET used_at = ? WHERE token = ?', [dt(), t.token])
  res.json({ ok: true })
}))
app.post('/api/auth/change-password', authLimiter, wrap(async (req, res) => {
  const u = needUser(req)
  if (!(await bcrypt.compare(String(req.body?.oldPassword ?? ''), u.password_hash))) fail('Password lama salah.')
  if (!passwordOk(req.body?.newPassword)) fail('Password baru minimal 8 karakter.')
  // Peserta buatan admin boleh mengganti email satu kali. Hak ini tetap ada sampai email benar-benar diganti.
  const offered = u.role === 'peserta' && u.email_change_left && req.body?.email !== undefined
  let email = null
  if (offered) {
    const em = String(req.body.email).trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em) || em.length > 160) fail('Format email tidak valid.')
    if (em !== u.email) {
      const [used] = await q('SELECT id FROM users WHERE email = ? AND id <> ?', [em, u.id])
      if (used) fail('Email sudah dipakai akun lain.')
      email = em
    }
  }
  await q('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?', [await bcrypt.hash(req.body.newPassword, 10), u.id])
  if (email) {
    await q('UPDATE users SET email = ?, email_change_left = 0 WHERE id = ?', [email, u.id])
    await q('INSERT INTO audit_logs (user_id, action, entity, detail) VALUES (?,?,?,?)', [u.id, 'user.email-ubah-peserta', 'users', `${u.email} -> ${email}`])
  }
  res.json({ ok: true })
}))

/** Peserta buatan admin mengganti email di luar popup masuk pertama. Hanya satu kali: hak habis setelah email berubah. */
app.post('/api/auth/change-email', authLimiter, wrap(async (req, res) => {
  const u = needRole(req, ['peserta'])
  if (!u.email_change_left) fail('Email Anda sudah tidak dapat diubah sendiri. Hubungi admin.', 403)
  const em = String(req.body?.email ?? '').trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em) || em.length > 160) fail('Format email tidak valid.')
  if (em === u.email) fail('Email baru sama dengan email saat ini.')
  const [used] = await q('SELECT id FROM users WHERE email = ? AND id <> ?', [em, u.id])
  if (used) fail('Email sudah dipakai akun lain.')
  await q('UPDATE users SET email = ?, email_change_left = 0 WHERE id = ?', [em, u.id])
  await q('INSERT INTO audit_logs (user_id, action, entity, detail) VALUES (?,?,?,?)', [u.id, 'user.email-ubah-peserta', 'users', `${u.email} -> ${em}`])
  res.json({ ok: true })
}))

/* ---------- state dan RPC ---------- */
app.get('/api/events', (req, res) => {
  if (!req.user) return res.status(401).json({ ok: false, error: 'Silakan masuk terlebih dahulu.' })
  addClient(req, res, req.user)
})
app.get('/api/state', wrap(async (req, res) => {
  res.set('Cache-Control', 'no-store')
  res.json(await buildState(req.user, !IS_PROD, req.impersonator))
}))

app.post('/api/rpc/:name', wrap(async (req, res) => {
  const a = actions[req.params.name]
  if (!a) fail('Aksi tidak dikenal.', 404)
  const user = needRole(req, a.roles)
  const data = await a.fn({ user }, ...(Array.isArray(req.body?.args) ? req.body.args : []))
  res.json({ ok: true, data })
}))

/* ---------- unggah berkas ---------- */
const IMG = ['image/jpeg', 'image/png', 'image/webp']
const PROOF = ['image/jpeg', 'image/png', 'application/pdf']

app.post('/api/upload/proof/:regId', upload.single('file'), wrap(async (req, res) => {
  const u = needRole(req, ['peserta'])
  const b = req.body
  const [r] = await q('SELECT * FROM registrations WHERE id = ?', [req.params.regId])
  if (!r || r.user_id !== u.id) fail('Registrasi tidak ditemukan.', 404)
  if (!['pending_payment', 'active'].includes(r.status)) fail('Registrasi ini sudah tidak berjalan.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.transferDate ?? '')) fail('Tanggal transfer tidak valid.')
  const paid = Number(b.amountPaid)
  if (!Number.isFinite(paid) || paid <= 0) fail('Nominal tidak valid.')
  const s = await getSettings()
  const kind = ['pendaftaran', 'registrasi_ulang', 'cicilan'].includes(b.kind) ? b.kind : ''
  let due, inst = null
  if (kind === 'pendaftaran') {
    if (r.stage !== 'bayar_daftar') fail(r.stage === 'data' ? 'Lengkapi data diri dulu sebelum membayar pendaftaran.' : 'Biaya pendaftaran sudah dibayar.')
    due = await regFeeDue(null, r, s) // tarif umum dikurangi potongan dari keuangan
    if (due <= 0) fail('Biaya pendaftaran Anda sudah dihapus lewat potongan, tidak perlu membayar.')
  } else if (kind === 'registrasi_ulang') {
    if (r.stage !== 'registrasi_ulang') fail('Registrasi ulang dibuka setelah Anda dinyatakan lulus.')
    if (s.reenrollDue && new Date(s.reenrollDue + 'T23:59:59Z') < new Date()) fail('Batas registrasi ulang sudah lewat.')
    ;[inst] = await q('SELECT * FROM installments WHERE registration_id = ? AND seq = 1', [r.id])
    if (!inst) fail('Pilih paket pembayaran dulu.')
    if (inst.status !== 'unpaid') fail('Pembayaran ini sudah diunggah atau dikonfirmasi.')
    due = Number(inst.amount)
    // Paket lunas sekali bayar: nominal harus sesuai total biaya pelatihan. Keuangan mencocokkannya dengan bukti dan dapat menyesuaikan.
    const [{ n: nInst }] = await q('SELECT COUNT(*) n FROM installments WHERE registration_id = ?', [r.id])
    if (Number(nInst) === 1 && paid !== due) fail(`Paket lunas sekali bayar: nominal harus sesuai total biaya pelatihan (Rp${due.toLocaleString('id-ID')}).`)
  } else if (kind === 'cicilan') {
    ;[inst] = await q('SELECT * FROM installments WHERE id = ? AND registration_id = ?', [String(b.installmentId ?? ''), r.id])
    if (!inst || r.stage !== 'aktif') fail('Cicilan tidak ditemukan.')
    if (!['unpaid', 'partial'].includes(inst.status)) fail('Cicilan ini sudah lunas atau menunggu konfirmasi.')
    due = Number(inst.amount) - Number(inst.paid_amount)
  } else fail('Jenis pembayaran tidak dikenal.')
  if (inst) { // satu bukti menunggu pada satu waktu, dan nominal tidak boleh melebihi seluruh sisa tagihan
    const [pend] = await q("SELECT id FROM payments WHERE registration_id = ? AND installment_id IS NOT NULL AND status = 'submitted' LIMIT 1", [r.id])
    if (pend) fail('Bukti sebelumnya masih menunggu konfirmasi.')
    const rest = await remainingTotal(null, r.id)
    if (paid > rest) fail(`Nominal melebihi sisa tagihan (Rp${rest.toLocaleString('id-ID')}).`)
  }
  if (kind === 'pendaftaran') {
    const [pending] = await q("SELECT id FROM payments WHERE registration_id = ? AND kind = 'pendaftaran' AND status = 'submitted'", [r.id])
    if (pending) fail('Bukti sebelumnya masih menunggu konfirmasi.')
  }
  const fileId = await saveUpload(req.file, { kind: 'proof', ownerId: u.id, allowed: PROOF })
  await tx(async (c) => {
    if (inst) await cq(c, "UPDATE installments SET status = 'submitted' WHERE id = ?", [inst.id])
    await cq(c, 'INSERT INTO payments (id, registration_id, kind, installment_id, amount_due, amount_paid, payer_name, transfer_date, proof_file_id) VALUES (?,?,?,?,?,?,?,?,?)',
      [uid(), r.id, kind, inst?.id ?? null, due, paid, String(b.payerName ?? u.name).slice(0, 120), b.transferDate, fileId])
    await audit(c, u.id, 'pembayaran.unggah', 'payments', `${r.invoice_no} ${kind}`)
  })
  res.json({ ok: true })
}))

app.post('/api/upload/material', upload.single('file'), wrap(async (req, res) => {
  const u = needRole(req, ['instruktur', 'akademik', 'super_admin'])
  const { sessionId, title } = req.body
  const [ses] = await q('SELECT * FROM class_sessions WHERE id = ?', [sessionId])
  if (!ses) fail('Pilih pertemuan untuk materi ini.')
  const batchId = ses.batch_id
  await tx((c) => assertOwnSession(c, u, ses))
  if (!String(title ?? '').trim()) fail('Judul wajib diisi.')
  const fileId = await saveUpload(req.file, { kind: 'material', ownerId: u.id, allowed: [...PROOF] })
  await q('INSERT INTO materials (id, batch_id, session_id, title, kind, file_id) VALUES (?,?,?,?,?,?)', [uid(), batchId, ses.id, String(title).slice(0, 160), 'Berkas', fileId])
  await q('INSERT INTO audit_logs (user_id, action, entity, detail) VALUES (?,?,?,?)', [u.id, 'materi.tambah', 'materials', String(title).slice(0, 200)])
  res.json({ ok: true })
}))

app.post('/api/upload/submission', upload.single('file'), wrap(async (req, res) => {
  const u = needRole(req, ['peserta'])
  const [a] = await q('SELECT * FROM assignments WHERE id = ?', [req.body.assignmentId])
  if (!a) fail('Tugas tidak ditemukan.')
  const [r] = await q("SELECT * FROM registrations WHERE user_id = ? AND batch_id = ? AND status = 'active'", [u.id, a.batch_id])
  if (!r) fail('Anda tidak terdaftar aktif di angkatan ini.', 403)
  if (!(await hasProfile(u.id))) fail('Lengkapi data diri terlebih dahulu.', 403)
  if (!(await hasAllDocs(u.id))) fail('Unggah kelima berkas registrasi ulang terlebih dahulu.', 403)
  if (new Date(a.due_at) < new Date()) fail('Batas pengumpulan sudah lewat.')
  const fileId = req.file ? await saveUpload(req.file, { kind: 'submission', ownerId: u.id, allowed: PROOF }) : null
  if (!fileId && !String(req.body.note ?? '').trim()) fail('Isi catatan atau unggah berkas.')
  await q('INSERT INTO submissions (id, assignment_id, registration_id, file_id, note) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE file_id = COALESCE(VALUES(file_id), file_id), note = VALUES(note), submitted_at = CURRENT_TIMESTAMP, score = NULL',
    [uid(), a.id, r.id, fileId, String(req.body.note ?? '').slice(0, 500)])
  res.json({ ok: true })
}))

/** Tanda tangan ketua LPK untuk surat kelulusan. PNG (disarankan latar transparan) atau JPG. Yang lama diganti. */
app.post('/api/upload/signature', upload.single('file'), wrap(async (req, res) => {
  const u = needRole(req, ['super_admin', 'admin_pendaftaran'])
  const fileId = await saveUpload(req.file, { kind: 'signature', ownerId: u.id, allowed: ['image/png', 'image/jpeg'] })
  const cur = await getSettings()
  await q("INSERT INTO settings (k, v) VALUES ('site', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)", [JSON.stringify({ ...cur, signatureFileId: fileId })])
  if (cur.signatureFileId) {
    const [old] = await q('SELECT stored_name FROM files WHERE id = ?', [cur.signatureFileId])
    await q('DELETE FROM files WHERE id = ?', [cur.signatureFileId])
    if (old) await fs.promises.unlink(path.join(UPLOAD_DIR, old.stored_name)).catch(() => {})
  }
  await q('INSERT INTO audit_logs (user_id, action, entity, detail) VALUES (?,?,?,?)', [u.id, 'surat.tandatangan-unggah', 'settings', 'tanda tangan ketua LPK'])
  res.json({ ok: true })
}))

// Pustaka media (LP-6): alt wajib, dikonversi ke WebP dengan varian kecil. SVG tidak diterima.
app.post('/api/upload/media', upload.single('file'), wrap(async (req, res) => {
  const u = needRole(req, ['super_admin', 'admin_pendaftaran'])
  const alt = String(req.body.alt ?? '').trim()
  if (!alt) fail('Teks alternatif (alt) wajib diisi.')
  const fileId = await saveUpload(req.file, { kind: 'media', ownerId: u.id, allowed: IMG, alt: alt.slice(0, 200) })
  const [f] = await q('SELECT stored_name FROM files WHERE id = ?', [fileId])
  const src = path.join(UPLOAD_DIR, f.stored_name)
  const large = await sharp(src).rotate().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer()
  const small = await sharp(src).rotate().resize({ width: 480, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer()
  const base = f.stored_name.replace(/\.\w+$/, '')
  await fs.promises.writeFile(path.join(UPLOAD_DIR, `${base}.webp`), large)
  await fs.promises.writeFile(path.join(UPLOAD_DIR, `${base}.sm.webp`), small)
  if (f.stored_name !== `${base}.webp`) await fs.promises.unlink(src)
  await q("UPDATE files SET stored_name = ?, mime = 'image/webp', size = ? WHERE id = ?", [`${base}.webp`, large.length, fileId])
  await q('INSERT INTO audit_logs (user_id, action, entity, detail) VALUES (?,?,?,?)', [u.id, 'media.unggah', 'files', alt.slice(0, 200)])
  res.json({ ok: true, id: fileId })
}))

/* ---------- data diri peserta ---------- */
const hasProfile = async (userId) => !!(await q('SELECT user_id FROM participant_profiles WHERE user_id = ? AND completed_at IS NOT NULL', [userId]))[0]
/** Berkas registrasi ulang lengkap (kelima jenis sudah diunggah). */
const hasAllDocs = async (userId) => Number((await q('SELECT COUNT(DISTINCT kind) n FROM registration_documents WHERE user_id = ?', [userId]))[0].n) >= Object.keys(DOC_KINDS).length
/** Ruang belajar terbuka bila data diri lengkap dan kelima berkas registrasi ulang sudah diunggah. */
const learningUnlocked = async (userId) => (await hasProfile(userId)) && (await hasAllDocs(userId))
const EDU = ['SMA/SMK/MA', 'D1', 'D2', 'D3', 'S1/D4']
const INFO_SOURCES = ['instagram', 'guru_sekolah', 'alumni', 'siswa_chi', 'keluarga', 'edufair', 'lainnya']
const text = (v, label, max = 255) => { const t = String(v ?? '').trim(); if (!t) fail(`${label} wajib diisi.`); return t.slice(0, max) }
const phoneOk = (v, label) => { const t = String(v ?? '').replace(/[\s-]/g, ''); if (!/^(\+62|62|0)\d{8,13}$/.test(t)) fail(`${label} tidak valid. Contoh: 081234567890.`); return t }

/** Simpan data diri satu peserta. Admin boleh mengoreksi NIK dan tanggal lahir, peserta tidak. */
async function processProfile(u, b, actor, byStaff) {
  const [reg] = await q("SELECT id FROM registrations WHERE user_id = ? AND status IN ('pending_payment','active','completed') LIMIT 1", [u.id])
  if (!reg) fail('Lakukan registrasi pelatihan dulu sebelum mengisi data diri.', 403)
  const fullName = text(b.fullName, 'Nama lengkap', 120)
  const nik = String(b.nik ?? '').trim()
  if (!/^\d{16}$/.test(nik)) fail('NIK harus 16 digit angka.')
  const birthDate = String(b.birthDate ?? '')
  const bd = new Date(birthDate + 'T00:00:00Z')
  const age = (Date.now() - bd.getTime()) / (365.25 * 86_400_000)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || Number.isNaN(bd.getTime()) || age < 14 || age > 90) fail('Tanggal lahir tidak valid (usia 14 sampai 90 tahun).')
  if (!byStaff && u.nik && u.nik !== nik) fail('NIK tidak boleh berbeda dari yang dipakai saat mendaftar.')
  if (!byStaff && u.birth_date && u.birth_date !== birthDate) fail('Tanggal lahir tidak boleh berbeda dari yang dipakai saat mendaftar.')
  if (!['L', 'P'].includes(b.gender)) fail('Pilih jenis kelamin.')
  if (!/^\d{5}$/.test(String(b.postalCode ?? '').trim())) fail('Kode pos harus 5 digit.')
  if (!EDU.includes(b.education)) fail('Pilih pendidikan terakhir.')
  const rt = String(b.rt ?? '').trim(), rw = String(b.rw ?? '').trim()
  if (!/^\d{1,3}$/.test(rt) || !/^\d{1,3}$/.test(rw)) fail('RT dan RW harus berupa angka (1 sampai 3 digit).')
  const area = wilayah.resolveArea(String(b.provinceId ?? ''), String(b.cityId ?? ''), String(b.districtId ?? ''))
  if (area.error) fail(area.error)
  const phone = phoneOk(b.phone, 'Nomor telepon')
  if (!['dalam_negeri', 'luar_negeri'].includes(b.internshipPref)) fail('Pilih kesediaan penempatan magang.')
  if (b.groomingAgreed !== '1') fail('Anda harus menyatakan bersedia menjaga standar grooming Cimahi Hotel Institute.')
  if (!INFO_SOURCES.includes(b.infoSource)) fail('Pilih dari mana Anda mengetahui informasi pendaftaran.')
  const infoOther = b.infoSource === 'lainnya' ? text(b.infoSourceOther, 'Sumber informasi lainnya', 100) : null
  const [dupe] = await q('SELECT user_id FROM participant_profiles WHERE nik = ? AND user_id <> ? UNION SELECT id FROM users WHERE nik = ? AND id <> ?', [nik, u.id, nik, u.id])
  if (dupe) fail('NIK ini sudah terdaftar pada akun lain. Hubungi admin bila ini keliru.')
  // Hanya Super Admin yang boleh mengubah email peserta dari data diri.
  let newEmail = null
  if (byStaff && actor.role === 'super_admin' && b.email !== undefined) {
    const em = String(b.email).trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em) || em.length > 160) fail('Format email tidak valid.')
    if (em !== u.email) {
      const [used] = await q('SELECT id FROM users WHERE email = ? AND id <> ?', [em, u.id])
      if (used) fail('Email sudah dipakai akun lain.')
      newEmail = em
    }
  }
  const [old] = await q('SELECT * FROM participant_profiles WHERE user_id = ?', [u.id])
  await tx(async (c) => {
    await cq(c, `INSERT INTO participant_profiles (user_id, nik, birth_place, birth_date, gender, address, rt, rw, district_id, district, city_id, city, province_id, province, postal_code, education, occupation, school, internship_pref, grooming_agreed, info_source, info_source_other, completed_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE nik=VALUES(nik), birth_place=VALUES(birth_place), birth_date=VALUES(birth_date), gender=VALUES(gender), address=VALUES(address), rt=VALUES(rt), rw=VALUES(rw), district_id=VALUES(district_id), district=VALUES(district), city_id=VALUES(city_id), city=VALUES(city), province_id=VALUES(province_id), province=VALUES(province),
        postal_code=VALUES(postal_code), education=VALUES(education), occupation=VALUES(occupation),
        school=VALUES(school), internship_pref=VALUES(internship_pref), grooming_agreed=VALUES(grooming_agreed), info_source=VALUES(info_source), info_source_other=VALUES(info_source_other), completed_at=COALESCE(completed_at, VALUES(completed_at)), updated_at=CURRENT_TIMESTAMP`,
      [u.id, nik, text(b.birthPlace, 'Tempat lahir', 80), birthDate, b.gender, text(b.address, 'Alamat', 255), rt, rw, String(b.districtId), area.district, String(b.cityId), area.city, String(b.provinceId), area.province, String(b.postalCode).trim(),
        b.education, text(b.occupation, 'Pekerjaan', 80), text(b.school, 'Asal sekolah', 160), b.internshipPref, 1, b.infoSource, infoOther, dt()])
    await cq(c, 'UPDATE users SET name = ?, phone = ?, nik = ?, birth_date = ? WHERE id = ?', [fullName, phone, nik, birthDate, u.id]) // nama sesuai KTP dipakai di sertifikat
    if (newEmail) {
      await cq(c, 'UPDATE users SET email = ? WHERE id = ?', [newEmail, u.id])
      await audit(c, actor.id, 'user.email-ubah', 'users', `${u.email} -> ${newEmail}`)
    }
    await audit(c, actor.id, byStaff ? 'data-diri.ubah-admin' : old?.completed_at ? 'data-diri.ubah' : 'data-diri.lengkap', 'participant_profiles', u.email)
    if (!old?.completed_at) await afterProfileDone(c, u.id)
  })
}

app.post('/api/upload/profile', upload.none(), wrap(async (req, res) => {
  const u = needRole(req, ['peserta'])
  // Terkunci setelah registrasi ulang, kecuali peserta yang dibuat langsung oleh admin dan belum pernah mengisi data diri.
  const [locked] = await q("SELECT r.id FROM registrations r JOIN participant_profiles pp ON pp.user_id = r.user_id AND pp.completed_at IS NOT NULL WHERE r.user_id = ? AND r.stage = 'aktif' LIMIT 1", [u.id])
  if (locked) fail('Data diri terkunci setelah registrasi ulang. Hubungi admin pendaftaran untuk perubahan.', 403)
  await processProfile(u, req.body, u, false)
  res.json({ ok: true })
}))

// Admin pendaftaran mengoreksi data diri peserta kapan saja, termasuk setelah registrasi ulang.
app.post('/api/admin/profile/:userId', upload.none(), wrap(async (req, res) => {
  const actor = needRole(req, ['super_admin', 'admin_pendaftaran'])
  const [u] = await q("SELECT * FROM users WHERE id = ? AND role = 'peserta'", [req.params.userId])
  if (!u) fail('Peserta tidak ditemukan.', 404)
  await processProfile(u, req.body, actor, true)
  res.json({ ok: true })
}))

/** Berkas registrasi ulang. Hanya diunggah setelah registrasi ulang dikonfirmasi (tahap aktif). */
const DOC_IMG_PDF = ['image/jpeg', 'image/png', 'application/pdf']
const DOC_KINDS = { ktp: DOC_IMG_PDF, ijazah: DOC_IMG_PDF, foto: ['image/jpeg', 'image/png'], kk: DOC_IMG_PDF, buta_warna: DOC_IMG_PDF }
app.post('/api/upload/document/:kind', upload.single('file'), wrap(async (req, res) => {
  const u = needRole(req, ['peserta'])
  const allowed = DOC_KINDS[req.params.kind]
  if (!allowed) fail('Jenis berkas tidak dikenal.', 404)
  const [r] = await q("SELECT id FROM registrations WHERE user_id = ? AND stage = 'aktif' AND status IN ('active','completed') LIMIT 1", [u.id])
  if (!r) fail('Berkas diunggah setelah registrasi ulang Anda dikonfirmasi.', 403)
  if (!req.file) fail('Pilih berkas yang akan diunggah.')
  // Selama kelima berkas belum lengkap, peserta boleh mengganti berkasnya sendiri. Setelah lengkap, program terkunci dan penggantian lewat admin.
  if (await hasAllDocs(u.id)) fail('Kelima berkas sudah lengkap. Hubungi admin pendaftaran bila perlu diganti.', 403)
  const fileId = await saveUpload(req.file, { kind: 'document', ownerId: u.id, allowed })
  let oldStored = null
  await tx(async (c) => {
    const [old] = await cq(c, 'SELECT id, file_id FROM registration_documents WHERE user_id = ? AND kind = ? FOR UPDATE', [u.id, req.params.kind])
    if (old) {
      const [f] = await cq(c, 'SELECT stored_name FROM files WHERE id = ?', [old.file_id])
      oldStored = f?.stored_name ?? null
      await cq(c, 'UPDATE registration_documents SET file_id = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?', [fileId, old.id])
      await cq(c, 'DELETE FROM files WHERE id = ?', [old.file_id])
    } else {
      await cq(c, 'INSERT INTO registration_documents (id, user_id, kind, file_id) VALUES (?,?,?,?)', [uid(), u.id, req.params.kind, fileId])
    }
    await audit(c, u.id, old ? 'berkas.ganti' : 'berkas.unggah', 'registration_documents', req.params.kind)
  })
  if (oldStored) await fs.promises.unlink(path.join(UPLOAD_DIR, oldStored)).catch(() => {}) // berkas fisik lama dihapus setelah commit
  res.json({ ok: true })
}))

/** Data diri instruktur: pas foto, CV (mengganti yang lama), atau satu sertifikat pendukung (field label = nama sertifikat). */
app.post('/api/upload/staff/:which', upload.single('file'), wrap(async (req, res) => {
  const u = needRole(req, STAFF_PROFILE_ROLES)
  if (!req.file) fail('Pilih berkas yang akan diunggah.')
  await saveStaffFile(u, req.params.which, req.file, req.body?.label)
  res.json({ ok: true })
}))

/** Baca spreadsheet Google yang dibagikan publik sebagai CSV. Hanya docs.google.com, tautan dibentuk ulang dari id dan gid. */
app.post('/api/subjects/sheet', wrap(async (req, res) => {
  needRole(req, ['akademik', 'super_admin'])
  const m = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]{20,80})/.exec(String(req.body?.url ?? '').trim())
  if (!m) fail('Tempel tautan Google Sheets (https://docs.google.com/spreadsheets/d/...).')
  const gid = /[?#&]gid=(\d{1,12})/.exec(String(req.body.url))?.[1]
  const src = `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv${gid ? `&gid=${gid}` : ''}`
  let r
  try { r = await fetch(src, { signal: AbortSignal.timeout(15_000), redirect: 'follow' }) } catch { fail('Spreadsheet tidak bisa dijangkau. Coba lagi sebentar lagi.', 502) }
  const type = r.headers.get('content-type') ?? ''
  if (!r.ok || !type.includes('csv')) fail('Spreadsheet tidak bisa dibaca. Pastikan dibagikan dengan akses "Siapa saja yang memiliki link" (Pelihat).')
  const text = await r.text()
  if (text.length > 1_000_000) fail('Spreadsheet terlalu besar.')
  res.json({ ok: true, data: text })
}))

/* ---------- unduhan ---------- */
async function canReadFile(user, f) {
  if (f.kind === 'media') return true
  if (!user) return false
  const staff = user.role !== 'peserta'
  if (f.kind === 'proof') {
    if (['super_admin', 'admin_keuangan', 'admin_pendaftaran'].includes(user.role)) return true
    return f.owner_id === user.id
  }
  if (f.kind === 'document') return f.owner_id === user.id || ['super_admin', 'admin_pendaftaran', 'akademik'].includes(user.role)
  if (f.kind === 'profile') return f.owner_id === user.id || ['super_admin', 'admin_pendaftaran', 'akademik'].includes(user.role)
  if (f.kind === 'submission') return f.owner_id === user.id || ['super_admin', 'akademik', 'instruktur'].includes(user.role)
  // Berkas data diri instruktur: pemiliknya dan Super Admin (menu Akun pengelola).
  if (['staff_photo', 'staff_cv', 'staff_cert'].includes(f.kind)) return f.owner_id === user.id || user.role === 'super_admin'
  if (f.kind === 'signature') return ['super_admin', 'admin_pendaftaran'].includes(user.role)
  if (f.kind === 'material') {
    if (staff) return true
    const [m] = await q('SELECT batch_id FROM materials WHERE file_id = ?', [f.id])
    if (!m || !(await learningUnlocked(user.id))) return false
    const [r] = await q("SELECT id FROM registrations WHERE user_id = ? AND batch_id = ? AND status IN ('active','completed')", [user.id, m.batch_id])
    return !!r
  }
  return false
}
app.get('/api/files/:id', wrap(async (req, res) => {
  const [f] = await q('SELECT * FROM files WHERE id = ?', [req.params.id])
  if (!f || !(await canReadFile(req.user, f))) fail('Berkas tidak ditemukan.', 404)
  res.type(f.mime).set('Content-Disposition', `inline; filename="${f.original_name.replace(/[^\w.\-]/g, '_')}"`).set('X-Content-Type-Options', 'nosniff').sendFile(path.join(UPLOAD_DIR, f.stored_name))
}))
app.get('/api/media/:id', publicLimiter, wrap(async (req, res) => {
  const [f] = await q("SELECT * FROM files WHERE id = ? AND kind = 'media'", [req.params.id])
  if (!f) fail('Gambar tidak ditemukan.', 404)
  const file = req.query.w === 'sm' ? f.stored_name.replace(/\.webp$/, '.sm.webp') : f.stored_name
  res.set('Cache-Control', 'public, max-age=86400').type('image/webp').sendFile(path.join(UPLOAD_DIR, file))
}))

/** Pratinjau surat dengan data contoh, untuk memeriksa pengaturan surat. Didaftarkan sebelum rute :regId. */
app.get('/api/surat/preview/pdf', wrap(async (req, res) => {
  needRole(req, ['super_admin', 'admin_pendaftaran'])
  res.type('application/pdf').set('Content-Disposition', 'inline; filename="pratinjau-surat-kelulusan.pdf"')
  await renderLetterPreview(res)
}))
app.get('/api/surat/:regId/pdf', wrap(async (req, res) => {
  const u = needUser(req)
  const [r] = await q('SELECT user_id, admission_no FROM registrations WHERE id = ?', [req.params.regId])
  if (!r || !r.admission_no) fail('Surat belum tersedia.', 404)
  if (u.role === 'peserta' ? r.user_id !== u.id : u.role === 'instruktur') fail('Tidak berhak.', 403)
  res.type('application/pdf').set('Content-Disposition', 'inline; filename="surat-kelulusan.pdf"')
  await renderLetter(res, req.params.regId)
}))
/**
 * Biodata (template data diri) dalam PDF. Peserta didik: dirinya sendiri, Super Admin, Admin Pendaftaran, dan Akademik.
 * Instruktur/staf: dirinya sendiri dan Super Admin. Instruktur mendapat riwayat mengajar dari jadwal pembelajaran.
 */
app.get('/api/biodata/:userId/pdf', wrap(async (req, res) => {
  const u = needUser(req)
  const d = await biodataData(req.params.userId)
  if (!d) fail('Data tidak ditemukan.', 404)
  const self = d.u.id === u.id
  const allowed = self || u.role === 'super_admin' || (d.kind === 'peserta' && ['admin_pendaftaran', 'akademik'].includes(u.role))
  if (!allowed) fail('Anda tidak berhak mengunduh biodata ini.', 403)
  const slug = d.u.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'biodata'
  res.type('application/pdf').set('Content-Disposition', `${req.query.dl ? 'attachment' : 'inline'}; filename="biodata-${slug}.pdf"`)
  biodataPdf(res, d, self ? '' : u.name)
}))
app.get('/api/transcripts/:regId/pdf', wrap(async (req, res) => {
  const u = needUser(req)
  const [r] = await q('SELECT user_id, status FROM registrations WHERE id = ?', [req.params.regId])
  if (!r) fail('Data tidak ditemukan.', 404)
  if (r.user_id !== u.id && !['akademik', 'super_admin'].includes(u.role)) fail('Anda tidak berhak mengunduh transkrip ini.', 403)
  // Peserta mengunduh transkrip setelah kelulusannya sempurna (nilai lulus dan seluruh pembayaran lunas). Akademik dan super admin tetap bisa.
  const [g] = await q("SELECT passed FROM grades WHERE registration_id = ? AND status = 'validated'", [req.params.regId])
  if (r.user_id === u.id && g?.passed && r.status !== 'completed') fail('Transkrip tersedia setelah seluruh pembayaran lunas dan nilai magang diinput Akademik.', 403)
  res.type('application/pdf').set('Content-Disposition', 'inline; filename="transkrip.pdf"')
  if (!(await transcriptPdf(res, req.params.regId))) { res.removeHeader('Content-Disposition'); fail('Transkrip tersedia setelah nilai divalidasi.', 404) }
}))
/** Transkrip akhir pelatihan (nilai mata pelatihan + magang) dalam Word sesuai template. Pemilik, Akademik, dan Super Admin. */
app.get('/api/transkrip-akhir/:regId.docx', wrap(async (req, res) => {
  const u = needUser(req)
  if (u.role === 'peserta') fail('Transkrip Word hanya untuk Akademik. Peserta mengunduh PDF di menu Transkrip akhir.', 403)
  const data = await transkripData(u, req.params.regId)
  const name = `transkrip-akhir-${data.name}`.replace(/[^\w.-]+/g, '-').slice(0, 100)
  res.set('Cache-Control', 'no-store')
  res.type('application/vnd.openxmlformats-officedocument.wordprocessingml.document').set('Content-Disposition', `attachment; filename="${name}.docx"`).send(transkripDocx(data))
}))
/** Transkrip akhir pelatihan dalam PDF dengan watermark DRAFT. Pemilik, Akademik, dan Super Admin. */
app.get('/api/transkrip-akhir/:regId.pdf', wrap(async (req, res) => {
  const u = needUser(req)
  const data = await transkripData(u, req.params.regId)
  const name = `transkrip-akhir-draft-${data.name}`.replace(/[^w.-]+/g, '-').slice(0, 100)
  res.set('Cache-Control', 'no-store')
  res.type('application/pdf').set('Content-Disposition', `inline; filename="${name}.pdf"`)
  transkripPdf(res, data)
}))
/** Logbook magang dalam Word sesuai template: satu halaman per minggu. Pemilik penempatan, Akademik, dan Super Admin. */
app.get('/api/logbook/:placementId.docx', wrap(async (req, res) => {
  const u = needUser(req)
  const data = await logbookData(u, req.params.placementId)
  const { buffer } = logbookDocx(data)
  const name = `logbook-magang-${data.name}`.replace(/[^\w.-]+/g, '-').slice(0, 100)
  res.set('Cache-Control', 'no-store')
  res.type('application/vnd.openxmlformats-officedocument.wordprocessingml.document').set('Content-Disposition', `attachment; filename="${name}.docx"`).send(buffer)
}))
/** Berita acara perkuliahan (log book pelatihan) satu mata pelajaran di satu angkatan, sesuai template LPK. Format docx atau pdf. */
app.get('/api/berita-acara/:batchId/:subjectId.:fmt', wrap(async (req, res) => {
  const u = needRole(req, ['super_admin', 'akademik', 'instruktur'])
  if (!['docx', 'pdf'].includes(req.params.fmt)) fail('Format tidak dikenal.', 404)
  const data = await beritaAcaraData(u, req.params.batchId, req.params.subjectId)
  const name = `berita-acara-${data.batchCode}-${data.subjectName}`.replace(/[^\w.-]+/g, '-').slice(0, 100)
  res.set('Cache-Control', 'no-store')
  if (req.params.fmt === 'docx') {
    res.type('application/vnd.openxmlformats-officedocument.wordprocessingml.document').set('Content-Disposition', `attachment; filename="${name}.docx"`).send(beritaAcaraDocx(data))
  } else {
    res.type('application/pdf').set('Content-Disposition', `inline; filename="${name}.pdf"`)
    beritaAcaraPdf(res, data)
  }
}))
/**
 * Cek status peserta publik berdasarkan NIP. Hanya data minimum yang dikembalikan (nama, program, angkatan, status);
 * tanpa NIK, kontak, alamat, nilai, atau pembayaran. NIP berurutan, jadi batas permintaannya lebih ketat dari endpoint publik lain.
 */
const statusLimiter = rateLimit({ windowMs: 10 * 60_000, limit: 30, standardHeaders: true, message: { ok: false, error: 'Terlalu banyak pencarian. Coba lagi beberapa menit lagi.' } })
const STATUS_LABEL = { aktif: 'Aktif mengikuti pelatihan', menunggu_pelunasan: 'Lulus pelatihan, menunggu pelunasan pembayaran dan nilai magang', lulus: 'Lulus', tidak_lulus: 'Tidak lulus', selesai: 'Selesai pelatihan', mundur: 'Mengundurkan diri', proses: 'Dalam proses penerimaan', tidak_aktif: 'Tidak aktif' }
app.get('/api/status-peserta', statusLimiter, wrap(async (req, res) => {
  const nip = String(req.query.nip ?? '').trim()
  if (!/^[0-9A-Za-z./-]{1,12}$/.test(nip)) fail('Masukkan NIP yang valid (maksimal 12 karakter).')
  const [r] = await q(`SELECT r.status, r.stage, r.nip, r.cancelled_reason, u.name, p.title program, b.code batch, b.start_date, b.end_date, g.status grade_status, g.passed
    FROM registrations r JOIN users u ON u.id = r.user_id JOIN programs p ON p.id = r.program_id
    LEFT JOIN batches b ON b.id = r.batch_id LEFT JOIN grades g ON g.registration_id = r.id
    WHERE r.nip = ? AND u.role = 'peserta'`, [nip])
  if (!r) return res.json({ ok: true, found: false })
  const status = r.status === 'cancelled' || (r.status === 'expired' && r.cancelled_reason === AUTO_WITHDRAW_REASON) ? 'mundur'
    : r.status === 'expired' ? 'tidak_aktif'
    : r.grade_status === 'validated' ? (r.passed ? (r.status === 'completed' ? 'lulus' : 'menunggu_pelunasan') : 'tidak_lulus')
    : r.status === 'completed' ? 'selesai'
    : r.stage === 'aktif' && r.status === 'active' ? 'aktif'
    : 'proses'
  res.json({ ok: true, found: true, nip: r.nip, name: r.name, program: r.program, batch: r.batch ?? null, startDate: r.start_date ?? null, endDate: r.end_date ?? null, status, statusLabel: STATUS_LABEL[status] })
}))

// Data wilayah publik (provinsi, kota/kabupaten, kecamatan) untuk formulir alamat. Berubah sangat jarang, jadi boleh di-cache.
const cacheDay = (res) => res.set('Cache-Control', 'public, max-age=86400')
app.get('/api/wilayah/provinces', publicLimiter, (_req, res) => { cacheDay(res); res.json(wilayah.provinces()) })
app.get('/api/wilayah/regencies/:id', publicLimiter, (req, res) => {
  if (!/^\d{2}$/.test(req.params.id)) fail('Kode provinsi tidak valid.')
  cacheDay(res); res.json(wilayah.regencies(req.params.id))
})
app.get('/api/wilayah/districts/:id', publicLimiter, (req, res) => {
  if (!/^\d{4}$/.test(req.params.id)) fail('Kode kota atau kabupaten tidak valid.')
  cacheDay(res); res.json(wilayah.districts(req.params.id))
})

app.get('/api/health', wrap(async (_req, res) => { await q('SELECT 1'); res.json({ ok: true }) }))

/* ---------- frontend di port yang sama dengan API ---------- */
// Pengembangan: Vite berjalan sebagai middleware (hot reload tetap jalan). Produksi: sajikan hasil build di ../dist.
const server = http.createServer(app)
const frontendRoot = path.resolve('..')
if (!IS_PROD) {
  const { createServer } = await import('vite')
  // configLoader 'runner' memuat vite.config.ts di memori; mode bawaan menulis file sementara yang memicu restart berulang oleh node --watch.
  const vite = await createServer({ root: frontendRoot, appType: 'spa', configLoader: 'runner', server: { middlewareMode: true, ws: { server } } })
  app.use((req, res, next) => (req.path.startsWith('/api') ? next() : vite.middlewares(req, res, next)))
} else {
  const dist = path.join(frontendRoot, 'dist')
  if (!fs.existsSync(dist)) throw new Error('Folder dist belum ada. Jalankan "npm run build" di folder chi-sim terlebih dahulu.')
  app.use(express.static(dist, {
    setHeaders: (res, file) => {
      // Service worker dan manifest harus selalu segar agar pembaruan aplikasi sampai ke peserta.
      if (/[\\/](sw\.js|manifest\.webmanifest)$/.test(file)) res.setHeader('Cache-Control', 'no-cache')
      if (file.endsWith('.webmanifest')) res.setHeader('Content-Type', 'application/manifest+json')
    },
  }))
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')))
}

app.use((err, _req, res, _next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ ok: false, error: err.message })
  if (err?.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ ok: false, error: 'Ukuran berkas maksimal 2 MB.' })
  if (err?.code === 'ER_DUP_ENTRY') return res.status(409).json({ ok: false, error: 'Data dengan nilai yang sama sudah ada.' })
  console.error(err)
  res.status(500).json({ ok: false, error: 'Terjadi kesalahan di server.' })
})

await migrate() // kolom baru untuk database yang sudah berjalan
const port = +(process.env.PORT || 4000)
server.listen(port, () => console.log(`Aplikasi dan API siap di http://localhost:${port}`))
setInterval(() => processQueue().catch(console.error), 60_000)
setInterval(() => expireOverdue().catch(console.error), 10 * 60_000)
expireOverdue().catch(console.error)
void getSettings
