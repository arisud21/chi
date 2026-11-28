/*
 * Pembaca spreadsheet bank mata pelajaran.
 *
 * Format yang dikenali (satu lembar boleh berisi beberapa bagian, satu bagian per pelatihan):
 *
 *   ROOM DIVISION                                      <- judul bagian (nama pelatihan)
 *   No | Kode | Mata Kuliah | Keterangan | Keterangan | Jam/Pertemuan | Jumlah Pertemuan | Jumlah Jam Per Program
 *   1  | PTG  | Pengetahuan Tata Graha |  | Teori & Peraktik | 4 | 12 | 48
 *   ...
 *
 * Kolom dikenali dari judulnya, bukan urutannya. Dua kolom "Keterangan": yang berisi teori atau praktik menjadi jenis,
 * yang lain (misalnya "Kelas Gabungan") menjadi keterangan.
 */

export type SubjectKind = 'teori' | 'praktik' | 'teori_praktik'

export interface ParsedSubject {
  row: number // nomor baris di sumber, untuk pesan kesalahan
  code: string
  name: string
  kind: SubjectKind
  hours: number
  hoursPerMeeting: number | null
  meetings: number | null
  description: string
  problems: string[] // kosong bila baris siap diimpor
}
export interface ParsedSection { title: string; rows: ParsedSubject[] }

/** CSV sesuai RFC 4180 (tanda kutip, koma, baris baru di dalam sel). Pemisah tab dipakai bila hasil tempel dari spreadsheet. */
export function parseTable(text: string): string[][] {
  const raw = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text // buang BOM dari file CSV Excel
  const src = raw.split('\r\n').join('\n').split('\r').join('\n')
  const sep = src.split('\n').slice(0, 5).join('\n').includes('\t') ? '\t' : ','
  const rows: string[][] = []
  let row: string[] = [], cell = '', quoted = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i++ } else quoted = false } else cell += ch
    } else if (ch === '"' && cell === '') quoted = true
    else if (ch === sep) { row.push(cell.trim()); cell = '' }
    else if (ch === '\n') { row.push(cell.trim()); rows.push(row); row = []; cell = '' }
    else cell += ch
  }
  row.push(cell.trim()); rows.push(row)
  return rows
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const num = (s: string) => { const n = Number(String(s ?? '').replace(/[^0-9.]/g, '')); return Number.isFinite(n) && s !== '' ? Math.round(n) : NaN }

interface Cols { no: number; code: number; name: number; notes: number[]; perMeeting: number; meetings: number; total: number }

function headerCols(cells: string[]): Cols | null {
  const n = cells.map(norm)
  const no = n.findIndex((c) => c === 'no' || c === 'nomor')
  const code = n.findIndex((c) => c === 'kode')
  const name = n.findIndex((c) => /^mata (kuliah|pelajaran)$/.test(c) || c === 'nama mata pelajaran')
  if (no < 0 || name < 0) return null
  return {
    no, code, name,
    notes: [],
    perMeeting: n.findIndex((c) => /^jam (per )?pertemuan$/.test(c)),
    meetings: n.findIndex((c) => /^jumlah pertemuan$/.test(c)),
    total: n.findIndex((c) => /^jumlah jam( per program)?$/.test(c)),
  }
}

/** Kolom antara nama dan jam adalah keterangan, termasuk yang judulnya kosong (di sheet contoh kolom "Kelas Gabungan" tanpa judul). */
function withNotes(cols: Cols, cells: string[]): Cols {
  const end = [cols.perMeeting, cols.meetings, cols.total].filter((i) => i > cols.name).sort((x, y) => x - y)[0] ?? cells.length
  return { ...cols, notes: Array.from({ length: Math.max(0, end - cols.name - 1) }, (_, i) => cols.name + 1 + i) }
}

function kindOf(text: string): SubjectKind | null {
  const t = text.toLowerCase()
  const teori = /teori/.test(t), praktik = /prakt|perakt|peraktik/.test(t)
  return teori && praktik ? 'teori_praktik' : teori ? 'teori' : praktik ? 'praktik' : null
}

