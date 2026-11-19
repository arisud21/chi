// Logbook magang peserta didik dalam Word: memakai template "template logbook magang" (satu halaman per minggu, 7 hari per halaman).
// Identitas dan isi tabel diganti dengan data nyata; kop, ukuran halaman, dan tanda tangan tetap dari template.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { fail, q } from './lib.js'

const ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../assets')
const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
const MAX_WEEKS = 60
const pad = (n) => String(n).padStart(2, '0')
const ymd = (v) => String(v).slice(0, 10)
const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86_400_000)
const longDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const esc = (v) => String(v ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c])

/** Kumpulkan data logbook satu penempatan magang. Pemilik penempatan, Akademik, dan Super Admin yang boleh. */
export async function logbookData(user, placementId) {
  const [p] = await q(`SELECT p.*, r.user_id, r.nip, r.batch_id, r.program_id, u.name participant, c.name company
    FROM placements p JOIN registrations r ON r.id = p.registration_id JOIN users u ON u.id = r.user_id LEFT JOIN companies c ON c.id = p.company_id WHERE p.id = ?`, [placementId])
  if (!p || (p.user_id !== user.id && !['super_admin', 'akademik'].includes(user.role))) fail('Penempatan tidak ditemukan.', 404)
  if (p.kind !== 'magang') fail('Logbook hanya untuk penempatan magang.')
  const [prog] = await q('SELECT title FROM programs WHERE id = ?', [p.program_id])
  const [b] = p.batch_id ? await q('SELECT code, angkatan, start_date FROM batches WHERE id = ?', [p.batch_id]) : []
  const entries = await q('SELECT entry_date, activity, learning, hours FROM logbook_entries WHERE placement_id = ? ORDER BY entry_date', [p.id])
  const year = b ? ymd(b.start_date).slice(0, 4) : ymd(p.start_date).slice(0, 4)
  return {
    name: p.participant, nip: p.nip ?? '', program: prog?.title ?? '', company: p.company ?? '',
    angkatan: b ? `${year}${b.angkatan ? ` / Angkatan ${b.angkatan}` : ''} (${b.code})` : year,
    start: ymd(p.start_date), end: p.end_date ? ymd(p.end_date) : '',
    entries: entries.map((e) => ({ date: ymd(e.entry_date), activity: e.activity, learning: e.learning ?? '', hours: Number(e.hours) })),
  }
}

/** Ganti isi satu sel tabel dengan beberapa paragraf, memakai format paragraf dan huruf asli sel itu. */
function rebuild(cell, lines) {
  const tcPr = cell.match(/<w:tcPr>.*?<\/w:tcPr>/s)?.[0] ?? ''
  const pPr = cell.match(/<w:pPr>.*?<\/w:pPr>/s)?.[0] ?? ''
  const rPr = pPr.match(/<w:rPr>.*?<\/w:rPr>/s)?.[0] ?? ''
  const paras = (lines.length ? lines : ['']).map((l) => `<w:p>${pPr}${l === '' ? '' : `<w:r>${rPr}<w:t xml:space="preserve">${esc(l)}</w:t></w:r>`}</w:p>`).join('')
  return `<w:tc>${tcPr}${paras}</w:tc>`
}
const CELL = /<w:tc>.*?<\/w:tc>/gs
const ROW = /<w:tr[ >].*?<\/w:tr>/gs
/** Ganti sel ke-idx pada baris XML. */
const setCell = (rowXml, idx, lines) => { let i = 0; return rowXml.replace(CELL, (c) => (i++ === idx ? rebuild(c, lines) : c)) }
/** Bagi XML halaman menjadi tiga tabel (identitas, hari, tanda tangan) dan sisanya. */
function splitTables(unit) {
  const parts = []; let from = 0
  for (let i = 0; i < 3; i++) {
    const s = unit.indexOf('<w:tbl>', from), e = unit.indexOf('</w:tbl>', s) + '</w:tbl>'.length
    parts.push(unit.slice(from, s), unit.slice(s, e)); from = e
  }
  parts.push(unit.slice(from))
  return parts // [pre, info, gap1, grid, gap2, sig, tail]
}

