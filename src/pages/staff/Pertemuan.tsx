import { IconAlertTriangle, IconPlus, IconTrash } from '@tabler/icons-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { rataTugas } from '../../lib/nilaiMapel'
import { Empty, Field, Modal, PageHeader, dateID, dateTimeID, useAct } from '../../components/ui'
import {
  deleteMaterial, deletePertemuan, gradeSubmission, saveAssignment, saveMaterialLink, savePertemuan, subjectTeacher, teachesBatch, unattendedSessions, uploadMaterial, useStore,
} from '../../lib/store'

const localInput = (iso: string) => { const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16) }
const dateOnly = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3_600_000).toISOString().slice(0, 10) // tanggal kelas dalam WIB

/* ---------------- Instruktur: pertemuan, materi per pertemuan, tugas ---------------- */
export function Pertemuan() {
  const s = useStore((x) => x)
  const me = s.users.find((u) => u.id === s.sessionUserId)!
  const act = useAct()
  const batches = s.batches.filter((b) => me.role === 'super_admin' || teachesBatch(s, me.id, b.id))
  const [batchId, setBatchId] = useState(batches[0]?.id ?? '')
  const mine = (subjectId?: string) => me.role === 'super_admin' || subjectTeacher(s, batchId, subjectId) === me.id
  const batch = batches.find((b) => b.id === batchId)
  const [ses, setSes] = useState<{ id?: string; subjectId: string; title: string; date: string; meetingUrl: string } | null>(null)
  const [mat, setMat] = useState<{ sessionId: string; mode: 'file' | 'link'; title: string; url: string; file: File | null } | null>(null)
  const [subjFilter, setSubjFilter] = useState('') // kosong = semua mata pelajaran yang diampu
  const [tg, setTg] = useState(false)
  const [t, setT] = useState({ subjectId: '', title: '', description: '', dueAt: '' })
  const [grading, setGrading] = useState<string | null>(null)
  const [sc, setSc] = useState({ score: 0, feedback: '' })

  if (!batches.length) return <><PageHeader title="Pertemuan dan materi" /><div className="card"><Empty title="Belum ada angkatan" body="Anda belum ditunjuk mengajar di angkatan mana pun. Akademik menetapkannya di Jadwal pembelajaran." /></div></>
  // Hanya pertemuan (dan materinya) dari mata pelajaran yang diampu instruktur ini. Super admin melihat semuanya.
  const sessions = s.sessions.filter((x) => x.batchId === batchId && mine(x.subjectId)).sort((a, b) => a.startAt.localeCompare(b.startAt))
  // Instruktur melihat tugas mata pelajaran yang ia ampu (dan tugas umum lama tanpa mata pelajaran).
  const asg = s.assignments.filter((a) => a.batchId === batchId && (!a.subjectId || mine(a.subjectId)))
  // Mata pelajaran yang diampu pengguna ini di angkatan terpilih, lengkap dengan jadwalnya dari Akademik.
  const bsubs = s.batchSubjects.filter((x) => x.batchId === batchId && mine(x.subjectId)).map((x) => ({ ...x, subject: s.subjects.find((y) => y.id === x.subjectId), used: sessions.filter((z) => z.subjectId === x.subjectId).length }))
  const open = bsubs.filter((x) => x.startTime && x.used < x.sessions)
  const ready = bsubs.some((x) => x.startTime)
  const full = ready && open.length === 0
  const ownSlot = (subjectId: string) => bsubs.find((x) => x.subjectId === subjectId)
  // Instruktur tidak bisa menambah pertemuan baru selama masih ada pertemuan yang sudah dimulai tetapi absensinya belum diisi.
  const pending = me.role === 'instruktur' ? unattendedSessions(s, me.id, batchId, true) : []
  const blocked = pending.length > 0
  const activeSubj = bsubs.some((x) => x.subjectId === subjFilter) ? subjFilter : '' // pilihan filter yang sudah tidak berlaku diabaikan
  const shown = sessions.filter((x) => !activeSubj || x.subjectId === activeSubj)
  // Tugas dikelompokkan per mata pelajaran; baris tabel = peserta aktif di angkatan.
  const shownAsg = asg.filter((a) => !activeSubj || a.subjectId === activeSubj).sort((a, b) => a.dueAt.localeCompare(b.dueAt))
  const asgGroups = [...new Set(shownAsg.map((a) => a.subjectId ?? ''))].map((sid) => ({ key: sid, name: sid ? s.subjects.find((y) => y.id === sid)?.name ?? 'Mata pelajaran' : 'Tugas umum angkatan', items: shownAsg.filter((a) => (a.subjectId ?? '') === sid) }))
  const students = s.registrations.filter((r) => r.batchId === batchId && r.status === 'active')
    .map((r) => ({ r, name: s.users.find((u) => u.id === r.userId)?.name ?? '' })).sort((a, b) => a.name.localeCompare(b.name))

  return (
    <>
      <PageHeader title="Pertemuan dan materi" sub="Tambah pertemuan sesuai jadwal dari Akademik, lalu lampirkan materi pada tiap pertemuan."
        action={<select className="input !w-auto" value={batchId} onChange={(e) => { setBatchId(e.target.value); setSubjFilter('') }} aria-label="Angkatan">{batches.map((b) => <option key={b.id} value={b.id}>{b.code}</option>)}</select>} />

      {batch && (ready ? (
        <div className="mb-4 rounded-xl bg-brand-50 px-4 py-3 text-sm">
          <p className="font-semibold">Jadwal Anda dari Akademik</p>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">{bsubs.map((x) => (
            <li key={x.subjectId} className={`rounded-lg px-3 py-2 ${x.used >= x.sessions ? 'bg-emerald-100 text-emerald-900' : 'bg-white'}`}>
              <span className="flex justify-between gap-2 font-semibold"><span>{x.subject?.name}</span><span>{x.used}/{x.sessions}</span></span>
              <span className="block text-xs text-muted">{x.startTime ? `${x.days.split(',').join(', ')}, ${x.startTime} sampai ${x.endTime} · ${x.room || 'ruang belum diisi'}` : 'Hari dan jam belum ditetapkan'}</span>
            </li>))}</ul>
        </div>
      ) : <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{bsubs.length ? 'Akademik belum menetapkan hari dan jam mata pelajaran Anda di angkatan ini' : 'Anda belum ditugaskan mengampu mata pelajaran di angkatan ini'}, jadi pertemuan belum bisa ditambah.</p>)}

      {blocked && (
        <div role="alert" className="mb-4 flex flex-wrap items-center gap-4 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          <IconAlertTriangle className="shrink-0 text-red-700" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Isi absensi peserta didik dulu sebelum menambah pertemuan baru.</p>
            <p className="mt-0.5">Belum diabsen ({pending.length}): {pending.slice(0, 4).map((x) => `${s.subjects.find((y) => y.id === x.subjectId)?.name ?? 'Pertemuan'}: ${x.title} (${dateID(x.startAt)})`).join('; ')}{pending.length > 4 ? ', dan lainnya' : ''}.</p>
          </div>
          <Link to="/admin/absensi" className="btn-primary">Isi absensi</Link>
        </div>
      )}
      <section className="mb-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold">Pertemuan</h2>
          {bsubs.length > 1 && (
            <select className="input !w-auto !min-h-10 text-sm" value={activeSubj} onChange={(e) => setSubjFilter(e.target.value)} aria-label="Filter mata pelajaran">
              <option value="">Semua mata pelajaran yang saya ampu</option>
              {bsubs.map((x) => <option key={x.subjectId} value={x.subjectId}>{x.subject?.name}</option>)}
            </select>
          )}
          <button className="btn-primary" disabled={!ready || full || blocked} title={blocked ? 'Isi absensi pertemuan sebelumnya dulu' : full ? 'Semua jatah pertemuan sudah terisi' : undefined} onClick={() => setSes({ subjectId: open[0]?.subjectId ?? '', title: '', date: batch!.startDate > new Date().toISOString().slice(0, 10) ? batch!.startDate : new Date().toISOString().slice(0, 10), meetingUrl: '' })}><IconPlus size={18} />Pertemuan</button></div>
        {shown.length === 0 ? <div className="card"><Empty title="Belum ada pertemuan" body={ready ? 'Tambah pertemuan pertama, lalu lampirkan materinya.' : 'Menunggu jadwal dari Akademik.'} /></div> : (
          <div className="space-y-3">
            {shown.map((x) => {
              const no = sessions.filter((y) => y.subjectId === x.subjectId).indexOf(x) + 1 // nomor urut per mata pelajaran
              const mats = s.materials.filter((m) => m.sessionId === x.id)
              const own = mine(x.subjectId)
              const teacher = s.users.find((u) => u.id === subjectTeacher(s, batchId, x.subjectId))?.name
              return (
                <article key={x.id} className="card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><p className="text-xs font-bold uppercase tracking-wider text-brass-600">Pertemuan {no}{x.subjectId ? ` · ${s.subjects.find((y) => y.id === x.subjectId)?.name ?? ''}` : ''}</p><h3 className="font-bold">{x.title}</h3><p className="text-sm text-muted">{dateTimeID(x.startAt)} · {x.location || 'lokasi belum diisi'}{x.meetingUrl && <> · <a className="underline" href={x.meetingUrl} target="_blank" rel="noreferrer">tautan online</a></>}</p></div>
                    {own ? (
                      <div className="flex gap-2">
                        <button className="btn-ghost !min-h-9" onClick={() => setSes({ id: x.id, subjectId: x.subjectId ?? '', title: x.title, date: dateOnly(x.startAt), meetingUrl: x.meetingUrl ?? '' })}>Ubah</button>
                        {s.attendances.some((a) => a.sessionId === x.id)
                          ? <span className="self-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800">Selesai</span>
                          : <button className="btn-ghost !min-h-9 text-red-700" aria-label="Hapus pertemuan" onClick={() => act(deletePertemuan(x.id), 'Pertemuan dihapus beserta materinya.')}><IconTrash size={16} /></button>}
                      </div>
                    ) : <span className="text-xs text-muted">Diampu {teacher ?? 'instruktur lain'}</span>}
                  </div>
                  <div className="mt-4 border-t border-line pt-3">
                    <div className="flex items-center justify-between"><h4 className="text-sm font-bold">Materi pertemuan ini</h4>
                      {own && <div className="flex gap-2"><button className="btn-ghost !min-h-9" onClick={() => setMat({ sessionId: x.id, mode: 'file', title: '', url: '', file: null })}>Unggah berkas</button><button className="btn-ghost !min-h-9" onClick={() => setMat({ sessionId: x.id, mode: 'link', title: '', url: '', file: null })}>Tautan</button></div>}</div>
                    {mats.length === 0 ? <p className="mt-2 text-sm text-muted">Belum ada materi.</p> : (
                      <ul className="mt-2 space-y-2 text-sm">{mats.map((m) => (
                        <li key={m.id} className="flex items-center justify-between rounded-lg bg-canvas p-3"><a className="font-semibold underline" href={m.fileId ? `/api/files/${m.fileId}` : m.url} target="_blank" rel="noreferrer">{m.title}</a>
                          <span className="flex items-center gap-2 text-xs text-muted">{m.kind}{own && <button aria-label="Hapus materi" className="text-red-700" onClick={() => act(deleteMaterial(m.id), 'Materi dihapus.')}><IconTrash size={16} /></button>}</span></li>))}</ul>)}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold">Tugas dan penilaian</h2>
          <div className="flex flex-wrap items-center gap-2">
            {bsubs.length > 1 && (
              <select className="input !w-auto !min-h-10 text-sm" value={activeSubj} onChange={(e) => setSubjFilter(e.target.value)} aria-label="Filter mata pelajaran tugas">
                <option value="">Semua mata pelajaran</option>
                {bsubs.map((x) => <option key={x.subjectId} value={x.subjectId}>{x.subject?.name}</option>)}
              </select>
            )}
            <button className="btn-ghost" disabled={!bsubs.length} onClick={() => { setT({ subjectId: activeSubj || bsubs[0]?.subjectId || '', title: '', description: '', dueAt: localInput(new Date(Date.now() + 7 * 86_400_000).toISOString()) }); setTg(true) }}><IconPlus size={18} />Tugas</button>
          </div></div>
        {shownAsg.length === 0 ? <div className="card"><Empty title="Belum ada tugas" body="Buat tugas untuk mata pelajaran yang Anda ampu bila diperlukan. Tugas tampil di halaman mata pelajaran itu di ruang belajar peserta." /></div> : (
          <div className="space-y-4">{asgGroups.map((grp) => (
            <div key={grp.key} className="card overflow-x-auto">
              <div className="p-4 pb-2"><h3 className="font-bold">{grp.name}</h3><p className="text-xs text-muted">{students.length} peserta aktif · {grp.items.length} tugas. Klik sel untuk memeriksa dan memberi nilai.</p></div>
              {students.length === 0 ? <p className="p-4 text-sm text-muted">Belum ada peserta aktif di angkatan ini.</p> : (
                <table className="w-full min-w-[640px] text-sm">
                  <thead><tr className="border-y border-line bg-canvas text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-3 py-2">No</th><th className="px-3 py-2">Peserta</th>
                    {grp.items.map((a) => <th key={a.id} className="px-3 py-2"><span className="block normal-case text-ink font-semibold">{a.title}</span><span className="block font-normal normal-case">batas {dateTimeID(a.dueAt)}</span></th>)}
                    <th className="px-3 py-2">Rata-rata</th>
                  </tr></thead>
                  <tbody className="divide-y divide-line">{students.map((st, i) => {
                    const cells = grp.items.map((a) => s.submissions.find((x) => x.assignmentId === a.id && x.registrationId === st.r.id))
                    const scored = cells.filter((x) => x?.score != null).map((x) => x!.score!)
                    return (
                      <tr key={st.r.id}>
                        <td className="px-3 py-2 tabular-nums">{i + 1}</td><td className="px-3 py-2 font-semibold">{st.name}</td>
                        {cells.map((x, j) => (
                          <td key={grp.items[j].id} className="px-3 py-2">
                            {!x ? <span className="text-muted">Belum kumpul</span> : (
                              <span className="flex items-center gap-2">
                                {x.fileId && <a className="underline" href={`/api/files/${x.fileId}`} target="_blank" rel="noreferrer">berkas</a>}
                                <button className={`btn-ghost !min-h-8 !px-2 ${x.score == null ? 'font-bold text-brass-600' : ''}`} onClick={() => { setGrading(x.id); setSc({ score: x.score ?? 0, feedback: x.feedback ?? '' }) }}>{x.score != null ? x.score : 'Nilai'}</button>
                              </span>
                            )}
                            {x?.note && <span className="block max-w-[14rem] truncate text-xs text-muted" title={x.note}>{x.note}</span>}
                          </td>
                        ))}
                        <td className="px-3 py-2 font-bold tabular-nums">{grp.key ? (rataTugas(s, batchId, grp.key, st.r.id) ?? '-') : scored.length ? Math.round((scored.reduce((p, n) => p + n, 0) / scored.length) * 10) / 10 : '-'}</td>
                      </tr>
                    )
                  })}</tbody>
                </table>
              )}
            </div>
          ))}</div>
        )}
      </section>

      <Modal open={!!ses} title={ses?.id ? 'Ubah pertemuan' : 'Pertemuan baru'} onClose={() => setSes(null)}>
        {ses && batch && <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); act(savePertemuan({ ...ses, batchId }), 'Pertemuan disimpan.', () => setSes(null)) }}>
          <Field label="Mata pelajaran" hint="Hanya mata pelajaran yang dipilih Akademik untuk angkatan ini.">
            <select className="input" required value={ses.subjectId} onChange={(e) => setSes({ ...ses, subjectId: e.target.value })}>
              <option value="">Pilih mata pelajaran</option>
              {bsubs.map((x) => { const own = !!ses.id && sessions.find((z) => z.id === ses.id)?.subjectId === x.subjectId; const closed = (x.used >= x.sessions && !own) || !x.startTime; return <option key={x.subjectId} value={x.subjectId} disabled={closed}>{x.subject?.name} ({x.used}/{x.sessions}){!x.startTime ? ' · jadwal belum ada' : closed ? ' · penuh' : ''}</option> })}
            </select>
          </Field>
          <Field label="Topik pertemuan"><input className="input" required value={ses.title} onChange={(e) => setSes({ ...ses, title: e.target.value })} /></Field>
          <Field label="Tanggal" hint={`${ownSlot(ses.subjectId)?.startTime ? `Jam otomatis ${ownSlot(ses.subjectId)!.startTime} sampai ${ownSlot(ses.subjectId)!.endTime} (${ownSlot(ses.subjectId)!.days.split(',').join(', ')}) di ${ownSlot(ses.subjectId)!.room || 'ruang sesuai jadwal'}. ` : ''}Angkatan berjalan ${dateID(batch.startDate)} sampai ${dateID(batch.endDate)}.`}><input className="input" type="date" required min={batch.startDate} max={batch.endDate} value={ses.date} onChange={(e) => setSes({ ...ses, date: e.target.value })} /></Field>
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
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); act(saveAssignment({ batchId, subjectId: t.subjectId, title: t.title, description: t.description, dueAt: new Date(t.dueAt).toISOString() }), 'Tugas dibuat.', () => setTg(false)) }}>
          <Field label="Mata pelajaran" hint="Tugas tampil di halaman mata pelajaran ini pada ruang belajar peserta."><select className="input" required value={t.subjectId} onChange={(e) => setT({ ...t, subjectId: e.target.value })}>{bsubs.map((x) => <option key={x.subjectId} value={x.subjectId}>{x.subject?.name}</option>)}</select></Field>
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
