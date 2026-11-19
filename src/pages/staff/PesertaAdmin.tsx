import { IconArrowLeft, IconCheck, IconFileSpreadsheet, IconPlayerPlay, IconTrash, IconX } from '@tabler/icons-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ask, Badge, Empty, Field, Modal, MoneyInput, PageHeader, Table, dateID, rupiah, useAct, useToast } from '../../components/ui'
import { AngkatanFilter, angkatanKe, cocokAngkatan, useAngkatan } from '../../lib/angkatan'
import { DOC_KINDS, DOC_LABEL, assignBatch, cancelRegistration, changeProgram, deletePeserta, docsComplete, issueNip, remindProfile, rejectPayment, removeDocument, resumeRegistrationAdmin, saveProfileAsAdmin, setFollowUp, useStore, verifyPayment } from '../../lib/store'
import type { Registration } from '../../lib/types'
import { billMessage } from '../../lib/billing'
import { WaButton, stageMessage, withdrawnMessage } from '../../lib/wa'
import { INTERNSHIP_LABEL, ProfileForm, infoSourceText } from '../peserta/DataDiri'
import { Tagihan } from './Tagihan'
import { PesertaActions } from './PesertaTools'
import { buildXlsx, downloadBlob, type Cell } from '../../lib/xlsx'
import { exportBuktiPenerimaanXlsx } from '../../lib/exportKeuangan'

const L = (v?: string) => (v === 'L' ? 'Laki-laki' : v === 'P' ? 'Perempuan' : '-')

/** Data calon atau peserta: identitas, alamat, dan (bila sudah ada) berkas registrasi ulang. */
function DataModal({ userId, onClose }: { userId: string | null; onClose: () => void }) {
  const s = useStore((x) => x)
  const user = s.users.find((u) => u.id === userId)
  const p = s.profiles.find((x) => x.userId === userId)
  const docs = s.documents.filter((d) => d.userId === userId)
  const nip = s.registrations.find((r) => r.userId === userId && r.nip)?.nip
  const canEdit = ['super_admin', 'admin_pendaftaran'].includes(s.users.find((u) => u.id === s.sessionUserId)?.role ?? '')
  const act = useAct()
  return (
    <Modal open={!!userId && !!user} title={user?.name ?? ''} onClose={onClose}>
      {user && (
        <div className="space-y-4 text-sm">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            {([
              ...(nip ? [['NIP', nip]] : []), ['NIK', user.nik], ['Tanggal lahir', user.birthDate ? dateID(user.birthDate) : ''], ['Email', user.email], ['Telepon', user.phone],
              ...(p ? [['Jenis kelamin', L(p.gender)], ['Tempat lahir', p.birthPlace], ['Pendidikan', p.education], ['Pekerjaan', p.occupation], ['Asal sekolah', p.school ?? ''],
                ['Kesediaan magang', INTERNSHIP_LABEL[p.internshipPref ?? ''] ?? ''], ['Standar grooming', p.groomingAgreed ? 'Bersedia' : ''], ['Mengetahui pendaftaran dari', infoSourceText(p)],
                ['Kecamatan', p.district], ['Kota atau kabupaten', p.city], ['Provinsi', p.province], ['Kode pos', p.postalCode]] : []),
            ] as [string, string][]).map(([k, v]) => <div key={k}><dt className="text-xs text-muted">{k}</dt><dd className="font-semibold">{v || '-'}</dd></div>)}
            {p && <div className="col-span-2"><dt className="text-xs text-muted">Alamat</dt><dd className="font-semibold">{p.address}, RT {p.rt}/RW {p.rw}</dd></div>}
          </dl>
          {!p && <p className="rounded-lg bg-canvas p-3 text-muted">Data diri belum diisi.</p>}
          {canEdit && <Link to={`/admin/peserta/${user.id}/data`} className="btn-primary w-full">Ubah data diri</Link>}
          <div className="border-t border-line pt-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Berkas registrasi ulang</p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {DOC_KINDS.map((k) => {
                const d = docs.find((x) => x.kind === k)
                return (
                  <li key={k} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-sm">
                    <span>{DOC_LABEL[k]}</span>
                    {d ? (
                      <span className="flex items-center gap-3">
                        <a className="font-semibold text-brand-600 underline" href={`/api/files/${d.fileId}`} target="_blank" rel="noreferrer">Lihat</a>
                        {canEdit && <button className="text-sm font-semibold text-red-700 underline" onClick={async () => await ask(`Hapus ${DOC_LABEL[k]}? Peserta akan diminta mengunggah ulang.`) && act(removeDocument(userId!, k), 'Berkas dihapus. Peserta diminta mengunggah ulang.')}>Hapus</button>}
                      </span>
                    ) : <span className="text-muted">Belum ada</span>}
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      )}
    </Modal>
  )
}

/** Admin mengoreksi data diri peserta, termasuk setelah registrasi ulang (saat peserta sendiri sudah tidak bisa mengubah). */
export function EditDataPeserta() {
  const { userId } = useParams()
  const nav = useNavigate()
  const s = useStore((x) => x)
  const user = s.users.find((u) => u.id === userId && u.role === 'peserta')
  const profile = s.profiles.find((p) => p.userId === userId)
  const back = <Link to="/admin/peserta" className="mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline"><IconArrowLeft size={16} />Kembali ke Peserta</Link>
  if (!user) return <>{back}<div className="card"><Empty title="Peserta tidak ditemukan" body="Data ini tidak ada atau Anda tidak berhak mengubahnya." /></div></>
  return (
    <>
      {back}
      <PageHeader title={`Ubah data diri: ${user.name}`} sub="Admin boleh mengoreksi semua isian, termasuk NIK dan tanggal lahir. Perubahan tercatat di audit log." />
      <ProfileForm key={user.id} user={user} profile={profile} lockIdentity={false} canEditEmail={s.users.find((u) => u.id === s.sessionUserId)?.role === 'super_admin'} submitLabel="Simpan perubahan"
        onSubmit={(fields) => saveProfileAsAdmin(user.id, fields)} savedMessage="Data diri peserta diperbarui." onSaved={() => nav('/admin/peserta')} />
    </>
  )
}

/** Admin pendaftaran memilih angkatan untuk pendaftaran peserta. Yang lain hanya melihat kodenya. */
function BatchPicker({ r, canAssign }: { r: Registration; canAssign: boolean }) {
  const s = useStore((x) => x)
  const act = useAct()
  const cur = s.batches.find((b) => b.id === r.batchId)
  const live = ['pending_payment', 'waiting_verification', 'active'].includes(r.status)
  if (!canAssign || !live) return <>{cur?.code ?? <span className="text-muted">Belum ditetapkan</span>}</>
  const opts = s.batches.filter((b) => b.programId === r.programId && (b.id === r.batchId || b.status === 'open' || b.status === 'running'))
  return (
    <select className="input !min-h-9 !w-auto" value={r.batchId} aria-label="Tetapkan angkatan" onChange={(e) => e.target.value && act(assignBatch(r.id, e.target.value), 'Angkatan ditetapkan.')}>
      <option value="">Pilih angkatan</option>
      {opts.map((b) => { const left = b.quota - (s.seats[b.id] ?? 0); return <option key={b.id} value={b.id} disabled={left <= 0 && b.id !== r.batchId}>{b.code} · {left > 0 ? `sisa ${left}` : 'penuh'}</option> })}
    </select>
  )
}


/**
 * Pendaftar. Keuangan melihat pembayaran per peserta. Admin pendaftaran dan Super Admin punya dua tab:
 * tahapan penerimaan dan pembayaran.
 */
export function Pendaftar() {
  const role = useStore((x) => x.users.find((u) => u.id === x.sessionUserId)?.role)
  const [tab, setTab] = useState<'tahapan' | 'bayar'>('tahapan')
  if (role === 'admin_keuangan') {
    return <RekapBayarDaftar />
  }
  // Admin pendaftaran tidak mengurus pembayaran: cukup tahapan penerimaan.
  if (role !== 'super_admin') return <TahapanPendaftar />
  return (
    <>
      <div role="tablist" aria-label="Tampilan pendaftar" className="mb-5 flex gap-1 border-b border-line">
        {([['tahapan', 'Tahapan penerimaan'], ['bayar', 'Pembayaran per peserta']] as const).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`-mb-px min-h-11 shrink-0 border-b-2 px-4 text-sm font-semibold ${tab === k ? 'border-brand-600 text-brand-700' : 'border-transparent text-muted hover:text-ink'}`}>{label}</button>
        ))}
      </div>
      {tab === 'tahapan' ? <TahapanPendaftar /> : <Tagihan />}
    </>
  )
}

