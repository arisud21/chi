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
  try {
    await conn.beginTransaction()
    const out = await fn(conn)
    await conn.commit()
    return out
  } catch (e) {
    await conn.rollback()
    throw e
  } finally {
    conn.release()
  }
}
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
