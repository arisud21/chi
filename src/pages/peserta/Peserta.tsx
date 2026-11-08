import { IconAlertCircle, IconUpload } from '@tabler/icons-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Empty, Field, Modal, PageHeader, Reveal, dateID, dateTimeID, rupiah, useAct } from '../../components/ui'
import {
  cancelRegistration, createRegistration, resendVerification, seatsTaken, submitProof, useStore, verifyEmailDev,
} from '../../lib/store'
import type { Registration } from '../../lib/types'

export function useMe() {
  const s = useStore((x) => x)
  const me = s.users.find((u) => u.id === s.sessionUserId)!
  const regs = s.registrations.filter((r) => r.userId === me.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return { s, me, regs }
}

const NEXT: Record<string, string> = {
  pending_payment: 'Transfer sesuai nominal tagihan, lalu unggah bukti.',
  waiting_verification: 'Admin Keuangan sedang memeriksa bukti Anda.',
  active: 'Pendaftaran aktif. Buka ruang belajar.',
  completed: 'Pelatihan selesai.',
}

/** Dashboard diturunkan dari status registrasi, bukan dari role (PRD §6.3). */
export function Beranda() {
  const { s, me, regs } = useMe()
  const act = useAct()
  const devMode = s.devMode
  const learning = regs.filter((r) => r.status === 'active' || r.status === 'completed')
  const needsProfile = learning.length > 0 && !me.profileDone
  const pending = regs.filter((r) => r.status === 'pending_payment' || r.status === 'waiting_verification')
  return (
    <>
      <PageHeader title={`Halo, ${me.name.split(' ')[0]}`} sub={learning.length ? 'Ringkasan belajar Anda.' : 'Selesaikan pendaftaran untuk mulai belajar.'} />
      {!me.emailVerified && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm animate-rise">
          <IconAlertCircle className="shrink-0 text-amber-700" />
          <p className="flex-1">Email <b>{me.email}</b> belum diverifikasi. Sertifikat dan transkrip hanya dikirim ke email terverifikasi.</p>
          {devMode
            ? <button className="btn-ghost" onClick={() => verifyEmailDev()}>Simulasikan klik tautan (mode dev)</button>
            : <button className="btn-ghost" onClick={() => act(resendVerification() as any, 'Tautan verifikasi dikirim ulang.')}>Kirim ulang tautan</button>}
        </div>
      )}
      {needsProfile && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm animate-rise">
          <IconAlertCircle className="shrink-0 text-brand-600" />
          <p className="flex-1"><b>Pembayaran dikonfirmasi.</b> Lengkapi data diri agar kelas Anda dapat dimulai.</p>
          <Link to="/app/data-diri" className="btn-primary">Lengkapi data diri</Link>
        </div>
      )}
      {pending.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-3 font-bold">Perlu tindakan</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {pending.map((r) => <RegCard key={r.id} r={r} compact />)}
          </div>
        </section>
      )}
      {learning.length > 0 ? (
        <section>
          <h2 className="mb-3 font-bold">Ruang belajar</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {learning.map((r) => {
              const b = s.batches.find((x) => x.id === r.batchId)!
              const p = s.programs.find((x) => x.id === b.programId)!
              const next = s.sessions.filter((x) => x.batchId === b.id && new Date(x.startAt) > new Date()).sort((a, c) => a.startAt.localeCompare(c.startAt))[0]
              return (
                <Reveal key={r.id}>
                  <div className="card p-5">
                    <div className="flex items-start justify-between gap-2"><div><p className="font-bold">{p.title}</p><p className="text-sm text-muted">{b.code}</p></div><Badge status={r.status} /></div>
                    <p className="mt-4 text-sm text-muted">Sesi berikutnya</p>
                    <p className="font-semibold">{next ? `${next.title} · ${dateTimeID(next.startAt)}` : 'Belum ada sesi terjadwal'}</p>
                    <Link to="/app/belajar" className="btn-primary mt-4">Buka ruang belajar</Link>
                  </div>
                </Reveal>
              )
            })}
          </div>
        </section>
      ) : pending.length === 0 && (
        <div className="card"><Empty title="Anda belum punya pendaftaran" body="Pilih program dan angkatan yang sedang dibuka. Tagihan terbit seketika." action={<Link to="/app/katalog" className="btn-primary">Lihat katalog</Link>} /></div>
      )}
    </>
  )
}

