import { useState, type ReactNode } from 'react'
import { Badge, Empty, Modal, PageHeader, dateID, rupiah, useAct } from '../../components/ui'
import { remindProfile, useStore } from '../../lib/store'

function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead><tr className="border-b border-line bg-canvas text-xs uppercase tracking-wide text-muted">{head.map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr></thead>
        <tbody className="[&>tr]:border-b [&>tr]:border-line [&>tr:last-child]:border-0 [&>tr]:transition-colors [&>tr:hover]:bg-brand-50/50 [&_td]:px-4 [&_td]:py-3">{children}</tbody>
      </table>
    </div>
  )
}

/** Pendaftar: pendaftaran milik akun yang belum melengkapi data diri (belum bayar, menunggu verifikasi, atau sudah aktif tapi belum mengisi). */
export function Pendaftar() {
  const s = useStore((x) => x)
  const me = s.users.find((u) => u.id === s.sessionUserId)!
  const act = useAct()
  const [f, setF] = useState('all')
  const canRemind = ['super_admin', 'admin_pendaftaran'].includes(me.role)
  const pending = s.registrations.filter((r) => !s.users.find((u) => u.id === r.userId)?.profileDone)
  const rows = pending.filter((r) => f === 'all' || r.status === f).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const waiting = pending.filter((r) => r.status === 'active').length
  const dataState = (status: string) => status === 'active' || status === 'completed' ? { label: 'Menunggu diisi', cls: 'text-amber-800' } : status === 'cancelled' || status === 'expired' ? { label: '-', cls: 'text-muted' } : { label: 'Menunggu pembayaran', cls: 'text-muted' }
  return (
    <>
      <PageHeader title="Pendaftar" sub="Calon peserta yang belum melengkapi data diri. Setelah mengisi, mereka pindah ke menu Peserta."
        action={<select className="input !w-auto" value={f} onChange={(e) => setF(e.target.value)} aria-label="Filter status"><option value="all">Semua status</option>{['pending_payment', 'waiting_verification', 'active', 'expired', 'cancelled'].map((x) => <option key={x}>{x}</option>)}</select>} />
      {waiting > 0 && <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900"><b>{waiting}</b> pendaftar sudah membayar tetapi belum mengisi data diri, sehingga kelasnya belum terbuka.</p>}
      {rows.length === 0 ? <div className="card"><Empty title="Tidak ada pendaftar" body="Semua pendaftar dengan status ini sudah melengkapi data diri, atau belum ada yang mendaftar." /></div> : (
        <Table head={['Kode', 'Pendaftar', 'Angkatan', 'Tagihan', 'Status', 'Data diri', 'Dibuat', '']}>
          {rows.map((r) => {
            const u = s.users.find((x) => x.id === r.userId)
            const d = dataState(r.status)
            return (
              <tr key={r.id}>
                <td className="font-mono text-xs font-semibold">{r.code}</td><td>{u?.name}</td><td>{s.batches.find((b) => b.id === r.batchId)?.code}</td>
                <td>{rupiah(r.priceSnapshot + r.uniqueCode)}</td><td><Badge status={r.status} /></td><td className={`font-medium ${d.cls}`}>{d.label}</td><td>{dateID(r.createdAt)}</td>
                <td className="text-right">{canRemind && r.status === 'active' && <button className="btn-ghost !min-h-9" onClick={() => act(remindProfile(r.userId), 'Pengingat masuk antrean email.')}>Kirim pengingat</button>}</td>
              </tr>
            )
          })}
        </Table>
      )}
    </>
  )
}

const L = (v?: string) => (v === 'L' ? 'Laki-laki' : v === 'P' ? 'Perempuan' : '-')

/** Peserta: akun yang sudah melengkapi data diri. */
export function PesertaList() {
  const s = useStore((x) => x)
  const [q, setQ] = useState('')
  const [batch, setBatch] = useState('all')
  const [view, setView] = useState<string | null>(null)
  const people = s.profiles.filter((p) => p.completed).map((p) => {
    const user = s.users.find((u) => u.id === p.userId)
    const regs = s.registrations.filter((r) => r.userId === p.userId && (r.status === 'active' || r.status === 'completed'))
    return { p, user, regs }
  }).filter((x) => x.user)
    .filter((x) => batch === 'all' || x.regs.some((r) => r.batchId === batch))
    .filter((x) => !q.trim() || x.user!.name.toLowerCase().includes(q.toLowerCase()) || x.p.nik.includes(q.trim()))
  const sel = people.find((x) => x.p.userId === view)
  return (
    <>
      <PageHeader title="Peserta" sub="Peserta yang pembayarannya sudah dikonfirmasi dan data dirinya lengkap." />
      <div className="mb-4 flex flex-wrap gap-3">
        <input className="input max-w-xs" placeholder="Cari nama atau NIK" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari peserta" />
        <select className="input !w-auto" value={batch} onChange={(e) => setBatch(e.target.value)} aria-label="Filter angkatan"><option value="all">Semua angkatan</option>{s.batches.map((b) => <option key={b.id} value={b.id}>{b.code}</option>)}</select>
      </div>
      {people.length === 0 ? <div className="card"><Empty title="Belum ada peserta" body="Peserta muncul di sini setelah membayar dan melengkapi data diri." /></div> : (
        <Table head={['Nama', 'NIK', 'Kota', 'Telepon', 'Angkatan', 'Status', '']}>
          {people.map(({ p, user, regs }) => (
            <tr key={p.userId}>
              <td className="font-semibold">{user!.name}</td><td className="font-mono text-xs">{p.nik}</td><td>{p.city}</td><td>{user!.phone}</td>
              <td>{regs.map((r) => s.batches.find((b) => b.id === r.batchId)?.code).join(', ')}</td>
              <td>{regs[0] && <Badge status={regs[0].status} />}</td>
              <td className="text-right"><button className="btn-ghost !min-h-9" onClick={() => setView(p.userId)}>Detail</button></td>
            </tr>
          ))}
        </Table>
      )}
      <Modal open={!!sel} title={sel?.user?.name ?? ''} onClose={() => setView(null)}>
        {sel && (
          <div className="space-y-4 text-sm">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              {([
                ['NIK', sel.p.nik], ['Jenis kelamin', L(sel.p.gender)], ['Tempat, tanggal lahir', `${sel.p.birthPlace}, ${dateID(sel.p.birthDate)}`], ['Telepon', sel.user!.phone],
                ['Email', sel.user!.email], ['Pendidikan', sel.p.education], ['Pekerjaan', sel.p.occupation], ['Kecamatan', sel.p.district], ['Kota atau kabupaten', sel.p.city], ['Provinsi', sel.p.province], ['Kode pos', sel.p.postalCode],
              ] as const).map(([k, v]) => <div key={k}><dt className="text-xs text-muted">{k}</dt><dd className="font-semibold">{v || '-'}</dd></div>)}
              <div className="col-span-2"><dt className="text-xs text-muted">Alamat</dt><dd className="font-semibold">{sel.p.address}, RT {sel.p.rt}/RW {sel.p.rw}</dd></div>
              <div className="col-span-2"><dt className="text-xs text-muted">Kontak darurat</dt><dd className="font-semibold">{sel.p.emergencyName} ({sel.p.emergencyRelation}) · {sel.p.emergencyPhone}</dd></div>
            </dl>
            <div className="flex gap-2 border-t border-line pt-3">
              {sel.p.photoFileId ? <a className="btn-ghost" href={`/api/files/${sel.p.photoFileId}`} target="_blank" rel="noreferrer">Lihat pas foto</a> : <span className="text-muted">Pas foto belum ada</span>}
              {sel.p.ktpFileId ? <a className="btn-ghost" href={`/api/files/${sel.p.ktpFileId}`} target="_blank" rel="noreferrer">Lihat scan KTP</a> : <span className="text-muted">Scan KTP belum ada</span>}
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
