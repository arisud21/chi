import { IconArrowRight, IconCheck, IconPlus, IconPrinter, IconX } from '@tabler/icons-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CertificateView } from '../../components/Certificate'
import { PengumumanForm } from './Akademik'
import { Badge, CountUp, Empty, Field, Modal, PageHeader, Reveal, dateID, dateTimeID, rupiah, useAct, useToast } from '../../components/ui'
import {
  archiveProgram, deleteBatch, deleteProgram, finalScore, getState, issueCertificate, newId, recommendPass, rejectPayment, returnGrade,
  revokeCertificate, saveBatch, saveGrade, saveProgram, saveSettings, saveUser, seatsTaken, submitGrade, useStore, validateGrade, verifyPayment,
} from '../../lib/store'
import { ROLE_LABEL, type Batch, type Program, type Role, type User } from '../../lib/types'

function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead><tr className="border-b border-line bg-canvas text-xs uppercase tracking-wide text-muted">{head.map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr></thead>
        <tbody className="[&>tr]:border-b [&>tr]:border-line [&>tr:last-child]:border-0 [&>tr]:transition-colors [&>tr:hover]:bg-brand-50/50 [&_td]:px-4 [&_td]:py-3">{children}</tbody>
      </table>
    </div>
  )
}

/** Input nilai dengan buffer lokal; disimpan ke server saat kehilangan fokus. */
function GradeInput({ label, value, disabled, onSave }: { label: string; value: number; disabled: boolean; onSave: (v: number) => void }) {
  const [v, setV] = useState(String(value))
  useEffect(() => setV(String(value)), [value])
  return <input aria-label={label} className="input !min-h-9 !w-20 !px-2" type="number" min={0} max={100} disabled={disabled} value={v}
    onChange={(e) => setV(e.target.value)} onBlur={() => { const n = Math.max(0, Math.min(100, +v || 0)); if (n !== value) onSave(n) }} />
}

