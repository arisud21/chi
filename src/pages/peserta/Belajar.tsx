import { IconArrowLeft, IconLock } from '@tabler/icons-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Empty, Field, Modal, PageHeader, Reveal, Table, dateTimeID, useAct } from '../../components/ui'
import { DOC_KINDS, submitWork, useStore } from '../../lib/store'
import { SUBJECT_KIND } from '../staff/ImporMapel'
import { LockedNotice } from './DataDiri'
import { useMe } from './Peserta'

/** Tugas satu mata pelajaran (subjectId) atau tugas umum angkatan tanpa mata pelajaran (subjectId kosong). */
function Tugas({ batchId, regId, subjectId = '' }: { batchId: string; regId: string; subjectId?: string }) {
  const s = useStore((x) => x)
  const act = useAct()
  const [open, setOpen] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const list = s.assignments.filter((a) => a.batchId === batchId && (a.subjectId ?? '') === subjectId).sort((a, b) => a.dueAt.localeCompare(b.dueAt))
  if (!list.length) return <p className="text-sm text-muted">Belum ada tugas.</p>
  return (
    <>
      <ul className="space-y-2 text-sm">
        {list.map((a) => {
          const sub = s.submissions.find((x) => x.assignmentId === a.id && x.registrationId === regId)
          const late = new Date(a.dueAt) < new Date()
          return (
            <li key={a.id} className="rounded-lg bg-canvas p-3">
              <p className="font-semibold">{a.title}</p>
              <p className="text-muted">Batas {dateTimeID(a.dueAt)}</p>
              {sub ? <p className="mt-1 text-emerald-700">Terkumpul{sub.score != null ? ` · nilai ${sub.score}` : ' · menunggu penilaian'}{sub.feedback ? ` · ${sub.feedback}` : ''}</p> : late ? <p className="mt-1 text-red-700">Batas lewat</p> : null}
              {!late && <button className="btn-ghost mt-2 !min-h-9" onClick={() => { setOpen(a.id); setNote(sub?.note ?? ''); setFile(null) }}>{sub ? 'Kirim ulang' : 'Kumpulkan'}</button>}
            </li>
          )
        })}
      </ul>
      <Modal open={!!open} title={list.find((a) => a.id === open)?.title ?? ''} onClose={() => setOpen(null)}>
        <p className="mb-3 text-sm text-muted">{list.find((a) => a.id === open)?.description}</p>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); act(submitWork(open!, note, file), 'Tugas terkumpul.', () => setOpen(null)) }}>
          <Field label="Catatan"><textarea className="input !py-2" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <Field label="Berkas (opsional)" hint="JPG, PNG, atau PDF. Maksimal 2 MB."><input className="input !py-2" type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
          <button className="btn-primary w-full">Kirim</button>
        </form>
      </Modal>
    </>
  )
}

export function Belajar() {
  const { s, me, regs } = useMe()
  const learning = regs.filter((r) => r.status === 'active' || r.status === 'completed')
  if (!learning.length) return <><PageHeader title="Ruang belajar" /><div className="card"><Empty title="Ruang belajar belum terbuka" body="Ruang belajar terbuka setelah pembayaran Anda diverifikasi." action={<Link to="/app/pendaftaran" className="btn-primary">Cek status pembayaran</Link>} /></div></>
  if (!me.profileDone) return <><PageHeader title="Ruang belajar" /><LockedNotice /></>
  const docCount = DOC_KINDS.filter((k) => s.documents.some((d) => d.kind === k)).length
  if (docCount < DOC_KINDS.length) return (
    <>
      <PageHeader title="Ruang belajar" />
      <div role="alert" className="card flex flex-wrap items-center justify-between gap-4 p-6">
        <div className="flex items-start gap-3"><IconLock className="mt-0.5 shrink-0 text-amber-700" /><div><p className="font-semibold">Ruang belajar terkunci</p><p className="text-sm text-muted">Unggah kelima berkas registrasi ulang (KTP, ijazah, pas foto, KK, dan surat keterangan tidak buta warna) agar jadwal, materi, dan tugas terbuka. Baru {docCount} dari {DOC_KINDS.length} berkas terunggah.</p></div></div>
        <Link to="/app" className="btn-primary">Unggah berkas</Link>
      </div>
    </>
  )
  return (
    <>
      <PageHeader title="Ruang belajar" />
      <div className="space-y-6">
        {learning.map((r) => {
          const b = s.batches.find((x) => x.id === r.batchId)
          const p = s.programs.find((x) => x.id === r.programId)!
          if (!b) return (
            <Reveal key={r.id}><div className="card p-5"><p className="font-bold">{p.title}</p><p className="mt-1 text-sm text-muted">Pembayaran Anda sudah dikonfirmasi. Admin sedang menentukan angkatan Anda. Jadwal dan materi akan muncul di sini setelah angkatan ditetapkan.</p>
              <Kurikulum programId={p.id} /></div></Reveal>
          )
          return <Reveal key={r.id}><KelasCard regId={r.id} batchId={b.id} programId={p.id} /></Reveal>
        })}
      </div>
    </>
  )
}