export function Katalog() {
  const { s, regs } = useMe()
  const act = useAct()
  const open = s.batches.filter((b) => b.status === 'open').sort((a, b) => a.startDate.localeCompare(b.startDate))
  return (
    <>
      <PageHeader title="Katalog program" sub="Hanya angkatan yang pendaftarannya dibuka yang tampil di sini." />
      <div className="grid gap-4 md:grid-cols-2">
        {open.length === 0 && <div className="card md:col-span-2"><Empty title="Belum ada angkatan dibuka" body="Admin Pendaftaran belum membuka angkatan baru. Cek lagi nanti." /></div>}
        {open.map((b, i) => {
          const p = s.programs.find((x) => x.id === b.programId)!
          const left = b.quota - seatsTaken(s, b.id)
          const mine = regs.find((r) => r.batchId === b.id && ['pending_payment', 'waiting_verification', 'active'].includes(r.status))
          return (
            <Reveal key={b.id} delay={i * 0.06}>
              <div className="card flex h-full flex-col p-5">
                <p className="text-xs font-bold uppercase tracking-wider text-brass-600">{p.category}</p>
                <h3 className="mt-1 font-display text-xl font-bold">{p.title}</h3>
                <p className="mt-1 text-sm text-muted">{b.code} · {dateID(b.startDate)} sampai {dateID(b.endDate)}</p>
                <p className="mt-3 flex-1 text-sm">{p.shortDesc}</p>
                <div className="mt-4 flex items-center justify-between gap-2">
                  <div><p className="text-lg font-bold">{rupiah(p.price)}</p><p className={`text-xs font-semibold ${left <= 3 ? 'text-red-700' : 'text-brand-700'}`}>{left > 0 ? `Sisa ${left} kursi` : 'Kuota penuh'}</p></div>
                  {mine ? <Link to="/app/pendaftaran" className="btn-ghost">Sudah terdaftar</Link> : (
                    <button className="btn-primary" disabled={left <= 0} onClick={() => act(createRegistration(b.id), 'Tagihan terbit. Selesaikan pembayaran.')}>Pilih angkatan</button>
                  )}
                </div>
              </div>
            </Reveal>
          )
        })}
      </div>
    </>
  )
}

