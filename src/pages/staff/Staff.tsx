import { IconArrowBackUp, IconArrowRight, IconCheck, IconFileSpreadsheet, IconPlus, IconTrash, IconX } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PengumumanForm } from './Akademik'
import { NilaiMapel } from './NilaiMapel'
import { PantauInstruktur } from './PantauInstruktur'
import { DashboardAkademik } from './DashboardAkademik'
import { InfografisKeuangan } from './InfografisKeuangan'
import { exportNilaiXlsx } from '../../lib/exportNilai'
import { ask, Badge, CountUp, KIND_LABEL, Table, Empty, Field, Modal, MoneyInput, PageHeader, Reveal, dateID, dateTimeID, rupiah, useAct, useToast } from '../../components/ui'
import {
  archiveProgram, restoreProgram, deleteBatch, deleteProgram, finalScore, getState, newId, recommendPass, rejectPayment,
  saveBatch, saveGrade, saveProgram, saveSettings, saveUser, deleteUser, seatsTaken, submitGrade, teachesBatch, useStore, verifyPayment,
  setUserPassword, unattendedSessions,
} from '../../lib/store'
import { PesertaActions, randomPassword } from './PesertaTools'
import { HapusPesertaModal } from './PesertaAdmin'
import { ROLE_LABEL, type Batch, type Program, type Role, type User } from '../../lib/types'

/** Input nilai dengan buffer lokal; disimpan ke server saat kehilangan fokus. */
function GradeInput({ label, value, disabled, onSave }: { label: string; value: number; disabled: boolean; onSave: (v: number) => void }) {
  const [v, setV] = useState(String(value))
  useEffect(() => setV(String(value)), [value])
  return <input aria-label={label} className="input !min-h-9 !w-20 !px-2" type="number" min={0} max={100} disabled={disabled} value={v}
    onChange={(e) => setV(e.target.value)} onBlur={() => { const n = Math.max(0, Math.min(100, +v || 0)); if (n !== value) onSave(n) }} />
}

