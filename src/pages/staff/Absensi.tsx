import { useEffect, useState } from 'react'
import { Empty, PageHeader, dateTimeID, useAct } from '../../components/ui'
import { saveAttendance, useStore } from '../../lib/store'
import type { Attendance } from '../../lib/types'

const OPTIONS: Attendance['status'][] = ['hadir', 'izin', 'sakit', 'alpa']

export function Absensi() {
  const s = useStore((x) => x)
  const me = s.users.find((u) => u.id === s.sessionUserId)!
  const act = useAct()
  const mine = s.sessions
    .filter((x) => me.role === 'super_admin' || s.batches.find((b) => b.id === x.batchId)?.instructorId === me.id)
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
  const [sid, setSid] = useState(mine[0]?.id ?? '')
  const sess = mine.find((x) => x.id === sid)
  const people = sess ? s.registrations.filter((r) => r.batchId === sess.batchId && r.status === 'active') : []
  const [marks, setMarks] = useState<Record<string, Attendance['status']>>({})

  useEffect(() => {
    const saved = Object.fromEntries(s.attendances.filter((a) => a.sessionId === sid).map((a) => [a.registrationId, a.status]))
    setMarks(Object.fromEntries(people.map((r) => [r.id, saved[r.id] ?? 'hadir'])))
  }, [sid]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <PageHeader title="Absensi" sub="Kehadiran per sesi. Persentase kehadiran peserta ikut terhitung otomatis untuk nilai yang masih draf." />
      {mine.length === 0 ? <div className="card"><Empty title="Belum ada sesi" body="Sesi dijadwalkan Akademik per angkatan." /></div> : (
        <div className="card p-5">
          <label className="block max-w-md"><span className="label">Sesi</span>
            <select className="input" value={sid} onChange={(e) => setSid(e.target.value)}>
              {mine.map((x) => <option key={x.id} value={x.id}>{x.title} · {dateTimeID(x.startAt)}</option>)}
            </select>
          </label>
          {people.length === 0 ? <Empty title="Belum ada peserta aktif" body="Peserta muncul setelah pembayarannya diverifikasi." /> : (
            <ul className="mt-4 divide-y divide-line">
              {people.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <span className="font-semibold">{s.users.find((u) => u.id === r.userId)?.name}</span>
                  <div className="flex gap-1" role="radiogroup" aria-label="Status kehadiran">
                    {OPTIONS.map((o) => (
                      <button key={o} role="radio" aria-checked={marks[r.id] === o} onClick={() => setMarks({ ...marks, [r.id]: o })}
                        className={`btn !min-h-10 !px-3 capitalize ${marks[r.id] === o ? 'bg-brand-600 text-white' : 'border border-line bg-white hover:bg-brand-50'}`}>{o}</button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {people.length > 0 && <button className="btn-primary mt-4" onClick={() => act(saveAttendance(sid, marks), 'Absensi disimpan.')}>Simpan absensi</button>}
        </div>
      )}
    </>
  )
}