/** Mata pelajaran di bank program (sebelum angkatan dan jadwalnya ditetapkan Akademik). */
function Kurikulum({ programId }: { programId: string }) {
  const s = useStore((x) => x)
  const list = s.subjects.filter((x) => x.active && x.programId === programId).sort((a, b) => a.name.localeCompare(b.name))
  if (!list.length) return null
  return (
    <div className="mt-4">
      <h3 className="mb-2 text-sm font-bold">Mata kuliah program ini</h3>
      <ul className="grid gap-2 text-sm sm:grid-cols-2">{list.map((x) => <li key={x.id} className="rounded-lg bg-canvas px-3 py-2"><span className="font-semibold">{x.name}</span><span className="block text-xs text-muted">{SUBJECT_KIND[x.kind]} · {x.hours} jam</span></li>)}</ul>
    </div>
  )
}

const DAY_NAME: Record<string, string> = { Sen: 'Senin', Sel: 'Selasa', Rab: 'Rabu', Kam: 'Kamis', Jum: 'Jumat', Sab: 'Sabtu', Min: 'Minggu' }
const DAY_ORDER = Object.keys(DAY_NAME)

/** Jadwal satu mata pelajaran dalam bentuk teks: "Senin, Rabu, 09:00 sampai 10:30". */
const jadwalText = (x: { days: string; startTime: string; endTime: string }) => `${x.days ? x.days.split(',').map((d) => DAY_NAME[d] ?? d).join(', ') : '-'}${x.startTime ? `, ${x.startTime} sampai ${x.endTime}` : ''}`

