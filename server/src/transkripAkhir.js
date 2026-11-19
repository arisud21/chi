// Transkrip akhir pelatihan dalam Word: memakai template "template transkrip akhir".
// Kop, ukuran halaman, dan susunan tetap dari template; identitas, daftar mata pelajaran, data magang, dan skala nilai diisi dari data nyata.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import PDFDocument from 'pdfkit'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { fail, getSettings, q } from './lib.js'
import { GRADE_LETTERS, gradeLetterScale, letterOf, subjectResults } from './admission.js'

const ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../assets')
const esc = (v) => String(v ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c])
const ymd = (v) => String(v).slice(0, 10)
const longDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const r1 = (n) => Math.round(n * 10) / 10
const fmt = (n) => String(r1(n))

/** Kumpulkan data transkrip akhir satu peserta. Pemilik, Akademik, dan Super Admin yang boleh; nilai harus sudah divalidasi. */
export async function transkripData(user, regId) {
  const [r] = await q(`SELECT r.id, r.user_id, r.nip, r.batch_id, r.program_id, r.status, u.name FROM registrations r JOIN users u ON u.id = r.user_id WHERE r.id = ?`, [regId])
  if (!r) fail('Data tidak ditemukan.', 404)
  if (r.user_id !== user.id && !['akademik', 'super_admin'].includes(user.role)) fail('Anda tidak berhak mengunduh transkrip ini.', 403)
  const [g] = await q("SELECT * FROM grades WHERE registration_id = ? AND status = 'validated'", [regId])
  if (!g) fail('Transkrip tersedia setelah nilai divalidasi.', 404)
  // Peserta mengunduh setelah kelulusannya sempurna (lulus dan seluruh pembayaran lunas), sama seperti transkrip PDF.
  if (r.user_id === user.id && g.passed && r.status !== 'completed') fail('Transkrip tersedia setelah seluruh pembayaran lunas dan nilai magang diinput Akademik.', 403)
  const [prog] = await q('SELECT title FROM programs WHERE id = ?', [r.program_id])
  const [b] = r.batch_id ? await q('SELECT code, angkatan, start_date FROM batches WHERE id = ?', [r.batch_id]) : []
  const [pf] = await q('SELECT nik, birth_place, birth_date FROM participant_profiles WHERE user_id = ?', [r.user_id])
  const [u] = await q('SELECT nik, birth_date FROM users WHERE id = ?', [r.user_id])
  const subs = r.batch_id ? await subjectResults(null, r.batch_id, regId) : []
  if (!subs.length) fail('Transkrip tersedia setelah nilai mata pelajaran divalidasi.', 404)
  // Magang yang dinilai: penempatan magang selesai terbaru; bila belum ada, magang terbaru yang tidak batal.
  const pls = await q(`SELECT p.*, c.name company, c.address, c.city, c.country FROM placements p LEFT JOIN companies c ON c.id = p.company_id
    WHERE p.registration_id = ? AND p.kind = 'magang' AND p.status <> 'batal' ORDER BY (p.status = 'selesai') DESC, p.start_date DESC`, [regId])
  const pl = pls[0] ?? null
  const scale = await gradeLetterScale()
  const settings = await getSettings()
  const magangScore = pl && pl.score != null ? Number(pl.score) : null
  const scores = [...subs.map((s) => s.akhir), ...(magangScore != null ? [magangScore] : [])]
  const avg = scores.length ? r1(scores.reduce((t, n) => t + n, 0) / scores.length) : 0
  const year = b ? ymd(b.start_date).slice(0, 4) : ''
  const birth = pf?.birth_date ?? u?.birth_date
  const months = pl?.end_date ? Math.max(1, Math.round((new Date(`${ymd(pl.end_date)}T00:00:00Z`) - new Date(`${ymd(pl.start_date)}T00:00:00Z`)) / 86_400_000 / 30.4)) : null
  return {
    name: r.name, nip: r.nip ?? '', nik: pf?.nik ?? u?.nik ?? '', program: prog?.title ?? '',
    angkatan: b ? `${year}${b.angkatan ? ` / Angkatan ${b.angkatan}` : ''}` : '',
    birth: [pf?.birth_place, birth ? longDate(ymd(birth)) : ''].filter(Boolean).join(', '),
    subjects: subs.map((s) => ({ name: s.name, hours: s.hours, score: s.akhir, letter: s.huruf })),
    magang: pl ? {
      company: pl.company ?? '', position: pl.position ?? '', address: [pl.address, pl.city].filter(Boolean).join(', '), country: pl.country || 'Indonesia',
      score: magangScore, letter: magangScore != null ? letterOf(magangScore, scale) : '', months, done: pl.status === 'selesai',
    } : null,
    avg, avgLetter: letterOf(avg, scale), passed: !!g.passed && magangScore != null, scale, ketua: settings.ketuaName ?? '',
  }
}

