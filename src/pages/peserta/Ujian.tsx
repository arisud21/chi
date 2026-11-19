import { IconBell, IconClock } from '@tabler/icons-react'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Badge, Empty, Modal, PageHeader, dateTimeID, useToast } from '../../components/ui'
import { finishExam, markNotificationsRead, requestExamToken, saveExamAnswers, startExam, useStore, type ExamSession } from '../../lib/store'
import type { Exam } from '../../lib/types'
import { useMe } from './Peserta'

const fmt = (ms: number) => {
  const t = Math.max(0, Math.ceil(ms / 1000))
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

/** Layar pengerjaan: satu soal per layar, jawaban tersimpan otomatis, selesai otomatis saat waktu habis. */
function Taking({ session, onDone }: { session: ExamSession; onDone: () => void }) {
  const toast = useToast()
  const [answers, setAnswers] = useState<Record<string, number>>(session.answers)
  const [i, setI] = useState(0)
  const [left, setLeft] = useState(() => new Date(session.endsAt).getTime() - Date.now())
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const done = useRef(false)
  const latest = useRef(answers)
  latest.current = answers
  const q = session.questions[i]

  const finish = useCallback(async () => {
    if (done.current) return
    done.current = true
    setBusy(true)
    const r = await finishExam(session.attemptId, latest.current)
    if (!r.ok) { done.current = false; setBusy(false); return toast(r.error, 'err') }
    onDone()
  }, [session.attemptId, onDone, toast])

  useEffect(() => {
    const t = setInterval(() => {
      const ms = new Date(session.endsAt).getTime() - Date.now()
      setLeft(ms)
      if (ms <= 0) { clearInterval(t); finish() }
    }, 1000)
    return () => clearInterval(t)
  }, [session.endsAt, finish])

  const pick = (qid: string, idx: number) => {
    const next = { ...answers, [qid]: idx }
    setAnswers(next)
    saveExamAnswers(session.attemptId, next)
  }
  const unanswered = session.questions.filter((x) => answers[x.id] == null).length

  return (
    <div className="mx-auto max-w-3xl">
      <div className="sticky top-16 z-10 mb-4 flex items-center justify-between gap-3 rounded-xl border border-line bg-white/95 px-4 py-3 backdrop-blur">
        <p className="min-w-0 truncate font-semibold">{session.title}</p>
        <p className={`inline-flex shrink-0 items-center gap-1.5 font-mono text-lg font-bold ${left < 5 * 60_000 ? 'text-red-700' : 'text-brand-700'}`} role="timer" aria-label="Sisa waktu"><IconClock size={18} />{fmt(left)}</p>
      </div>
      <div className="card p-5">
        <p className="text-xs font-bold uppercase tracking-wider text-muted">Soal {i + 1} dari {session.questions.length}</p>
        <p className="mt-2 whitespace-pre-wrap text-lg font-medium">{q.body}</p>
        <div className="mt-4 grid gap-2" role="radiogroup" aria-label={`Pilihan jawaban soal ${i + 1}`}>
          {q.options.map((o, k) => (
            <button key={k} type="button" role="radio" aria-checked={answers[q.id] === k} onClick={() => pick(q.id, k)}
              className={`flex min-h-12 items-start gap-3 rounded-xl border p-3 text-left text-sm transition ${answers[q.id] === k ? 'border-brand-600 bg-brand-50' : 'border-line bg-white hover:border-brand-200'}`}>
              <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${answers[q.id] === k ? 'bg-brand-600 text-white' : 'bg-canvas text-muted'}`}>{String.fromCharCode(65 + k)}</span>
              <span>{o}</span>
            </button>
          ))}
        </div>
        <div className="mt-5 flex items-center justify-between gap-2">
          <button className="btn-ghost" disabled={i === 0} onClick={() => setI(i - 1)}>Sebelumnya</button>
          {i < session.questions.length - 1
            ? <button className="btn-primary" onClick={() => setI(i + 1)}>Berikutnya</button>
            : <button className="btn-primary" onClick={() => setConfirm(true)}>Selesai</button>}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2" aria-label="Navigasi soal">
        {session.questions.map((x, k) => (
          <button key={x.id} onClick={() => setI(k)} aria-label={`Soal ${k + 1}${answers[x.id] != null ? ', terjawab' : ', belum dijawab'}`} aria-current={k === i}
            className={`grid size-10 place-items-center rounded-lg border text-sm font-semibold ${k === i ? 'border-brand-600 ring-2 ring-brand-200' : 'border-line'} ${answers[x.id] != null ? 'bg-brand-600 text-white' : 'bg-white'}`}>{k + 1}</button>
        ))}
      </div>
      <button className="btn-ghost mt-4" onClick={() => setConfirm(true)}>Kumpulkan jawaban</button>
      <Modal open={confirm} title="Kumpulkan jawaban?" onClose={() => setConfirm(false)}>
        <p className="text-sm text-muted">{unanswered > 0 ? `Masih ada ${unanswered} soal belum dijawab. ` : 'Semua soal sudah dijawab. '}Setelah dikumpulkan, jawaban tidak bisa diubah.</p>
        <div className="mt-4 flex gap-2"><button className="btn-primary" disabled={busy} onClick={finish}>{busy ? 'Mengumpulkan…' : 'Ya, kumpulkan'}</button><button className="btn-ghost" onClick={() => setConfirm(false)}>Kembali mengerjakan</button></div>
      </Modal>
    </div>
  )
}

export function UjianSaya() {
  const { s, regs } = useMe()
  const toast = useToast()
  const reg = regs.find((r) => r.stage === 'ujian' || r.stage === 'menunggu_hasil') ?? null
  const [pick, setPick] = useState<Exam | null>(null)
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [session, setSession] = useState<ExamSession | null>(null)
  const [finished, setFinished] = useState(false)
  const [expiresAt, setExpiresAt] = useState('')

  const launch = async (exam: Exam, code: string) => {
    setBusy(true)
    const r = await startExam(exam.id, code)
    setBusy(false)
    if (!r.ok) return toast(r.error, 'err')
    setSession(r.data as ExamSession); setPick(null); setToken(''); setExpiresAt('')
  }
  /** Sistem memberi token otomatis. Ujian yang sudah berjalan langsung dilanjutkan tanpa token. */
  const choose = async (exam: Exam) => {
    setBusy(true)
    const r = await requestExamToken(exam.id)
    setBusy(false)
    if (!r.ok) return toast(r.error, 'err')
    const d = r.data as { token: string; expiresAt: string | null }
    if (!d.token) return launch(exam, '')
    setToken(d.token); setExpiresAt(d.expiresAt ?? ''); setPick(exam)
  }
  const begin = (e: FormEvent) => { e.preventDefault(); if (pick) launch(pick, token) }

  if (session) return <Taking session={session} onDone={() => { setSession(null); setFinished(true) }} />
  const now = Date.now()
  return (
    <>
      <PageHeader title="Ujian online" sub="Token ujian diberikan otomatis oleh sistem saat jadwal ujian dibuka, tanpa perlu menghubungi admin. Soal diacak dari bank soal." />
      {finished && <div role="status" className="mb-5 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm"><b>Jawaban Anda sudah dikumpulkan.</b> Hasil seleksi diumumkan admin lewat aplikasi dan email. Nilai tidak ditampilkan kepada peserta.</div>}
      {!reg ? (
        <div className="card"><Empty title="Ujian belum terbuka" body="Ujian online terbuka setelah data diri lengkap dan pembayaran pendaftaran dikonfirmasi." action={<Link to="/app" className="btn-primary">Lihat tahapan</Link>} /></div>
      ) : s.exams.length === 0 ? (
        <div className="card"><Empty title="Belum ada jadwal ujian" body="Admin belum mengatur ujian untuk Anda. Pemberitahuan dikirim ke aplikasi dan email saat jadwal tersedia." /></div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {s.exams.map((e) => {
            const open = now >= new Date(e.openAt).getTime() && now <= new Date(e.closeAt).getTime()
            const ended = now > new Date(e.closeAt).getTime()
            return (
              <div key={e.id} className="card flex flex-col p-5">
                <div className="flex items-start justify-between gap-2"><h2 className="font-bold">{e.title}</h2><Badge status={e.mine === 'done' ? 'completed' : e.mine === 'running' ? 'running' : open ? 'open' : ended ? 'finished' : 'draft'} /></div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div><dt className="text-muted">Dibuka</dt><dd className="font-semibold">{dateTimeID(e.openAt)}</dd></div>
                  <div><dt className="text-muted">Ditutup</dt><dd className="font-semibold">{dateTimeID(e.closeAt)}</dd></div>
                  <div><dt className="text-muted">Durasi</dt><dd className="font-semibold">{e.durationMin} menit</dd></div>
                  <div><dt className="text-muted">Jumlah soal</dt><dd className="font-semibold">{e.questionCount}</dd></div>
                </dl>
                <div className="mt-4">
                  {e.mine === 'done' ? <p className="text-sm text-muted">Sudah dikerjakan.</p>
                    : reg.stage !== 'ujian' ? <p className="text-sm text-muted">Ujian sudah selesai.</p>
                    : e.mine === 'running' ? <button className="btn-primary" disabled={busy} onClick={() => choose(e)}>Lanjutkan ujian</button>
                    : open ? <button className="btn-primary" disabled={busy} onClick={() => choose(e)}>Mulai ujian</button>
                    : <p className="text-sm text-muted">{ended ? 'Jadwal ujian sudah ditutup. Hubungi admin.' : 'Belum waktunya ujian.'}</p>}
                </div>
              </div>
            )
          })}
        </div>
      )}
      <Modal open={!!pick} title="Token ujian Anda" onClose={() => setPick(null)}>
        <form onSubmit={begin} className="space-y-4">
          <p className="text-sm text-muted">Token dibuat otomatis oleh sistem dan sudah terisi. Berlaku 1 hari{expiresAt ? `, sampai ${dateTimeID(expiresAt)}` : ''}, tidak melewati jadwal tutup ujian. Waktu pengerjaan {pick?.durationMin} menit dan mulai berjalan setelah Anda menekan Mulai.</p>
          <input className="input text-center font-mono text-xl uppercase tracking-[0.3em]" required readOnly value={token} aria-label="Token ujian" />
          <button className="btn-primary w-full" disabled={busy}>{busy ? 'Memeriksa…' : 'Mulai'}</button>
        </form>
      </Modal>
    </>
  )
}

export function Notifikasi() {
  const items = useStore((s) => s.notifications)
  const nav = useNavigate()
  useEffect(() => { if (items.some((n) => !n.read)) markNotificationsRead() }, [items])
  return (
    <>
      <PageHeader title="Notifikasi" sub="Pemberitahuan juga dikirim ke email Anda." />
      {items.length === 0 ? <div className="card"><Empty title="Belum ada notifikasi" body="Konfirmasi pembayaran dan hasil seleksi akan muncul di sini." /></div> : (
        <ul className="space-y-2">
          {items.map((n) => (
            <li key={n.id} className="card flex items-start gap-3 p-4">
              <IconBell size={20} className={n.read ? 'mt-0.5 text-muted' : 'mt-0.5 text-brand-600'} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{n.title}</p>
                <p className="text-sm text-muted">{n.body}</p>
                <p className="mt-1 text-xs text-muted">{dateTimeID(n.createdAt)}</p>
              </div>
              {n.link && <button className="btn-ghost !min-h-9" onClick={() => nav(n.link)}>Buka</button>}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