/** Satu program yang diikuti: tabel mata kuliah dari jadwal Akademik. Detail tiap mata kuliah dibuka di halaman tersendiri. */
function KelasCard({ regId, batchId, programId }: { regId: string; batchId: string; programId: string }) {
  const s = useStore((x) => x)
  const b = s.batches.find((x) => x.id === batchId)!
  const p = s.programs.find((x) => x.id === programId)!
  const allSessions = s.sessions.filter((x) => x.batchId === b.id)
  const general = s.assignments.some((a) => a.batchId === b.id && !a.subjectId) // tugas umum lama tanpa mata kuliah
  const subjects = s.batchSubjects.filter((x) => x.batchId === b.id)
    .map((x) => ({ ...x, subject: s.subjects.find((y) => y.id === x.subjectId), teacher: s.users.find((u) => u.id === x.instructorId)?.name, held: allSessions.filter((y) => y.subjectId === x.subjectId).length, tasks: s.assignments.filter((a) => a.batchId === b.id && a.subjectId === x.subjectId).length }))
    .sort((a, c) => DAY_ORDER.indexOf(a.days.split(',')[0]) - DAY_ORDER.indexOf(c.days.split(',')[0]) || a.startTime.localeCompare(c.startTime))
  return (
    <section className="card p-5">
      <h2 className="font-display text-xl font-bold">{p.title} <span className="text-sm font-normal text-muted">· {b.code}</span></h2>

      <h3 className="mb-2 mt-4 text-sm font-bold">Mata kuliah ({subjects.length})</h3>
      {subjects.length === 0 ? (
        <><p className="text-sm text-muted">Akademik belum menetapkan jadwal mata kuliah untuk angkatan Anda.</p><Kurikulum programId={p.id} /></>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line">
          <Table bare head={['No', 'Mata kuliah', 'Instruktur', 'Hari dan jam', 'Ruang', 'Pertemuan', 'Tugas', '']}>
            {subjects.map((x, i) => (
              <tr key={x.subjectId}>
                <td className="tabular-nums text-muted">{i + 1}</td>
                <td><Link to={`/app/belajar/${b.id}/${x.subjectId}`} className="font-semibold text-brand-700 hover:underline">{x.subject?.name}</Link><p className="text-xs text-muted">{x.subject?.programId === '' ? 'Kelas gabungan · ' : ''}{x.subject ? SUBJECT_KIND[x.subject.kind] : ''}</p></td>
                <td>{x.teacher ?? '-'}</td>
                <td>{jadwalText(x)}</td>
                <td>{x.room || '-'}</td>
                <td className="whitespace-nowrap tabular-nums">{x.held}/{x.sessions}</td>
                <td className="tabular-nums">{x.tasks}</td>
                <td className="text-right"><Link to={`/app/belajar/${b.id}/${x.subjectId}`} className="btn-primary !min-h-9 whitespace-nowrap">Buka</Link></td>
              </tr>
            ))}
          </Table>
        </div>
      )}

      <div className="mt-6">
        {general && <div><h3 className="mb-2 text-sm font-bold">Tugas umum angkatan</h3><Tugas batchId={b.id} regId={regId} /></div>}
      </div>
    </section>
  )
}

const ATT_LABEL: Record<string, string> = { hadir: 'Hadir', izin: 'Izin', sakit: 'Sakit', alpa: 'Alpa' }
const ATT_CLS: Record<string, string> = { hadir: 'bg-emerald-50 text-emerald-800 ring-emerald-200', izin: 'bg-sky-50 text-sky-800 ring-sky-200', sakit: 'bg-amber-50 text-amber-800 ring-amber-200', alpa: 'bg-red-50 text-red-800 ring-red-200' }

