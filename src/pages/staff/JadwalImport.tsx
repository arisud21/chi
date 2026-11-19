import { IconDownload, IconFileSpreadsheet } from '@tabler/icons-react'
import { useState } from 'react'
import { Modal, Table, useToast } from '../../components/ui'
import { importJadwal, useStore, type State } from '../../lib/store'
import { buildXlsx, downloadBlob, type Cell } from '../../lib/xlsx'
import { excelTime, readTable } from '../../lib/xlsxRead'

const DAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']
const DAY_WORDS: [RegExp, string][] = [[/^(sen|senin|mon)/, 'Sen'], [/^(sel|selasa|tue)/, 'Sel'], [/^(rab|rabu|wed)/, 'Rab'], [/^(kam|kamis|thu)/, 'Kam'], [/^(jum|jumat|jum'at|fri)/, 'Jum'], [/^(sab|sabtu|sat)/, 'Sab'], [/^(min|minggu|ahad|sun)/, 'Min']]

/** "Senin, Rabu" / "Sen-Rab-Jum" / "senin dan kamis" menjadi ['Sen','Rab',...]. Kata yang tidak dikenal dilaporkan. */
function parseDays(v: string): { days: string[]; bad: string[] } {
  const parts = v.toLowerCase().split(/[,;/&+\s-]+/).map((x) => x.trim()).filter((x) => x && x !== 'dan')
  const days: string[] = [], bad: string[] = []
  for (const p of parts) { const hit = DAY_WORDS.find(([re]) => re.test(p)); if (hit) days.push(hit[1]); else bad.push(p) }
  return { days: DAYS.filter((d) => days.includes(d)), bad }
}

const COLS = [
  { key: 'batch', header: 'Kode angkatan', test: /angkatan/, width: 26, text: true },
  { key: 'subject', header: 'Mata pelajaran (nama atau kode)', test: /mata|mapel|pelajaran|kuliah/, width: 34 },
  { key: 'instructor', header: 'Instruktur (nama atau email)', test: /instruktur|pengajar|dosen/, width: 30 },
  { key: 'days', header: 'Hari', test: /^hari/, width: 18 },
  { key: 'start', header: 'Jam mulai', test: /mulai/, width: 11, text: true },
  { key: 'end', header: 'Jam selesai', test: /selesai/, width: 11, text: true },
  { key: 'room', header: 'Ruang / kelas', test: /ruang|kelas/, width: 18 },
  { key: 'sessions', header: 'Jumlah pertemuan', test: /pertemuan/, width: 16 },
] as const
type Key = typeof COLS[number]['key']
interface Row {
  row: number; batchId: string; batchIds: string[]; subjectId: string; instructorId: string; days: string[]; startTime: string; endTime: string; room: string; sessions: number
  label: { batch: string; subject: string; instructor: string }; problems: string[]
}

const activeBatches = (s: State) => s.batches.filter((b) => b.status !== 'finished' && b.status !== 'cancelled')

/** Template impor beserta sheet referensi: kode angkatan, mata pelajaran per program, dan instruktur. */
function downloadTemplate(s: State) {
  const bs = activeBatches(s)
  const b = bs[0]
  const sj = s.subjects.find((x) => x.active && x.programId === b?.programId)
  const ins = s.users.find((u) => u.role === 'instruktur' && u.active)
  const prog = (id: string) => (id === '' ? 'Kelas gabungan (semua program)' : s.programs.find((p) => p.id === id)?.title ?? '')
  downloadBlob(buildXlsx([
    { name: 'Jadwal', cols: COLS.map((c) => ({ header: c.header, width: c.width, text: 'text' in c && c.text })), rows: [
      [b?.code ?? '', sj?.name ?? '', ins?.name ?? '', 'Senin, Rabu', '08:00', '10:00', 'Ruang 1', 8],
      ['SEMUA', s.subjects.find((x) => x.active && x.programId === '')?.name ?? '(mapel kelas gabungan)', ins?.name ?? '', 'Jumat', '13:00', '15:00', 'Aula', 6],
    ] },
    { name: 'Angkatan', cols: [{ header: 'Kode angkatan', width: 18 }, { header: 'Program', width: 30 }, { header: 'Periode', width: 26 }], rows: bs.map((x): Cell[] => [x.code, prog(x.programId), `${x.startDate} s.d. ${x.endDate}`]) },
    { name: 'Mata pelajaran', cols: [{ header: 'Kode', width: 10 }, { header: 'Mata pelajaran', width: 34 }, { header: 'Program', width: 32 }], rows: s.subjects.filter((x) => x.active).map((x): Cell[] => [x.code ?? '', x.name, prog(x.programId)]) },
    { name: 'Instruktur', cols: [{ header: 'Nama', width: 28 }, { header: 'Email', width: 30 }], rows: s.users.filter((u) => u.role === 'instruktur' && u.active).map((u): Cell[] => [u.name, u.email]) },
    { name: 'Petunjuk', cols: [{ header: 'Petunjuk pengisian', width: 110 }], rows: [
      ['Satu baris = satu mata pelajaran di satu angkatan. Baris yang mata pelajarannya sudah ada di angkatan itu akan diperbarui.'],
      ['Kode angkatan boleh lebih dari satu dipisah koma (mis. FO-2026-B3, FB-2026-B1).'],
      ['Untuk mata pelajaran KELAS GABUNGAN, isi SEMUA agar berlaku di semua angkatan aktif seluruh program, atau tulis kode-kode angkatannya.'],
      ['Hari: Senin, Selasa, Rabu, Kamis, Jumat, Sabtu, Minggu (boleh disingkat Sen, Sel, ...). Pisahkan dengan koma.'],
      ['Jam: format 24 jam, mis. 08:00 atau 13.30.'],
    ] },
  ]), 'template-impor-jadwal.xlsx')
}

function mapRows(s: State, table: string[][]): Row[] {
  const head = (table[0] ?? []).map((h) => (h ?? '').toLowerCase().trim())
  const idx = Object.fromEntries(COLS.map((c) => [c.key, head.findIndex((h) => c.test.test(h))])) as Record<Key, number>
  const missing = (['batch', 'subject', 'instructor', 'days', 'start', 'end'] as Key[]).filter((k) => idx[k] < 0)
  if (missing.length) throw new Error(`Kolom wajib tidak ditemukan: ${missing.map((k) => COLS.find((c) => c.key === k)!.header).join(', ')}. Gunakan template.`)
  const active = activeBatches(s)
  const instructors = s.users.filter((u) => u.role === 'instruktur' && u.active)
  const out: Row[] = []
  table.slice(1).forEach((cells, i) => {
    const get = (k: Key) => (idx[k] >= 0 ? (cells[idx[k]] ?? '').trim() : '')
    if (!get('batch') && !get('subject')) return // baris kosong
    const problems: string[] = []
    // Angkatan: satu kode, beberapa kode dipisah koma, atau SEMUA.
    const all = /^semua$/i.test(get('batch'))
    const codes = all ? [] : get('batch').split(/[,;]/).map((x) => x.trim()).filter(Boolean)
    const found = codes.map((c) => ({ c, b: s.batches.find((b) => b.code.toLowerCase() === c.toLowerCase()) }))
    for (const x of found) if (!x.b) problems.push(`Angkatan "${x.c}" tidak dikenal`); else if (x.b.status === 'finished' || x.b.status === 'cancelled') problems.push(`Angkatan ${x.b.code} sudah selesai/dibatalkan`)
    const targets = all ? active : found.flatMap((x) => (x.b ? [x.b] : []))
    if (!all && !codes.length) problems.push('Kode angkatan kosong')
    // Mata pelajaran dicocokkan dengan kode atau nama; harus ada di bank program angkatan atau kelas gabungan.
    const sText = get('subject').toLowerCase()
    const cands = s.subjects.filter((x) => x.active && ((x.code ?? '').toLowerCase() === sText || x.name.toLowerCase() === sText))
    const sj = targets.length ? cands.find((x) => x.programId === '' || targets.every((b) => b.programId === x.programId)) : cands[0]
    if (!sText) problems.push('Mata pelajaran kosong')
    else if (!sj) problems.push(cands.length ? `"${get('subject')}" bukan mata pelajaran program angkatan tersebut` : `Mata pelajaran "${get('subject')}" tidak dikenal`)
    if ((all || targets.length > 1) && sj && sj.programId !== '') problems.push('Lebih dari satu angkatan atau SEMUA hanya untuk mata pelajaran kelas gabungan')
    const iText = get('instructor').toLowerCase()
    const ins = instructors.find((u) => u.email.toLowerCase() === iText) ?? instructors.find((u) => u.name.toLowerCase() === iText)
    if (!ins) problems.push(iText ? `Instruktur "${get('instructor')}" tidak dikenal` : 'Instruktur kosong')
    const { days, bad } = parseDays(get('days'))
    if (!days.length) problems.push('Hari kosong atau tidak dikenal')
    if (bad.length) problems.push(`Hari tidak dikenal: ${bad.join(', ')}`)
    const startTime = excelTime(get('start')), endTime = excelTime(get('end'))
    if (!startTime || !endTime) problems.push('Jam mulai/selesai tidak valid (contoh 08:00)')
    else if (endTime <= startTime) problems.push('Jam selesai harus setelah jam mulai')
    const n = Number(get('sessions') || (sj?.meetings ?? 0) || 1)
    if (!Number.isInteger(n) || n < 1 || n > 50) problems.push('Jumlah pertemuan harus 1 sampai 50')
    const base = { startTime, endTime, days, room: get('room'), sessions: n, subjectId: sj?.id ?? '', instructorId: ins?.id ?? '' }
    const label = { subject: sj?.name ?? get('subject'), instructor: ins?.name ?? get('instructor') }
    // Kelas gabungan: satu entri untuk semua angkatannya. Mapel biasa dengan beberapa angkatan: satu entri per angkatan.
    if (sj?.programId === '' && targets.length > 1) out.push({ row: i + 2, ...base, batchId: targets[0].id, batchIds: targets.map((b) => b.id), label: { ...label, batch: all ? `SEMUA (${targets.length} angkatan)` : targets.map((b) => b.code).join(', ') }, problems })
    else if (targets.length) targets.forEach((b) => out.push({ row: i + 2, ...base, batchId: b.id, batchIds: [b.id], label: { ...label, batch: b.code }, problems }))
    else out.push({ row: i + 2, ...base, batchId: '', batchIds: [], label: { ...label, batch: get('batch') }, problems })
  })
  return out
}

export function ImportJadwalModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useStore((x) => x)
  const toast = useToast()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<{ ok: boolean; existed?: boolean; error?: string }[] | null>(null)
  const valid = rows?.filter((r) => !r.problems.length) ?? []
  const close = () => { setRows(null); setError(''); setResults(null); onClose() }
  const read = async (file?: File) => {
    setError(''); setRows(null); setResults(null)
    if (!file) return
    try { const list = mapRows(s, await readTable(file)); if (!list.length) throw new Error('Tidak ada baris data di bawah judul kolom.'); if (list.length > 500) throw new Error('Maksimal 500 jadwal sekali impor.'); setRows(list) } catch (e) { setError((e as Error).message) }
  }
  const run = async () => {
    setBusy(true)
    // Nomor baris dikirim berurutan agar hasil dari server bisa dipasangkan kembali ke entri yang sama.
    const r = await importJadwal(valid.map((x, i) => ({ row: i, batchId: x.batchId, batchIds: x.batchIds, subjectId: x.subjectId, instructorId: x.instructorId, days: x.days, startTime: x.startTime, endTime: x.endTime, room: x.room, sessions: x.sessions })))
    setBusy(false)
    if (!r.ok) return toast(r.error, 'err')
    const res = r.data as { row: number; ok: boolean; existed?: boolean; error?: string }[]
    setResults(valid.map((_, i) => res.find((x) => x.row === i) ?? { ok: false, error: 'Tidak diproses' }))
    toast(`${res.filter((x) => x.ok).length} jadwal berhasil diimpor.`)
  }
  const resultOf = (r: Row) => { const i = valid.indexOf(r); return i >= 0 ? results?.[i] : undefined }
  const downloadReport = () => {
    if (!rows) return
    downloadBlob(buildXlsx([{ name: 'Hasil impor jadwal', cols: [{ header: 'Baris', width: 7 }, { header: 'Angkatan', width: 26 }, { header: 'Mata pelajaran', width: 30 }, { header: 'Instruktur', width: 26 }, { header: 'Hasil', width: 60 }], rows: rows.map((r): Cell[] => {
      const res = resultOf(r)
      return [r.row, r.label.batch, r.label.subject, r.label.instructor, res ? (res.ok ? (res.existed ? 'Diperbarui' : 'Ditambahkan') : res.error ?? '') : r.problems.join('; ')]
    }) }]), `hasil-impor-jadwal-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }
  return (
    <Modal open={open} size="xl" title="Impor jadwal pembelajaran dari Excel" onClose={close}>
      <div className="space-y-4">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
          <li>Unduh template. Isi satu jadwal per baris: Kode angkatan, Mata pelajaran, Instruktur, Hari, Jam mulai, Jam selesai, Ruang, dan Jumlah pertemuan. Daftar kode angkatan, mata pelajaran, dan instruktur ada di sheet referensi.</li>
          <li>Untuk mata pelajaran kelas gabungan, isi Kode angkatan dengan <b>SEMUA</b> agar jadwal dan instrukturnya muncul di semua angkatan aktif seluruh program.</li>
          <li>Unggah berkas. Setiap baris diperiksa dulu. Jadwal yang sudah ada diperbarui, dan bentrok instruktur atau ruang tetap ditolak.</li>
        </ol>
        <div className="flex flex-wrap items-end gap-3">
          <button type="button" className="btn-ghost" onClick={() => downloadTemplate(s)}><IconDownload size={18} />Unduh template</button>
          <label className="block flex-1"><span className="label">Berkas Excel</span><input className="input !py-2" type="file" accept=".xlsx,.csv" onChange={(e) => { read(e.target.files?.[0]); e.target.value = '' }} /></label>
        </div>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{error}</p>}
        {rows && (
          <>
            <p className="text-sm"><b>{rows.length}</b> jadwal terbaca · <b className="text-emerald-700">{valid.length}</b> siap diimpor · <b className={rows.length - valid.length ? 'text-red-700' : ''}>{rows.length - valid.length}</b> bermasalah</p>
            <div className="max-h-80 overflow-auto rounded-lg border border-line">
              <Table bare head={['Baris', 'Angkatan', 'Mata pelajaran', 'Instruktur', 'Hari dan jam', 'Status']}>
                {rows.map((r, k) => {
                  const res = resultOf(r)
                  const good = res ? res.ok : !r.problems.length
                  const msg = res ? (res.ok ? (res.existed ? 'Diperbarui' : 'Ditambahkan') : res.error) : r.problems.length ? r.problems.join('; ') : 'Siap'
                  return <tr key={k}><td className="tabular-nums">{r.row}</td><td>{r.label.batch}</td><td className="font-semibold">{r.label.subject}</td><td>{r.label.instructor}</td><td className="whitespace-nowrap">{r.days.join(', ')}<span className="block text-xs text-muted">{r.startTime && r.endTime ? `${r.startTime} sampai ${r.endTime}` : ''}{r.room ? ` · ${r.room}` : ''}</span></td><td className={good ? 'text-emerald-700' : 'text-red-700'}>{msg}</td></tr>
                })}
              </Table>
            </div>
            {results ? (
              <div className="flex flex-wrap gap-2"><button className="btn-primary" onClick={downloadReport}><IconFileSpreadsheet size={18} />Unduh hasil impor</button><button className="btn-ghost" onClick={close}>Selesai</button></div>
            ) : (
              <button className="btn-primary w-full" disabled={!valid.length || busy} onClick={run}>{busy ? 'Mengimpor…' : `Impor ${valid.length} jadwal`}</button>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
