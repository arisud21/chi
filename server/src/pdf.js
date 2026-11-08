import fs from 'node:fs'
import path from 'node:path'
import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'
import { UPLOAD_DIR, getSettings, q } from './lib.js'

export const DEFAULT_CONFIG = {
  fields: {
    institution: { x: 50, y: 11, size: 13, color: '#976d27', align: 'center' },
    title: { x: 50, y: 19, size: 34, color: '#1c2a2b', align: 'center' },
    number: { x: 50, y: 30, size: 11, color: '#5b6b6c', align: 'center' },
    intro: { x: 50, y: 40, size: 12, color: '#5b6b6c', align: 'center' },
    name: { x: 50, y: 47, size: 34, color: '#0d4d4a', align: 'center' },
    desc: { x: 50, y: 61, size: 13, color: '#1c2a2b', align: 'center' },
    date: { x: 8, y: 80, size: 11, color: '#1c2a2b', align: 'left' },
    signerTitle: { x: 50, y: 76, size: 11, color: '#1c2a2b', align: 'center' },
    signerName: { x: 50, y: 88, size: 12, color: '#1c2a2b', align: 'center' },
    code: { x: 92, y: 93, size: 9, color: '#5b6b6c', align: 'right' },
  },
  qr: { x: 86, y: 70, size: 64 },
  signature: { x: 50, y: 79, size: 90 },
}

const W = 842, H = 595 // A4 landscape

async function loadCertData(certId) {
  const [c] = await q(`SELECT c.*, r.user_id, r.batch_id FROM certificates c JOIN registrations r ON r.id = c.registration_id WHERE c.id = ?`, [certId])
  if (!c) return null
  const [u] = await q('SELECT name FROM users WHERE id = ?', [c.user_id])
  const [b] = await q('SELECT program_id, code FROM batches WHERE id = ?', [c.batch_id])
  const [p] = await q('SELECT title, duration_hours FROM programs WHERE id = ?', [b.program_id])
  const [t] = await q(c.template_id ? 'SELECT * FROM certificate_templates WHERE id = ?' : 'SELECT * FROM certificate_templates WHERE is_active = 1 LIMIT 1', c.template_id ? [c.template_id] : [])
  return { c, user: u, program: p, template: t, settings: await getSettings() }
}

async function fileOf(id) {
  if (!id) return null
  const [f] = await q('SELECT stored_name FROM files WHERE id = ?', [id])
  return f ? path.join(UPLOAD_DIR, f.stored_name) : null
}

const dateID = (d) => new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })

/** Gambar sertifikat ke dokumen pdfkit. Dipakai oleh penerbitan, unduhan, dan pratinjau template. */
export async function drawCertificate(doc, { cert, name, program, settings, config, bgPath, sigPath, verifyUrl }) {
  const cfg = { ...DEFAULT_CONFIG, ...config, fields: { ...DEFAULT_CONFIG.fields, ...(config?.fields ?? {}) } }
  if (bgPath) doc.image(bgPath, 0, 0, { width: W, height: H })
  else {
    doc.lineWidth(6).strokeColor('#b8893b').rect(18, 18, W - 36, H - 36).stroke()
    doc.lineWidth(1).strokeColor('#b8893b').rect(28, 28, W - 56, H - 56).stroke()
  }
  const text = {
    institution: (settings.name ?? 'Cimahi Institute Hotel').toUpperCase(),
    title: 'Sertifikat Pelatihan',
    number: cert.number,
    intro: 'diberikan kepada',
    name,
    desc: `atas keberhasilan menyelesaikan program ${program.title} (${program.duration_hours} jam)`,
    date: `Diterbitkan ${dateID(cert.issued_at)}`,
    signerTitle: settings.signerTitle ?? '',
    signerName: settings.signerName ?? '',
    code: `Kode verifikasi: ${cert.verification_code}`,
  }
  for (const [k, f] of Object.entries(cfg.fields)) {
    if (!text[k]) continue
    const bold = ['title', 'name', 'institution'].includes(k)
    doc.font(bold ? 'Times-Bold' : 'Helvetica').fontSize(f.size).fillColor(f.color)
    const bw = W * 0.7
    const px = (f.x / 100) * W, py = (f.y / 100) * H
    const x = f.align === 'center' ? px - bw / 2 : f.align === 'right' ? px - bw : px
    doc.text(text[k], x, py, { width: bw, align: f.align })
  }
  if (sigPath) doc.image(sigPath, (cfg.signature.x / 100) * W - cfg.signature.size / 2, (cfg.signature.y / 100) * H - 20, { width: cfg.signature.size })
  const qr = await QRCode.toBuffer(verifyUrl, { margin: 0, width: 256 })
  doc.image(qr, (cfg.qr.x / 100) * W - cfg.qr.size / 2, (cfg.qr.y / 100) * H, { width: cfg.qr.size })
}

