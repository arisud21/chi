import { bobotBerlaku, nilaiMapel, skalaHuruf, type BarisHuruf } from './nilaiMapel'
import type { State } from './store'
import STYLES from './templateStyles.xml?raw'
import { downloadBlob, esc, zip } from './xlsx'

/**
 * Ekspor "Template Nilai Akhir Mata Pelajaran - CHI": satu sheet per mata pelajaran per angkatan, dengan tata letak,
 * gaya, dan skala nilai huruf yang sama dengan berkas template (styles.xml diambil dari template).
 * Kolom Nilai Akhir, Nilai Huruf, dan Keterangan berupa rumus, jadi nilai bisa dikoreksi langsung di Excel.
 */
export interface MapelTarget { batchId: string; subjectId: string }

// Indeks gaya (cellXfs) di styles.xml template.
const S = { title: 28, sub: 29, blank: 12, label: 13, head: 4, headWide: 3, headRot2: 5, headNo: 23, no: 19, nip: 26, name: 24, absen: 22, num: 6, final: 6, huruf: 7, ket: 8, noteTitle: 16, noteLetter: 21, noteText: 20, plain: 12, sign: 27 }

const col = (i: number) => String.fromCharCode(65 + i)
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
const tanggal = (d = new Date()) => `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`

const cs = (ref: string, style: number, text: string) => `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${esc(text)}</t></is></c>`
const cn = (ref: string, style: number, n: number) => `<c r="${ref}" s="${style}"><v>${n}</v></c>`
const ce = (ref: string, style: number) => `<c r="${ref}" s="${style}"/>`

/** Rumus nilai huruf menurut skala template. */
const hurufFormula = (cell: string, skala: BarisHuruf[]) => skala.slice(0, -1).reduceRight((rest, x) => `IF(${cell}&gt;=${x.min},"${x.huruf}",${rest})`, `"${skala[skala.length - 1].huruf}"`)

