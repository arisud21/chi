import { IconFileSpreadsheet, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import { ask, Empty, Field, Modal, MoneyInput, PageHeader, Table, dateID, rupiah, useAct, useToast } from '../../components/ui'
import { KAS_KELUAR_KATEGORI, KAS_MASUK_KATEGORI, jumlahKas, kasRows, kategoriLabel, type KasArah, type KasRow } from '../../lib/kas'
import { deleteCashTx, saveCashTx, useStore } from '../../lib/store'
import { buildXlsx, downloadBlob } from '../../lib/xlsx'

const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10) }
type Form = { id?: string; direction: KasArah; category: string; date: string; amount: number; description: string }

/**
 * Manajemen kas. Kas masuk terdiri dari pembayaran peserta yang sudah terverifikasi (otomatis) serta modal dan pemasukan lain yang diinput manual.
 * Kas keluar untuk kebutuhan operasional hanya dapat diinput oleh bagian keuangan; Super Admin hanya melihat.
 */
export function ManajemenKas() {
  const s = useStore((x) => x)
  const me = s.users.find((u) => u.id === s.sessionUserId)
  const isKeuangan = me?.role === 'admin_keuangan'
  const act = useAct()
  const toast = useToast()
  const [tab, setTab] = useState<KasArah>('masuk')
  const [form, setForm] = useState<Form | null>(null)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('all')
  const all = useMemo(() => kasRows(s), [s.payments, s.registrations, s.users, s.cashTx])
  const canInput = (d: KasArah) => (d === 'keluar' ? isKeuangan : true)
  const rows = all
    .filter((r) => r.arah === tab)
    .filter((r) => (!from || r.date >= from) && (!to || r.date <= to))
    .filter((r) => cat === 'all' || r.category === cat)
    .filter((r) => !q.trim() || `${r.description} ${kategoriLabel(r.category)}`.toLowerCase().includes(q.trim().toLowerCase()))
  const total = rows.reduce((t, r) => t + r.amount, 0)
  const cats = tab === 'masuk' ? KAS_MASUK_KATEGORI : KAS_KELUAR_KATEGORI
  const open = (r?: KasRow) => setForm(r
    ? { id: r.manualId, direction: r.arah, category: r.category, date: r.date, amount: r.amount, description: r.description }
    : { direction: tab, category: tab === 'masuk' ? 'modal' : 'operasional', date: today(), amount: 0, description: '' })

  const exportXlsx = () => {
    const blob = buildXlsx([{
      name: tab === 'masuk' ? 'Kas Masuk' : 'Kas Keluar',
      rows: [...rows.map((r, i) => [i + 1, dateID(r.date), kategoriLabel(r.category), r.description, r.amount]), ['', '', '', 'TOTAL', total]],
      cols: [{ header: 'No', width: 6 }, { header: 'Tanggal', width: 16 }, { header: 'Kategori', width: 24 }, { header: 'Keterangan', width: 60 }, { header: tab === 'masuk' ? 'Kas masuk' : 'Kas keluar', money: true, width: 18 }],
    }])
    downloadBlob(blob, `kas-${tab}-${from || 'awal'}-sd-${to || today()}.xlsx`)
    toast(`Excel diunduh: ${rows.length} transaksi.`, 'ok')
  }

  return (
    <>
      <PageHeader title="Manajemen kas" sub="Catat dan pantau kas masuk dan kas keluar. Pembayaran peserta yang sudah diverifikasi otomatis masuk sebagai kas masuk. Kas keluar hanya dapat diinput bagian keuangan."
        action={canInput(tab) ? <button className="btn-primary" onClick={() => open()}><IconPlus size={18} />{tab === 'masuk' ? 'Catat kas masuk' : 'Catat kas keluar'}</button> : undefined} />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="card p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted">Total kas masuk</p><p className="mt-1 text-xl font-bold tabular-nums text-emerald-700">{rupiah(jumlahKas(all, 'masuk'))}</p></div>
        <div className="card p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted">Total kas keluar</p><p className="mt-1 text-xl font-bold tabular-nums text-red-700">{rupiah(jumlahKas(all, 'keluar'))}</p></div>
        <div className="card p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted">Saldo kas</p><p className="mt-1 text-xl font-bold tabular-nums">{rupiah(jumlahKas(all, 'masuk') - jumlahKas(all, 'keluar'))}</p></div>
      </div>
      <div role="tablist" aria-label="Jenis kas" className="mb-4 flex gap-1 border-b border-line">
        {([['masuk', 'Kas masuk'], ['keluar', 'Kas keluar']] as const).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setCat('all') }}
            className={`-mb-px min-h-11 shrink-0 border-b-2 px-4 text-sm font-semibold ${tab === k ? 'border-brand-600 text-brand-700' : 'border-transparent text-muted hover:text-ink'}`}>{label}</button>
        ))}
      </div>
      {tab === 'keluar' && !isKeuangan && <p className="mb-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">Kas keluar hanya dapat diinput oleh bagian keuangan. Anda dapat melihatnya di sini.</p>}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="block"><span className="label">Dari tanggal</span><input className="input" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="block"><span className="label">Sampai tanggal</span><input className="input" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></label>
        <label className="block"><span className="label">Kategori</span>
          <select className="input" value={cat} onChange={(e) => setCat(e.target.value)}><option value="all">Semua kategori</option>{Object.entries(cats).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </label>
        <input className="input max-w-xs" placeholder="Cari keterangan" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari transaksi" />
        <button className="btn-ghost" disabled={rows.length === 0} onClick={exportXlsx}><IconFileSpreadsheet size={18} />Ekspor Excel</button>
      </div>
      {rows.length === 0 ? <div className="card"><Empty title="Belum ada transaksi" body={tab === 'masuk' ? 'Kas masuk muncul dari pembayaran peserta yang terverifikasi, atau dari modal dan pemasukan lain yang Anda catat.' : 'Catat pengeluaran operasional dengan tombol Catat kas keluar.'} /></div> : (
        <Table head={['Tanggal', 'Kategori', 'Keterangan', 'Nominal', '']} foot={<tr className="bg-canvas font-bold"><td colSpan={3} className="px-4 py-3">Total {rows.length} transaksi</td><td className="px-4 py-3 tabular-nums">{rupiah(total)}</td><td /></tr>}>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="whitespace-nowrap">{dateID(r.date)}</td>
              <td><span className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${r.auto ? 'bg-sky-50 text-sky-800' : 'bg-canvas text-ink'}`}>{kategoriLabel(r.category)}</span></td>
              <td className="max-w-md text-sm">{r.description}{r.auto && <span className="block text-xs text-muted">Otomatis dari pembayaran terverifikasi</span>}</td>
              <td className={`font-semibold tabular-nums ${r.arah === 'masuk' ? 'text-emerald-700' : 'text-red-700'}`}>{r.arah === 'masuk' ? '+' : '-'}{rupiah(r.amount)}</td>
              <td className="whitespace-nowrap text-right">
                {!r.auto && canInput(r.arah) && <>
                  <button className="btn-ghost !min-h-9" aria-label="Ubah transaksi" onClick={() => open(r)}><IconPencil size={16} /></button>{' '}
                  <button className="btn-ghost !min-h-9 text-red-700" aria-label="Hapus transaksi" onClick={async () => await ask('Hapus transaksi kas ini?') && act(deleteCashTx(r.manualId!), 'Transaksi dihapus.')}><IconTrash size={16} /></button>
                </>}
              </td>
            </tr>
          ))}
        </Table>
      )}
      <Modal open={!!form} title={`${form?.id ? 'Ubah' : 'Catat'} ${form?.direction === 'keluar' ? 'kas keluar' : 'kas masuk'}`} onClose={() => setForm(null)}>
        {form && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); act(saveCashTx(form), 'Transaksi kas disimpan.', () => setForm(null)) }}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Tanggal"><input className="input" type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
              <Field label="Kategori">
                <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {Object.entries(form.direction === 'masuk' ? { modal: KAS_MASUK_KATEGORI.modal, pemasukan_lain: KAS_MASUK_KATEGORI.pemasukan_lain } : KAS_KELUAR_KATEGORI).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Nominal (Rp)"><MoneyInput required value={form.amount} onValue={(n) => setForm({ ...form, amount: n })} /></Field>
            <Field label="Keterangan" hint={form.direction === 'masuk' ? 'Contoh: Setoran modal awal, sewa ruang kelas.' : 'Contoh: Listrik bulan Januari, pembelian ATK.'}><input className="input" required maxLength={255} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
            <button className="btn-primary w-full" disabled={form.amount < 1}>Simpan</button>
          </form>
        )}
      </Modal>
    </>
  )
}