/* ---------------- Dashboard ---------------- */
export function Dashboard() {
  const s = useStore((x) => x)
  const me = s.users.find((u) => u.id === s.sessionUserId)!
  const queue = s.payments.filter((p) => p.status === 'submitted').length
  const toFill = s.grades.filter((g) => g.status === 'draft' && s.registrations.find((r) => r.id === g.registrationId)?.status === 'active').length
  const toValidate = s.grades.filter((g) => g.status === 'submitted').length
  const toIssue = s.grades.filter((g) => g.status === 'validated' && g.passed && !s.certificates.some((c) => c.registrationId === g.registrationId)).length
  const awaitingProfile = s.registrations.filter((r) => r.status === 'active' && !s.users.find((u) => u.id === r.userId)?.profileDone).length
  const openBatches = s.batches.filter((b) => b.status === 'open')
  const statuses = ['pending_payment', 'waiting_verification', 'active', 'completed', 'expired', 'cancelled'] as const
  const counts = statuses.map((k) => [k, s.registrations.filter((r) => r.status === k).length] as const)
  const max = Math.max(1, ...counts.map((c) => c[1]))
  const revenue = s.payments.filter((p) => p.status === 'verified').reduce((a, p) => a + p.amountPaid, 0)

  const R = (...a: Role[]) => a
  const todo: { role: Role[]; to: string; n: number; label: string }[] = [
    { role: R('super_admin', 'admin_keuangan'), to: '/admin/pembayaran', n: queue, label: 'bukti pembayaran menunggu verifikasi' },
    { role: R('super_admin', 'admin_pendaftaran'), to: '/admin/pendaftar', n: awaitingProfile, label: 'peserta sudah bayar tetapi belum mengisi data diri' },
    { role: R('super_admin', 'instruktur'), to: '/admin/nilai', n: toFill, label: 'nilai peserta perlu diisi' },
    { role: R('super_admin', 'akademik'), to: '/admin/nilai', n: toValidate, label: 'nilai menunggu validasi' },
    { role: R('super_admin', 'akademik'), to: '/admin/sertifikat', n: toIssue, label: 'peserta lulus belum diterbitkan sertifikatnya' },
  ].filter((t) => t.role.includes(me.role))

  return (
    <>
      <PageHeader title="Dashboard" sub={`Masuk sebagai ${ROLE_LABEL[me.role]}.`} />
      <div className="grid gap-5 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-1">
          <h2 className="font-bold">Perlu tindakan</h2>
          {todo.length === 0 && <p className="mt-3 text-sm text-muted">Tidak ada tugas untuk role ini. Dashboard role Admin Pendaftaran fokus pada angkatan di sebelah kanan.</p>}
          <ul className="mt-3 space-y-2">
            {todo.map((t, i) => (
              <li key={i}><Link to={t.to} className="flex min-h-14 items-center justify-between gap-3 rounded-xl bg-canvas p-3 transition hover:bg-brand-50">
                <span className="text-sm"><b className={`mr-1 text-xl ${t.n ? 'text-brand-700' : 'text-muted'}`}><CountUp to={t.n} /></b>{t.label}</span>
                <IconArrowRight size={18} className="shrink-0" />
              </Link></li>
            ))}
          </ul>
        </section>
        <section className="card p-5 lg:col-span-2">
          <h2 className="font-bold">Pendaftaran menurut status</h2>
          <p className="text-sm text-muted">Jumlah registrasi per status saat ini.</p>
          <div className="mt-5 space-y-3">
            {counts.map(([k, n], i) => (
              <div key={k} className="grid grid-cols-[9rem_1fr_2rem] items-center gap-3 text-sm">
                <Badge status={k} />
                <div className="h-3 overflow-hidden rounded-full bg-canvas"><div className="h-full origin-left animate-bar rounded-full bg-brand-500" style={{ width: `${(n / max) * 100}%`, animationDelay: `${i * 80}ms` }} /></div>
                <span className="text-right font-bold">{n}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="card overflow-hidden lg:col-span-2">
          <div className="p-5 pb-3"><h2 className="font-bold">Angkatan dibuka</h2></div>
          {openBatches.length === 0 ? <Empty title="Tidak ada angkatan dibuka" body="Buat atau buka angkatan di menu Program dan angkatan." /> : (
            <ul>{openBatches.map((b) => {
              const p = s.programs.find((x) => x.id === b.programId)!; const t = seatsTaken(s, b.id)
              return <li key={b.id} className="flex items-center justify-between gap-3 border-t border-line px-5 py-3 text-sm"><span><b>{b.code}</b> <span className="text-muted">{p.title}</span></span><span className="font-semibold">{t}/{b.quota}</span></li>
            })}</ul>
          )}
        </section>
        {['super_admin', 'admin_keuangan', 'admin_pendaftaran'].includes(me.role) && (
        <section className="card p-5">
          <h2 className="font-bold">Pemasukan terverifikasi</h2>
          <p className="mt-3 font-display text-3xl font-bold text-brand-700">{rupiah(revenue)}</p>
          <p className="text-sm text-muted">Dari {s.payments.filter((p) => p.status === 'verified').length} pembayaran.</p>
        </section>
        )}
      </div>
    </>
  )
}

/* ---------------- Program dan angkatan ---------------- */
export function ProgramAdmin() {
  const s = useStore((x) => x)
  const toast = useToast()
  const act = useAct()
  const [prog, setProg] = useState<Program | null>(null)
  const [batch, setBatch] = useState<Batch | null>(null)
  const [del, setDel] = useState<{ kind: 'program' | 'batch'; id: string; label: string } | null>(null)
  const blankProg = (): Program => ({ id: newId('pr'), slug: '', title: '', category: 'Hospitality', shortDesc: '', description: '', durationHours: 60, price: 0, active: true, archived: false, rules: { theoryWeight: 30, practicalWeight: 70, passingScore: 70, minAttendance: 80 } })
  const blankBatch = (): Batch => ({ id: newId('b'), programId: s.programs[0]?.id ?? '', code: '', startDate: '', endDate: '', quota: 20, status: 'draft', instructorId: s.users.find((u) => u.role === 'instruktur')?.id ?? '', location: '', scheduleDays: '', startTime: '', endTime: '', plannedSessions: 0 })
  return (
    <>
      <PageHeader title="Program dan angkatan" sub="Program yang sudah punya angkatan tidak dihapus, hanya diarsipkan." action={<div className="flex gap-2"><button className="btn-ghost" onClick={() => setBatch(blankBatch())}><IconPlus size={18} />Angkatan</button><button className="btn-primary" onClick={() => setProg(blankProg())}><IconPlus size={18} />Program</button></div>} />
      <h2 className="mb-2 font-bold">Program</h2>
      <Table head={['Program', 'Kategori', 'Durasi', 'Harga', 'Status', '']}>
        {s.programs.filter((p) => !p.archived).map((p) => (
          <tr key={p.id}><td className="font-semibold">{p.title}</td><td>{p.category}</td><td>{p.durationHours} jam</td><td>{rupiah(p.price)}</td><td><Badge status={p.active ? 'open' : 'draft'} /></td>
            <td className="text-right"><button className="btn-ghost !min-h-9" onClick={() => setProg(p)}>Ubah</button> <button className="btn-ghost !min-h-9" onClick={() => act(archiveProgram(p.id), 'Program diarsipkan.')}>Arsip</button> <button className="btn-ghost !min-h-9 text-red-700" onClick={() => setDel({ kind: 'program', id: p.id, label: p.title })}>Hapus</button></td></tr>
        ))}
      </Table>
      <h2 className="mb-2 mt-8 font-bold">Angkatan</h2>
      <Table head={['Kode', 'Program', 'Mulai', 'Kuota', 'Status', '']}>
        {s.batches.map((b) => (
          <tr key={b.id}><td className="font-semibold">{b.code}</td><td>{s.programs.find((p) => p.id === b.programId)?.title}</td><td>{dateID(b.startDate)}</td><td>{seatsTaken(s, b.id)}/{b.quota}</td><td><Badge status={b.status} /></td>
            <td className="text-right"><button className="btn-ghost !min-h-9" onClick={() => setBatch(b)}>Ubah</button> <button className="btn-ghost !min-h-9 text-red-700" onClick={() => setDel({ kind: 'batch', id: b.id, label: b.code })}>Hapus</button></td></tr>
        ))}
      </Table>

      <Modal open={!!del} title={del?.kind === 'program' ? 'Hapus program?' : 'Hapus angkatan?'} onClose={() => setDel(null)}>
        {del && <div className="space-y-4">
          <p className="text-sm"><b>{del.label}</b> akan dihapus permanen dan tidak bisa dikembalikan.</p>
          <p className="rounded-lg bg-canvas p-3 text-xs text-muted">{del.kind === 'program'
            ? 'Hanya bisa bila program belum punya angkatan. Kalau sudah, pakai Arsip supaya riwayat pendaftar dan nilai tetap utuh.'
            : 'Hanya bisa bila angkatan belum punya pendaftaran, pertemuan, atau tugas. Kalau sudah, ubah statusnya menjadi cancelled atau finished.'}</p>
          <div className="flex gap-2">
            <button className="btn-danger" onClick={() => act(del.kind === 'program' ? deleteProgram(del.id) : deleteBatch(del.id), del.kind === 'program' ? 'Program dihapus.' : 'Angkatan dihapus.', () => setDel(null))}>Ya, hapus permanen</button>
            <button className="btn-ghost" onClick={() => setDel(null)}>Batal</button>
          </div>
        </div>}
      </Modal>
      <Modal open={!!prog} title={prog && s.programs.some((p) => p.id === prog.id) ? 'Ubah program' : 'Program baru'} onClose={() => setProg(null)}>
        {prog && <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); act(saveProgram({ ...prog, slug: prog.slug || prog.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }), 'Program disimpan.', () => setProg(null)) }}>
          <Field label="Judul"><input className="input" required value={prog.title} onChange={(e) => setProg({ ...prog, title: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kategori"><input className="input" required value={prog.category} onChange={(e) => setProg({ ...prog, category: e.target.value })} /></Field>
            <Field label="Durasi (jam)"><input className="input" type="number" min={1} required value={prog.durationHours} onChange={(e) => setProg({ ...prog, durationHours: +e.target.value })} /></Field>
          </div>
          <Field label="Harga (Rp)"><input className="input" type="number" min={0} required value={prog.price} onChange={(e) => setProg({ ...prog, price: +e.target.value })} /></Field>
          <Field label="Ringkasan"><input className="input" required maxLength={120} value={prog.shortDesc} onChange={(e) => setProg({ ...prog, shortDesc: e.target.value })} /></Field>
          <Field label="Deskripsi"><textarea className="input !py-2" rows={3} value={prog.description} onChange={(e) => setProg({ ...prog, description: e.target.value })} /></Field>
          <p className="pt-1 text-sm font-bold">Aturan penilaian</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Bobot teori (%)"><input className="input" type="number" value={prog.rules.theoryWeight} onChange={(e) => setProg({ ...prog, rules: { ...prog.rules, theoryWeight: +e.target.value } })} /></Field>
            <Field label="Bobot praktik (%)"><input className="input" type="number" value={prog.rules.practicalWeight} onChange={(e) => setProg({ ...prog, rules: { ...prog.rules, practicalWeight: +e.target.value } })} /></Field>
            <Field label="Nilai lulus minimal (KKM)"><input className="input" type="number" value={prog.rules.passingScore} onChange={(e) => setProg({ ...prog, rules: { ...prog.rules, passingScore: +e.target.value } })} /></Field>
            <Field label="Kehadiran minimal (%)"><input className="input" type="number" value={prog.rules.minAttendance} onChange={(e) => setProg({ ...prog, rules: { ...prog.rules, minAttendance: +e.target.value } })} /></Field>
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-brand-600" checked={prog.active} onChange={(e) => setProg({ ...prog, active: e.target.checked })} />Tampil di katalog</label>
          <button className="btn-primary w-full">Simpan</button>
        </form>}
      </Modal>
      <Modal open={!!batch} title={batch && s.batches.some((b) => b.id === batch.id) ? 'Ubah angkatan' : 'Angkatan baru'} onClose={() => setBatch(null)}>
        {batch && <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (batch.endDate < batch.startDate) return toast('Tanggal selesai sebelum tanggal mulai.', 'err'); act(saveBatch(batch), 'Angkatan disimpan.', () => setBatch(null)) }}>
          <Field label="Program"><select className="input" value={batch.programId} onChange={(e) => setBatch({ ...batch, programId: e.target.value })}>{s.programs.filter((p) => !p.archived).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kode"><input className="input" required value={batch.code} onChange={(e) => setBatch({ ...batch, code: e.target.value })} /></Field>
            <Field label="Kuota"><input className="input" type="number" min={1} required value={batch.quota} onChange={(e) => setBatch({ ...batch, quota: +e.target.value })} /></Field>
            <Field label="Mulai"><input className="input" type="date" required value={batch.startDate} onChange={(e) => setBatch({ ...batch, startDate: e.target.value })} /></Field>
            <Field label="Selesai"><input className="input" type="date" required value={batch.endDate} onChange={(e) => setBatch({ ...batch, endDate: e.target.value })} /></Field>
          </div>
          <p className="rounded-lg bg-canvas p-3 text-xs text-muted">Instruktur, hari, jam, dan lokasi diatur Akademik di menu Jadwal angkatan.</p>
          <Field label="Status"><select className="input" value={batch.status} onChange={(e) => setBatch({ ...batch, status: e.target.value as Batch['status'] })}>{['draft', 'open', 'running', 'finished', 'cancelled'].map((x) => <option key={x}>{x}</option>)}</select></Field>
          <button className="btn-primary w-full">Simpan</button>
        </form>}
      </Modal>
    </>
  )
}

/* ---------------- Pembayaran ---------------- */
export function Pembayaran() {
  const s = useStore((x) => x)
  const act = useAct()
  const [rej, setRej] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const queue = s.payments.filter((p) => p.status === 'submitted')
  const done = s.payments.filter((p) => p.status !== 'submitted').sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return (
    <>
      <PageHeader title="Verifikasi pembayaran" sub="Setujui dalam satu aksi: pembayaran, registrasi, kwitansi, dan audit log tercatat bersama." />
      {queue.length === 0 ? <div className="card mb-8"><Empty title="Antrean kosong" body="Semua bukti pembayaran sudah diperiksa." /></div> : (
        <div className="mb-8 grid gap-4 lg:grid-cols-2">
          {queue.map((p) => {
            const r = s.registrations.find((x) => x.id === p.registrationId)!
            const diff = p.amountPaid - p.amountDue
            return (
              <Reveal key={p.id}><div className="card p-5">
                <div className="flex items-start justify-between"><div><p className="font-bold">{s.users.find((u) => u.id === r.userId)?.name}</p><p className="text-sm text-muted">{r.invoiceNo} · {s.batches.find((b) => b.id === r.batchId)?.code}</p></div><Badge status={p.status} /></div>
                <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
                  <div><dt className="text-muted">Tagihan</dt><dd className="font-semibold">{rupiah(p.amountDue)}</dd></div>
                  <div><dt className="text-muted">Dibayar</dt><dd className="font-semibold">{rupiah(p.amountPaid)}</dd></div>
                  <div><dt className="text-muted">Selisih</dt><dd className={`font-semibold ${diff === 0 ? 'text-emerald-700' : 'text-red-700'}`}>{diff === 0 ? 'Cocok' : rupiah(diff)}</dd></div>
                </dl>
                <p className="mt-3 text-sm text-muted">Pengirim {p.payerName} · transfer {dateID(p.transferDate)} · {p.proofFileId ? <a className="font-semibold text-brand-600 underline" href={`/api/files/${p.proofFileId}`} target="_blank" rel="noreferrer">lihat bukti</a> : 'tanpa berkas'}</p>
                <div className="mt-4 flex gap-2">
                  <button className="btn-primary" onClick={() => act(verifyPayment(p.id), 'Pembayaran disetujui. Kwitansi masuk antrean email.')}><IconCheck size={18} />Setujui</button>
                  <button className="btn-ghost" onClick={() => { setRej(p.id); setReason('') }}><IconX size={18} />Tolak</button>
                </div>
              </div></Reveal>
            )
          })}
        </div>
      )}
      <h2 className="mb-2 font-bold">Riwayat</h2>
      <Table head={['Invoice', 'Peserta', 'Nominal', 'Status', 'Kwitansi / alasan']}>
        {done.map((p) => { const r = s.registrations.find((x) => x.id === p.registrationId)!; return <tr key={p.id}><td className="font-mono text-xs">{r.invoiceNo}</td><td>{s.users.find((u) => u.id === r.userId)?.name}</td><td>{rupiah(p.amountPaid)}</td><td><Badge status={p.status} /></td><td className="text-muted">{p.receiptNo ?? p.rejectReason}</td></tr> })}
      </Table>
      <Modal open={!!rej} title="Tolak pembayaran" onClose={() => setRej(null)}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); act(rejectPayment(rej!, reason), 'Pembayaran ditolak. Peserta diminta unggah ulang.', () => setRej(null)) }}>
          <Field label="Alasan (wajib, dikirim ke peserta)"><textarea className="input !py-2" rows={3} required value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <button className="btn-danger w-full">Tolak</button>
        </form>
      </Modal>
    </>
  )
}