/** Dashboard instruktur: rekap kehadiran tiap peserta didik di angkatan yang diajar. */
function RekapKehadiran({ instructorId }: { instructorId: string }) {
  const s = useStore((x) => x)
  const mine = s.batches.filter((b) => teachesBatch(s, instructorId, b.id) && b.status !== 'draft' && b.status !== 'cancelled')
  if (mine.length === 0) return <section className="card lg:col-span-2"><Empty title="Belum ada angkatan" body="Rekap kehadiran muncul setelah Anda ditetapkan sebagai instruktur sebuah angkatan." /></section>
  return (
    <div className="space-y-5 lg:col-span-2">
      {mine.map((b) => {
        const p = s.programs.find((x) => x.id === b.programId)
        const people = s.registrations.filter((r) => r.batchId === b.id && (r.status === 'active' || r.status === 'completed'))
        const regIds = new Set(people.map((r) => r.id))
        const sessions = s.sessions.filter((x) => x.batchId === b.id)
        const rec = s.attendances.filter((a) => regIds.has(a.registrationId) && sessions.some((x) => x.id === a.sessionId))
        const held = new Set(rec.map((a) => a.sessionId)).size // pertemuan yang sudah dicatat absensinya
        const min = p?.rules.minAttendance ?? 0
        return (
          <section key={b.id} className="card overflow-hidden" aria-labelledby={`rk-${b.id}`}>
            <div className="flex flex-wrap items-center justify-between gap-2 p-5 pb-3">
              <div><h2 id={`rk-${b.id}`} className="font-bold">Rekap kehadiran {b.code}</h2><p className="text-sm text-muted">{p?.title} · {held} dari {sessions.length} pertemuan sudah diabsen · minimal hadir {min}%</p></div>
              <Link to="/admin/absensi" className="btn-ghost !min-h-9">Isi absensi<IconArrowRight size={16} /></Link>
            </div>
            {people.length === 0 ? <Empty title="Belum ada peserta" body="Peserta muncul setelah registrasi ulangnya dikonfirmasi dan ditempatkan di angkatan ini." /> : (
              <Table bare head={['Peserta didik', 'NIP', 'Hadir', 'Izin', 'Sakit', 'Alpa', 'Kehadiran']}>
                {people.map((r) => {
                  const mineRec = rec.filter((a) => a.registrationId === r.id)
                  const n = (st: string) => mineRec.filter((a) => a.status === st).length
                  const pct = held > 0 ? Math.round((n('hadir') / held) * 100) : null
                  const low = pct !== null && pct < min
                  return (
                    <tr key={r.id}>
                      <td className="font-semibold">{s.users.find((u) => u.id === r.userId)?.name}</td>
                      <td className="font-mono text-xs">{r.nip ?? '-'}</td>
                      <td className="tabular-nums">{n('hadir')}</td><td className="tabular-nums">{n('izin')}</td><td className="tabular-nums">{n('sakit')}</td>
                      <td className={`tabular-nums ${n('alpa') ? 'font-semibold text-red-700' : ''}`}>{n('alpa')}</td>
                      <td>
                        {pct === null ? <span className="text-muted">Belum ada absensi</span> : (
                          <div className="flex items-center gap-2" role="img" aria-label={`Kehadiran ${pct} persen${low ? ', di bawah minimal' : ''}`}>
                            <div className="h-2 w-24 overflow-hidden rounded-full bg-canvas"><div className={`h-full rounded-full ${low ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} /></div>
                            <span className={`text-sm font-semibold tabular-nums ${low ? 'text-red-700' : ''}`}>{pct}%</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </Table>
            )}
          </section>
        )
      })}
    </div>
  )
}

/* ---------------- Dashboard ---------------- */
export function Dashboard() {
  const s = useStore((x) => x)
  const me = s.users.find((u) => u.id === s.sessionUserId)!
  const queue = s.payments.filter((p) => p.status === 'submitted').length
  // Nilai per mata pelajaran: instruktur menyetor, Akademik memvalidasi.
  const toFill = s.batchSubjects.filter((bs) => bs.instructorId === me.id && !s.subjectGrades.some((x) => x.subjectId === bs.subjectId && x.status !== 'draft' && s.registrations.some((r) => r.id === x.registrationId && r.batchId === bs.batchId))).length
  const toValidate = new Set(s.subjectGrades.filter((x) => x.status === 'submitted').map((x) => `${s.registrations.find((r) => r.id === x.registrationId)?.batchId}|${x.subjectId}`)).size
  const awaitingDecision = s.registrations.filter((r) => r.stage === 'menunggu_hasil').length
  const awaitingReenroll = s.registrations.filter((r) => r.stage === 'registrasi_ulang' && r.status === 'pending_payment').length
  const openBatches = s.batches.filter((b) => b.status === 'open')
  // Tahapan penerimaan, lalu hasil akhirnya. Peserta aktif dihitung dari tahap aktif.
  const statuses = ['data', 'bayar_daftar', 'ujian', 'menunggu_hasil', 'registrasi_ulang', 'aktif', 'tidak_lulus'] as const
  const counts = statuses.map((k) => [k, s.registrations.filter((r) => r.stage === k && r.status !== 'expired' && (k === 'tidak_lulus' || r.status !== 'cancelled')).length] as const)
  const max = Math.max(1, ...counts.map((c) => c[1]))
  const revenue = s.payments.filter((p) => p.status === 'verified').reduce((a, p) => a + p.amountPaid, 0)

  const R = (...a: Role[]) => a
  const todo: { role: Role[]; to: string; n: number; label: string }[] = [
    { role: R('super_admin'), to: '/admin/pembayaran', n: queue, label: 'bukti pembayaran menunggu verifikasi' },
    { role: R('admin_keuangan'), to: '/admin/pendaftar', n: s.payments.filter((p) => p.status === 'submitted' && p.kind === 'pendaftaran').length, label: 'bukti pembayaran pendaftaran menunggu verifikasi' },
    { role: R('admin_keuangan'), to: '/admin/pembayaran', n: s.payments.filter((p) => p.status === 'submitted' && p.kind !== 'pendaftaran').length, label: 'bukti registrasi ulang dan cicilan menunggu verifikasi' },
    { role: R('super_admin', 'admin_pendaftaran'), to: '/admin/ujian', n: awaitingDecision, label: 'pendaftar selesai ujian dan menunggu keputusan lulus' },
    { role: R('super_admin', 'admin_pendaftaran'), to: '/admin/pendaftar', n: awaitingReenroll, label: 'pendaftar lulus yang belum registrasi ulang' },
    { role: R('instruktur'), to: '/admin/absensi', n: unattendedSessions(s, me.id).length, label: 'pertemuan belum diisi absensinya (pertemuan baru tidak bisa ditambah sebelum diisi)' },
    { role: R('instruktur'), to: '/admin/nilai', n: toFill, label: 'mata pelajaran yang nilainya belum disetor ke Akademik' },
    { role: R('super_admin', 'akademik'), to: '/admin/validasi-nilai', n: toValidate, label: 'mata pelajaran menunggu validasi nilai' },  ].filter((t) => t.role.includes(me.role))

  return (
    <>
      <PageHeader title="Dashboard" sub={`Masuk sebagai ${ROLE_LABEL[me.role]}.`} />
      <div className="grid gap-5 lg:grid-cols-3">
        <section className={`card p-5 ${me.role === 'akademik' ? 'lg:col-span-3' : 'lg:col-span-1'}`}>
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
        {me.role === 'instruktur' ? <RekapKehadiran instructorId={me.id} /> : me.role === 'akademik' ? <DashboardAkademik /> : <>
        {me.role === 'admin_keuangan' ? <InfografisKeuangan /> : (
        <section className="card p-5 lg:col-span-2">
          <h2 className="font-bold">Pendaftar menurut tahap</h2>
          <p className="text-sm text-muted">Jumlah registrasi di tiap tahap penerimaan saat ini.</p>
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
        )}
        <section className="card overflow-hidden lg:col-span-2">
          <div className="p-5 pb-3"><h2 className="font-bold">Angkatan dibuka</h2></div>
          {openBatches.length === 0 ? <Empty title="Tidak ada angkatan dibuka" body="Buat atau buka angkatan di menu Program dan angkatan." /> : (
            <ul>{openBatches.map((b) => {
              const p = s.programs.find((x) => x.id === b.programId)!; const t = seatsTaken(s, b.id)
              return <li key={b.id} className="flex items-center justify-between gap-3 border-t border-line px-5 py-3 text-sm"><span><b>{b.code}</b> <span className="text-muted">{p.title}</span></span><span className="font-semibold">{t}/{b.quota}</span></li>
            })}</ul>
          )}
        </section>
        </>}
        {['super_admin', 'admin_keuangan', 'admin_pendaftaran'].includes(me.role) && (
        <section className="card p-5">
          <h2 className="font-bold">Pemasukan terverifikasi</h2>
          <p className="mt-3 font-display text-3xl font-bold text-brand-700">{rupiah(revenue)}</p>
          <p className="text-sm text-muted">Dari {s.payments.filter((p) => p.status === 'verified').length} pembayaran.</p>
        </section>
        )}
        {me.role === 'super_admin' && <PantauInstruktur />}
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
  const archived = s.programs.filter((p) => p.archived)
  const blankProg = (): Program => ({ id: newId('pr'), slug: '', title: '', category: 'Hospitality', shortDesc: '', description: '', durationHours: 60, price: 0, active: true, archived: false, nipCode: null, rules: { passingScore: 70, minAttendance: 80 } })
  const blankBatch = (): Batch => ({ id: newId('b'), programId: s.programs[0]?.id ?? '', code: '', startDate: '', endDate: '', quota: 20, status: 'draft', location: '', scheduleDays: '', startTime: '', endTime: '', plannedSessions: 0, angkatan: null })
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
      {archived.length > 0 && <>
        <h2 className="mb-1 mt-8 font-bold">Program diarsipkan</h2>
        <p className="mb-2 text-sm text-muted">Tidak tampil di landing page dan pendaftaran. Program yang dikembalikan masuk ke daftar Program dalam keadaan nonaktif; aktifkan lewat Ubah bila pendaftaran ingin dibuka lagi.</p>
        <Table head={['Program', 'Kategori', 'Durasi', 'Harga', 'Angkatan', '']}>
          {archived.map((p) => (
            <tr key={p.id}><td className="font-semibold">{p.title}</td><td>{p.category}</td><td>{p.durationHours} jam</td><td>{rupiah(p.price)}</td><td className="tabular-nums">{s.batches.filter((b) => b.programId === p.id).length}</td>
              <td className="text-right"><button className="btn-ghost !min-h-9" onClick={() => act(restoreProgram(p.id), 'Program dikembalikan dalam keadaan nonaktif. Aktifkan lewat Ubah bila pendaftaran dibuka lagi.')}><IconArrowBackUp size={16} />Kembalikan</button></td></tr>
          ))}
        </Table>
      </>}
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
          <div className="grid grid-cols-2 gap-3">
            <Field label="Harga (Rp)"><MoneyInput required value={prog.price} onValue={(n) => setProg({ ...prog, price: n })} /></Field>
            <Field label="Kode NIP (1 sampai 9)" hint="Satu digit di NIP, misalnya 1 untuk FB dan 2 untuk RD."><input className="input" type="number" min={1} max={9} required value={prog.nipCode ?? ''} onChange={(e) => setProg({ ...prog, nipCode: e.target.value === '' ? null : +e.target.value })} /></Field>
          </div>
          <Field label="Ringkasan"><input className="input" required maxLength={120} value={prog.shortDesc} onChange={(e) => setProg({ ...prog, shortDesc: e.target.value })} /></Field>
          <Field label="Deskripsi"><textarea className="input !py-2" rows={3} value={prog.description} onChange={(e) => setProg({ ...prog, description: e.target.value })} /></Field>
          <p className="pt-1 text-sm font-bold">Aturan penilaian</p>
          <div className="grid grid-cols-2 gap-3">
            <p className="col-span-2 text-xs text-muted">Bobot nilai (absensi, tugas, teori, praktik) diatur Akademik dan instruktur pengampu per mata pelajaran di menu Input nilai akhir.</p>
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
            <Field label="Angkatan ke- (1 sampai 9)" hint="Satu digit di NIP."><input className="input" type="number" min={1} max={9} required value={batch.angkatan ?? ''} onChange={(e) => setBatch({ ...batch, angkatan: e.target.value === '' ? null : +e.target.value })} /></Field>
            <span aria-hidden />
            <Field label="Mulai"><input className="input" type="date" required value={batch.startDate} onChange={(e) => setBatch({ ...batch, startDate: e.target.value })} /></Field>
            <Field label="Selesai"><input className="input" type="date" required value={batch.endDate} onChange={(e) => setBatch({ ...batch, endDate: e.target.value })} /></Field>
          </div>
          <p className="rounded-lg bg-canvas p-3 text-xs text-muted">Instruktur, hari, jam, dan lokasi diatur Akademik di menu Jadwal pembelajaran.</p>
          <Field label="Status"><select className="input" value={batch.status} onChange={(e) => setBatch({ ...batch, status: e.target.value as Batch['status'] })}>{['draft', 'open', 'running', 'finished', 'cancelled'].map((x) => <option key={x}>{x}</option>)}</select></Field>
          <label className="flex min-h-11 items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5 size-4 accent-brand-600" checked={!!batch.freeRegFee} onChange={(e) => setBatch({ ...batch, freeRegFee: e.target.checked })} /><span>Bebas biaya pendaftaran<span className="block text-xs text-muted">Biaya pendaftaran peserta angkatan ini dianggap lunas (Rp0). Biaya registrasi tetap ditagih penuh.</span></span></label>
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
  const [amts, setAmts] = useState<Record<string, string>>({}) // nominal sesuai bukti yang diubah keuangan, per pembayaran
  const keu = s.users.find((u) => u.id === s.sessionUserId)?.role === 'admin_keuangan'
  // Admin keuangan memverifikasi biaya pendaftaran di menu Pendaftar; di sini hanya registrasi ulang dan cicilan.
  const pool = keu ? s.payments.filter((p) => p.kind !== 'pendaftaran') : s.payments
  const queue = pool.filter((p) => p.status === 'submitted')
  const done = pool.filter((p) => p.status !== 'submitted').sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return (
    <>
      <PageHeader title="Verifikasi pembayaran" sub={keu ? 'Konfirmasi pembayaran registrasi ulang dan cicilan. Pembayaran pendaftaran diverifikasi di menu Pendaftar. Peserta menerima notifikasi di aplikasi dan email.' : 'Konfirmasi pembayaran pendaftaran, registrasi ulang, dan cicilan. Peserta menerima notifikasi di aplikasi dan email.'} />
      {queue.length === 0 ? <div className="card mb-8"><Empty title="Antrean kosong" body="Semua bukti pembayaran sudah diperiksa." /></div> : (
        <div className="mb-8 grid gap-4 lg:grid-cols-2">
          {queue.map((p) => {
            const r = s.registrations.find((x) => x.id === p.registrationId)!
            const diff = p.amountPaid - p.amountDue
            const editable = p.kind !== 'pendaftaran'
            const typed = amts[p.id]
            const verified = editable && typed != null && typed !== '' ? Math.max(0, Math.round(+typed)) : p.amountPaid
            const sisa = Math.max(0, p.amountDue - verified)
            return (
              <Reveal key={p.id}><div className="card p-5">
                <div className="flex items-start justify-between"><div><p className="font-bold">{s.users.find((u) => u.id === r.userId)?.name}</p><p className="text-sm text-muted">{KIND_LABEL[p.kind]} · {r.invoiceNo} · {s.batches.find((b) => b.id === r.batchId)?.code ?? s.programs.find((p) => p.id === r.programId)?.title}</p></div><Badge status={p.status} /></div>
                <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
                  <div><dt className="text-muted">Tagihan</dt><dd className="font-semibold">{rupiah(p.amountDue)}</dd></div>
                  <div><dt className="text-muted">Dibayar</dt><dd className="font-semibold">{rupiah(p.amountPaid)}</dd></div>
                  <div><dt className="text-muted">Selisih</dt><dd className={`font-semibold ${diff === 0 ? 'text-emerald-700' : p.kind === 'pendaftaran' ? 'text-red-700' : diff < 0 ? 'text-amber-800' : 'text-sky-800'}`}>{diff === 0 ? 'Cocok' : p.kind !== 'pendaftaran' ? `${diff < 0 ? 'Kurang' : 'Lebih'} ${rupiah(Math.abs(diff))}` : rupiah(diff)}</dd></div>
                </dl>
                {p.kind !== 'pendaftaran' && diff < 0 && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">Pembayaran kurang tetap bisa disetujui. Peserta langsung mendapat pemberitahuan untuk segera melunasi kekurangannya.</p>}
                {p.kind !== 'pendaftaran' && diff > 0 && <p className="mt-2 rounded-lg bg-sky-50 p-2 text-xs text-sky-900">Kelebihan otomatis memotong cicilan berikutnya saat disetujui.</p>}
                <p className="mt-3 text-sm text-muted">Pengirim {p.payerName} · transfer {dateID(p.transferDate)} · {p.proofFileId ? <a className="font-semibold text-brand-600 underline" href={`/api/files/${p.proofFileId}`} target="_blank" rel="noreferrer">lihat bukti</a> : 'tanpa berkas'}</p>
                {editable && (
                  <div className="mt-3 rounded-lg border border-line p-3">
                    <Field label="Nominal sesuai bukti transfer (Rp)" hint="Ubah bila nominal pada bukti berbeda dari yang diunggah peserta. Kekurangan terhadap tagihan otomatis menjadi tagihan peserta.">
                      <MoneyInput value={typed ?? p.amountPaid} onValue={(n) => setAmts({ ...amts, [p.id]: String(n) })} />
                    </Field>
                    {verified !== p.amountPaid && <p className="mt-2 text-xs font-medium text-amber-900">Nominal diubah dari {rupiah(p.amountPaid)} menjadi {rupiah(verified)}.{sisa > 0 ? ` Sisa ${rupiah(sisa)} menjadi tagihan peserta.` : ''}</p>}
                  </div>
                )}
                <div className="mt-4 flex gap-2">
                  <button className="btn-primary" disabled={editable && verified < 1} onClick={() => act(verifyPayment(p.id, editable ? verified : undefined), verified !== p.amountPaid && editable ? 'Pembayaran dikonfirmasi dengan nominal yang disesuaikan. Sisa menjadi tagihan peserta.' : 'Pembayaran dikonfirmasi. Peserta mendapat notifikasi dan email.')}><IconCheck size={18} />Setujui</button>
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
/** Input nilai akhir: hanya instruktur. Nilai tiap mata pelajaran disetor ke Akademik, yang memvalidasinya di menu Validasi nilai. */
export function Nilai() {
  const s = useStore((x) => x)
  const me = s.users.find((u) => u.id === s.sessionUserId)!
  const toast = useToast()
  const act = useAct()
  const [angkatan, setAngkatan] = useState('') // id angkatan yang ditampilkan; kosong = semua angkatan
  const allRows = s.grades.map((g) => {
    const r = s.registrations.find((x) => x.id === g.registrationId)!
    const b = s.batches.find((x) => x.id === r.batchId)!
    return { g, r, b, p: s.programs.find((x) => x.id === r.programId)!, u: s.users.find((x) => x.id === r.userId)! }
  }).filter((x) => x.b && (x.r.status === 'active' || x.r.status === 'completed')).filter((x) => me.role !== 'instruktur' || teachesBatch(s, me.id, x.b.id)) // instruktur: semua angkatan tempat ia mengampu mata pelajaran
  const batchOptions = [...new Map(allRows.map((x) => [x.b.id, x.b])).values()].sort((a, b) => a.code.localeCompare(b.code))
  const activeBatch = batchOptions.some((b) => b.id === angkatan) ? angkatan : ''
  const rows = allRows.filter((x) => !activeBatch || x.b.id === activeBatch)
  const quiet = (p: Promise<{ ok: boolean }>) => p.then((r: any) => { if (!r.ok) toast(r.error, 'err') })
  // Angkatan tanpa jadwal mata pelajaran (data lama) tetap bisa dinilai langsung per peserta.
  const legacyRows = rows.filter((x) => !s.batchSubjects.some((y) => y.batchId === x.b.id))
  return (
    <>
      <PageHeader title="Input nilai akhir" sub="Isi nilai tugas, teori, dan praktik (skala 0-100) tiap mata pelajaran setelah semua pertemuan dibuat dan diabsen. Kehadiran terisi otomatis dari rekap absensi. Bobot ditentukan Akademik. Setelah lengkap, setor nilai ke Akademik untuk divalidasi dan dimasukkan ke transkrip peserta." />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="block w-56"><span className="label">Angkatan</span>
          <select className="input" value={activeBatch} onChange={(e) => setAngkatan(e.target.value)}>
            <option value="">Semua angkatan ({allRows.length})</option>
            {batchOptions.map((b) => <option key={b.id} value={b.id}>{b.code} ({allRows.filter((x) => x.b.id === b.id).length})</option>)}
          </select>
        </label>
        <button className="btn-primary" disabled={rows.length === 0} onClick={() => {
          const out = exportNilaiXlsx(s, rows, `rekap-nilai-${activeBatch ? batchOptions.find((b) => b.id === activeBatch)!.code : 'semua-angkatan'}-${new Date().toISOString().slice(0, 10)}.xlsx`, me.role === 'instruktur' ? me.id : undefined)
          toast(`Excel diunduh: ${out.peserta} peserta, ${out.sheet} sheet (nilai akhir dan tiap mata pelajaran).`, 'ok')
        }}><IconFileSpreadsheet size={18} />Ekspor Excel</button>
      </div>
      <NilaiMapel batchId={activeBatch} instructorId={me.role === 'instruktur' ? me.id : undefined} />
      {allRows.length === 0 && <div className="card"><Empty title="Belum ada peserta aktif" body="Peserta muncul di sini setelah pembayarannya diverifikasi." /></div>}
      {legacyRows.length > 0 && (
        <>
          <p className="mb-2 text-sm text-muted">Angkatan berikut belum punya jadwal mata pelajaran, jadi nilai teori dan praktik diisi langsung per peserta.</p>
          <Table head={['Peserta didik', 'Teori', 'Praktik', 'Hadir %', 'Akhir', 'Rekomendasi', 'Status', '']}>
            {legacyRows.map(({ g, r, b, p, u }) => {
              const locked = g.status !== 'draft'
              const rec = recommendPass(g, p, b)
              return (
                <tr key={r.id}>
                  <td><p className="font-semibold">{u.name}</p><p className="text-xs text-muted">{p.title} · {b.code}</p></td>
                  {(['theory', 'practical'] as const).map((k) => <td key={k}><GradeInput label={k} value={g[k]} disabled={locked} onSave={(v) => quiet(saveGrade(r.id, { [k]: v }))} /></td>)}
                  <td><b className="tabular-nums">{g.attendancePct}%</b></td>
                  <td className="font-bold">{finalScore(g, p, b)}</td>
                  <td className={rec ? 'font-semibold text-emerald-700' : 'font-semibold text-red-700'}>{rec ? 'Lulus' : 'Tidak lulus'}</td>
                  <td><Badge status={g.status} />{g.status === 'validated' && <span className="ml-1 text-xs">{g.passed ? 'lulus' : 'tidak'}</span>}</td>
                  <td className="whitespace-nowrap text-right">
                    {g.status === 'draft' && <button className="btn-primary !min-h-9" onClick={() => act(submitGrade(r.id), 'Nilai dikirim ke Akademik.')}>Kirim</button>}
                  </td>
                </tr>
              )
            })}
          </Table>
        </>
      )}
    </>
  )
}

/* ---------------- Sistem ---------------- */
/** Label program-program yang diampu instruktur, dipisah koma. */
const instructorProgramLabel = (programs: Program[], v: string[] = []) => v.map((x) => (x === 'gabungan' ? 'Kelas gabungan' : programs.find((p) => p.id === x)?.title)).filter(Boolean).join(', ')

export function Pengguna({ kind }: { kind: 'pengelola' | 'siswa' }) {
  const s = useStore((x) => x)
  const act = useAct()
  const tab = kind === 'pengelola' ? 'staf' : 'peserta'
  const [find, setFind] = useState('')
  const [roleFilter, setRoleFilter] = useState<'semua' | Role>('semua')
  const [siswaFilter, setSiswaFilter] = useState<'semua' | 'pendaftar' | 'didik'>('semua')
  const [u, setU] = useState<User | null>(null)
  const [hapus, setHapus] = useState<string | null>(null)
  const [pw, setPw] = useState('')
  const [pwFor, setPwFor] = useState<User | null>(null)
  const [newPw, setNewPw] = useState('')
  const [force, setForce] = useState(true)
  const programs = s.programs.filter((p) => !p.archived)
  const needle = find.trim().toLowerCase()
  const match = (x: User) => !needle || x.name.toLowerCase().includes(needle) || x.email.toLowerCase().includes(needle)
  const staff = s.users.filter((x) => x.role !== 'peserta' && (roleFilter === 'semua' || x.role === roleFilter) && match(x))
  /** Peserta didik = punya pendaftaran yang sudah masuk tahap aktif; selain itu masih berstatus pendaftar. */
  const isDidik = (x: User) => s.registrations.some((r) => r.userId === x.id && r.stage === 'aktif')
  const peserta = s.users.filter((x) => x.role === 'peserta' && match(x) && (siswaFilter === 'semua' || (siswaFilter === 'didik') === isDidik(x)))
  const isNew = !!u && !s.users.some((x) => x.id === u.id)
  const pwButton = (x: User) => <button className="btn-ghost !min-h-9" onClick={() => { setPwFor(x); setNewPw(randomPassword()); setForce(true) }}>Password</button>

  return (
    <>
      <PageHeader title={tab === 'staf' ? 'Akun pengelola' : 'Akun siswa'}
        sub={tab === 'staf'
          ? 'Akun Super Admin, Admin Pendaftaran, Admin Keuangan, Akademik, dan Instruktur. Super Admin dapat mengganti password siapa pun.'
          : 'Akun pendaftar dan peserta didik. Pendaftar menjadi peserta didik setelah registrasi ulang selesai.'}
        action={tab === 'staf'
          ? <button className="btn-primary" onClick={() => { setPw(randomPassword()); setU({ id: newId('u'), name: '', email: '', phone: '', role: 'instruktur', active: true, instructorPrograms: [] }) }}><IconPlus size={18} />Pengelola baru</button>
          : <PesertaActions regs={s.registrations.filter((r) => r.stage === 'aktif' && (r.status === 'active' || r.status === 'completed'))} />} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex flex-wrap rounded-lg border border-line bg-white p-1" role="group" aria-label={tab === 'staf' ? 'Filter role' : 'Filter jenis siswa'}>
          {(tab === 'staf'
            ? ([['semua', 'Semua'], ...(Object.keys(ROLE_LABEL) as Role[]).filter((r) => r !== 'peserta').map((r) => [r, ROLE_LABEL[r]] as const)] as [string, string][])
            : ([['semua', 'Semua'], ['pendaftar', 'Pendaftar'], ['didik', 'Peserta didik']] as [string, string][])
          ).map(([t, label]) => {
            const cur = tab === 'staf' ? roleFilter : siswaFilter
            return <button key={t} aria-pressed={cur === t} className={`min-h-9 rounded-md px-3 text-sm font-semibold transition ${cur === t ? 'bg-brand-600 text-white' : 'hover:bg-brand-50'}`} onClick={() => (tab === 'staf' ? setRoleFilter(t as 'semua' | Role) : setSiswaFilter(t as 'semua' | 'pendaftar' | 'didik'))}>{label}</button>
          })}
        </div>
        <input className="input !w-64" type="search" placeholder="Cari nama atau email" aria-label="Cari pengguna" value={find} onChange={(e) => setFind(e.target.value)} />
      </div>

      {tab === 'staf' ? (
        <Table head={['Nama', 'Email', 'Role', 'Status', '']}>
          {staff.map((x) => <tr key={x.id}><td className="font-semibold">{x.name}</td><td>{x.email}</td>
            <td>{ROLE_LABEL[x.role]}{x.role === 'instruktur' && <span className="block text-xs text-muted">{instructorProgramLabel(s.programs, x.instructorPrograms) || 'Program belum dipilih'}</span>}</td>
            <td><Badge status={x.active ? 'open' : 'draft'} /></td>
            <td className="whitespace-nowrap text-right"><button className="btn-ghost !min-h-9" onClick={() => { setPw(''); setU(x) }}>Ubah</button>{pwButton(x)}
              {x.id !== s.sessionUserId && <button className="btn-ghost !min-h-9 text-red-700" aria-label={`Hapus ${x.name}`} onClick={async () => await ask(`Hapus akun ${x.name} (${x.email}) secara permanen?`) && act(deleteUser(x.id), 'Akun dihapus.')}><IconTrash size={16} />Hapus</button>}</td></tr>)}
        </Table>
      ) : peserta.length === 0 ? <div className="card"><Empty title="Tidak ada akun siswa" body="Tambah atau impor peserta didik, atau ubah filter dan kata pencarian." /></div> : (
        <Table head={['Nama', 'Email', 'Jenis', 'Program dan angkatan', 'NIP', '']}>
          {peserta.map((x) => {
            const r = s.registrations.filter((y) => y.userId === x.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
            return <tr key={x.id}><td className="font-semibold">{x.name}</td><td>{x.email}</td><td>{isDidik(x) ? 'Peserta didik' : 'Pendaftar'}</td>
              <td>{r ? <>{s.programs.find((p) => p.id === r.programId)?.title}<span className="block text-xs text-muted">{s.batches.find((b) => b.id === r.batchId)?.code ?? 'Angkatan belum ditetapkan'}</span></> : '-'}</td>
              <td className="font-mono text-xs">{r?.nip ?? '-'}</td>
              <td className="whitespace-nowrap text-right">{pwButton(x)}<button className="btn-ghost !min-h-9 text-red-700" aria-label={`Hapus ${x.name}`} onClick={() => setHapus(x.id)}><IconTrash size={16} />Hapus</button></td></tr>
          })}
        </Table>
      )}

      <Modal open={!!u} title={isNew ? 'Staf baru' : 'Ubah akun staf'} onClose={() => setU(null)}>
        {u && <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); act(saveUser(u, pw), 'Akun disimpan.', () => setU(null)) }}>
          <Field label="Nama"><input className="input" required value={u.name} onChange={(e) => setU({ ...u, name: e.target.value })} /></Field>
          <Field label="Email"><input className="input" type="email" required value={u.email} onChange={(e) => setU({ ...u, email: e.target.value })} /></Field>
          <Field label="Role"><select className="input" value={u.role} onChange={(e) => setU({ ...u, role: e.target.value as Role })}>{(Object.keys(ROLE_LABEL) as Role[]).filter((r) => r !== 'peserta').map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></Field>
          {u.role === 'instruktur' && (
            <fieldset>
              <legend className="label">Program / jenis pelatihan yang diampu</legend>
              <p className="mb-2 text-xs text-muted">Boleh lebih dari satu. Menentukan mata pelajaran yang bisa ditugaskan Akademik kepada instruktur ini.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {[...programs.map((p) => [p.id, p.title] as const), ['gabungan', 'Kelas gabungan'] as const].map(([id, title]) => {
                  const list = u.instructorPrograms ?? []
                  const on = list.includes(id)
                  return (
                    <label key={id} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm transition ${on ? 'border-brand-600 bg-brand-50 font-semibold' : 'border-line bg-white hover:bg-brand-50'}`}>
                      <input type="checkbox" className="size-4 accent-brand-600" checked={on} onChange={(e) => setU({ ...u, instructorPrograms: e.target.checked ? [...list, id] : list.filter((x) => x !== id) })} />{title}
                    </label>
                  )
                })}
              </div>
              {!(u.instructorPrograms ?? []).length && <p className="mt-1 text-xs text-amber-800">Pilih minimal satu program.</p>}
            </fieldset>
          )}
          {isNew && <Field label="Password awal" hint="Minimal 8 karakter. Staf diminta menggantinya saat masuk pertama."><input className="input font-mono" type="text" required minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="off" /></Field>}
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-brand-600" checked={u.active} onChange={(e) => setU({ ...u, active: e.target.checked })} />Akun aktif</label>
          <button className="btn-primary w-full">Simpan</button>
        </form>}
      </Modal>

      <HapusPesertaModal userId={hapus} onClose={() => setHapus(null)} />

      <Modal open={!!pwFor} title={`Ganti password ${pwFor?.name ?? ''}`} onClose={() => setPwFor(null)}>
        {pwFor && <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); act(setUserPassword(pwFor.id, newPw, force), 'Password diganti. Sampaikan password baru kepada pengguna.', () => setPwFor(null)) }}>
          <p className="text-sm text-muted">{pwFor.email} · {ROLE_LABEL[pwFor.role]}</p>
          <Field label="Password baru" hint="Minimal 8 karakter. Catat sebelum menyimpan; password tidak dapat dilihat lagi.">
            <div className="flex gap-2"><input className="input font-mono" type="text" required minLength={8} maxLength={100} value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="off" /><button type="button" className="btn-ghost shrink-0" onClick={() => setNewPw(randomPassword())}>Acak</button></div>
          </Field>
          {pwFor.id !== s.sessionUserId && <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-brand-600" checked={force} onChange={(e) => setForce(e.target.checked)} />Wajib ganti password saat masuk berikutnya</label>}
          <button className="btn-primary w-full">Simpan password</button>
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
      {s.emails.length === 0 ? <div className="card"><Empty title="Antrean kosong" body="Email muncul saat ada pendaftaran, verifikasi pembayaran, atau pengumuman." /></div> : (
        <Table head={['Waktu', 'Tujuan', 'Subjek', 'Status']}>
          {s.emails.map((m) => <tr key={m.id}><td className="whitespace-nowrap">{dateTimeID(m.at)}</td><td>{m.to}</td><td>{m.subject}</td><td><Badge status={m.status === 'sent' ? 'verified' : 'submitted'} /></td></tr>)}
        </Table>
      )}
    </>
  )
}
