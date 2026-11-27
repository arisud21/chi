import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import mysql from 'mysql2/promise'

export const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: +(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'cih_sim',
  connectionLimit: 10,
  timezone: 'Z',
  dateStrings: ['DATE'],
  charset: 'utf8mb4',
})

// Semua kolom waktu disimpan UTC. Tanpa ini DEFAULT CURRENT_TIMESTAMP memakai zona server dan bergeser dari nilai yang dikirim aplikasi.
pool.pool.on('connection', (conn) => conn.query("SET time_zone = '+00:00'"))

export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || './uploads')
fs.mkdirSync(UPLOAD_DIR, { recursive: true })

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status }
}
export const fail = (message, status = 400) => { throw new HttpError(status, message) }

export const uid = () => crypto.randomUUID()
export const iso = (d) => (d ? new Date(d).toISOString() : null)
/** Waktu untuk kolom DATETIME (UTC). */
export const dt = (d = new Date()) => new Date(d)

export async function q(sql, params = []) {
  const [rows] = await pool.query(sql, params)
  return rows
}

/** Jalankan fungsi di dalam satu transaksi. Semua efek verifikasi bayar, status, audit, dan email atomik (PRD T24). */
export async function tx(fn) {
  const conn = await pool.getConnection()
  const after = []
  let out
  try {
    await conn.beginTransaction()
    conn.__after = after
    out = await fn(conn)
    await conn.commit()
  } catch (e) {
    await conn.rollback()
    throw e
  } finally {
    conn.__after = null
    conn.release()
  }
  for (const f of after) { try { f() } catch (e) { console.error(e) } } // setelah commit, supaya klien yang diberi tahu langsung melihat datanya
  return out
}
/** Jalankan fn setelah transaksi berhasil commit. Di luar transaksi, dijalankan sebentar lagi. */
export const onCommit = (conn, fn) => { if (conn?.__after) conn.__after.push(fn); else setTimeout(fn, 250) }
export const cq = async (conn, sql, params = []) => (await conn.query(sql, params))[0]

export const audit = (conn, userId, action, entity, detail = '') =>
  cq(conn, 'INSERT INTO audit_logs (user_id, action, entity, detail) VALUES (?,?,?,?)', [userId, action, entity, String(detail).slice(0, 500)])

export const mail = (conn, to, subject, body = '') =>
  cq(conn, 'INSERT INTO email_queue (to_email, subject, body) VALUES (?,?,?)', [to, subject, body])

export async function getSettings(conn) {
  const rows = await (conn ? cq(conn, 'SELECT k, v FROM settings') : q('SELECT k, v FROM settings'))
  const s = rows.find((r) => r.k === 'site')
  return s ? JSON.parse(s.v) : {}
}

export const ROLES_STAFF = ['super_admin', 'admin_pendaftaran', 'admin_keuangan', 'akademik', 'instruktur']

/** Validasi tipe berkas dari magic bytes, bukan dari ekstensi atau header klien (PRD T20). */
export function sniffMime(buf) {
  if (buf.length < 12) return null
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'image/webp'
  if (buf.subarray(0, 5).toString() === '%PDF-') return 'application/pdf'
  return null
}

export async function saveUpload(file, { kind, ownerId, allowed, alt }) {
  if (!file) fail('Berkas wajib diunggah.')
  const mime = sniffMime(file.buffer)
  if (!mime || !allowed.includes(mime)) fail('Format berkas tidak diizinkan.')
  if (file.size > 2 * 1024 * 1024) fail('Ukuran berkas maksimal 2 MB.')
  const id = uid()
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' }[mime]
  const stored = `${crypto.randomBytes(16).toString('hex')}.${ext}`
  await fs.promises.writeFile(path.join(UPLOAD_DIR, stored), file.buffer)
  await q('INSERT INTO files (id, kind, original_name, stored_name, mime, size, owner_id, alt_text) VALUES (?,?,?,?,?,?,?,?)',
    [id, kind, file.originalname.slice(0, 200), stored, mime, file.size, ownerId ?? null, alt ?? null])
  return id
}

export const randomCode = (n) => Array.from(crypto.randomBytes(n), (b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('')

/** Batas usia pendaftar (tahun), dipakai daftar sendiri dan pendaftar yang ditambahkan admin. */
export const MAX_AGE = 30
/** Usia penuh (tahun) pada hari ini, atau null bila tanggal tidak valid atau di masa depan. */
export const ageOn = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return null
  const [y, mo, d] = [+m[1], +m[2], +m[3]]
  const t = new Date(Date.UTC(y, mo - 1, d))
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null
  const n = new Date()
  let a = n.getUTCFullYear() - y
  if (n.getUTCMonth() + 1 < mo || (n.getUTCMonth() + 1 === mo && n.getUTCDate() < d)) a--
  return a < 0 ? null : a
}

/** Alasan baku pendaftar yang dinyatakan mundur otomatis oleh sistem (status expired). Hanya yang beralasan ini yang boleh melanjutkan sendiri. */
export const AUTO_WITHDRAW_DAYS = 14
export const AUTO_WITHDRAW_REASON = 'Mengundurkan diri otomatis: tidak melanjutkan proses pendaftaran atau registrasi selama 2 minggu'