function weekPage(unit, d, week, byDate) {
  const [p0, info, p1, grid, p2, sig, p3] = splitTables(unit)
  // Identitas.
  let r = 0
  const infoNew = info.replace(ROW, (row) => {
    const i = r++
    if (i === 0) return setCell(setCell(row, 2, [d.name]), 5, [d.program])
    if (i === 1) return setCell(setCell(row, 2, [d.nip || '-']), 5, [d.angkatan])
    if (i === 2) return setCell(row, 2, [d.company || '-'])
    if (i === 3) return setCell(row, 2, [`${longDate(d.start)} s.d. ${d.end ? longDate(d.end) : '-'}`])
    if (i === 4) return setCell(row, 2, [String(week)])
    return row
  })
  // Tabel hari: baris pertama = judul kolom, baris kedua dipakai sebagai contoh 7 hari.
  const rows = [...grid.matchAll(ROW)].map((m) => m[0])
  const head = rows[0], proto = rows[1]
  const body = []
  for (let k = 0; k < 7; k++) {
    const hariKe = (week - 1) * 7 + k + 1
    const date = addDays(d.start, hariKe - 1)
    const e = byDate.get(date)
    const dt = new Date(`${date}T00:00:00Z`)
    const lines = e ? [...e.activity.split(/\r?\n/), ...(e.learning ? [`Dipelajari: ${e.learning}`] : []), `Jam kerja: ${e.hours} jam`] : []
    let row = setCell(proto, 0, [String(hariKe)])
    row = setCell(row, 1, [`${DAY_NAMES[dt.getUTCDay()]},`, '', `${pad(dt.getUTCDate())}/${pad(dt.getUTCMonth() + 1)}/${dt.getUTCFullYear()}`])
    row = setCell(row, 2, lines)
    body.push(row)
  }
  const first = grid.indexOf(head) + head.length
  const gridNew = grid.slice(0, first) + body.join('') + '</w:tbl>'
  // Tanda tangan: nama peserta di bawah "Peserta Didik,".
  const sigNew = sig.replace(/<w:t(?: [^>]*)?>Nama<\/w:t>/, `<w:t xml:space="preserve">${esc(d.name)}</w:t>`)
  return p0 + infoNew + p1 + gridNew + p2 + sigNew + p3
}

let template = null
export function logbookDocx(d) {
  template ??= unzipSync(fs.readFileSync(path.join(ASSETS, 'logbook-magang-template.docx')))
  const xml = strFromU8(template['word/document.xml'])
  const first = xml.indexOf('<w:tbl>')
  const brk = xml.match(/<w:p [^>]*>(?:(?!<\/w:p>).)*w:br w:type="page"(?:(?!<\/w:p>).)*<\/w:p>/s)
  if (first < 0 || !brk) throw new Error('Template logbook magang tidak dikenali.')
  const brkEnd = brk.index + brk[0].length
  // Satu halaman = dari tabel identitas sampai paragraf pemisah halaman. Atribut paraId dibuang agar tidak ganda saat digandakan.
  const strip = (s) => s.replace(/ w14:paraId="[^"]*"/g, '').replace(/ w14:textId="[^"]*"/g, '')
  const unit = strip(xml.slice(first, brkEnd))
  const brkClean = strip(brk[0])
  const byDate = new Map(d.entries.map((e) => [e.date, e]))
  const last = d.entries.length ? d.entries[d.entries.length - 1].date : d.start
  const spanEnd = d.end && d.end > last ? d.end : last
  const weeks = Math.min(MAX_WEEKS, Math.max(1, Math.ceil((daysBetween(d.start, spanEnd) + 1) / 7)))
  const pages = []
  for (let w = 1; w <= weeks; w++) {
    let page = weekPage(unit, d, w, byDate)
    if (w === weeks) page = page.slice(0, page.length - brkClean.length) // halaman terakhir tanpa pemisah
    pages.push(page)
  }
  const sectAt = xml.lastIndexOf('<w:sectPr')
  const doc = xml.slice(0, first) + pages.join('') + xml.slice(sectAt)
  return { buffer: Buffer.from(zipSync({ ...template, 'word/document.xml': strToU8(doc) }, { level: 6 })), weeks }
}
