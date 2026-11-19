import { IconLogin2 } from '@tabler/icons-react'
import { useNavigate } from 'react-router-dom'
import { Empty, Table, useAct } from '../../components/ui'
import { impersonate, useStore } from '../../lib/store'

/**
 * Dashboard Super Admin: pantau kelengkapan kerja tiap instruktur (pertemuan, absensi, nilai) dan masuk sebagai instruktur
 * untuk melengkapinya bila instruktur tidak mengisi. Setiap perpindahan akun tercatat di audit log.
 */
export function PantauInstruktur() {
  const s = useStore((x) => x)
  const act = useAct()
  const nav = useNavigate()
  const rows = s.users.filter((u) => u.role === 'instruktur' && u.active !== false).map((u) => {
    const mine = s.batchSubjects.filter((bs) => bs.instructorId === u.id && s.batches.some((b) => b.id === bs.batchId && b.status !== 'draft' && b.status !== 'cancelled'))
    let planned = 0, made = 0, unattended = 0, toSubmit = 0
    for (const bs of mine) {
      const ses = s.sessions.filter((x) => x.batchId === bs.batchId && x.subjectId === bs.subjectId)
      planned += bs.sessions; made += ses.length
      unattended += ses.filter((x) => !s.attendances.some((a) => a.sessionId === x.id)).length
      const regIds = new Set(s.registrations.filter((r) => r.batchId === bs.batchId && r.status === 'active').map((r) => r.id))
      if (regIds.size && !s.subjectGrades.some((g) => g.subjectId === bs.subjectId && regIds.has(g.registrationId) && g.status !== 'draft')) toSubmit++
    }
    return { u, mapel: mine.length, planned, made, unattended, toSubmit }
  }).filter((x) => x.mapel > 0).sort((a, b) => (b.unattended + b.toSubmit + (b.planned - b.made)) - (a.unattended + a.toSubmit + (a.planned - a.made)))
  return (
    <section className="card overflow-hidden lg:col-span-3" aria-labelledby="pi-h">
      <div className="p-5 pb-3">
        <h2 id="pi-h" className="font-bold">Pantau instruktur</h2>
        <p className="text-sm text-muted">Bila instruktur belum membuat pertemuan, mengisi absensi, atau menyetor nilai, Anda dapat masuk sebagai instruktur itu untuk melengkapinya. Perpindahan akun tercatat di audit log.</p>
      </div>
      {rows.length === 0 ? <Empty title="Belum ada instruktur yang mengampu" body="Instruktur muncul setelah Akademik menetapkan jadwal pembelajaran." /> : (
        <Table bare head={['Instruktur', 'Mata pelajaran', 'Pertemuan dibuat', 'Belum diabsen', 'Nilai belum disetor', '']}>
          {rows.map(({ u, mapel, planned, made, unattended, toSubmit }) => (
            <tr key={u.id}>
              <td><p className="font-semibold">{u.name}</p><p className="text-xs text-muted">{u.email}</p></td>
              <td className="tabular-nums">{mapel}</td>
              <td className={`tabular-nums ${made < planned ? 'font-semibold text-amber-800' : ''}`}>{made}/{planned}</td>
              <td className={`tabular-nums ${unattended ? 'font-semibold text-red-700' : ''}`}>{unattended}</td>
              <td className={`tabular-nums ${toSubmit ? 'font-semibold text-amber-800' : ''}`}>{toSubmit} mapel</td>
              <td className="text-right"><button className="btn-ghost !min-h-9" onClick={() => act(impersonate(u.id), `Masuk sebagai ${u.name}.`, () => nav('/admin'))}><IconLogin2 size={16} />Masuk sebagai</button></td>
            </tr>
          ))}
        </Table>
      )}
    </section>
  )
}