/** Admin keuangan: cukup jumlah pendaftar yang sudah dan belum membayar biaya pendaftaran. Rekap pembayaran lengkap ada di menu Peserta didik. */
type FeeState = 'verified' | 'free' | 'submitted' | 'rejected' | 'unpaid'
const FEE_LABEL: Record<FeeState, { label: string; cls: string }> = {
  verified: { label: 'Terverifikasi', cls: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  free: { label: 'Dibebaskan', cls: 'bg-sky-50 text-sky-800 ring-sky-200' },
  submitted: { label: 'Menunggu verifikasi', cls: 'bg-amber-50 text-amber-800 ring-amber-200' },
  rejected: { label: 'Bukti ditolak', cls: 'bg-red-50 text-red-800 ring-red-200' },
  unpaid: { label: 'Belum bayar', cls: 'bg-canvas text-ink ring-line' },
}

function RekapBayarDaftar() {
  const s = useStore((x) => x)
  const act = useAct()
  const [f, setF] = useState<'all' | FeeState>('all')
  const [q, setQ] = useState('')
  const [rej, setRej] = useState<string | null>(null)
  const [ver, setVer] = useState<{ id: string; amount: number; due: number; uploaded: number } | null>(null) // verifikasi dengan nominal yang bisa disesuaikan
  const [reason, setReason] = useState('')
  const liveRegs = s.registrations.filter((r) => r.status !== 'cancelled' && r.status !== 'expired')
  // Bagian keuangan memulai dari pendaftar yang belum punya angkatan; pilihan lain tetap bisa dipilih di dropdown.
  const [angkatan, setAngkatan] = useAngkatan('none')
  const regs = liveRegs.filter((r) => cocokAngkatan(angkatan, angkatanKe(s, r)))
  const paidIds = new Set(s.payments.filter((p) => p.kind === 'pendaftaran' && p.status === 'verified').map((p) => p.registrationId))
  const waitingIds = new Set(s.payments.filter((p) => p.kind === 'pendaftaran' && p.status === 'submitted').map((p) => p.registrationId))
  const isFree = (r: Registration) => !paidIds.has(r.id) && !!s.batches.find((b) => b.id === r.batchId)?.freeRegFee
  const free = regs.filter(isFree).length
  const paid = regs.filter((r) => paidIds.has(r.id)).length
  const owing = regs.length - free // pendaftar yang memang wajib membayar biaya pendaftaran
  const unpaid = owing - paid
  const waiting = regs.filter((r) => !paidIds.has(r.id) && waitingIds.has(r.id)).length
  const pct = owing ? Math.round((paid / owing) * 100) : 0
  // Status menurut pembayaran pendaftaran: yang terverifikasi menang, lalu angkatan bebas biaya, bukti yang menunggu, lalu bukti terakhir yang ditolak.
  const feeState = (regId: string): FeeState => {
    const mine = s.payments.filter((p) => p.registrationId === regId && p.kind === 'pendaftaran')
    if (mine.some((p) => p.status === 'verified')) return 'verified'
    const reg = regs.find((x) => x.id === regId)
    if (reg && isFree(reg)) return 'free'
    if (mine.some((p) => p.status === 'submitted')) return 'submitted'
    const last = [...mine].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    return last?.status === 'rejected' ? 'rejected' : 'unpaid'
  }
  const rows = regs.map((r) => ({ r, user: s.users.find((u) => u.id === r.userId), state: feeState(r.id), pay: s.payments.filter((p) => p.registrationId === r.id && p.kind === 'pendaftaran' && p.status === 'verified')[0], sub: s.payments.filter((p) => p.registrationId === r.id && p.kind === 'pendaftaran' && p.status === 'submitted').sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] }))
  const shown = rows
    .filter((x) => f === 'all' || x.state === f)
    .filter((x) => !q.trim() || (x.user?.name ?? '').toLowerCase().includes(q.trim().toLowerCase()) || x.r.code.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => b.r.createdAt.localeCompare(a.r.createdAt))
  return (
    <>
      <PageHeader title="Pendaftar" sub="Daftar pendaftar menurut status verifikasi pembayaran pendaftaran. Rekap pembayaran peserta didik ada di menu Pembayaran peserta didik."
        action={<AngkatanFilter values={liveRegs.map((r) => angkatanKe(s, r))} value={angkatan} onChange={setAngkatan} />} />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card p-5"><p className="text-xs font-semibold uppercase tracking-wide text-muted">Total pendaftar</p><p className="mt-1 text-3xl font-bold tabular-nums">{regs.length}</p></div>
        <div className="card p-5"><p className="text-xs font-semibold uppercase tracking-wide text-muted">Sudah bayar pendaftaran</p><p className="mt-1 text-3xl font-bold tabular-nums text-emerald-700">{paid}</p></div>
        <div className="card p-5"><p className="text-xs font-semibold uppercase tracking-wide text-muted">Belum bayar pendaftaran</p><p className="mt-1 text-3xl font-bold tabular-nums text-amber-800">{unpaid}</p>
          {waiting > 0 && <p className="mt-1 text-sm text-muted">{waiting} di antaranya sudah unggah bukti dan <button type="button" className="font-semibold text-brand-600 underline" onClick={() => setF('submitted')}>menunggu verifikasi</button>.</p>}
        </div>
      </div>
      <div className="card mt-4 p-5" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Persentase pendaftar yang sudah membayar pendaftaran">
        <div className="h-3 overflow-hidden rounded-full bg-canvas"><div className="h-full rounded-full bg-emerald-500" style={{ width: pct + '%' }} /></div>
        <p className="mt-2 text-sm text-muted">{pct}% pendaftar{angkatan === 'none' ? ' yang belum punya angkatan' : angkatan !== 'all' ? ` angkatan ${angkatan}` : ''} sudah membayar. Pendaftar yang dibatalkan atau kedaluwarsa tidak dihitung{free ? `, begitu juga ${free} pendaftar di angkatan yang dibebaskan dari biaya pendaftaran` : ''}.</p>
      </div>

      <div className="mb-4 mt-6 flex flex-wrap gap-3">
        <input className="input max-w-xs" placeholder="Cari nama atau kode" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari pendaftar" />
        <select className="input !w-auto" value={f} onChange={(e) => setF(e.target.value as 'all' | FeeState)} aria-label="Filter status verifikasi">
          <option value="all">Semua status ({rows.length})</option>
          {(Object.keys(FEE_LABEL) as FeeState[]).map((k) => <option key={k} value={k}>{FEE_LABEL[k].label} ({rows.filter((x) => x.state === k).length})</option>)}
        </select>
      </div>
      {shown.length === 0 ? <div className="card"><Empty title="Tidak ada pendaftar" body="Belum ada pendaftar, atau tidak ada yang cocok dengan filter ini." /></div> : (
        <Table head={['Kode', 'Pendaftar', 'Program', 'Didaftarkan', 'Status verifikasi', 'Bukti pembayaran', '']}>
          {shown.map(({ r, user, state, pay, sub }) => (
            <tr key={r.id}>
              <td className="font-mono text-xs font-semibold">{r.code}</td>
              <td className="font-semibold">{user?.name}</td>
              <td>{s.programs.find((p) => p.id === r.programId)?.title}</td>
              <td>{dateID(r.createdAt)}</td>
              <td><span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${FEE_LABEL[state].cls}`}>{FEE_LABEL[state].label}</span>{state === 'verified' && pay?.receiptNo && <span className="mt-1 block font-mono text-xs text-muted">{pay.receiptNo}</span>}</td>
              <td className="text-xs">
                {sub
                  ? <><p className="font-semibold tabular-nums">{rupiah(sub.amountPaid)}</p><p className="text-muted">tagihan {rupiah(sub.amountDue)} · transfer {dateID(sub.transferDate)}</p>{sub.amountPaid !== sub.amountDue && <p className="font-semibold text-red-700">Nominal tidak sama</p>}{sub.proofFileId && <a className="font-semibold text-brand-600 underline" href={`/api/files/${sub.proofFileId}`} target="_blank" rel="noreferrer">Lihat bukti</a>}</>
                  : pay ? <><p className="font-semibold tabular-nums">{rupiah(pay.amountPaid)}</p><p className="text-muted">transfer {dateID(pay.transferDate)}</p></> : <span className="text-muted">-</span>}
              </td>
              <td className="whitespace-nowrap text-right">
                {sub && <><button className="btn-primary !min-h-9" onClick={() => setVer({ id: sub.id, amount: sub.amountPaid, due: sub.amountDue, uploaded: sub.amountPaid })}><IconCheck size={16} />Setujui</button>{' '}<button className="btn-ghost !min-h-9" onClick={() => { setRej(sub.id); setReason('') }}><IconX size={16} />Tolak</button>{' '}</>}
                {state !== 'verified' && state !== 'free' && <><WaButton compact phone={user?.phone} label="Kirim WA" text={billMessage(s, r, user?.name ?? '')} />{' '}</>}
                <Link to={`/admin/pendaftar/${r.id}`} className="btn-ghost !min-h-9">{state === 'verified' || state === 'free' || sub ? 'Rincian' : 'Rincian / catat bayar'}</Link>
              </td>
            </tr>
          ))}
        </Table>
      )}
      <Modal open={!!ver} title="Verifikasi pembayaran pendaftaran" onClose={() => setVer(null)}>
        {ver && <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); act(verifyPayment(ver.id, ver.amount), 'Pembayaran pendaftaran dikonfirmasi. Pendaftar mendapat notifikasi dan email.', () => setVer(null)) }}>
          <p className="text-sm text-muted">Tagihan {rupiah(ver.due)}. Pendaftar mengunggah {rupiah(ver.uploaded)}.</p>
          <Field label="Nominal sesuai bukti transfer (Rp)" hint="Ubah bila nominal pada bukti berbeda dari yang diunggah pendaftar."><MoneyInput required value={ver.amount} onValue={(n) => setVer({ ...ver, amount: n })} /></Field>
          {ver.amount !== ver.uploaded && <p className="text-xs font-medium text-amber-900">Nominal diubah dari {rupiah(ver.uploaded)} menjadi {rupiah(ver.amount)}.</p>}
          <button className="btn-primary w-full" disabled={ver.amount < 1}>Setujui pembayaran</button>
        </form>}
      </Modal>
      <Modal open={!!rej} title="Tolak pembayaran pendaftaran" onClose={() => setRej(null)}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); act(rejectPayment(rej!, reason), 'Pembayaran ditolak. Pendaftar diminta unggah ulang.', () => setRej(null)) }}>
          <Field label="Alasan (wajib, dikirim ke pendaftar)"><textarea className="input !py-2" rows={3} required value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <button className="btn-danger w-full">Tolak</button>
        </form>
      </Modal>
    </>
  )
}

/** Ubah program pilihan pendaftar. Hanya sampai peserta menyelesaikan unggah kelima berkas; server juga menegakkan batas ini. */
function ProgramModal({ reg, onClose }: { reg: Registration | null; onClose: () => void }) {
  const s = useStore((x) => x)
  const act = useAct()
  const [target, setTarget] = useState('')
  const user = s.users.find((u) => u.id === reg?.userId)
  const cur = s.programs.find((p) => p.id === reg?.programId)
  const options = s.programs.filter((p) => p.active && p.id !== reg?.programId)
  return (
    <Modal open={!!reg} title="Ubah program pilihan" onClose={() => { setTarget(''); onClose() }}>
      {reg && (
        <form className="space-y-3 text-sm" onSubmit={(e) => { e.preventDefault(); act(changeProgram(reg.id, target), 'Program pilihan diubah.', () => { setTarget(''); onClose() }) }}>
          <p><b>{user?.name}</b> memilih <b>{cur?.title}</b>.</p>
          <Field label="Program baru"><select className="input" required value={target} onChange={(e) => setTarget(e.target.value)}><option value="">Pilih program</option>{options.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></Field>
          <ul className="list-disc space-y-1 pl-5 text-muted">
            <li>Angkatan{reg.nip ? ' dan NIP' : ''} dikosongkan, lalu perlu ditetapkan ulang karena melekat pada program lama.</li>
            <li>Jadwal pembayaran yang sudah dibuat tidak dihitung ulang. Bila harga program berbeda, minta bagian keuangan menyesuaikan.</li>
            <li>Perubahan hanya bisa dilakukan sampai peserta menyelesaikan unggah kelima berkas. Peserta menerima notifikasi.</li>
          </ul>
          <button className="btn-primary w-full" disabled={!target}>Ubah program</button>
        </form>
      )}
    </Modal>
  )
}
/** Status rekap pendaftar: tahap penerimaan, ditambah mundur dan kedaluwarsa. Yang sudah registrasi ulang tetap tercatat di rekap. */
type RekapStatus = 'data' | 'bayar_daftar' | 'ujian' | 'menunggu_hasil' | 'registrasi_ulang' | 'aktif' | 'tidak_lulus' | 'mundur' | 'kedaluwarsa'
const REKAP: [RekapStatus, string, string][] = [
  ['data', 'Isi data diri', 'bg-amber-50 text-amber-800 ring-amber-200'],
  ['bayar_daftar', 'Belum bayar pendaftaran', 'bg-amber-50 text-amber-800 ring-amber-200'],
  ['ujian', 'Mengikuti ujian online', 'bg-sky-50 text-sky-800 ring-sky-200'],
  ['menunggu_hasil', 'Menunggu hasil ujian', 'bg-sky-50 text-sky-800 ring-sky-200'],
  ['registrasi_ulang', 'Lulus, belum registrasi ulang', 'bg-violet-50 text-violet-800 ring-violet-200'],
  ['aktif', 'Sudah registrasi ulang', 'bg-emerald-50 text-emerald-800 ring-emerald-200'],
  ['tidak_lulus', 'Tidak lulus', 'bg-zinc-100 text-zinc-700 ring-zinc-200'],
  ['mundur', 'Mundur', 'bg-red-50 text-red-800 ring-red-200'],
  ['kedaluwarsa', 'Kedaluwarsa', 'bg-zinc-100 text-zinc-700 ring-zinc-200'],
]
const rekapStatus = (r: Registration): RekapStatus => (r.stage === 'tidak_lulus' ? 'tidak_lulus' : r.status === 'cancelled' || r.autoWithdrawn ? 'mundur' : r.status === 'expired' ? 'kedaluwarsa' : r.stage)
const RekapBadge = ({ st }: { st: RekapStatus }) => { const x = REKAP.find((y) => y[0] === st)!; return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${x[2]}`}>{x[1]}</span> }

/** Hapus permanen satu pendaftar atau peserta didik. Konfirmasi dengan mengetik nama lengkapnya. */
export function HapusPesertaModal({ userId, onClose }: { userId: string | null; onClose: () => void }) {
  const s = useStore((x) => x)
  const act = useAct()
  const [typed, setTyped] = useState('')
  const user = s.users.find((u) => u.id === userId)
  const regs = s.registrations.filter((r) => r.userId === userId)
  const paid = s.payments.filter((p) => regs.some((r) => r.id === p.registrationId) && p.status === 'verified').length
  const close = () => { setTyped(''); onClose() }
  return (
    <Modal open={!!user} title={`Hapus ${user?.name ?? ''}`} onClose={close}>
      {user && (
        <form className="space-y-3 text-sm" onSubmit={(e) => { e.preventDefault(); act(deletePeserta(user.id), `${user.name} dihapus permanen.`, close) }}>
          <p className="rounded-lg bg-red-50 px-3 py-2 text-red-900">Akun dan <b>seluruh datanya</b> dihapus permanen dan tidak bisa dikembalikan: registrasi{regs.length ? ` ${regs.map((r) => r.code).join(', ')}` : ''}, data diri, berkas, nilai, absensi, serta riwayat pembayaran{paid ? ` (${paid} pembayaran terverifikasi)` : ''}.</p>
          <p className="text-muted">Bila pendaftar mengundurkan diri, gunakan <b>Mundur</b> agar rekapnya tetap tersimpan.</p>
          <Field label={`Ketik nama lengkapnya untuk konfirmasi: ${user.name}`}><input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" /></Field>
          <button className="btn-danger w-full" disabled={typed.trim().toLowerCase() !== user.name.trim().toLowerCase()}>Hapus permanen</button>
        </form>
      )}
    </Modal>
  )
}

/** Rekap semua pendaftar: yang masih dalam tahapan, yang sudah registrasi ulang, yang mundur, dan yang tidak lulus. */
function TahapanPendaftar() {
  const s = useStore((x) => x)
  const me = s.users.find((u) => u.id === s.sessionUserId)!
  const act = useAct()
  const [f, setF] = useState<'all' | RekapStatus>('all')
  const [q, setQ] = useState('')
  const [view, setView] = useState<string | null>(null)
  const [progReg, setProgReg] = useState<Registration | null>(null)
  const [mundur, setMundur] = useState<Registration | null>(null)
  const [reason, setReason] = useState('')
  const [hapus, setHapus] = useState<string | null>(null)
  const [belumFu, setBelumFu] = useState(false) // hanya pendaftar mundur yang belum di-follow up
  const canManage = ['super_admin', 'admin_pendaftaran'].includes(me.role)
  const seeData = ['super_admin', 'admin_pendaftaran', 'akademik'].includes(me.role)
  const [angkatan, setAngkatan] = useAngkatan()
  const all = s.registrations.filter((r) => cocokAngkatan(angkatan, angkatanKe(s, r)))
  const count =(k: RekapStatus) => all.filter((r) => rekapStatus(r) === k).length
  const belumFuCount = all.filter((r) => rekapStatus(r) === 'mundur' && !r.followUpAt).length
  const rows = all
    .filter((r) => f === 'all' || rekapStatus(r) === f)
    .filter((r) => !belumFu || (rekapStatus(r) === 'mundur' && !r.followUpAt))
    .filter((r) => { const u = s.users.find((x) => x.id === r.userId); const t = q.trim().toLowerCase(); return !t || (u?.name ?? '').toLowerCase().includes(t) || (u?.nik ?? '').includes(t) || r.code.toLowerCase().includes(t) || (r.nip ?? '').includes(t) })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const waitingDecision = count('menunggu_hasil')
  const exportExcel = () => {
    const out: Cell[][] = rows.map((r, i) => {
      const u = s.users.find((x) => x.id === r.userId)
      return [i + 1, r.code, u?.name ?? '', u?.email ?? '', u?.phone ?? '', u?.nik ?? '', s.programs.find((p) => p.id === r.programId)?.title ?? '', REKAP.find((x) => x[0] === rekapStatus(r))![1], r.cancelledReason ?? '', rekapStatus(r) === 'mundur' ? (r.followUpAt ? `Sudah, ${r.followUpAt.slice(0, 10)}` : 'Belum') : '', s.batches.find((b) => b.id === r.batchId)?.code ?? '', r.nip ?? '', r.createdAt.slice(0, 10)]
    })
    const head = ['No', 'Kode', 'Nama', 'Email', 'No HP', 'NIK', 'Program', 'Status', 'Alasan mundur', 'Follow up WA', 'Angkatan', 'NIP', 'Tanggal daftar']
    const w = [5, 18, 28, 28, 16, 20, 26, 28, 30, 18, 14, 12, 14]
    downloadBlob(buildXlsx([{ name: 'Rekap pendaftar', cols: head.map((h, i) => ({ header: h, width: w[i] })), rows: out }]), `rekap-pendaftar-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }
  const chip = (k: 'all' | RekapStatus, label: string, n: number) => (
    <button key={k} type="button" aria-pressed={f === k} onClick={() => setF(k)} className={`flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition ${f === k ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-white hover:bg-brand-50'}`}>{label}<b className="tabular-nums">{n}</b></button>
  )
  return (
    <>
      <PageHeader title="Pendaftar" sub="Rekap semua pendaftar, termasuk yang sudah registrasi ulang, mundur, atau tidak lulus. Klik status untuk memfilter."
        action={<button className="btn-ghost" disabled={!rows.length} onClick={exportExcel}><IconFileSpreadsheet size={18} />Ekspor Excel</button>} />
      <div className="mb-4 flex flex-wrap gap-2" aria-label="Filter status">
        {chip('all', 'Semua', all.length)}
        {REKAP.map(([k, label]) => chip(k, label, count(k)))}
      </div>
      {count('mundur') > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900">
          <p className="min-w-0 flex-1"><b>{belumFuCount}</b> dari {count('mundur')} pendaftar mundur belum di-follow up lewat WhatsApp. Hubungi mereka agar tetap bisa melanjutkan proses.</p>
          <button type="button" aria-pressed={belumFu} className="btn-ghost !min-h-9" onClick={() => { setBelumFu(!belumFu); if (!belumFu) setF('mundur') }}>{belumFu ? 'Tampilkan semua' : 'Lihat yang belum'}</button>
        </div>
      )}
      <div className="mb-4 flex flex-wrap gap-3">
        <input className="input max-w-xs" placeholder="Cari nama, NIK, kode, atau NIP" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari pendaftar" />
        <AngkatanFilter values={s.registrations.map((r) => angkatanKe(s, r))} value={angkatan} onChange={setAngkatan} />
      </div>
      {waitingDecision > 0 && <p className="mb-4 rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-900"><b>{waitingDecision}</b> pendaftar sudah selesai ujian dan menunggu keputusan di menu Ujian online, tab Hasil dan keputusan.</p>}
      {rows.length === 0 ? <div className="card"><Empty title="Tidak ada pendaftar" body="Belum ada pendaftar, atau tidak ada yang cocok dengan filter ini." /></div> : (
        <Table head={['Kode', 'Pendaftar', 'Program', 'Status', 'Angkatan', 'Didaftarkan', '']}>
          {rows.map((r) => {
            const u = s.users.find((x) => x.id === r.userId)
            const st = rekapStatus(r)
            const live = !['mundur', 'kedaluwarsa', 'tidak_lulus'].includes(st)
            return (
              <tr key={r.id}>
                <td className="font-mono text-xs font-semibold">{r.code}</td>
                <td className="font-semibold">{u?.name}{r.nip && <span className="block font-mono text-xs font-normal text-muted">NIP {r.nip}</span>}</td>
                <td>{s.programs.find((p) => p.id === r.programId)?.title}</td>
                <td><RekapBadge st={st} />{st === 'mundur' && r.cancelledReason && <span className="mt-1 block max-w-48 text-xs text-muted">{r.cancelledReason}</span>}
                  {st === 'mundur' && (r.followUpAt
                    ? <span className="mt-1 inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-200">Sudah di-follow up WA · {dateID(r.followUpAt)}{s.users.find((x) => x.id === r.followUpBy)?.name ? ` · ${s.users.find((x) => x.id === r.followUpBy)!.name.split(' ')[0]}` : ''}</span>
                    : <span className="mt-1 inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">Belum di-follow up WA</span>)}</td>
                <td>{s.batches.find((b) => b.id === r.batchId)?.code ?? <span className="text-muted">-</span>}</td>
                <td>{dateID(r.createdAt)}</td>
                <td className="whitespace-nowrap text-right">
                  {canManage && r.stage === 'data' && live && <button className="btn-ghost !min-h-9" onClick={() => act(remindProfile(r.userId), 'Pengingat masuk antrean email.')}>Kirim pengingat</button>}{' '}
                  {canManage && live && !docsComplete(s, r.userId) && <button className="btn-ghost !min-h-9" onClick={() => setProgReg(r)}>Ubah program</button>}{' '}
                  {seeData && live && <WaButton compact phone={u?.phone} text={stageMessage(u?.name ?? '', r.stage)} />}{' '}
                  {seeData && st === 'mundur' && <WaButton compact phone={u?.phone} label="Follow up WA" text={withdrawnMessage(u?.name ?? '', !!r.autoWithdrawn)} />}{' '}
                  {canManage && r.canResume && <button className="btn-primary !min-h-9" onClick={async () => await ask(`Lanjutkan proses pendaftaran ${u?.name ?? ''}? Hitungan 2 minggu dimulai ulang dan pendaftar mendapat notifikasi.`) && act(resumeRegistrationAdmin(r.id), 'Proses pendaftaran dilanjutkan. Pendaftar mendapat notifikasi.')}><IconPlayerPlay size={16} />Lanjutkan proses</button>}{' '}
                  {canManage && st === 'mundur' && (r.followUpAt
                    ? <button className="btn-ghost !min-h-9" onClick={() => act(setFollowUp(r.id, false), 'Penanda follow up dibatalkan.')}>Batalkan tanda follow up</button>
                    : <button className="btn-primary !min-h-9" onClick={() => act(setFollowUp(r.id, true), 'Ditandai sudah di-follow up lewat WhatsApp.')}><IconCheck size={16} />Tandai sudah di-follow up</button>)}{' '}
                  {seeData && <button className="btn-ghost !min-h-9" onClick={() => setView(r.userId)}>Detail</button>}{' '}
                  {canManage && live && <button className="btn-ghost !min-h-9 text-red-700" onClick={() => { setMundur(r); setReason('') }}>Mundur</button>}{' '}
                  {canManage && <button className="btn-ghost !min-h-9 text-red-700" aria-label={`Hapus ${u?.name ?? ''}`} onClick={() => setHapus(r.userId)}><IconTrash size={16} /></button>}
                </td>
              </tr>
            )
          })}
        </Table>
      )}
      <DataModal userId={view} onClose={() => setView(null)} />
      <ProgramModal reg={progReg} onClose={() => setProgReg(null)} />
      <HapusPesertaModal userId={hapus} onClose={() => setHapus(null)} />
      <Modal open={!!mundur} title={`Tandai mundur: ${s.users.find((u) => u.id === mundur?.userId)?.name ?? ''}`} onClose={() => setMundur(null)}>
        {mundur && <form className="space-y-3 text-sm" onSubmit={(e) => { e.preventDefault(); act(cancelRegistration(mundur.id, reason), 'Pendaftar ditandai mundur. Datanya tetap ada di rekap.', () => setMundur(null)) }}>
          <p className="text-muted">Pendaftaran {mundur.code} dihentikan dan berstatus <b>Mundur</b>. Data dan riwayat pembayarannya tetap tersimpan di rekap{mundur.batchId ? ', dan kursinya di angkatan dilepas' : ''}.</p>
          <Field label="Alasan mundur (wajib, tercatat di rekap dan audit log)"><textarea className="input !py-2" rows={3} required maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <button className="btn-danger w-full">Tandai mundur</button>
        </form>}
      </Modal>
    </>
  )
}

/** Peserta: akun yang registrasi ulangnya sudah dikonfirmasi. */
export function PesertaList() {
  const s = useStore((x) => x)
  const act = useAct()
  const [q, setQ] = useState('')
  const [batch, setBatch] = useState('all')
  const [view, setView] = useState<string | null>(null)
  const [progReg, setProgReg] = useState<Registration | null>(null)
  const canAssign = ['super_admin', 'admin_pendaftaran'].includes(s.users.find((u) => u.id === s.sessionUserId)?.role ?? '')
  const [hapus, setHapus] = useState<string | null>(null)
  const people = s.users.filter((u) => u.role === 'peserta').map((user) => ({
    user,
    regs: s.registrations.filter((r) => r.userId === user.id && r.stage === 'aktif' && (r.status === 'active' || r.status === 'completed')),
    docs: s.documents.filter((d) => d.userId === user.id).length,
  })).filter((x) => x.regs.length > 0)
    .filter((x) => batch === 'all' || x.regs.some((r) => r.batchId === batch))
    .filter((x) => !q.trim() || x.user.name.toLowerCase().includes(q.toLowerCase()) || (x.user.nik ?? '').includes(q.trim()) || x.regs.some((r) => (r.nip ?? '').includes(q.trim())))
  return (
    <>
      <PageHeader title="Peserta didik" sub="Peserta didik yang registrasi ulangnya sudah dikonfirmasi atau ditambahkan langsung oleh Super Admin dan Akademik." action={<PesertaActions regs={people.flatMap((x) => x.regs)} />} />
      <div className="mb-4 flex flex-wrap gap-3">
        <input className="input max-w-xs" placeholder="Cari nama, NIP, atau NIK" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari peserta didik" />
        <select className="input !w-auto" value={batch} onChange={(e) => setBatch(e.target.value)} aria-label="Filter angkatan"><option value="all">Semua angkatan</option>{s.batches.map((b) => <option key={b.id} value={b.id}>{b.code}</option>)}</select>
      </div>
      {people.length === 0 ? <div className="card"><Empty title="Belum ada peserta didik" body="Peserta didik muncul di sini setelah registrasi ulangnya dikonfirmasi, atau setelah ditambahkan lewat tombol Tambah peserta didik atau Impor Excel. Calon yang masih dalam tahapan ada di menu Pendaftar." /></div> : (
        <Table head={['Nama', 'NIP', 'NIK', 'Program', 'Angkatan', 'Berkas', 'Status', '']}>
          {people.map(({ user, regs, docs }) => (
            <tr key={user.id}>
              <td className="font-semibold">{user.name}</td>
              <td className="font-mono text-xs font-semibold">{regs[0]?.nip ?? (canAssign && regs[0] ? <button className="btn-ghost !min-h-9" onClick={() => act(issueNip(regs[0].id), 'NIP diterbitkan.')}>Terbitkan NIP</button> : '-')}</td>
              <td className="font-mono text-xs">{user.nik || '-'}</td>
              <td>{regs.map((r) => s.programs.find((p) => p.id === r.programId)?.title).join(', ')}</td>
              <td><div className="flex flex-wrap gap-1">{regs.map((r) => <BatchPicker key={r.id} r={r} canAssign={canAssign} />)}</div></td>
              <td className="tabular-nums">{docs}/{DOC_KINDS.length}</td>
              <td>{regs[0] && <Badge status={regs[0].status} />}</td>
              <td className="whitespace-nowrap text-right">
                {canAssign && regs[0] && (docsComplete(s, user.id) ? <span className="mr-2 text-xs text-muted">Program terkunci</span> : <button className="btn-ghost !min-h-9" onClick={() => setProgReg(regs[0])}>Ubah program</button>)}{' '}
                <WaButton compact phone={user.phone} text={stageMessage(user.name, 'aktif') + (regs[0]?.nip ? `\n(NIP ${regs[0].nip})` : '')} />{' '}
                <button className="btn-ghost !min-h-9" onClick={() => setView(user.id)}>Detail</button>{canAssign && <> <button className="btn-ghost !min-h-9 text-red-700" aria-label={`Hapus ${user.name}`} onClick={() => setHapus(user.id)}><IconTrash size={16} /></button></>}
              </td>
            </tr>
          ))}
        </Table>
      )}
      <DataModal userId={view} onClose={() => setView(null)} />
      <ProgramModal reg={progReg} onClose={() => setProgReg(null)} />
      <HapusPesertaModal userId={hapus} onClose={() => setHapus(null)} />
    </>
  )
}

/** Peserta didik: calon yang sudah dinyatakan diterima. Bukti penerimaan adalah pembayaran registrasi ulang yang sudah diverifikasi keuangan. */
function DaftarPesertaDidik({ bare = false }: { bare?: boolean }) {
  const s = useStore((x) => x)
  const [q, setQ] = useState('')
  const [batch, setBatch] = useState('all')
  const toast = useToast()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const accepted = s.registrations
    .filter((r) => r.stage === 'aktif' && (r.status === 'active' || r.status === 'completed'))
  const [angkatan, setAngkatan] = useAngkatan()
  const rows = accepted
    .filter((r) => cocokAngkatan(angkatan, angkatanKe(s, r)))
    .map((r) => ({
      r,
      user: s.users.find((u) => u.id === r.userId),
      proof: s.payments.filter((p) => p.registrationId === r.id && p.kind === 'registrasi_ulang' && p.status === 'verified').sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0],
    }))
    .filter((x) => x.proof) // tanpa pembayaran registrasi ulang yang terverifikasi, tidak dihitung diterima
    .filter((x) => batch === 'all' || x.r.batchId === batch)
    .filter((x) => !q.trim() || (x.user?.name ?? '').toLowerCase().includes(q.trim().toLowerCase()) || (x.r.nip ?? '').includes(q.trim()) || x.r.code.toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <>
      {bare && (
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <label className="block"><span className="label">Dibayar dari tanggal</span><input className="input" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="block"><span className="label">Sampai tanggal</span><input className="input" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></label>
          <button className="btn-primary" disabled={rows.length === 0} onClick={() => {
            const out = exportBuktiPenerimaanXlsx(s, rows.map((x) => x.r), from, to, `bukti-penerimaan-${from || 'awal'}-sd-${to || new Date().toISOString().slice(0, 10)}.xlsx`)
            if (out.pembayaran === 0) toast('Tidak ada pembayaran terverifikasi pada rentang tanggal itu. File Excel kosong tetap diunduh.', 'err')
            else toast(`Excel diunduh: ${out.pembayaran} pembayaran, total ${rupiah(out.total)}.`, 'ok')
          }}><IconFileSpreadsheet size={18} />Ekspor Excel bukti penerimaan</button>
          <p className="basis-full text-xs text-muted">Berisi semua pembayaran terverifikasi (pendaftaran, registrasi ulang, cicilan) pada rentang tanggal bayar, untuk peserta yang tampil di bawah menurut pencarian dan filter angkatan. Kosongkan tanggal untuk tanpa batas.</p>
        </div>
      )}
      {!bare && <PageHeader title="Pembayaran peserta didik" sub="Calon yang sudah dinyatakan diterima, dibuktikan dengan pembayaran registrasi ulang yang terverifikasi." />}
      <div className="mb-4 flex flex-wrap gap-3">
        <input className="input max-w-xs" placeholder="Cari nama, NIP, atau kode" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari peserta didik" />
        <AngkatanFilter values={accepted.map((r) => angkatanKe(s, r))} value={angkatan} onChange={(v) => { setAngkatan(v); setBatch('all') }} />
        <select className="input !w-auto" value={batch} onChange={(e) => setBatch(e.target.value)} aria-label="Filter kode angkatan"><option value="all">Semua kode angkatan</option>{s.batches.filter((b) => cocokAngkatan(angkatan, b.angkatan ?? null)).map((b) => <option key={b.id} value={b.id}>{b.code}</option>)}</select>
      </div>
      {rows.length === 0 ? <div className="card"><Empty title="Belum ada peserta didik" body="Peserta didik muncul di sini setelah pembayaran registrasi ulangnya diverifikasi. Calon yang masih dalam tahapan ada di menu Pendaftar." /></div> : (
        <Table head={['Nama', 'NIP', 'Program', 'Angkatan', 'Status', 'Bukti registrasi ulang', '']}>
          {rows.map(({ r, user, proof }) => (
            <tr key={r.id}>
              <td className="font-semibold">{user?.name}</td>
              <td className="font-mono text-xs font-semibold">{r.nip ?? '-'}</td>
              <td>{s.programs.find((p) => p.id === r.programId)?.title}</td>
              <td>{s.batches.find((b) => b.id === r.batchId)?.code ?? <span className="text-muted">Belum ditetapkan</span>}</td>
              <td><span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">Diterima</span></td>
              <td className="text-xs">
                <p className="font-mono font-semibold">{proof!.receiptNo ?? '-'}</p>
                <p className="text-muted">{rupiah(proof!.amountPaid)} · {dateID(proof!.transferDate)}</p>
                {proof!.proofFileId && <a className="font-semibold text-brand-600 underline" href={`/api/files/${proof!.proofFileId}`} target="_blank" rel="noreferrer">Lihat bukti transfer</a>}
              </td>
              <td className="text-right"><Link to={`/admin/pendaftar/${r.id}`} className="btn-ghost !min-h-9">Rincian bayar</Link></td>
            </tr>
          ))}
        </Table>
      )}
    </>
  )
}

/** Peserta didik. Admin keuangan juga mendapat tab rekap pembayaran per peserta didik. */
export function PesertaDidik() {
  const role = useStore((x) => x.users.find((u) => u.id === x.sessionUserId)?.role)
  const [tab, setTab] = useState<'daftar' | 'bayar'>('bayar')
  if (role !== 'admin_keuangan') return <DaftarPesertaDidik />
  return (
    <>
      <PageHeader title="Pembayaran peserta didik" sub="Rekap pembayaran tiap peserta didik: yang sudah dibayar, yang belum, dan pengumuman tagihan ke akun peserta." />
      <div role="tablist" aria-label="Tampilan peserta didik" className="mb-5 flex gap-1 border-b border-line">
        {([['bayar', 'Rekap pembayaran'], ['daftar', 'Bukti penerimaan']] as const).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`-mb-px min-h-11 shrink-0 border-b-2 px-4 text-sm font-semibold ${tab === k ? 'border-brand-600 text-brand-700' : 'border-transparent text-muted hover:text-ink'}`}>{label}</button>
        ))}
      </div>
      {tab === 'bayar' ? <Tagihan onlyActive /> : <DaftarPesertaDidik bare />}
    </>
  )
}
