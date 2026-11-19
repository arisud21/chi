/* Pembaca .xlsx minimal tanpa dependensi: buka zip (stored atau deflate lewat DecompressionStream) lalu baca sheet pertama sebagai tabel teks. */
import { parseTable } from './subjectImport'

async function unzip(buf: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const v = new DataView(buf), u8 = new Uint8Array(buf), dec = new TextDecoder()
  let eocd = -1
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66_000); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  if (eocd < 0) throw new Error('Berkas bukan .xlsx yang valid.')
  const count = v.getUint16(eocd + 10, true)
  let p = v.getUint32(eocd + 16, true)
  const out = new Map<string, Uint8Array>()
  for (let k = 0; k < count; k++) {
    if (v.getUint32(p, true) !== 0x02014b50) break
    const method = v.getUint16(p + 10, true), size = v.getUint32(p + 20, true)
    const nameLen = v.getUint16(p + 28, true), extraLen = v.getUint16(p + 30, true), commentLen = v.getUint16(p + 32, true)
    const local = v.getUint32(p + 42, true)
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen))
    p += 46 + nameLen + extraLen + commentLen
    if (!/\.(xml|rels)$/.test(name)) continue // hanya butuh berkas XML
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true)
    const raw = u8.subarray(start, start + size)
    if (method === 0) out.set(name, raw)
    else if (method === 8) out.set(name, new Uint8Array(await new Response(new Blob([raw as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()))
  }
  return out
}

const colIndex = (ref: string) => { let n = 0; for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1 }

/** Baca sheet pertama .xlsx menjadi baris berisi teks. Sel angka dikembalikan sebagai teks angka apa adanya. */
export async function readXlsx(file: File): Promise<string[][]> {
  const files = await unzip(await file.arrayBuffer())
  const text = (n: string) => { const b = files.get(n); return b ? new TextDecoder().decode(b) : '' }
  const xml = (n: string) => new DOMParser().parseFromString(text(n), 'application/xml')
  const shared = [...xml('xl/sharedStrings.xml').getElementsByTagName('si')].map((si) => [...si.getElementsByTagName('t')].map((t) => t.textContent ?? '').join(''))
  // Sheet pertama sesuai urutan di workbook.xml, lewat relasinya.
  let path = 'xl/worksheets/sheet1.xml'
  const first = xml('xl/workbook.xml').getElementsByTagName('sheet')[0]
  const rid = first?.getAttribute('r:id') ?? first?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')
  const rel = [...xml('xl/_rels/workbook.xml.rels').getElementsByTagName('Relationship')].find((r) => r.getAttribute('Id') === rid)
  if (rel) { const t = rel.getAttribute('Target') ?? ''; path = t.startsWith('/') ? t.slice(1) : `xl/${t.replace(/^\.\//, '')}` }
  if (!files.has(path)) throw new Error('Sheet pertama tidak ditemukan di berkas.')
  const rows: string[][] = []
  for (const row of xml(path).getElementsByTagName('row')) {
    const r = Number(row.getAttribute('r') ?? rows.length + 1) - 1
    const cells: string[] = []
    for (const c of row.getElementsByTagName('c')) {
      const t = c.getAttribute('t'), v = c.getElementsByTagName('v')[0]?.textContent ?? ''
      const val = t === 's' ? shared[Number(v)] ?? '' : t === 'inlineStr' ? [...c.getElementsByTagName('t')].map((x) => x.textContent ?? '').join('') : v
      cells[colIndex(c.getAttribute('r') ?? '')] = val
    }
    rows[r] = Array.from(cells, (x) => (x ?? '').trim())
  }
  return Array.from(rows, (x) => x ?? [])
}

/** Baca .xlsx atau .csv menjadi tabel. */
export async function readTable(file: File): Promise<string[][]> {
  if (/\.xlsx$/i.test(file.name)) return readXlsx(file)
  if (/\.xls$/i.test(file.name)) throw new Error('Format .xls lama tidak didukung. Simpan ulang sebagai .xlsx.')
  return parseTable(await file.text())
}

/** Jam dari sel Excel: pecahan hari (mis. 0.375 = 09:00) atau teks 9:00 / 09.00 / 0900. Kosong bila tidak dikenali. */
export function excelTime(v: string): string {
  const s = v.trim()
  if (/^0?\.\d+$|^0$|^1$/.test(s)) { const m = Math.round(Number(s) * 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` }
  const m = /^(\d{1,2})[:.]?(\d{2})(?::\d{2})?$/.exec(s)
  if (m && +m[1] < 24 && +m[2] < 60) return `${m[1].padStart(2, '0')}:${m[2]}`
  return ''
}

/** Tanggal dari sel Excel: nomor seri (mis. 37226) atau teks YYYY-MM-DD / DD/MM/YYYY / DD-MM-YYYY. Kosong bila tidak dikenali. */
export function excelDate(v: string): string {
  const s = v.trim()
  if (!s) return ''
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  if (/^\d+(\.\d+)?$/.test(s)) return new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 86_400_000).toISOString().slice(0, 10)
  return s // biarkan server yang menolak dengan pesan yang jelas
}