/* ---------------- Nilai ---------------- */
export function Nilai() {
  const s = useStore((x) => x)
  const me = s.users.find((u) => u.id === s.sessionUserId)!
  const toast = useToast()
  const act = useAct()
  const [ov, setOv] = useState<{ id: string; passed: boolean } | null>(null)
  const [why, setWhy] = useState('')
  const canInput = me.role === 'instruktur' || me.role === 'super_admin'
  const canValidate = me.role === 'akademik' || me.role === 'super_admin'
  const rows = s.grades.map((g) => {
    const r = s.registrations.find((x) => x.id === g.registrationId)!
    const b = s.batches.find((x) => x.id === r.batchId)!
    return { g, r, b, p: s.programs.find((x) => x.id === b.programId)!, u: s.users.find((x) => x.id === r.userId)! }
  }).filter((x) => x.r.status === 'active' || x.r.status === 'completed').filter((x) => me.role !== 'instruktur' || x.b.instructorId === me.id)
  const quiet = (p: Promise<{ ok: boolean }>) => p.then((r: any) => { if (!r.ok) toast(r.error, 'err') })
  const run = (p: Parameters<typeof act>[0], okMsg: string) => act(p, okMsg)
  return (
    <>
      <PageHeader title="Nilai dan kelulusan" sub="Instruktur mengisi dan mengirim. Akademik memvalidasi. Nilai akhir dihitung sistem dari bobot program." />
      {rows.length === 0 ? <div className="card"><Empty title="Belum ada peserta aktif" body="Peserta muncul di sini setelah pembayarannya diverifikasi." /></div> : (
        <Table head={['Peserta', 'Teori', 'Praktik', 'Hadir %', 'Akhir', 'Rekomendasi', 'Status', '']}>
          {rows.map(({ g, r, p, u }) => {
            const locked = g.status !== 'draft' || !canInput
            const fin = finalScore(g, p); const rec = recommendPass(g, p)
            return (
              <tr key={r.id}>
                <td><p className="font-semibold">{u.name}</p><p className="text-xs text-muted">{p.title}</p></td>
                {(['theory', 'practical', 'attendancePct'] as const).map((k) => <td key={k}><GradeInput label={k} value={g[k]} disabled={locked} onSave={(v) => quiet(saveGrade(r.id, { [k]: v }))} /></td>)}
                <td className="font-bold">{fin}</td>
                <td className={rec ? 'font-semibold text-emerald-700' : 'font-semibold text-red-700'}>{rec ? 'Lulus' : 'Tidak lulus'}<span className="block text-xs font-normal text-muted">KKM {p.rules.passingScore}, hadir {p.rules.minAttendance}%</span></td>
                <td><Badge status={g.status} />{g.status === 'validated' && <span className="ml-1 text-xs">{g.passed ? 'lulus' : 'tidak'}</span>}</td>
                <td className="whitespace-nowrap text-right">
                  {g.status === 'draft' && canInput && <button className="btn-primary !min-h-9" onClick={() => run(submitGrade(r.id), 'Nilai dikirim ke Akademik.')}>Kirim</button>}
                  {g.status === 'submitted' && canValidate && <>
                    <button className="btn-primary !min-h-9" onClick={() => run(validateGrade(r.id, rec), 'Nilai divalidasi.')}>Validasi</button>{' '}
                    <button className="btn-ghost !min-h-9" onClick={() => { setOv({ id: r.id, passed: !rec }); setWhy('') }}>Timpa</button>{' '}
                    <button className="btn-ghost !min-h-9" onClick={() => run(returnGrade(r.id), 'Dikembalikan ke instruktur.')}>Kembalikan</button>
                  </>}
                </td>
              </tr>
            )
          })}
        </Table>
      )}
      <Modal open={!!ov} title={`Timpa rekomendasi menjadi ${ov?.passed ? 'lulus' : 'tidak lulus'}`} onClose={() => setOv(null)}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); act(validateGrade(ov!.id, ov!.passed, why), 'Nilai divalidasi dengan penimpaan tercatat.', () => setOv(null)) }}>
          <Field label="Alasan (dicatat di audit log)"><textarea className="input !py-2" rows={3} required value={why} onChange={(e) => setWhy(e.target.value)} /></Field>
          <button className="btn-primary w-full">Validasi dengan alasan</button>
        </form>
      </Modal>
    </>
  )
}