/* ---------- pembangun XML ---------- */
const rPr = (bold) => `<w:rPr><w:rFonts w:ascii="Cambria" w:hAnsi="Cambria"/>${bold ? '<w:b/><w:bCs/>' : ''}<w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>`
/** Paragraf: lines dipisah dengan <w:br/>. ind -709 = sejajar tabel di template. */
const para = (lines, { jc = '', bold = false, ind = -709, after0 = true } = {}) => {
  const arr = [].concat(lines)
  const runs = arr.map((l, i) => `<w:r>${rPr(bold)}${i ? '<w:br/>' : ''}<w:t xml:space="preserve">${esc(l)}</w:t></w:r>`).join('')
  return `<w:p><w:pPr>${after0 ? '<w:spacing w:after="0"/>' : ''}<w:ind w:left="${ind}"/>${jc ? `<w:jc w:val="${jc}"/>` : ''}${rPr(bold)}</w:pPr>${arr.length && arr[0] !== '' ? runs : ''}</w:p>`
}
const blank = (n = 1) => para('').repeat(n)
const cell = (w, text, { jc = '', bold = false } = {}) =>
  `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/></w:tcPr><w:p><w:pPr>${jc ? `<w:jc w:val="${jc}"/>` : ''}${rPr(bold)}</w:pPr>${text === '' ? '' : `<w:r>${rPr(bold)}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`}</w:p></w:tc>`
const row = (cells) => `<w:tr>${cells}</w:tr>`

/** Ganti isi satu sel tabel identitas, memakai huruf asli sel itu. */
function setCell(rowXml, idx, text) {
  let i = 0
  return rowXml.replace(/<w:tc>.*?<\/w:tc>/gs, (c) => {
    if (i++ !== idx) return c
    const tcPr = c.match(/<w:tcPr>.*?<\/w:tcPr>/s)?.[0] ?? ''
    const pPr = c.match(/<w:pPr>.*?<\/w:pPr>/s)?.[0] ?? ''
    const rp = pPr.match(/<w:rPr>.*?<\/w:rPr>/s)?.[0] ?? rPr(false)
    return `<w:tc>${tcPr}<w:p>${pPr}<w:r>${rp}<w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p></w:tc>`
  })
}