export function parseSubjects(text: string): ParsedSection[] {
  const grid = parseTable(text)
  const sections: ParsedSection[] = []
  for (let r = 0; r < grid.length; r++) {
    const base = headerCols(grid[r])
    if (!base) continue
    const cols = withNotes(base, grid[r])
    // Judul bagian: baris tidak kosong terdekat di atas judul kolom yang hanya punya satu sel terisi.
    let title = ''
    for (let k = r - 1; k >= 0 && k >= r - 4; k--) {
      const filled = grid[k].filter(Boolean)
      if (filled.length === 1) { title = filled[0]; break }
      if (filled.length > 1) break
    }
    const rows: ParsedSubject[] = []
    for (let k = r + 1; k < grid.length; k++) {
      const cells = grid[k]
      if (cells.every((c) => !c)) break
      if (headerCols(cells)) break
      const no = num(cells[cols.no] ?? '')
      const name = (cells[cols.name] ?? '').trim()
      if (Number.isNaN(no) || !name) continue // baris ringkasan seperti "Jam Per Minggu"
      const noteTexts = cols.notes.map((i) => (cells[i] ?? '').trim()).filter(Boolean)
      const kindText = noteTexts.find((t) => kindOf(t)) ?? ''
      const description = noteTexts.filter((t) => t !== kindText).join(', ')
      const kind = kindOf(kindText)
      const perMeeting = cols.perMeeting >= 0 ? num(cells[cols.perMeeting] ?? '') : NaN
      const meetings = cols.meetings >= 0 ? num(cells[cols.meetings] ?? '') : NaN
      // Jam total = jam per pertemuan x jumlah pertemuan bila keduanya ada (sama dengan aturan server); selain itu dari kolom jumlah jam.
      const hours = !Number.isNaN(perMeeting) && !Number.isNaN(meetings) ? perMeeting * meetings : cols.total >= 0 ? num(cells[cols.total] ?? '') : NaN
      const problems: string[] = []
      if (!kind) problems.push('Jenis (teori atau praktik) tidak terbaca')
      if (Number.isNaN(hours) || hours < 1) problems.push('Jumlah jam tidak valid (minimal 1)')
      if (name.length > 120) problems.push('Nama lebih dari 120 karakter')
      rows.push({
        row: k + 1, code: (cols.code >= 0 ? cells[cols.code] ?? '' : '').slice(0, 12), name, kind: kind ?? 'teori', hours: Number.isNaN(hours) ? 0 : hours,
        hoursPerMeeting: Number.isNaN(perMeeting) ? null : perMeeting, meetings: Number.isNaN(meetings) ? null : meetings, description, problems,
      })
    }
    if (rows.length) sections.push({ title: title || `Bagian ${sections.length + 1}`, rows })
  }
  return sections
}

/** Kecocokan nama bagian dengan nama pelatihan (0 sampai 1). Toleran terhadap "&" dan salah ketik kecil. */
export function titleScore(a: string, b: string): number {
  const x = norm(a.replace(/&/g, ' and ')).replace(/ /g, ''), y = norm(b.replace(/&/g, ' and ')).replace(/ /g, '')
  if (!x || !y) return 0
  if (x === y) return 1
  if (x.includes(y) || y.includes(x)) return 0.9
  const d: number[][] = Array.from({ length: x.length + 1 }, (_, i) => [i, ...new Array(y.length).fill(0)])
  for (let j = 1; j <= y.length; j++) d[0][j] = j
  for (let i = 1; i <= x.length; i++) for (let j = 1; j <= y.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1))
  return 1 - d[x.length][y.length] / Math.max(x.length, y.length)
}

/** Contoh format untuk diunduh. */
export const SAMPLE_CSV = [
  ',NAMA PELATIHAN,,,,,,,',
  ',No,Kode,Mata Kuliah,Keterangan,Keterangan,Jam/Pertemuan,Jumlah Pertemuan,Jumlah Jam Per Program',
  ',1,ABC,Contoh mata pelajaran praktik,,Teori & Praktik,4,12,48',
  ',2,DEF,Contoh kelas gabungan,Kelas Gabungan,Teori,2,16,32',
].join('\n')