/* ---------------- Sertifikat ---------------- */
export function SertifikatAdmin() {
  const s = useStore((x) => x)
  const toast = useToast()
  const act = useAct()
  const [view, setView] = useState<string | null>(null)
  const [rev, setRev] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const eligible = s.grades.filter((g) => g.status === 'validated' && g.passed && !s.certificates.some((c) => c.registrationId === g.registrationId && c.status === 'issued'))
  const cert = s.certificates.find((c) => c.id === view)
  const reg = cert && s.registrations.find((r) => r.id === cert.registrationId)
  const prog = reg && s.programs.find((p) => p.id === s.batches.find((b) => b.id === reg.batchId)!.programId)
  const owner = reg && s.users.find((u) => u.id === reg.userId)
  return (
    <>
      <PageHeader title="Sertifikat" sub="Nomor dari penghitung per tahun. Dirender sekali saat terbit, lengkap dengan QR ke halaman verifikasi publik."
        action={eligible.length > 0 && <button className="btn-primary" onClick={async () => { let fails = 0; for (const g of eligible) { const r = await issueCertificate(g.registrationId); if (!r.ok) { fails++; toast(r.error, 'err') } } if (fails < eligible.length) toast(`${eligible.length - fails} sertifikat diterbitkan.`) }}>Terbitkan {eligible.length} sertifikat</button>} />
      {s.certificates.length === 0 ? <div className="card"><Empty title="Belum ada sertifikat terbit" body="Validasi nilai peserta yang lulus di menu Nilai, lalu terbitkan di sini." /></div> : (
        <Table head={['Nomor', 'Penerima', 'Kode verifikasi', 'Terbit', 'Status', '']}>
          {s.certificates.map((c) => { const r = s.registrations.find((x) => x.id === c.registrationId)!; return (
            <tr key={c.id}><td className="font-mono text-xs font-semibold">{c.number}</td><td>{s.users.find((u) => u.id === r.userId)?.name}</td><td className="font-mono text-xs">{c.verificationCode}</td><td>{dateID(c.issuedAt)}</td><td><Badge status={c.status} /></td>
              <td className="whitespace-nowrap text-right"><button className="btn-ghost !min-h-9" onClick={() => setView(c.id)}>Lihat</button>{c.status === 'issued' && <> <button className="btn-ghost !min-h-9" onClick={() => { setRev(c.id); setReason('') }}>Cabut</button></>}</td></tr>) })}
        </Table>
      )}
      <Modal open={!!cert} title="Pratinjau sertifikat" onClose={() => setView(null)}>
        {cert && prog && owner && <><CertificateView cert={cert} user={owner} program={prog} instName={s.settings.name} signerName={s.settings.signerName} signerTitle={s.settings.signerTitle} /><a className="btn-primary mt-4 w-full" href={`/api/certificates/${cert.id}/pdf`} target="_blank" rel="noreferrer"><IconPrinter size={18} />Buka PDF sertifikat</a></>}
      </Modal>
      <Modal open={!!rev} title="Cabut sertifikat" onClose={() => setRev(null)}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); act(revokeCertificate(rev!, reason), 'Sertifikat dicabut.', () => setRev(null)) }}>
          <Field label="Alasan"><textarea className="input !py-2" rows={3} required value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <button className="btn-danger w-full">Cabut</button>
        </form>
      </Modal>
    </>
  )
}