let template = null
export function transkripDocx(d) {
  template ??= unzipSync(fs.readFileSync(path.join(ASSETS, 'transkrip-akhir-template.docx')))
  const xml = strFromU8(template['word/document.xml'])
  const bodyStart = xml.indexOf('<w:body>') + '<w:body>'.length
  const tbls = [...xml.matchAll(/<w:tbl>.*?<\/w:tbl>/gs)].map((m) => m[0])
  const sectAt = xml.lastIndexOf('<w:sectPr')
  if (tbls.length < 3 || sectAt < 0) throw new Error('Template transkrip akhir tidak dikenali.')
  const [infoTpl, gradeTpl, scaleTpl] = tbls
  const tblPr = (t) => t.match(/<w:tblPr>.*?<\/w:tblPr>/s)[0]
  const grid = (t) => t.match(/<w:tblGrid>.*?<\/w:tblGrid>/s)[0]

  // Identitas.
  let ri = 0
  const info = infoTpl.replace(/<w:tr[ >].*?<\/w:tr>/gs, (rw) => {
    const i = ri++
    if (i === 0) return setCell(setCell(rw, 2, d.name), 5, d.program)
    if (i === 1) return setCell(setCell(rw, 2, d.nip || '-'), 5, d.angkatan || '-')
    if (i === 2) return setCell(rw, 2, d.nik || '-')
    if (i === 3) return setCell(rw, 2, d.birth || '-')
    return rw
  })

  // Daftar mata pelajaran: judul kolom dari template, baris sesuai jumlah mata pelajaran.
  const W = [531, 5092, 1123, 1201, 1096]
  const head = row(['No', 'Mata Pelatihan', 'Total JP', 'Nilai Angka', 'Nilai Huruf'].map((t, i) => cell(W[i], t, { jc: 'center', bold: true })).join(''))
  const body = d.subjects.map((s, i) => row([String(i + 1), s.name, String(s.hours), fmt(s.score), s.letter].map((t, k) => cell(W[k], t, { jc: k === 1 ? '' : 'center' })).join(''))).join('')
  const gradeTable = `<w:tbl>${tblPr(gradeTpl)}${grid(gradeTpl)}${head}${body}</w:tbl>`

  // Magang industri: tabel tanpa garis agar nilai panjang (nama perusahaan, alamat) tidak merusak susunan.
  const m = d.magang
  const MW = [1300, 250, 3300, 1300, 250, 2650]
  const mrow = (a, b, c, e) => row([a, ':', b, c, c ? ':' : '', e].map((t, i) => cell(MW[i], t)).join(''))
  const magangTable = `<w:tbl><w:tblPr><w:tblW w:w="${MW.reduce((t, n) => t + n, 0)}" w:type="dxa"/><w:tblInd w:w="-709" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${MW.map((n) => `<w:gridCol w:w="${n}"/>`).join('')}</w:tblGrid>${[
    mrow('Perusahaan', m?.company || '-', 'Posisi', m?.position || '-'),
    mrow('Alamat', m?.address || '-', 'Nilai Angka', m?.score != null ? fmt(m.score) : '-'),
    mrow('Negara', m?.country || '-', 'Nilai Huruf', m?.letter || '-'),
  ].join('')}</w:tbl>`

  const statement = `Peserta didik atas nama tersebut dinyatakan ${d.passed ? 'LULUS' : 'TIDAK LULUS'} dengan nilai rata-rata ${fmt(d.avg)} (${d.avgLetter})`

  // Skala nilai huruf mengikuti pengaturan Akademik.
  const s = d.scale
  const rng = (i) => (i === 0 ? `${s[0]} – 100` : `${s[i]} – ${fmt(s[i - 1] - 0.1)}`)
  const scaleRows = [...GRADE_LETTERS.map((l, i) => [l, `: ${rng(i)}`]), ['E', `: 0 – ${fmt(s[6] - 0.1)}`]]
  const scaleTable = `<w:tbl>${tblPr(scaleTpl)}${grid(scaleTpl)}${scaleRows.map(([l, t]) => row(cell(562, l, { bold: true }) + cell(1276, t, { bold: true }))).join('')}</w:tbl>`

  const content = info + blank(3) + gradeTable + blank(1)
    + para(`Magang Industri${m?.months ? ` (${m.months} Bulan)` : ''}`, { bold: true }) + magangTable + blank(1)
    + para(statement) + blank(5)
    + para(['Ketua', 'LPK Cimahi Hotel Institute,'], { jc: 'center' }) + blank(5)
    + para(d.ketua || '', { jc: 'center', bold: true }) + blank(2)
    + para('Penilaian:', { after0: false }) + scaleTable + para('', { after0: false })
  const doc = xml.slice(0, bodyStart) + content + xml.slice(sectAt)
  return Buffer.from(zipSync({ ...template, 'word/document.xml': strToU8(doc) }, { level: 6 }))
}

/**
 * Transkrip akhir pelatihan dalam PDF mengikuti "template transkrip akhir": kop (logo, nama lembaga, judul) di tiap halaman,
 * tabel identitas dua kolom, tabel nilai bergaris, blok Magang Industri, pernyataan kelulusan, tanda tangan Ketua, dan skala penilaian.
 * Tiap halaman diberi watermark "DRAFT". Font Cambria/Engravers MT pada template diganti font serif standar PDF.
 */
