import nodemailer from 'nodemailer'
import { dt, q } from './lib.js'

const transport = process.env.SMTP_HOST
  ? nodemailer.createTransport({ host: process.env.SMTP_HOST, port: +(process.env.SMTP_PORT || 587), auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined })
  : null

const BACKOFF_MIN = [1, 5, 30]
const PER_TICK = 20 // batas kirim per menit (EML-4)

/** Worker antrean email (EML-1): retry bertahap 1, 5, 30 menit. Tanpa SMTP_HOST email hanya dicatat. */
export async function processQueue() {
  const items = await q("SELECT * FROM email_queue WHERE status = 'queued' AND next_attempt_at <= ? ORDER BY id LIMIT ?", [dt(), PER_TICK])
  for (const m of items) {
    try {
      if (transport) await transport.sendMail({ from: process.env.SMTP_FROM, to: m.to_email, subject: m.subject, text: m.body ?? '' })
      else console.log(`[email-dev] ke=${m.to_email} subjek="${m.subject}"`)
      await q("UPDATE email_queue SET status = 'sent', sent_at = ?, attempts = attempts + 1, error = ? WHERE id = ?", [dt(), transport ? null : 'mode dev: tidak dikirim', m.id])
    } catch (e) {
      const attempts = m.attempts + 1
      if (attempts > BACKOFF_MIN.length) await q("UPDATE email_queue SET status = 'failed', attempts = ?, error = ? WHERE id = ?", [attempts, String(e.message).slice(0, 250), m.id])
      else await q('UPDATE email_queue SET attempts = ?, next_attempt_at = ?, error = ? WHERE id = ?', [attempts, new Date(Date.now() + BACKOFF_MIN[attempts - 1] * 60_000), String(e.message).slice(0, 250), m.id])
    }
  }
  return items.length
}