/* ---------------- Sistem ---------------- */
export function Pengguna() {
  const s = useStore((x) => x)
  const act = useAct()
  const [u, setU] = useState<User | null>(null)
  const [pw, setPw] = useState('')
  const staff = s.users.filter((x) => x.role !== 'peserta')
  return (
    <>
      <PageHeader title="Pengguna staf" sub="Akun staf hanya dibuat Super Admin. Peserta mendaftar sendiri." action={<button className="btn-primary" onClick={() => { setPw(''); setU({ id: newId('u'), name: '', email: '', phone: '', role: 'instruktur', emailVerified: true, active: true }) }}><IconPlus size={18} />Staf baru</button>} />
      <Table head={['Nama', 'Email', 'Role', 'Status', '']}>
        {staff.map((x) => <tr key={x.id}><td className="font-semibold">{x.name}</td><td>{x.email}</td><td>{ROLE_LABEL[x.role]}</td><td><Badge status={x.active ? 'open' : 'draft'} /></td><td className="text-right"><button className="btn-ghost !min-h-9" onClick={() => setU(x)}>Ubah</button></td></tr>)}
      </Table>
      <Modal open={!!u} title="Akun staf" onClose={() => setU(null)}>
        {u && <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); act(saveUser(u, pw), 'Akun disimpan.', () => setU(null)) }}>
          <Field label="Nama"><input className="input" required value={u.name} onChange={(e) => setU({ ...u, name: e.target.value })} /></Field>
          <Field label="Email"><input className="input" type="email" required value={u.email} onChange={(e) => setU({ ...u, email: e.target.value })} /></Field>
          <Field label="Role"><select className="input" value={u.role} onChange={(e) => setU({ ...u, role: e.target.value as Role })}>{(Object.keys(ROLE_LABEL) as Role[]).filter((r) => r !== 'peserta').map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></Field>
          {!s.users.some((x) => x.id === u.id) && <Field label="Password awal" hint="Minimal 8 karakter. Staf diminta menggantinya saat masuk pertama."><input className="input" type="text" required minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="off" /></Field>}
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-brand-600" checked={u.active} onChange={(e) => setU({ ...u, active: e.target.checked })} />Akun aktif</label>
          <button className="btn-primary w-full">Simpan</button>
        </form>}
      </Modal>
    </>
  )
}

