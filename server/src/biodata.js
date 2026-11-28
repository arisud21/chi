import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import PDFDocument from 'pdfkit'
import sharp from 'sharp'
import { UPLOAD_DIR, getSettings, q } from './lib.js'

/*
 * Biodata dalam PDF (template data diri): kop lembaga, pita judul, pas foto 3x4, lalu bagian-bagian data
 * dalam baris label : isi. Instruktur mendapat tabel riwayat mengajar dari jadwal pembelajaran (batch_subjects).
 */

const ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../assets')
const NAVY = '#1f3a73', INK = '#1d2a3d', MUTED = '#5a6b82', LINE = '#dde5f1', SOFT = '#f0f3fa', BRAND = '#395886'
const A4 = { w: 595.28, h: 841.89 }
const L = 42, R = A4.w - 42, W = R - L, BOTTOM = A4.h - 54

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
const longDate = (v) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? '')); return m ? `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}` : '' }
const dateOf = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '').slice(0, 10))
const today = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10) // WIB
const GENDER = { L: 'Laki-laki', P: 'Perempuan' }
const MARITAL = { belum_kawin: 'Belum kawin', kawin: 'Kawin', cerai_hidup: 'Cerai hidup', cerai_mati: 'Cerai mati' }
const INTERNSHIP = { dalam_negeri: 'Dalam negeri', luar_negeri: 'Luar negeri' }
const INFO = { instagram: 'Media sosial Instagram', guru_sekolah: 'Guru sekolah', alumni: 'Alumni', siswa_chi: 'Siswa Cimahi Hotel Institute', keluarga: 'Keluarga', edufair: 'Edufair', lainnya: 'Lainnya' }
const STAGE = { data: 'Isi data diri', bayar_daftar: 'Bayar pendaftaran', ujian: 'Ujian online', menunggu_hasil: 'Menunggu hasil', registrasi_ulang: 'Registrasi ulang', aktif: 'Peserta didik aktif', tidak_lulus: 'Tidak lulus' }

/** Pas foto sebagai PNG (pdfkit tidak membaca WEBP), atau null. */
async function photoBuffer(fileId) {
  if (!fileId) return null
  const [f] = await q('SELECT stored_name, mime FROM files WHERE id = ?', [fileId])
  if (!f || !f.mime.startsWith('image/')) return null
  try { return await sharp(await fs.promises.readFile(path.join(UPLOAD_DIR, f.stored_name))).rotate().resize(360, 480, { fit: 'cover' }).png().toBuffer() } catch { return null }
}

/* ---------- pengumpul data ---------- */

/** Data biodata satu akun, atau null bila tidak ada. Peran akun menentukan template. */
export async function biodataData(userId) {
  const [u] = await q('SELECT id, name, email, phone, nik, birth_date, role, instructor_program FROM users WHERE id = ?', [userId])
  if (!u) return null
  const settings = await getSettings()
  if (u.role === 'peserta') {
    const [p] = await q('SELECT * FROM participant_profiles WHERE user_id = ?', [u.id])
    const [r] = await q(`SELECT r.*, pr.title program, b.code bcode, b.angkatan, b.start_date, b.end_date FROM registrations r
      JOIN programs pr ON pr.id = r.program_id LEFT JOIN batches b ON b.id = r.batch_id
      WHERE r.user_id = ? ORDER BY (r.stage = 'aktif') DESC, r.created_at DESC LIMIT 1`, [u.id])
    const [doc] = await q("SELECT file_id FROM registration_documents WHERE user_id = ? AND kind = 'foto'", [u.id])
    return { kind: 'peserta', settings, u, p, r, photo: await photoBuffer(doc?.file_id) }
  }
  const [p] = await q('SELECT * FROM staff_profiles WHERE user_id = ?', [u.id])
  const certs = await q('SELECT label, created_at FROM staff_certificates WHERE user_id = ? ORDER BY created_at', [u.id])
  const progIds = String(u.instructor_program ?? '').split(',').filter(Boolean)
  const progs = progIds.length ? await q('SELECT id, title FROM programs WHERE id IN (?)', [progIds]) : []
  const programs = progIds.map((id) => (id === 'gabungan' ? 'Kelas gabungan' : progs.find((x) => x.id === id)?.title)).filter(Boolean)
  // Riwayat mengajar = jadwal pembelajaran tempat ia ditetapkan sebagai pengampu.
  const teach = await q(`SELECT bs.batch_id, bs.subject_id, bs.group_id,
      b.code bcode, b.angkatan, b.start_date, b.end_date, sj.name subject, sj.code scode, pr.title program
    FROM batch_subjects bs JOIN batches b ON b.id = bs.batch_id JOIN subjects sj ON sj.id = bs.subject_id JOIN programs pr ON pr.id = b.program_id
    WHERE bs.instructor_id = ? AND b.status <> 'cancelled'
    ORDER BY b.start_date DESC, b.code, sj.name`, [u.id])
  return { kind: 'staf', settings, u, p, certs, programs, teach, photo: await photoBuffer(p?.photo_file_id) }
}

