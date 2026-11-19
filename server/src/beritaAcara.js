// Berita acara perkuliahan (Log Book Pelatihan Kerja) per mata pelajaran per angkatan.
// Word: memakai template LPK (kop, logo, ukuran halaman, catatan) lalu isi tabelnya diganti data nyata.
// PDF: digambar ulang dengan pdfkit mengikuti tata letak template yang sama.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import PDFDocument from 'pdfkit'
import { fail, getSettings, q } from './lib.js'

const ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../assets')
const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
const hm = (t) => (t ? String(t).slice(0, 5) : '')
const pad = (n) => String(n).padStart(2, '0')

/** Kumpulkan data satu berita acara. Instruktur hanya untuk mata pelajaran yang ia ampu. */
export async function beritaAcaraData(user, batchId, subjectId) {
  const [b] = await q('SELECT b.*, p.title program FROM batches b JOIN programs p ON p.id = b.program_id WHERE b.id = ?', [batchId])
  if (!b) fail('Angkatan tidak ditemukan.', 404)
  const [bs] = await q('SELECT bs.*, sj.name, sj.code, sj.hours_per_meeting FROM batch_subjects bs JOIN subjects sj ON sj.id = bs.subject_id WHERE bs.batch_id = ? AND bs.subject_id = ?', [batchId, subjectId])
  if (!bs) fail('Mata pelajaran ini tidak ada di jadwal angkatan tersebut.', 404)
  const teacherId = bs.instructor_id
  if (user.role === 'instruktur' && teacherId !== user.id) fail('Anda tidak mengampu mata pelajaran ini.', 403)
  const [teacher] = teacherId ? await q('SELECT name FROM users WHERE id = ?', [teacherId]) : []
  const sessions = await q('SELECT id, title, start_at FROM class_sessions WHERE batch_id = ? AND subject_id = ? ORDER BY start_at', [batchId, subjectId])
  const att = sessions.length ? await q('SELECT session_id, status FROM attendances WHERE session_id IN (?)', [sessions.map((s) => s.id)]) : []
  const rows = sessions.map((s) => {
    const a = att.filter((x) => x.session_id === s.id)
    const hadir = a.filter((x) => x.status === 'hadir').length
    const wib = new Date(new Date(s.start_at).getTime() + 7 * 3_600_000) // tanggal kelas dalam WIB
    return {
      day: DAY_NAMES[wib.getUTCDay()], date: `${pad(wib.getUTCDate())}/${pad(wib.getUTCMonth() + 1)}/${wib.getUTCFullYear()}`,
      title: s.title, recorded: a.length > 0, hadir, absen: a.length - hadir,
    }
  })
  const year = String(b.start_date).slice(0, 4)
  return {
    batchCode: b.code, program: b.program, subjectName: bs.name, subject: bs.code ? `${bs.code} / ${bs.name}` : bs.name,
    instructor: teacher?.name ?? '', angkatan: `${year}${b.angkatan ? ` / Angkatan ${b.angkatan}` : ''} (${b.code})`,
    jp: bs.hours_per_meeting ? String(bs.hours_per_meeting) : '….', time: bs.start_time ? `${hm(bs.start_time)} - ${hm(bs.end_time)}` : '', room: bs.room || b.location || '',
    planned: Number(bs.sessions_planned) || 0, rows, settings: await getSettings(),
  }
}

/** Baris tabel: pertemuan yang sudah ada, ditambah baris kosong sampai jatah pertemuan agar bisa diisi manual. */
function tableRows(d) {
  const total = Math.max(d.planned, d.rows.length)
  const list = []
  for (let i = 0; i < total; i++) {
    const r = d.rows[i]
    list.push(r ? {
      no: String(i + 1), date: [`${r.day},`, r.date], dur: [`${d.jp} JP`, d.time].filter(Boolean), materi: [r.title],
      hadir: r.recorded ? [`Hadir : ${r.hadir}`, `Tidak Hadir : ${r.absen}`] : ['Hadir : _____', 'Tidak Hadir : _____'],
    } : {
      no: String(i + 1), date: ['___________,', '___/___/20___'], dur: [`${d.jp} JP`], materi: [''], hadir: ['Hadir : _____', 'Tidak Hadir : _____'],
    })
  }
  return list
}
const EXAM = (n) => ({
  no: String(n), date: ['___________,', '___/___/20___'], dur: ['___________', 's.d.', '___________'],
  materi: ['UJIAN TULIS', 'Jumlah Peserta Didik yang hadir : _____', 'Jumlah Peserta Didik yang tidak hadir : _____'],
  hadir: ['Hadir : _____', 'Tidak Hadir : _____'], paraf: 'PARAF PENGAWAS',
})

/* ---------------- Word ---------------- */
const esc = (v) => String(v ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c])
const rpr = (bold) => `<w:rPr><w:rFonts w:ascii="Cambria" w:hAnsi="Cambria"/>${bold ? '<w:b/><w:bCs/>' : ''}<w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>`
const para = (text, { bold = false, center = false } = {}) =>
  `<w:p><w:pPr><w:spacing w:before="20" w:after="20"/>${center ? '<w:jc w:val="center"/>' : ''}${rpr(bold)}</w:pPr>${text ? `<w:r>${rpr(bold)}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>` : ''}</w:p>`