export function Pengaturan() {
  const act = useAct()
  const [f, setF] = useState(getState().settings)
  const set = (k: keyof typeof f) => (e: any) => setF({ ...f, [k]: e.target.type === 'number' ? +e.target.value : e.target.value })
  return (
    <>
      <PageHeader title="Pengaturan" sub="Dipakai di tagihan, batas bayar, dan bagian kontak landing page." />
      <form className="card max-w-2xl space-y-4 p-6" onSubmit={(e) => { e.preventDefault(); act(saveSettings(f), 'Pengaturan disimpan.') }}>
        <Field label="Nama lembaga"><input className="input" value={f.name} onChange={set('name')} /></Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Bank"><input className="input" value={f.bankName} onChange={set('bankName')} /></Field>
          <Field label="Nomor rekening"><input className="input" value={f.bankAccount} onChange={set('bankAccount')} /></Field>
          <Field label="Atas nama"><input className="input" value={f.bankHolder} onChange={set('bankHolder')} /></Field>
        </div>
        <Field label="Batas bayar (jam)"><input className="input" type="number" min={1} value={f.payDueHours} onChange={set('payDueHours')} /></Field>
        <Field label="Alamat"><input className="input" value={f.address} onChange={set('address')} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Telepon"><input className="input" value={f.phone} onChange={set('phone')} /></Field>
          <Field label="WhatsApp (format 62...)"><input className="input" value={f.whatsapp} onChange={set('whatsapp')} /></Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Penanda tangan sertifikat"><input className="input" value={f.signerName} onChange={set('signerName')} /></Field><Field label="Jabatan penanda tangan"><input className="input" value={f.signerTitle} onChange={set('signerTitle')} /></Field></div>
        <Field label="Jam layanan"><input className="input" value={f.hours} onChange={set('hours')} /></Field>
        <div className="flex gap-2"><button className="btn-primary">Simpan</button></div>
      </form>
    </>
  )
}

