import PDFDocument from 'pdfkit'
import { getSettings, q } from './lib.js'
import { subjectResults } from './admission.js'

const dateID = (d) => new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })

export async function transcriptPdf(res, regId) {
  const [r] = await q('SELECT r.*, u.name, b.code bcode, b.program_id FROM registrations r JOIN users u ON u.id = r.user_id JOIN batches b ON b.id = r.batch_id WHERE r.id = ?', [regId])
  const [g] = await q("SELECT * FROM grades WHERE registration_id = ? AND status = 'validated'", [regId])
  if (!r || !g) return false
  const [p] = await q('SELECT * FROM programs WHERE id = ?', [r.program_id])
  const settings = await getSettings()
  // Nilai akhir dihitung dari bobot per mata pelajaran yang ditetapkan Akademik; data lama tanpa itu memakai rata-rata teori dan praktik.
  const fin = g.final_score != null ? Number(g.final_score) : Math.round(((Number(g.theory) + Number(g.practical)) / 2) * 10) / 10
  const subs = await subjectResults(null, r.batch_id, regId)
  const doc = new PDFDocument({ size: 'A4', margin: 56 })
  doc.pipe(res)
  doc.font('Times-Bold').fontSize(20).text(settings.name ?? 'Cimahi Hotel Institute', { align: 'center' })
  doc.font('Helvetica').fontSize(12).fillColor('#5a6b82').text('Transkrip Nilai Pelatihan', { align: 'center' }).moveDown(2)
  doc.fillColor('#1d2a3d')
  const row = (k, v) => { doc.font('Helvetica').fontSize(11).text(k, 56, doc.y, { continued: true, width: 180 }).font('Helvetica-Bold').text(String(v), 240); doc.moveDown(0.4) }
  row('Nama', r.name); row('Program', p.title); row('Angkatan', r.bcode); row('Durasi', `${p.duration_hours} jam`)
  doc.moveDown()
  if (subs.length) {
    // Nilai tiap mata pelajaran yang sudah divalidasi Akademik.
    const cols = [56, 270, 320, 370, 420, 470, 510]
    const head = ['Mata pelajaran', 'Absensi', 'Tugas', 'Teori', 'Praktik', 'Nilai', 'Huruf']
    doc.font('Helvetica-Bold').fontSize(9)
    const y0 = doc.y
    head.forEach((h, i) => doc.text(h, cols[i], y0, { width: i ? 48 : 205 }))
    doc.moveTo(56, y0 + 13).lineTo(540, y0 + 13).strokeColor('#c9d2de').stroke(); doc.y = y0 + 18
    doc.font('Helvetica').fontSize(9)
    for (const x of subs) {
      const y = doc.y
      const cells = [x.name, x.absensi + '%', x.w.tugas ? x.tugas : '-', x.w.teori ? x.teori : '-', x.w.praktik ? x.praktik : '-', x.akhir, x.huruf]
      cells.forEach((c, i) => doc.text(String(c), cols[i], y, { width: i ? 48 : 205 }))
      doc.y = Math.max(doc.y, y + 14)
    }
    doc.moveDown()
  } else { row('Nilai teori', Number(g.theory)); row('Nilai praktik', Number(g.practical)) }
  row('Kehadiran', `${Number(g.attendance_pct)}% (minimal ${p.min_attendance}%)`); row('Nilai akhir', `${fin} (batas lulus ${p.passing_score})`)
  row('Hasil', g.passed ? 'LULUS' : 'TIDAK LULUS')
  doc.moveDown(2).font('Helvetica').fontSize(9).fillColor('#5a6b82').text(`Dibuat otomatis oleh sistem pada ${dateID(new Date())}.`)
  doc.end()
  return true
}