/** Halaman detail satu mata kuliah: info, pertemuan dan materi, tugas, serta nilai (kehadiran dan nilai tugas) mata kuliah itu. */
export function MataKuliah() {
  const { batchId = '', subjectId = '' } = useParams()
  const { s, regs } = useMe()
  const reg = regs.find((r) => r.batchId === batchId && (r.status === 'active' || r.status === 'completed'))
  const bs = s.batchSubjects.find((x) => x.batchId === batchId && x.subjectId === subjectId)
  const back = <Link to="/app/belajar" className="btn-ghost !min-h-9 !px-2"><IconArrowLeft size={18} />Ruang belajar</Link>
  if (!reg || !bs) return <><PageHeader title="Mata kuliah" action={back} /><div className="card"><Empty title="Mata kuliah tidak ditemukan" body="Mata kuliah ini tidak ada di jadwal angkatan Anda, atau ruang belajar belum terbuka." /></div></>
  const sj = s.subjects.find((x) => x.id === subjectId)
  const b = s.batches.find((x) => x.id === batchId)
  const teacher = s.users.find((u) => u.id === bs.instructorId)?.name
  const sessions = s.sessions.filter((x) => x.batchId === batchId && x.subjectId === subjectId).sort((a, c) => a.startAt.localeCompare(c.startAt))
  const mats = s.materials.filter((x) => x.batchId === batchId)
  const att = (sid: string) => s.attendances.find((a) => a.sessionId === sid && a.registrationId === reg.id)?.status
  const recorded = sessions.filter((x) => att(x.id))
  const hadir = recorded.filter((x) => att(x.id) === 'hadir').length
  const pct = recorded.length ? Math.round((hadir / recorded.length) * 100) : null
  const tasks = s.assignments.filter((a) => a.batchId === batchId && a.subjectId === subjectId)
  const scores = tasks.map((a) => s.submissions.find((x) => x.assignmentId === a.id && x.registrationId === reg.id)?.score).filter((v): v is number => v != null)
  const avg = scores.length ? Math.round((scores.reduce((t, v) => t + v, 0) / scores.length) * 10) / 10 : null
  const min = s.programs.find((p) => p.id === reg.programId)?.rules.minAttendance ?? 0
  return (
    <>
      <PageHeader title={sj?.name ?? 'Mata kuliah'} sub={`${b?.code ?? ''}${sj?.programId === '' ? ' · Kelas gabungan' : ''}${sj ? ` · ${SUBJECT_KIND[sj.kind]}` : ''}`} action={back} />
      <section className="card mb-5 p-5">
        <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-xs text-muted">Instruktur</dt><dd className="font-semibold">{teacher ?? '-'}</dd></div>
          <div><dt className="text-xs text-muted">Hari dan jam</dt><dd className="font-semibold">{jadwalText(bs)}</dd></div>
          <div><dt className="text-xs text-muted">Ruang</dt><dd className="font-semibold">{bs.room || '-'}</dd></div>
          <div><dt className="text-xs text-muted">Pertemuan</dt><dd className="font-semibold">{sessions.length} dari {bs.sessions}</dd></div>
        </dl>
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-2">
          <h2 className="mb-3 font-bold">Pertemuan dan materi</h2>
          {sessions.length === 0 ? <p className="text-sm text-muted">Instruktur belum menambahkan pertemuan untuk mata kuliah ini.</p> : (
            <ol className="space-y-2 text-sm">{sessions.map((x, i) => {
              const ms = mats.filter((m) => m.sessionId === x.id)
              const st = att(x.id)
              return (
                <li key={x.id} className="rounded-lg bg-canvas p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-semibold"><span className="text-brass-600">Pertemuan {i + 1}.</span> {x.title}</p>
                    {st && <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${ATT_CLS[st]}`}>{ATT_LABEL[st]}</span>}
                  </div>
                  <p className="text-muted">{dateTimeID(x.startAt)} · {x.location}{x.meetingUrl && <> · <a className="underline" href={x.meetingUrl} target="_blank" rel="noreferrer">gabung online</a></>}</p>
                  {ms.length > 0 ? <ul className="mt-2 space-y-1">{ms.map((m) => <li key={m.id}><a className="flex items-center justify-between rounded-md bg-white px-3 py-2 transition hover:bg-brand-50" href={m.fileId ? `/api/files/${m.fileId}` : m.url} target="_blank" rel="noreferrer"><span className="font-medium">{m.title}</span><span className="text-xs text-muted">{m.kind}</span></a></li>)}</ul>
                    : <p className="mt-1 text-xs text-muted">Belum ada materi.</p>}
                </li>
              )
            })}</ol>
          )}
        </section>

        <div className="space-y-5">
          <section className="card p-5">
            <h2 className="mb-3 font-bold">Nilai mata kuliah</h2>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs text-muted">Kehadiran</dt>
                <dd>{pct === null ? <span className="text-muted">Belum ada absensi</span> : <><b className={`text-xl ${pct < min ? 'text-red-700' : ''}`}>{pct}%</b> <span className="text-muted">({hadir} hadir dari {recorded.length} pertemuan diabsen, minimal {min}%)</span></>}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Rata-rata nilai tugas</dt>
                <dd>{avg === null ? <span className="text-muted">{tasks.length ? 'Belum ada tugas yang dinilai' : 'Belum ada tugas'}</span> : <><b className="text-xl">{avg}</b> <span className="text-muted">dari {scores.length} tugas dinilai</span></>}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-muted">Nilai akhir program ditampilkan di halaman Ruang belajar setelah divalidasi Akademik.</p>
          </section>
          <section className="card p-5">
            <h2 className="mb-3 font-bold">Tugas</h2>
            <Tugas batchId={batchId} regId={reg.id} subjectId={subjectId} />
          </section>
        </div>
      </div>
    </>
  )
}
