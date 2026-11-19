import { Empty, PageHeader, Table } from '../../components/ui'
import { bobotBerlaku } from '../../lib/nilaiMapel'
import { useStore } from '../../lib/store'
import { BobotDefault, BobotMapelPanel, SkalaHurufPanel } from './NilaiMapel'

/** Menu Akademik: bobot nilai default, bobot tiap mata pelajaran, dan skala nilai huruf yang berlaku untuk seluruh mata pelajaran. */
export function BobotSkala() {
  const s = useStore((x) => x)
  const rows = s.batchSubjects
    .map((x) => ({ x, batch: s.batches.find((b) => b.id === x.batchId), subject: s.subjects.find((y) => y.id === x.subjectId), teacher: s.users.find((u) => u.id === x.instructorId)?.name }))
    .filter((r) => r.batch && r.subject)
    .sort((a, b) => a.batch!.code.localeCompare(b.batch!.code) || a.subject!.name.localeCompare(b.subject!.name))
  return (
    <>
      <PageHeader title="Bobot dan skala nilai" sub="Atur bobot nilai default (absensi, tugas, teori, praktik) dan skala nilai huruf untuk seluruh mata pelajaran. Instruktur pengampu dapat menyesuaikan bobot mapelnya sendiri di menu Input nilai akhir; Akademik juga dapat mengubahnya di sini." />
      <BobotDefault />
      <SkalaHurufPanel />
      <section className="card mb-5 overflow-hidden" aria-labelledby="bs-h">
        <div className="p-5 pb-3"><h2 id="bs-h" className="font-bold">Bobot nilai tiap mata pelajaran</h2>
          <p className="text-sm text-muted">Mapel dengan label "Default Akademik" otomatis mengikuti bobot default di atas.</p></div>
        {rows.length === 0 ? <Empty title="Belum ada mata pelajaran" body="Mata pelajaran muncul setelah jadwal pembelajaran angkatan dibuat." /> : (
          <Table bare head={['Angkatan dan mata pelajaran', 'Pengampu', 'Bobot nilai']}>
            {rows.map(({ x, batch, subject, teacher }) => {
              const { w, own } = bobotBerlaku(s, x.batchId, x.subjectId)
              return (
                <tr key={`${x.batchId}|${x.subjectId}`}>
                  <td><p className="font-semibold">{subject!.name}</p><p className="text-xs text-muted">{batch!.code}</p></td>
                  <td>{teacher ?? <span className="text-muted">Belum ditentukan</span>}</td>
                  <td><BobotMapelPanel batchId={x.batchId} subjectId={x.subjectId} name={`${batch!.code} · ${subject!.name}`} kind={subject!.kind} w={w} own={own} /></td>
                </tr>
              )
            })}
          </Table>
        )}
      </section>
    </>
  )
}