function RegCard({ r, compact = false }: { r: Registration; compact?: boolean }) {
  const s = useStore((x) => x)
  const act = useAct()
  const [proof, setProof] = useState(false)
  const [cancel, setCancel] = useState(false)
  const b = s.batches.find((x) => x.id === r.batchId)!
  const p = s.programs.find((x) => x.id === b.programId)!
  const pay = s.payments.filter((x) => x.registrationId === r.id).sort((a, c) => c.createdAt.localeCompare(a.createdAt))[0]
  const total = r.priceSnapshot + r.uniqueCode
  const [f, setF] = useState({ payerName: s.users.find((u) => u.id === r.userId)!.name, transferDate: new Date().toISOString().slice(0, 10), amountPaid: total, file: null as File | null })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!f.file) return act(Promise.resolve({ ok: false, error: 'Pilih berkas bukti transfer.' }), '')
    if (!['image/jpeg', 'image/png', 'application/pdf'].includes(f.file.type)) return act(Promise.resolve({ ok: false, error: 'Format harus JPG, PNG, atau PDF.' }), '')
    if (f.file.size > 2 * 1024 * 1024) return act(Promise.resolve({ ok: false, error: 'Ukuran berkas maksimal 2 MB.' }), '')
    act(submitProof(r.id, { payerName: f.payerName, transferDate: f.transferDate, amountPaid: f.amountPaid, file: f.file }), 'Bukti terkirim. Menunggu verifikasi.', () => setProof(false))
  }

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-2">
        <div><p className="font-bold">{p.title}</p><p className="text-sm text-muted">{b.code} · {r.code}</p></div>
        <Badge status={r.status} />
      </div>
      {!compact && <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div><dt className="text-muted">Invoice</dt><dd className="font-semibold">{r.invoiceNo}</dd></div>
        <div><dt className="text-muted">Batas bayar</dt><dd className="font-semibold">{dateTimeID(r.dueAt)}</dd></div>
      </dl>}
      {r.status === 'pending_payment' && (
        <div className="mt-4 rounded-xl bg-brand-50 p-4 text-sm">
          <p className="text-muted">Transfer tepat sebesar</p>
          <p className="text-2xl font-bold text-brand-700">{rupiah(total)}</p>
          <p className="mt-1 text-xs text-muted">Termasuk kode unik {r.uniqueCode} agar pembayaran mudah dicocokkan.</p>
          <p className="mt-2">{s.settings.bankName} · <b className="font-mono">{s.settings.bankAccount}</b> a.n. {s.settings.bankHolder}</p>
          {pay?.status === 'rejected' && <p className="mt-3 rounded-lg bg-red-50 p-3 font-medium text-red-800">Bukti sebelumnya ditolak: {pay.rejectReason}</p>}
        </div>
      )}
      <p className="mt-3 text-sm text-muted">{NEXT[r.status] ?? r.cancelledReason}</p>
      {r.status === 'pending_payment' && (
        <div className="mt-4 flex gap-2">
          <button className="btn-primary" onClick={() => setProof(true)}><IconUpload size={18} />Unggah bukti</button>
          <button className="btn-ghost" onClick={() => setCancel(true)}>Batalkan</button>
        </div>
      )}
      <Modal open={proof} title="Unggah bukti transfer" onClose={() => setProof(false)}>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Nama pengirim"><input className="input" required value={f.payerName} onChange={(e) => setF({ ...f, payerName: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tanggal transfer"><input className="input" type="date" required value={f.transferDate} onChange={(e) => setF({ ...f, transferDate: e.target.value })} /></Field>
            <Field label="Nominal (Rp)"><input className="input" type="number" required value={f.amountPaid} onChange={(e) => setF({ ...f, amountPaid: +e.target.value })} /></Field>
          </div>
          <Field label="Bukti transfer" hint="JPG, PNG, atau PDF. Maksimal 2 MB."><input className="input !py-2" type="file" accept=".jpg,.jpeg,.png,.pdf" required onChange={(e) => setF({ ...f, file: e.target.files?.[0] ?? null })} /></Field>
          <button className="btn-primary w-full">Kirim bukti</button>
        </form>
      </Modal>
      <Modal open={cancel} title="Batalkan pendaftaran?" onClose={() => setCancel(false)}>
        <p className="text-sm text-muted">Kursi Anda akan dilepas. Anda bisa mendaftar lagi selama kuota masih ada.</p>
        <div className="mt-4 flex gap-2"><button className="btn-danger" onClick={() => act(cancelRegistration(r.id), 'Pendaftaran dibatalkan.', () => setCancel(false))}>Ya, batalkan</button><button className="btn-ghost" onClick={() => setCancel(false)}>Tidak</button></div>
      </Modal>
    </div>
  )
}

export function Pendaftaran() {
  const { regs } = useMe()
  return (
    <>
      <PageHeader title="Pendaftaran saya" sub="Semua pendaftaran beserta status pembayarannya." />
      {regs.length === 0 ? <div className="card"><Empty title="Belum ada pendaftaran" body="Pilih angkatan di katalog untuk membuat tagihan." action={<Link to="/app/katalog" className="btn-primary">Ke katalog</Link>} /></div> : (
        <div className="grid gap-4 md:grid-cols-2">{regs.map((r) => <Reveal key={r.id}><RegCard r={r} /></Reveal>)}</div>
      )}
    </>
  )
}

