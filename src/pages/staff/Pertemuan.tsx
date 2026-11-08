import { IconPlus, IconTrash } from '@tabler/icons-react'
import { useState } from 'react'
import { Empty, Field, Modal, PageHeader, dateID, dateTimeID, useAct } from '../../components/ui'
import {
  deleteMaterial, deletePertemuan, gradeSubmission, saveAssignment, saveMaterialLink, savePertemuan, uploadMaterial, useStore,
} from '../../lib/store'

const localInput = (iso: string) => { const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16) }
const dateOnly = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3_600_000).toISOString().slice(0, 10) // tanggal kelas dalam WIB

/* ---------------- Instruktur: pertemuan, materi per pertemuan, tugas ---------------- */
export function Pertemuan() {
  const s = useStore((x) => x)
  const me = s.users.find((u) => u.id === s.sessionUserId)!
  const act = useAct()
  const batches = s.batches.filter((b) => me.role === 'super_admin' || b.instructorId === me.id)
  const [batchId, setBatchId] = useState(batches[0]?.id ?? '')
  const batch = batches.find((b) => b.id === batchId)
  const [ses, setSes] = useState<{ id?: string; subjectId: string; title: string; date: string; meetingUrl: string } | null>(null)
  const [mat, setMat] = useState<{ sessionId: string; mode: 'file' | 'link'; title: string; url: string; file: File | null } | null>(null)
  const [tg, setTg] = useState(false)
  const [t, setT] = useState({ title: '', description: '', dueAt: '' })
  const [grading, setGrading] = useState<string | null>(null)
  const [sc, setSc] = useState({ score: 0, feedback: '' })

  if (!batches.length) return <><PageHeader title="Pertemuan dan materi" /><div className="card"><Empty title="Belum ada angkatan" body="Anda belum ditunjuk mengajar di angkatan mana pun. Akademik menetapkannya di Jadwal angkatan." /></div></>
  const sessions = s.sessions.filter((x) => x.batchId === batchId).sort((a, b) => a.startAt.localeCompare(b.startAt))
  const asg = s.assignments.filter((a) => a.batchId === batchId)
  const bsubs = s.batchSubjects.filter((x) => x.batchId === batchId).map((x) => ({ ...x, subject: s.subjects.find((y) => y.id === x.subjectId), used: sessions.filter((z) => z.subjectId === x.subjectId).length }))
  const ready = !!batch?.startTime && bsubs.length > 0
  const full = bsubs.length > 0 && bsubs.every((x) => x.used >= x.sessions)

  return (
    <>
      <PageHeader title="Pertemuan dan materi" sub="Tambah pertemuan sesuai jadwal dari Akademik, lalu lampirkan materi pada tiap pertemuan."
        action={<select className="input !w-auto" value={batchId} onChange={(e) => setBatchId(e.target.value)} aria-label="Angkatan">{batches.map((b) => <option key={b.id} value={b.id}>{b.code}</option>)}</select>} />

      {batch && (ready ? (
        <div className="mb-4 rounded-xl bg-brand-50 px-4 py-3 text-sm">
          <p>Jadwal dari Akademik: <b>{batch.scheduleDays.split(',').join(', ')}</b>, {batch.startTime} sampai {batch.endTime}, {batch.location || 'lokasi belum diisi'}.</p>
          <ul className="mt-2 flex flex-wrap gap-2">{bsubs.map((x) => <li key={x.subjectId} className={`rounded-full px-3 py-1 text-xs font-semibold ${x.used >= x.sessions ? 'bg-emerald-100 text-emerald-800' : 'bg-white text-ink'}`}>{x.subject?.name}: {x.used}/{x.sessions}</li>)}</ul>
        </div>
      ) : <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">Akademik belum menetapkan hari, jam, dan mata pelajaran untuk angkatan ini, jadi pertemuan belum bisa ditambah.</p>)}

      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between"><h2 className="font-bold">Pertemuan</h2>
          <button className="btn-primary" disabled={!ready || full} title={full ? 'Semua jatah pertemuan sudah terisi' : undefined} onClick={() => setSes({ subjectId: bsubs.find((x) => x.used < x.sessions)?.subjectId ?? '', title: '', date: batch!.startDate > new Date().toISOString().slice(0, 10) ? batch!.startDate : new Date().toISOString().slice(0, 10), meetingUrl: '' })}><IconPlus size={18} />Pertemuan</button></div>
        {sessions.length === 0 ? <div className="card"><Empty title="Belum ada pertemuan" body={ready ? 'Tambah pertemuan pertama, lalu lampirkan materinya.' : 'Menunggu jadwal dari Akademik.'} /></div> : (
          <div className="space-y-3">
            {sessions.map((x, i) => {
              const mats = s.materials.filter((m) => m.sessionId === x.id)
              return (
                <article key={x.id} className="card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><p className="text-xs font-bold uppercase tracking-wider text-brass-600">Pertemuan {i + 1}{x.subjectId ? ` · ${s.subjects.find((y) => y.id === x.subjectId)?.name ?? ''}` : ''}</p><h3 className="font-bold">{x.title}</h3><p className="text-sm text-muted">{dateTimeID(x.startAt)} · {x.location || 'lokasi belum diisi'}{x.meetingUrl && <> · <a className="underline" href={x.meetingUrl} target="_blank" rel="noreferrer">tautan online</a></>}</p></div>
                    <div className="flex gap-2">
                      <button className="btn-ghost !min-h-9" onClick={() => setSes({ id: x.id, subjectId: x.subjectId ?? '', title: x.title, date: dateOnly(x.startAt), meetingUrl: x.meetingUrl ?? '' })}>Ubah</button>
                      <button className="btn-ghost !min-h-9 text-red-700" aria-label="Hapus pertemuan" onClick={() => act(deletePertemuan(x.id), 'Pertemuan dihapus beserta materinya.')}><IconTrash size={16} /></button>
                    </div>
                  </div>
                  <div className="mt-4 border-t border-line pt-3">
                    <div className="flex items-center justify-between"><h4 className="text-sm font-bold">Materi pertemuan ini</h4>
                      <div className="flex gap-2"><button className="btn-ghost !min-h-9" onClick={() => setMat({ sessionId: x.id, mode: 'file', title: '', url: '', file: null })}>Unggah berkas</button><button className="btn-ghost !min-h-9" onClick={() => setMat({ sessionId: x.id, mode: 'link', title: '', url: '', file: null })}>Tautan</button></div></div>
                    {mats.length === 0 ? <p className="mt-2 text-sm text-muted">Belum ada materi.</p> : (
                      <ul className="mt-2 space-y-2 text-sm">{mats.map((m) => (
                        <li key={m.id} className="flex items-center justify-between rounded-lg bg-canvas p-3"><a className="font-semibold underline" href={m.fileId ? `/api/files/${m.fileId}` : m.url} target="_blank" rel="noreferrer">{m.title}</a>
                          <span className="flex items-center gap-2 text-xs text-muted">{m.kind}<button aria-label="Hapus materi" className="text-red-700" onClick={() => act(deleteMaterial(m.id), 'Materi dihapus.')}><IconTrash size={16} /></button></span></li>))}</ul>)}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between"><h2 className="font-bold">Tugas</h2><button className="btn-ghost" onClick={() => { setT({ title: '', description: '', dueAt: localInput(new Date(Date.now() + 7 * 86_400_000).toISOString()) }); setTg(true) }}><IconPlus size={18} />Tugas</button></div>
        {asg.length === 0 ? <div className="card"><Empty title="Belum ada tugas" body="Buat tugas untuk angkatan ini bila diperlukan." /></div> : (
          <div className="card divide-y divide-line">{asg.map((a) => {
            const subs = s.submissions.filter((x) => x.assignmentId === a.id)
            return (
              <div key={a.id} className="p-4 text-sm">
                <p className="font-semibold">{a.title} <span className="font-normal text-muted">· batas {dateTimeID(a.dueAt)}</span></p>
                {subs.length === 0 ? <p className="text-muted">Belum ada pengumpulan.</p> : subs.map((x) => {
                  const reg = s.registrations.find((r) => r.id === x.registrationId)
                  return (
                    <div key={x.id} className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-canvas p-3">
                      <span>{s.users.find((u) => u.id === reg?.userId)?.name}{x.fileId && <> · <a className="underline" href={`/api/files/${x.fileId}`} target="_blank" rel="noreferrer">berkas</a></>}{x.note && <span className="block text-muted">{x.note}</span>}</span>
                      <span className="flex items-center gap-2">{x.score != null && <b>{x.score}</b>}<button className="btn-ghost !min-h-9" onClick={() => { setGrading(x.id); setSc({ score: x.score ?? 0, feedback: x.feedback ?? '' }) }}>Nilai</button></span>
                    </div>
                  )
                })}
              </div>
            )
          })}</div>
        )}
      </section>

      <Modal open={!!ses} title={ses?.id ? 'Ubah pertemuan' : 'Pertemuan baru'} onClose={() => setSes(null)}>
        {ses && batch && <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); act(savePertemuan({ ...ses, batchId }), 'Pertemuan disimpan.', () => setSes(null)) }}>
          <Field label="Mata pelajaran" hint="Hanya mata pelajaran yang dipilih Akademik untuk angkatan ini.">
            <select className="input" required value={ses.subjectId} onChange={(e) => setSes({ ...ses, subjectId: e.target.value })}>
              <option value="">Pilih mata pelajaran</option>
              {bsubs.map((x) => { const own = !!ses.id && sessions.find((z) => z.id === ses.id)?.subjectId === x.subjectId; const closed = x.used >= x.sessions && !own; return <option key={x.subjectId} value={x.subjectId} disabled={closed}>{x.subject?.name} ({x.used}/{x.sessions}){closed ? ' · penuh' : ''}</option> })}
            </select>
          </Field>
          <Field label="Topik pertemuan"><input className="input" required value={ses.title} onChange={(e) => setSes({ ...ses, title: e.target.value })} /></Field>
          <Field label="Tanggal" hint={`Jam otomatis ${batch.startTime} sampai ${batch.endTime} sesuai jadwal. Angkatan berjalan ${dateID(batch.startDate)} sampai ${dateID(batch.endDate)}.`}><input className="input" type="date" required min={batch.startDate} max={batch.endDate} value={ses.date} onChange={(e) => setSes({ ...ses, date: e.target.value })} /></Field>
          <Field label="Tautan pertemuan online (opsional)" hint="Harus diawali https://"><input className="input" value={ses.meetingUrl} onChange={(e) => setSes({ ...ses, meetingUrl: e.target.value })} /></Field>
          <button className="btn-primary w-full">Simpan</button>
        </form>}
      </Modal>
      <Modal open={!!mat} title={mat?.mode === 'file' ? 'Unggah materi' : 'Tautan materi'} onClose={() => setMat(null)}>
        {mat && <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); act(mat.mode === 'file' ? uploadMaterial(mat.sessionId, mat.title, mat.file!) : saveMaterialLink({ sessionId: mat.sessionId, title: mat.title, url: mat.url }), 'Materi ditambahkan.', () => setMat(null)) }}>
          <Field label="Judul materi"><input className="input" required value={mat.title} onChange={(e) => setMat({ ...mat, title: e.target.value })} /></Field>
          {mat.mode === 'file'
            ? <Field label="Berkas" hint="PDF, JPG, atau PNG. Maksimal 2 MB. Untuk video atau berkas besar, pakai tautan."><input className="input !py-2" type="file" required accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setMat({ ...mat, file: e.target.files?.[0] ?? null })} /></Field>
            : <Field label="Tautan" hint="Harus diawali https://"><input className="input" required value={mat.url} onChange={(e) => setMat({ ...mat, url: e.target.value })} /></Field>}
          <button className="btn-primary w-full">Simpan</button>
        </form>}
      </Modal>
      <Modal open={tg} title="Tugas baru" onClose={() => setTg(false)}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); act(saveAssignment({ batchId, title: t.title, description: t.description, dueAt: new Date(t.dueAt).toISOString() }), 'Tugas dibuat.', () => setTg(false)) }}>
          <Field label="Judul"><input className="input" required value={t.title} onChange={(e) => setT({ ...t, title: e.target.value })} /></Field>
          <Field label="Petunjuk"><textarea className="input !py-2" rows={3} value={t.description} onChange={(e) => setT({ ...t, description: e.target.value })} /></Field>
          <Field label="Batas pengumpulan"><input className="input" type="datetime-local" required value={t.dueAt} onChange={(e) => setT({ ...t, dueAt: e.target.value })} /></Field>
          <button className="btn-primary w-full">Buat tugas</button>
        </form>
      </Modal>
      <Modal open={!!grading} title="Nilai tugas" onClose={() => setGrading(null)}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); act(gradeSubmission(grading!, sc.score, sc.feedback), 'Nilai tugas disimpan.', () => setGrading(null)) }}>
          <Field label="Nilai (0 sampai 100)"><input className="input" type="number" min={0} max={100} required value={sc.score} onChange={(e) => setSc({ ...sc, score: +e.target.value })} /></Field>
          <Field label="Catatan untuk peserta"><textarea className="input !py-2" rows={3} maxLength={500} value={sc.feedback} onChange={(e) => setSc({ ...sc, feedback: e.target.value })} /></Field>
          <button className="btn-primary w-full">Simpan</button>
        </form>
      </Modal>
    </>
  )
}
