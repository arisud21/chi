import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Empty, Field, Modal, PageHeader, dateID, useAct } from '../../components/ui'
import { saveBatchSchedule, useStore } from '../../lib/store'
import type { Batch } from '../../lib/types'

const DAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']

interface Form {
  batchId: string
  instructorId: string
  location: string
  startTime: string
  endTime: string
  days: string[]
  picks: Record<string, number> // subjectId -> jumlah pertemuan; ada = dipilih
}

/** Akademik: pilih pelatihan dulu, lalu susun jadwal angkatan dan pilih mata pelajaran dari bank. */
export function Jadwal() {
  const s = useStore((x) => x)
  const act = useAct()
  const programs = s.programs.filter((p) => !p.archived)
  const [programId, setProgramId] = useState(programs[0]?.id ?? '')
  const [f, setF] = useState<Form | null>(null)
  const instructors = s.users.filter((u) => u.role === 'instruktur' && u.active)
  const bank = s.subjects.filter((x) => x.programId === programId && x.active).sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name))
  const batches = s.batches.filter((b) => b.programId === programId && b.status !== 'cancelled' && b.status !== 'finished')

  const edit = (b: Batch) => setF({
    batchId: b.id, instructorId: b.instructorId, location: b.location, startTime: b.startTime || '09:00', endTime: b.endTime || '12:00',
    days: b.scheduleDays ? b.scheduleDays.split(',') : [],
    picks: Object.fromEntries(s.batchSubjects.filter((x) => x.batchId === b.id).map((x) => [x.subjectId, x.sessions])),
  })
  const total = f ? Object.values(f.picks).reduce((a, n) => a + n, 0) : 0
  const hours = f ? bank.filter((x) => f.picks[x.id]).reduce((a, x) => a + x.hours, 0) : 0
  const prog = programs.find((p) => p.id === programId)

  return (
    <>
      <PageHeader title="Jadwal angkatan" sub="Pilih pelatihan, lalu tetapkan instruktur, hari, jam, dan mata pelajaran dari bank untuk tiap angkatannya. Instruktur mengisi pertemuan dan materinya." />
      <label className="mb-5 block max-w-sm"><span className="label">1. Pilih pelatihan</span>
        <select className="input" value={programId} onChange={(e) => setProgramId(e.target.value)}>{programs.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select>
      </label>

      {bank.length === 0 && <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">Pelatihan ini belum punya mata pelajaran aktif. <Link to="/admin/mapel" className="font-semibold underline">Tambahkan di Bank mata pelajaran</Link> dulu.</p>}

      <h2 className="mb-3 font-bold">2. Angkatan {prog?.title}</h2>
      {batches.length === 0 ? <div className="card"><Empty title="Belum ada angkatan" body="Admin Pendaftaran membuat angkatan untuk pelatihan ini lebih dulu." /></div> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {batches.map((b) => {
            const chosen = s.batchSubjects.filter((x) => x.batchId === b.id)
            const filled = s.sessions.filter((x) => x.batchId === b.id).length
            const ready = !!b.startTime && !!b.scheduleDays && chosen.length > 0
            return (
              <section key={b.id} className="card p-5">
                <div className="flex items-start justify-between gap-2">
                  <div><p className="font-bold">{b.code}</p><p className="text-sm text-muted">{dateID(b.startDate)} sampai {dateID(b.endDate)}</p></div>
                  <Badge status={b.status} />
                </div>
                {ready ? (
                  <>
                    <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div><dt className="text-muted">Hari</dt><dd className="font-semibold">{b.scheduleDays.split(',').join(', ')}</dd></div>
                      <div><dt className="text-muted">Jam</dt><dd className="font-semibold">{b.startTime} sampai {b.endTime}</dd></div>
                      <div><dt className="text-muted">Lokasi</dt><dd className="font-semibold">{b.location || '-'}</dd></div>
                      <div><dt className="text-muted">Instruktur</dt><dd className="font-semibold">{s.users.find((u) => u.id === b.instructorId)?.name ?? 'Belum ditunjuk'}</dd></div>
                    </dl>
                    <ul className="mt-4 space-y-1.5 text-sm">
                      {chosen.map((c) => {
                        const sj = s.subjects.find((x) => x.id === c.subjectId)
                        const n = s.sessions.filter((x) => x.batchId === b.id && x.subjectId === c.subjectId).length
                        return <li key={c.subjectId} className="flex items-center justify-between rounded-lg bg-canvas px-3 py-2"><span>{sj?.name}</span><span className="font-semibold">{n}/{c.sessions} pertemuan</span></li>
                      })}
                    </ul>
                  </>
                ) : <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Jadwal dan mata pelajaran belum ditetapkan. Instruktur belum bisa menambah pertemuan.</p>}
                <div className="mt-4 flex items-center justify-between gap-3">
                  <p className="text-sm text-muted">Pertemuan terisi <b className="text-ink">{filled}</b>{b.plannedSessions ? ` dari ${b.plannedSessions}` : ''}</p>
                  <button className="btn-primary !min-h-10" disabled={bank.length === 0} onClick={() => edit(b)}>{ready ? 'Ubah jadwal' : 'Tetapkan jadwal'}</button>
                </div>
              </section>
            )
          })}
        </div>
      )}

      <Modal open={!!f} title="Jadwal angkatan" onClose={() => setF(null)}>
        {f && <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); act(saveBatchSchedule({ batchId: f.batchId, instructorId: f.instructorId, days: f.days, startTime: f.startTime, endTime: f.endTime, location: f.location, subjects: Object.entries(f.picks).map(([subjectId, sessions]) => ({ subjectId, sessions })) }), 'Jadwal disimpan.', () => setF(null)) }}>
          <Field label="Instruktur pengampu"><select className="input" value={f.instructorId} onChange={(e) => setF({ ...f, instructorId: e.target.value })}><option value="">Belum ditunjuk</option>{instructors.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
          <fieldset><legend className="label">Hari kelas</legend>
            <div className="flex flex-wrap gap-2">{DAYS.map((d) => (
              <label key={d} className={`flex min-h-11 min-w-12 cursor-pointer items-center justify-center rounded-lg border px-3 text-sm font-semibold transition ${f.days.includes(d) ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-white hover:bg-brand-50'}`}>
                <input type="checkbox" className="sr-only" checked={f.days.includes(d)} onChange={(e) => setF({ ...f, days: e.target.checked ? [...f.days, d] : f.days.filter((x) => x !== d) })} />{d}
              </label>))}</div>
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Jam mulai"><input className="input" type="time" required value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} /></Field>
            <Field label="Jam selesai"><input className="input" type="time" required value={f.endTime} onChange={(e) => setF({ ...f, endTime: e.target.value })} /></Field>
          </div>
          <Field label="Lokasi"><input className="input" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></Field>

          <fieldset>
            <legend className="label">Mata pelajaran ({prog?.title})</legend>
            <p className="mb-2 text-xs text-muted">Centang yang diajarkan di angkatan ini, lalu isi jumlah pertemuan tiap mata pelajaran.</p>
            <ul className="space-y-2">
              {bank.map((x) => {
                const on = f.picks[x.id] !== undefined
                return (
                  <li key={x.id} className={`flex items-center gap-3 rounded-lg border p-3 transition ${on ? 'border-brand-200 bg-brand-50' : 'border-line bg-white'}`}>
                    <input id={`sj-${x.id}`} type="checkbox" className="size-5 shrink-0 accent-brand-600" checked={on} onChange={(e) => { const picks = { ...f.picks }; if (e.target.checked) picks[x.id] = Math.max(1, Math.ceil(x.hours / 4)); else delete picks[x.id]; setF({ ...f, picks }) }} />
                    <label htmlFor={`sj-${x.id}`} className="min-w-0 flex-1 cursor-pointer text-sm"><span className="font-semibold">{x.name}</span><span className="block text-xs text-muted capitalize">{x.kind} · {x.hours} jam</span></label>
                    {on && <label className="flex items-center gap-2 text-xs text-muted">Pertemuan<input aria-label={`Jumlah pertemuan ${x.name}`} className="input !min-h-10 !w-16 !px-2" type="number" min={1} max={50} value={f.picks[x.id]} onChange={(e) => setF({ ...f, picks: { ...f.picks, [x.id]: Math.max(1, Math.min(50, +e.target.value || 1)) } })} /></label>}
                  </li>
                )
              })}
            </ul>
            <p className="mt-2 text-sm">Terpilih <b>{Object.keys(f.picks).length}</b> mata pelajaran · <b>{total}</b> pertemuan · <b>{hours}</b> jam materi{prog ? ` (program ${prog.durationHours} jam)` : ''}</p>
          </fieldset>
          <button className="btn-primary w-full" disabled={Object.keys(f.picks).length === 0}>Simpan jadwal</button>
        </form>}
      </Modal>
    </>
  )
}