/* ---------- penggambar ---------- */

function kop(doc, s) {
  try { doc.image(path.join(ASSETS, 'logo.png'), L, 22, { height: 56 }) } catch { /* logo opsional */ }
  const x = L + 68
  try { doc.image(path.join(ASSETS, 'wordmark.png'), x, 25, { height: 15 }) } catch { doc.font('Times-Bold').fontSize(14).fillColor(NAVY).text('CIMAHI HOTEL INSTITUTE', x, 24) }
  doc.font('Times-Bold').fontSize(10).fillColor(NAVY).text('LEMBAGA PELATIHAN KERJA (LPK)', x, 44)
  doc.font('Times-Roman').fontSize(7.5).fillColor(INK)
    .text(`No Registrasi : ${s.lpkRegNo || '-'}   ·   ${s.address || 'Jalan Pasantren KM.2, Cibabat, Cimahi Utara, Kota Cimahi 40513 Jawa Barat'}`, x, 57, { width: R - x })
    .text(`Telp : ${s.phone || '-'}   Email : ${s.email || '-'}   Website : ${s.website || '-'}`, x, 67, { width: R - x })
  doc.moveTo(L, 86).lineTo(R, 86).lineWidth(2.4).strokeColor(NAVY).stroke()
  doc.moveTo(L, 89).lineTo(R, 89).lineWidth(0.6).strokeColor(BRAND).stroke()
}

function footer(doc, page, total, by) {
  doc.font('Helvetica').fontSize(7.5).fillColor(MUTED)
  doc.moveTo(L, A4.h - 40).lineTo(R, A4.h - 40).lineWidth(0.5).strokeColor(LINE).stroke()
  doc.text(`Dicetak dari Sistem Informasi Cimahi Hotel Institute pada ${longDate(today())}${by ? ` oleh ${by}` : ''}.`, L, A4.h - 33, { width: W - 80, lineBreak: false })
  doc.text(`Halaman ${page} dari ${total}`, R - 80, A4.h - 33, { width: 80, align: 'right', lineBreak: false })
}

/** Pita judul: latar navy, judul putih, keterangan kecil. */
function band(doc, y, title, sub) {
  doc.rect(L, y, W, 38).fill(NAVY)
  doc.rect(L, y + 38, W, 3).fill('#628ecb')
  doc.font('Helvetica-Bold').fontSize(15).fillColor('#ffffff').text(title, L + 16, y + 8, { characterSpacing: 1.5, lineBreak: false })
  if (sub) doc.font('Helvetica').fontSize(8.5).fillColor('#d5deef').text(sub, L + 16, y + 26, { width: W - 32, lineBreak: false })
  return y + 54
}

/** Pas foto 3x4 dengan bingkai; kotak kosong berlabel bila belum ada foto. */
function photoBox(doc, x, y, buf) {
  const w = 96, h = 128
  doc.rect(x - 4, y - 4, w + 8, h + 8).fill(SOFT)
  if (buf) doc.image(buf, x, y, { width: w, height: h })
  else {
    doc.rect(x, y, w, h).fill('#ffffff')
    doc.font('Helvetica').fontSize(8).fillColor(MUTED).text('Pas foto\n3 x 4', x, y + h / 2 - 10, { width: w, align: 'center' })
  }
  doc.rect(x, y, w, h).lineWidth(0.8).strokeColor(BRAND).stroke()
  return { w, h }
}

/** Satu bagian: judul kecil berwarna, lalu baris label : isi berselang-seling. Kembalikan y akhir. */
function section(doc, x, y, width, title, rows, onBreak) {
  if (y + 40 > BOTTOM) y = onBreak()
  doc.font('Helvetica-Bold').fontSize(9).fillColor(NAVY).text(title.toUpperCase(), x, y, { characterSpacing: 1, lineBreak: false })
  doc.moveTo(x, y + 13).lineTo(x + width, y + 13).lineWidth(1).strokeColor(BRAND).stroke()
  y += 18
  const lw = Math.min(150, width * 0.36), vw = width - lw - 18
  rows.forEach(([k, v], i) => {
    const val = v === undefined || v === null || v === '' ? '-' : String(v)
    doc.font('Helvetica-Bold').fontSize(9)
    const h = Math.max(doc.heightOfString(val, { width: vw }), 11) + 7
    if (y + h > BOTTOM) y = onBreak()
    if (i % 2 === 0) doc.rect(x, y, width, h).fill(SOFT)
    doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(k, x + 6, y + 4, { width: lw - 6 })
    doc.text(':', x + lw, y + 4, { lineBreak: false })
    doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text(val, x + lw + 10, y + 4, { width: vw })
    y += h
  })
  return y + 12
}

