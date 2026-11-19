import { IconFileWord, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react'
import { useState } from 'react'
import { ask, Empty, Field, Modal, PageHeader, Table, dateID, useAct } from '../../components/ui'
import { approveLogbooks, deleteCompany, reviewLogbook, saveCompany, savePlacement, setPlacementScore, setPlacementStatus, useStore } from '../../lib/store'
import type { Company, Placement } from '../../lib/types'
import { WaButton } from '../../lib/wa'

type Tab = 'penempatan' | 'perusahaan' | 'logbook'
const TABS: [Tab, string][] = [['penempatan', 'Penempatan'], ['perusahaan', 'Perusahaan'], ['logbook', 'Logbook magang']]

export const PLACE_STATUS: Record<string, { label: string; cls: string }> = {
  berjalan: { label: 'Berjalan', cls: 'bg-sky-50 text-sky-800 ring-sky-200' },
  selesai: { label: 'Selesai', cls: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  batal: { label: 'Batal', cls: 'bg-red-50 text-red-800 ring-red-200' },
  diajukan: { label: 'Menunggu', cls: 'bg-amber-50 text-amber-800 ring-amber-200' },
  disetujui: { label: 'Disetujui', cls: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  revisi: { label: 'Perlu revisi', cls: 'bg-red-50 text-red-800 ring-red-200' },
}
export function Chip({ status }: { status: string }) {
  const c = PLACE_STATUS[status] ?? { label: status, cls: 'bg-canvas text-ink ring-line' }
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${c.cls}`}>{c.label}</span>
}
export const KIND_LABEL: Record<string, string> = { magang: 'Magang', kerja: 'Kerja' }

export function Penempatan() {
  const [tab, setTab] = useState<Tab>('penempatan')
  const s = useStore((x) => x)
  const pending = s.logbook.filter((e) => e.status === 'diajukan').length
  return (
    <>
      <PageHeader title="Penempatan magang dan kerja" sub="Tempatkan peserta didik di perusahaan mitra, kelola daftar perusahaan, dan tinjau logbook harian magang." />
      <div role="tablist" aria-label="Bagian penempatan" className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`-mb-px min-h-11 shrink-0 border-b-2 px-4 text-sm font-semibold ${tab === k ? 'border-brand-600 text-brand-700' : 'border-transparent text-muted hover:text-ink'}`}>
            {label}{k === 'logbook' && pending > 0 ? ` (${pending})` : ''}
          </button>
        ))}
      </div>
      {tab === 'penempatan' && <DaftarPenempatan />}
      {tab === 'perusahaan' && <DaftarPerusahaan />}
      {tab === 'logbook' && <TinjauLogbook />}
    </>
  )
}

/* ---------- penempatan ---------- */
const blankPlace = { id: '', registrationId: '', companyId: '', kind: 'magang', position: '', startDate: '', endDate: '', notes: '' }

function DaftarPenempatan() {
  const s = useStore((x) => x)
  const act = useAct()
  const [form, setForm] = useState<typeof blankPlace | null>(null)
  const [nilai, setNilai] = useState<{ id: string; name: string; score: string } | null>(null)
  const nameOf = (regId: string) => s.users.find((u) => u.id === s.registrations.find((r) => r.id === regId)?.userId)
  const nipOf = (regId: string) => s.registrations.find((r) => r.id === regId)?.nip ?? '-'
  const busy = new Set(s.placements.filter((p) => p.status === 'berjalan').map((p) => p.registrationId))
  const activeRegs = s.registrations.filter((r) => r.stage === 'aktif' && (r.status === 'active' || r.status === 'completed') && !busy.has(r.id))
  // Penempatan magang diatur setelah peserta melunasi seluruh pembayaran.
  // Peserta yang belum lunas tetap muncul di pilihan, ditandai "belum lunas", dan tidak bisa disimpan.
  const unpaid = activeRegs.filter((r) => !r.paidOff).length
  const pilihan = [...activeRegs].sort((a, b) => Number(!!b.paidOff) - Number(!!a.paidOff) || (nameOf(a.id)?.name ?? '').localeCompare(nameOf(b.id)?.name ?? ''))
  const picked = form && !form.id ? s.registrations.find((r) => r.id === form.registrationId) : undefined
  const belumLunas = !!picked && !picked.paidOff
  const set = (k: keyof typeof blankPlace) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm({ ...form!, [k]: e.target.value })
  const rows = [...s.placements].sort((a, b) => b.startDate.localeCompare(a.startDate))
  return (
    <>
      <div className="mb-4"><button className="btn-primary" onClick={() => setForm({ ...blankPlace, startDate: new Date().toISOString().slice(0, 10) })}><IconPlus size={18} />Tempatkan peserta</button></div>
      {rows.length === 0 ? <div className="card"><Empty title="Belum ada penempatan" body="Tambahkan perusahaan di tab Perusahaan, lalu tempatkan peserta didik yang registrasi ulangnya sudah dikonfirmasi." /></div> : (
        <Table head={['Peserta didik', 'NIP', 'Perusahaan', 'Jenis', 'Periode', 'Status', 'Nilai magang', '']}>
          {rows.map((p) => {
            const u = nameOf(p.registrationId)
            const co = s.companies.find((c) => c.id === p.companyId)
            return (
              <tr key={p.id}>
                <td className="font-semibold">{u?.name}</td>
                <td className="font-mono text-xs">{nipOf(p.registrationId)}</td>
                <td>{co?.name}{p.position && <span className="block text-xs text-muted">{p.position}</span>}</td>
                <td>{KIND_LABEL[p.kind]}</td>
                <td className="text-sm">{dateID(p.startDate)}{p.endDate ? ` s.d. ${dateID(p.endDate)}` : ''}</td>
                <td><Chip status={p.status} /></td>
                <td className="tabular-nums">{p.kind !== 'magang' ? '-' : p.score != null ? <b>{p.score}</b> : p.status === 'selesai' ? <span className="text-xs text-amber-800">Belum dinilai</span> : '-'}</td>
                <td className="whitespace-nowrap text-right">
                  {p.kind === 'magang' && p.status === 'selesai' && <><button className="btn-ghost !min-h-9" onClick={() => setNilai({ id: p.id, name: u?.name ?? '', score: p.score == null ? '' : String(p.score) })}>Nilai magang</button>{' '}</>}
                  {p.kind === 'magang' && <><a className="btn-ghost !min-h-9" href={`/api/transkrip-akhir/${p.registrationId}.docx`} download title="Transkrip akhir pelatihan (Word)" aria-label="Unduh transkrip akhir"><IconFileWord size={16} /></a>{' '}</>}
                  <WaButton compact phone={u?.phone} text={`Halo ${(u?.name ?? '').split(' ')[0]}, terkait penempatan ${KIND_LABEL[p.kind].toLowerCase()} Anda di ${co?.name ?? 'perusahaan mitra'}.\n\nSalam,\nAdmin Cimahi Hotel Institute`} />{' '}
                  <button className="btn-ghost !min-h-9" aria-label="Ubah penempatan" onClick={() => setForm({ id: p.id, registrationId: p.registrationId, companyId: p.companyId, kind: p.kind, position: p.position, startDate: p.startDate, endDate: p.endDate, notes: p.notes })}><IconPencil size={16} /></button>{' '}
                  {p.status === 'berjalan'
                    ? <>
                      <button className="btn-ghost !min-h-9" onClick={async () => await ask('Tandai penempatan ini selesai?') && act(setPlacementStatus(p.id, 'selesai'), 'Penempatan selesai.')}>Selesai</button>{' '}
                      <button className="btn-ghost !min-h-9 text-red-700" onClick={async () => await ask('Batalkan penempatan ini?') && act(setPlacementStatus(p.id, 'batal'), 'Penempatan dibatalkan.')}>Batal</button>
                    </>
                    : <button className="btn-ghost !min-h-9" onClick={() => act(setPlacementStatus(p.id, 'berjalan'), 'Penempatan dijalankan kembali.')}>Jalankan lagi</button>}
                </td>
              </tr>
            )
          })}
        </Table>
      )}
      <Modal open={!!nilai} title="Nilai magang" onClose={() => setNilai(null)}>
        {nilai && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); act(setPlacementScore(nilai.id, nilai.score === '' ? null : Number(nilai.score)), 'Nilai magang disimpan.', () => setNilai(null)) }}>
            <p className="text-sm">Peserta didik: <b>{nilai.name}</b></p>
            <Field label="Nilai magang (0 sampai 100)" hint="Nilai ini masuk ke transkrip akhir pelatihan dan ikut menghitung nilai rata-rata. Kosongkan untuk menghapus."><input className="input" type="number" min={0} max={100} step={0.1} value={nilai.score} onChange={(e) => setNilai({ ...nilai, score: e.target.value })} autoFocus /></Field>
            <button className="btn-primary w-full">Simpan</button>
          </form>
        )}
      </Modal>
      <Modal open={!!form} title={form?.id ? 'Ubah penempatan' : 'Tempatkan peserta'} onClose={() => setForm(null)}>
        {form && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); act(savePlacement({ ...form, id: form.id || undefined, registrationId: form.registrationId || undefined }), 'Penempatan disimpan.', () => setForm(null)) }}>
            {form.id
              ? <p className="text-sm"><b>{nameOf(form.registrationId)?.name}</b> ({nipOf(form.registrationId)})</p>
              : <Field label="Peserta didik" hint={`Peserta yang belum punya penempatan berjalan.${unpaid > 0 ? ` ${unpaid} peserta bertanda "belum lunas" tampil tetapi belum bisa disimpan.` : ''}`}><select className="input" required value={form.registrationId} onChange={set('registrationId')}><option value="">Pilih peserta</option>{pilihan.map((r) => <option key={r.id} value={r.id}>{r.paidOff ? '' : '[BELUM LUNAS] '}{nameOf(r.id)?.name} {r.nip ? `(${r.nip})` : ''}</option>)}</select></Field>}
            <Field label="Perusahaan"><select className="input" required value={form.companyId} onChange={set('companyId')}><option value="">Pilih perusahaan</option>{s.companies.filter((c) => c.active || c.id === form.companyId).map((c) => <option key={c.id} value={c.id}>{c.name}{c.city ? `, ${c.city}` : ''}</option>)}</select></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Jenis"><select className="input" value={form.kind} onChange={set('kind')}><option value="magang">Magang (dengan logbook)</option><option value="kerja">Kerja</option></select></Field>
              <Field label="Posisi atau divisi"><input className="input" maxLength={120} value={form.position} onChange={set('position')} placeholder="Contoh: Front Office" /></Field>
              <Field label="Mulai"><input className="input" type="date" required value={form.startDate} onChange={set('startDate')} /></Field>
              <Field label="Selesai" hint="Boleh dikosongkan."><input className="input" type="date" min={form.startDate} value={form.endDate} onChange={set('endDate')} /></Field>
            </div>
            <Field label="Catatan"><textarea className="input !py-2" rows={2} maxLength={500} value={form.notes} onChange={set('notes')} /></Field>
            {belumLunas && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-800"><span className="mr-2 rounded-full bg-red-600 px-2 py-0.5 text-xs text-white">Belum lunas</span>Peserta ini belum melunasi seluruh pembayaran, jadi penempatan belum bisa disimpan.</p>}
            <button className="btn-primary w-full" disabled={belumLunas}>Simpan</button>
          </form>
        )}
      </Modal>
    </>
  )
}

/* ---------- perusahaan ---------- */
const blankCo: Company = { id: '', name: '', category: 'Hotel', address: '', city: '', country: 'Indonesia', contactName: '', contactPhone: '', contactEmail: '', notes: '', active: true }

function DaftarPerusahaan() {
  const s = useStore((x) => x)
  const act = useAct()
  const [form, setForm] = useState<Company | null>(null)
  const [q, setQ] = useState('')
  const set = (k: keyof Company) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form!, [k]: e.target.value })
  const rows = s.companies.filter((c) => !q.trim() || `${c.name} ${c.city} ${c.category}`.toLowerCase().includes(q.trim().toLowerCase()))
  const used = (id: string) => s.placements.filter((p) => p.companyId === id && p.status === 'berjalan').length
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button className="btn-primary" onClick={() => setForm({ ...blankCo })}><IconPlus size={18} />Perusahaan baru</button>
        <input className="input max-w-xs" placeholder="Cari nama, kota, atau kategori" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari perusahaan" />
      </div>
      {rows.length === 0 ? <div className="card"><Empty title="Belum ada perusahaan" body="Tambahkan hotel atau perusahaan mitra tempat peserta didik magang atau bekerja." /></div> : (
        <Table head={['Perusahaan', 'Kategori', 'Kota', 'Kontak', 'Peserta aktif', 'Status', '']}>
          {rows.map((c) => (
            <tr key={c.id}>
              <td className="font-semibold">{c.name}{c.address && <span className="block text-xs font-normal text-muted">{c.address}</span>}</td>
              <td>{c.category}</td>
              <td>{c.city || '-'}</td>
              <td className="text-sm">{c.contactName || '-'}{c.contactPhone && <span className="block text-xs text-muted">{c.contactPhone}</span>}</td>
              <td className="tabular-nums">{used(c.id)}</td>
              <td>{c.active ? <Chip status="selesai" /> : <span className="text-xs text-muted">Nonaktif</span>}</td>
              <td className="whitespace-nowrap text-right">
                {c.contactPhone && <><WaButton compact phone={c.contactPhone} text={`Halo ${c.contactName || 'Bapak/Ibu'}, kami dari Cimahi Hotel Institute terkait penempatan peserta didik di ${c.name}.`} />{' '}</>}
                <button className="btn-ghost !min-h-9" aria-label={`Ubah ${c.name}`} onClick={() => setForm({ ...c })}><IconPencil size={16} /></button>{' '}
                <button className="btn-ghost !min-h-9 text-red-700" aria-label={`Hapus ${c.name}`} onClick={async () => { if (await ask(`Hapus ${c.name}? Bila sudah pernah dipakai penempatan, perusahaan hanya dinonaktifkan.`)) await act(deleteCompany(c.id), 'Perusahaan diperbarui.') }}><IconTrash size={16} /></button>
              </td>
            </tr>
          ))}
        </Table>
      )}
      <Modal open={!!form} title={form?.id ? 'Ubah perusahaan' : 'Perusahaan baru'} onClose={() => setForm(null)}>
        {form && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); act(saveCompany({ ...form, id: form.id || undefined }), 'Perusahaan disimpan.', () => setForm(null)) }}>
            <Field label="Nama perusahaan"><input className="input" required maxLength={160} value={form.name} onChange={set('name')} /></Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Kategori"><input className="input" maxLength={60} value={form.category} onChange={set('category')} placeholder="Hotel, restoran, resort" /></Field>
              <Field label="Kota"><input className="input" maxLength={80} value={form.city} onChange={set('city')} /></Field>
              <Field label="Negara"><input className="input" maxLength={80} value={form.country} onChange={set('country')} /></Field>
            </div>
            <Field label="Alamat"><input className="input" maxLength={255} value={form.address} onChange={set('address')} /></Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Nama kontak"><input className="input" maxLength={120} value={form.contactName} onChange={set('contactName')} /></Field>
              <Field label="Telepon atau WhatsApp"><input className="input" type="tel" maxLength={30} value={form.contactPhone} onChange={set('contactPhone')} /></Field>
              <Field label="Email kontak"><input className="input" type="email" maxLength={160} value={form.contactEmail} onChange={set('contactEmail')} /></Field>
            </div>
            <Field label="Catatan"><textarea className="input !py-2" rows={2} maxLength={500} value={form.notes} onChange={set('notes')} /></Field>
            <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />Aktif (bisa dipilih untuk penempatan baru)</label>
            <button className="btn-primary w-full">Simpan</button>
          </form>
        )}
      </Modal>
    </>
  )
}

/* ---------- tinjauan logbook ---------- */
function TinjauLogbook() {
  const s = useStore((x) => x)
  const act = useAct()
  const [status, setStatus] = useState<'diajukan' | 'all' | 'disetujui' | 'revisi'>('diajukan')
  const [who, setWho] = useState('all')
  const [rev, setRev] = useState<{ id: string; note: string } | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const magang = s.placements.filter((p: Placement) => p.kind === 'magang')
  const who_ = (placementId: string) => {
    const p = s.placements.find((x) => x.id === placementId)
    const r = s.registrations.find((x) => x.id === p?.registrationId)
    return { u: s.users.find((x) => x.id === r?.userId), co: s.companies.find((c) => c.id === p?.companyId) }
  }
  const rows = s.logbook
    .filter((e) => magang.some((p) => p.id === e.placementId))
    .filter((e) => status === 'all' || e.status === status)
    .filter((e) => who === 'all' || e.placementId === who)
    .sort((a, b) => b.date.localeCompare(a.date))
  // Persetujuan massal: hanya catatan yang belum disetujui yang bisa dipilih.
  const approvable = rows.filter((e) => e.status !== 'disetujui')
  const chosen = picked.filter((id) => approvable.some((e) => e.id === id))
  const allChosen = approvable.length > 0 && chosen.length === approvable.length
  const toggle = (id: string) => setPicked((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]))
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select className="input !w-auto" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Filter status">
          <option value="diajukan">Menunggu ({s.logbook.filter((e) => e.status === 'diajukan').length})</option><option value="revisi">Perlu revisi</option><option value="disetujui">Disetujui</option><option value="all">Semua</option>
        </select>
        <select className="input !w-auto" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Filter peserta">
          <option value="all">Semua peserta magang</option>{magang.map((p) => <option key={p.id} value={p.id}>{who_(p.id).u?.name}</option>)}
        </select>
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold"><input type="checkbox" className="size-4 accent-brand-600" checked={allChosen} disabled={approvable.length === 0} onChange={() => setPicked(allChosen ? [] : approvable.map((e) => e.id))} />Pilih semua yang belum disetujui ({approvable.length})</label>
        <button className="btn-primary" disabled={chosen.length === 0} onClick={async () => { if (await ask(`Setujui ${chosen.length} logbook sekaligus?`)) act(approveLogbooks(chosen), `${chosen.length} logbook disetujui.`, () => setPicked([])) }}>Setujui terpilih ({chosen.length})</button>
      </div>
      {rows.length === 0 ? <div className="card"><Empty title="Tidak ada logbook" body="Logbook muncul di sini setelah peserta magang mengisinya." /></div> : (
        <Table head={['Pilih', 'Tanggal', 'Peserta didik', 'Perusahaan', 'Jam', 'Kegiatan', 'Status', '']}>
          {rows.map((e) => {
            const { u, co } = who_(e.placementId)
            return (
              <tr key={e.id}>
                <td>{e.status !== 'disetujui' ? <input type="checkbox" className="size-4 accent-brand-600" aria-label={`Pilih logbook ${u?.name} ${dateID(e.date)}`} checked={picked.includes(e.id)} onChange={() => toggle(e.id)} /> : <span className="text-muted">-</span>}</td>
                <td className="whitespace-nowrap">{dateID(e.date)}</td>
                <td className="font-semibold">{u?.name}</td>
                <td>{co?.name}</td>
                <td className="tabular-nums">{e.hours}</td>
                <td className="max-w-sm text-sm"><p className="whitespace-pre-wrap">{e.activity}</p>{e.learning && <p className="mt-1 text-xs text-muted">Pembelajaran: {e.learning}</p>}{e.reviewerNote && <p className="mt-1 text-xs text-amber-800">Catatan: {e.reviewerNote}</p>}</td>
                <td><Chip status={e.status} /></td>
                <td className="whitespace-nowrap text-right">
                  {e.status !== 'disetujui' && <button className="btn-primary !min-h-9" onClick={() => act(reviewLogbook(e.id, 'disetujui', ''), 'Logbook disetujui.')}>Setujui</button>}{' '}
                  {e.status === 'diajukan' && <button className="btn-ghost !min-h-9" onClick={() => setRev({ id: e.id, note: '' })}>Revisi</button>}
                </td>
              </tr>
            )
          })}
        </Table>
      )}
      <Modal open={!!rev} title="Minta revisi logbook" onClose={() => setRev(null)}>
        {rev && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); act(reviewLogbook(rev.id, 'revisi', rev.note), 'Permintaan revisi dikirim ke peserta.', () => setRev(null)) }}>
            <Field label="Catatan untuk peserta" hint="Jelaskan bagian yang perlu diperbaiki."><textarea className="input !py-2" rows={3} required maxLength={500} value={rev.note} onChange={(e) => setRev({ ...rev, note: e.target.value })} /></Field>
            <button className="btn-primary w-full">Kirim</button>
          </form>
        )}
      </Modal>
    </>
  )
}
