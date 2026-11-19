import { IconFileSpreadsheet, IconLock } from '@tabler/icons-react'
import { useState } from 'react'
import { Empty, PageHeader, Table, useToast } from '../../components/ui'
import { exportNilaiMapelXlsx } from '../../lib/exportNilaiMapel'
import { bobotBerlaku, mapelTervalidasi, nilaiMapel } from '../../lib/nilaiMapel'
import { useStore } from '../../lib/store'

const fmt = (n: number) => String(Math.round(n * 10) / 10)

/**
 * Arsip nilai instruktur: mata pelajaran yang seluruh nilainya sudah divalidasi Akademik.
 * Hanya baca. Nilai tidak bisa diubah dari sini; perubahan hanya lewat pembatalan validasi oleh Akademik,
 * yang mengembalikan mata pelajaran ke menu Input nilai akhir.
 */
export function ArsipNilai() {
  const s = useStore((x) => x)
  const toast = useToast()
  const me = s.users.find((u) => u.id === s.sessionUserId)
  const options = s.batchSubjects
    .filter((x) => (me?.role !== 'instruktur' || x.instructorId === me.id) && s.batches.some((b) => b.id === x.batchId) && mapelTervalidasi(s, x.batchId, x.subjectId))
    .map((x) => ({ key: `${x.batchId}|${x.subjectId}`, batchId: x.batchId, subjectId: x.subjectId, batch: s.batches.find((b) => b.id === x.batchId)!, subject: s.subjects.find((y) => y.id === x.subjectId) }))
    .filter((x) => x.subject)
    .sort((a, b) => a.batch.code.localeCompare(b.batch.code) || a.subject!.name.localeCompare(b.subject!.name))
  const [sel, setSel] = useState('')
  const cur = options.find((o) => o.key === sel) ?? options[0]

  if (!cur) return <><PageHeader title="Arsip nilai" sub="Nilai mata pelajaran yang sudah divalidasi Akademik, hanya untuk dilihat." /><div className="card"><Empty title="Arsip masih kosong" body="Mata pelajaran masuk ke arsip setelah nilai seluruh pesertanya divalidasi Akademik." /></div></>

  const { w } = bobotBerlaku(s, cur.batchId, cur.subjectId)
  const kkm = s.programs.find((p) => p.id === cur.batch.programId)?.rules.passingScore ?? 70
  const people = s.registrations
    .filter((r) => r.batchId === cur.batchId && (r.status === 'active' || r.status === 'completed'))
    .map((r) => ({ r, u: s.users.find((x) => x.id === r.userId), g: s.grades.find((x) => x.registrationId === r.id) }))
    .filter((x) => x.u && x.g)
    .sort((a, b) => a.u!.name.localeCompare(b.u!.name))
  const stamp = new Date().toISOString().slice(0, 10)

  return (
    <>
      <PageHeader title="Arsip nilai" sub="Mata pelajaran yang nilainya sudah divalidasi Akademik. Data di sini terkunci dan tidak bisa diedit." />
      <section className="card mb-5 overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-3 p-5 pb-3">
          <div>
            <h2 className="flex items-center gap-2 font-bold"><IconLock size={18} className="text-muted" />{cur.batch.code} · {cur.subject!.name}</h2>
            <p className="text-sm text-muted">{people.length} peserta · bobot absensi {w.absensi}%, tugas {w.tugas}%, teori {w.teori}%, praktik {w.praktik}% · KKM {kkm}</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="block w-72 max-w-full"><span className="label">Mata pelajaran terarsip</span>
              <select className="input" value={cur.key} onChange={(e) => setSel(e.target.value)}>
                {options.map((o) => <option key={o.key} value={o.key}>{o.batch.code} · {o.subject!.name}</option>)}
              </select>
            </label>
            <button className="btn-ghost" onClick={() => {
              exportNilaiMapelXlsx(s, [{ batchId: cur.batchId, subjectId: cur.subjectId }], `arsip-nilai-${cur.batch.code}-${cur.subject!.name}-${stamp}.xlsx`.replace(/[\\/:*?"<>|\s]+/g, '-'))
              toast(`Excel diunduh: ${cur.subject!.name} ${cur.batch.code}.`, 'ok')
            }}><IconFileSpreadsheet size={18} />Ekspor Excel</button>
          </div>
        </div>
        <Table bare head={['Peserta didik', 'Absensi', 'Tugas', 'Teori / UTS', 'Praktik / UAS', 'Nilai angka', 'Huruf', 'Status']}>
          {people.map(({ r, u }) => {
            const v = nilaiMapel(s, cur.batchId, cur.subjectId, r.id)
            return (
              <tr key={r.id}>
                <td><p className="font-semibold">{u!.name}</p><p className="font-mono text-xs text-muted">{r.nip ?? '-'}</p></td>
                <td className="tabular-nums">{v.absensiPct}%</td>
                <td className="tabular-nums">{w.tugas && v.tugas != null ? fmt(v.tugas) : '-'}</td>
                <td className="tabular-nums">{w.teori && v.teori != null ? fmt(v.teori) : '-'}</td>
                <td className="tabular-nums">{w.praktik && v.praktik != null ? fmt(v.praktik) : '-'}</td>
                <td><b className="tabular-nums">{fmt(v.akhir)}</b><span className={`block text-xs font-semibold ${v.akhir >= kkm ? 'text-emerald-700' : 'text-red-700'}`}>{v.akhir >= kkm ? 'Lulus' : 'Tidak lulus'}</span></td>
                <td><b>{v.huruf}</b></td>
                <td><span className="inline-block rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">Tervalidasi</span></td>
              </tr>
            )
          })}
        </Table>
        <p className="px-5 py-3 text-xs text-muted">Arsip bersifat hanya baca. Bila ada koreksi, Akademik perlu membatalkan validasi; mata pelajaran kemudian kembali ke menu Input nilai akhir.</p>
      </section>
    </>
  )
}