/** Tabel sederhana dengan kepala navy; ulang kepala di halaman baru. */
function table(doc, y, head, widths, rows, onBreak, boldCol = -1) {
  const xs = widths.reduce((acc, w, i) => [...acc, acc[i] + w], [L])
  const drawHead = (yy) => {
    doc.font('Helvetica-Bold').fontSize(7.8)
    const hh = Math.max(...head.map((h, i) => doc.heightOfString(h, { width: widths[i] - 8 }))) + 10
    doc.rect(L, yy, W, hh).fill(BRAND)
    doc.fillColor('#ffffff')
    head.forEach((h, i) => doc.text(h, xs[i] + 4, yy + 5, { width: widths[i] - 8 }))
    return yy + hh
  }
  y = drawHead(y)
  rows.forEach((cells, r) => {
    doc.font('Helvetica').fontSize(8)
    const h = Math.max(...cells.map((c, i) => doc.heightOfString(String(c), { width: widths[i] - 8 }))) + 9
    if (y + h > BOTTOM) { y = drawHead(onBreak()) }
    if (r % 2 === 1) doc.rect(L, y, W, h).fill(SOFT)
    cells.forEach((c, i) => doc.font(i === boldCol ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor(INK).text(String(c), xs[i] + 4, y + 4.5, { width: widths[i] - 8 }))
    doc.moveTo(L, y + h).lineTo(R, y + h).lineWidth(0.4).strokeColor(LINE).stroke()
    y += h
  })
  return y + 10
}

/** Kotak tanda tangan di kanan bawah. */
function signature(doc, y, name, onBreak) {
  if (y + 72 > A4.h - 46) y = onBreak() // boleh memakai ruang sampai tepat di atas garis kaki halaman
  const x = R - 190
  doc.font('Helvetica').fontSize(9).fillColor(INK).text(`Cimahi, ${longDate(today())}`, x, y, { width: 190, align: 'center' })
  doc.text('Yang bersangkutan,', x, y + 12, { width: 190, align: 'center' })
  doc.moveTo(x + 20, y + 54).lineTo(x + 170, y + 54).lineWidth(0.6).strokeColor(INK).stroke()
  doc.font('Helvetica-Bold').text(name, x, y + 58, { width: 190, align: 'center' })
  return y + 76
}

/** Tulis PDF biodata ke stream. */
export function biodataPdf(out, d, printedBy) {
  const isStaff = d.kind === 'staf'
  const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true, info: { Title: `Biodata ${d.u.name}`, Author: 'Cimahi Hotel Institute' } })
  doc.pipe(out)
  const s = d.settings ?? {}
  const newPage = () => { doc.addPage(); kop(doc, s); return 104 }
  kop(doc, s)
  const role = isStaff ? (d.u.role === 'instruktur' ? 'Instruktur' : 'Pengelola') : 'Peserta Didik'
  const idLine = isStaff ? `${role} LPK Cimahi Hotel Institute` : [d.r?.nip ? `NIP ${d.r.nip}` : d.r?.code ? `No registrasi ${d.r.code}` : '', d.r?.program, d.r?.bcode].filter(Boolean).join('   ·   ')
  let y = band(doc, 100, isStaff ? 'BIODATA INSTRUKTUR' : 'BIODATA PESERTA DIDIK', idLine)

  // Kolom kiri: foto dan nama. Kolom kanan: identitas.
  const px = L + 6
  const { h: ph } = photoBox(doc, px, y + 4, d.photo)
  doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text(d.u.name, L, y + ph + 18, { width: 108, align: 'center' })
  doc.font('Helvetica').fontSize(8).fillColor(BRAND).text(role, L, doc.y + 2, { width: 108, align: 'center' })
  const leftEnd = doc.y + 10
  const cx = L + 124, cw = R - cx
  const p = d.p ?? {}
  const ttl = [p.birth_place, longDate(dateOf(d.u.birth_date || p.birth_date))].filter(Boolean).join(', ')
  const ident = isStaff
    ? [['Nama lengkap dan gelar', d.u.name], ['NIK', d.u.nik], ['Tempat, tanggal lahir', ttl], ['Jenis kelamin', GENDER[p.gender]], ['Status perkawinan', MARITAL[p.marital]], ['Agama', p.religion]]
    : [['Nama lengkap', d.u.name], ['NIK', d.u.nik || p.nik], ['Tempat, tanggal lahir', ttl], ['Jenis kelamin', GENDER[p.gender]]]
  let ry = section(doc, cx, y, cw, 'Identitas', ident, newPage)
  const contact = isStaff
    ? [['Alamat', p.address], ['Nomor HP', d.u.phone], ['Alamat e-mail', d.u.email]]
    : [['Alamat', p.address ? `${p.address}${p.rt || p.rw ? `, RT ${p.rt || '-'}/RW ${p.rw || '-'}` : ''}` : ''], ['Kecamatan', p.district], ['Kota atau kabupaten', p.city], ['Provinsi', p.province], ['Kode pos', p.postal_code], ['Telepon', d.u.phone], ['E-mail', d.u.email]]
  ry = section(doc, cx, ry, cw, isStaff ? 'Kontak' : 'Alamat dan kontak', contact, newPage)
  y = Math.max(ry, leftEnd)

  if (isStaff) {
    y = section(doc, L, y, W, 'Kualifikasi dan dokumen', [
      ['Program yang diampu', d.programs.join(', ')],
      ['Curriculum vitae (CV)', p.cv_file_id ? 'Terlampir di sistem' : 'Belum diunggah'],
      ['Sertifikat pendukung', d.certs.length ? d.certs.map((c, i) => `${i + 1}. ${c.label}`).join('\n') : 'Tidak ada'],
    ], newPage)
    // Riwayat mengajar dari jadwal pembelajaran.
    if (y + 60 > BOTTOM) y = newPage()
    doc.font('Helvetica-Bold').fontSize(9).fillColor(NAVY).text('RIWAYAT MENGAJAR DI LPK CIMAHI HOTEL INSTITUTE', L, y, { characterSpacing: 1, lineBreak: false })
    doc.moveTo(L, y + 13).lineTo(R, y + 13).lineWidth(1).strokeColor(BRAND).stroke()
    y += 18
    // Satu baris per angkatan: mata pelajaran yang diampu di angkatan itu.
    const batches = []
    for (const x of d.teach) {
      let g = batches.find((y) => y.id === x.batch_id)
      if (!g) batches.push(g = { id: x.batch_id, code: x.bcode, angkatan: x.angkatan, program: x.program, start: x.start_date, end: x.end_date, subjects: [] })
      g.subjects.push(`${x.subject}${x.scode ? ` (${x.scode})` : ''}${x.group_id ? ' - kelas gabungan' : ''}`)
    }
    doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(batches.length
      ? `Sesuai jadwal pembelajaran: ${d.teach.length} mata pelajaran diampu di ${batches.length} angkatan.`
      : 'Belum ada jadwal pembelajaran yang menetapkan instruktur ini sebagai pengampu.', L, y, { width: W })
    y = doc.y + 6
    if (batches.length) {
      const rows = batches.map((g, i) => [
        i + 1, `${g.code}${g.angkatan ? `\nAngkatan ${g.angkatan}` : ''}`, g.program,
        g.subjects.map((x, j) => (g.subjects.length > 1 ? `${j + 1}. ${x}` : x)).join('\n'),
        [longDate(dateOf(g.start)), longDate(dateOf(g.end))].filter(Boolean).join('\ns.d. ') || '-',
      ])
      y = table(doc, y, ['No', 'Angkatan', 'Program', 'Mata pelajaran yang diampu', 'Periode'], [24, 76, 100, 216, 95.28], rows, newPage, 3)
    }
  } else {
    const r = d.r ?? {}
    y = section(doc, L, y, W, 'Pendidikan dan informasi lain', [
      ['Pendidikan terakhir', p.education], ['Asal sekolah', p.school], ['Pekerjaan', p.occupation],
      ['Kesediaan magang', INTERNSHIP[p.internship_pref]], ['Standar grooming', p.grooming_agreed ? 'Bersedia' : ''],
      ['Mengetahui pendaftaran dari', p.info_source === 'lainnya' ? `Lainnya: ${p.info_source_other ?? ''}` : INFO[p.info_source]],
    ], newPage)
    y = section(doc, L, y, W, 'Pelatihan', [
      ['Program pelatihan', r.program], ['Angkatan', r.bcode ? `${r.bcode}${r.angkatan ? ` (Angkatan ${r.angkatan})` : ''}` : 'Belum ditetapkan'],
      ['Nomor induk peserta (NIP)', r.nip], ['Nomor registrasi', r.code],
      ['Periode', [longDate(dateOf(r.start_date)), longDate(dateOf(r.end_date))].filter(Boolean).join(' s.d. ')], ['Tahap', STAGE[r.stage] ?? r.stage],
    ], newPage)
  }
  signature(doc, y, d.u.name, newPage)

  const range = doc.bufferedPageRange()
  for (let i = 0; i < range.count; i++) { doc.switchToPage(range.start + i); footer(doc, i + 1, range.count, printedBy) }
  doc.end()
}