const cell = (w, lines, opt = {}) =>
  `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${opt.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${opt.fill}"/>` : ''}<w:tcMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tcMar><w:vAlign w:val="center"/></w:tcPr>${(lines.length ? lines : ['']).map((l, i) => para(l, { ...opt, bold: opt.bold || (opt.boldFirst && i === 0) })).join('')}</w:tc>`

const INFO_W = [2269, 269, 6774, 1845, 269, 3839]
const GRID_W = [616, 1718, 1455, 7112, 1777, 2490]

function infoTable(d) {
  const row = (a, b, c2, d2) => `<w:tr><w:trPr><w:trHeight w:val="283"/></w:trPr>${[a, ':', b, c2, c2 ? ':' : '', d2].map((t, i) => cell(INFO_W[i], [t])).join('')}</w:tr>`
  const none = '<w:top w:val="none" w:sz="0" w:space="0" w:color="auto"/><w:left w:val="none" w:sz="0" w:space="0" w:color="auto"/><w:bottom w:val="none" w:sz="0" w:space="0" w:color="auto"/><w:right w:val="none" w:sz="0" w:space="0" w:color="auto"/><w:insideH w:val="none" w:sz="0" w:space="0" w:color="auto"/><w:insideV w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
  return `<w:tbl><w:tblPr><w:tblW w:w="15265" w:type="dxa"/><w:tblInd w:w="-147" w:type="dxa"/><w:tblBorders>${none}</w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr>`
    + `<w:tblGrid>${INFO_W.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`
    + row('Kode / Mata Pelatihan', d.subject, 'Program Keahlian', d.program)
    + row('Instruktur', d.instructor || '…..', 'Tahun Angkatan', d.angkatan)
    + row('Jam Pelatihan', `${d.jp} JP per pertemuan${d.time ? ` (${d.time})` : ''}`, 'Ruang / Kelas', d.room || '…..')
    + '</w:tbl>'
}

function meetingTable(d) {
  const border = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((k) => `<w:${k} w:val="single" w:sz="4" w:space="0" w:color="auto"/>`).join('')
  const head = `<w:tr><w:trPr><w:tblHeader/></w:trPr>${['Pert', 'Tanggal', 'Durasi', 'Materi', 'Kehadiran Siswa', 'Paraf Instruktur'].map((t, i) => cell(GRID_W[i], [t], { bold: true, center: true, fill: 'EFEFEF' })).join('')}</w:tr>`
  const body = (r) => `<w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="680"/></w:trPr>`
    + cell(GRID_W[0], [r.no], { center: true }) + cell(GRID_W[1], r.date, { center: true }) + cell(GRID_W[2], r.dur, { center: true })
    + cell(GRID_W[3], r.materi, { boldFirst: !!r.paraf }) + cell(GRID_W[4], r.hadir) + cell(GRID_W[5], [r.paraf ?? ''], { center: true, bold: !!r.paraf }) + '</w:tr>'
  const rows = tableRows(d)
  return `<w:tbl><w:tblPr><w:tblW w:w="15168" w:type="dxa"/><w:tblInd w:w="-147" w:type="dxa"/><w:tblBorders>${border}</w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr>`
    + `<w:tblGrid>${GRID_W.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`
    + head + rows.map(body).join('') + body(EXAM(rows.length + 1)) + '</w:tbl>'
}

let template = null
export function beritaAcaraDocx(d) {
  template ??= unzipSync(fs.readFileSync(path.join(ASSETS, 'berita-acara-template.docx')))
  const xml = strFromU8(template['word/document.xml'])
  const bodyAt = xml.indexOf('<w:body>') + '<w:body>'.length
  const sectAt = xml.lastIndexOf('<w:sectPr')
  const notes = xml.slice(xml.lastIndexOf('</w:tbl>') + '</w:tbl>'.length, sectAt) // catatan di bawah tabel, apa adanya dari template
  const spacer = '<w:p><w:pPr><w:spacing w:after="0"/></w:pPr></w:p>'
  const doc = xml.slice(0, bodyAt) + infoTable(d) + spacer + meetingTable(d) + notes + xml.slice(sectAt)
  return Buffer.from(zipSync({ ...template, 'word/document.xml': strToU8(doc) }, { level: 6 }))
}

/* ---------------- PDF ---------------- */
const NOTES = [
  'Mapel Pendukung (Bahasa Inggris, Bahasa Jepang dan Pengetahuan Perhotelan dan Kapal Pesiar) diisikan seluruh pertemuan',
  'Mapel Inti diisikan hanya sampai pertemuan 12',
  'Peserta Didik wajib memenuhi minimal 75% kehadiran',
  'Ujian Tulis diawasi oleh Admin LPK Cimahi Hotel Institute',
]

export function beritaAcaraPdf(out, d) {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0, info: { Title: `Berita acara ${d.subjectName} ${d.batchCode}` } })
  doc.pipe(out)
  const L = 40, R = doc.page.width - 28, W = R - L, BOTTOM = doc.page.height - 36
  const s = d.settings ?? {}
  const logo = path.join(ASSETS, 'logo.png'), mark = path.join(ASSETS, 'wordmark.png')

  const kop = (first) => {
    doc.image(logo, L, 18, { height: 58 })
    const x = L + 70
    doc.image(mark, x, 22, { height: 16 })
    doc.font('Times-Bold').fontSize(11).fillColor('#1d3557').text('LEMBAGA PELATIHAN KERJA (LPK)', x, 42)
    if (first) {
      doc.font('Times-Roman').fontSize(8).fillColor('#111')
        .text(`No Registrasi : ${s.lpkRegNo || '32.77.03.1004.35.2024'}`, x, 56)
        .text(s.address || 'Jalan Pasantren KM.2, Cibabat, Cimahi Utara, Kota Cimahi 40513 Jawa Barat', x, 66)
        .text(`Telp : ${s.phone || '0821 673 3273'}   Email : ${s.email || 'infolpk.chi@gmail.com'}   Website : ${s.website || 'cimahihotelinstitute.org'}`, x, 76)
    } else {
      doc.font('Times-Bold').fontSize(13).fillColor('#111').text('LOG BOOK PELATIHAN KERJA', x, 58)
    }
    doc.moveTo(L, 90).lineTo(R, 90).lineWidth(1.2).strokeColor('#1d3557').stroke()
    return 100
  }

  // Kepala: dua kolom label : isi, mengikuti template.
  let y = kop(true)
  const info = [['Kode / Mata Pelatihan', d.subject, 'Program Keahlian', d.program], ['Instruktur', d.instructor || '…..', 'Tahun Angkatan', d.angkatan],
    ['Jam Pelatihan', `${d.jp} JP per pertemuan${d.time ? ` (${d.time})` : ''}`, 'Ruang / Kelas', d.room || '…..']]
  const scale = W / INFO_W.reduce((a, b) => a + b, 0)
  const ix = INFO_W.reduce((acc, w, i) => [...acc, acc[i] + w * scale], [L])
  doc.font('Times-Roman').fontSize(10).fillColor('#111')
  for (const r of info) {
    const cells = [r[0], ':', r[1], r[2], ':', r[3]]
    const h = Math.max(...cells.map((t, i) => doc.heightOfString(t, { width: INFO_W[i] * scale - 4 }))) + 3
    cells.forEach((t, i) => doc.text(t, ix[i], y, { width: INFO_W[i] * scale - 4 }))
    y += h
  }
  y += 8

  // Tabel pertemuan
  const gs = W / GRID_W.reduce((a, b) => a + b, 0)
  const gx = GRID_W.reduce((acc, w, i) => [...acc, acc[i] + w * gs], [L])
  const cols = GRID_W.map((w) => w * gs)
  const drawRow = (cells, { head = false, min = 36, bold = [] } = {}) => {
    doc.fontSize(9.5)
    const heights = cells.map((lines, i) => { doc.font(head || bold.includes(i) ? 'Times-Bold' : 'Times-Roman'); return doc.heightOfString(lines.join('\n'), { width: cols[i] - 8 }) })
    const h = Math.max(head ? 20 : min, ...heights.map((x) => x + 10))
    if (y + h > BOTTOM) { doc.addPage(); y = kop(false); drawRow(HEAD, { head: true }) } // header tabel diulang di halaman baru
    if (head) doc.rect(L, y, W, h).fill('#efefef')
    doc.lineWidth(0.6).strokeColor('#000')
    cells.forEach((lines, i) => {
      doc.rect(gx[i], y, cols[i], h).stroke()
      const centered = head || i <= 2 || i === 5
      doc.font(head || bold.includes(i) ? 'Times-Bold' : 'Times-Roman').fillColor('#111')
      doc.text(lines.join('\n'), gx[i] + 4, y + (h - heights[i]) / 2, { width: cols[i] - 8, align: centered ? 'center' : 'left' })
    })
    y += h
  }
  const HEAD = [['Pert'], ['Tanggal'], ['Durasi'], ['Materi'], ['Kehadiran Siswa'], ['Paraf Instruktur']]
  drawRow(HEAD, { head: true })
  const rows = tableRows(d)
  for (const r of rows) drawRow([[r.no], r.date, r.dur, r.materi, r.hadir, ['']])
  const ex = EXAM(rows.length + 1)
  drawRow([[ex.no], ex.date, ex.dur, ex.materi, ex.hadir, [ex.paraf]], { min: 60, bold: [5] })

  // Catatan
  y += 10
  if (y + 70 > BOTTOM) { doc.addPage(); y = kop(false) }
  doc.font('Times-Bold').fontSize(10).fillColor('#111').text('Catatan:', L, y)
  y += 14
  doc.font('Times-Roman').fontSize(10)
  NOTES.forEach((n, i) => { doc.text(`${i + 1}.  ${n}`, L + 8, y, { width: W - 8 }); y += doc.heightOfString(n, { width: W - 8 }) + 2 })
  doc.end()
}