function sheetXml(s: State, t: MapelTarget) {
  const b = s.batches.find((x) => x.id === t.batchId)!
  const p = s.programs.find((x) => x.id === b.programId)
  const subject = s.subjects.find((x) => x.id === t.subjectId)
  const bs = s.batchSubjects.find((x) => x.batchId === t.batchId && x.subjectId === t.subjectId)
  const teacher = s.users.find((u) => u.id === bs?.instructorId)?.name ?? ''
  const { w } = bobotBerlaku(s, b.id, t.subjectId)
  const skala = skalaHuruf(s.gradeLetters)
  const kkm = p?.rules.passingScore ?? 70
  const people = s.registrations.filter((r) => r.batchId === b.id && (r.status === 'active' || r.status === 'completed'))
    .map((r) => ({ r, name: s.users.find((u) => u.id === r.userId)?.name ?? '' }))
    .sort((a, c) => a.name.localeCompare(c.name))

  const rows: string[] = []
  const row = (n: number, cells: string, extra = '') => rows.push(`<row r="${n}"${extra}>${cells}</row>`)
  const blank = (n: number, style = S.blank) => row(n, Array.from({ length: 10 }, (_, i) => ce(`${col(i + 1)}${n}`, style)).join(''))

  rows.push('<row r="1" ht="3.75" customHeight="1"/>')
  row(2, cs('B2', S.title, 'DAFTAR NILAI AKHIR') + Array.from({ length: 9 }, (_, i) => ce(`${col(i + 2)}2`, S.title)).join(''), ' ht="20.4" customHeight="1"')
  row(3, cs('B3', S.title, 'LPK CIMAHI HOTEL INSTITUTE') + Array.from({ length: 9 }, (_, i) => ce(`${col(i + 2)}3`, S.title)).join(''), ' ht="20.4" customHeight="1"')
  row(4, Array.from({ length: 10 }, (_, i) => ce(`${col(i + 1)}4`, S.sub)).join(''), ' ht="15" customHeight="1"')
  blank(5)
  // Identitas mata pelajaran: label di kiri, nilai ditulis setelah tanda titik dua.
  row(6, cs('B6', S.label, 'MATA PELAJARAN') + cs('D6', S.label, `: ${subject?.name ?? ''}`) + cs('G6', S.label, 'PROGRAM PELATIHAN') + cs('I6', S.label, `: ${p?.title ?? ''}`))
  row(7, cs('B7', S.label, 'INSTRUKTUR') + cs('D7', S.label, `: ${teacher}`) + cs('G7', S.label, 'TAHUN ANGKATAN') + cs('I7', S.label, `: ${b.code}${b.startDate ? ` (${b.startDate.slice(0, 4)})` : ''}`))
  blank(8); blank(9)
  const heads: [string, number, string][] = [
    ['B', S.headNo, 'NO'], ['C', S.headNo, 'NIP'], ['D', S.headNo, 'NAMA PESERTA DIDIK'],
    ['E', S.head, `ABSENSI (${w.absensi}%)`], ['F', S.head, `TUGAS (${w.tugas}%)`], ['G', S.headRot2, `UTS / TEORI (${w.teori}%)`], ['H', S.headRot2, `UAS / PRAKTIK (${w.praktik}%)`],
    ['I', S.head, 'NILAI AKHIR'], ['J', S.head, 'NILAI HURUF'], ['K', S.headWide, 'KETERANGAN'],
  ]
  row(10, heads.map(([c, st, text]) => cs(`${c}10`, st, text)).join(''), ' ht="78" customHeight="1"')

  const first = 11
  people.forEach(({ r, name }, i) => {
    const n = first + i
    const v = nilaiMapel(s, b.id, t.subjectId, r.id)
    const fin = `SUM(E${n}:H${n})`
    row(n, [
      cn(`B${n}`, S.no, i + 1), cs(`C${n}`, S.nip, r.nip ?? ''), cs(`D${n}`, S.name, name),
      cn(`E${n}`, S.absen, v.poin.absensi), cn(`F${n}`, S.num, v.poin.tugas), cn(`G${n}`, S.num, v.poin.teori), cn(`H${n}`, S.num, v.poin.praktik),
      `<c r="I${n}" s="${S.final}"><f>${fin}</f><v>${v.akhir}</v></c>`,
      `<c r="J${n}" s="${S.huruf}" t="str"><f>${hurufFormula(`I${n}`, skala)}</f><v>${v.huruf}</v></c>`,
      `<c r="K${n}" s="${S.ket}" t="str"><f>IF(I${n}&gt;=${kkm},"Lulus","Tidak lulus")</f><v>${v.akhir >= kkm ? 'Lulus' : 'Tidak lulus'}</v></c>`,
    ].join(''), ' ht="15" customHeight="1"')
  })
  const last = Math.max(first, first + people.length - 1)

  // Keterangan skala nilai huruf (kiri) dan tanda tangan instruktur (kanan), seperti di template.
  let n = last + 2
  blank(n - 1)
  const noteTop = n
  row(n, cs(`B${n}`, S.noteTitle, 'Keterangan:') + cs(`I${n}`, S.plain, `Cimahi, ${tanggal()}`), ' ht="13.8"')
  skala.forEach((x, i) => {
    const r = noteTop + 1 + i
    let extra = cs(`B${r}`, S.noteLetter, x.huruf) + cs(`C${r}`, S.noteText, x.label)
    if (i === 0) extra += cs(`I${r}`, S.plain, 'Instruktur')
    if (i === 4) extra += cs(`I${r}`, S.sign, teacher ? `(${teacher})` : '(Nama Instruktur)')
    row(r, extra, ' ht="13.8"')
  })
  n = noteTop + skala.length

  const cols = [[1, 0.66], [2, 3.9], [3, 14.3], [4, 39.7], [5, 9.7], [6, 9.7], [7, 9.7], [8, 11.3], [9, 9.7], [10, 9.7], [11, 13.4], [12, 0.66]]
    .map(([i, wd]) => `<col min="${i}" max="${i}" width="${wd}" style="1" customWidth="1"/>`).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
    + `<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="B1:K${n}"/>`
    + `<sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews><sheetFormatPr defaultColWidth="9.1" defaultRowHeight="13.2"/>`
    + `<cols>${cols}</cols><sheetData>${rows.join('')}</sheetData>`
    + `<mergeCells count="3"><mergeCell ref="B2:K2"/><mergeCell ref="B3:K3"/><mergeCell ref="B4:K4"/></mergeCells>`
    + `<conditionalFormatting sqref="I${first}:I${last}"><cfRule type="iconSet" priority="1"><iconSet iconSet="3Flags"><cfvo type="percent" val="0"/><cfvo type="num" val="50"/><cfvo type="num" val="70"/></iconSet></cfRule></conditionalFormatting>`
    + `<printOptions horizontalCentered="1"/><pageMargins left="0.7" right="0.47" top="0.7" bottom="0.16" header="0.31" footer="0.31"/>`
    + `<pageSetup paperSize="9" orientation="portrait" fitToHeight="0"/></worksheet>`
}

/** Nama sheet unik, maksimal 31 karakter (batas Excel). */
function uniqueName(used: Set<string>, base: string) {
  const clean = base.replace(/[:\\/?*[\]]/g, ' ').trim()
  let name = clean.slice(0, 31)
  for (let n = 2; used.has(name.toLowerCase()); n++) name = `${clean.slice(0, 28)} ${n}`
  used.add(name.toLowerCase())
  return name
}

export function exportNilaiMapelXlsx(s: State, targets: MapelTarget[], filename: string) {
  const used = new Set<string>()
  const sheets = targets.map((t) => {
    const b = s.batches.find((x) => x.id === t.batchId)
    const subject = s.subjects.find((x) => x.id === t.subjectId)
    return { name: uniqueName(used, `${b?.code ?? ''} ${subject?.name ?? 'Mata pelajaran'}`), xml: sheetXml(s, t) }
  })
  const NS = 'http://schemas.openxmlformats.org/'
  const files: [string, string][] = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="${NS}package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${NS}package/2006/relationships"><Relationship Id="rId1" Type="${NS}officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${NS}spreadsheetml/2006/main" xmlns:r="${NS}officeDocument/2006/relationships"><sheets>${sheets.map((x, i) => `<sheet name="${esc(x.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${NS}package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${NS}officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="${NS}officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', STYLES],
    ...sheets.map((x, i): [string, string] => [`xl/worksheets/sheet${i + 1}.xml`, x.xml]),
  ]
  downloadBlob(new Blob([zip(files) as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename)
  return { sheet: sheets.length }
}
