import { IconPrinter } from '@tabler/icons-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CertificateView } from '../../components/Certificate'
import { Badge, Empty, Field, Modal, PageHeader, Reveal, dateID, dateTimeID, useAct } from '../../components/ui'
import { finalScore, submitWork, useStore } from '../../lib/store'
import { LockedNotice } from './DataDiri'
import { useMe } from './Peserta'

function Tugas({ batchId, regId }: { batchId: string; regId: string }) {
  const s = useStore((x) => x)
  const act = useAct()
  const [open, setOpen] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const list = s.assignments.filter((a) => a.batchId === batchId)
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
  return (
    <>
      <PageHeader title="Ruang belajar" />
      <div className="space-y-6">
        {learning.map((r) => {
          const b = s.batches.find((x) => x.id === r.batchId)
          const p = s.programs.find((x) => x.id === r.programId)!
          if (!b) return <Reveal key={r.id}><div className="card p-5"><p className="font-bold">{p.title}</p><p className="mt-1 text-sm text-muted">Pembayaran Anda sudah dikonfirmasi. Admin sedang menentukan angkatan Anda. Jadwal dan materi akan muncul di sini setelah angkatan ditetapkan.</p></div></Reveal>
          const g = s.grades.find((x) => x.registrationId === r.id)
          const sessions = s.sessions.filter((x) => x.batchId === b.id).sort((a, c) => a.startAt.localeCompare(c.startAt))
          const mats = s.materials.filter((x) => x.batchId === b.id)
          return (
            <Reveal key={r.id}>
              <section className="card p-5">
                <h2 className="font-display text-xl font-bold">{p.title} <span className="text-sm font-normal text-muted">· {b.code}</span></h2>
                <div className="mt-4 grid gap-6 lg:grid-cols-4">
                  <div className="lg:col-span-2"><h3 className="mb-2 text-sm font-bold">Pertemuan dan materi</h3>
                    {b.scheduleDays && <p className="mb-2 text-xs text-muted">Kelas {b.scheduleDays.split(',').join(', ')}, {b.startTime} sampai {b.endTime}</p>}
                    {sessions.length === 0 ? <p className="text-sm text-muted">Instruktur belum menambahkan pertemuan.</p> : (
                      <ol className="space-y-2 text-sm">{sessions.map((x, i) => {
                        const ms = mats.filter((m) => m.sessionId === x.id)
                        return (
                          <li key={x.id} className="rounded-lg bg-canvas p-3">
                            {x.subjectId && <p className="text-xs font-bold uppercase tracking-wide text-brass-600">{s.subjects.find((y) => y.id === x.subjectId)?.name}</p>}
                            <p className="font-semibold"><span className="text-brass-600">{i + 1}.</span> {x.title}</p>
                            <p className="text-muted">{dateTimeID(x.startAt)} · {x.location}{x.meetingUrl && <> · <a className="underline" href={x.meetingUrl} target="_blank" rel="noreferrer">gabung online</a></>}</p>
                            {ms.length > 0 && <ul className="mt-2 space-y-1">{ms.map((m) => <li key={m.id}><a className="flex items-center justify-between rounded-md bg-white px-3 py-2 transition hover:bg-brand-50" href={m.fileId ? `/api/files/${m.fileId}` : m.url} target="_blank" rel="noreferrer"><span className="font-medium">{m.title}</span><span className="text-xs text-muted">{m.kind}</span></a></li>)}</ul>}
                          </li>
                        )
                      })}</ol>)}
                  </div>
                  <div><h3 className="mb-2 text-sm font-bold">Tugas</h3><Tugas batchId={b.id} regId={r.id} /></div>
                  <div><h3 className="mb-2 text-sm font-bold">Nilai</h3>
                    {g && g.status === 'validated' ? (
                      <div className="rounded-lg bg-canvas p-3 text-sm">
                        <p>Nilai akhir <b className="text-xl">{finalScore(g, p)}</b></p>
                        <p className="text-muted">Kehadiran {g.attendancePct}% · KKM {p.rules.passingScore}</p>
                        <p className={`mt-1 font-semibold ${g.passed ? 'text-emerald-700' : 'text-red-700'}`}>{g.passed ? 'Lulus' : 'Belum lulus'}</p>
                        <a className="mt-2 inline-block font-semibold text-brand-600 underline" href={`/api/transcripts/${r.id}/pdf`} target="_blank" rel="noreferrer">Unduh transkrip</a>
                      </div>
                    ) : <p className="text-sm text-muted">Nilai tampil setelah divalidasi Akademik.</p>}
                  </div>
                </div>
              </section>
            </Reveal>
          )
        })}
      </div>
    </>
  )
}

export function SertifikatSaya() {
  const { s, me, regs } = useMe()
  const certs = s.certificates.filter((c) => regs.some((r) => r.id === c.registrationId))
  const [view, setView] = useState<string | null>(null)
  const cert = certs.find((c) => c.id === view)
  const reg = cert && regs.find((r) => r.id === cert.registrationId)
  const prog = reg && s.programs.find((p) => p.id === reg.programId)
  return (
    <>
      <PageHeader title="Sertifikat" sub="Unduh sertifikat setelah dinyatakan lulus." />
      {certs.length === 0 ? <div className="card"><Empty title="Belum ada sertifikat" body="Sertifikat terbit otomatis setelah Akademik memvalidasi kelulusan Anda." /></div> : (
        <div className="grid gap-3 md:grid-cols-2">
          {certs.map((c) => (
            <div key={c.id} className="card flex items-center justify-between gap-3 p-5">
              <div><p className="font-mono text-sm font-bold">{c.number}</p><p className="text-sm text-muted">Terbit {dateID(c.issuedAt)}</p></div>
              <div className="flex items-center gap-2"><Badge status={c.status} />{c.status === 'issued' && <button className="btn-primary" onClick={() => setView(c.id)}>Lihat</button>}</div>
            </div>
          ))}
        </div>
      )}
      <Modal open={!!cert} title="Sertifikat" onClose={() => setView(null)}>
        {cert && prog && <>
          <CertificateView cert={cert} user={me} program={prog} instName={s.settings.name} signerName={s.settings.signerName} signerTitle={s.settings.signerTitle} />
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <a className="btn-primary" href={`/api/certificates/${cert.id}/pdf`} target="_blank" rel="noreferrer"><IconPrinter size={18} />Unduh sertifikat PDF</a>
            <a className="btn-ghost" href={`/api/transcripts/${cert.registrationId}/pdf`} target="_blank" rel="noreferrer">Unduh transkrip PDF</a>
          </div>
        </>}
      </Modal>
    </>
  )
}