let tplImages = null
function templateImages() {
  if (!tplImages) {
    const z = unzipSync(fs.readFileSync(path.join(ASSETS, 'transkrip-akhir-template.docx')))
    tplImages = { logo: Buffer.from(z['word/media/image1.png']), wordmark: Buffer.from(z['word/media/image2.png']) }
  }
  return tplImages
}

export function transkripPdf(res, d, { watermark = 'DRAFT' } = {}) {
  const PW = 595.28, PH = 841.89
  const X0 = 70.3, TW = 452.2 // tepi kiri dan lebar tabel pada template (-714 twip, 9043 twip)
  const BOTTOM = PH - 64 // margin bawah 1276 twip
  const NAVY = '#002060', INK = '#000000'
  const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: false, info: { Title: `Transkrip Akhir Pelatihan Kerja - ${d.name}` } })
  doc.pipe(res)
  const img = templateImages()
  let y = 0

  const text = (t, x, ty, w, { font = 'Times-Roman', size = 10, align = 'left', color = INK } = {}) => {
    doc.font(font).fontSize(size).fillColor(color).text(String(t ?? ''), x, ty, { width: w, align, lineBreak: true })
  }
  const heightOf = (t, w, font = 'Times-Roman', size = 10) => { doc.font(font).fontSize(size); return doc.heightOfString(String(t ?? ''), { width: w }) }

  // Kop di tiap halaman: logo di kiri; di kanan nama lembaga, wordmark, dan judul (header template).
  const header = () => {
    doc.save()
    doc.fillColor('#b91c1c').fillOpacity(0.13).font('Helvetica-Bold').fontSize(130)
    const w = doc.widthOfString(watermark)
    doc.rotate(-35, { origin: [PW / 2, PH / 2] })
    doc.text(watermark, (PW - w) / 2, PH / 2 - 65, { lineBreak: false })
    doc.restore()
    const hx = (PW - 460.45) / 2
    doc.image(img.logo, hx, 28.35, { width: 71.4, height: 71.6 })
    const cx = hx + 82.8, cw = 377.65
    text('LEMBAGA PELATIHAN KERJA (LPK)', cx, 34, cw, { font: 'Times-Bold', size: 9, align: 'center', color: NAVY })
    doc.image(img.wordmark, cx + (cw - 319.9) / 2, 48, { width: 319.9, height: 21.7 })
    text('TRANSKRIP AKHIR PELATIHAN KERJA', cx, 78, cw, { font: 'Times-Bold', size: 13, align: 'center' })
    y = 118
  }
  doc.on('pageAdded', header)
  doc.addPage()

  const ensure = (h) => { if (y + h > BOTTOM) doc.addPage() }
  const line = (n = 1) => { y += 12.2 * n }
  const cum = (cols, start) => cols.reduce((a, w, i) => [...a, a[i] + w], [start])

  // Tabel identitas tanpa garis: Nama Peserta Didik | Program Keahlian, NIP | Tahun Angkatan, NIK, Tempat Tanggal Lahir.
  const IC = [100, 8, 118, 80, 8, 138]
  const ix = cum(IC, X0)
  const idRow = (l1, v1, l2, v2) => {
    const h = Math.max(14.15, heightOf(l1, IC[0]) + 2, heightOf(v1 || '-', IC[2]) + 2, l2 ? Math.max(heightOf(l2, IC[3]), heightOf(v2 || '-', IC[5])) + 2 : 0)
    ensure(h)
    text(l1, ix[0], y, IC[0]); text(':', ix[1], y, IC[1], { align: 'center' }); text(v1 || '-', ix[2], y, IC[2])
    if (l2) { text(l2, ix[3], y, IC[3]); text(':', ix[4], y, IC[4], { align: 'center' }); text(v2 || '-', ix[5], y, IC[5]) }
    y += h
  }
  idRow('Nama Peserta Didik', d.name, 'Program Keahlian', d.program)
  idRow('NIP', d.nip, 'Tahun Angkatan', d.angkatan)
  idRow('NIK', d.nik)
  idRow('Tempat Tanggal Lahir', d.birth)
  line(3)

  // Tabel nilai bergaris.
  const GC = [26.6, 254.6, 56.2, 60, 54.8]
  const gx = cum(GC, X0)
  const cellBox = (rowY, h) => { doc.save().lineWidth(0.5).strokeColor(INK); GC.forEach((w, i) => doc.rect(gx[i], rowY, w, h).stroke()); doc.restore() }
  const gHead = () => {
    const h = 28
    cellBox(y, h)
    ;['No', 'Mata Pelatihan', 'Total JP', 'Nilai Angka', 'Nilai Huruf'].forEach((t, i) => text(t, gx[i] + 3, y + (i < 2 ? 8 : 3), GC[i] - 6, { font: 'Times-Bold', align: 'center' }))
    y += h
  }
  const gRow = (cells) => {
    const h = Math.max(15.5, ...cells.map((c, i) => heightOf(c, GC[i] - 8) + 5))
    if (y + h > BOTTOM) { doc.addPage(); gHead() }
    cellBox(y, h)
    cells.forEach((c, i) => text(c, gx[i] + 4, y + 2.5, GC[i] - 8, { align: i === 1 ? 'left' : 'center' }))
    y += h
  }
  gHead()
  d.subjects.forEach((s, i) => gRow([String(i + 1), s.name, String(s.hours), fmt(s.score), s.letter]))
  line(1)

  // Magang Industri.
  const m = d.magang
  ensure(12.2 + 3 * 14.15 + 12.2)
  text(`Magang Industri${m?.months ? ` (${m.months} Bulan)` : ''}`, X0, y, TW, { font: 'Times-Bold' })
  y += 14.15
  const MC = [65, 12.5, 165, 65, 12.5, 132.5]
  const mx = cum(MC, X0)
  const mRow = (l1, v1, l2, v2) => {
    const h = Math.max(14.15, heightOf(v1 || '-', MC[2]) + 2, heightOf(v2 || '-', MC[5]) + 2)
    ensure(h)
    text(l1, mx[0], y, MC[0]); text(':', mx[1], y, MC[1], { align: 'center' }); text(v1 || '-', mx[2], y, MC[2])
    text(l2, mx[3], y, MC[3]); text(':', mx[4], y, MC[4], { align: 'center' }); text(v2 || '-', mx[5], y, MC[5])
    y += h
  }
  mRow('Perusahaan', m?.company, 'Posisi', m?.position)
  mRow('Alamat', m?.address, 'Nilai Angka', m?.score != null ? fmt(m.score) : '-')
  mRow('Negara', m?.country, 'Nilai Huruf', m?.letter)
  line(1)

  // Pernyataan kelulusan dan tanda tangan Ketua (satu blok agar tidak terpisah halaman).
  const statement = `Peserta didik atas nama tersebut dinyatakan ${d.passed ? 'LULUS' : 'TIDAK LULUS'} dengan nilai rata-rata ${fmt(d.avg)} (${d.avgLetter})`
  const sh = heightOf(statement, TW)
  ensure(sh + 12.2 * 14)
  text(statement, X0, y, TW)
  y += sh
  line(5)
  text('Ketua', X0, y, TW, { align: 'center' }); y += 12.2
  text('LPK Cimahi Hotel Institute,', X0, y, TW, { align: 'center' }); y += 12.2
  line(5)
  text(d.ketua || '', X0, y, TW, { font: 'Times-Bold', align: 'center' })
  y += 12.2
  line(2)

  // Skala penilaian mengikuti pengaturan Akademik.
  const sc = d.scale
  const rng = (i) => (i === 0 ? `${fmt(sc[0])} – 100` : `${fmt(sc[i])} – ${fmt(sc[i - 1] - 0.1)}`)
  const rows = [...GRADE_LETTERS.map((l, i) => [l, `: ${rng(i)}`]), ['E', `: 0 – ${fmt(sc[6] - 0.1)}`]]
  ensure(14.15 + rows.length * 14.15)
  text('Penilaian:', X0, y, TW); y += 14.15
  for (const [l, t] of rows) { text(l, X0, y, 28.1, { font: 'Times-Bold' }); text(t, X0 + 28.1, y, 90, { font: 'Times-Bold' }); y += 14.15 }
  doc.end()
}
