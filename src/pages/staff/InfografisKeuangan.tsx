import { IconArrowRight, IconChartBar, IconTable } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CountUp, Empty, Table } from '../../components/ui'
import { useStore } from '../../lib/store'
import type { Registration } from '../../lib/types'

type Scope = 'tahun' | 'angkatan' | 'semua'
type Stat = { total: number; paid: number; waiting: number; lulusBelum: number; reenrolled: number }
type Row = { key: string; label: string; meta: string; paid: number; reenrolled: number }

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0)

/**
 * Infografis dashboard Admin Keuangan: berapa pendaftar yang sudah membayar pendaftaran dan yang sudah registrasi ulang,
 * pada tahun berjalan, angkatan yang sedang dibuka, atau semuanya. Tahap isi data diri, ujian online, menunggu hasil,
 * dan tidak lulus sengaja tidak ditampilkan karena tidak berkaitan dengan pembayaran.
 */
export function InfografisKeuangan() {
  const s = useStore((x) => x)
  const [scope, setScope] = useState<Scope>('tahun')
  const [programId, setProgramId] = useState('')
  const [table, setTable] = useState(false)
  const [tip, setTip] = useState<string | null>(null)
  const year = new Date().getFullYear()

  const d = useMemo(() => {
    const feePaid = new Set(s.payments.filter((p) => p.kind === 'pendaftaran' && p.status === 'verified').map((p) => p.registrationId))
    const feeWait = new Set(s.payments.filter((p) => p.kind === 'pendaftaran' && p.status === 'submitted').map((p) => p.registrationId))
    const openBatches = s.batches.filter((b) => b.status === 'open' && (!programId || b.programId === programId))
    const openIds = new Set(openBatches.map((b) => b.id))
    // Hanya pendaftar yang mendaftar sendiri; peserta didik yang ditambahkan atau diimpor admin tidak melewati pembayaran pendaftaran.
    const inScope = (r: Registration) => r.source !== 'admin' && (!programId || r.programId === programId)
      && (scope === 'semua' || (scope === 'tahun' ? new Date(r.createdAt).getFullYear() === year : !!r.batchId && openIds.has(r.batchId)))
    const regs = s.registrations.filter(inScope)
    const stat = (list: Registration[]): Stat => ({
      total: list.length,
      paid: list.filter((r) => feePaid.has(r.id)).length,
      waiting: list.filter((r) => feeWait.has(r.id) && !feePaid.has(r.id)).length,
      lulusBelum: list.filter((r) => r.stage === 'registrasi_ulang' && r.status === 'pending_payment').length,
      reenrolled: list.filter((r) => r.stage === 'aktif' && (r.status === 'active' || r.status === 'completed')).length,
    })
    const rows: Row[] = scope === 'angkatan'
      ? openBatches.map((b) => { const t = stat(regs.filter((r) => r.batchId === b.id)); return { key: b.id, label: b.code, meta: s.programs.find((p) => p.id === b.programId)?.title ?? '', paid: t.paid, reenrolled: t.reenrolled } })
      : s.programs.filter((p) => !p.archived && (!programId || p.id === programId)).map((p) => { const t = stat(regs.filter((r) => r.programId === p.id)); return { key: p.id, label: p.title, meta: '', paid: t.paid, reenrolled: t.reenrolled } })
    return { all: stat(regs), rows, openCount: openBatches.length }
  }, [s.payments, s.registrations, s.batches, s.programs, scope, programId, year])

  const { all, rows } = d
  const max = Math.max(1, ...rows.flatMap((r) => [r.paid, r.reenrolled]))
  const lulus = all.lulusBelum + all.reenrolled
  const scopeNote = scope === 'tahun' ? `Pendaftar yang mendaftar pada tahun ${year}.` : scope === 'angkatan'
    ? `Pendaftar yang sudah ditempatkan di ${d.openCount} angkatan yang sedang dibuka. Pendaftar yang belum ditempatkan di angkatan belum ikut dihitung.` : 'Seluruh pendaftar, semua tahun.'
  const chip = (k: Scope, label: string) => (
    <button key={k} type="button" aria-pressed={scope === k} onClick={() => setScope(k)}
      className={`min-h-9 rounded-full border px-3 text-sm transition ${scope === k ? 'border-brand-600 bg-brand-600 font-semibold text-white' : 'border-line bg-white hover:bg-brand-50'}`}>{label}</button>
  )
  const tile = (label: string, n: number, note: string, strong = false) => (
    <div className={`rounded-xl border p-4 ${strong ? 'border-brand-200 bg-brand-50' : 'border-line bg-white'}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-4xl font-bold text-brand-700"><CountUp to={n} /></p>
      <p className="mt-1 text-xs text-muted">{note}</p>
    </div>
  )

  return (
    <section className="card p-5 lg:col-span-2" aria-labelledby="info-keu">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="info-keu" className="font-bold">Pendaftaran dan registrasi ulang</h2>
          <p className="text-sm text-muted">{scopeNote}</p>
        </div>
        <button type="button" className="btn-ghost !min-h-9 shrink-0" onClick={() => setTable(!table)} aria-pressed={table}>
          {table ? <><IconChartBar size={16} />Lihat grafik</> : <><IconTable size={16} />Lihat tabel</>}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Filter infografis">
        {chip('tahun', `Tahun berjalan (${year})`)}
        {chip('angkatan', 'Angkatan dibuka')}
        {chip('semua', 'Semua')}
        <select className="input !min-h-9 !w-auto !py-1 text-sm" value={programId} onChange={(e) => setProgramId(e.target.value)} aria-label="Filter program">
          <option value="">Semua program</option>
          {s.programs.filter((p) => !p.archived).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {tile('Sudah bayar pendaftaran', all.paid, `${pct(all.paid, all.total)}% dari ${all.total} pendaftar`)}
        {tile('Lulus, belum registrasi ulang', all.lulusBelum, 'Menunggu pembayaran registrasi ulang')}
        {tile('Sudah registrasi ulang', all.reenrolled, lulus > 0 ? `${pct(all.reenrolled, lulus)}% dari ${lulus} yang lulus` : 'Belum ada yang lulus', true)}
      </div>
      {all.waiting > 0 && (
        <Link to="/admin/pendaftar" className="mt-3 flex min-h-11 items-center justify-between gap-3 rounded-xl bg-amber-50 px-4 text-sm text-amber-900 transition hover:bg-amber-100">
          <span><b>{all.waiting}</b> bukti pembayaran pendaftaran menunggu verifikasi</span><IconArrowRight size={16} className="shrink-0" />
        </Link>
      )}

      <h3 className="mb-1 mt-6 text-sm font-bold">{scope === 'angkatan' ? 'Per angkatan yang dibuka' : 'Per program'}</h3>
      {rows.length === 0 || rows.every((r) => r.paid === 0 && r.reenrolled === 0) ? (
        <Empty title="Belum ada data" body="Belum ada pendaftar yang membayar pendaftaran atau registrasi ulang pada cakupan ini." />
      ) : table ? (
        <Table bare head={[scope === 'angkatan' ? 'Angkatan' : 'Program', 'Sudah bayar pendaftaran', 'Sudah registrasi ulang']}>
          {rows.map((r) => <tr key={r.key}><td className="font-semibold">{r.label}{r.meta && <span className="block text-xs font-normal text-muted">{r.meta}</span>}</td><td className="tabular-nums">{r.paid}</td><td className="tabular-nums">{r.reenrolled}</td></tr>)}
        </Table>
      ) : (
        <>
          <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink" aria-label="Keterangan warna">
            <li className="flex items-center gap-1.5"><span aria-hidden className="inline-block h-2.5 w-4 rounded-sm bg-brand-500" />Sudah bayar pendaftaran</li>
            <li className="flex items-center gap-1.5"><span aria-hidden className="inline-block h-2.5 w-4 rounded-sm bg-brand-700" />Sudah registrasi ulang</li>
          </ul>
          <ul className="space-y-4">
            {rows.map((r, i) => (
              <li key={r.key} className="relative" tabIndex={0}
                onMouseEnter={() => setTip(r.key)} onMouseLeave={() => setTip(null)} onFocus={() => setTip(r.key)} onBlur={() => setTip(null)}
                aria-label={`${r.label}: ${r.paid} sudah bayar pendaftaran, ${r.reenrolled} sudah registrasi ulang`}>
                <p className="mb-1 text-sm font-semibold">{r.label}{r.meta && <span className="ml-2 text-xs font-normal text-muted">{r.meta}</span>}</p>
                {([['paid', r.paid, 'bg-brand-500'], ['reenrolled', r.reenrolled, 'bg-brand-700']] as const).map(([k, n, cls]) => (
                  <div key={k} className="flex items-center gap-2 py-0.5">
                    <div className={`h-2.5 origin-left animate-bar rounded-r ${cls}`} style={{ width: `${Math.max(n > 0 ? 1.5 : 0, (n / max) * 88)}%`, animationDelay: `${i * 80}ms` }} aria-hidden />
                    <span className="text-xs font-semibold tabular-nums">{n}</span>
                  </div>
                ))}
                {tip === r.key && (
                  <div role="tooltip" className="pointer-events-none absolute right-0 top-0 z-10 w-56 rounded-lg border border-line bg-white p-3 text-xs shadow-lg">
                    <p className="font-semibold">{r.label}</p>
                    <p className="mt-1.5 flex items-center gap-2"><span aria-hidden className="inline-block h-0.5 w-3 bg-brand-500" /><b className="text-sm tabular-nums">{r.paid}</b><span className="text-muted">sudah bayar pendaftaran</span></p>
                    <p className="mt-1 flex items-center gap-2"><span aria-hidden className="inline-block h-0.5 w-3 bg-brand-700" /><b className="text-sm tabular-nums">{r.reenrolled}</b><span className="text-muted">sudah registrasi ulang</span></p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