export function Audit() {
  const s = useStore((x) => x)
  return (
    <>
      <PageHeader title="Audit log" sub="Catatan aksi penting: siapa, apa, kapan." />
      {s.audit.length === 0 ? <div className="card"><Empty title="Belum ada catatan" body="Lakukan aksi seperti verifikasi pembayaran atau validasi nilai, dan catatannya muncul di sini." /></div> : (
        <Table head={['Waktu', 'Pelaku', 'Aksi', 'Detail']}>
          {s.audit.map((a) => <tr key={a.id}><td className="whitespace-nowrap">{dateTimeID(a.at)}</td><td>{s.users.find((u) => u.id === a.userId)?.name ?? a.userId}</td><td className="font-mono text-xs font-semibold">{a.action}</td><td className="text-muted">{a.detail}</td></tr>)}
        </Table>
      )}
    </>
  )
}

export function EmailQueue() {
  const s = useStore((x) => x)
  return (
    <>
      <PageHeader title="Pengumuman dan email" sub="Semua email lewat antrean dengan retry bertahap 1, 5, dan 30 menit. Tanpa SMTP_HOST di server, email hanya dicatat." />
      <PengumumanForm />
      {s.emails.length === 0 ? <div className="card"><Empty title="Antrean kosong" body="Email muncul saat ada pendaftaran, verifikasi pembayaran, atau penerbitan sertifikat." /></div> : (
        <Table head={['Waktu', 'Tujuan', 'Subjek', 'Status']}>
          {s.emails.map((m) => <tr key={m.id}><td className="whitespace-nowrap">{dateTimeID(m.at)}</td><td>{m.to}</td><td>{m.subject}</td><td><Badge status={m.status === 'sent' ? 'verified' : 'submitted'} /></td></tr>)}
        </Table>
      )}
    </>
  )
}