export async function renderCertificatePdf(certId) {
  const d = await loadCertData(certId)
  if (!d) return
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0 })
  const out = fs.createWriteStream(path.join(UPLOAD_DIR, `cert-${d.c.id}.pdf`))
  doc.pipe(out)
  await drawCertificate(doc, {
    cert: d.c, name: d.user.name, program: d.program, settings: d.settings,
    config: d.template ? JSON.parse(d.template.config) : DEFAULT_CONFIG,
    bgPath: await fileOf(d.template?.background_file_id), sigPath: await fileOf(d.template?.signature_file_id),
    verifyUrl: `${process.env.APP_URL || 'http://localhost:5173'}/verifikasi/${d.c.verification_code}`,
  })
  doc.end()
  await new Promise((res) => out.on('finish', res))
}

export const certificatePath = (id) => path.join(UPLOAD_DIR, `cert-${id}.pdf`)

export async function previewPdf(res, templateId) {
  const [t] = await q('SELECT * FROM certificate_templates WHERE id = ?', [templateId])
  if (!t) return false
  const settings = await getSettings()
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0 })
  doc.pipe(res)
  await drawCertificate(doc, {
    cert: { number: 'CERT/CIH/2026/0001', issued_at: new Date(), verification_code: 'CONTOH0000' },
    name: 'Nama Peserta Contoh', program: { title: 'Nama Program Contoh', duration_hours: 80 }, settings,
    config: JSON.parse(t.config), bgPath: await fileOf(t.background_file_id), sigPath: await fileOf(t.signature_file_id),
    verifyUrl: `${process.env.APP_URL || 'http://localhost:5173'}/verifikasi/CONTOH0000`,
  })
  doc.end()
  return true
}

export async function transcriptPdf(res, regId) {
  const [r] = await q('SELECT r.*, u.name, b.code bcode, b.program_id FROM registrations r JOIN users u ON u.id = r.user_id JOIN batches b ON b.id = r.batch_id WHERE r.id = ?', [regId])
  const [g] = await q("SELECT * FROM grades WHERE registration_id = ? AND status = 'validated'", [regId])
  if (!r || !g) return false
  const [p] = await q('SELECT * FROM programs WHERE id = ?', [r.program_id])
  const settings = await getSettings()
  const fin = Math.round(((Number(g.theory) * p.theory_weight + Number(g.practical) * p.practical_weight) / (p.theory_weight + p.practical_weight)) * 10) / 10
  const doc = new PDFDocument({ size: 'A4', margin: 56 })
  doc.pipe(res)
  doc.font('Times-Bold').fontSize(20).text(settings.name ?? 'Cimahi Institute Hotel', { align: 'center' })
  doc.font('Helvetica').fontSize(12).fillColor('#5b6b6c').text('Transkrip Nilai Pelatihan', { align: 'center' }).moveDown(2)
  doc.fillColor('#1c2a2b')
  const row = (k, v) => { doc.font('Helvetica').fontSize(11).text(k, 56, doc.y, { continued: true, width: 180 }).font('Helvetica-Bold').text(String(v), 240); doc.moveDown(0.4) }
  row('Nama', r.name); row('Program', p.title); row('Angkatan', r.bcode); row('Durasi', `${p.duration_hours} jam`)
  doc.moveDown()
  row(`Nilai teori (bobot ${p.theory_weight}%)`, Number(g.theory)); row(`Nilai praktik (bobot ${p.practical_weight}%)`, Number(g.practical))
  row('Kehadiran', `${Number(g.attendance_pct)}% (minimal ${p.min_attendance}%)`); row('Nilai akhir', `${fin} (batas lulus ${p.passing_score})`)
  row('Hasil', g.passed ? 'LULUS' : 'TIDAK LULUS')
  doc.moveDown(2).font('Helvetica').fontSize(9).fillColor('#5b6b6c').text(`Dibuat otomatis oleh sistem pada ${dateID(new Date())}.`)
  doc.end()
  return true
}
