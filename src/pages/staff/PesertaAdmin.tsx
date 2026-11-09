import { IconArrowLeft } from '@tabler/icons-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Badge, Empty, Modal, PageHeader, Table, dateID, useAct } from '../../components/ui'
import { DOC_KINDS, DOC_LABEL, assignBatch, issueNip, remindProfile, removeDocument, saveProfileAsAdmin, useStore } from '../../lib/store'
import type { Registration, Stage } from '../../lib/types'
import { ProfileForm } from '../peserta/DataDiri'
import { Tagihan } from './Tagihan'

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
                        {canEdit && <button className="text-sm font-semibold text-red-700 underline" onClick={() => confirm(`Hapus ${DOC_LABEL[k]}? Peserta akan diminta mengunggah ulang.`) && act(removeDocument(userId!, k), 'Berkas dihapus. Peserta diminta mengunggah ulang.')}>Hapus</button>}
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
      <ProfileForm key={user.id} user={user} profile={profile} lockIdentity={false} submitLabel="Simpan perubahan"
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

const STAGE_FILTER: [Stage, string][] = [
  ['data', 'Isi data diri'], ['bayar_daftar', 'Bayar pendaftaran'], ['ujian', 'Ujian tulis'], ['menunggu_hasil', 'Menunggu hasil'], ['registrasi_ulang', 'Registrasi ulang'], ['tidak_lulus', 'Tidak lulus'],
]

/**
 * Pendaftar. Keuangan melihat pembayaran per peserta. Admin pendaftaran dan Super Admin punya dua tab:
 * tahapan penerimaan dan pembayaran.
 */
export function Pendaftar() {
  const role = useStore((x) => x.users.find((u) => u.id === x.sessionUserId)?.role)
  const [tab, setTab] = useState<'tahapan' | 'bayar'>('tahapan')
  if (role === 'admin_keuangan') {
    return <><PageHeader title="Pendaftar" sub="Pembayaran tiap peserta: yang sudah dibayar, yang belum, dan pengumuman tagihan ke akun peserta." /><Tagihan /></>
  }
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

/** Semua calon yang masih dalam tahapan penerimaan. Setelah registrasi ulang dikonfirmasi mereka pindah ke menu Peserta. */
function TahapanPendaftar() {
  const s = useStore((x) => x)
  const me = s.users.find((u) => u.id === s.sessionUserId)!
  const act = useAct()
  const [f, setF] = useState<'all' | Stage>('all')
  const [q, setQ] = useState('')
  const [view, setView] = useState<string | null>(null)
  const canRemind = ['super_admin', 'admin_pendaftaran'].includes(me.role)
  const seeData = ['super_admin', 'admin_pendaftaran', 'akademik'].includes(me.role)
  const all = s.registrations.filter((r) => r.stage !== 'aktif')
  const rows = all
    .filter((r) => f === 'all' || r.stage === f)
    .filter((r) => { const u = s.users.find((x) => x.id === r.userId); return !q.trim() || (u?.name ?? '').toLowerCase().includes(q.toLowerCase()) || (u?.nik ?? '').includes(q.trim()) })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const waitingDecision = all.filter((r) => r.stage === 'menunggu_hasil').length
  return (
    <>
      <PageHeader title="Pendaftar" sub="Calon peserta yang masih dalam tahapan penerimaan. Setelah registrasi ulang dikonfirmasi, mereka pindah ke menu Peserta." />
      <div className="mb-4 flex flex-wrap gap-3">
        <input className="input max-w-xs" placeholder="Cari nama atau NIK" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari pendaftar" />
        <select className="input !w-auto" value={f} onChange={(e) => setF(e.target.value as 'all' | Stage)} aria-label="Filter tahap">
          <option value="all">Semua tahap ({all.length})</option>
          {STAGE_FILTER.map(([k, label]) => <option key={k} value={k}>{label} ({all.filter((r) => r.stage === k).length})</option>)}
        </select>
      </div>
      {waitingDecision > 0 && <p className="mb-4 rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-900"><b>{waitingDecision}</b> pendaftar sudah selesai ujian dan menunggu keputusan di menu Ujian tulis, tab Hasil dan keputusan.</p>}
      {rows.length === 0 ? <div className="card"><Empty title="Tidak ada pendaftar" body="Belum ada yang melakukan registrasi, atau semuanya sudah menjadi peserta." /></div> : (
        <Table head={['Kode', 'Pendaftar', 'Program', 'Tahap', 'Angkatan', 'Dibuat', '']}>
          {rows.map((r) => {
            const u = s.users.find((x) => x.id === r.userId)
            const dead = r.status === 'cancelled' || r.status === 'expired'
            return (
              <tr key={r.id}>
                <td className="font-mono text-xs font-semibold">{r.code}</td>
                <td className="font-semibold">{u?.name}</td>
                <td>{s.programs.find((p) => p.id === r.programId)?.title}</td>
                <td><Badge status={dead && r.stage !== 'tidak_lulus' ? r.status : r.stage} /></td>
                <td>{s.batches.find((b) => b.id === r.batchId)?.code ?? <span className="text-muted">Belum ditetapkan</span>}</td>
                <td>{dateID(r.createdAt)}</td>
                <td className="whitespace-nowrap text-right">
                  {canRemind && r.stage === 'data' && !dead && <button className="btn-ghost !min-h-9" onClick={() => act(remindProfile(r.userId), 'Pengingat masuk antrean email.')}>Kirim pengingat</button>}{' '}
                  {seeData && <button className="btn-ghost !min-h-9" onClick={() => setView(r.userId)}>Detail</button>}
                </td>
              </tr>
            )
          })}
        </Table>
      )}
      <DataModal userId={view} onClose={() => setView(null)} />
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
  const canAssign = ['super_admin', 'admin_pendaftaran'].includes(s.users.find((u) => u.id === s.sessionUserId)?.role ?? '')
  const people = s.users.filter((u) => u.role === 'peserta').map((user) => ({
    user,
    regs: s.registrations.filter((r) => r.userId === user.id && r.stage === 'aktif' && (r.status === 'active' || r.status === 'completed')),
    docs: s.documents.filter((d) => d.userId === user.id).length,
  })).filter((x) => x.regs.length > 0)
    .filter((x) => batch === 'all' || x.regs.some((r) => r.batchId === batch))
    .filter((x) => !q.trim() || x.user.name.toLowerCase().includes(q.toLowerCase()) || (x.user.nik ?? '').includes(q.trim()) || x.regs.some((r) => (r.nip ?? '').includes(q.trim())))
  return (
    <>
      <PageHeader title="Peserta" sub="Peserta yang registrasi ulangnya sudah dikonfirmasi." />
      <div className="mb-4 flex flex-wrap gap-3">
        <input className="input max-w-xs" placeholder="Cari nama, NIP, atau NIK" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari peserta" />
        <select className="input !w-auto" value={batch} onChange={(e) => setBatch(e.target.value)} aria-label="Filter angkatan"><option value="all">Semua angkatan</option>{s.batches.map((b) => <option key={b.id} value={b.id}>{b.code}</option>)}</select>
      </div>
      {people.length === 0 ? <div className="card"><Empty title="Belum ada peserta" body="Peserta muncul di sini setelah registrasi ulangnya dikonfirmasi. Calon yang masih dalam tahapan ada di menu Pendaftar." /></div> : (
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
              <td className="text-right"><button className="btn-ghost !min-h-9" onClick={() => setView(user.id)}>Detail</button></td>
            </tr>
          ))}
        </Table>
      )}
      <DataModal userId={view} onClose={() => setView(null)} />
    </>
  )
}
