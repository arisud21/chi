import { IconArrowDownRight, IconArrowUpRight, IconScale } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Empty, PageHeader, Table, dateID, rupiah } from '../../components/ui'
import { jumlahKas, kasRows, kategoriLabel } from '../../lib/kas'
import { useStore } from '../../lib/store'

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const compact = (n: number) => (Math.abs(n) >= 1e9 ? `${(n / 1e9).toFixed(1)} M` : Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(1)} jt` : Math.abs(n) >= 1e3 ? `${Math.round(n / 1e3)} rb` : String(n))

/** Dashboard khusus kas: arus kas masuk dan keluar per bulan, sisa saldo, dan rincian per kategori. */
export function DashboardKas() {
  const s = useStore((x) => x)
  const all = useMemo(() => kasRows(s), [s.payments, s.registrations, s.users, s.cashTx])
  const years = [...new Set([new Date().getFullYear(), ...all.map((r) => +r.date.slice(0, 4))])].sort((a, b) => b - a)
  const [year, setYear] = useState(new Date().getFullYear())
  const inYear = all.filter((r) => r.date.startsWith(String(year)))
  const masuk = jumlahKas(inYear, 'masuk')
  const keluar = jumlahKas(inYear, 'keluar')
  // Saldo awal tahun = seluruh kas sebelum tahun ini, sehingga saldo akhir sama dengan saldo kas keseluruhan.
  const before = all.filter((r) => r.date < `${year}-01-01`)
  const saldoAwal = jumlahKas(before, 'masuk') - jumlahKas(before, 'keluar')
  const months = BULAN.map((label, i) => {
    const key = `${year}-${String(i + 1).padStart(2, '0')}`
    const rows = inYear.filter((r) => r.date.startsWith(key))
    return { label, masuk: jumlahKas(rows, 'masuk'), keluar: jumlahKas(rows, 'keluar') }
  })
  let run = saldoAwal
  const withSaldo = months.map((m) => { run += m.masuk - m.keluar; return { ...m, saldo: run } })
  const max = Math.max(1, ...months.flatMap((m) => [m.masuk, m.keluar]))
  const perKategori = (arah: 'masuk' | 'keluar') => {
    const map = new Map<string, number>()
    inYear.filter((r) => r.arah === arah).forEach((r) => map.set(r.category, (map.get(r.category) ?? 0) + r.amount))
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }
  const katMasuk = perKategori('masuk')
  const katKeluar = perKategori('keluar')
  const saldoNow = jumlahKas(all, 'masuk') - jumlahKas(all, 'keluar')

  return (
    <>
      <PageHeader title="Dashboard kas" sub="Arus kas masuk dan keluar serta sisa saldo. Kas masuk mencakup pembayaran peserta yang terverifikasi, modal, dan pemasukan lain."
        action={<div className="flex items-center gap-3"><select className="input !w-auto" aria-label="Tahun" value={year} onChange={(e) => setYear(+e.target.value)}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select><Link to="/admin/kas" className="btn-ghost">Kelola transaksi</Link></div>} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-5"><p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted"><IconArrowUpRight size={16} className="text-emerald-600" />Kas masuk {year}</p><p className="mt-1 text-2xl font-bold tabular-nums text-emerald-700">{rupiah(masuk)}</p></div>
        <div className="card p-5"><p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted"><IconArrowDownRight size={16} className="text-red-600" />Kas keluar {year}</p><p className="mt-1 text-2xl font-bold tabular-nums text-red-700">{rupiah(keluar)}</p></div>
        <div className="card p-5"><p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted"><IconScale size={16} />Selisih {year}</p><p className={`mt-1 text-2xl font-bold tabular-nums ${masuk - keluar < 0 ? 'text-red-700' : ''}`}>{rupiah(masuk - keluar)}</p></div>
        <div className="card p-5"><p className="text-xs font-semibold uppercase tracking-wide text-muted">Sisa saldo kas (hingga kini)</p><p className={`mt-1 text-2xl font-bold tabular-nums ${saldoNow < 0 ? 'text-red-700' : 'text-brand-700'}`}>{rupiah(saldoNow)}</p></div>
      </div>

      <section className="card mt-5 p-5" aria-labelledby="arus-h">
        <h2 id="arus-h" className="font-bold">Arus kas per bulan {year}</h2>
        <div className="mt-1 flex flex-wrap gap-4 text-xs text-muted"><span className="flex items-center gap-1.5"><i className="inline-block size-3 rounded-sm bg-emerald-500" />Kas masuk</span><span className="flex items-center gap-1.5"><i className="inline-block size-3 rounded-sm bg-red-500" />Kas keluar</span></div>
        {masuk + keluar === 0 ? <Empty title="Belum ada transaksi" body={`Tidak ada kas masuk atau keluar pada ${year}.`} /> : (
          <div className="mt-4 overflow-x-auto">
            <div className="flex h-56 min-w-[34rem] items-end gap-2" role="img" aria-label={`Grafik batang kas masuk dan keluar per bulan tahun ${year}. Total masuk ${rupiah(masuk)}, total keluar ${rupiah(keluar)}.`}>
              {months.map((m) => (
                <div key={m.label} className="flex h-full flex-1 flex-col justify-end">
                  <div className="flex flex-1 items-end justify-center gap-1">
                    <div className="flex h-full w-1/2 max-w-6 flex-col justify-end" title={`Masuk ${rupiah(m.masuk)}`}><span className="mb-0.5 text-center text-[10px] tabular-nums text-muted">{m.masuk ? compact(m.masuk) : ''}</span><div className="rounded-t bg-emerald-500" style={{ height: `${(m.masuk / max) * 85}%` }} /></div>
                    <div className="flex h-full w-1/2 max-w-6 flex-col justify-end" title={`Keluar ${rupiah(m.keluar)}`}><span className="mb-0.5 text-center text-[10px] tabular-nums text-muted">{m.keluar ? compact(m.keluar) : ''}</span><div className="rounded-t bg-red-500" style={{ height: `${(m.keluar / max) * 85}%` }} /></div>
                  </div>
                  <p className="mt-1 text-center text-xs font-semibold">{m.label}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {([['Kas masuk menurut kategori', katMasuk, masuk, 'bg-emerald-500'], ['Kas keluar menurut kategori', katKeluar, keluar, 'bg-red-500']] as const).map(([title, list, total, bar]) => (
          <section key={title} className="card p-5">
            <h2 className="font-bold">{title} ({year})</h2>
            {list.length === 0 ? <p className="mt-3 text-sm text-muted">Belum ada data.</p> : (
              <ul className="mt-3 space-y-3">
                {list.map(([k, v]) => (
                  <li key={k}>
                    <div className="flex items-baseline justify-between gap-3 text-sm"><span>{kategoriLabel(k)}</span><b className="tabular-nums">{rupiah(v)} <span className="font-normal text-muted">({total ? Math.round((v / total) * 100) : 0}%)</span></b></div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-canvas"><div className={`h-full rounded-full ${bar}`} style={{ width: `${total ? (v / total) * 100 : 0}%` }} /></div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      <section className="mt-5">
        <h2 className="mb-2 font-bold">Rekap bulanan dan saldo</h2>
        <Table head={['Bulan', 'Kas masuk', 'Kas keluar', 'Selisih', 'Saldo akhir bulan']}>
          {withSaldo.map((m) => (
            <tr key={m.label}>
              <td className="font-semibold">{m.label} {year}</td>
              <td className="tabular-nums text-emerald-700">{rupiah(m.masuk)}</td>
              <td className="tabular-nums text-red-700">{rupiah(m.keluar)}</td>
              <td className={`tabular-nums ${m.masuk - m.keluar < 0 ? 'text-red-700' : ''}`}>{rupiah(m.masuk - m.keluar)}</td>
              <td className="font-semibold tabular-nums">{rupiah(m.saldo)}</td>
            </tr>
          ))}
        </Table>
      </section>

      <section className="mt-5">
        <h2 className="mb-2 font-bold">Transaksi terbaru</h2>
        {all.length === 0 ? <div className="card"><Empty title="Belum ada transaksi" body="Transaksi muncul setelah ada pembayaran terverifikasi atau kas yang dicatat." /></div> : (
          <Table head={['Tanggal', 'Jenis', 'Kategori', 'Keterangan', 'Nominal']}>
            {all.slice(0, 8).map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap">{dateID(r.date)}</td>
                <td>{r.arah === 'masuk' ? 'Kas masuk' : 'Kas keluar'}</td>
                <td>{kategoriLabel(r.category)}</td>
                <td className="max-w-md text-sm">{r.description}</td>
                <td className={`font-semibold tabular-nums ${r.arah === 'masuk' ? 'text-emerald-700' : 'text-red-700'}`}>{r.arah === 'masuk' ? '+' : '-'}{rupiah(r.amount)}</td>
              </tr>
            ))}
          </Table>
        )}
      </section>
    </>
  )
}
